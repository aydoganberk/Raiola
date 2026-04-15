const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildRepoControlPayload } = require('./repo_control');
const { buildMonorepoControlPayload } = require('./monorepo_control');
const { buildFrontendControlPayload } = require('./frontend_control');
const { buildSafetyControlPayload } = require('./safety_control');
const { buildTrustCenterPayload } = require('./trust_center');
const { buildReleaseControlPayload } = require('./release_control');
const { buildAutopilotPayload } = require('./autopilot');
const { buildHandoffPayload } = require('./handoff');
const { buildTeamControlPayload } = require('./team_control_room');
const { buildMeasurePayload } = require('./measure');
const { buildExplainPayload } = require('./explain');
const { buildLifecycleCenterPayload } = require('./lifecycle_center');
const { compactList, readJson, writePlaneArtifacts } = require('./control_planes_common');
const { applyGitHubEnvironmentFiles, writeControlPlaneExports } = require('./control_plane_publish');
const { listPlaneCatalog, planeById, planeCompressionSummary } = require('./plane_registry');

const REPORT_PATHS = Object.freeze({
  'repo-control': '.workflow/reports/repo-control-room.json',
  'monorepo-control': '.workflow/reports/monorepo-control-room.json',
  'frontend-control': '.workflow/reports/frontend-control-room.json',
  'safety-control': '.workflow/reports/safety-control-room.json',
  trust: '.workflow/reports/trust-center.json',
  'release-control': '.workflow/reports/change-control.json',
  autopilot: '.workflow/reports/autopilot.json',
  handoff: '.workflow/reports/handoff-os.json',
  'team-control': '.workflow/reports/team-control-room.json',
  measure: '.workflow/reports/measurement.json',
  explain: '.workflow/reports/explainability.json',
  lifecycle: '.workflow/reports/lifecycle-center.json',
});

function repoConfigReport(cwd) {
  return readJson(path.join(cwd, '.workflow', 'runtime', 'repo-config.json'), null)
    || readJson(path.join(cwd, '.workflow', 'repo-config.json'), null);
}

function loadOrBuildPlane(cwd, rootDir, options = {}) {
  const refresh = Boolean(options.refresh);
  const reportPath = options.reportPath ? path.join(cwd, options.reportPath) : null;
  if (!refresh && reportPath) {
    const existing = readJson(reportPath, null);
    if (existing) {
      return existing;
    }
  }
  return options.build();
}

function planeNextCommand(planeId, payload) {
  switch (planeId) {
    case 'repo-config':
      return payload.warnings?.length > 0 || !payload.file?.exists ? 'rai repo-config --refresh --json' : 'rai repo-config --json';
    case 'repo-control':
      return payload.nextActions?.[0]?.command || 'rai repo-control --json';
    case 'monorepo-control':
      return payload.nextActions?.[0]?.command || 'rai monorepo-control --json';
    case 'frontend-control':
      return payload.nextActions?.[0]?.command || 'rai frontend-control --json';
    case 'safety-control':
      return payload.nextActions?.[0]?.command || 'rai safety-control --json';
    case 'trust':
      return payload.priorityActions?.[0]?.command || 'rai trust --json';
    case 'release-control':
      return payload.nextActions?.[0]?.command || 'rai release-control --json';
    case 'autopilot':
      return payload.routines?.[0]?.command || 'rai autopilot --json';
    case 'handoff':
      return payload.nextAction?.command || 'rai handoff --json';
    case 'team-control':
      return payload.escalations?.[0]?.command || 'rai team-control --json';
    case 'measure':
      return 'rai measure --json';
    case 'explain':
      return payload.nextSteps?.[0]?.command || 'rai explain --json';
    case 'lifecycle':
      return payload.selfHealing?.actions?.[0]?.command || 'rai lifecycle --json';
    default:
      return null;
  }
}

