const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveTargetRepoArg } = require('./common');
const {
  readProductManifest,
  sourceLayout,
  loadTargetRuntimeScripts,
  productManifestPath,
  versionMarkerPath,
} = require('./install_common');
const { contractPayload } = require('./contract_versions');
const { generatedArtifactPaths } = require('./generated_artifacts');

function printHelp() {
  console.log(`
uninstall

Usage:
  node scripts/workflow/uninstall.js [/path/to/repo] [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --purge-docs           Remove docs/workflow as well as generated runtime state
  --dry-run              Show what would be removed
  --json                 Print machine-readable output
  `);
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isPathInside(rootDir, candidatePath) {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInstalledTargetPath(targetRepo, value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const repoRoot = path.resolve(targetRepo);
  const candidate = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(repoRoot, raw);
  if (!isPathInside(repoRoot, candidate)) {
    return null;
  }
  return candidate;
}

function maybeRemove(targetPath, report, dryRun, options = {}) {
  const rawPath = options.rawPath || targetPath;
  const safe = options.safe !== false;
  if (safe && !targetPath) {
    report.blocked.push(String(rawPath || ''));
    return false;
  }

  if (!fs.existsSync(targetPath)) {
    report.skipped.push(targetPath);
    return false;
  }

  if (!dryRun) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  report.removed.push(targetPath);
  return true;
}

function cleanupEmptyParents(startPath, stopPath, dryRun) {
  let current = path.dirname(startPath);
  const absoluteStop = path.resolve(stopPath);
  while (current.startsWith(absoluteStop) && current !== absoluteStop) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) {
      break;
    }
    if (!dryRun) {
      fs.rmdirSync(current);
    }
    current = path.dirname(current);
  }
}

function runtimeScriptFiles() {
  const scriptsDir = sourceLayout().scriptsDir;
  return walkFiles(scriptsDir)
    .map((filePath) => path.relative(scriptsDir, filePath));
}

function runtimeCliFiles() {
  const cliDir = sourceLayout().cliDir;
  return walkFiles(cliDir)
    .map((filePath) => path.relative(cliDir, filePath));
}

function installedSkillDirectories() {
  const source = sourceLayout();
  const directories = new Set(['raiola', 'codex-workflow']);
  if (!fs.existsSync(source.skillsDir)) {
    return [...directories];
  }

  for (const entry of fs.readdirSync(source.skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      directories.add(entry.name);
    }
  }
  return [...directories];
}

function fallbackInstalledRuntimePaths() {
  const paths = [];
  for (const relativeScript of runtimeScriptFiles()) {
    paths.push(path.join('scripts', 'workflow', relativeScript).replace(/\\/g, '/'));
  }
  for (const relativeScript of runtimeCliFiles()) {
    paths.push(path.join('scripts', 'cli', relativeScript).replace(/\\/g, '/'));
  }
  for (const entry of [
    'bin/rai.js',
    'bin/raiola.js',
    'bin/raiola-on.js',
    'bin/raiola-mcp.js',
    'bin/cwf.js',
    'scripts/compare_golden_snapshots.ts',
    '.workflowignore',
    '.agents/plugins/marketplace.json',
  ]) {
    paths.push(entry);
  }
  for (const skillDir of installedSkillDirectories()) {
    paths.push(`.agents/skills/${skillDir}`);
  }
  return [...new Set(paths)];
}

function installedRuntimeCleanupPlan(targetRepo) {
  const manifest = readProductManifest(targetRepo);
  const manifestRuntimeFiles = Array.isArray(manifest?.runtimeFiles)
    ? manifest.runtimeFiles.filter(Boolean)
    : [];
  return {
    manifest,
    runtimePaths: manifestRuntimeFiles.length > 0 ? [...new Set(manifestRuntimeFiles)] : fallbackInstalledRuntimePaths(),
  };
}

