const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildWorkspacePayload } = require('./workspaces_center');
const { compactList, writePlaneArtifacts } = require('./control_planes_common');
const { listGitChangesCached, safeExecCached } = require('./perf/runtime_cache');
const { readJsonIfExists } = require('./io/json');
const { commandFor, detectPackageManager } = require('./io/package_manager');

function packageManifest(cwd, packageId) {
  const manifestPath = packageId === '.'
    ? path.join(cwd, 'package.json')
    : path.join(cwd, packageId, 'package.json');
  return readJsonIfExists(manifestPath, {});
}

function scriptsForPackage(cwd, packageId) {
  const manifest = packageManifest(cwd, packageId);
  return manifest.scripts || {};
}

function shellCommandInPackage(packagePath, command) {
  if (!packagePath || packagePath === '.') {
    return command;
  }
  return `cd ${JSON.stringify(packagePath)} && ${command}`;
}

function defaultVerificationCommands(pkg, packageId, scripts = {}) {
  const commands = [];
  const packagePath = pkg.path || packageId || '.';
  const ecosystem = String(pkg.ecosystem || 'node').toLowerCase();

  if (ecosystem === 'node') {
    return commands;
  }

  if (ecosystem === 'rust') {
    commands.push(shellCommandInPackage(packagePath, 'cargo test'));
    commands.push(shellCommandInPackage(packagePath, 'cargo check'));
    return commands;
  }

  if (ecosystem === 'go') {
    commands.push(shellCommandInPackage(packagePath, 'go test ./...'));
    commands.push(shellCommandInPackage(packagePath, 'go vet ./...'));
    return commands;
  }

  if (ecosystem === 'python') {
    commands.push(shellCommandInPackage(packagePath, 'python -m pytest'));
    commands.push(shellCommandInPackage(packagePath, 'python -m compileall .'));
    return commands;
  }

  if (ecosystem === 'java') {
    if (pkg.manifest === 'pom.xml') {
      commands.push(shellCommandInPackage(packagePath, 'mvn test'));
    } else {
      commands.push(shellCommandInPackage(packagePath, './gradlew test'));
    }
    return commands;
  }

  if (ecosystem === 'bazel') {
    commands.push(`bazel test //${packagePath}/...`);
    return commands;
  }

  if (ecosystem === 'nx') {
    commands.push(`npx nx test ${JSON.stringify(pkg.name || packagePath)}`);
    return commands;
  }

  return commands;
}

function isGitRepository(cwd) {
  const result = safeExecCached('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  return result.ok && String(result.stdout || '').trim() === 'true';
}

function listChangedFilesBetween(cwd, base, head = 'HEAD') {
  if (!base || !isGitRepository(cwd)) {
    return [];
  }
  const args = ['diff', '--name-only', `${base}...${head}`];
  const result = safeExecCached('git', args, { cwd });
  if (!result.ok || !result.stdout) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\\/g, '/'))
    .sort();
}

function resolveChangedFiles(cwd, options = {}) {
  const base = options.base ? String(options.base).trim() : '';
  const head = options.head ? String(options.head).trim() : 'HEAD';
  const fromRange = base ? listChangedFilesBetween(cwd, base, head) : [];
  if (base) {
    return {
      mode: 'git-range',
      base,
      head,
      changedFiles: fromRange,
    };
  }
  return {
    mode: 'working-tree',
    base: null,
    head: null,
    changedFiles: listGitChangesCached(cwd)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .sort(),
  };
}

function workspaceMatchForPath(packagePath, workspaces = []) {
  const normalizedPath = String(packagePath || '.').replace(/\\/g, '/');
  let matched = null;
  for (const workspace of workspaces) {
    const root = String(workspace.root || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!root) {
      continue;
    }
    if (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) {
      if (!matched || root.length > String(matched.root || '').length) {
        matched = workspace;
      }
    }
  }
  return matched;
}

function impactedTestCountForPackage(graph, packageId, packagePath) {
  if (!packagePath || packagePath === '.') {
    return Number((graph.impactedTests || []).length || 0);
  }
  return (graph.impactedTests || []).filter((filePath) => filePath.startsWith(`${packagePath}/`)).length;
}

