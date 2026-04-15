const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { summarizeVerifications } = require('./runtime_collector');
const { buildDesignDebtDoc } = require('./design_debt');
const { readJson, relativePath, writePlaneArtifacts } = require('./control_planes_common');

function readPatchEvents(cwd) {
  const filePath = path.join(cwd, '.workflow', 'orchestration', 'runtime', 'patch-events.jsonl');
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function percent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function delta(current, previous) {
  return Number((Number(current || 0) - Number(previous || 0)).toFixed(1));
}

function measurementHistoryPath(cwd) {
  return path.join(cwd, '.workflow', 'reports', 'measurement-history.json');
}

function readHistory(cwd) {
  return readJson(measurementHistoryPath(cwd), { runs: [] });
}

function writeHistory(cwd, history) {
  const filePath = measurementHistoryPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`);
  return filePath;
}

function renderMeasureMarkdown(payload) {
  return `# MEASUREMENT

- Findings found: \`${payload.metrics.findings.total}\`
- Findings closed: \`${payload.metrics.findings.closed}\`
- Automated corrections: \`${payload.metrics.corrections.automated}\`
- Verify pass rate: \`${payload.metrics.verification.passRate}\`%
- Merge-ready ratio: \`${payload.metrics.mergeReadiness.ratio}\`%
- Closure estimate: \`${payload.metrics.closure.sessionToClosureEstimate}\` cycles

## Trend

- Open findings delta: \`${payload.trend.openFindingsDelta >= 0 ? '+' : ''}${payload.trend.openFindingsDelta}\`
- Verify rate delta: \`${payload.trend.verifyPassRateDelta >= 0 ? '+' : ''}${payload.trend.verifyPassRateDelta}\` pts
- Design debt delta: \`${payload.trend.designDebtDelta >= 0 ? '+' : ''}${payload.trend.designDebtDelta}\`
- Hotspot delta: \`${payload.trend.hotspotDelta >= 0 ? '+' : ''}${payload.trend.hotspotDelta}\`
- Export coverage delta: \`${payload.trend.exportCoverageDelta >= 0 ? '+' : ''}${payload.trend.exportCoverageDelta}\` pts

## ROI Surface

- Ready to patch: \`${payload.metrics.corrections.readyToPatch}\`
- Needs human decision: \`${payload.metrics.corrections.needsHumanDecision}\`
- Large repo coverage: \`${payload.metrics.largeRepo.coverageDepth}\`
- Frontend polish debt: \`${payload.metrics.frontendPolishDebt.current}\`
- Exports produced: \`${payload.metrics.exports.produced}\`
- Export coverage: \`${payload.metrics.exports.coverageRatio}\`%
- Control-plane packet: \`${payload.metrics.controlPlane.packetPresent ? 'yes' : 'no'}\`
- Explainability tier: \`${payload.metrics.controlPlane.explainabilityTier || 'n/a'}\`
- Handoff open loops: \`${payload.metrics.handoffContinuity.openLoops}\`
- Team mailbox entries: \`${payload.metrics.teamOps.mailboxEntries}\`
`;
}

function buildMeasurePayload(cwd, rootDir, options = {}) {
  const correctionControl = readJson(path.join(cwd, '.workflow', 'reports', 'correction-control.json'), null);
  const findingsRegistry = readJson(path.join(cwd, '.workflow', 'reports', 'findings-registry.json'), { summary: {}, items: [] });
  const releaseControl = readJson(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null)
    || readJson(path.join(cwd, '.workflow', 'reports', 'release-control.json'), null);
  const handoff = readJson(path.join(cwd, '.workflow', 'reports', 'handoff-os.json'), null);
  const teamControl = readJson(path.join(cwd, '.workflow', 'reports', 'team-control-room.json'), null);
  const exportManifest = readJson(path.join(cwd, '.workflow', 'exports', 'export-manifest.json'), null);
  const controlPlanePacket = readJson(path.join(cwd, '.workflow', 'exports', 'control-plane-packet.json'), null);
  const explainability = readJson(path.join(cwd, '.workflow', 'reports', 'explainability.json'), null);
  const repoAuditHistory = readJson(path.join(cwd, '.workflow', 'reports', 'repo-audit-history.json'), { replay: {} });
  const verifications = summarizeVerifications(cwd);
  const patchEvents = readPatchEvents(cwd);
  const designDebt = buildDesignDebtDoc(cwd, rootDir);

  const registrySummary = correctionControl?.findingsRegistry?.summary || findingsRegistry.summary || {};
  const byStatus = registrySummary.byStatus || {};
  const totalFindings = Number(registrySummary.total || findingsRegistry.items?.length || 0);
  const closedFindings = Number(byStatus.closed || 0);
  const verifiedFindings = Number(byStatus.verified || 0) + Number(byStatus.rereviewed || 0);
  const openFindings = Number(registrySummary.open || Math.max(0, totalFindings - closedFindings));
  const patchApplyEvents = patchEvents.filter((event) => event.action === 'apply' && event.success).length;
  const rollbackEvents = patchEvents.filter((event) => event.action === 'rollback' && event.success).length;
  const shellPasses = Number(verifications.shell.verdictCounts.pass || 0);
  const shellFails = Number(verifications.shell.verdictCounts.fail || 0);
  const browserPasses = Number(verifications.browser.verdictCounts.pass || 0);
  const browserFails = Number(verifications.browser.verdictCounts.fail || 0);
  const totalVerifications = shellPasses + shellFails + browserPasses + browserFails;
  const passedVerifications = shellPasses + browserPasses;
  const mergeReadyNumerator = closedFindings + verifiedFindings;
  const mergeReadyRatio = percent(mergeReadyNumerator, totalFindings || mergeReadyNumerator || 1);
  const sessionToClosureEstimate = Number((openFindings / Math.max(1, closedFindings || patchApplyEvents || 1)).toFixed(1));
  const exportCoverage = Number(exportManifest?.publishPlan?.exportCoverage?.coverageRatio || 0);
  const exportsProduced = Object.keys(exportManifest?.exports || {}).length;
  const handoffOpenLoops = (handoff?.openDecisions?.length || 0) + (handoff?.unresolvedRisks?.length || 0);
  const teamMailboxEntries = Number(teamControl?.activity?.mailboxEntries || teamControl?.runtime?.mailboxEntries || 0);
  const teamTimelineEntries = Number(teamControl?.activity?.timelineEntries || 0);
  const teamHandoffQueue = Number(teamControl?.handoffQueue?.length || 0);

  const currentSnapshot = {
    generatedAt: new Date().toISOString(),
    findings: {
      total: totalFindings,
      open: openFindings,
      closed: closedFindings,
    },
    verifyPassRate: percent(passedVerifications, totalVerifications || 1),
    designDebt: designDebt.debt.length,
    hotspots: correctionControl?.reviewControlRoom?.topHotspots?.length || 0,
    exportCoverage,
    handoffQueue: teamHandoffQueue,
  };
  const history = readHistory(cwd);
  const previous = history.runs[history.runs.length - 1] || null;
  history.runs.push(currentSnapshot);
  history.runs = history.runs.slice(-50);
  const historyPath = writeHistory(cwd, history);

  const payload = {
    generatedAt: currentSnapshot.generatedAt,
    action: 'measure',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    metrics: {
      findings: {
        total: totalFindings,
        open: openFindings,
        closed: closedFindings,
        introduced: Number(repoAuditHistory.replay?.introduced?.length || 0),
        resolved: Number(repoAuditHistory.replay?.resolved?.length || 0),
        persistent: Number(repoAuditHistory.replay?.persistent?.length || 0),
      },
      corrections: {
        automated: patchApplyEvents,
        rollbacks: rollbackEvents,
        readyToPatch: correctionControl?.correctionBoard?.readyToPatchCount || 0,
        needsHumanDecision: correctionControl?.correctionBoard?.needsHumanDecisionCount || 0,
        riskyRefactors: correctionControl?.correctionBoard?.riskyRefactorCount || 0,
      },
      verification: {
        total: totalVerifications,
        passed: passedVerifications,
        failed: shellFails + browserFails,
        passRate: percent(passedVerifications, totalVerifications || 1),
        shell: { passes: shellPasses, fails: shellFails },
        browser: { passes: browserPasses, fails: browserFails },
      },
      mergeReadiness: {
        numerator: mergeReadyNumerator,
        denominator: totalFindings || mergeReadyNumerator || 1,
        ratio: mergeReadyRatio,
        currentGate: releaseControl?.shipReadinessBoard?.shipBlockerCount > 0 ? 'blocked' : 'clear-or-unknown',
      },
      closure: {
        closedPerPatchApply: Number((closedFindings / Math.max(1, patchApplyEvents || 1)).toFixed(1)),
        sessionToClosureEstimate,
      },
      largeRepo: {
        coverageDepth: correctionControl?.largeRepoBoard?.coverageDepth || 'idle',
        rankedPackages: correctionControl?.largeRepoBoard?.rankedPackages?.length || 0,
        verifyQueueCount: correctionControl?.largeRepoBoard?.correctionWaveProgress?.verifyQueueCount || 0,
      },
      frontendPolishDebt: {
        current: designDebt.debt.length,
        file: designDebt.file,
      },
      exports: {
        produced: exportsProduced,
        expected: Number(exportManifest?.publishPlan?.exportCoverage?.expected || 0),
        coverageRatio: exportCoverage,
        githubReady: Boolean(exportManifest?.publishPlan?.github?.ready),
        ciReady: Boolean(exportManifest?.publishPlan?.ci?.ready),
        issueTrackerOpenItems: Number(exportManifest?.issueTracker?.openItemCount || 0),
      },
      handoffContinuity: {
        openDecisions: Number(handoff?.openDecisions?.length || 0),
        unresolvedRisks: Number(handoff?.unresolvedRisks?.length || 0),
        openLoops: handoffOpenLoops,
        nextActionRecorded: Boolean(handoff?.nextAction?.command || handoff?.nextAction?.title),
        bundlePresent: Boolean(handoff?.exports?.continuityBundle),
      },
      teamOps: {
        mailboxEntries: teamMailboxEntries,
        timelineEntries: teamTimelineEntries,
        blockedRoles: Number(teamControl?.waitingRoles?.length || 0),
        handoffQueue: teamHandoffQueue,
        conflictBlockers: Number(teamControl?.conflicts?.blockerCount || 0),
      },
      controlPlane: {
        packetPresent: Boolean(controlPlanePacket),
        continuityBundleLinked: Boolean(handoff?.exports?.continuityBundle),
        explainabilityTier: explainability?.confidenceBreakdown?.tier || releaseControl?.explainability?.tier || null,
        explainabilityConfidence: explainability?.confidenceBreakdown?.overall ?? releaseControl?.explainability?.overall ?? null,
        trustShipDecision: controlPlanePacket?.trust?.decisions?.ship || releaseControl?.trustCenter?.decisions?.ship || null,
      },
    },
    trend: {
      openFindingsDelta: previous ? delta(openFindings, previous.findings?.open) : 0,
      verifyPassRateDelta: previous ? delta(percent(passedVerifications, totalVerifications || 1), previous.verifyPassRate) : 0,
      designDebtDelta: previous ? delta(designDebt.debt.length, previous.designDebt) : 0,
      hotspotDelta: previous ? delta(correctionControl?.reviewControlRoom?.topHotspots?.length || 0, previous.hotspots) : 0,
      exportCoverageDelta: previous ? delta(exportCoverage, previous.exportCoverage) : 0,
      handoffQueueDelta: previous ? delta(teamHandoffQueue, previous.handoffQueue) : 0,
    },
    artifacts: {
      measurementHistory: relativePath(cwd, historyPath),
      designDebt: designDebt.file,
      correctionControl: correctionControl?.artifacts?.correctionControl || 'none',
      releaseControl: releaseControl?.artifacts?.json || 'none',
      exportManifest: exportManifest ? '.workflow/exports/export-manifest.json' : 'none',
      controlPlanePacket: controlPlanePacket ? '.workflow/exports/control-plane-packet.json' : 'none',
      explainability: explainability?.artifacts?.json || 'none',
      handoff: handoff?.artifacts?.json || 'none',
      teamControl: teamControl?.artifacts?.json || 'none',
    },
  };

  payload.artifacts.controlPlane = writePlaneArtifacts(cwd, 'measurement', payload, renderMeasureMarkdown(payload), {
    runtimeMirror: true,
    attachPath: 'artifacts.controlPlane',
  });
  return payload;
}

function printHelp() {
  console.log(`
measure

Usage:
  node scripts/workflow/measure.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --json              Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildMeasurePayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# MEASUREMENT\n');
  console.log(`- Findings: \`${payload.metrics.findings.total}\` total / \`${payload.metrics.findings.closed}\` closed`);
  console.log(`- Verify pass rate: \`${payload.metrics.verification.passRate}\`%`);
  console.log(`- Automated corrections: \`${payload.metrics.corrections.automated}\``);
  console.log(`- Merge-ready ratio: \`${payload.metrics.mergeReadiness.ratio}\`%`);
  console.log(`- Export coverage: \`${payload.metrics.exports.coverageRatio}\`%`);
  console.log(`- Output: \`${payload.artifacts.controlPlane.markdown}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMeasurePayload,
};
