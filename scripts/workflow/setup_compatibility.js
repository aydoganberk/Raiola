const fs = require('node:fs');
const path = require('node:path');
const {
  loadTargetRuntimeScripts,
  missingGitignoreEntries,
  normalizeScriptProfile,
  runtimeFilesForScriptProfile,
} = require('./install_common');
const { contractPayload } = require('./contract_versions');
const { generatedArtifactPaths, generatedArtifactRoots } = require('./generated_artifacts');

function readPackageJson(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {
      exists: false,
      path: packageJsonPath,
      value: null,
      error: '',
    };
  }
  try {
    return {
      exists: true,
      path: packageJsonPath,
      value: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')),
      error: '',
    };
  } catch (error) {
    return {
      exists: true,
      path: packageJsonPath,
      value: null,
      error: String(error.message || error),
    };
  }
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function summarizeTopRoots(runtimeFiles = []) {
  const roots = new Map();
  for (const relativeFile of runtimeFiles) {
    const first = String(relativeFile).split('/')[0] || relativeFile;
    roots.set(first, (roots.get(first) || 0) + 1);
  }
  return [...roots.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([root, count]) => ({ root, count }));
}

function existingFileDiffers(targetPath, expectedPath) {
  if (!fs.existsSync(targetPath) || !fs.existsSync(expectedPath)) {
    return false;
  }
  try {
    return fs.readFileSync(targetPath).compare(fs.readFileSync(expectedPath)) !== 0;
  } catch {
    return false;
  }
}

function detectScriptConflicts(targetRepo, scriptProfile) {
  const pkg = readPackageJson(targetRepo);
  if (!pkg.exists || !pkg.value) {
    return [];
  }
  const scripts = pkg.value.scripts || {};
  const expectedScripts = loadTargetRuntimeScripts(scriptProfile);
  return Object.entries(expectedScripts)
    .filter(([name, expected]) => Object.prototype.hasOwnProperty.call(scripts, name) && scripts[name] !== expected)
    .map(([name, expected]) => ({
      name,
      existing: scripts[name],
      expected,
    }));
}

function detectOverlayConflicts(targetRepo, runtimeFiles = []) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const trackedPrefixes = [
    '.codex/',
    '.github/',
    'scripts/workflow/',
    'scripts/cli/',
    'bin/',
    '.agents/plugins/',
    'plugins/',
  ];
  const collisions = [];
  for (const relativeFile of runtimeFiles) {
    if (!trackedPrefixes.some((prefix) => relativeFile.startsWith(prefix))) {
      continue;
    }
    const targetPath = path.join(targetRepo, relativeFile);
    const sourcePath = path.join(repoRoot, relativeFile);
    if (!fs.existsSync(targetPath)) {
      continue;
    }
    if (existingFileDiffers(targetPath, sourcePath)) {
      collisions.push({
        path: relativeFile,
        scope: relativeFile.split('/')[0],
      });
    }
  }
  return collisions;
}

function detectGithubWorkflows(targetRepo) {
  const workflowsDir = path.join(targetRepo, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }
  return fs.readdirSync(workflowsDir)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort();
}

