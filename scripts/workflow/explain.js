const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildDoPayload } = require('./do');
const { buildStartPlan } = require('./workflow_bundles');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { latestBrowserArtifacts } = require('./frontend_os');
const { readJson, compactList, countBy, writePlaneArtifacts } = require('./control_planes_common');

function flattenCommands(plan) {
  return (plan?.phases || []).flatMap((phase) => (phase.commands || []).map((command) => command.cli));
}

function inferGoal(cwd, inputGoal) {
  if (String(inputGoal || '').trim()) {
    return String(inputGoal).trim();
  }
  const latestDo = readJson(path.join(cwd, '.workflow', 'runtime', 'do-latest.json'), null);
  if (latestDo?.goal) {
    return latestDo.goal;
  }
  const latestStart = readJson(path.join(cwd, '.workflow', 'runtime', 'start-plan.json'), null);
  if (latestStart?.goal) {
    return latestStart.goal;
  }
  return 'understand the current repo and pick the next safe lane';
}

function percent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function normalizeConfidence(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) {
      return Number((value * 100).toFixed(1));
    }
    if (value >= 0 && value <= 100) {
      return Number(value.toFixed(1));
    }
  }
  const normalized = String(value || '').trim().toLowerCase();
  const numeric = Number.parseFloat(normalized);
  if (Number.isFinite(numeric)) {
    return normalizeConfidence(numeric);
  }
  if (normalized === 'high') {
    return 85;
  }
  if (normalized === 'medium') {
    return 65;
  }
  if (normalized === 'low') {
    return 45;
  }
  return null;
}

function confidenceTier(score) {
  if (score == null) {
    return 'unknown';
  }
  if (score >= 80) {
    return 'high';
  }
  if (score >= 60) {
    return 'medium';
  }
  return 'low';
}

function artifactSurfaceEntries(cwd, route) {
  const browserArtifacts = latestBrowserArtifacts(cwd);
  const frontendExpected = Boolean(route.frontendStart?.frontend || route.repoSignals?.frontendActive);
  return [
    {
      id: 'repo-config',
      label: 'repo-config',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'repo-config.json'), null)),
      path: '.workflow/repo-config.json',
      why: 'Repo-native defaults explain why the lane and bundle were biased a certain way.',
      command: 'rai repo-config --write --json',
    },
    {
      id: 'trust-center',
      label: 'trust-center',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'trust-center.json'), null)),
      path: '.workflow/reports/trust-center.json',
      why: 'Trust signals explain whether the chosen lane is safe enough to start, merge, or ship.',
      command: 'rai trust --json',
    },
    {
      id: 'verify-work',
      label: 'verify-work',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'verify-work.json'), null)),
      path: '.workflow/reports/verify-work.json',
      why: 'Verification evidence makes the lane recommendation more defensible.',
      command: 'rai verify-work --json',
    },
    {
      id: 'ship-readiness',
      label: 'ship-readiness',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'ship-readiness.json'), null)),
      path: '.workflow/reports/ship-readiness.json',
      why: 'Ship-readiness explains which closeout or release signals were already available.',
      command: 'rai ship-readiness --json',
    },
    {
      id: 'change-control',
      label: 'change-control',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null)),
      path: '.workflow/reports/change-control.json',
      why: 'Change Control closes the loop between routing, trust, verify, and release exports.',
      command: 'rai release-control --json',
    },
    {
      id: 'handoff-os',
      label: 'handoff-os',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'handoff-os.json'), null)),
      path: '.workflow/reports/handoff-os.json',
      why: 'Continuity artifacts reveal whether the selected lane already has a resumable context pack.',
      command: 'rai handoff --json',
    },
    {
      id: 'team-control-room',
      label: 'team-control-room',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'team-control-room.json'), null)),
      path: '.workflow/reports/team-control-room.json',
      why: 'Parallel ownership and queue signals affect deeper or wider execution recommendations.',
      command: 'rai team-control --json',
    },
    {
      id: 'measurement',
      label: 'measurement',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'measurement.json'), null)),
      path: '.workflow/reports/measurement.json',
      why: 'ROI and pass-rate metrics make confidence more explainable than a single scalar.',
      command: 'rai measure --json',
    },
    {
      id: 'lifecycle-center',
      label: 'lifecycle-center',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'reports', 'lifecycle-center.json'), null)),
      path: '.workflow/reports/lifecycle-center.json',
      why: 'Install or runtime drift can change how trustworthy the route is.',
      command: 'rai lifecycle --json',
    },
    {
      id: 'evidence-graph',
      label: 'evidence-graph',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'evidence-graph', 'latest.json'), null)),
      path: '.workflow/evidence-graph/latest.json',
      why: 'Evidence coverage affects both trust and explainability.',
      command: 'rai evidence --json',
    },
    {
      id: 'export-manifest',
      label: 'export-manifest',
      present: Boolean(readJson(path.join(cwd, '.workflow', 'exports', 'export-manifest.json'), null)),
      path: '.workflow/exports/export-manifest.json',
      why: 'Publish coverage explains whether the repo-native operating surface is actually being emitted.',
      command: 'rai release-control --json',
    },
    frontendExpected ? {
      id: 'browser-proof',
      label: 'browser-proof',
      present: browserArtifacts.length > 0,
      path: browserArtifacts[0]?.path || '.workflow/verifications/browser/*',
      why: 'Frontend-active routes should usually include browser evidence before high-confidence closeout.',
      command: 'rai verify-browser --url http://localhost:3000 --json',
    } : null,
  ].filter(Boolean);
}

