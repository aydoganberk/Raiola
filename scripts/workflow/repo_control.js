const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { buildWorkspacePayload } = require('./workspaces_center');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildFrontendProfile } = require('./map_frontend');
const { runRepoAudit } = require('./repo_audit_engine');
const { compactList, readJson, writePlaneArtifacts } = require('./control_planes_common');

function repoAuditReportPath(cwd) {
  return path.join(cwd, '.workflow', 'reports', 'repo-audit.json');
}

function safeFrontendProfile(cwd, rootDir) {
  try {
    return buildFrontendProfile(cwd, rootDir, {
      scope: 'repo',
      refresh: 'incremental',
    });
  } catch {
    return null;
  }
}

function frontendSummary(profile) {
  if (!profile) {
    return {
      active: false,
      detected: false,
      framework: 'unknown',
      uiSystem: 'unknown',
      routeCount: 0,
      routeFamilies: 0,
      sharedComponents: 0,
      localComponents: 0,
      productSurface: 'unknown',
      interactionModel: 'unknown',
      sampleRoutes: [],
      sampleSharedComponents: [],
    };
  }

  const routeCount = Number(profile.surfaceInventory?.routeCount || 0);
  const sharedComponents = Number(profile.surfaceInventory?.sharedComponentCount || 0);
  const localComponents = Number(profile.surfaceInventory?.localComponentCount || 0);
  const detected = Boolean(
    profile.frontendMode?.active
      || routeCount > 0
      || sharedComponents > 0
      || localComponents > 0
      || (profile.framework?.primary && profile.framework.primary !== 'Custom')
      || (profile.uiSystem?.primary && profile.uiSystem.primary !== 'custom')
      || profile.fileSignals?.componentsJson
  );

  return {
    active: Boolean(profile.frontendMode?.active),
    detected,
    framework: profile.framework?.primary || 'unknown',
    uiSystem: profile.uiSystem?.primary || 'unknown',
    routeCount,
    routeFamilies: Number(profile.surfaceInventory?.routeFamilyCount || 0),
    sharedComponents,
    localComponents,
    productSurface: profile.productSurface?.label || profile.productSurface?.id || 'unknown',
    interactionModel: profile.interactionModel?.label || profile.interactionModel?.primary || 'unknown',
    sampleRoutes: (profile.surfaceInventory?.sampleRoutes || []).slice(0, 6),
    sampleSharedComponents: (profile.surfaceInventory?.sampleSharedComponents || []).slice(0, 6),
  };
}

function findingCounts(findings = {}) {
  const verified = Number((findings.verified || []).length || 0);
  const probable = Number((findings.probable || []).length || 0);
  const heuristic = Number((findings.heuristic || []).length || 0);
  return {
    verified,
    probable,
    heuristic,
    total: verified + probable + heuristic,
  };
}

function summarizePackages(graph = {}) {
  return (graph.packages || [])
    .map((pkg) => ({
      name: pkg.name,
      path: pkg.path,
      fileCount: Number(pkg.fileCount || 0),
      internalDependencies: (pkg.internalDependencies || []).length,
      dependents: (pkg.dependents || []).length,
      changed: (graph.changedPackages || []).includes(pkg.name) || (graph.changedPackages || []).includes(pkg.path),
      impacted: (graph.impactedPackages || []).includes(pkg.name) || (graph.impactedPackages || []).includes(pkg.path),
    }))
    .sort((left, right) => {
      const leftScore = (left.impacted ? 200 : 0) + (left.changed ? 100 : 0) + left.dependents + left.internalDependencies + left.fileCount;
      const rightScore = (right.impacted ? 200 : 0) + (right.changed ? 100 : 0) + right.dependents + right.internalDependencies + right.fileCount;
      return rightScore - leftScore || left.name.localeCompare(right.name);
    })
    .slice(0, 10);
}

function summarizeHotspots(audit = {}) {
  return (audit.subsystemHeatmap || [])
    .slice(0, 8)
    .map((entry) => ({
      area: entry.area,
      severity: entry.severity,
      riskScore: Number(entry.riskScore || 0),
      sourceFiles: Number(entry.sourceFiles || 0),
      testFiles: Number(entry.testFiles || 0),
      dependentCount: Number(entry.dependentCount || 0),
      testStatus: entry.testStatus || 'unknown',
      readFirst: (entry.readFirst || []).slice(0, 5),
      drivers: (entry.drivers || []).slice(0, 5),
      tags: (entry.tags || []).slice(0, 6),
    }));
}

function repoHealthSummary(audit = {}) {
  const counts = findingCounts(audit.findings || {});
  return {
    score: Number(audit.repoHealth?.score || 0),
    verdict: audit.repoHealth?.verdict || 'unknown',
    findingCounts: counts,
    stackPack: audit.stackPack?.label || audit.stackPack?.id || 'unknown',
    workflowObservations: (audit.workflowObservations || []).slice(0, 8),
    correctionPlanCount: (audit.correctionPlan || []).length,
    suggestedPassOrder: (audit.suggestedPassOrder || []).slice(0, 6),
  };
}