function detectTooling(targetRepo) {
  const pkg = readPackageJson(targetRepo);
  const packageJson = pkg.value || {};
  const scripts = packageJson.scripts || {};
  const deps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  const hookManagers = [];
  if (fs.existsSync(path.join(targetRepo, '.husky')) || deps.husky || /husky/i.test(String(scripts.prepare || ''))) {
    hookManagers.push('husky');
  }
  if (fs.existsSync(path.join(targetRepo, 'lefthook.yml')) || fs.existsSync(path.join(targetRepo, '.lefthook.yml')) || deps.lefthook) {
    hookManagers.push('lefthook');
  }
  if (packageJson['simple-git-hooks'] || deps['simple-git-hooks']) {
    hookManagers.push('simple-git-hooks');
  }
  if (packageJson['lint-staged'] || deps['lint-staged']) {
    hookManagers.push('lint-staged');
  }

  const linters = [];
  if (deps.eslint || scripts.lint || fs.existsSync(path.join(targetRepo, '.eslintrc')) || fs.existsSync(path.join(targetRepo, 'eslint.config.js'))) {
    linters.push('eslint');
  }
  if (deps.prettier || fs.existsSync(path.join(targetRepo, '.prettierrc')) || fs.existsSync(path.join(targetRepo, 'prettier.config.js'))) {
    linters.push('prettier');
  }
  if (deps.biome || fs.existsSync(path.join(targetRepo, 'biome.json')) || fs.existsSync(path.join(targetRepo, 'biome.jsonc'))) {
    linters.push('biome');
  }

  return {
    packageJson: {
      exists: pkg.exists,
      invalid: pkg.exists && !pkg.value,
      path: relativePath(targetRepo, pkg.path),
    },
    hookManagers,
    linters,
    ciWorkflows: detectGithubWorkflows(targetRepo),
    agentDirs: {
      codex: fs.existsSync(path.join(targetRepo, '.codex')),
      claude: fs.existsSync(path.join(targetRepo, '.claude')),
      workflow: fs.existsSync(path.join(targetRepo, '.workflow')),
    },
  };
}

function buildCompatibilityRisks(targetRepo, scriptProfile, options = {}) {
  const runtimeFiles = runtimeFilesForScriptProfile(scriptProfile, { targetRepo });
  const scriptConflicts = detectScriptConflicts(targetRepo, scriptProfile);
  const overlayConflicts = detectOverlayConflicts(targetRepo, runtimeFiles);
  const tooling = detectTooling(targetRepo);
  const missingIgnoreEntries = options.manageGitignore === false
    ? []
    : missingGitignoreEntries(targetRepo);
  const risks = [];

  if (tooling.packageJson.invalid) {
    risks.push({
      severity: 'high',
      id: 'package-json-invalid',
      summary: 'package.json is present but invalid JSON.',
      remedy: 'Fix package.json syntax before running rai setup/update.',
    });
  }
  if (scriptConflicts.length > 0) {
    risks.push({
      severity: 'high',
      id: 'package-script-collision',
      summary: `${scriptConflicts.length} existing package.json script${scriptConflicts.length === 1 ? '' : 's'} differ from Raiola-managed entries.`,
      remedy: 'Inspect the dry-run report and use --overwrite-scripts only when you explicitly want Raiola to replace those mappings.',
      sample: scriptConflicts.slice(0, 6).map((entry) => entry.name),
    });
  }
  if (overlayConflicts.length > 0) {
    risks.push({
      severity: 'medium',
      id: 'managed-surface-overlap',
      summary: `${overlayConflicts.length} managed runtime/control-plane file${overlayConflicts.length === 1 ? '' : 's'} already exist with different content.`,
      remedy: 'Review the overlapping .codex/.github/scripts/bin files before updating an existing customized install.',
      sample: overlayConflicts.slice(0, 8).map((entry) => entry.path),
    });
  }
  if (tooling.agentDirs.codex) {
    risks.push({
      severity: overlayConflicts.some((entry) => entry.path.startsWith('.codex/')) ? 'medium' : 'note',
      id: 'codex-layer-present',
      summary: 'A repo-local .codex directory already exists.',
      remedy: 'Run setup with --dry-run first so the exact Codex-layer overlap is visible before files are refreshed.',
    });
  }
  if (tooling.agentDirs.claude) {
    risks.push({
      severity: 'note',
      id: 'claude-layer-present',
      summary: 'A repo-local .claude directory already exists.',
      remedy: 'Raiola setup does not currently overwrite .claude by default, but review any parallel agent wiring before sharing the same repo automation surface.',
    });
  }
  if (tooling.hookManagers.length > 0) {
    risks.push({
      severity: 'note',
      id: 'existing-hook-manager',
      summary: `Existing Git hook/tooling manager detected: ${tooling.hookManagers.join(', ')}.`,
      remedy: 'Raiola does not install Git hooks directly, but check hook order and side effects if your agent runner shells through commit/push flows.',
    });
  }
  if (tooling.ciWorkflows.length > 0) {
    risks.push({
      severity: 'note',
      id: 'ci-present',
      summary: `${tooling.ciWorkflows.length} GitHub workflow file${tooling.ciWorkflows.length === 1 ? '' : 's'} already exist.`,
      remedy: 'Review the generated codex-review workflow alongside your existing CI/release flows before enabling it in team automation.',
      sample: tooling.ciWorkflows.slice(0, 6),
    });
  }
  if (missingIgnoreEntries.length > 0) {
    risks.push({
      severity: 'note',
      id: 'gitignore-gap',
      summary: `Setup would add ${missingIgnoreEntries.length} .gitignore entr${missingIgnoreEntries.length === 1 ? 'y' : 'ies'} for workflow runtime state.`,
      remedy: 'Use --skip-gitignore if your repo manages ignore rules elsewhere, otherwise let setup add the standard runtime ignore entries.',
      sample: missingIgnoreEntries,
    });
  }

  return {
    runtimeFiles,
    scriptConflicts,
    overlayConflicts,
    tooling,
    missingIgnoreEntries,
    risks,
  };
}