function buildSignalList(route, repoConfigSummary, start) {
  return compactList([
    ...((route.routeRationale || []).map((item) => `route:${item}`)),
    ...((repoConfigSummary.detectedProfiles || []).map((item) => `repo-profile:${item}`)),
    route.repoSignals?.monorepo ? `repo-signal:monorepo(${route.repoSignals.packageCount || 0})` : '',
    route.repoSignals?.frontendActive ? `repo-signal:frontend(${route.repoSignals.frontendFramework || 'active'})` : '',
    route.commandPlan?.bundleHint?.reason ? `bundle-hint:${route.commandPlan.bundleHint.reason}` : '',
    route.commandPlan?.bundleLabel ? `bundle:${route.commandPlan.bundleLabel}` : route.commandPlan?.bundleId ? `bundle:${route.commandPlan.bundleId}` : '',
    start.selectionReason ? `start-selection:${start.selectionReason}` : '',
    repoConfigSummary.defaultProfile ? `repo-default-profile:${repoConfigSummary.defaultProfile}` : '',
    repoConfigSummary.trustLevel ? `repo-trust:${repoConfigSummary.trustLevel}` : '',
    (repoConfigSummary.preferredBundles || []).includes(start.bundle?.id) ? `repo-preference:bundle(${start.bundle.id})` : '',
  ], 20);
}

function bucketName(signal) {
  const normalized = String(signal || '').trim();
  const index = normalized.indexOf(':');
  return index === -1 ? 'other' : normalized.slice(0, index);
}

function surfaceCommand(surfaceId, goal) {
  if (surfaceId === 'browser-proof') {
    return 'rai verify-browser --url http://localhost:3000 --json';
  }
  if (surfaceId === 'change-control' || surfaceId === 'export-manifest') {
    return 'rai release-control --json';
  }
  if (surfaceId === 'trust-center') {
    return 'rai trust --json';
  }
  if (surfaceId === 'verify-work') {
    return 'rai verify-work --json';
  }
  if (surfaceId === 'ship-readiness') {
    return 'rai ship-readiness --json';
  }
  if (surfaceId === 'handoff-os') {
    return 'rai handoff --json';
  }
  if (surfaceId === 'team-control-room') {
    return 'rai team-control --json';
  }
  if (surfaceId === 'measurement') {
    return 'rai measure --json';
  }
  if (surfaceId === 'lifecycle-center') {
    return 'rai lifecycle --json';
  }
  if (surfaceId === 'evidence-graph') {
    return 'rai evidence --json';
  }
  if (surfaceId === 'repo-config') {
    return 'rai repo-config --write --json';
  }
  return goal ? `rai do --goal ${JSON.stringify(goal)} --json` : 'rai do --json';
}