function distanceMapFromChanged(graph) {
  const changed = new Set(graph.changedPackages || []);
  const packageByName = new Map((graph.packages || []).map((pkg) => [pkg.name, pkg.id]));
  const dependentsById = new Map((graph.packages || []).map((pkg) => [pkg.id, []]));
  for (const pkg of graph.packages || []) {
    for (const dependencyName of pkg.internalDependencies || []) {
      const dependencyId = packageByName.get(dependencyName);
      if (dependencyId && dependentsById.has(dependencyId)) {
        dependentsById.get(dependencyId).push(pkg.id);
      }
    }
  }

  const distances = new Map();
  const queue = [];
  for (const packageId of changed) {
    distances.set(packageId, 0);
    queue.push(packageId);
  }
  while (queue.length > 0) {
    const current = queue.shift();
    const currentDistance = Number(distances.get(current) || 0);
    for (const dependentId of dependentsById.get(current) || []) {
      if (distances.has(dependentId)) {
        continue;
      }
      distances.set(dependentId, currentDistance + 1);
      queue.push(dependentId);
    }
  }
  return distances;
}

function rowScore(row) {
  let score = 0;
  score += row.changed ? 120 : 0;
  score += row.impacted ? 55 : 0;
  score += Number(row.hotspotScore || 0) * 3;
  score += Number(row.dependentCount || 0) * 6;
  score += Number(row.changedFileCount || 0) * 4;
  score += Number(row.impactedTestCount || 0) * 2;
  score += Number(row.importImpactedFileCount || 0) * 3;
  score += Number(row.internalDependencyCount || 0) * 2;
  score += row.workspace ? 0 : 4;
  score += row.verificationCommands.length === 0 ? 6 : 0;
  return score;
}

function summarizePackageRows(cwd, graph, intelligence, workspacePayload) {
  const hotspotsByPackage = new Map((intelligence.hotspots || []).map((entry) => [entry.packageId, entry]));
  const manager = detectPackageManager(cwd);
  const workspaces = workspacePayload.workspaces || [];
  const distances = distanceMapFromChanged(graph);

  return (graph.packages || [])
    .filter((pkg) => !(graph.repoShape === 'monorepo' && pkg.id === '.'))
    .map((pkg) => {
      const scripts = scriptsForPackage(cwd, pkg.id);
      const workspace = workspaceMatchForPath(pkg.path, workspaces);
      const changedFiles = (graph.changedFiles || []).filter((filePath) => graph.ownership?.[filePath] === pkg.id);
      const verificationCommands = [];
      for (const scriptName of ['test', 'lint', 'typecheck', 'build']) {
        if (scripts[scriptName]) {
          verificationCommands.push(commandFor(manager, pkg.id, scriptName));
        }
      }
      if (verificationCommands.length === 0) {
        verificationCommands.push(...defaultVerificationCommands(pkg, pkg.id, scripts));
      }
      const hotspot = hotspotsByPackage.get(pkg.id) || null;
      const row = {
        packageId: pkg.id,
        packageName: pkg.name,
        packagePath: pkg.path,
        ecosystem: pkg.ecosystem || 'node',
        manifest: pkg.manifest || null,
        owners: pkg.owners || [],
        changed: (graph.changedPackages || []).includes(pkg.id),
        impacted: (graph.impactedPackages || []).includes(pkg.id),
        changeDistance: distances.has(pkg.id) ? Number(distances.get(pkg.id) || 0) : null,
        workspace: workspace ? {
          name: workspace.name,
          root: workspace.root,
          status: workspace.status,
        } : null,
        dependentCount: (pkg.dependents || []).length,
        internalDependencyCount: (pkg.internalDependencies || []).length,
        fileCount: Number(pkg.fileCount || 0),
        testCount: Number((graph.testsByPackage?.[pkg.id] || []).length || 0),
        changedFileCount: changedFiles.length,
        changedFiles: changedFiles.slice(0, 8),
        impactedTestCount: impactedTestCountForPackage(graph, pkg.id, pkg.path),
      importImpactedFileCount: (graph.importGraph?.impactedFiles || []).filter((filePath) => graph.ownership?.[filePath] === pkg.id).length,
        verificationCommands: verificationCommands.slice(0, 4),
        hotspotScore: Number(hotspot?.score || 0),
        hotspotReason: hotspot?.reason || '',
        readFirst: hotspot?.readFirst?.slice(0, 6) || compactList([pkg.path, ...changedFiles.slice(0, 4)], 6),
      };
      return {
        ...row,
        impactScore: rowScore(row),
      };
    })
    .sort((left, right) => right.impactScore - left.impactScore || left.packageName.localeCompare(right.packageName));
}

