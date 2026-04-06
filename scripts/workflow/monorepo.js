
const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, parseArgs, readIfExists, resolveWorkflowRoot } = require('./common');
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
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function writeMarkdown(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${String(content).trimEnd()}\n`);
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
  const performanceRisks = buildPerformanceRisks(graph, slices);
  const intelligence = {
    generatedAt: new Date().toISOString(),
    repoShape: graph.repoShape,
    packageCount: graph.packageCount,
    changedPackages: graph.changedPackages || [],
    impactedPackages: graph.impactedPackages || [],
    impactedTests: graph.impactedTests || [],
    writeScopes,
    reviewShards,
    verify,
    performanceRisks,
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
