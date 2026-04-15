const fs = require('node:fs');
const path = require('node:path');
const { readJsonIfExists } = require('./io/json');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildWorkspaceImpactPayload } = require('./workspace_impact');
const { buildWorkspacePayload } = require('./workspaces_center');
const { buildRepoControlPayload } = require('./repo_control');
const { writePlaneArtifacts, compactList } = require('./control_planes_common');


function scriptsForPackage(cwd, packageId) {
  const manifestPath = packageId === '.'
    ? path.join(cwd, 'package.json')
    : path.join(cwd, packageId, 'package.json');
  const manifest = readJsonIfExists(manifestPath, {});
  return manifest.scripts || {};
}

function dependencyHubs(graph) {
  return (graph.packages || [])
    .filter((pkg) => !(graph.repoShape === 'monorepo' && pkg.id === '.'))
    .map((pkg) => ({
      packageId: pkg.id,
      packageName: pkg.name,
      packagePath: pkg.path,
      dependents: (pkg.dependents || []).length,
      internalDependencies: (pkg.internalDependencies || []).length,
      fileCount: Number(pkg.fileCount || 0),
      hubScore: ((pkg.dependents || []).length * 5) + ((pkg.internalDependencies || []).length * 2) + Math.min(Number(pkg.fileCount || 0), 40),
    }))
    .sort((left, right) => right.hubScore - left.hubScore || left.packageName.localeCompare(right.packageName))
    .slice(0, 8);
}

function leafPackages(graph) {
  return (graph.packages || [])
    .filter((pkg) => !(graph.repoShape === 'monorepo' && pkg.id === '.'))
    .filter((pkg) => (pkg.dependents || []).length === 0)
    .map((pkg) => ({
      packageId: pkg.id,
      packageName: pkg.name,
      packagePath: pkg.path,
      internalDependencies: (pkg.internalDependencies || []).length,
      fileCount: Number(pkg.fileCount || 0),
    }))
    .sort((left, right) => right.fileCount - left.fileCount || left.packageName.localeCompare(right.packageName))
    .slice(0, 8);
}

function orphanPackages(graph) {
  return (graph.packages || [])
    .filter((pkg) => !(graph.repoShape === 'monorepo' && pkg.id === '.'))
    .filter((pkg) => (pkg.dependents || []).length === 0 && (pkg.internalDependencies || []).length === 0 && Number((graph.testsByPackage?.[pkg.id] || []).length || 0) === 0)
    .map((pkg) => ({
      packageId: pkg.id,
      packageName: pkg.name,
      packagePath: pkg.path,
      fileCount: Number(pkg.fileCount || 0),
    }))
    .sort((left, right) => right.fileCount - left.fileCount || left.packageName.localeCompare(right.packageName))
    .slice(0, 8);
}

function rootBottlenecks(cwd, graph, workspaceImpact) {
  const bottlenecks = [];
  const push = (severity, title, detail) => {
    if (!title || bottlenecks.some((entry) => entry.title === title)) {
      return;
    }
    bottlenecks.push({ severity, title, detail });
  };

  const rootPackage = (graph.packages || []).find((pkg) => pkg.id === '.');
  if (rootPackage && Number(rootPackage.fileCount || 0) >= 250) {
    push(
      'high',
      'Heavy root package',
      'The root package owns a large number of files, so Codex sessions should prefer workspace-local scopes over repo-root edits.',
    );
  }
  if (workspaceImpact.blastRadius.verdict === 'repo-wide') {
    push(
      'high',
      'Repo-wide fan-out',
      'The current impact wave reaches most packages, so staged execution and aggressive scoping are required.',
    );
  }
  for (const hub of dependencyHubs(graph).slice(0, 5)) {
    const scripts = scriptsForPackage(cwd, hub.packageId);
    if (hub.dependents >= 3 && !scripts.test && !scripts.typecheck && !scripts.build) {
      push(
        'medium',
        `Weak verification at ${hub.packageName}`,
        `${hub.packageName} fans out to ${hub.dependents} dependents but does not expose an obvious package-local test/typecheck/build script.`,
      );
    }
  }
  return bottlenecks.slice(0, 8);
}