function buildBlastRadius(graph, packageRows) {
  const changedPackages = packageRows.filter((entry) => entry.changed);
  const impactedPackages = packageRows.filter((entry) => entry.impacted);
  const impactedWorkspaces = [...new Set(impactedPackages.map((entry) => entry.workspace?.name).filter(Boolean))];
  const totalPackages = Math.max(1, Number(graph.packageCount || 0) - (graph.repoShape === 'monorepo' ? 1 : 0));
  const impactedCount = impactedPackages.length;
  const changedCount = changedPackages.length;
  const impactedPercent = Number(((impactedCount / Math.max(1, totalPackages)) * 100).toFixed(1));
  const expansionRatio = Number((impactedCount / Math.max(changedCount, 1)).toFixed(1));
  let verdict = 'clean';
  if (changedCount === 0 && impactedCount === 0) {
    verdict = 'clean';
  } else if (impactedPercent >= 65 || impactedCount >= Math.max(12, Math.ceil(totalPackages * 0.7))) {
    verdict = 'repo-wide';
  } else if (expansionRatio >= 4 || impactedCount >= Math.max(6, changedCount * 3)) {
    verdict = 'wide';
  } else if (impactedCount > changedCount) {
    verdict = 'expanding';
  } else {
    verdict = 'contained';
  }

  return {
    verdict,
    changedPackageCount: changedCount,
    impactedPackageCount: impactedCount,
    impactedTestCount: Number((graph.impactedTests || []).length || 0),
    impactedWorkspaceCount: impactedWorkspaces.length,
    impactedWorkspaces,
    impactedPackagePercent: impactedPercent,
    expansionRatio,
    totalPackages,
  };
}

function aggregateWaveCommands(rows = [], fallback = []) {
  const commands = [...new Set(rows.flatMap((entry) => entry.verificationCommands || []).filter(Boolean))];
  return commands.length > 0 ? commands.slice(0, 8) : (fallback || []).slice(0, 4);
}

function buildWavePlan(packageRows, intelligence) {
  const impactedRows = packageRows.filter((entry) => entry.impacted);
  const changedRows = impactedRows.filter((entry) => entry.changed);
  const waves = [];

  if (impactedRows.length === 0) {
    const scoutRows = packageRows.slice(0, 3);
    if (scoutRows.length > 0) {
      waves.push({
        id: 'wave-1',
        label: 'Hotspot scout wave',
        stage: 'scout',
        distance: null,
        packageCount: scoutRows.length,
        packages: scoutRows.map((entry) => entry.packageName),
        workspaceNames: [...new Set(scoutRows.map((entry) => entry.workspace?.name).filter(Boolean))],
        readFirst: compactList(scoutRows.flatMap((entry) => entry.readFirst || []), 12),
        writeScope: scoutRows.map((entry) => entry.packagePath),
        verifyCommands: aggregateWaveCommands(scoutRows, intelligence.verify?.rootSmoke || []),
        parallelizable: scoutRows.length > 1,
        reason: 'The working tree is clean, so start from the top hotspot packages instead of widening to the whole monorepo.',
      });
    }
    return waves;
  }

  const groups = new Map();
  for (const row of impactedRows) {
    const distance = row.changeDistance === null ? 99 : row.changeDistance;
    if (!groups.has(distance)) {
      groups.set(distance, []);
    }
    groups.get(distance).push(row);
  }

  const distances = [...groups.keys()].sort((left, right) => left - right);
  for (const distance of distances.slice(0, 6)) {
    const rows = groups.get(distance) || [];
    const label = distance === 0
      ? 'Direct change set'
      : distance === 1
        ? 'First-order consumers'
        : `Fan-out layer ${distance}`;
    const reason = distance === 0
      ? 'Start with the directly changed packages before consumer packages start drifting.'
      : distance === 1
        ? 'These packages consume the direct change set, so they are the next compatibility wave.'
        : 'These packages are downstream in the dependency fan-out and should follow after earlier waves stabilize.';
    const workspaceNames = [...new Set(rows.map((entry) => entry.workspace?.name).filter(Boolean))];
    waves.push({
      id: `wave-${waves.length + 1}`,
      label,
      stage: distance === 0 ? 'source' : 'consumer',
      distance,
      packageCount: rows.length,
      packages: rows.map((entry) => entry.packageName),
      workspaceNames,
      readFirst: compactList(rows.flatMap((entry) => entry.readFirst || []), 16),
      writeScope: rows.map((entry) => entry.packagePath),
      verifyCommands: aggregateWaveCommands(rows, intelligence.verify?.rootSmoke || []),
      parallelizable: workspaceNames.length > 1 || rows.length > 1,
      reason,
    });
  }

  if (waves.length === 1 && changedRows.length === impactedRows.length && intelligence.verify?.rootSmoke?.length) {
    waves.push({
      id: `wave-${waves.length + 1}`,
      label: 'Root smoke gate',
      stage: 'verify',
      distance: null,
      packageCount: 0,
      packages: [],
      workspaceNames: [],
      readFirst: compactList(changedRows.flatMap((entry) => entry.readFirst || []), 10),
      writeScope: [],
      verifyCommands: intelligence.verify.rootSmoke.slice(0, 4),
      parallelizable: false,
      reason: 'After the direct packages settle, run the root smoke gate before widening further.',
    });
  }

  return waves;
}

