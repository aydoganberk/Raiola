const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveTargetRepoArg } = require('./common');
const {
  readProductManifest,
  loadTargetRuntimeScripts,
  runtimeFilesForScriptProfile,
  productManifestPath,
  versionMarkerPath,
} = require('./install_common');
const { contractPayload } = require('./contract_versions');
const {
  buildTrustedGeneratedArtifactInventory,
  buildTrustedRuntimeCleanupInventory,
} = require('./managed_inventory');
const {
  cleanupEmptyManagedParents,
  removeManagedPath,
  sanitizeManagedPathList,
  writeManagedText,
} = require('./io/managed_fs');

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

function trustedRuntimeInventory(targetRepo, manifest) {
  const scriptProfile = manifest?.scriptProfile || 'full';
  return buildTrustedRuntimeCleanupInventory(
    runtimeFilesForScriptProfile('full', {
      targetRepo,
      scriptProfile,
    }),
  );
}

function installedRuntimeCleanupPlan(targetRepo) {
  const manifest = readProductManifest(targetRepo);
  const runtimePaths = trustedRuntimeInventory(targetRepo, manifest);
  const blocked = sanitizeManagedPathList(manifest?.runtimeFiles || [], runtimePaths, {
    rootPath: targetRepo,
    label: 'Manifest runtime path',
  }).blocked;
  return {
    manifest,
    runtimePaths,
    blocked,
  };
}

function generatedArtifactCleanupPlan(targetRepo) {
  const manifest = readProductManifest(targetRepo);
  const generatedPaths = buildTrustedGeneratedArtifactInventory();
  const manifestGenerated = manifest?.generatedArtifacts || {};
  const blocked = sanitizeManagedPathList([
    ...(manifestGenerated.generatedArtifactRoots || []),
    ...(manifestGenerated.generatedArtifactFiles || []),
  ], generatedPaths, {
    rootPath: targetRepo,
    label: 'Manifest generated artifact path',
  }).blocked;
  return {
    manifest,
    generatedPaths,
    blocked,
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
    const writeResult = writeManagedText(targetRepo, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`, {
      inventory: ['package.json'],
      label: 'package.json',
    });
    if (!writeResult.ok) {
      throw new Error(writeResult.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
    }
  } else {
    report.kept = Object.keys(scripts);
  }

  return report;
}

function buildReport(targetRepo, purgeDocs, runtimePlan, generatedPlan) {
  return {
    ...contractPayload('uninstallReport'),
    generatedAt: new Date().toISOString(),
    targetRepo,
    purgeDocs,
    removed: [],
    skipped: [],
    blocked: [
      ...runtimePlan.blocked.map((entry) => entry.path),
      ...generatedPlan.blocked.map((entry) => entry.path),
    ].filter(Boolean),
    blockedDetails: [
      ...runtimePlan.blocked,
      ...generatedPlan.blocked,
    ],
    preserved: [
      'docs/workflow unless --purge-docs is explicitly requested',
    ],
    packageScripts: null,
    installedRuntime: {
      cleanupCoverage: runtimePlan.runtimePaths,
      source: 'trusted-runtime-inventory',
      manifestPresent: Boolean(runtimePlan.manifest),
    },
    generatedArtifacts: {
      cleanupCoverage: generatedPlan.generatedPaths,
      source: 'trusted-generated-inventory',
      manifestPresent: Boolean(generatedPlan.manifest),
    },
  };
}

function recordRemoval(report, result, relativeTarget) {
  if (!result.ok) {
    report.blocked.push(...result.blocked.map((entry) => entry.path).filter(Boolean));
    report.blockedDetails.push(...result.blocked);
    return false;
  }
  if (result.status === 'removed') {
    report.removed.push(result.absolutePath);
    cleanupEmptyManagedParents(report.targetRepo, relativeTarget);
    return true;
  }
  if (result.status === 'skipped') {
    report.skipped.push(result.absolutePath || relativeTarget);
  }
  return false;
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
  const runtimePlan = installedRuntimeCleanupPlan(targetRepo);
  const generatedPlan = generatedArtifactCleanupPlan(targetRepo);
  const report = buildReport(targetRepo, purgeDocs, runtimePlan, generatedPlan);

  const removalTargets = [
    ...runtimePlan.runtimePaths.map((relativePath) => ({
      relativePath,
      inventory: runtimePlan.runtimePaths,
      label: 'Installed runtime path',
    })),
    ...generatedPlan.generatedPaths.map((relativePath) => ({
      relativePath,
      inventory: generatedPlan.generatedPaths,
      label: 'Generated artifact path',
    })),
    {
      relativePath: '.workflow/product-manifest.json',
      inventory: ['.workflow/product-manifest.json'],
      label: 'Product manifest',
    },
    {
      relativePath: '.workflow/VERSION.md',
      inventory: ['.workflow/VERSION.md'],
      label: 'Version marker',
    },
  ];

  if (purgeDocs) {
    removalTargets.push({
      relativePath: 'docs/workflow',
      inventory: ['docs/workflow'],
      label: 'Workflow docs',
    });
  }

  for (const target of removalTargets) {
    if (dryRun) {
      const exists = fs.existsSync(path.join(targetRepo, target.relativePath));
      if (exists) {
        report.removed.push(path.join(targetRepo, target.relativePath));
      } else {
        report.skipped.push(path.join(targetRepo, target.relativePath));
      }
      continue;
    }

    const result = removeManagedPath(targetRepo, target.relativePath, {
      inventory: target.inventory,
      label: target.label,
    });
    recordRemoval(report, result, target.relativePath);
  }

  report.packageScripts = removePackageScripts(targetRepo, dryRun);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# RAIOLA UNINSTALL\n');
  console.log(`- Target: \`${targetRepo}\``);
  console.log(`- Removed: \`${report.removed.length}\``);
  console.log(`- Blocked: \`${report.blocked.length}\``);
}

main();