function planeHeadline(planeId, payload) {
  switch (planeId) {
    case 'repo-config':
      return `${payload.activeConfig?.defaultProfile || 'n/a'} · planes=${(payload.activeConfig?.preferredPlanes || []).join(', ') || 'none'}`;
    case 'repo-control':
      return `shape=${payload.packageGraph?.repoShape || 'unknown'} packages=${payload.packageGraph?.packageCount || 0} hotspots=${payload.hotspots?.length || 0} findings=${payload.repoHealth?.findingCounts?.total || 0}`;
    case 'monorepo-control':
      return `shape=${payload.repoShape || 'unknown'} blast=${payload.blastRadius?.verdict || 'unknown'} workspaces=${payload.coordination?.workspaceCount || 0} waves=${payload.campaign?.waves?.length || 0}`;
    case 'frontend-control':
      return `framework=${payload.frontend?.framework || 'unknown'} routes=${payload.frontend?.routeCount || 0} debt=${payload.designDebt?.total || 0} browser=${payload.browserEvidence?.artifactCount || 0}`;
    case 'safety-control':
      return `secure=${payload.security?.verdict || 'unknown'} doctor=${payload.recovery?.doctor?.failCount || 0}/${payload.recovery?.doctor?.warnCount || 0} health=${payload.recovery?.health?.failCount || 0}/${payload.recovery?.health?.warnCount || 0} repairs=${payload.recovery?.repair?.safeActionCount || 0}`;
    case 'trust':
      return `risk=${payload.risk?.level || 'unknown'} approvals=${payload.approvals?.pending?.length || 0} verify-gaps=${payload.governance?.verificationGapCount || 0}`;
    case 'release-control':
      return `merge=${payload.gates?.merge?.allowed ? 'yes' : 'no'} ship=${payload.gates?.ship?.allowed ? 'yes' : 'no'} blockers=${payload.gates?.ship?.blockers || 0}`;
    case 'autopilot':
      return `routines=${payload.routines?.length || 0} recovery=${payload.recoverySignals?.length || 0} event=${payload.eventContext?.eventName || payload.eventContext?.provider || 'local'}`;
    case 'handoff':
      return `open-loops=${payload.continuity?.openLoopCount || 0} next=${payload.nextAction?.command || payload.nextAction?.title || 'n/a'}`;
    case 'team-control':
      return `roles=${payload.ownership?.length || 0} handoff=${payload.handoffQueue?.length || 0} conflicts=${payload.conflicts?.blockerCount || 0}`;
    case 'measure':
      return `open-findings=${payload.metrics?.findings?.open || 0} verify-pass=${payload.metrics?.verification?.passRate ?? 0}% exports=${payload.metrics?.exports?.coverageRatio ?? 0}%`;
    case 'explain':
      return `lane=${payload.route?.lane || 'n/a'} tier=${payload.confidenceBreakdown?.tier || 'unknown'} unsurveyed=${payload.unsurveyedSurfaces?.length || 0}`;
    case 'lifecycle':
      return `doctor=${payload.doctor?.failCount || 0}/${payload.doctor?.warnCount || 0} health=${payload.health?.failCount || 0}/${payload.health?.warnCount || 0}`;
    default:
      return 'n/a';
  }
}

function planeStatus(planeId, payload) {
  switch (planeId) {
    case 'repo-config':
      if (!payload.file?.exists) {
        return 'missing';
      }
      return payload.warnings?.length > 0 ? 'watch' : 'aligned';
    case 'repo-control':
      return payload.verdict || 'unknown';
    case 'monorepo-control':
      return payload.verdict || 'unknown';
    case 'frontend-control':
      return payload.verdict || 'unknown';
    case 'safety-control':
      return payload.verdict || 'unknown';
    case 'trust':
      return payload.verdict || 'unknown';
    case 'release-control':
      return payload.verdict || 'unknown';
    case 'autopilot':
      return payload.verdict || 'unknown';
    case 'handoff':
      return payload.verdict || 'unknown';
    case 'team-control':
      return payload.verdict || 'unknown';
    case 'measure':
      return (payload.metrics?.findings?.open || 0) > 0 || (payload.metrics?.exports?.coverageRatio ?? 100) < 100 ? 'watch' : 'healthy';
    case 'explain':
      return payload.confidenceBreakdown?.tier === 'low'
        ? 'low-confidence'
        : payload.confidenceBreakdown?.tier === 'medium'
          ? 'watch'
          : payload.confidenceBreakdown?.tier === 'high'
            ? 'grounded'
            : 'unknown';
    case 'lifecycle':
      return payload.verdict || 'unknown';
    default:
      return 'unknown';
  }
}

function preferredPlaneBonus(preferredPlanes = [], planeId) {
  const index = (preferredPlanes || []).indexOf(planeId);
  return index === -1 ? 0 : Math.max(0, 6 - index);
}