function verdictFromRisks(risks = []) {
  if (risks.some((entry) => entry.severity === 'high')) {
    return 'high-risk';
  }
  if (risks.some((entry) => entry.severity === 'medium')) {
    return 'review';
  }
  return 'compatible';
}

function buildSetupCompatibilityReport(targetRepo, options = {}) {
  const scriptProfile = normalizeScriptProfile(options.scriptProfile, 'full');
  const compatibility = buildCompatibilityRisks(targetRepo, scriptProfile, options);
  const recommendedFlags = [];
  if (compatibility.scriptConflicts.length > 0 && !recommendedFlags.includes('--overwrite-scripts')) {
    recommendedFlags.push('--overwrite-scripts');
  }
  if (options.manageGitignore !== false && compatibility.missingIgnoreEntries.length > 0 && !recommendedFlags.includes('--skip-gitignore')) {
    recommendedFlags.push('--skip-gitignore');
  }

  const plannedRoots = summarizeTopRoots(compatibility.runtimeFiles);
  return {
    ...contractPayload('installCompatibility'),
    generatedAt: new Date().toISOString(),
    targetRepo,
    scriptProfile,
    verdict: verdictFromRisks(compatibility.risks),
    detectedTooling: compatibility.tooling,
    plannedMutations: {
      runtimeFileCount: compatibility.runtimeFiles.length,
      runtimeTopRoots: plannedRoots,
      packageJsonScriptsManaged: Object.keys(loadTargetRuntimeScripts(scriptProfile)).length,
      gitignoreWillBePatched: options.manageGitignore !== false && compatibility.missingIgnoreEntries.length > 0,
      touches: [
        'package.json',
        options.manageGitignore === false ? null : '.gitignore',
        ...plannedRoots.map((entry) => entry.root),
      ].filter(Boolean),
    },
    risks: compatibility.risks,
    conflicts: {
      packageScripts: compatibility.scriptConflicts,
      managedFiles: compatibility.overlayConflicts,
    },
    recommendedFlags,
    rollback: {
      command: `rai uninstall --target ${JSON.stringify(targetRepo)}`,
      generatedArtifactRoots: generatedArtifactRoots(),
      generatedArtifactPaths: generatedArtifactPaths(),
      preserves: ['docs/workflow unless --purge-docs is explicitly requested'],
    },
  };
}

module.exports = {
  buildSetupCompatibilityReport,
  detectScriptConflicts,
  detectTooling,
};