function removePackageScripts(targetRepo, dryRun) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const report = {
    removed: [],
    kept: [],
    conflicts: [],
  };

  if (!fs.existsSync(packageJsonPath)) {
    return report;
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const scripts = { ...(pkg.scripts || {}) };
  const runtimeScripts = loadTargetRuntimeScripts();

  for (const [name, expected] of Object.entries(runtimeScripts)) {
    if (!(name in scripts)) {
      continue;
    }

    if (scripts[name] !== expected) {
      report.conflicts.push({ name, existing: scripts[name], expected });
      continue;
    }

    delete scripts[name];
    report.removed.push(name);
  }

  for (const [name, expected] of [
    ['rai', 'node bin/rai.js'],
    ['raiola', 'node bin/raiola.js'],
    ['raiola-on', 'node bin/raiola-on.js'],
    ['cwf', 'node bin/cwf.js'],
  ]) {
    if (!(name in scripts)) {
      continue;
    }

    if (scripts[name] !== expected) {
      report.conflicts.push({ name, existing: scripts[name], expected });
      continue;
    }

    delete scripts[name];
    report.removed.push(name);
  }

  if (!dryRun) {
    pkg.scripts = scripts;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else {
    report.kept = Object.keys(scripts);
  }

  return report;
}

function generatedArtifactCleanupPlan(targetRepo) {
  const manifest = readProductManifest(targetRepo);
  const manifestGenerated = manifest?.generatedArtifacts || null;
  const generatedRoots = manifestGenerated?.generatedArtifactRoots || [];
  const generatedFiles = manifestGenerated?.generatedArtifactFiles || [];
  const manifestPaths = generatedRoots.length > 0 || generatedFiles.length > 0
    ? [...generatedRoots, ...generatedFiles]
    : generatedArtifactPaths();
  return {
    manifest,
    generatedPaths: [...new Set(manifestPaths)],
  };
}

function buildReport(targetRepo, purgeDocs) {
  const cleanupPlan = generatedArtifactCleanupPlan(targetRepo);
  const runtimePlan = installedRuntimeCleanupPlan(targetRepo);
  return {
    ...contractPayload('uninstallReport'),
    generatedAt: new Date().toISOString(),
    targetRepo,
    purgeDocs,
    removed: [],
    skipped: [],
    blocked: [],
    preserved: [
      'docs/workflow unless --purge-docs is explicitly requested',
    ],
    packageScripts: null,
    installedRuntime: {
      cleanupCoverage: runtimePlan.runtimePaths,
      source: runtimePlan.manifest ? 'product-manifest' : 'fallback-source-layout',
      manifestPresent: Boolean(runtimePlan.manifest),
    },
    generatedArtifacts: {
      cleanupCoverage: cleanupPlan.generatedPaths,
      source: cleanupPlan.manifest?.generatedArtifacts?.schema || 'raiola/generated-artifacts/v1',
      manifestPresent: Boolean(cleanupPlan.manifest),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = resolveTargetRepoArg(args);
  const dryRun = Boolean(args['dry-run']);
  const purgeDocs = Boolean(args['purge-docs']);
  const cleanupPlan = generatedArtifactCleanupPlan(targetRepo);
  const runtimePlan = installedRuntimeCleanupPlan(targetRepo);
  const report = buildReport(targetRepo, purgeDocs);
  const removedPaths = [];

  for (const runtimePath of runtimePlan.runtimePaths) {
    const resolvedPath = resolveInstalledTargetPath(targetRepo, runtimePath);
    if (maybeRemove(resolvedPath, report, dryRun, { rawPath: runtimePath })) {
      removedPaths.push(resolvedPath);
    }
  }

  const runtimePaths = [
    ...cleanupPlan.generatedPaths,
    productManifestPath(targetRepo),
    versionMarkerPath(targetRepo),
  ];

  for (const runtimePath of runtimePaths) {
    const resolvedPath = resolveInstalledTargetPath(targetRepo, runtimePath);
    if (maybeRemove(resolvedPath, report, dryRun, { rawPath: runtimePath })) {
      removedPaths.push(resolvedPath);
    }
  }

  if (purgeDocs) {
    const docsPath = resolveInstalledTargetPath(targetRepo, path.join('docs', 'workflow'));
    if (maybeRemove(docsPath, report, dryRun, { rawPath: 'docs/workflow' })) {
      removedPaths.push(docsPath);
    }
  }

  report.packageScripts = removePackageScripts(targetRepo, dryRun);
  for (const removedPath of removedPaths) {
    cleanupEmptyParents(removedPath, targetRepo, dryRun);
  }
  cleanupEmptyParents(path.join(targetRepo, 'package.json'), targetRepo, dryRun);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# WORKFLOW UNINSTALL\n');
  console.log(`- Target: \`${targetRepo}\``);
  console.log(`- Purge docs: \`${purgeDocs ? 'yes' : 'no'}\``);
  console.log(`- Removed paths: \`${report.removed.length}\``);
  console.log(`- Blocked paths: \`${report.blocked.length}\``);
  console.log(`- Package scripts removed: \`${report.packageScripts.removed.length}\``);
  if (report.packageScripts.conflicts.length > 0) {
    console.log(`- Package script conflicts kept: \`${report.packageScripts.conflicts.length}\``);
  }
  if (report.blocked.length > 0) {
    console.log(`- Blocked cleanup entries: \`${report.blocked.length}\``);
  }
}

main();