function planeAttentionScore(planeId, payload, preferredPlanes = []) {
  let score = 0;
  switch (planeId) {
    case 'repo-config':
      score = !payload.file?.exists ? 65 : Math.min(60, (payload.warnings?.length || 0) * 12 + 8);
      break;
    case 'repo-control': {
      const base = payload.verdict === 'attention-required' ? 82 : payload.verdict === 'guided' ? 46 : 12;
      score = base + ((payload.hotspots || []).filter((entry) => ['critical', 'high'].includes(entry.severity)).length * 5) + (payload.repoHealth?.findingCounts?.verified || 0) * 3 + (payload.repoHealth?.findingCounts?.probable || 0) * 2;
      break;
    }
    case 'monorepo-control': {
      const base = payload.verdict === 'attention-required' ? 84 : payload.verdict === 'guided' ? 50 : payload.verdict === 'single-package' ? 6 : 12;
      score = base + (payload.blastRadius?.impactedPackageCount || 0) * 2 + (payload.coordination?.unmappedPackageCount || 0) * 4 + ((payload.topology?.rootBottlenecks || []).length * 5);
      break;
    }
    case 'frontend-control': {
      const base = payload.verdict === 'attention-required' ? 78 : payload.verdict === 'guided' ? 42 : payload.verdict === 'frontend-not-detected' ? 8 : 12;
      score = base + (payload.designDebt?.high || 0) * 5 + ((payload.browserEvidence?.artifactCount || 0) === 0 && payload.frontend?.detected ? 12 : 0) + (payload.audits?.semanticAudit?.issueCount || 0);
      break;
    }
    case 'safety-control': {
      const base = payload.verdict === 'attention-required' ? 88 : payload.verdict === 'guided' ? 54 : 12;
      score = base
        + (payload.security?.countsByVerdict?.fail || 0) * 6
        + (payload.recovery?.doctor?.failCount || 0) * 5
        + (payload.recovery?.health?.failCount || 0) * 5
        + (payload.recovery?.repair?.safeActionCount || 0) * 2
        + ((payload.failureForecast || []).filter((entry) => entry.severity === 'high').length * 6);
      break;
    }
    case 'trust': {
      const base = payload.verdict === 'hold' ? 92 : payload.verdict === 'needs-attention' ? 72 : 12;
      score = base + (payload.approvals?.pending?.length || 0) * 2 + (payload.governance?.verificationGapCount || 0) * 2;
      break;
    }
    case 'release-control': {
      const base = payload.verdict === 'blocked' ? 90 : payload.verdict === 'needs-attention' ? 74 : 14;
      score = base + (payload.gates?.ship?.blockers || 0) * 3 + (payload.gates?.verify?.failed || 0) * 2;
      break;
    }
    case 'autopilot':
      score = (payload.recoverySignals?.length || 0) > 0
        ? 58 + Math.min(20, (payload.recoverySignals?.length || 0) * 4)
        : payload.eventContext?.active
          ? 34
          : 12;
      break;
    case 'handoff':
      score = payload.verdict === 'open-loops'
        ? 44 + Math.min(24, (payload.continuity?.openLoopCount || 0) * 2)
        : 10;
      break;
    case 'team-control': {
      const base = payload.verdict === 'attention-required' ? 70 : payload.verdict === 'active' ? 34 : 10;
      score = base + (payload.conflicts?.blockerCount || 0) * 5 + (payload.handoffQueue?.length || 0);
      break;
    }
    case 'measure':
      score = (payload.metrics?.findings?.open || 0) > 0 || (payload.metrics?.exports?.coverageRatio ?? 100) < 100 ? 28 : 8;
      break;
    case 'explain':
      score = payload.confidenceBreakdown?.tier === 'low'
        ? 42
        : payload.confidenceBreakdown?.tier === 'medium'
          ? 26
          : payload.confidenceBreakdown?.tier === 'high'
            ? 8
            : 30;
      score += Math.min(12, payload.unsurveyedSurfaces?.length || 0);
      break;
    case 'lifecycle':
      score = payload.verdict === 'repair-needed' ? 95 : payload.verdict === 'watch' ? 80 : 10;
      break;
    default:
      score = 0;
      break;
  }
  return score + preferredPlaneBonus(preferredPlanes, planeId);
}