function buildConfidenceBreakdown(route, start, repoConfigSummary, coverage, signals) {
  const routeScore = normalizeConfidence(route.confidence);
  const bundleId = start.bundle?.id || null;
  const commandPlanBundle = route.commandPlan?.startBundleId || route.commandPlan?.bundleId || null;
  const bundleAlignment = bundleId && commandPlanBundle
    ? (bundleId === commandPlanBundle ? 100 : 65)
    : bundleId
      ? 70
      : 50;
  const profileAlignment = repoConfigSummary.defaultProfile && start.profile?.id
    ? (repoConfigSummary.defaultProfile === start.profile.id ? 100 : 65)
    : 60;
  const repoPreferenceAlignment = bundleId && Array.isArray(repoConfigSummary.preferredBundles) && repoConfigSummary.preferredBundles.length > 0
    ? (repoConfigSummary.preferredBundles.includes(bundleId) ? 100 : 70)
    : 75;
  const signalStrength = Math.min(100, Math.max(35, (signals.length * 12.5)));
  const components = [routeScore, bundleAlignment, profileAlignment, repoPreferenceAlignment, coverage.ratio, signalStrength]
    .filter((entry) => typeof entry === 'number' && Number.isFinite(entry));
  const overall = components.length > 0
    ? Number((components.reduce((sum, entry) => sum + entry, 0) / components.length).toFixed(1))
    : null;
  return {
    overall,
    tier: confidenceTier(overall),
    routeConfidence: routeScore,
    bundleAlignment,
    profileAlignment,
    repoPreferenceAlignment,
    surfaceCoverage: coverage.ratio,
    signalStrength,
    sampledSignals: signals.slice(0, 6),
  };
}

function buildNextSteps(goal, unsurveyedEntries = [], deepMode = {}) {
  const suggestions = [];
  const push = (title, command, reason) => {
    if (!title || suggestions.some((entry) => entry.command === command && entry.title === title)) {
      return;
    }
    suggestions.push({ title, command, reason });
  };

  for (const surface of unsurveyedEntries.slice(0, 6)) {
    push(
      `Survey ${surface.label}`,
      surface.command || surfaceCommand(surface.id, goal),
      surface.why || `${surface.label} has not been captured yet.`,
    );
  }

  if ((deepMode.addedCommands || []).length > 0) {
    push(
      'Expand into deep mode',
      `rai start recommend --goal ${JSON.stringify(goal)} --profile deep --json`,
      `${deepMode.addedCommands.length} more command(s) become available in deep mode.`,
    );
  }

  return suggestions.slice(0, 8);
}

function renderExplainMarkdown(payload) {
  return `# EXPLAINABILITY

- Goal: \`${payload.goal}\`
- Lane: \`${payload.route.lane}\`
- Bundle: \`${payload.start.bundle.id}\`
- Confidence: \`${payload.route.confidence}\` -> overall=\`${payload.confidenceBreakdown.overall ?? 'n/a'}\` / tier=\`${payload.confidenceBreakdown.tier}\`
- Surface coverage: \`${payload.surfaceCoverage.surveyed}/${payload.surfaceCoverage.expected}\` (\`${payload.surfaceCoverage.ratio}\`%)
- Why this lane: ${payload.whyLane}

## Why This Bundle

${payload.whyBundle}

## Confidence Breakdown

- Route confidence: \`${payload.confidenceBreakdown.routeConfidence ?? 'n/a'}\`
- Bundle alignment: \`${payload.confidenceBreakdown.bundleAlignment}\`
- Profile alignment: \`${payload.confidenceBreakdown.profileAlignment}\`
- Repo preference alignment: \`${payload.confidenceBreakdown.repoPreferenceAlignment}\`
- Surface coverage: \`${payload.confidenceBreakdown.surfaceCoverage}\`
- Signal strength: \`${payload.confidenceBreakdown.signalStrength}\`

## Dominant Signals

${payload.signals.length > 0
    ? payload.signals.map((item) => `- ${item}`).join('\n')
    : '- `No dominant signals were captured.`'}

## Surface Coverage

- Surveyed: \`${payload.surfaceCoverage.surveyed}\`
- Expected: \`${payload.surfaceCoverage.expected}\`
- Coverage ratio: \`${payload.surfaceCoverage.ratio}\`%
- Signal buckets: \`${Object.entries(payload.signalBuckets).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'}\`

### Surveyed Surfaces

${payload.surfaceCoverage.surveyedSurfaces.length > 0
    ? payload.surfaceCoverage.surveyedSurfaces.map((item) => `- \`${item.label}\` -> \`${item.path}\``).join('\n')
    : '- `No surveyed surface was recorded.`'}

### Unsurveyed Surfaces

${payload.unsurveyedSurfaces.length > 0
    ? payload.unsurveyedSurfaces.map((item) => `- ${item}`).join('\n')
    : '- `The main control surfaces already have artifacts.`'}

## Deep Mode Delta

- Baseline profile: \`${payload.start.profile.id}\`
- Deep profile: \`${payload.deepMode.profile.id}\`
- Added commands: \`${payload.deepMode.addedCommands.length}\`
- Added phases: \`${payload.deepMode.addedPhases.length}\`

${payload.deepMode.addedCommands.length > 0
    ? payload.deepMode.addedCommands.map((item) => `- \`${item}\``).join('\n')
    : '- `Deep mode would not add commands beyond the current plan.`'}

