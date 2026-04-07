const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  ensureDir,
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const {
  loadTargetRuntimeScripts,
  patchPackageJsonScripts,
  sourceLayout,
  writeProductManifest,
  writeVersionMarker,
} = require('./install_common');
const { readJsonIfExists } = require('./runtime_helpers');

function printHelp() {
  console.log(`
repair

Usage:
  node scripts/workflow/repair.js [--kind doctor|health]

Options:
  --kind <doctor|health>  Repair lens. Defaults to doctor
  --root <path>           Workflow root. Defaults to active workstream root
  --apply                 Apply safe runtime fixes
  --json                  Print machine-readable output
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJsonValidity(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, valid: true };
  }
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { exists: true, valid: true };
  } catch {
    return { exists: true, valid: false };
  }
}

function expectedRuntimeFiles() {
  const source = sourceLayout();
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push({
          source: fullPath,
          relative: relativePath(source.repoRoot, fullPath),
        });
      }
    }
  };

  visit(source.scriptsDir);
  visit(source.cliDir);
  files.push({ source: source.binFile, relative: relativePath(source.repoRoot, source.binFile) });
  files.push({ source: source.compareScript, relative: relativePath(source.repoRoot, source.compareScript) });
  files.push({ source: source.skillFile, relative: '.agents/skills/codex-workflow/SKILL.md' });
  return files;
}

function readProductManifest(cwd) {
  const filePath = path.join(cwd, '.workflow', 'product-manifest.json');
  return readJsonIfExists(filePath);
}

function readPackageScripts(cwd) {
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { valid: true, scripts: {} };
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return {
      valid: true,
      scripts: packageJson.scripts || {},
    };
  } catch (error) {
    return {
      valid: false,
      scripts: {},
      error: String(error.message || error),
    };
  }
}

function buildRepairPlan(cwd, rootDir, options = {}) {
  const kind = options.kind === 'health' ? 'health' : 'doctor';
  const runtimeIssues = [];
  const manualIssues = [];
  const actions = [];
  const productManifest = readProductManifest(cwd);

  const statePath = path.join(cwd, '.workflow', 'state.json');
  const fsIndexPath = path.join(cwd, '.workflow', 'fs-index.json');
  const packetCachePath = path.join(cwd, '.workflow', 'cache', 'packet-snapshot-cache.json');
  const hudRuntimePath = path.join(cwd, '.workflow', 'runtime', 'hud.json');
  const launchRuntimePath = path.join(cwd, '.workflow', 'runtime', 'launch.json');
  const managerRuntimePath = path.join(cwd, '.workflow', 'runtime', 'manager.json');
  const manifestPath = path.join(cwd, '.workflow', 'product-manifest.json');
  const versionPath = path.join(cwd, '.workflow', 'VERSION.md');

  for (const filePath of [statePath, fsIndexPath, packetCachePath, hudRuntimePath, launchRuntimePath, managerRuntimePath]) {
    const status = readJsonValidity(filePath);
    if (status.exists && !status.valid) {
      runtimeIssues.push({
        type: 'corrupt_json',
        filePath: relativePath(cwd, filePath),
      });
    }
  }

  if (!fs.existsSync(manifestPath)) {
    runtimeIssues.push({
      type: 'missing_manifest',
      filePath: relativePath(cwd, manifestPath),
    });
  }
  if (!fs.existsSync(versionPath)) {
    runtimeIssues.push({
      type: 'missing_version_marker',
      filePath: relativePath(cwd, versionPath),
    });
  }

  const expectedScripts = productManifest?.runtimeScripts || loadTargetRuntimeScripts();
  const packageScripts = readPackageScripts(cwd);
  if (!packageScripts.valid) {
    manualIssues.push({
      type: 'invalid_package_json',
      command: 'Fix package.json JSON syntax before applying workflow repairs.',
      reason: packageScripts.error || 'package.json could not be parsed.',
    });
  } else {
    const missingScripts = Object.keys(expectedScripts).filter((name) => packageScripts.scripts[name] !== expectedScripts[name]);
    if (missingScripts.length > 0) {
      runtimeIssues.push({
        type: 'runtime_script_drift',
        scripts: missingScripts,
      });
    }
  }

  const missingRuntimeFiles = (productManifest?.runtimeFiles
    ? productManifest.runtimeFiles.map((relativeFile) => ({ relative: relativeFile }))
    : expectedRuntimeFiles())
    .filter((entry) => !fs.existsSync(path.join(cwd, entry.relative)))
    .map((entry) => entry.relative);
  if (missingRuntimeFiles.length > 0) {
    runtimeIssues.push({
      type: 'missing_runtime_files',
      files: missingRuntimeFiles,
    });
  }

  if (kind === 'health') {
    const healthReport = options.healthReport;
    for (const check of healthReport?.checks || []) {
      if (check.status === 'pass') {
        continue;
      }
      if (String(check.message).includes('packet hash must not be stale') || String(check.message).includes('input hash must be present')) {
        manualIssues.push({
          type: 'packet_sync_needed',
          command: 'node scripts/workflow/build_packet.js --all --sync',
          reason: check.message,
        });
      }
      if (String(check.message).includes('VALIDATION') || String(check.message).includes('Validation')) {
        manualIssues.push({
          type: 'validation_contract',
          command: 'cwf explore --workflow',
          reason: check.message,
        });
      }
    }
  }

  for (const issue of runtimeIssues) {
    if (issue.type === 'corrupt_json') {
      actions.push({
        safe: true,
        label: `Remove corrupt runtime JSON -> ${issue.filePath}`,
        apply() {
          fs.rmSync(path.join(cwd, issue.filePath), { force: true });
        },
      });
    }
    if (issue.type === 'missing_manifest') {
      actions.push({
        safe: true,
        label: 'Regenerate product manifest',
        apply() {
          writeProductManifest(cwd);
        },
      });
    }
    if (issue.type === 'missing_version_marker') {
      actions.push({
        safe: true,
        label: 'Regenerate product version marker',
        apply() {
          writeVersionMarker(cwd, { mode: 'repair' });
        },
      });
    }
    if (issue.type === 'runtime_script_drift') {
      actions.push({
        safe: true,
        label: `Patch package.json workflow scripts (${issue.scripts.length})`,
        apply() {
          patchPackageJsonScripts(cwd, {
            overwriteConflicts: true,
            runtimeScriptsOverride: expectedScripts,
          });
        },
      });
    }
    if (issue.type === 'missing_runtime_files') {
      actions.push({
        safe: true,
        label: `Restore missing runtime files (${issue.files.length})`,
        apply() {
          const source = sourceLayout();
          for (const relativeFile of issue.files) {
            let sourcePath = path.join(source.repoRoot, relativeFile);
            if (relativeFile === '.agents/skills/codex-workflow/SKILL.md') {
              sourcePath = source.skillFile;
            }
            const targetPath = path.join(cwd, relativeFile);
            ensureDir(path.dirname(targetPath));
            fs.copyFileSync(sourcePath, targetPath);
          }
        },
      });
    }
  }

  return {
    kind,
    rootDir: relativePath(cwd, rootDir),
    runtimeIssues,
    manualIssues,
    safeActionCount: actions.length,
    actions,
  };
}

function applyRepairPlan(cwd, rootDir, plan) {
  const applied = [];
  for (const action of plan.actions) {
    action.apply();
    applied.push(action.label);
  }

  try {
    childProcess.execFileSync(
      process.execPath,
      [path.join(__dirname, 'hud.js'), '--root', relativePath(cwd, rootDir), '--json'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    // Best-effort runtime regeneration only.
  }
  try {
    childProcess.execFileSync(
      process.execPath,
      [path.join(__dirname, 'explore.js'), '--repo', '--root', relativePath(cwd, rootDir), '--json'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    // Best-effort runtime regeneration only.
  }

  return {
    applied,
    rootDir: relativePath(cwd, rootDir),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const healthReport = args.kind === 'health'
    ? JSON.parse(childProcess.execFileSync(
      process.execPath,
      [path.join(__dirname, 'health.js'), '--root', relativePath(cwd, rootDir), '--json'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ))
    : null;
  const plan = buildRepairPlan(cwd, rootDir, {
    kind: args.kind,
    healthReport,
  });
  const applied = args.apply ? applyRepairPlan(cwd, rootDir, plan) : null;

  if (args.json) {
    console.log(JSON.stringify({
      ...plan,
      actions: plan.actions.map((action) => action.label),
      applied,
    }, null, 2));
    return;
  }

  console.log('# REPAIR\n');
  console.log(`- Kind: \`${plan.kind}\``);
  console.log(`- Safe actions: \`${plan.safeActionCount}\``);
  console.log(`- Manual issues: \`${plan.manualIssues.length}\``);
  console.log('\n## Safe Actions\n');
  if (plan.actions.length === 0) {
    console.log('- `No safe runtime fixes are pending`');
  } else {
    for (const action of plan.actions) {
      console.log(`- ${action.label}`);
    }
  }
  console.log('\n## Manual Follow-up\n');
  if (plan.manualIssues.length === 0) {
    console.log('- `No manual follow-up currently required`');
  } else {
    for (const issue of plan.manualIssues) {
      console.log(`- \`${issue.command}\` -> ${issue.reason}`);
    }
  }
  if (applied) {
    console.log('\n## Applied\n');
    for (const label of applied.applied) {
      console.log(`- ${label}`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  applyRepairPlan,
  buildRepairPlan,
};
