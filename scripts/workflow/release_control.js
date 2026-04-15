const fs = require('node:fs');
const path = require('node:path');
const {
  currentBranch,
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const { writeTextIfChanged: writeIfChanged } = require('./io/files');
const { baseLifecycleContext, renderPrBrief, renderReleaseNotes, renderSessionReport, renderShipPackage, reportsDir } = require('./lifecycle_common');
const { buildShipReadinessPayload, buildVerifyWorkPayload, latestReleaseControl } = require('./trust_os');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildTrustCenterPayload } = require('./trust_center');
const { buildAutopilotPayload } = require('./autopilot');
const { latestBrowserArtifacts } = require('./frontend_os');
const { buildHandoffPayload } = require('./handoff');
const { buildLifecycleCenterPayload } = require('./lifecycle_center');
const { buildMeasurePayload } = require('./measure');
const { buildTeamControlPayload } = require('./team_control_room');
const { buildExplainPayload } = require('./explain');
const { relativePath, writePlaneArtifacts } = require('./control_planes_common');
const { writeControlPlaneExports } = require('./control_plane_publish');

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
    .filter(Boolean)
    .slice(-50)
    .reverse();
}

function writeReportFile(cwd, fileName, content) {
  const filePath = path.join(reportsDir(cwd), fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeIfChanged(filePath, `${String(content || '').trimEnd()}\n`);
  return filePath;
}

function uniqueByKey(items = [], keyFn = (value) => JSON.stringify(value)) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    const key = String(keyFn(item));
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function summarizeChangeSet(cwd, context, verifyWork, shipReadiness, patchEvents) {
  const touchedFiles = (context.touchedFiles || []).filter((item) => !/No touched files recorded/i.test(item));
  const gitChanges = (context.gitChanges || []).slice(0, 20);
  const reviewFiles = (verifyWork.review?.blockers || []).map((item) => item.file).filter(Boolean);
  const approvalFiles = (shipReadiness.approvalPlan?.pending || []).flatMap((item) => item.files || []).filter(Boolean);
  const candidateFiles = uniqueByKey([...touchedFiles, ...gitChanges, ...reviewFiles, ...approvalFiles], (item) => item).slice(0, 20);
  const riskyAreas = uniqueByKey([
    ...(verifyWork.review?.blockers || []).map((item) => `${item.category || 'review'}:${item.file || 'repo'}`),
    ...(shipReadiness.approvalPlan?.pending || []).map((item) => `${item.target}:${(item.files || []).join(',')}`),
    ...(shipReadiness.reasons || []).slice(0, 6),
  ], (item) => item).slice(0, 10);
  let branch = 'unknown';
  try {
    branch = currentBranch(cwd) || 'unknown';
  } catch {
    branch = 'unknown';
  }
  return {
    branch,
    fileCount: candidateFiles.length,
    changedFiles: candidateFiles,
    riskyAreas,
    patchEventCount: patchEvents.length,
    reviewBlockers: verifyWork.review?.blockerCount || 0,
    pendingApprovals: shipReadiness.approvalPlan?.pending?.length || 0,
  };
}

function buildCloseoutSummary(cwd, paths) {
  const entries = Object.entries(paths).map(([key, fullPath]) => ({
    id: key,
    path: relativePath(cwd, fullPath),
    exists: fs.existsSync(fullPath),
    updatedAt: fs.existsSync(fullPath) ? fs.statSync(fullPath).mtime.toISOString() : null,
  }));
  const readyCount = entries.filter((item) => item.exists).length;
  return {
    completenessScore: Number(((readyCount / Math.max(1, entries.length)) * 100).toFixed(1)),
    readyCount,
    total: entries.length,
    files: entries,
  };
}

function buildReleaseWaveItems(releaseBoard) {
  return uniqueByKey([
    ...(releaseBoard.shipReadinessBoard?.topShipBlockers || []),
    ...(releaseBoard.verifyStatusBoard?.topStatusItems || []),
  ], (item) => `${item.id || ''}::${item.title || ''}`).slice(0, 10);
}

function materializeSupportingPlanes(cwd, rootDir, options = {}) {
  const definitions = [
    {
      id: 'explainability',
      key: 'explainability',
      build: () => buildExplainPayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.json || null,
    },
    {
      id: 'handoff-os',
      key: 'handoff',
      build: () => buildHandoffPayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.json || null,
    },
    {
      id: 'team-control-room',
      key: 'teamControl',
      build: () => buildTeamControlPayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.json || null,
    },
    {
      id: 'lifecycle-center',
      key: 'lifecycle',
      build: () => buildLifecycleCenterPayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.json || null,
    },
    {
      id: 'measurement',
      key: 'measurement',
      build: () => buildMeasurePayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.controlPlane?.json || null,
    },
    {
      id: 'autopilot',
      key: 'autopilot',
      build: () => buildAutopilotPayload(cwd, rootDir, options),
      artifact: (payload) => payload?.artifacts?.json || null,
    },
  ];

  const context = {};
  const materialized = [];
  const failures = [];
  for (const definition of definitions) {
    try {
      const planePayload = definition.build();
      context[definition.key] = planePayload;
      materialized.push({
        id: definition.id,
        verdict: planePayload?.verdict || 'n/a',
        artifact: definition.artifact(planePayload),
      });
    } catch (error) {
      failures.push({
        id: definition.id,
        message: error.message,
      });
    }
  }

  return {
    context,
    summary: {
      materialized,
      failures,
    },
  };
}

function applyExportResult(payload, exportResult) {
  payload.externalExports = exportResult.externalExports;
  payload.publishPlan = exportResult.publishPlan;
  payload.explainability = {
    tier: exportResult.context?.explainability?.confidenceBreakdown?.tier || payload.explainability?.tier || null,
    overall: exportResult.context?.explainability?.confidenceBreakdown?.overall ?? payload.explainability?.overall ?? null,
    lane: exportResult.context?.explainability?.route?.lane || payload.explainability?.lane || null,
    artifact: exportResult.context?.explainability?.artifacts?.json || payload.explainability?.artifact || null,
  };
  payload.closeout.controlPlanePacket = exportResult.externalExports?.controlPlanePacket || payload.closeout.controlPlanePacket || null;
  payload.closeout.continuityBundle = exportResult.context?.handoff?.exports?.continuityBundle || payload.closeout.continuityBundle || null;
  payload.integrationSurface = {
    issueTrackerOpenItems: exportResult.issueTracker?.openItemCount || 0,
    badge: exportResult.badge,
    githubOutputs: exportResult.githubOutputs,
    controlPlanePacket: exportResult.externalExports?.controlPlanePacket || null,
    continuityBundle: exportResult.context?.handoff?.exports?.continuityBundle || null,
  };
  return payload;
}

function releaseSurfaceSignature(payload) {
  return JSON.stringify({
    supportingPlanes: (payload.supportingPlanes?.materialized || []).map((item) => [item.id, item.verdict, item.artifact]),
    supportingFailures: (payload.supportingPlanes?.failures || []).map((item) => [item.id, item.message]),
    explainability: payload.explainability,
    controlPlanePacket: payload.closeout?.controlPlanePacket || null,
    continuityBundle: payload.closeout?.continuityBundle || null,
    publishCoverage: payload.publishPlan?.exportCoverage?.coverageRatio ?? null,
  });
}

function convergeReleaseControlSurface(cwd, rootDir, options, payload, repoConfigPayload, trustCenter) {
  let previousSignature = null;
  for (let pass = 0; pass < 3; pass += 1) {
    const supportingPlanes = materializeSupportingPlanes(cwd, rootDir, options);
    payload.supportingPlanes = supportingPlanes.summary;

    const exportResult = writeControlPlaneExports(cwd, payload, {
      repoConfig: repoConfigPayload,
      trustCenter,
      context: {
        trustCenter,
        repoConfig: repoConfigPayload,
        ...supportingPlanes.context,
      },
    });
    applyExportResult(payload, exportResult);
    payload.artifacts = writePlaneArtifacts(cwd, 'change-control', payload, renderReleaseControlMarkdown(payload), { runtimeMirror: true });

    const signature = releaseSurfaceSignature(payload);
    if (signature === previousSignature) {
      break;
    }
    previousSignature = signature;
  }
  return payload;
}

function renderReleaseControlMarkdown(payload) {
  return `# CHANGE CONTROL

- Verdict: \`${payload.verdict}\`
- Risk level: \`${payload.riskLevel}\`
- Safe to merge: \`${payload.gates.merge.allowed ? 'yes' : 'no'}\`
- Safe to ship: \`${payload.gates.ship.allowed ? 'yes' : 'no'}\`
- Release board: \`${payload.releaseBoard.activeSurface}\`
- Publish plan: GitHub=\`${payload.publishPlan?.github?.ready ? 'yes' : 'no'}\`, CI=\`${payload.publishPlan?.ci?.ready ? 'yes' : 'no'}\`, Slack=\`${payload.publishPlan?.slack?.ready ? 'yes' : 'no'}\`

## Flow

- Prepare the change: \`${payload.closeout.paths.prBrief}\`
- See the risk: \`${payload.trustCenter.artifacts.markdown}\`
- Explain the lane: tier=\`${payload.explainability.tier || 'n/a'}\` lane=\`${payload.explainability.lane || 'n/a'}\`
- Verify it: queue=\`${payload.gates.verify.queue}\`, failed=\`${payload.gates.verify.failed}\`
- Pass the ship gate: blockers=\`${payload.gates.ship.blockers}\`, approvals=\`${payload.gates.ship.pendingApprovals}\`
- Generate release artifacts: \`${payload.closeout.paths.releaseNotes}\`, \`${payload.closeout.paths.sessionReport}\`, \`${payload.closeout.paths.shipPackage}\`
- Preserve continuity: \`${payload.closeout.continuityBundle || 'n/a'}\`
- Publish the machine-readable packet: \`${payload.closeout.controlPlanePacket || 'n/a'}\`
- Keep rollback ready: \`${payload.rollback.ready ? 'yes' : 'no'}\`

## Change Set

- Branch: \`${payload.changeSet.branch}\`
- Changed files: \`${payload.changeSet.fileCount}\`
- Risky areas: \`${payload.changeSet.riskyAreas.length}\`

${payload.changeSet.changedFiles.length > 0
    ? payload.changeSet.changedFiles.map((item) => `- \`${item}\``).join('\n')
    : '- `No changed files were captured.`'}