function summarizeCoordination(workspaceImpact, workspacePayload, intelligence) {
  const impactedBoard = workspaceImpact.packageBoard.filter((entry) => entry.impacted);
  const impactedByWorkspace = {};
  for (const row of impactedBoard) {
    const key = row.workspace?.name || 'unmapped';
    impactedByWorkspace[key] = (impactedByWorkspace[key] || 0) + 1;
  }
  const workspacePressure = Object.entries(impactedByWorkspace)
    .map(([name, impactedPackages]) => ({ name, impactedPackages }))
    .sort((left, right) => right.impactedPackages - left.impactedPackages || left.name.localeCompare(right.name));

  return {
    activeName: workspacePayload.activeName,
    activeRoot: workspacePayload.activeRoot,
    workspaceCount: (workspacePayload.workspaces || []).length,
    impactedWorkspaceCount: workspaceImpact.workspaceSummary.impactedWorkspaceCount,
    impactedWorkspaces: workspaceImpact.workspaceSummary.impactedWorkspaces,
    mappedPackageCount: workspaceImpact.workspaceSummary.mappedPackageCount,
    unmappedPackageCount: workspaceImpact.workspaceSummary.unmappedPackageCount,
    unmappedPackages: workspaceImpact.workspaceSummary.unmappedPackages,
    workspacePressure: workspacePressure.slice(0, 8),
    parallelization: {
      mode: workspaceImpact.parallelization.mode,
      recommendedLaneCount: workspaceImpact.parallelization.recommendedLaneCount,
      writeScopes: (intelligence.writeScopes || []).slice(0, 8),
    },
  };
}

function summarizeCampaign(intelligence, workspaceImpact) {
  return {
    waves: workspaceImpact.waves,
    hotspots: (intelligence.hotspots || []).slice(0, 8),
    reviewShards: (intelligence.reviewShards || []).slice(0, 8),
    writeScopes: (intelligence.writeScopes || []).slice(0, 8),
    verifyQueue: (intelligence.verify?.perPackage || []).filter((entry) => (entry.commands || []).length > 0).slice(0, 10),
    rootSmoke: (intelligence.verify?.rootSmoke || []).slice(0, 4),
    performanceLevers: (intelligence.performanceLevers || []).slice(0, 8),
    performanceRisks: (intelligence.performanceRisks || []).slice(0, 8),
  };
}

function buildVerdict(graph, workspaceImpact, coordination, repoControl) {
  if (graph.repoShape !== 'monorepo') {
    return 'single-package';
  }
  if (workspaceImpact.blastRadius.verdict === 'repo-wide') {
    return 'attention-required';
  }
  if (coordination.unmappedPackageCount > 0 && workspaceImpact.blastRadius.impactedPackageCount > 0) {
    return 'attention-required';
  }
  if ((repoControl.hotspots || []).some((entry) => ['critical', 'high'].includes(String(entry.severity || '').toLowerCase()))) {
    return 'guided';
  }
  if (['wide', 'expanding', 'contained'].includes(workspaceImpact.blastRadius.verdict)) {
    return 'guided';
  }
  return 'ready';
}

function buildNextActions(payload) {
  const actions = [];
  const push = (priority, title, command, reason) => {
    if (!command || actions.some((entry) => entry.command === command)) {
      return;
    }
    actions.push({ priority, title, command, reason });
  };

  if (payload.verdict === 'attention-required') {
    push(
      'high',
      'Run the staged monorepo mode',
      'rai monorepo-mode --json',
      'The current impact or ownership shape is wide enough that staged mapping and patch planning should come first.',
    );
  }
  if (payload.coordination.unmappedPackageCount > 0) {
    push(
      'high',
      'Normalize workspace ownership',
      'rai workspaces --json',
      'Explicit workspace ownership makes large-repo handoff and coordination much safer.',
    );
  }
  if (payload.campaign.waves[0]?.packages?.length > 0) {
    push(
      'high',
      `Open the ${payload.campaign.waves[0].label.toLowerCase()}`,
      'rai workspace-impact --json',
      'Use the current impact report as the exact boundary for the next development wave.',
    );
  }
  if (payload.coordination.parallelization.mode === 'bounded-parallel') {
    push(
      'medium',
      'Coordinate bounded parallel lanes',
      'rai team-control --json',
      'Multiple workspaces or fan-out layers are active, so bounded parallel execution should be visible.',
    );
  }
  push(
    'medium',
    'Refresh repo-wide hotspot posture',
    'rai repo-control --json',
    'Keep monorepo planning anchored to the repo-wide risk and hotspot board.',
  );
  push(
    'medium',
    'Build a native Codex operator packet',
    `rai codex operator --goal ${JSON.stringify(`stabilize ${payload.campaign.hotspots[0]?.packageName || 'the active monorepo wave'} with explicit workspace boundaries`)} --json`,
    'Turn the top monorepo wave into a native Codex operating packet before edits begin.',
  );
  push(
    'low',
    'Materialize a cockpit for the current monorepo wave',
    `rai codex cockpit --goal ${JSON.stringify('stabilize the current monorepo wave with bounded workspaces and explicit verification')} --json`,
    'Use the cockpit when the monorepo lane should be relaunchable and continuity-safe.',
  );
  return actions.slice(0, 8);
}

