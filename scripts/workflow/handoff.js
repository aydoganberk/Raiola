const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const { writeTextIfChanged: writeIfChanged } = require('./io/files');
const { baseLifecycleContext, renderPrBrief, renderSessionReport, reportsDir } = require('./lifecycle_common');
const { buildShipReadinessPayload, buildVerifyWorkPayload, readAssumptions } = require('./trust_os');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { readTableDocument } = require('./roadmap_os');
const { compactList, readJson, relativePath, writePlaneArtifacts } = require('./control_planes_common');

function readOpenQuestions(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: ['Id', 'Question', 'Status', 'Opened At', 'Resolution'],
  });
  return table.rows
    .map((row) => ({
      id: row[0],
      question: row[1],
      status: row[2],
      openedAt: row[3],
      resolution: row[4],
    }))
    .filter((row) => row.question && !/^resolved$/i.test(String(row.status || '').trim()));
}

function writeReportFile(cwd, fileName, content) {
  const filePath = path.join(reportsDir(cwd), fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeIfChanged(filePath, `${String(content || '').trimEnd()}\n`);
  return filePath;
}

function writeJsonReport(cwd, fileName, payload) {
  return writeReportFile(cwd, fileName, JSON.stringify(payload, null, 2));
}

function renderCompactHandoff(payload) {
  return `# HANDOFF COMPACT

- Milestone: \`${payload.milestone}\`
- Step: \`${payload.step}\`
- Next action: \`${payload.nextAction.command || payload.nextAction.title}\`
- Ship gate: \`${payload.shipReadiness.verdict}\`
- Verify gate: \`${payload.verifyWork.verdict}\`

## Open Decisions

${payload.openDecisions.length > 0
    ? payload.openDecisions.map((item) => `- ${item.kind === 'question' ? `Question: ${item.title}` : `Assumption: ${item.title}`}`).join('\n')
    : '- `No open decisions were captured.`'}

## Risks

${payload.unresolvedRisks.length > 0
    ? payload.unresolvedRisks.map((item) => `- ${item}`).join('\n')
    : '- `No unresolved risks are listed.`'}
`;
}

function renderHandoffMarkdown(payload) {
  const trust = payload.decisionBasis?.trust || {};
  const changeControl = payload.decisionBasis?.changeControl || {};
  const explainability = payload.decisionBasis?.explainability || {};
  const controlPlanes = payload.controlPlanes || {};
  const external = payload.external || {};
  return `# HANDOFF OS

- Verdict: \`${payload.verdict}\`
- Handoff standard: \`${payload.repoConfig.handoffStandard}\`
- Next action: \`${payload.nextAction.command || payload.nextAction.title}\`
- Resume anchor: \`${payload.resumeAnchor}\`
- Continuity bundle: \`${payload.exports.continuityBundle || 'n/a'}\`

## Compact Handoff

- Summary: ${payload.compact.summary}
- Scope: \`${payload.compact.scope.join(', ') || 'none'}\`
- Verification: \`${payload.compact.verification.join(', ') || 'none'}\`

## Open Decisions

${payload.openDecisions.length > 0
    ? payload.openDecisions.map((item) => `- [${item.kind}] ${item.title}`).join('\n')
    : '- `No open decisions are waiting.`'}

## Unresolved Risks

${payload.unresolvedRisks.length > 0
    ? payload.unresolvedRisks.map((item) => `- ${item}`).join('\n')
    : '- `No unresolved risks are recorded.`'}

## Verification Summary

- Verify-work: \`${payload.verifyWork.verdict}\`
- Ship-readiness: \`${payload.shipReadiness.verdict}\`
- Shell verify: \`${payload.verification.shellVerdict}\`
- Browser verify: \`${payload.verification.browserVerdict}\`
- Tests run: \`${payload.verification.testsRun.join(', ') || 'none'}\`

## Decision Basis

- Trust: verdict=\`${trust.verdict || 'n/a'}\`, risk=\`${trust.riskLevel || 'n/a'}\`, start/merge/ship=\`${trust.decisions?.start || 'n/a'} / ${trust.decisions?.merge || 'n/a'} / ${trust.decisions?.ship || 'n/a'}\`
- Change Control: verdict=\`${changeControl.verdict || 'n/a'}\`, merge=\`${changeControl.allowMerge ? 'yes' : 'no'}\`, ship=\`${changeControl.allowShip ? 'yes' : 'no'}\`, verifyQueue=\`${changeControl.verifyQueue ?? 'n/a'}\`, shipBlockers=\`${changeControl.shipBlockers ?? 'n/a'}\`
- Explainability: tier=\`${explainability.tier || 'n/a'}\`, overall=\`${explainability.overall ?? 'n/a'}\`, lane=\`${explainability.lane || 'n/a'}\`, bundle=\`${explainability.bundle || 'n/a'}\`

## Linked Control Planes

- Measurement: openFindings=\`${controlPlanes.measurement?.openFindings ?? 'n/a'}\`, verifyPass=\`${controlPlanes.measurement?.verifyPassRate ?? 'n/a'}\`, exports=\`${controlPlanes.measurement?.exportCoverage ?? 'n/a'}\`
- Team Control: verdict=\`${controlPlanes.teamControl?.verdict || 'n/a'}\`, handoffQueue=\`${controlPlanes.teamControl?.handoffQueue ?? 'n/a'}\`, blockers=\`${controlPlanes.teamControl?.blockerCount ?? 'n/a'}\`
- Autopilot: verdict=\`${controlPlanes.autopilot?.verdict || 'n/a'}\`, routines=\`${controlPlanes.autopilot?.routineCount ?? 'n/a'}\`, recovery=\`${controlPlanes.autopilot?.recoverySignals ?? 'n/a'}\`
- Lifecycle: verdict=\`${controlPlanes.lifecycle?.verdict || 'n/a'}\`, configDrift=\`${controlPlanes.lifecycle?.configDrift ?? 'n/a'}\`, exportDrift=\`${controlPlanes.lifecycle?.exportDrift ?? 'n/a'}\`
- Operating Center: verdict=\`${controlPlanes.operatingCenter?.verdict || 'n/a'}\`, active=\`${controlPlanes.operatingCenter?.activePlane || 'n/a'}\`, primary=\`${controlPlanes.operatingCenter?.primaryCommand || 'n/a'}\`

## External Resume Surface

- Repo status: \`${external.repoStatus || 'n/a'}\`
- Export manifest: \`${external.exportManifest || 'n/a'}\`
- Control-plane packet: \`${external.controlPlanePacket || 'n/a'}\`
- Publish coverage: \`${external.publishCoverage ?? 'n/a'}\`%
- GitHub ready: \`${external.githubReady ? 'yes' : 'no'}\`
- CI ready: \`${external.ciReady ? 'yes' : 'no'}\`

## Resume Here

- Command: \`${payload.nextAction.command || 'rai next'}\`
- Title: ${payload.nextAction.title}
- Reason: ${payload.nextAction.reason}
`;
}

function buildHandoffPayload(cwd, rootDir, options = {}) {
  const context = baseLifecycleContext(cwd, rootDir);
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const verifyWork = buildVerifyWorkPayload(cwd, rootDir, options);
  const shipReadiness = buildShipReadinessPayload(cwd, rootDir, options);
  const questions = readOpenQuestions(cwd);
  const assumptions = readAssumptions(cwd)
    .filter((item) => !/closed|validated/i.test(String(item.status || '')));
  const openDecisions = [
    ...questions.map((item) => ({ kind: 'question', title: item.question, status: item.status || 'open' })),
    ...assumptions.map((item) => ({ kind: 'assumption', title: item.assumption, status: item.status || 'open' })),
  ].slice(0, 12);
  const unresolvedRisks = compactList([
    ...(verifyWork.residualRisks || []),
    ...((shipReadiness.reasons || []).map((item) => item)),
  ], 12);
  const nextAction = (() => {
    if (shipReadiness.nextActions?.[0]) {
      return {
        title: 'Clear the next ship gate action',
        command: shipReadiness.nextActions[0],
        reason: 'Ship-readiness already has a concrete follow-up item.',
      };
    }
    if (context.handoffNext?.[0] && !/No handoff action recorded/i.test(context.handoffNext[0])) {
      return {
        title: 'Resume from the recorded handoff step',
        command: context.handoffNext[0],
        reason: 'HANDOFF.md already has an immediate next action.',
      };
    }
    if (context.nextActions?.[0] && !/No next action recorded/i.test(context.nextActions[0])) {
      return {
        title: 'Resume from STATUS next action',
        command: context.nextActions[0],
        reason: 'STATUS.md records the next action more explicitly than the handoff doc.',
      };
    }
    return {
      title: 'Refresh the next safe step',
      command: 'rai next',
      reason: 'No explicit next-action marker was found, so the safe default is to refresh the next-step surface.',
    };
  })();

  const compact = {
    summary: `${context.milestone} @ ${context.step} · verify=${verifyWork.verdict} · ship=${shipReadiness.verdict}`,
    scope: context.touchedFiles.filter((item) => !/No touched files recorded/i.test(item)).slice(0, 8),
    verification: context.testsRun.filter((item) => !/No test runs recorded/i.test(item)).slice(0, 8),
  };

  const prBriefPath = writeReportFile(cwd, 'pr-brief.md', renderPrBrief(context));
  const sessionReportPath = writeReportFile(cwd, 'session-report.md', renderSessionReport(context));
  const compactPath = writeReportFile(cwd, 'handoff-compact.md', renderCompactHandoff({
    milestone: context.milestone,
    step: context.step,
    nextAction,
    verifyWork,
    shipReadiness,
    openDecisions,
    unresolvedRisks,
  }));

  const verificationSummary = {
    shellVerdict: verifyWork.verification?.shell?.latest?.verdict || 'missing',
    browserVerdict: verifyWork.verification?.browser?.latest?.verdict || 'missing',
    testsRun: context.testsRun.filter((item) => !/No test runs recorded/i.test(item)),
  };

  const trustCenter = readJson(path.join(cwd, '.workflow', 'reports', 'trust-center.json'), null);
  const changeControl = readJson(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null)
    || readJson(path.join(cwd, '.workflow', 'reports', 'release-control.json'), null);
  const measurement = readJson(path.join(cwd, '.workflow', 'reports', 'measurement.json'), null);
  const teamControl = readJson(path.join(cwd, '.workflow', 'reports', 'team-control-room.json'), null);
  const autopilot = readJson(path.join(cwd, '.workflow', 'reports', 'autopilot.json'), null);
  const lifecycle = readJson(path.join(cwd, '.workflow', 'reports', 'lifecycle-center.json'), null);
  const explainability = readJson(path.join(cwd, '.workflow', 'reports', 'explainability.json'), null);
  const operatingCenter = readJson(path.join(cwd, '.workflow', 'reports', 'operating-center.json'), null);
  const exportManifest = readJson(path.join(cwd, '.workflow', 'exports', 'export-manifest.json'), null);
  const repoStatus = readJson(path.join(cwd, '.workflow', 'exports', 'repo-status.json'), null);
  const controlPlanePacket = readJson(path.join(cwd, '.workflow', 'exports', 'control-plane-packet.json'), null);

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'handoff',
    workflowRoot: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    verdict: unresolvedRisks.length > 0 || openDecisions.length > 0 ? 'open-loops' : 'ready',
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    compact,
    resumeAnchor: nextAction.command || nextAction.title,
    nextAction,
    openDecisions,
    unresolvedRisks,
    verification: verificationSummary,
    continuity: {
      openLoopCount: openDecisions.length + unresolvedRisks.length,
      nextActionRecorded: Boolean(nextAction.command || nextAction.title),
      verificationReady: verificationSummary.shellVerdict === 'pass' || verificationSummary.browserVerdict === 'pass',
    },
    decisionBasis: {
      trust: {
        verdict: trustCenter?.verdict || changeControl?.trustCenter?.verdict || null,
        riskLevel: trustCenter?.risk?.level || changeControl?.riskLevel || null,
        decisions: trustCenter?.decisions || changeControl?.trustCenter?.decisions || {},
        artifact: trustCenter?.artifacts?.json || changeControl?.trustCenter?.artifacts?.json || null,
      },
      changeControl: {
        verdict: changeControl?.verdict || null,
        riskLevel: changeControl?.riskLevel || null,
        allowMerge: Boolean(changeControl?.gates?.merge?.allowed),
        allowShip: Boolean(changeControl?.gates?.ship?.allowed),
        verifyQueue: Number(changeControl?.gates?.verify?.queue || 0),
        shipBlockers: Number(changeControl?.gates?.ship?.blockers || 0),
        pendingApprovals: Number(changeControl?.gates?.ship?.pendingApprovals || 0),
        continuityBundle: changeControl?.closeout?.continuityBundle || null,
        controlPlanePacket: changeControl?.closeout?.controlPlanePacket || null,
        artifact: changeControl?.artifacts?.json || null,
      },
      explainability: {
        tier: explainability?.confidenceBreakdown?.tier || changeControl?.explainability?.tier || null,
        overall: explainability?.confidenceBreakdown?.overall ?? changeControl?.explainability?.overall ?? null,
        lane: explainability?.route?.lane || changeControl?.explainability?.lane || null,
        bundle: explainability?.start?.bundle?.id || null,
        unsurveyedSurfaces: explainability?.unsurveyedSurfaces?.length || 0,
        artifact: explainability?.artifacts?.json || changeControl?.explainability?.artifact || null,
      },
    },
    controlPlanes: {
      trust: {
        verdict: trustCenter?.verdict || changeControl?.trustCenter?.verdict || null,
        riskLevel: trustCenter?.risk?.level || changeControl?.riskLevel || null,
        startDecision: trustCenter?.decisions?.start || changeControl?.trustCenter?.decisions?.start || null,
        mergeDecision: trustCenter?.decisions?.merge || changeControl?.trustCenter?.decisions?.merge || null,
        shipDecision: trustCenter?.decisions?.ship || changeControl?.trustCenter?.decisions?.ship || null,
        artifact: trustCenter?.artifacts?.json || changeControl?.trustCenter?.artifacts?.json || null,
      },
      changeControl: {
        verdict: changeControl?.verdict || null,
        riskLevel: changeControl?.riskLevel || null,
        allowMerge: Boolean(changeControl?.gates?.merge?.allowed),
        allowShip: Boolean(changeControl?.gates?.ship?.allowed),
        verifyQueue: Number(changeControl?.gates?.verify?.queue || 0),
        shipBlockers: Number(changeControl?.gates?.ship?.blockers || 0),
        pendingApprovals: Number(changeControl?.gates?.ship?.pendingApprovals || 0),
        artifact: changeControl?.artifacts?.json || null,
      },
      measurement: {
        openFindings: measurement?.metrics?.findings?.open ?? null,
        verifyPassRate: measurement?.metrics?.verification?.passRate ?? null,
        mergeReadinessRatio: measurement?.metrics?.mergeReadiness?.ratio ?? null,
        exportCoverage: measurement?.metrics?.exports?.coverageRatio ?? null,
        artifact: measurement?.artifacts?.controlPlane?.json || null,
      },
      teamControl: {
        verdict: teamControl?.verdict || null,
        handoffQueue: teamControl?.handoffQueue?.length || 0,
        blockerCount: teamControl?.conflicts?.blockerCount ?? 0,
        mailboxEntries: teamControl?.activity?.mailboxEntries ?? teamControl?.runtime?.mailboxEntries ?? null,
        artifact: teamControl?.artifacts?.json || null,
      },
      autopilot: {
        verdict: autopilot?.verdict || null,
        routineCount: autopilot?.routines?.length || 0,
        recoverySignals: autopilot?.recoverySignals?.length || 0,
        artifact: autopilot?.artifacts?.json || null,
      },
      lifecycle: {
        verdict: lifecycle?.verdict || null,
        configDrift: lifecycle?.drift?.config?.present ?? null,
        exportDrift: lifecycle?.drift?.exports?.present ?? null,
        artifact: lifecycle?.artifacts?.json || null,
      },
      explainability: {
        tier: explainability?.confidenceBreakdown?.tier || changeControl?.explainability?.tier || null,
        overall: explainability?.confidenceBreakdown?.overall ?? changeControl?.explainability?.overall ?? null,
        lane: explainability?.route?.lane || changeControl?.explainability?.lane || null,
        bundle: explainability?.start?.bundle?.id || null,
        artifact: explainability?.artifacts?.json || changeControl?.explainability?.artifact || null,
      },
      operatingCenter: {
        verdict: operatingCenter?.verdict || null,
        activePlane: operatingCenter?.activePlane?.id || null,
        primaryCommand: operatingCenter?.primaryCommand || null,
        artifact: operatingCenter?.artifacts?.json || null,
      },
    },
    external: {
      exportManifest: exportManifest ? '.workflow/exports/export-manifest.json' : null,
      repoStatus: repoStatus ? '.workflow/exports/repo-status.json' : null,
      controlPlanePacket: controlPlanePacket ? '.workflow/exports/control-plane-packet.json' : null,
      publishCoverage: exportManifest?.publishPlan?.exportCoverage?.coverageRatio ?? null,
      githubReady: Boolean(exportManifest?.publishPlan?.github?.ready),
      ciReady: Boolean(exportManifest?.publishPlan?.ci?.ready),
      issueTrackerOpenItems: Number(exportManifest?.issueTracker?.openItemCount || 0),
    },
    verifyWork: {
      verdict: verifyWork.verdict,
      fixPlan: verifyWork.fixPlan.slice(0, 6),
      artifacts: verifyWork.artifacts,
    },
    shipReadiness: {
      verdict: shipReadiness.verdict,
      score: shipReadiness.score,
      nextActions: shipReadiness.nextActions,
      artifacts: shipReadiness.artifacts,
    },
    exports: {
      compact: relativePath(cwd, compactPath),
      prBrief: relativePath(cwd, prBriefPath),
      sessionReport: relativePath(cwd, sessionReportPath),
      continuityBundle: null,
    },
    artifacts: null,
  };

  const continuityBundle = {
    generatedAt: payload.generatedAt,
    controlPlane: 'handoff-os',
    milestone: payload.milestone,
    step: payload.step,
    verdict: payload.verdict,
    nextAction: payload.nextAction,
    resumeAnchor: payload.resumeAnchor,
    compact: payload.compact,
    openDecisions: payload.openDecisions,
    unresolvedRisks: payload.unresolvedRisks,
    verification: payload.verification,
    continuity: payload.continuity,
    decisionBasis: payload.decisionBasis,
    controlPlanes: payload.controlPlanes,
    external: payload.external,
    verifyWork: payload.verifyWork,
    shipReadiness: payload.shipReadiness,
    linkedArtifacts: {
      prBrief: payload.exports.prBrief,
      sessionReport: payload.exports.sessionReport,
      compact: payload.exports.compact,
      exportManifest: payload.external.exportManifest,
      repoStatus: payload.external.repoStatus,
      controlPlanePacket: payload.external.controlPlanePacket,
    },
  };
  const continuityPath = writeJsonReport(cwd, 'continuity-bundle.json', continuityBundle);
  payload.exports.continuityBundle = relativePath(cwd, continuityPath);
  payload.artifacts = writePlaneArtifacts(cwd, 'handoff-os', payload, renderHandoffMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
handoff

Usage:
  node scripts/workflow/handoff.js [--json]

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
  const payload = buildHandoffPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# HANDOFF\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Next action: \`${payload.nextAction.command || payload.nextAction.title}\``);
  console.log(`- Open decisions: \`${payload.openDecisions.length}\``);
  console.log(`- Unresolved risks: \`${payload.unresolvedRisks.length}\``);
  console.log(`- Continuity bundle: \`${payload.exports.continuityBundle}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
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
  buildHandoffPayload,
};