## Release Wave

${payload.releaseWave.topItems.length > 0
    ? payload.releaseWave.topItems.map((item) => `- [${item.status}] ${item.title} (${item.severity} · ${item.sourceKind})`).join('\n')
    : '- `No release-wave item is open.`'}

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')
    : '- `No next actions are queued.`'}

## Supporting Planes

${(payload.supportingPlanes?.materialized || []).length > 0
    ? (payload.supportingPlanes.materialized || []).map((item) => `- \`${item.id}\` · verdict=\`${item.verdict}\` · artifact=\`${item.artifact || 'n/a'}\``).join('\n')
    : '- `No supporting plane was materialized.`'}

${(payload.supportingPlanes?.failures || []).length > 0
    ? `### Materialization Failures\n\n${payload.supportingPlanes.failures.map((item) => `- \`${item.id}\`: ${item.message}`).join('\n')}\n`
    : ''}
## Rollback Readiness

- Patch history entries: \`${payload.rollback.patchEvents}\`
- Last event: \`${payload.rollback.lastEvent || 'none'}\`
- Rollback command: \`${payload.rollback.command}\`

## External Integration Surface

- Export coverage: \`${payload.publishPlan?.exportCoverage?.coverageRatio ?? 0}\`%
- GitHub PR comment: \`${payload.externalExports.githubPrComment}\`
- GitHub Actions summary: \`${payload.externalExports.githubActionsStepSummary}\`
- CI gate JSON: \`${payload.externalExports.ciGate}\`
- Status badge JSON: \`${payload.externalExports.statusBadge}\`
- Issue tracker JSON: \`${payload.externalExports.issueTracker}\`
- Slack payload JSON: \`${payload.externalExports.slackSummaryJson}\`
- Export manifest: \`${payload.externalExports.exportManifest}\`
- Control-plane packet: \`${payload.externalExports.controlPlanePacket || 'n/a'}\`
`;
}