function severityLabel(score) {
  if (score >= 90) {
    return 'critical';
  }
  if (score >= 70) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

function planeArtifact(planeId, payload) {
  switch (planeId) {
    case 'repo-config':
      return payload.artifacts?.runtimeMarkdown || payload.artifacts?.runtimeJson || payload.file?.relative || '.workflow/repo-config.json';
    case 'repo-control':
    case 'monorepo-control':
    case 'frontend-control':
    case 'safety-control':
    case 'trust':
    case 'release-control':
    case 'autopilot':
    case 'handoff':
    case 'team-control':
    case 'lifecycle':
      return payload.artifacts?.markdown || payload.artifacts?.json || null;
    case 'measure':
      return payload.artifacts?.controlPlane?.markdown || payload.artifacts?.controlPlane?.json || null;
    case 'explain':
      return payload.artifacts?.markdown || payload.artifacts?.json || null;
    default:
      return null;
  }
}

function buildPlaneBoard(planes, preferredPlanes = []) {
  return listPlaneCatalog({ kind: 'plane' }).map((plane) => {
    const payload = planes[plane.id];
    return {
      id: plane.id,
      title: plane.title,
      question: plane.question,
      status: planeStatus(plane.id, payload),
      verdict: payload?.verdict || planeStatus(plane.id, payload),
      score: planeAttentionScore(plane.id, payload, preferredPlanes),
      severity: severityLabel(planeAttentionScore(plane.id, payload, preferredPlanes)),
      command: planeNextCommand(plane.id, payload),
      headline: planeHeadline(plane.id, payload),
      compressedCommands: plane.compresses,
      compressedCommandCount: plane.compresses.length,
      artifact: planeArtifact(plane.id, payload),
    };
  }).sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

function aggregateBlockers(planes) {
  return compactList([
    ...(planes.trust?.policy?.issues || []).slice(0, 4),
    ...((planes.trust?.priorityActions || []).slice(0, 4).map((item) => item.title)),
    ...((planes['release-control']?.releaseWave?.topItems || []).slice(0, 4).map((item) => item.title)),
    ...((planes.lifecycle?.drift?.config?.reasons || []).slice(0, 3)),
    ...((planes.lifecycle?.drift?.exports?.reasons || []).slice(0, 3)),
    ...((planes['team-control']?.ownershipGaps || []).slice(0, 3)),
    ...((planes.handoff?.openDecisions || []).slice(0, 3).map((item) => item.title)),
    ...((planes.autopilot?.recoverySignals || []).slice(0, 4).map((item) => `recovery:${item}`)),
    ...((planes['repo-control']?.hotspots || []).slice(0, 3).map((item) => `repo-hotspot:${item.area}`)),
    ...((planes['monorepo-control']?.topology?.rootBottlenecks || []).slice(0, 3).map((item) => `monorepo:${item.title}`)),
    ...((planes['monorepo-control']?.coordination?.unmappedPackages || []).slice(0, 3).map((item) => `unmapped:${item}`)),
    ...((planes['frontend-control']?.topSignals || []).slice(0, 4)),
    ...((planes['safety-control']?.failureForecast || []).slice(0, 4).map((item) => `safety:${item.title}`)),
    ...((planes['safety-control']?.security?.topRisks || []).slice(0, 4).map((item) => `secure:${item.file}:${item.category}`)),
  ], 14);
}

function overallVerdict(activePlane, sortedPlanes = []) {
  const topScore = activePlane?.score || 0;
  if (topScore >= 90) {
    return 'action-required';
  }
  if (topScore >= 70) {
    return 'attention-required';
  }
  if (topScore >= 40) {
    return 'guided';
  }
  return sortedPlanes.some((plane) => plane.status !== 'healthy' && plane.status !== 'aligned' && plane.status !== 'grounded' && plane.status !== 'ready')
    ? 'guided'
    : 'clear';
}

function buildOperatorSequence(sortedPlanes = []) {
  return sortedPlanes
    .filter((plane) => plane.command)
    .slice(0, 5)
    .map((plane, index) => ({
      order: index + 1,
      planeId: plane.id,
      title: plane.title,
      command: plane.command,
      reason: plane.headline,
      severity: plane.severity,
    }));
}

function buildFocusQuestions(sortedPlanes = []) {
  return sortedPlanes.slice(0, 3).map((plane) => ({
    planeId: plane.id,
    title: plane.title,
    question: plane.question,
    command: plane.command,
  }));
}

function renderOperatingCenterMarkdown(payload) {
  return `# OPERATING CENTER

- Verdict: \`${payload.verdict}\`
- Active plane: \`${payload.activePlane.id}\`
- Active question: ${payload.activePlane.question}
- Primary command: \`${payload.primaryCommand}\`
- Compression: ${payload.compression.summary}
- Repo profile: \`${payload.repoConfig.defaultProfile}\`
- Preferred planes: \`${payload.repoConfig.preferredPlanes.join(', ') || 'none'}\`

## Plane Board

${payload.planeBoard.map((plane) => `- [${plane.severity}] ${plane.title} :: status=${plane.status} :: ${plane.headline}${plane.command ? ` -> \`${plane.command}\`` : ''}`).join('\n')}

## Operator Sequence

${payload.operatorSequence.length > 0
    ? payload.operatorSequence.map((step) => `- ${step.order}. [${step.severity}] ${step.title} -> \`${step.command}\``).join('\n')
    : '- `No operator sequence is active.`'}

## Blocking Signals

${payload.blockingSignals.length > 0
    ? payload.blockingSignals.map((item) => `- ${item}`).join('\n')
    : '- `No blocking signal is active.`'}

## Publish Surface

- GitHub ready: \`${payload.publishSurface.githubReady ? 'yes' : 'no'}\`
- CI ready: \`${payload.publishSurface.ciReady ? 'yes' : 'no'}\`
- Slack ready: \`${payload.publishSurface.slackReady ? 'yes' : 'no'}\`
- Export coverage: \`${payload.publishSurface.coverageRatio}\`%
- Publish bridge: \`${payload.publishSurface.bridgeCommand}\`

## Active Stack Packs

${payload.stackPacks.length > 0
    ? payload.stackPacks.map((pack) => `- \`${pack.label}\` -> plane=${pack.preferredPlane}; bundles=${pack.bundleBias.join(', ') || 'none'}; add-ons=${pack.addOnBias.join(', ') || 'none'}`).join('\n')
    : '- `No stack pack was detected.`'}