function buildWorkspaceSummary(packageRows, workspacePayload, blastRadius) {
  const packagesWithWorkspace = packageRows.filter((entry) => entry.workspace);
  const impactedByWorkspace = {};
  for (const row of packageRows.filter((entry) => entry.impacted && entry.workspace)) {
    const key = row.workspace.name;
    impactedByWorkspace[key] = (impactedByWorkspace[key] || 0) + 1;
  }
  const items = (workspacePayload.workspaces || []).map((workspace) => ({
    name: workspace.name,
    root: workspace.root,
    status: workspace.status,
    impactedPackages: impactedByWorkspace[workspace.name] || 0,
    currentMilestone: workspace.currentMilestone,
  }));
  return {
    activeName: workspacePayload.activeName,
    activeRoot: workspacePayload.activeRoot,
    count: (workspacePayload.workspaces || []).length,
    mappedPackageCount: packagesWithWorkspace.length,
    unmappedPackageCount: packageRows.length - packagesWithWorkspace.length,
    impactedWorkspaceCount: blastRadius.impactedWorkspaceCount,
    impactedWorkspaces: blastRadius.impactedWorkspaces,
    items: items.slice(0, 12),
    unmappedPackages: packageRows.filter((entry) => !entry.workspace).map((entry) => entry.packageName).slice(0, 12),
  };
}

function buildParallelization(packageRows, waves, intelligence) {
  const impactedRows = packageRows.filter((entry) => entry.impacted);
  const laneBudget = Math.max(1, Math.min(6, Math.max(
    impactedRows.length > 0 ? impactedRows.length : packageRows.slice(0, 3).length,
    intelligence.writeScopes?.length || 1,
  )));
  return {
    recommendedLaneCount: laneBudget,
    writeScopes: (intelligence.writeScopes || []).slice(0, 8),
    parallelizableWaveCount: waves.filter((wave) => wave.parallelizable).length,
    mode: impactedRows.length >= 4 || waves.filter((wave) => wave.parallelizable).length >= 2
      ? 'bounded-parallel'
      : 'single-wave-first',
  };
}