function buildReleaseControlPayload(cwd, rootDir, options = {}) {
  const context = baseLifecycleContext(cwd, rootDir);
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const verifyWork = buildVerifyWorkPayload(cwd, rootDir, options);
  const shipReadiness = buildShipReadinessPayload(cwd, rootDir, options);
  const trustCenter = buildTrustCenterPayload(cwd, rootDir, options);
  const releaseBoard = shipReadiness.releaseControl
    || verifyWork.releaseControl
    || latestReleaseControl(cwd)
    || { activeSurface: 'none', findingsStatusModel: { summary: {} }, verifyStatusBoard: {}, shipReadinessBoard: {} };
  const browserArtifacts = latestBrowserArtifacts(cwd);
  const patchEvents = readPatchEvents(cwd);

  const prBriefPath = writeReportFile(cwd, 'pr-brief.md', renderPrBrief(context));
  const releaseNotesPath = writeReportFile(cwd, 'release-notes.md', renderReleaseNotes(context));
  const sessionReportPath = writeReportFile(cwd, 'session-report.md', renderSessionReport(context));
  const shipPath = writeReportFile(cwd, 'ship.md', renderShipPackage(context));
  const closeoutSummary = buildCloseoutSummary(cwd, {
    prBrief: prBriefPath,
    releaseNotes: releaseNotesPath,
    sessionReport: sessionReportPath,
    shipPackage: shipPath,
  });

  const nextActions = [];
  const pushAction = (priority, title, command, reason) => {
    if (!title || nextActions.some((item) => item.title === title && item.command === command)) {
      return;
    }
    nextActions.push({ priority, title, command, reason });
  };

  for (const approval of (shipReadiness.approvalPlan?.pending || []).slice(0, 4)) {
    pushAction('high', `Resolve approval for ${approval.target}`, approval.suggestedCommand, approval.reason);
  }
  for (const item of (verifyWork.fixPlan || []).slice(0, 6)) {
    const command = item.lane === 'shell'
      ? 'rai verify-shell --cmd "npm test" --json'
      : item.lane === 'browser'
        ? 'rai verify-browser --url http://localhost:3000 --json'
        : item.lane === 'review'
          ? 'rai review-tasks --json'
          : item.lane === 'claims'
            ? 'rai evidence --json'
            : item.lane === 'repo-audit'
              ? 'rai audit-repo --mode oneshot --json'
              : 'rai release-control --json';
    pushAction(item.priority, item.action, command, item.evidence || item.lane);
  }
  if (releaseBoard.shipReadinessBoard?.releaseWave?.primaryCommand) {
    pushAction('medium', 'Open the current release wave', releaseBoard.shipReadinessBoard.releaseWave.primaryCommand, 'Ship-readiness already has a primary release-wave command.');
  }
  if ((repoConfigPayload.activeConfig.releaseControl?.publishStepSummary ?? true) !== false) {
    pushAction('low', 'Refresh machine-readable control-plane exports', 'node scripts/workflow/control_plane_publish.js --json', 'GitHub / CI / Slack / issue-tracker exports can be regenerated from the current change-control state.');
  }

  const riskLevel = trustCenter.risk.level;
  const verifyQueue = releaseBoard.verifyStatusBoard?.queuedForVerifyCount || 0;
  const verifyFailed = releaseBoard.verifyStatusBoard?.failedVerificationCount || 0;
  const shipBlockers = releaseBoard.shipReadinessBoard?.shipBlockerCount || 0;
  const pendingApprovals = shipReadiness.approvalPlan?.pending?.length || 0;
  const allowMerge = trustCenter.decisions.merge === 'ready';
  const allowShip = trustCenter.decisions.ship === 'ready';

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'release-control',
    workflowRoot: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    verdict: allowShip
      ? 'ready'
      : trustCenter.decisions.ship === 'needs-attention'
        ? 'needs-attention'
        : 'blocked',
    riskLevel,
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    changeSet: summarizeChangeSet(cwd, context, verifyWork, shipReadiness, patchEvents),
    releaseBoard: {
      activeSurface: releaseBoard.activeSurface || 'unknown',
      artifacts: releaseBoard.artifacts || null,
      findingsSummary: releaseBoard.findingsStatusModel?.summary || {},
      verifyStatusBoard: releaseBoard.verifyStatusBoard || {},
      shipReadinessBoard: releaseBoard.shipReadinessBoard || {},
    },
    releaseWave: {
      primaryCommand: releaseBoard.shipReadinessBoard?.releaseWave?.primaryCommand || releaseBoard.verifyStatusBoard?.primaryCommand || null,
      topItems: buildReleaseWaveItems(releaseBoard),
    },
    gates: {
      verify: {
        queue: verifyQueue,
        failed: verifyFailed,
      },
      merge: {
        allowed: allowMerge,
        blockers: verifyFailed + (verifyWork.review?.blockerCount || 0),
      },
      ship: {
        allowed: allowShip,
        blockers: shipBlockers,
        pendingApprovals,
      },
    },
    evidence: {
      browserArtifacts: browserArtifacts.length,
      latestBrowser: browserArtifacts[0]?.path || null,
      verifyWork: verifyWork.artifacts,
      shipReadiness: shipReadiness.artifacts,
    },
    closeout: {
      paths: {
        prBrief: relativePath(cwd, prBriefPath),
        releaseNotes: relativePath(cwd, releaseNotesPath),
        sessionReport: relativePath(cwd, sessionReportPath),
        shipPackage: relativePath(cwd, shipPath),
      },
      completenessScore: closeoutSummary.completenessScore,
      readyCount: closeoutSummary.readyCount,
      total: closeoutSummary.total,
      files: closeoutSummary.files,
      continuityBundle: null,
      controlPlanePacket: null,
    },
    rollback: {
      ready: patchEvents.length > 0 || context.gitChanges.length > 0,
      patchEvents: patchEvents.length,
      lastEvent: patchEvents[0]?.action || null,
      command: patchEvents[0]?.taskId ? `rai patch-rollback --task ${patchEvents[0].taskId} --json` : 'git revert <commit>',
      recent: patchEvents.slice(0, 8),
    },
    nextActions,
    trustCenter: {
      verdict: trustCenter.verdict,
      decisions: trustCenter.decisions,
      artifacts: trustCenter.artifacts,
    },
    explainability: {
      tier: null,
      overall: null,
      lane: null,
      artifact: null,
    },
    supportingPlanes: {
      materialized: [],
      failures: [],
    },
    publishPlan: null,
    externalExports: {},
    integrationSurface: {
      issueTrackerOpenItems: 0,
      badge: null,
      githubOutputs: {},
      controlPlanePacket: null,
      continuityBundle: null,
    },
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'change-control', payload, renderReleaseControlMarkdown(payload), { runtimeMirror: true });
  return convergeReleaseControlSurface(cwd, rootDir, options, payload, repoConfigPayload, trustCenter);
}

function printHelp() {
  console.log(`
release_control

Usage:
  node scripts/workflow/release_control.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --mode <value>      auto|review|audit-only
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
  const payload = buildReleaseControlPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# RELEASE CONTROL\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Risk level: \`${payload.riskLevel}\``);
  console.log(`- Safe to merge: \`${payload.gates.merge.allowed ? 'yes' : 'no'}\``);
  console.log(`- Safe to ship: \`${payload.gates.ship.allowed ? 'yes' : 'no'}\``);
  console.log(`- Change set files: \`${payload.changeSet.fileCount}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
  console.log(`- External exports: \`${Object.keys(payload.externalExports).length}\``);
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
  buildReleaseControlPayload,
  readPatchEvents,
};