`;
}

function buildOperatingCenterPayload(cwd, rootDir, options = {}) {
  const refresh = Boolean(options.refresh);
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, {
    refresh,
    write: refresh,
    writeIfMissing: true,
  });
  const preferredPlanes = repoConfigPayload.activeConfig.preferredPlanes || [];

  const planes = {
    'repo-config': repoConfigPayload,
    'repo-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['repo-control'],
      build: () => buildRepoControlPayload(cwd, rootDir, options),
    }),
    'monorepo-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['monorepo-control'],
      build: () => buildMonorepoControlPayload(cwd, rootDir, options),
    }),
    'frontend-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['frontend-control'],
      build: () => buildFrontendControlPayload(cwd, rootDir, options),
    }),
    'safety-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['safety-control'],
      build: () => buildSafetyControlPayload(cwd, rootDir, options),
    }),
    trust: loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS.trust,
      build: () => buildTrustCenterPayload(cwd, rootDir, options),
    }),
    'release-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['release-control'],
      build: () => buildReleaseControlPayload(cwd, rootDir, options),
    }),
    handoff: loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS.handoff,
      build: () => buildHandoffPayload(cwd, rootDir, options),
    }),
    'team-control': loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS['team-control'],
      build: () => buildTeamControlPayload(cwd, rootDir, options),
    }),
    measure: loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS.measure,
      build: () => buildMeasurePayload(cwd, rootDir, options),
    }),
    explain: loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS.explain,
      build: () => buildExplainPayload(cwd, rootDir, options),
    }),
    lifecycle: loadOrBuildPlane(cwd, rootDir, {
      refresh,
      reportPath: REPORT_PATHS.lifecycle,
      build: () => buildLifecycleCenterPayload(cwd, rootDir, options),
    }),
  };

  planes.autopilot = loadOrBuildPlane(cwd, rootDir, {
    refresh,
    reportPath: REPORT_PATHS.autopilot,
    build: () => buildAutopilotPayload(cwd, rootDir, options),
  });

  const publishContext = {
    repoConfig: repoConfigPayload,
    trustCenter: planes.trust,
    handoff: planes.handoff,
    measurement: planes.measure,
    autopilot: planes.autopilot,
    teamControl: planes['team-control'],
    lifecycle: planes.lifecycle,
  };

  const planeBoard = buildPlaneBoard(planes, preferredPlanes);
  const activePlane = planeBoard[0] || {
    id: 'repo-config',
    title: 'Repo Config',
    question: 'How should this repo behave by default?',
    command: 'rai repo-config --json',
    score: 0,
    status: 'unknown',
    severity: 'low',
    headline: 'n/a',
  };
  const operatorSequence = buildOperatorSequence(planeBoard);
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'operate',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    verdict: overallVerdict(activePlane, planeBoard),
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    stackPacks: repoConfigPayload.stackPacks || [],
    compression: planeCompressionSummary(),
    planeBoard,
    activePlane: {
      ...activePlane,
      question: activePlane.question || planeById(activePlane.id)?.question || '',
    },
    primaryCommand: activePlane.command,
    focusQuestions: buildFocusQuestions(planeBoard),
    operatorSequence,
    blockingSignals: aggregateBlockers(planes),
    continuity: {
      resumeAnchor: planes.handoff?.resumeAnchor || planes.handoff?.nextAction?.command || null,
      handoffVerdict: planes.handoff?.verdict || 'unknown',
      openLoops: planes.handoff?.continuity?.openLoopCount || 0,
      activeWave: planes['team-control']?.runtime?.activeWave || null,
      handoffQueue: planes['team-control']?.handoffQueue?.length || 0,
    },
    publishSurface: {
      githubReady: false,
      ciReady: false,
      slackReady: false,
      coverageRatio: 0,
      bridgeCommand: 'node scripts/workflow/control_plane_publish.js --json',
      externalExports: {},
      applied: null,
    },
    planes: {
      repoConfig: repoConfigPayload,
      repoControl: planes['repo-control'],
      monorepoControl: planes['monorepo-control'],
      frontendControl: planes['frontend-control'],
      safetyControl: planes['safety-control'],
      trust: planes.trust,
      releaseControl: planes['release-control'],
      autopilot: planes.autopilot,
      handoff: planes.handoff,
      teamControl: planes['team-control'],
      measure: planes.measure,
      explain: planes.explain,
      lifecycle: planes.lifecycle,
    },
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'operating-center', payload, renderOperatingCenterMarkdown(payload), { runtimeMirror: true });

  const exportResult = writeControlPlaneExports(cwd, planes['release-control'], {
    context: {
      ...publishContext,
      operatingCenter: payload,
    },
    repoConfig: repoConfigPayload,
    trustCenter: planes.trust,
    handoff: planes.handoff,
    measurement: planes.measure,
    autopilot: planes.autopilot,
    teamControl: planes['team-control'],
    lifecycle: planes.lifecycle,
    operatingCenter: payload,
  });
  let applied = null;
  if (Boolean(options.applyGithubEnv) || Boolean(options['apply-github-env'])) {
    applied = applyGitHubEnvironmentFiles(cwd, planes['release-control'], {
      exportResult,
      context: exportResult.context,
    });
  }
  payload.publishSurface = {
    githubReady: Boolean(exportResult.publishPlan?.github?.ready),
    ciReady: Boolean(exportResult.publishPlan?.ci?.ready),
    slackReady: Boolean(exportResult.publishPlan?.slack?.ready),
    coverageRatio: Number(exportResult.publishPlan?.exportCoverage?.coverageRatio || 0),
    bridgeCommand: 'node scripts/workflow/control_plane_publish.js --json',
    externalExports: exportResult.externalExports,
    applied,
  };
  payload.artifacts = writePlaneArtifacts(cwd, 'operating-center', payload, renderOperatingCenterMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
operate

Usage:
  node scripts/workflow/operate.js [--refresh] [--apply-github-env] [--json]

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --refresh             Recompute the core planes before building the operating center
  --apply-github-env    Append the generated publish bridge outputs to GitHub env files when present
  --json                Print machine-readable output
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
  const payload = buildOperatingCenterPayload(cwd, rootDir, {
    ...args,
    refresh: Boolean(args.refresh),
    applyGithubEnv: Boolean(args.applyGithubEnv) || Boolean(args['apply-github-env']),
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# OPERATING CENTER\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Active plane: \`${payload.activePlane.title}\``);
  console.log(`- Active question: ${payload.activePlane.question}`);
  console.log(`- Primary command: \`${payload.primaryCommand}\``);
  console.log(`- Compression: ${payload.compression.summary}`);
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
  buildOperatingCenterPayload,
};
