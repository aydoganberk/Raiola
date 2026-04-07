
const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, parseArgs, readIfExists, resolveWorkflowRoot, writeIfChanged } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { relativePath } = require('./roadmap_os');

function readJson(filePath, fallback = {}) {
  const content = readIfExists(filePath);
  if (!content) {
    return fallback;
  }
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  writeIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function writeMarkdown(filePath, content) {
  writeIfChanged(filePath, `${String(content).trimEnd()}\n`);
  return filePath;
}

function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) {
    return 'bun';
  }
  return 'npm';
}

function quoteShell(value) {
  return /[\s"]/g.test(String(value)) ? JSON.stringify(String(value)) : String(value);
}

function packageManifest(cwd, packageId) {
  const manifestPath = packageId === '.'
    ? path.join(cwd, 'package.json')
    : path.join(cwd, packageId, 'package.json');
  return readJson(manifestPath, {});
}

function scriptsForPackage(cwd, packageId) {
  const manifest = packageManifest(cwd, packageId);
  return manifest.scripts || {};
}

function commandFor(manager, packageId, scriptName) {
  const dir = packageId === '.' ? '.' : packageId;
  if (manager === 'pnpm') {
    return packageId === '.'
      ? `pnpm run ${scriptName}`
      : `pnpm --dir ${quoteShell(dir)} run ${scriptName}`;
  }
  if (manager === 'yarn') {
    return packageId === '.'
      ? `yarn ${scriptName}`
      : `yarn --cwd ${quoteShell(dir)} ${scriptName}`;
  }
  if (manager === 'bun') {
    return packageId === '.'
      ? `bun run ${scriptName}`
      : `bun --cwd ${quoteShell(dir)} run ${scriptName}`;
  }
  return packageId === '.'
    ? `npm run ${scriptName}`
    : `npm --prefix ${quoteShell(dir)} run ${scriptName}`;
}

function pickTopPackages(graph, options = {}) {
  const candidates = [...(graph.changedPackages || []), ...(graph.impactedPackages || [])];
  const seen = new Set();
  const orderedIds = [];
  for (const packageId of candidates) {
    if (!packageId || seen.has(packageId) || (graph.repoShape === 'monorepo' && packageId === '.')) {
      continue;
    }
    seen.add(packageId);
    orderedIds.push(packageId);
  }
  if (orderedIds.length === 0) {
    for (const pkg of graph.packages || []) {
      if (pkg.id === '.' && graph.repoShape === 'monorepo') {
        continue;
      }
      orderedIds.push(pkg.id);
      if (orderedIds.length >= (options.limit || 4)) {
        break;
      }
    }
  }
  return orderedIds.slice(0, options.limit || 4);
}

function buildPackageSlices(graph, packageIds) {
  const byId = new Map((graph.packages || []).map((pkg) => [pkg.id, pkg]));
  return packageIds
    .map((packageId, index) => {
      const pkg = byId.get(packageId);
      if (!pkg) {
        return null;
      }
      const ownedFiles = Object.entries(graph.ownership || {})
        .filter(([, ownerId]) => ownerId === packageId)
        .map(([filePath]) => filePath);
      const changedFiles = (graph.changedFiles || []).filter((filePath) => graph.ownership?.[filePath] === packageId);
      const tests = graph.testsByPackage?.[packageId] || [];
      return {
        worker: `worker-${index + 1}`,
        packageId,
        packageName: pkg.name,
        packagePath: pkg.path,
        changedFiles,
        changedFileCount: changedFiles.length,
        ownedFileCount: ownedFiles.length,
        internalDependencies: pkg.internalDependencies || [],
        dependents: pkg.dependents || [],
        tests: tests.slice(0, 16),
      };
    })
    .filter(Boolean);
}

function buildVerifyPlan(cwd, graph, slices, manager) {
  const verifySteps = [];
  const rootScripts = scriptsForPackage(cwd, '.');
  const packagesToVerify = slices.length > 0 ? slices : buildPackageSlices(graph, pickTopPackages(graph, { limit: 3 }));

  for (const slice of packagesToVerify) {
    const scripts = scriptsForPackage(cwd, slice.packageId);
    const commands = [];
    if (scripts.test) {
      commands.push(commandFor(manager, slice.packageId, 'test'));
    }
    if (scripts.lint) {
      commands.push(commandFor(manager, slice.packageId, 'lint'));
    }
    if (scripts.typecheck) {
      commands.push(commandFor(manager, slice.packageId, 'typecheck'));
    }
    if (scripts.build) {
      commands.push(commandFor(manager, slice.packageId, 'build'));
    }
    verifySteps.push({
      packageId: slice.packageId,
      packageName: slice.packageName,
      commands: commands.slice(0, 4),
    });
  }

  const rootSmoke = [];
  for (const scriptName of ['test', 'lint', 'typecheck', 'build']) {
    if (rootScripts[scriptName]) {
      rootSmoke.push(commandFor(manager, '.', scriptName));
    }
  }

  return {
    manager,
    perPackage: verifySteps,
    rootSmoke: rootSmoke.slice(0, 4),
  };
}

function buildReviewShards(graph, slices) {
  const shards = [];
  const packageHeat = new Map();
  for (const packageId of graph.impactedPackages || []) {
    packageHeat.set(packageId, (packageHeat.get(packageId) || 0) + 1);
  }

  for (const slice of slices) {
    shards.push({
      id: `review-${slice.packageId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      packageId: slice.packageId,
      packageName: slice.packageName,
      focus: `Review ${slice.packageName} for cross-package regression, owner boundaries, and verification completeness.`,
      readScope: [
        slice.packagePath,
        ...(slice.tests.length > 0 ? slice.tests.slice(0, 6) : []),
      ],
      priority: packageHeat.has(slice.packageId) ? 'high' : 'normal',
    });
  }

  if (graph.impactedTests?.length > 0) {
    shards.push({
      id: 'review-tests',
      packageId: 'tests',
      packageName: 'Impacted tests',
      focus: 'Audit test coverage drift, replay coverage, and fast verification commands before running the whole repo.',
      readScope: graph.impactedTests.slice(0, 12),
      priority: graph.impactedTests.length > 8 ? 'high' : 'normal',
    });
  }

  return shards;
}

function buildPerformanceRisks(graph, slices) {
  const risks = [];
  if (graph.repoShape === 'monorepo' && graph.packageCount >= 8) {
    risks.push('Avoid repo-wide grep/build by default; route work through package slices and impacted packages first.');
  }
  if ((graph.impactedPackages || []).length > Math.max((graph.changedPackages || []).length, 1)) {
    risks.push('Changed packages fan out into a larger impacted surface; targeted verify is cheaper than a full monorepo sweep.');
  }
  if ((graph.impactedTests || []).length > 16) {
    risks.push('Impacted test ownership is broad; schedule test shards before a full root smoke run.');
  }
  if (slices.some((slice) => slice.changedFileCount > 20)) {
    risks.push('One package owns a large changed delta; split review by concern before asking a write-capable worker to patch.');
  }
  if (graph.packages?.some((pkg) => pkg.id === '.' && pkg.fileCount > 300)) {
    risks.push('The root package is heavy; keep Codex context windows focused on a workspace path whenever possible.');
  }
  return risks;
}

function buildPerformanceLevers(graph, writeScopes, hotspots, verify) {
  const levers = [];
  if (graph.workspaceDiscovery?.sources?.length) {
    levers.push(`Workspace discovery reads ${graph.workspaceDiscovery.sources.join(', ')} so Codex can scope work without repo-wide guessing.`);
  }
  if (writeScopes.length > 0) {
    levers.push(`Default writes should stay package-local first (${writeScopes.slice(0, 3).map((scope) => scope.packageName).join(', ') || 'scoped shards'}) before escalating to repo-wide edits.`);
  }
  if (hotspots.length > 0) {
    levers.push(`Hotspots expose the highest-value read-first surfaces: ${hotspots.slice(0, 3).map((item) => item.packageName).join(', ')}.`);
  }
  if ((graph.impactedPackages || []).length > (graph.changedPackages || []).length) {
    levers.push('Impacted-package fan-out is wider than the directly changed set, so adjacency-aware verification is cheaper than full sweeps.');
  }
  if ((verify.perPackage || []).some((entry) => entry.commands.length > 0)) {
    levers.push('Use per-package verify commands before root smoke checks to keep feedback fast on large monorepos.');
  }
  return levers;
}

function buildAgentPlan(writeScopes, hotspots, verify) {
  const scoutTasks = hotspots.slice(0, 3).map((hotspot, index) => ({
    id: `scout-${index + 1}`,
    mode: 'readonly',
    focus: hotspot.packageName,
    readFirst: hotspot.readFirst.slice(0, 8),
    outcome: 'Map regression risk, dependency fan-out, and missing verification evidence before writes start.',
  }));

  const fixTasks = writeScopes.slice(0, 4).map((scope, index) => ({
    id: `fix-${index + 1}`,
    mode: 'bounded_write',
    focus: scope.packageName,
    scopePaths: scope.paths,
    verifyFirst: (verify.perPackage || [])
      .find((entry) => entry.packageId === scope.packageId)?.commands?.slice(0, 4) || [],
    outcome: 'Land package-local fixes without widening the write surface.',
  }));

  const verifyTasks = []
  for (const entry of (verify.perPackage || []).slice(0, 4)) {
    if (!entry.commands.length) {
      continue;
    }
    verifyTasks.push({
      id: `verify-${entry.packageId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      mode: 'targeted_verify',
      focus: entry.packageName,
      commands: entry.commands.slice(0, 4),
      outcome: 'Confirm package-local safety before root-level smoke runs.',
    });
  }
  if (verify.rootSmoke?.length) {
    verifyTasks.push({
      id: 'verify-root-smoke',
      mode: 'targeted_verify',
      focus: 'root smoke',
      commands: verify.rootSmoke.slice(0, 4),
      outcome: 'Run only after package-local lanes settle.',
    });
  }

  return {
    scout: scoutTasks,
    fix: fixTasks,
    verify: verifyTasks,
  };
}

function uniquePaths(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function scoreHotspot(graph, slice) {
  let score = 0;
  score += slice.changedFileCount * 3;
  score += slice.dependents.length * 2;
  score += slice.internalDependencies.length;
  if ((graph.changedPackages || []).includes(slice.packageId)) {
    score += 5;
  }
  if ((graph.impactedPackages || []).includes(slice.packageId)) {
    score += 4;
  }
  if ((graph.impactedTests || []).some((filePath) => filePath.startsWith(`${slice.packagePath}/`) || filePath.includes(`/${slice.packageId}/`))) {
    score += 2;
  }
  return score;
}

function buildHotspots(graph, slices, verify) {
  const verifyByPackage = new Map((verify.perPackage || []).map((entry) => [entry.packageId, entry.commands || []]));
  const candidates = (slices.length > 0 ? slices : buildPackageSlices(graph, pickTopPackages(graph, { limit: 4 })));
  const hotspots = candidates
    .map((slice) => {
      const reasons = [];
      if ((graph.changedPackages || []).includes(slice.packageId)) {
        reasons.push('directly changed');
      }
      if ((graph.impactedPackages || []).includes(slice.packageId) && !(graph.changedPackages || []).includes(slice.packageId)) {
        reasons.push('impacted by upstream changes');
      }
      if (slice.changedFileCount > 0) {
        reasons.push(`${slice.changedFileCount} changed files`);
      }
      if (slice.dependents.length > 0) {
        reasons.push(`${slice.dependents.length} downstream dependents`);
      }
      if (slice.internalDependencies.length > 0) {
        reasons.push(`${slice.internalDependencies.length} internal dependencies`);
      }
      if (slice.tests.length > 0) {
        reasons.push(`${Math.min(slice.tests.length, 6)} package test targets`);
      }
      return {
        packageId: slice.packageId,
        packageName: slice.packageName,
        packagePath: slice.packagePath,
        score: scoreHotspot(graph, slice),
        reason: reasons.join('; ') || 'baseline package context',
        readFirst: uniquePaths([
          slice.packagePath,
          ...slice.changedFiles.slice(0, 6),
          ...slice.tests.slice(0, 4),
        ]).slice(0, 12),
        verifyCommands: (verifyByPackage.get(slice.packageId) || []).slice(0, 4),
        changedFileCount: slice.changedFileCount,
        dependentCount: slice.dependents.length,
      };
    })
    .sort((left, right) => right.score - left.score || left.packageName.localeCompare(right.packageName));

  if (graph.impactedTests?.length > 0) {
    hotspots.push({
      packageId: 'tests',
      packageName: 'Impacted tests',
      packagePath: '.',
      score: Math.min(graph.impactedTests.length, 12) + 3,
      reason: `${graph.impactedTests.length} impacted tests can widen verify cost unless they are sharded first.`,
      readFirst: graph.impactedTests.slice(0, 10),
      verifyCommands: verify.rootSmoke.slice(0, 3),
      changedFileCount: 0,
      dependentCount: 0,
    });
  }

  if (hotspots.length === 0) {
    hotspots.push({
      packageId: '.',
      packageName: 'Root package',
      packagePath: '.',
      score: Math.max((graph.changedFiles || []).length, 1),
      reason: 'The repo behaves like a single package, so keep reads diff-scoped.',
      readFirst: (graph.changedFiles || []).slice(0, 10),
      verifyCommands: verify.rootSmoke.slice(0, 4),
      changedFileCount: (graph.changedFiles || []).length,
      dependentCount: 0,
    });
  }

  return hotspots.slice(0, 6);
}

function buildContextSlices(graph, writeScopes, hotspots, reviewShards, verify) {
  const slices = [];
  for (const hotspot of hotspots.slice(0, 3)) {
    slices.push({
      id: `hotspot-${hotspot.packageId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      label: `${hotspot.packageName} hotspot`,
      reason: hotspot.reason,
      readFirst: hotspot.readFirst,
      verifyFirst: hotspot.verifyCommands.slice(0, 4),
    });
  }

  if (writeScopes.length > 0) {
    slices.push({
      id: 'write-shards',
      label: 'Write shards',
      reason: 'Bound write-capable work to package-local scopes before asking multiple agents to patch.',
      readFirst: uniquePaths(writeScopes.flatMap((scope) => scope.paths)).slice(0, 12),
      verifyFirst: verify.perPackage.flatMap((entry) => entry.commands).slice(0, 6),
    });
  }

  if (reviewShards.length > 0) {
    slices.push({
      id: 'review-shards',
      label: 'Review shards',
      reason: 'Keep review diff-scoped by package or test lane instead of re-reading the whole repo.',
      readFirst: uniquePaths(reviewShards.flatMap((shard) => shard.readScope.slice(0, 4))).slice(0, 12),
      verifyFirst: ['cwf review --heatmap', 'cwf review --blockers'],
    });
  }

  slices.push({
    id: 'verify-spine',
    label: 'Verification spine',
    reason: 'Use package-local verification before escalating to the whole monorepo.',
    readFirst: uniquePaths(hotspots.slice(0, 2).flatMap((hotspot) => hotspot.readFirst.slice(0, 4))).slice(0, 8),
    verifyFirst: uniquePaths([
      ...verify.perPackage.flatMap((entry) => entry.commands).slice(0, 6),
      ...verify.rootSmoke.slice(0, 4),
    ]).slice(0, 8),
  });

  if (graph.repoShape === 'monorepo' && graph.packageCount >= 6) {
    slices.push({
      id: 'fanout-guard',
      label: 'Fan-out guard',
      reason: 'Impacted packages outnumber changed packages, so Codex should bias toward adjacency maps and targeted verify.',
      readFirst: uniquePaths([
        ...hotspots.slice(0, 2).flatMap((hotspot) => hotspot.readFirst.slice(0, 4)),
        ...reviewShards.slice(0, 2).flatMap((shard) => shard.readScope.slice(0, 3)),
      ]).slice(0, 12),
      verifyFirst: verify.rootSmoke.slice(0, 3),
    });
  }

  return slices;
}

function buildContextBudgetPlan(hotspots, reviewShards, writeScopes, verify) {
  const compactRead = uniquePaths([
    ...hotspots.slice(0, 1).flatMap((item) => item.readFirst.slice(0, 6)),
    ...writeScopes.slice(0, 1).flatMap((item) => item.paths),
  ]).slice(0, 8);
  const balancedRead = uniquePaths([
    ...hotspots.slice(0, 2).flatMap((item) => item.readFirst.slice(0, 6)),
    ...reviewShards.slice(0, 2).flatMap((item) => item.readScope.slice(0, 4)),
    ...writeScopes.slice(0, 2).flatMap((item) => item.paths),
  ]).slice(0, 16);
  const deepRead = uniquePaths([
    ...hotspots.flatMap((item) => item.readFirst.slice(0, 6)),
    ...reviewShards.flatMap((item) => item.readScope.slice(0, 4)),
    ...writeScopes.flatMap((item) => item.paths),
  ]).slice(0, 28);
  return {
    compact: {
      label: 'Compact',
      reason: 'Fastest useful context for Codex on a wide repo.',
      readFirst: compactRead,
      verifyFirst: uniquePaths([
        ...hotspots.slice(0, 1).flatMap((item) => item.verifyCommands.slice(0, 3)),
        ...verify.rootSmoke.slice(0, 2),
      ]).slice(0, 4),
    },
    balanced: {
      label: 'Balanced',
      reason: 'Default operating preset for package-scoped execution and review.',
      readFirst: balancedRead,
      verifyFirst: uniquePaths([
        ...hotspots.slice(0, 2).flatMap((item) => item.verifyCommands.slice(0, 3)),
        ...verify.perPackage.flatMap((entry) => entry.commands).slice(0, 4),
        ...verify.rootSmoke.slice(0, 2),
      ]).slice(0, 6),
    },
    deep: {
      label: 'Deep',
      reason: 'Use only when package-local context is insufficient or the fan-out is unusually high.',
      readFirst: deepRead,
      verifyFirst: uniquePaths([
        ...hotspots.flatMap((item) => item.verifyCommands.slice(0, 4)),
        ...verify.perPackage.flatMap((entry) => entry.commands).slice(0, 6),
        ...verify.rootSmoke.slice(0, 4),
      ]).slice(0, 8),
    },
  };
}

function suggestWriteScopeGroups(cwd, graph, options = {}) {
  const maxWorkers = Number(options.maxWorkers || 4);
  const packageIds = pickTopPackages(graph, { limit: maxWorkers });
  const slices = buildPackageSlices(graph, packageIds);
  return slices.filter((slice) => slice.packagePath !== '.').map((slice) => ({
    worker: slice.worker,
    paths: [slice.packagePath],
    packageId: slice.packageId,
    packageName: slice.packageName,
  }));
}

function renderMarkdown(cwd, rootDir, intelligence) {
  const lines = [
    '# MONOREPO INTELLIGENCE',
    '',
    `- Generated at: \`${intelligence.generatedAt}\``,
    `- Repo shape: \`${intelligence.repoShape}\``,
    `- Package count: \`${intelligence.packageCount}\``,
    `- Changed packages: \`${intelligence.changedPackages.length > 0 ? intelligence.changedPackages.join(', ') : 'none'}\``,
    `- Impacted packages: \`${intelligence.impactedPackages.length > 0 ? intelligence.impactedPackages.join(', ') : 'none'}\``,
    `- Impacted tests: \`${intelligence.impactedTests.length}\``,
    `- Package manager: \`${intelligence.verify.manager}\``,
    '',
    '## Workspace Discovery',
    '',
    ...(intelligence.workspaceDiscovery?.sources?.length > 0
      ? [
        `- Sources: \`${intelligence.workspaceDiscovery.sources.join(', ')}\``,
        `- Patterns: \`${(intelligence.workspaceDiscovery.patterns || []).join(', ') || 'none'}\``,
        `- Directories: \`${(intelligence.workspaceDiscovery.directories || []).join(', ') || 'none'}\``,
      ]
      : ['- `No workspace metadata source was detected beyond the root package.`']),
    '',
    '## Recommended Write Shards',
    '',
    ...(intelligence.writeScopes.length > 0
      ? intelligence.writeScopes.map((scope) => `- \`${scope.worker}\` → \`${scope.paths.join(', ')}\` (${scope.packageName})`)
      : ['- `No package-local write shard suggestion available.`']),
    '',
    '## Review Shards',
    '',
    ...(intelligence.reviewShards.length > 0
      ? intelligence.reviewShards.map((shard) => `- \`${shard.id}\` → ${shard.focus} (scope: \`${shard.readScope.join(', ')}\`)`)
      : ['- `No review shard suggestion available.`']),
    '',
    '## Hotspots',
    '',
    ...(intelligence.hotspots.length > 0
      ? intelligence.hotspots.map((hotspot) => `- \`${hotspot.packageName}\` score=${hotspot.score} → ${hotspot.reason} (read first: \`${hotspot.readFirst.join(', ')}\`)`)
      : ['- `No hotspots were inferred.`']),
    '',
    '## Context Slices',
    '',
    ...(intelligence.contextSlices.length > 0
      ? intelligence.contextSlices.flatMap((slice) => ([
        `### ${slice.label}`,
        '',
        `- ${slice.reason}`,
        ...(slice.readFirst?.length ? [`- Read first: \`${slice.readFirst.join(', ')}\``] : []),
        ...(slice.verifyFirst?.length ? [`- Verify first: \`${slice.verifyFirst.join(' | ')}\``] : []),
        '',
      ]))
      : ['- `No context slices were inferred.`']),
    '## Targeted Verify',
    '',
    ...(intelligence.verify.perPackage.flatMap((entry) => (
      entry.commands.length > 0
        ? [
          `### ${entry.packageName}`,
          '',
          ...entry.commands.map((command) => `- \`${command}\``),
          '',
        ]
        : []
    ))),
    ...(intelligence.verify.rootSmoke.length > 0
      ? [
        '### Root smoke',
        '',
        ...intelligence.verify.rootSmoke.map((command) => `- \`${command}\``),
        '',
      ]
      : []),
    '## Context Budgets',
    '',
    ...Object.entries(intelligence.contextBudgetPlan).flatMap(([name, budget]) => ([
      `### ${name}`,
      '',
      `- ${budget.reason}`,
      ...(budget.readFirst.length > 0 ? [`- Read first: \`${budget.readFirst.join(', ')}\``] : []),
      ...(budget.verifyFirst.length > 0 ? [`- Verify first: \`${budget.verifyFirst.join(' | ')}\``] : []),
      '',
    ])),
    '## Agent Plan',
    '',
    ...(intelligence.agentPlan.scout.length > 0
      ? intelligence.agentPlan.scout.flatMap((task) => ([
        `### ${task.id}`,
        '',
        `- Mode: \`${task.mode}\``,
        `- Focus: \`${task.focus}\``,
        ...(task.readFirst?.length ? [`- Read first: \`${task.readFirst.join(', ')}\``] : []),
        `- Outcome: ${task.outcome}`,
        '',
      ]))
      : ['- `No scout wave was inferred.`', '']),
    ...(intelligence.agentPlan.fix.length > 0
      ? intelligence.agentPlan.fix.flatMap((task) => ([
        `### ${task.id}`,
        '',
        `- Mode: \`${task.mode}\``,
        `- Focus: \`${task.focus}\``,
        ...(task.scopePaths?.length ? [`- Scope: \`${task.scopePaths.join(', ')}\``] : []),
        ...(task.verifyFirst?.length ? [`- Verify first: \`${task.verifyFirst.join(' | ')}\``] : []),
        `- Outcome: ${task.outcome}`,
        '',
      ]))
      : ['- `No bounded write wave was inferred.`', '']),
    ...(intelligence.agentPlan.verify.length > 0
      ? intelligence.agentPlan.verify.flatMap((task) => ([
        `### ${task.id}`,
        '',
        `- Mode: \`${task.mode}\``,
        `- Focus: \`${task.focus}\``,
        ...(task.commands?.length ? task.commands.map((command) => `- Verify: \`${command}\``) : []),
        `- Outcome: ${task.outcome}`,
        '',
      ]))
      : ['- `No targeted verify wave was inferred.`', '']),
    '## Performance Levers',
    '',
    ...(intelligence.performanceLevers.length > 0
      ? intelligence.performanceLevers.map((item) => `- ${item}`)
      : ['- `No extra performance lever was inferred.`']),
    '',
    '## Performance Notes',
    '',
    ...(intelligence.performanceRisks.length > 0
      ? intelligence.performanceRisks.map((item) => `- ${item}`)
      : ['- `No major monorepo-specific performance risk detected.`']),
  ];

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildMonorepoIntelligence(cwd, rootDir, options = {}) {
  const graph = buildPackageGraph(cwd, {
    writeFiles: true,
    changedFiles: options.changedFiles,
  });
  const manager = detectPackageManager(cwd);
  const writeScopes = suggestWriteScopeGroups(cwd, graph, options);
  const slices = buildPackageSlices(graph, writeScopes.map((scope) => scope.packageId));
  const verify = buildVerifyPlan(cwd, graph, slices, manager);
  const reviewShards = buildReviewShards(graph, slices);
  const hotspots = buildHotspots(graph, slices, verify);
  const contextSlices = buildContextSlices(graph, writeScopes, hotspots, reviewShards, verify);
  const contextBudgetPlan = buildContextBudgetPlan(hotspots, reviewShards, writeScopes, verify);
  const performanceRisks = buildPerformanceRisks(graph, slices);
  const performanceLevers = buildPerformanceLevers(graph, writeScopes, hotspots, verify);
  const agentPlan = buildAgentPlan(writeScopes, hotspots, verify);
  const intelligence = {
    generatedAt: new Date().toISOString(),
    repoShape: graph.repoShape,
    packageCount: graph.packageCount,
    changedPackages: graph.changedPackages || [],
    impactedPackages: graph.impactedPackages || [],
    impactedTests: graph.impactedTests || [],
    workspaceDiscovery: graph.workspaceDiscovery || { sources: [], patterns: [], directories: [] },
    writeScopes,
    reviewShards,
    hotspots,
    contextSlices,
    contextBudgetPlan,
    verify,
    performanceRisks,
    performanceLevers,
    agentPlan,
    packageSlices: slices,
  };

  if (options.writeFiles !== false) {
    const jsonPath = path.join(cwd, '.workflow', 'cache', 'monorepo-intelligence.json');
    const markdownPath = path.join(rootDir, 'MONOREPO.md');
    writeJson(jsonPath, intelligence);
    writeMarkdown(markdownPath, renderMarkdown(cwd, rootDir, intelligence));
    intelligence.jsonFile = relativePath(cwd, jsonPath);
    intelligence.markdownFile = relativePath(cwd, markdownPath);
  }

  return intelligence;
}

function printHelp() {
  console.log(`
monorepo

Usage:
  node scripts/workflow/monorepo.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --max-workers <n>   Maximum write shards to suggest (default: 4)
  --json              Print machine-readable output
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
  const payload = buildMonorepoIntelligence(cwd, rootDir, {
    maxWorkers: args['max-workers'],
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# MONOREPO\n');
  console.log(`- Repo shape: \`${payload.repoShape}\``);
  console.log(`- Package count: \`${payload.packageCount}\``);
  console.log(`- Changed packages: \`${payload.changedPackages.length}\``);
  console.log(`- Impacted packages: \`${payload.impactedPackages.length}\``);
  console.log(`- Hotspots: \`${payload.hotspots.length}\``);
  if (payload.markdownFile) {
    console.log(`- File: \`${payload.markdownFile}\``);
  }
  if (payload.jsonFile) {
    console.log(`- Cache: \`${payload.jsonFile}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMonorepoIntelligence,
  suggestWriteScopeGroups,
  main,
};