function renderMonorepoControlMarkdown(payload) {
  return `# MONOREPO CONTROL ROOM

- Verdict: \`${payload.verdict}\`
- Repo shape: \`${payload.repoShape}\`
- Packages: \`${payload.monorepo.packageCount}\`
- Changed packages: \`${payload.blastRadius.changedPackageCount}\`
- Impacted packages: \`${payload.blastRadius.impactedPackageCount}\`
- Impacted workspaces: \`${payload.coordination.impactedWorkspaceCount}\`
- Blast radius: \`${payload.blastRadius.verdict}\`
- Repo health: \`${payload.repoHealth.verdict}\` (score=${payload.repoHealth.score})

## Dependency Hubs

${payload.topology.dependencyHubs.length > 0
    ? payload.topology.dependencyHubs.map((hub) => `- \`${hub.packageName}\` -> dependents=${hub.dependents} internalDeps=${hub.internalDependencies} files=${hub.fileCount}`).join('\n')
    : '- `No dependency hubs were detected.`'}

## Development Waves

${payload.campaign.waves.length > 0
    ? payload.campaign.waves.map((wave) => `- ${wave.label} -> packages=${wave.packageCount || wave.packages.length} workspaces=${wave.workspaceNames.join(', ') || 'n/a'} verify=${wave.verifyCommands.join(' | ') || 'n/a'}`).join('\n')
    : '- `No development wave is available yet.`'}

## Coordination

- Active workspace: \`${payload.coordination.activeName}\` -> \`${payload.coordination.activeRoot}\`
- Workspace count: \`${payload.coordination.workspaceCount}\`
- Unmapped packages: \`${payload.coordination.unmappedPackageCount}\`
- Parallelization mode: \`${payload.coordination.parallelization.mode}\`
- Recommended lanes: \`${payload.coordination.parallelization.recommendedLaneCount}\`

## Root Bottlenecks

${payload.topology.rootBottlenecks.length > 0
    ? payload.topology.rootBottlenecks.map((entry) => `- [${entry.severity}] ${entry.title}: ${entry.detail}`).join('\n')
    : '- `No root bottleneck is currently active.`'}

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((entry) => `- [${entry.priority}] ${entry.title}${entry.command ? ` -> \`${entry.command}\`` : ''}`).join('\n')
    : '- `No next action is queued.`'}

## Codex Native Layer

- Operator: \`${payload.codex.operatorCommand}\`
- Cockpit: \`${payload.codex.cockpitCommand}\`
- Telemetry: \`${payload.codex.telemetryCommand}\`
- Skills: \`${payload.codex.skills.join(', ')}\`
`;
}

function buildMonorepoControlPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, {
    refresh: Boolean(options.refresh),
    write: Boolean(options.refresh),
    writeIfMissing: true,
  });
  const workspaceImpact = buildWorkspaceImpactPayload(cwd, rootDir, {
    ...options,
    writeArtifacts: false,
  });
  const intelligence = buildMonorepoIntelligence(cwd, rootDir, {
    writeFiles: true,
    changedFiles: workspaceImpact.changeSet.changedFiles,
    maxWorkers: options['max-workers'],
  });
  const graph = {
    repoShape: intelligence.repoShape,
    packageCount: intelligence.packageCount,
    changedPackages: intelligence.changedPackages,
    impactedPackages: intelligence.impactedPackages,
    impactedTests: intelligence.impactedTests,
    packages: (readJsonIfExists(path.join(cwd, '.workflow', 'cache', 'package-graph.json'), {}).packages || []),
    testsByPackage: readJsonIfExists(path.join(cwd, '.workflow', 'cache', 'package-graph.json'), {}).testsByPackage || {},
  };
  const workspacePayload = buildWorkspacePayload(cwd);
  const repoControl = buildRepoControlPayload(cwd, rootDir, options);
  const topology = {
    dependencyHubs: dependencyHubs(graph),
    leafPackages: leafPackages(graph),
    orphanPackages: orphanPackages(graph),
    rootBottlenecks: rootBottlenecks(cwd, graph, workspaceImpact),
  };
  const coordination = summarizeCoordination(workspaceImpact, workspacePayload, intelligence);
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'monorepo-control',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    repoShape: intelligence.repoShape,
    monorepo: {
      packageCount: intelligence.packageCount,
      changedPackages: intelligence.changedPackages,
      impactedPackages: intelligence.impactedPackages,
      impactedTests: intelligence.impactedTests,
      workspaceSources: intelligence.workspaceDiscovery?.sources || [],
      packageManager: intelligence.verify?.manager || 'unknown',
    },
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    blastRadius: workspaceImpact.blastRadius,
    workspaceImpact: {
      changeSet: workspaceImpact.changeSet,
      packageBoard: workspaceImpact.packageBoard.slice(0, 12),
      workspaceSummary: workspaceImpact.workspaceSummary,
      parallelization: workspaceImpact.parallelization,
    },
    topology,
    coordination,
    campaign: summarizeCampaign(intelligence, workspaceImpact),
    repoHealth: repoControl.repoHealth,
    hotspots: repoControl.hotspots,
    commands: {
      workspaceImpact: 'rai workspace-impact --json',
      monorepo: 'rai monorepo --json',
      monorepoMode: 'rai monorepo-mode --json',
      repoControl: 'rai repo-control --json',
      reviewOrchestrate: 'rai review-orchestrate --json',
      reviewTasks: 'rai review-tasks --json',
      workspaces: 'rai workspaces --json',
      teamControl: 'rai team-control --json',
      codexOperator: 'rai codex operator --goal "stabilize the current monorepo wave" --json',
      codexCockpit: 'rai codex cockpit --goal "stabilize the current monorepo wave" --json',
      codexTelemetry: 'rai codex telemetry --json',
    },
    nextActions: [],
    codex: {
      suggestedGoal: `stabilize ${workspaceImpact.packageBoard[0]?.packageName || intelligence.hotspots?.[0]?.packageName || 'the current monorepo wave'} with bounded workspaces and explicit verification`,
      operatorCommand: `rai codex operator --goal ${JSON.stringify(`stabilize ${workspaceImpact.packageBoard[0]?.packageName || intelligence.hotspots?.[0]?.packageName || 'the current monorepo wave'} with bounded workspaces and explicit verification`)} --json`,
      cockpitCommand: `rai codex cockpit --goal ${JSON.stringify('stabilize the current monorepo wave with bounded workspaces and explicit verification')} --json`,
      telemetryCommand: 'rai codex telemetry --json',
      skills: ['raiola-monorepo-control-room', 'raiola-workspace-impact-planner', 'raiola-large-repo-optimizer', 'raiola-native-operator', 'raiola-codex-cockpit'],
    },
    artifacts: null,
  };
  payload.verdict = buildVerdict(graph, workspaceImpact, coordination, repoControl);
  payload.nextActions = buildNextActions(payload);
  payload.artifacts = writePlaneArtifacts(cwd, 'monorepo-control-room', payload, renderMonorepoControlMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
monorepo_control

Usage:
  node scripts/workflow/monorepo_control.js [--refresh] [--base <ref>] [--json]

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --refresh             Recompute control-room inputs before rendering
  --base <ref>          Compare a git base ref for workspace-impact generation
  --head <ref>          Git head ref used with --base (default: HEAD)
  --max-workers <n>     Maximum write shards to pull from monorepo intelligence
  --json                Print machine-readable output
  `);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildMonorepoControlPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# MONOREPO CONTROL ROOM\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Blast radius: \`${payload.blastRadius.verdict}\``);
  console.log(`- Impacted packages: \`${payload.blastRadius.impactedPackageCount}\``);
  console.log(`- Workspaces: \`${payload.coordination.workspaceCount}\``);
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
  buildMonorepoControlPayload,
};
