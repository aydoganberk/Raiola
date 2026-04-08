const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  sourceLayout,
  loadTargetRuntimeScripts,
  productManifestPath,
  versionMarkerPath,
} = require('./install_common');

function printHelp() {
  console.log(`
uninstall

Usage:
  node scripts/workflow/uninstall.js [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --purge-docs           Remove docs/workflow as well as generated runtime state
  --dry-run              Show what would be removed
  --json                 Print machine-readable output
  `);
}

function walkFiles(dirPath, files = []) {
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

function maybeRemove(targetPath, report, dryRun) {
  if (!fs.existsSync(targetPath)) {
    report.skipped.push(targetPath);
    return;
  }

  if (!dryRun) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  report.removed.push(targetPath);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = path.resolve(process.cwd(), String(args.target || '.'));
  const dryRun = Boolean(args['dry-run']);
  const purgeDocs = Boolean(args['purge-docs']);
  const report = {
    targetRepo,
    purgeDocs,
    removed: [],
    skipped: [],
    packageScripts: null,
  };

  for (const relativeScript of runtimeScriptFiles()) {
    const targetPath = path.join(targetRepo, 'scripts', 'workflow', relativeScript);
    maybeRemove(targetPath, report, dryRun);
  }

  for (const relativeScript of runtimeCliFiles()) {
    const targetPath = path.join(targetRepo, 'scripts', 'cli', relativeScript);
    maybeRemove(targetPath, report, dryRun);
  }

  maybeRemove(path.join(targetRepo, 'bin', 'rai.js'), report, dryRun);
  maybeRemove(path.join(targetRepo, 'bin', 'raiola.js'), report, dryRun);
  maybeRemove(path.join(targetRepo, 'bin', 'raiola-on.js'), report, dryRun);
  maybeRemove(path.join(targetRepo, 'bin', 'cwf.js'), report, dryRun);
  maybeRemove(path.join(targetRepo, 'scripts', 'compare_golden_snapshots.ts'), report, dryRun);
  maybeRemove(path.join(targetRepo, '.agents', 'skills', 'raiola'), report, dryRun);
  maybeRemove(path.join(targetRepo, '.agents', 'skills', 'codex-workflow'), report, dryRun);

  const runtimePaths = [
    path.join(targetRepo, '.workflow', 'state.json'),
    path.join(targetRepo, '.workflow', 'packet-state.json'),
    path.join(targetRepo, '.workflow', 'frontend-profile.json'),
    path.join(targetRepo, '.workflow', 'delegation-plan.json'),
    path.join(targetRepo, '.workflow', 'delegation-plan.md'),
    path.join(targetRepo, '.workflow', 'quick'),
    path.join(targetRepo, '.workflow', 'orchestration'),
    path.join(targetRepo, '.workflow', 'reports'),
    path.join(targetRepo, '.workflow', 'cache'),
    path.join(targetRepo, '.workflow', 'benchmarks'),
    path.join(targetRepo, '.workflow', 'fs-index.json'),
    productManifestPath(targetRepo),
    versionMarkerPath(targetRepo),
  ];

  for (const runtimePath of runtimePaths) {
    maybeRemove(runtimePath, report, dryRun);
  }

  if (purgeDocs) {
    maybeRemove(path.join(targetRepo, 'docs', 'workflow'), report, dryRun);
  }

  report.packageScripts = removePackageScripts(targetRepo, dryRun);
  cleanupEmptyParents(path.join(targetRepo, '.agents', 'skills', 'raiola'), targetRepo, dryRun);
  cleanupEmptyParents(path.join(targetRepo, '.agents', 'skills', 'codex-workflow'), targetRepo, dryRun);
  cleanupEmptyParents(path.join(targetRepo, 'scripts', 'workflow'), targetRepo, dryRun);
  cleanupEmptyParents(path.join(targetRepo, '.workflow', 'state.json'), targetRepo, dryRun);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# WORKFLOW UNINSTALL\n');
  console.log(`- Target: \`${targetRepo}\``);
  console.log(`- Purge docs: \`${purgeDocs ? 'yes' : 'no'}\``);
  console.log(`- Removed paths: \`${report.removed.length}\``);
  console.log(`- Package scripts removed: \`${report.packageScripts.removed.length}\``);
  if (report.packageScripts.conflicts.length > 0) {
    console.log(`- Package script conflicts kept: \`${report.packageScripts.conflicts.length}\``);
  }
  console.log('\n## Safety\n');
  console.log('- Canonical workflow markdown was preserved unless `--purge-docs` was explicitly requested.');
  console.log('- Only runtime/product surfaces installed by raiola were targeted for removal.');
}

main();