function buildNextActions(payload) {
  const actions = [];
  const push = (priority, title, command, reason) => {
    if (!command || actions.some((entry) => entry.command === command)) {
      return;
    }
    actions.push({ priority, title, command, reason });
  };

  if (payload.repoShape === 'monorepo') {
    push(
      'high',
      'Open the monorepo control room',
      'rai monorepo-control --json',
      'Use the monorepo plane when dependency topology, workspaces, and verify waves should be managed together.',
    );
  }
  if (['wide', 'repo-wide'].includes(payload.blastRadius.verdict)) {
    push(
      'high',
      'Run the staged monorepo lane',
      'rai monorepo-mode --json',
      'The impacted surface is broad enough that staged mapping, patch planning, and verification are safer than ad-hoc edits.',
    );
  }
  if (payload.workspaceSummary.unmappedPackageCount > 0) {
    push(
      'high',
      'Clean up workspace ownership',
      'rai workspaces --json',
      'Some impacted packages do not map to an explicit workspace, which makes coordination and handoff weaker.',
    );
  }
  if (payload.parallelization.mode === 'bounded-parallel') {
    push(
      'medium',
      'Open the team control room',
      'rai team-control --json',
      'The current impact wave spans multiple packages or workspaces, so bounded parallel coordination should be explicit.',
    );
  }
  if (payload.waves[0]?.packages?.length > 0) {
    push(
      'medium',
      `Review the ${payload.waves[0].label.toLowerCase()}`,
      'rai review-orchestrate --json',
      'Turn the first impact wave into a bounded review plan before opening a write lane.',
    );
  }
  push(
    'medium',
    'Refresh repo control',
    'rai repo-control --json',
    'Keep the repo-wide hotspot ranking aligned with the current impact map.',
  );
  push(
    'medium',
    'Generate the Codex monorepo packet',
    `rai codex operator --goal ${JSON.stringify(`stabilize the ${payload.waves[0]?.label || 'current monorepo impact wave'} with bounded verification`)} --json`,
    'Start Codex with the current impact wave encoded as an explicit native goal.',
  );
  push(
    'low',
    'Materialize a runnable cockpit',
    `rai codex cockpit --goal ${JSON.stringify('stabilize the current monorepo impact wave and verify the fan-out')} --json`,
    'Use the cockpit when the impact wave should be repeatable and relaunchable.',
  );
  return actions.slice(0, 8);
}

function verdictForPayload(graph, blastRadius) {
  if (graph.repoShape !== 'monorepo') {
    return 'single-package';
  }
  if (blastRadius.verdict === 'repo-wide') {
    return 'attention-required';
  }
  if (blastRadius.verdict === 'wide' || blastRadius.verdict === 'expanding') {
    return 'guided';
  }
  if (blastRadius.verdict === 'contained') {
    return 'focused';
  }
  return 'ready';
}

function renderWorkspaceImpactMarkdown(payload) {
  return `# WORKSPACE IMPACT

- Verdict: \`${payload.verdict}\`
- Repo shape: \`${payload.repoShape}\`
- Package count: \`${payload.packageCount}\`
- Change mode: \`${payload.changeSet.mode}\`
- Blast radius: \`${payload.blastRadius.verdict}\`
- Changed packages: \`${payload.blastRadius.changedPackageCount}\`
- Impacted packages: \`${payload.blastRadius.impactedPackageCount}\`
- Impacted tests: \`${payload.blastRadius.impactedTestCount}\`
- Impacted workspaces: \`${payload.blastRadius.impactedWorkspaceCount}\`

## Impact Board

${payload.packageBoard.length > 0
    ? payload.packageBoard.map((entry) => `- \`${entry.packageName}\` -> changed=${entry.changed ? 'yes' : 'no'} impacted=${entry.impacted ? 'yes' : 'no'} workspace=${entry.workspace?.name || 'unmapped'} dependents=${entry.dependentCount} verify=${entry.verificationCommands.length}`).join('\n')
    : '- `No package rows were detected.`'}

## Development Waves

${payload.waves.length > 0
    ? payload.waves.map((wave) => `- ${wave.label} -> packages=${wave.packageCount || wave.packages.length} workspaces=${wave.workspaceNames.join(', ') || 'n/a'} verify=${wave.verifyCommands.join(' | ') || 'n/a'}`).join('\n')
    : '- `No wave plan was inferred.`'}

## Workspace Coverage

- Active workspace: \`${payload.workspaceSummary.activeName}\` -> \`${payload.workspaceSummary.activeRoot}\`
- Workspace count: \`${payload.workspaceSummary.count}\`
- Unmapped packages: \`${payload.workspaceSummary.unmappedPackageCount}\`
- Impacted workspaces: \`${payload.workspaceSummary.impactedWorkspaces.join(', ') || 'none'}\`

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((entry) => `- [${entry.priority}] ${entry.title}${entry.command ? ` -> \`${entry.command}\`` : ''}`).join('\n')
    : '- `No next action is queued.`'}
`;
}