## Next Steps To Raise Confidence

${payload.nextSteps.length > 0
    ? payload.nextSteps.map((item) => `- ${item.title} -> \`${item.command}\``).join('\n')
    : '- `No explainability follow-up is currently queued.`'}
`;
}

function buildExplainPayload(cwd, rootDir, options = {}) {
  const goal = inferGoal(cwd, options.goal);
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const route = buildDoPayload(cwd, rootDir, goal);
  const start = buildStartPlan(cwd, rootDir, { goal });
  const deepStart = buildStartPlan(cwd, rootDir, { goal, profileId: 'deep' });
  const baselineCommands = flattenCommands(start);
  const deepCommands = flattenCommands(deepStart);
  const addedCommands = deepCommands.filter((command) => !baselineCommands.includes(command));
  const repoConfigSummary = summarizeRepoConfig(repoConfigPayload);
  const surfaces = artifactSurfaceEntries(cwd, route);
  const surveyedSurfaces = surfaces.filter((entry) => entry.present);
  const unsurveyedSurfaceEntries = surfaces.filter((entry) => !entry.present);
  const surfaceCoverage = {
    expected: surfaces.length,
    surveyed: surveyedSurfaces.length,
    ratio: percent(surveyedSurfaces.length, surfaces.length || 1),
    surveyedSurfaces: surveyedSurfaces.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
    })),
    unsurveyedSurfaceDetails: unsurveyedSurfaceEntries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
      why: entry.why,
      command: entry.command || surfaceCommand(entry.id, goal),
    })),
  };
  const signals = buildSignalList(route, repoConfigSummary, start);
  const signalBuckets = countBy(signals.map((item) => bucketName(item)));
  const deepMode = {
    profile: deepStart.profile,
    addedCommands: addedCommands.slice(0, 20),
    addedPhases: (deepStart.phases || [])
      .filter((phase) => !(start.phases || []).some((item) => item.id === phase.id))
      .map((phase) => phase.label),
    operatorTips: deepStart.operatorTips,
  };
  const confidenceBreakdown = buildConfidenceBreakdown(route, start, repoConfigSummary, surfaceCoverage, signals);
  const nextSteps = buildNextSteps(goal, surfaceCoverage.unsurveyedSurfaceDetails, deepMode);
  const unsurveyedSurfaces = compactList(surfaceCoverage.unsurveyedSurfaceDetails
    .map((entry) => `${entry.label} is missing -> run ${entry.command}`), 16);

  const payload = {
    reasoningTrace: {
      '@context': 'https://raiola.dev/schemas/explain-trace-v1',
      type: 'ExplainTrace',
      goal,
      lane: route.lane,
      bundle: start.bundle.id,
      confidence: route.confidence,
      signals,
      missingSurfaces: surfaceCoverage.unsurveyedSurfaceDetails.map((entry) => entry.id),
      recommendedCommands: nextSteps.map((step) => step.command),
    },
    generatedAt: new Date().toISOString(),
    action: 'explain',
    goal,
    repoConfig: repoConfigSummary,
    explainabilityDefaults: repoConfigSummary.explainability || {},
    route: {
      lane: route.lane,
      capability: route.capability,
      confidence: route.confidence,
      profile: route.profile,
      commandPlan: route.commandPlan,
    },
    start: {
      bundle: start.bundle,
      profile: start.profile,
      addOns: start.addOns,
      selectionReason: start.selectionReason,
      operatorTips: start.operatorTips,
    },
    whyLane: route.routeRationale?.[0] || `Route confidence ${route.confidence} favored ${route.lane}.`,
    whyBundle: start.bundle.summary || `The ${start.bundle.label} bundle best matched the current route and repo signals.`,
    signals,
    signalBuckets,
    surfaceCoverage,
    unsurveyedSurfaces,
    confidenceBreakdown,
    deepMode,
    nextSteps,
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'explainability', payload, renderExplainMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
explain

Usage:
  node scripts/workflow/explain.js [--goal <text>] [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --goal <text>       Optional goal to explain; falls back to the latest routed goal
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
  const payload = buildExplainPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# EXPLAIN\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Lane: \`${payload.route.lane}\``);
  console.log(`- Bundle: \`${payload.start.bundle.id}\``);
  console.log(`- Confidence: \`${payload.route.confidence}\``);
  console.log(`- Surface coverage: \`${payload.surfaceCoverage.ratio}\`%`);
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
  buildExplainPayload,
};