function loadOrBuildRepoAudit(cwd, options = {}) {
  const existing = !options.refresh
    ? readJson(repoAuditReportPath(cwd), null)
    : null;
  if (existing) {
    return {
      payload: existing,
      source: 'report-cache',
      refreshed: false,
    };
  }
  return {
    payload: runRepoAudit(cwd, {
      goal: String(options.goal || 'audit the repository and rank the highest-risk surfaces').trim(),
      mode: 'oneshot',
      refresh: options.refresh ? 'full' : 'incremental',
      writeArtifacts: true,
    }),
    source: 'fresh',
    refreshed: true,
  };
}

function buildNextActions(payload) {
  const actions = [];
  const push = (priority, title, command, reason) => {
    if (!command || actions.some((item) => item.command === command)) {
      return;
    }
    actions.push({ priority, title, command, reason });
  };

  const topHotspot = payload.hotspots[0] || null;
  if (topHotspot && ['critical', 'high'].includes(String(topHotspot.severity || '').toLowerCase())) {
    push(
      'high',
      `Deep-review ${topHotspot.area}`,
      `rai review-mode --goal ${JSON.stringify(`deep review ${topHotspot.area}`)} --json`,
      'The hottest subsystem should become the next bounded review wave before edits spread further.',
    );
  }
  if (payload.repoHealth.findingCounts.total > 0) {
    push(
      'high',
      'Refresh the full repo audit',
      'rai audit-repo --mode oneshot --json',
      'Use the native audit surface whenever findings or hotspots need a fresh ranking.',
    );
  }
  if (payload.packageGraph.repoShape === 'monorepo' || payload.packageGraph.packageCount > 1) {
    push(
      'high',
      'Open the monorepo control room',
      'rai monorepo-control --json',
      'Large multi-package repos benefit from an explicit monorepo plane before the work is widened across many packages.',
    );
    push(
      'high',
      'Open the staged monorepo lane',
      'rai monorepo-mode --json',
      'Multi-package repos benefit from package-aware review, correction planning, and verify discipline.',
    );
  }
  if (payload.frontend.detected) {
    push(
      'medium',
      'Open the frontend control room',
      'rai frontend-control --json',
      'This repo has a meaningful frontend surface, so UI evidence and design debt should stay visible beside repo health.',
    );
  }
  if (payload.workspaces.count > 0) {
    push(
      'medium',
      'Inspect workspace ownership and status',
      'rai workspaces --json',
      'Use the workspace registry to keep active roots, milestones, and workstream health explicit.',
    );
  }
  push(
    'medium',
    'Generate the Codex repo operator packet',
    `rai codex operator --goal ${JSON.stringify(`run repo-control on the highest-risk surfaces in ${payload.packageGraph.repoShape} mode`)} --json`,
    'Repo control becomes stronger when Codex starts with the ranked hotspots, repo shape, and workstream context already encoded.',
  );
  push(
    'low',
    'Materialize a runnable Codex cockpit',
    `rai codex cockpit --goal ${JSON.stringify('stabilize the repo-control follow-through for this repository')} --json`,
    'Use the cockpit when the repo-control session should be relaunchable and continuity-safe.',
  );
  return actions.slice(0, 8);
}

function buildVerdict(repoHealth = {}, packageGraph = {}, frontend = {}) {
  if (['critical', 'at_risk'].includes(String(repoHealth.verdict || '').toLowerCase())) {
    return 'attention-required';
  }
  if ((repoHealth.findingCounts?.total || 0) > 0 || packageGraph.repoShape === 'monorepo' || frontend.detected) {
    return 'guided';
  }
  return 'clear';
}

function renderRepoControlMarkdown(payload) {
  return `# REPO CONTROL ROOM

- Verdict: \`${payload.verdict}\`
- Repo shape: \`${payload.packageGraph.repoShape}\`
- Packages: \`${payload.packageGraph.packageCount}\`
- Changed packages: \`${payload.packageGraph.changedPackages.length}\`
- Impacted packages: \`${payload.packageGraph.impactedPackages.length}\`
- Workspaces tracked: \`${payload.workspaces.count}\`
- Repo health: \`${payload.repoHealth.verdict}\` (score=${payload.repoHealth.score})
- Frontend detected: \`${payload.frontend.detected ? 'yes' : 'no'}\`
- Audit source: \`${payload.repoAudit.source}\`
- Monorepo control: \`${payload.commands.monorepoControl}\`

## Package Board

${payload.packageBoard.length > 0
    ? payload.packageBoard.map((pkg) => `- \`${pkg.name}\` -> files=${pkg.fileCount} changed=${pkg.changed ? 'yes' : 'no'} impacted=${pkg.impacted ? 'yes' : 'no'} dependents=${pkg.dependents}`).join('\n')
    : '- `No package graph rows were detected.`'}

## Repo Hotspots

${payload.hotspots.length > 0
    ? payload.hotspots.map((entry) => `- [${entry.severity}] \`${entry.area}\` score=${entry.riskScore} files=${entry.sourceFiles} tests=${entry.testFiles} read=${entry.readFirst.join(', ') || 'n/a'}`).join('\n')
    : '- `No hotspot heatmap is available yet.`'}