function buildWorkspaceImpactPayload(cwd, rootDir, options = {}) {
  const changeSet = resolveChangedFiles(cwd, options);
  const graph = buildPackageGraph(cwd, {
    writeFiles: true,
    changedFiles: changeSet.changedFiles,
  });
  const intelligence = buildMonorepoIntelligence(cwd, rootDir, {
    writeFiles: false,
    changedFiles: changeSet.changedFiles,
    maxWorkers: options['max-workers'],
  });
  const workspacePayload = buildWorkspacePayload(cwd);
  const packageRows = summarizePackageRows(cwd, graph, intelligence, workspacePayload);
  const blastRadius = buildBlastRadius(graph, packageRows);
  const waves = buildWavePlan(packageRows, intelligence);
  const workspaceSummary = buildWorkspaceSummary(packageRows, workspacePayload, blastRadius);
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'workspace-impact',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    repoShape: graph.repoShape,
    packageCount: Number(graph.packageCount || 0),
    packageManager: intelligence.verify?.manager || detectPackageManager(cwd),
    changeSet: {
      mode: changeSet.mode,
      base: changeSet.base,
      head: changeSet.head,
      changedFileCount: changeSet.changedFiles.length,
      changedFiles: changeSet.changedFiles.slice(0, 40),
    },
    blastRadius,
    packageBoard: packageRows.slice(0, 14),
    waves,
    workspaceSummary,
    parallelization: buildParallelization(packageRows, waves, intelligence),
    monorepo: {
      hotspotCount: (intelligence.hotspots || []).length,
      writeScopeCount: (intelligence.writeScopes || []).length,
      reviewShardCount: (intelligence.reviewShards || []).length,
      verifyPackageCount: (intelligence.verify?.perPackage || []).filter((entry) => (entry.commands || []).length > 0).length,
      hotspots: (intelligence.hotspots || []).slice(0, 6),
      writeScopes: (intelligence.writeScopes || []).slice(0, 8),
      reviewShards: (intelligence.reviewShards || []).slice(0, 8),
      rootSmoke: (intelligence.verify?.rootSmoke || []).slice(0, 4),
    },
    commands: {
      monorepoControl: 'rai monorepo-control --json',
      repoControl: 'rai repo-control --json',
      monorepo: 'rai monorepo --json',
      monorepoMode: 'rai monorepo-mode --json',
      reviewOrchestrate: 'rai review-orchestrate --json',
      workspaces: 'rai workspaces --json',
      teamControl: 'rai team-control --json',
      codexOperator: 'rai codex operator --goal "stabilize the current monorepo impact wave" --json',
      codexCockpit: 'rai codex cockpit --goal "stabilize the current monorepo impact wave" --json',
    },
    nextActions: [],
    artifacts: null,
  };
  payload.verdict = verdictForPayload(graph, blastRadius);
  payload.nextActions = buildNextActions(payload);
  if (options.writeArtifacts !== false) {
    payload.artifacts = writePlaneArtifacts(cwd, 'workspace-impact', payload, renderWorkspaceImpactMarkdown(payload), { runtimeMirror: true });
  }
  return payload;
}

function printHelp() {
  console.log(`
workspace_impact

Usage:
  node scripts/workflow/workspace_impact.js [--base <ref>] [--head <ref>] [--json]

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --base <ref>          Compare a git base ref against --head (defaults to HEAD)
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
  const payload = buildWorkspaceImpactPayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# WORKSPACE IMPACT\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Blast radius: \`${payload.blastRadius.verdict}\``);
  console.log(`- Changed packages: \`${payload.blastRadius.changedPackageCount}\``);
  console.log(`- Impacted packages: \`${payload.blastRadius.impactedPackageCount}\``);
  if (payload.artifacts?.markdown) {
    console.log(`- Output: \`${payload.artifacts.markdown}\``);
  }
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
  buildWorkspaceImpactPayload,
  resolveChangedFiles,
};