## Workspace Registry

${payload.workspaces.items.length > 0
    ? payload.workspaces.items.map((workspace) => `- \`${workspace.name}\` -> status=${workspace.status} milestone=${workspace.currentMilestone || 'n/a'} root=${workspace.root}`).join('\n')
    : '- `No explicit workspaces are tracked yet.`'}

## Frontend Signal

- Framework: \`${payload.frontend.framework}\`
- UI system: \`${payload.frontend.uiSystem}\`
- Routes: \`${payload.frontend.routeCount}\`
- Shared components: \`${payload.frontend.sharedComponents}\`
- Local components: \`${payload.frontend.localComponents}\`

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')
    : '- `No follow-up action is queued.`'}

## Codex Native Layer

- Operator: \`${payload.codex.operatorCommand}\`
- Cockpit: \`${payload.codex.cockpitCommand}\`
- Suggested goal: \`${payload.codex.suggestedGoal}\`
- Skills: \`${payload.codex.skills.join(', ')}\`
`;
}

function buildRepoControlPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, {
    refresh: Boolean(options.refresh),
    write: Boolean(options.refresh),
    writeIfMissing: true,
  });
  const packageGraph = buildPackageGraph(cwd, {
    writeFiles: true,
  });
  const workspaces = buildWorkspacePayload(cwd);
  const frontendProfile = safeFrontendProfile(cwd, rootDir);
  const frontend = frontendSummary(frontendProfile);
  const repoAudit = loadOrBuildRepoAudit(cwd, options);
  const repoHealth = repoHealthSummary(repoAudit.payload);
  const hotspots = summarizeHotspots(repoAudit.payload);
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'repo-control',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    verdict: 'clear',
    packageGraph: {
      repoShape: packageGraph.repoShape,
      packageCount: Number(packageGraph.packageCount || 0),
      changedPackages: packageGraph.changedPackages || [],
      impactedPackages: packageGraph.impactedPackages || [],
      impactedTests: (packageGraph.impactedTests || []).slice(0, 10),
      workspaceSources: packageGraph.workspaceDiscovery?.sources || [],
    },
    packageBoard: summarizePackages(packageGraph),
    workspaces: {
      activeRoot: workspaces.activeRoot,
      activeName: workspaces.activeName,
      count: (workspaces.workspaces || []).length,
      items: (workspaces.workspaces || []).slice(0, 12),
    },
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    repoHealth,
    repoAudit: {
      source: repoAudit.source,
      refreshed: repoAudit.refreshed,
      artifacts: repoAudit.payload.artifacts || null,
      stackPack: repoAudit.payload.stackPack || null,
      correctionPlanCount: (repoAudit.payload.correctionPlan || []).length,
      testGapCount: (repoAudit.payload.testGapMatrix || []).length,
    },
    hotspots,
    correctionPlan: (repoAudit.payload.correctionPlan || []).slice(0, 8),
    workflowObservations: compactList(repoAudit.payload.workflowObservations || [], 10),
    frontend,
    commands: {
      repoAudit: 'rai audit-repo --mode oneshot --json',
      workspaces: 'rai workspaces --json',
      monorepo: 'rai monorepo-mode --json',
      monorepoControl: 'rai monorepo-control --json',
      workspaceImpact: 'rai workspace-impact --json',
      frontendControl: 'rai frontend-control --json',
      codexOperator: 'rai codex operator --goal "run repo-control on the highest-risk surfaces" --json',
      codexCockpit: 'rai codex cockpit --goal "stabilize the repo-control follow-through" --json',
    },
    nextActions: [],
    codex: {
      suggestedGoal: `stabilize ${hotspots[0]?.area || 'the highest-risk repo surface'} with repo-control context and explicit verification`,
      operatorCommand: `rai codex operator --goal ${JSON.stringify(`stabilize ${hotspots[0]?.area || 'the highest-risk repo surface'} with repo-control context and explicit verification`)} --json`,
      cockpitCommand: `rai codex cockpit --goal ${JSON.stringify('stabilize the repo-control follow-through for this repository')} --json`,
      telemetryCommand: 'rai codex telemetry --json',
      skills: ['raiola-repo-control-room', 'raiola-monorepo-control-room', 'raiola-native-operator', 'raiola-codex-cockpit'],
    },
    artifacts: null,
  };
  payload.verdict = buildVerdict(payload.repoHealth, payload.packageGraph, payload.frontend);
  payload.nextActions = buildNextActions(payload);
  payload.artifacts = writePlaneArtifacts(cwd, 'repo-control-room', payload, renderRepoControlMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
repo_control

Usage:
  node scripts/workflow/repo_control.js [--refresh] [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --refresh           Recompute repo audit-backed control data before rendering
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
  const payload = buildRepoControlPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# REPO CONTROL ROOM\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Repo shape: \`${payload.packageGraph.repoShape}\``);
  console.log(`- Packages: \`${payload.packageGraph.packageCount}\``);
  console.log(`- Repo health: \`${payload.repoHealth.verdict}\` (score=${payload.repoHealth.score})`);
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
  buildRepoControlPayload,
};
