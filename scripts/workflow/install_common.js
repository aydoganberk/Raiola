const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  embeddedProductMeta,
  isKnownProductName,
  productName,
  productCommandName,
  productVersion,
  } = require('./product_version');
const { doSetup: seedCodexControl } = require('./codex_control_catalog');
const {
  PACKET_VERSION,
  buildPacketSnapshot,
  computeWindowStatus,
  controlPaths,
  ensureField,
  ensureSection,
  extractSection,
  getFieldValue,
  parseWorkstreamTable,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  syncStablePacketSet,
  tryExtractSection,
  syncWindowDocument,
  today,
  workflowPaths,
} = require('./common');
const {
  ensureDir,
  readText: read,
  writeText: write,
} = require('./io/files');
const {
  cleanupEmptyManagedParents,
  copyManagedFile,
  copyManagedTree,
  preflightManagedPaths,
  removeManagedPath,
  writeManagedText,
} = require('./io/managed_fs');
const { readRuntimeScriptCatalog } = require('./runtime_script_catalog');
const { CLI_CONTRACT_VERSION, contractPayload, manifestSchemaMap } = require('./contract_versions');
const { buildGeneratedArtifactsManifest } = require('./generated_artifacts');
const { buildTrustedRuntimeCleanupInventory, uniqueNormalizedPaths } = require('./managed_inventory');
const { normalizeProductManifest } = require('./product_manifest');

function slugifyName(value) {
  return String(value || 'workflow-repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow-repo';
}

function sourceRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function layoutFromRoot(repoRoot) {
  return {
    repoRoot,
    templatesDir: path.join(repoRoot, 'templates', 'workflow'),
    scriptsDir: path.join(repoRoot, 'scripts', 'workflow'),
    cliDir: path.join(repoRoot, 'scripts', 'cli'),
    binFile: path.join(repoRoot, 'bin', 'rai.js'),
    aliasBinFiles: [
      path.join(repoRoot, 'bin', 'raiola.js'),
      path.join(repoRoot, 'bin', 'raiola-on.js'),
      path.join(repoRoot, 'bin', 'raiola-mcp.js'),
    ],
    compareScript: path.join(repoRoot, 'scripts', 'compare_golden_snapshots.ts'),
    skillFile: path.join(repoRoot, 'skill', 'SKILL.md'),
    skillsDir: path.join(repoRoot, 'skills'),
    codexDir: path.join(repoRoot, '.codex'),
    agentsPluginsDir: path.join(repoRoot, '.agents', 'plugins'),
    pluginsDir: path.join(repoRoot, 'plugins'),
    githubCodexDir: path.join(repoRoot, '.github', 'codex'),
    codexWorkflowFile: path.join(repoRoot, '.github', 'workflows', 'codex-review.yml'),
    scriptsAgentsFile: path.join(repoRoot, 'scripts', 'AGENTS.md'),
    workflowAgentsFile: path.join(repoRoot, 'scripts', 'workflow', 'AGENTS.md'),
    githubAgentsFile: path.join(repoRoot, '.github', 'AGENTS.md'),
    docsAgentsFile: path.join(repoRoot, 'docs', 'AGENTS.md'),
    docsWorkflowAgentsFile: path.join(repoRoot, 'docs', 'workflow', 'AGENTS.md'),
    skillsAgentsFile: path.join(repoRoot, 'skills', 'AGENTS.md'),
    githubCodexAgentsFile: path.join(repoRoot, '.github', 'codex', 'AGENTS.md'),
    pluginsAgentsFile: path.join(repoRoot, 'plugins', 'AGENTS.md'),
    pluginPackageAgentsFile: path.join(repoRoot, 'plugins', 'raiola-codex-optimizer', 'AGENTS.md'),
    packageJson: path.join(repoRoot, 'package.json'),
    workflowIgnore: path.join(repoRoot, '.workflowignore'),
  };
}

function layoutFromInstalledRoot(repoRoot) {
  return {
    repoRoot,
    templatesDir: path.join(repoRoot, 'templates', 'workflow'),
    scriptsDir: path.join(repoRoot, 'scripts', 'workflow'),
    cliDir: path.join(repoRoot, 'scripts', 'cli'),
    binFile: path.join(repoRoot, 'bin', 'rai.js'),
    aliasBinFiles: [
      path.join(repoRoot, 'bin', 'raiola.js'),
      path.join(repoRoot, 'bin', 'raiola-on.js'),
      path.join(repoRoot, 'bin', 'raiola-mcp.js'),
    ],
    compareScript: path.join(repoRoot, 'scripts', 'compare_golden_snapshots.ts'),
    skillFile: path.join(repoRoot, '.agents', 'skills', 'raiola', 'SKILL.md'),
    skillsDir: path.join(repoRoot, '.agents', 'skills'),
    codexDir: path.join(repoRoot, '.codex'),
    agentsPluginsDir: path.join(repoRoot, '.agents', 'plugins'),
    pluginsDir: path.join(repoRoot, 'plugins'),
    githubCodexDir: path.join(repoRoot, '.github', 'codex'),
    codexWorkflowFile: path.join(repoRoot, '.github', 'workflows', 'codex-review.yml'),
    scriptsAgentsFile: path.join(repoRoot, 'scripts', 'AGENTS.md'),
    workflowAgentsFile: path.join(repoRoot, 'scripts', 'workflow', 'AGENTS.md'),
    githubAgentsFile: path.join(repoRoot, '.github', 'AGENTS.md'),
    docsAgentsFile: path.join(repoRoot, 'docs', 'AGENTS.md'),
    docsWorkflowAgentsFile: path.join(repoRoot, 'docs', 'workflow', 'AGENTS.md'),
    skillsAgentsFile: path.join(repoRoot, 'skills', 'AGENTS.md'),
    githubCodexAgentsFile: path.join(repoRoot, '.github', 'codex', 'AGENTS.md'),
    pluginsAgentsFile: path.join(repoRoot, 'plugins', 'AGENTS.md'),
    pluginPackageAgentsFile: path.join(repoRoot, 'plugins', 'raiola-codex-optimizer', 'AGENTS.md'),
    packageJson: path.join(repoRoot, 'package.json'),
    workflowIgnore: path.join(repoRoot, '.workflowignore'),
  };
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sourceLayout() {
  return layoutFromRoot(sourceRepoRoot());
}

function isProductPackageRoot(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return isKnownProductName(pkg?.name);
  } catch {
    return false;
  }
}

function isInstalledRuntimeSurfaceRoot(repoRoot) {
  const absoluteRoot = path.resolve(repoRoot);
  return [
    path.join(absoluteRoot, 'scripts', 'workflow', 'install_common.js'),
    path.join(absoluteRoot, 'scripts', 'cli', 'rai.js'),
    path.join(absoluteRoot, 'bin', 'rai.js'),
  ].every((filePath) => fs.existsSync(filePath));
}

function resolveInstalledPackageRoot(targetRepo) {
  if (!targetRepo) {
    return null;
  }

  for (const packageName of [embeddedProductMeta().name, ...(embeddedProductMeta().legacyNames || [])]) {
    try {
      const packageJsonPath = require.resolve(`${packageName}/package.json`, {
        paths: [targetRepo, process.cwd()],
      });
      return path.dirname(packageJsonPath);
    } catch {
      // Try the next known package name.
    }
  }
  return null;
}

function validateProductSourceRoot(candidate, label = 'Source root') {
  if (!candidate) {
    return null;
  }
  const absoluteCandidate = path.resolve(candidate);
  if (!isProductPackageRoot(absoluteCandidate)) {
    throw new Error(`${label} must point at a valid Raiola package root`);
  }
  return absoluteCandidate;
}

function resolveProductSourceRoot(targetRepo = null, options = {}) {
  const currentRoot = sourceRepoRoot();
  if (options.sourceRoot) {
    return validateProductSourceRoot(options.sourceRoot, 'Explicit source root');
  }

  if (isProductPackageRoot(currentRoot)) {
    return currentRoot;
  }

  const installedPackageRoot = resolveInstalledPackageRoot(targetRepo);
  if (installedPackageRoot) {
    return validateProductSourceRoot(installedPackageRoot, 'Installed package root');
  }

  if (targetRepo && isInstalledRuntimeSurfaceRoot(targetRepo)) {
    return path.resolve(targetRepo);
  }

  if (isInstalledRuntimeSurfaceRoot(currentRoot)) {
    return currentRoot;
  }

  return validateProductSourceRoot(currentRoot, 'Current package root');
}

function productSourceLayout(targetRepo = null, options = {}) {
  const resolvedRoot = resolveProductSourceRoot(targetRepo, options);
  if (isProductPackageRoot(resolvedRoot)) {
    return layoutFromRoot(resolvedRoot);
  }
  if (isInstalledRuntimeSurfaceRoot(resolvedRoot)) {
    return layoutFromInstalledRoot(resolvedRoot);
  }
  return layoutFromRoot(resolvedRoot);
}

function sourcePackageVersion() {
  return productVersion();
}

function sourcePackageName() {
  return productName();
}

function legacyWorkflowScriptName(scriptName) {
  const normalized = String(scriptName || '').trim();
  if (!normalized.startsWith('raiola:')) {
    return null;
  }

  const suffix = normalized.slice('raiola:'.length);
  if (!suffix || suffix === 'on') {
    return null;
  }

  if (suffix === 'milestone') {
    return 'workflow:new-milestone';
  }

  return `workflow:${suffix}`;
}

const WORKFLOW_GITIGNORE_ENTRIES = Object.freeze([
  '.workflow/',
]);

const WORKFLOW_SCRIPT_PROFILES = Object.freeze({
  pilot: [
    'raiola:audit',
    'raiola:audit-repo',
    'raiola:repo-proof',
    'raiola:fix',
    'raiola:on',
    'raiola:backlog',
    'raiola:checkpoint',
    'raiola:repo-config',
    'raiola:codex',
    'raiola:contextpack',
    'raiola:trust',
    'raiola:release-control',
    'raiola:control-plane-publish',
    'raiola:handoff',
    'raiola:dashboard',
    'raiola:do',
    'raiola:start',
    'raiola:doctor',
    'raiola:health',
    'raiola:hooks',
    'raiola:hud',
    'raiola:init',
    'raiola:launch',
    'raiola:build',
    'raiola:manager',
    'raiola:migrate',
    'raiola:monorepo',
    'raiola:milestone',
    'raiola:milestone-edit',
    'raiola:next',
    'raiola:next-prompt',
    'raiola:note',
    'raiola:plan',
    'raiola:quick',
    'raiola:review',
    'raiola:simplify',
    'raiola:setup',
    'raiola:spec',
    'raiola:ship-readiness',
    'raiola:team',
    'raiola:test',
    'raiola:thread',
    'raiola:uninstall',
    'raiola:update',
    'raiola:verify',
    'raiola:verify-shell',
    'raiola:verify-work',
  ],
  core: [
    'raiola:audit',
    'raiola:audit-repo',
    'raiola:repo-proof',
    'raiola:fix',
    'raiola:on',
    'raiola:approval',
    'raiola:approvals',
    'raiola:assumptions',
    'raiola:automation',
    'raiola:autopilot',
    'raiola:backlog',
    'raiola:benchmark',
    'raiola:checkpoint',
    'raiola:repo-config',
    'raiola:repo-control',
    'raiola:workspace-impact',
    'raiola:monorepo-control',
    'raiola:frontend-control',
    'raiola:safety-control',
    'raiola:claims',
    'raiola:codex',
    'raiola:complete-milestone',
    'raiola:contextpack',
    'raiola:trust',
    'raiola:release-control',
    'raiola:control-plane-publish',
    'raiola:handoff',
    'raiola:control',
    'raiola:dashboard',
    'raiola:delegation-plan',
    'raiola:discuss',
    'raiola:do',
    'raiola:start',
    'raiola:doctor',
    'raiola:ensure-isolation',
    'raiola:evidence',
    'raiola:explore',
    'raiola:health',
    'raiola:hooks',
    'raiola:hud',
    'raiola:init',
    'raiola:launch',
    'raiola:build',
    'raiola:manager',
    'raiola:map-codebase',
    'raiola:map-frontend',
    'raiola:migrate',
    'raiola:monorepo',
    'raiola:monorepo-mode',
    'raiola:milestone',
    'raiola:milestone-edit',
    'raiola:next',
    'raiola:next-prompt',
    'raiola:note',
    'raiola:packet',
    'raiola:plan',
    'raiola:plan-check',
    'raiola:profile',
    'raiola:measure',
    'raiola:explain',
    'raiola:lifecycle',
    'raiola:team-control',
    'raiola:quick',
    'raiola:review',
    'raiola:review-mode',
    'raiola:review-orchestrate',
    'raiola:review-tasks',
    'raiola:route',
    'raiola:secure',
    'raiola:setup',
    'raiola:simplify',
    'raiola:spec',
    'raiola:ship',
    'raiola:ship-readiness',
    'raiola:stats',
    'raiola:step-fulfillment',
    'raiola:team',
    'raiola:test',
    'raiola:thread',
    'raiola:ui-direction',
    'raiola:ui-plan',
    'raiola:ui-review',
    'raiola:ui-spec',
    'raiola:uninstall',
    'raiola:update',
    'raiola:verify',
    'raiola:verify-browser',
    'raiola:verify-shell',
    'raiola:verify-work',
    'raiola:window',
    'raiola:workspaces',
    'raiola:workstreams',
  ],
  full: null,
});

function normalizeScriptProfile(value, fallback = 'full') {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(WORKFLOW_SCRIPT_PROFILES, normalized) ? normalized : fallback;
}

function runtimeScriptSetForProfile(profile) {
  const normalized = normalizeScriptProfile(profile, 'full');
  return normalized === 'full' ? null : new Set(WORKFLOW_SCRIPT_PROFILES[normalized] || []);
}

function extractNodeScriptPath(scriptValue) {
  const match = String(scriptValue || '').trim().match(/^node\s+([^\s]+)/);
  return match ? match[1].replace(/\\/g, '/') : null;
}

function runtimeSurfaceProfileForScriptProfile(profile = 'full') {
  return normalizeScriptProfile(profile, 'full') === 'pilot' ? 'pilot' : 'full';
}

function versionMarkerPath(targetRepo) {
  return path.join(targetRepo, '.workflow', 'VERSION.md');
}

function productManifestPath(targetRepo) {
  return path.join(targetRepo, '.workflow', 'product-manifest.json');
}

function readInstalledVersionMarker(targetRepo) {
  const markerPath = versionMarkerPath(targetRepo);
  if (!fs.existsSync(markerPath)) {
    return {
      exists: false,
      path: markerPath,
      installedVersion: null,
      previousVersion: null,
      refreshedAt: null,
      sourcePackage: null,
    };
  }

  const content = fs.readFileSync(markerPath, 'utf8');
  return {
    exists: true,
    path: markerPath,
    installedVersion: getFieldValue(content, 'Installed version') || null,
    previousVersion: getFieldValue(content, 'Previous version') || null,
    refreshedAt: getFieldValue(content, 'Last refreshed at') || null,
    sourcePackage: getFieldValue(content, 'Source package') || null,
  };
}

function writeVersionMarker(targetRepo, options = {}) {
  const {
    mode = 'init',
    installedVersion = sourcePackageVersion(),
  } = options;
  const existing = readInstalledVersionMarker(targetRepo);
  const markerPath = versionMarkerPath(targetRepo);
  const refreshedAt = new Date().toISOString();
  const previousVersion = existing.exists && existing.installedVersion
    ? existing.installedVersion
    : 'none';
  const content = `# RAIOLA PRODUCT VERSION

- Installed version: \`${installedVersion}\`
- Previous version: \`${previousVersion}\`
- Install mode: \`${mode}\`
- Last refreshed at: \`${refreshedAt}\`
- Source package: \`${sourcePackageName()}@${installedVersion}\`

## Update Guidance

- \`Run rai update after pulling a newer raiola release\`
- \`Run rai doctor --strict if package scripts or runtime files look stale\`
`;

  const writeResult = writeManagedText(targetRepo, '.workflow/VERSION.md', content, {
    inventory: ['.workflow/VERSION.md'],
    label: 'Product version marker',
  });
  if (!writeResult.ok) {
    throw new Error(writeResult.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }
  return {
    path: markerPath,
    installedVersion,
    previousVersion: existing.exists ? existing.installedVersion : null,
    changed: !existing.exists || existing.installedVersion !== installedVersion,
    refreshedAt,
  };
}

function readProductManifest(targetRepo) {
  const manifestPath = productManifestPath(targetRepo);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return normalizeProductManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  } catch {
    return null;
  }
}

function writeProductManifest(targetRepo, options = {}) {
  const installedVersion = options.installedVersion || sourcePackageVersion();
  const scriptProfile = normalizeScriptProfile(options.scriptProfile, 'full');
  const productSource = options.sourceLayout || productSourceLayout(targetRepo, options);
  const manifestPath = productManifestPath(targetRepo);
  const runtimeFiles = runtimeFilesForScriptProfile(scriptProfile, {
    targetRepo,
    sourceLayout: productSource,
  });
  const manifest = {
    ...contractPayload('productManifest'),
    installedVersion,
    sourcePackageName: sourcePackageName(),
    sourcePackageVersion: sourcePackageVersion(),
    generatedAt: new Date().toISOString(),
    versionMarkerPath: '.workflow/VERSION.md',
    skillPath: '.agents/skills/raiola/SKILL.md',
    skillPackPaths: runtimeFiles.filter((relativeFile) => relativeFile.startsWith('.agents/skills/')),
    installerSourceHint: productSource.repoRoot !== targetRepo ? productSource.repoRoot : null,
    scriptProfile,
    runtimeScripts: loadTargetRuntimeScripts(scriptProfile, {
      targetRepo,
      sourceLayout: productSource,
    }),
    runtimeSurfaceProfile: runtimeSurfaceProfileForScriptProfile(scriptProfile),
    runtimeFileCount: runtimeFiles.length,
    runtimeFiles,
    recommendedGitignoreEntries: [...WORKFLOW_GITIGNORE_ENTRIES],
    cliContractVersion: CLI_CONTRACT_VERSION,
    artifactSchemas: manifestSchemaMap(),
    generatedArtifacts: buildGeneratedArtifactsManifest(),
  };

  const writeResult = writeManagedText(targetRepo, '.workflow/product-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, {
    inventory: ['.workflow/product-manifest.json'],
    label: 'Product manifest',
  });
  if (!writeResult.ok) {
    throw new Error(writeResult.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }
  return {
    path: manifestPath,
    manifest,
  };
}

function walkFiles(dirPath, predicate = () => true) {
  const results = [];

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  visit(dirPath);
  return results;
}

function copyFileTracked(targetRepo, sourcePath, relativeTargetPath, options = {}) {
  const { overwrite = false, bucket, inventory = [] } = options;
  const result = copyManagedFile(targetRepo, sourcePath, relativeTargetPath, {
    overwrite,
    inventory,
    label: 'Managed install target',
  });
  if (bucket) {
    if (result.status === 'created') {
      bucket.created.push(result.absolutePath);
    } else if (result.status === 'updated') {
      bucket.updated.push(result.absolutePath);
    } else {
      bucket.skipped.push(result.absolutePath || relativeTargetPath);
    }
  }
  if (!result.ok) {
    throw new Error(result.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }
  return result.status;
}

function copyDirectoryTracked(targetRepo, sourceDir, relativeTargetDir, options = {}) {
  const {
    overwrite = false,
    bucket = { created: [], updated: [], skipped: [] },
    filter = () => true,
    inventory = [],
  } = options;
  const files = walkFiles(sourceDir, filter);
  for (const sourcePath of files) {
    const relative = path.posix.join(
      relativeTargetDir.replace(/\\/g, '/'),
      path.relative(sourceDir, sourcePath).replace(/\\/g, '/'),
    );
    copyFileTracked(targetRepo, sourcePath, relative, { overwrite, bucket, inventory });
  }

  return bucket;
}

function loadTargetRuntimeScripts(profile = 'full') {
  const normalizedProfile = normalizeScriptProfile(profile, 'full');
  const allScripts = Object.entries(readRuntimeScriptCatalog());
  if (normalizedProfile === 'full') {
    return Object.fromEntries(allScripts);
  }

  const allowed = runtimeScriptSetForProfile(normalizedProfile);
  return Object.fromEntries(allScripts.filter(([name]) => allowed.has(name)));
}

function resolveWorkflowDependency(sourceDir, baseFile, dependencyPath) {
  let resolved = path.resolve(path.dirname(baseFile), dependencyPath);
  if (!resolved.endsWith('.js')) {
    resolved += '.js';
  }
  if (!resolved.startsWith(sourceDir) || !fs.existsSync(resolved)) {
    return null;
  }
  return relativePath(sourceDir, resolved);
}

function collectWorkflowLocalDependencies(sourceDir, sourceFile) {
  const content = fs.readFileSync(sourceFile, 'utf8');
  const dependencies = new Set();
  const requirePattern = /require\(['"](\.\.?\/[^'"]+)['"]\)/g;
  const pathJoinPattern = /path\.join\(__dirname,\s*['"]([^'"]+\.js)['"]\s*\)/g;
  const scriptFieldPattern = /script:\s*['"]([^'"]+\.js)['"]/g;

  for (const pattern of [requirePattern, pathJoinPattern, scriptFieldPattern]) {
    let match = pattern.exec(content);
    while (match) {
      const relativeDependency = resolveWorkflowDependency(sourceDir, sourceFile, match[1]);
      if (relativeDependency) {
        dependencies.add(relativeDependency);
      }
      match = pattern.exec(content);
    }
  }

  return [...dependencies];
}

function buildWorkflowDependencyGraph(source = productSourceLayout()) {
  const { scriptsDir } = source;
  const sourceFiles = walkFiles(scriptsDir, (filePath) => filePath.endsWith('.js'));
  const graph = new Map();

  for (const sourceFile of sourceFiles) {
    graph.set(
      relativePath(scriptsDir, sourceFile),
      collectWorkflowLocalDependencies(scriptsDir, sourceFile),
    );
  }

  return graph;
}

function focusedWorkflowRootsForProfile(profile = 'pilot', options = {}) {
  const normalizedProfile = normalizeScriptProfile(profile, 'pilot');
  const roots = new Set(['build_packet.js']);

  for (const scriptValue of Object.values(loadTargetRuntimeScripts(normalizedProfile, options))) {
    const relativeScriptPath = extractNodeScriptPath(scriptValue);
    if (!relativeScriptPath || !relativeScriptPath.startsWith('scripts/workflow/')) {
      continue;
    }
    roots.add(relativeScriptPath.slice('scripts/workflow/'.length));
  }

  return roots;
}

function focusedWorkflowRuntimeFiles(profile = 'pilot', options = {}) {
  const productSource = options.sourceLayout || productSourceLayout(options.targetRepo || null, options);
  const graph = buildWorkflowDependencyGraph(productSource);
  const visited = new Set();

  function visit(relativeFile) {
    if (!graph.has(relativeFile) || visited.has(relativeFile)) {
      return;
    }
    visited.add(relativeFile);
    for (const dependency of graph.get(relativeFile) || []) {
      visit(dependency);
    }
  }

  for (const root of focusedWorkflowRootsForProfile(profile, {
    ...options,
    sourceLayout: productSource,
  })) {
    visit(root);
  }

  return [...visited]
    .sort()
    .map((relativeFile) => `scripts/workflow/${relativeFile}`);
}

function runtimeFilesForScriptProfile(profile = 'full', options = {}) {
  const normalizedProfile = normalizeScriptProfile(profile, 'full');
  const source = options.sourceLayout || productSourceLayout(options.targetRepo || null, options);
  const workflowFiles = normalizedProfile === 'pilot'
    ? focusedWorkflowRuntimeFiles(normalizedProfile, {
      ...options,
      sourceLayout: source,
    })
    : walkFiles(source.scriptsDir).map((filePath) => relativePath(source.repoRoot, filePath));
  const runtimeFiles = [
    ...workflowFiles,
    ...walkFiles(source.cliDir).map((filePath) => relativePath(source.repoRoot, filePath)),
    relativePath(source.repoRoot, source.binFile),
    ...(source.aliasBinFiles || []).map((filePath) => relativePath(source.repoRoot, filePath)),
    '.agents/skills/raiola/SKILL.md',
    fs.existsSync(source.workflowIgnore) ? relativePath(source.repoRoot, source.workflowIgnore) : null,
  ].filter(Boolean);

  if (fs.existsSync(source.skillsDir)) {
    runtimeFiles.push(
      ...walkFiles(source.skillsDir).map((filePath) => {
        const relativeSkillPath = relativePath(source.skillsDir, filePath);
        return `.agents/skills/${relativeSkillPath}`;
      }),
    );
  }

  if (fs.existsSync(source.codexDir)) {
    runtimeFiles.push(...walkFiles(source.codexDir).map((filePath) => relativePath(source.repoRoot, filePath)));
  }
  if (fs.existsSync(source.agentsPluginsDir)) {
    runtimeFiles.push(...walkFiles(source.agentsPluginsDir).map((filePath) => relativePath(source.repoRoot, filePath)));
  }
  if (fs.existsSync(source.pluginsDir)) {
    runtimeFiles.push(...walkFiles(source.pluginsDir).map((filePath) => relativePath(source.repoRoot, filePath)));
  }
  if (fs.existsSync(source.githubCodexDir)) {
    runtimeFiles.push(...walkFiles(source.githubCodexDir).map((filePath) => relativePath(source.repoRoot, filePath)));
  }
  if (fs.existsSync(source.codexWorkflowFile)) {
    runtimeFiles.push(relativePath(source.repoRoot, source.codexWorkflowFile));
  }
  for (const optionalAgentsFile of [
    source.scriptsAgentsFile,
    source.workflowAgentsFile,
    source.githubAgentsFile,
    source.docsAgentsFile,
    source.docsWorkflowAgentsFile,
    source.skillsAgentsFile,
    source.githubCodexAgentsFile,
    source.pluginsAgentsFile,
    source.pluginPackageAgentsFile,
  ]) {
    if (optionalAgentsFile && fs.existsSync(optionalAgentsFile)) {
      runtimeFiles.push(relativePath(source.repoRoot, optionalAgentsFile));
    }
  }

  if (normalizedProfile === 'full') {
    runtimeFiles.push(relativePath(source.repoRoot, source.compareScript));
  }

  return [...new Set(runtimeFiles)].sort();
}

function patchPackageJsonScripts(targetRepo, options = {}) {
  const {
    overwriteConflicts = false,
    runtimeScriptsOverride = null,
    scriptProfile = 'full',
  } = options;
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const normalizedProfile = normalizeScriptProfile(scriptProfile, 'full');
  const productSource = options.sourceLayout || productSourceLayout(targetRepo, options);
  const runtimeScripts = runtimeScriptsOverride || loadTargetRuntimeScripts(normalizedProfile, {
    targetRepo,
    sourceLayout: productSource,
  });
  let createdPackageJson = false;

  if (!fs.existsSync(packageJsonPath)) {
    const bootstrap = {
      name: slugifyName(path.basename(targetRepo)),
      private: true,
      version: '0.0.0',
      scripts: {},
    };
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(bootstrap, null, 2)}\n`);
    createdPackageJson = true;
  }

  const packageJson = readJson(packageJsonPath);
  const currentScripts = { ...(packageJson.scripts || {}) };
  const report = {
    packageJsonPath,
    missingPackageJson: false,
    createdPackageJson,
    scriptProfile: normalizedProfile,
    added: [],
    updated: [],
    unchanged: [],
    removed: [],
    retainedExtra: [],
    conflicts: [],
  };

  for (const [name, value] of Object.entries(runtimeScripts)) {
    if (!(name in currentScripts)) {
      currentScripts[name] = value;
      report.added.push(name);
      continue;
    }

    if (currentScripts[name] === value) {
      report.unchanged.push(name);
      continue;
    }

    if (overwriteConflicts) {
      currentScripts[name] = value;
      report.updated.push(name);
      continue;
    }

    report.conflicts.push({
      name,
      existing: currentScripts[name],
      expected: value,
    });
  }

  for (const [name, expected] of Object.entries(loadTargetRuntimeScripts('full', {
    targetRepo,
    sourceLayout: productSource,
  }))) {
    const legacyName = legacyWorkflowScriptName(name);
    if (!legacyName || !(legacyName in currentScripts)) {
      continue;
    }

    if (currentScripts[legacyName] === expected) {
      delete currentScripts[legacyName];
      report.removed.push(legacyName);
      continue;
    }

    report.retainedExtra.push(legacyName);
  }

  if (normalizedProfile !== 'full') {
    for (const [name, expected] of Object.entries(loadTargetRuntimeScripts('full', {
      targetRepo,
      sourceLayout: productSource,
    }))) {
      if (Object.prototype.hasOwnProperty.call(runtimeScripts, name) || !(name in currentScripts)) {
        continue;
      }
      if (currentScripts[name] === expected) {
        delete currentScripts[name];
        report.removed.push(name);
        continue;
      }
      report.retainedExtra.push(name);
    }
  }

  packageJson.scripts = currentScripts;
  for (const [name, value] of [
    ['rai', 'node bin/rai.js'],
    ['raiola', 'node bin/raiola.js'],
    ['raiola-on', 'node bin/raiola-on.js'],
  ]) {
    if (!packageJson.scripts[name]) {
      packageJson.scripts[name] = value;
      report.added.push(name);
    }
  }
  if (packageJson.scripts.cwf === 'node bin/cwf.js') {
    delete packageJson.scripts.cwf;
    report.removed.push('cwf');
  }
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return report;
}

function pruneManagedRuntimeFiles(targetRepo, desiredRuntimeFiles, trustedInventory, previousManifest = null) {
  const desired = new Set(desiredRuntimeFiles);
  const previouslyManaged = uniqueNormalizedPaths(previousManifest?.runtimeFiles || []);
  const removed = [];
  const blocked = [];

  for (const relativeManagedPath of previouslyManaged) {
    if (desired.has(relativeManagedPath)) {
      continue;
    }
    const result = removeManagedPath(targetRepo, relativeManagedPath, {
      inventory: trustedInventory,
      label: 'Managed runtime cleanup path',
    });
    if (!result.ok) {
      blocked.push(...result.blocked);
      continue;
    }
    if (result.status !== 'removed') {
      continue;
    }
    cleanupEmptyManagedParents(targetRepo, relativeManagedPath);
    removed.push(result.absolutePath);
  }

  return {
    removed,
    blocked,
  };
}

function writeAgentsPatchTemplate(targetRepo) {
  const templatePath = path.join(targetRepo, 'docs', 'workflow', 'AGENTS_PATCH_TEMPLATE.md');
  const content = `# AGENTS PATCH TEMPLATE

Add or adapt a short workflow section like this inside your repo's \`AGENTS.md\`.

## Optional Workflow Layer

- Activate the workflow control plane only when the user explicitly asks for workflow, milestone, handoff, or closeout discipline.
- Resolve the active root from \`docs/workflow/WORKSTREAMS.md\` before reading workflow docs.
- Treat \`EXECPLAN.md\` as the only canonical plan source during plan and execute.
- Use \`rai hud\`, \`rai next\`, and \`rai health --strict\` to orient, route, and verify.
- Keep \`.workflow/state.json\` generated and non-canonical; markdown files remain the source of truth.
`;

  const writeResult = writeManagedText(targetRepo, 'docs/workflow/AGENTS_PATCH_TEMPLATE.md', content, {
    inventory: ['docs/workflow/AGENTS_PATCH_TEMPLATE.md'],
    label: 'AGENTS patch template',
  });
  if (!writeResult.ok) {
    throw new Error(writeResult.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }
  return templatePath;
}

function gitignoreLineCandidates(entry) {
  const normalized = String(entry || '').trim();
  if (!normalized) {
    return [];
  }

  const withoutTrailingSlash = normalized.replace(/\/+$/g, '');
  return [
    normalized,
    withoutTrailingSlash,
    `/${normalized}`,
    `/${withoutTrailingSlash}`,
  ].filter(Boolean);
}

function hasGitignoreEntry(content, entry) {
  const existing = new Set(
    String(content || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  return gitignoreLineCandidates(entry).some((candidate) => existing.has(candidate));
}

function missingGitignoreEntries(targetRepo, entries = WORKFLOW_GITIGNORE_ENTRIES) {
  const gitignorePath = path.join(targetRepo, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  return entries.filter((entry) => !hasGitignoreEntry(content, entry));
}

function patchGitignore(targetRepo, options = {}) {
  const entries = (options.entries || WORKFLOW_GITIGNORE_ENTRIES).filter(Boolean);
  const gitignorePath = path.join(targetRepo, '.gitignore');
  const exists = fs.existsSync(gitignorePath);
  const current = exists ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const missingEntries = entries.filter((entry) => !hasGitignoreEntry(current, entry));

  if (missingEntries.length === 0) {
    return {
      path: gitignorePath,
      status: exists ? 'unchanged' : 'skipped',
      addedEntries: [],
      missingEntries: [],
    };
  }

  const lines = [];
  if (current.trim()) {
    lines.push(current.replace(/\s+$/g, ''));
  }
  if (!current.includes('# raiola runtime artifacts')) {
    lines.push('# raiola runtime artifacts');
  }
  for (const entry of missingEntries) {
    lines.push(entry);
  }
  const writeResult = writeManagedText(targetRepo, '.gitignore', `${lines.join('\n')}\n`, {
    inventory: ['.gitignore'],
    label: 'Managed gitignore entry',
  });
  if (!writeResult.ok) {
    throw new Error(writeResult.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }

  return {
    path: gitignorePath,
    status: exists ? 'updated' : 'created',
    addedEntries: missingEntries,
    missingEntries: [],
  };
}

function seedWorkflowRootGaps(rootDir, templatesDir) {
  const docsToSeed = [
    {
      file: 'PREFERENCES.md',
      fields: [['Token efficiency measures', 'auto']],
      sections: [],
    },
    {
      file: 'STATUS.md',
      fields: [],
      sections: ['At-Risk Requirements'],
    },
    {
      file: 'CONTEXT.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Intent Core'],
    },
    {
      file: 'EXECPLAN.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Delivery Core', 'Open Requirements', 'Current Capability Slice', 'Cold Archive Refs'],
    },
    {
      file: 'VALIDATION.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Validation Core'],
    },
    {
      file: 'HANDOFF.md',
      fields: [],
      sections: ['Continuity Checkpoint'],
    },
    {
      file: 'WINDOW.md',
      fields: [
        ['Packet loading mode', 'delta'],
        ['Token efficiency measures', 'auto'],
        ['Core packet size', '0'],
        ['Loaded packet size', '0'],
        ['Unchanged refs omitted', '0'],
        ['Cold refs omitted', '0'],
      ],
      sections: ['Packet Tier Summary', 'Checkpoint Guard'],
    },
  ];

  for (const doc of docsToSeed) {
    const targetPath = path.join(rootDir, doc.file);
    const templatePath = path.join(templatesDir, doc.file);
    if (!fs.existsSync(targetPath) || !fs.existsSync(templatePath)) {
      continue;
    }

    let content = read(targetPath);
    const template = read(templatePath);

    for (const [label, valueOverride] of doc.fields) {
      const templateValue = valueOverride ?? getFieldValue(template, label) ?? '';
      content = ensureField(content, label, templateValue);
      if (valueOverride != null && getFieldValue(content, label) !== valueOverride) {
        content = replaceOrAppendField(content, label, valueOverride);
      }
    }

    for (const heading of doc.sections) {
      const fallbackSectionBody = heading === 'At-Risk Requirements'
        ? '- `No active requirements are at risk while there is no active milestone`'
        : '';
      content = ensureSection(content, heading, tryExtractSection(template, heading, fallbackSectionBody));
    }

    if (content !== read(targetPath)) {
      write(targetPath, content);
    }
  }
}

function syncDefaultWorkflowSurface(targetRepo, options = {}) {
  const { setAsActive = false } = options;
  const rootDir = path.join(targetRepo, 'docs', 'workflow');
  const paths = workflowPaths(rootDir, targetRepo);
  const controls = controlPaths(targetRepo);
  const { templatesDir } = sourceLayout();

  ensureDir(paths.archiveDir);
  if (!fs.existsSync(path.join(paths.archiveDir, 'README.md'))) {
    fs.writeFileSync(
      path.join(paths.archiveDir, 'README.md'),
      '# COMPLETED MILESTONES\n\n- `Completed milestone archives are stored here`\n',
    );
  }

  seedWorkflowRootGaps(rootDir, templatesDir);

  const {
    contextPacket,
    execplanPacket,
    validationPacket,
    windowStatus,
  } = syncStablePacketSet(paths);

  if (fs.existsSync(controls.workstreams)) {
    let workstreams = read(controls.workstreams);
    const table = parseWorkstreamTable(workstreams);
    const defaultRoot = 'docs/workflow';
    let targetRow = table.rows.find((row) => row.root === defaultRoot || row.name === 'workflow');

    if (!targetRow) {
      targetRow = {
        name: 'workflow',
        root: defaultRoot,
        status: 'inactive',
        currentMilestone: 'NONE',
        step: 'complete',
        packetHash: execplanPacket.inputHash,
        budgetStatus: windowStatus.budgetStatus,
        health: 'pending',
        notes: 'Default workflow control plane',
      };
      table.rows.push(targetRow);
    }

    targetRow.name = 'workflow';
    targetRow.root = defaultRoot;
    targetRow.packetHash = execplanPacket.inputHash;
    targetRow.budgetStatus = windowStatus.budgetStatus;
    targetRow.health = targetRow.health || 'pending';
    targetRow.notes = targetRow.notes || 'Default workflow control plane';

    if (setAsActive) {
      for (const row of table.rows) {
        row.status = row === targetRow ? 'active' : 'inactive';
      }
      workstreams = replaceField(workstreams, 'Active workstream name', 'workflow');
      workstreams = replaceField(workstreams, 'Active workstream root', defaultRoot);
    }

    workstreams = replaceField(workstreams, 'Last updated', today());
    workstreams = replaceSection(
      workstreams,
      'Workstream Table',
      renderWorkstreamTable(table.headerLines, table.rows),
    );
    write(controls.workstreams, workstreams);
  }

  runTargetScript(targetRepo, 'build_packet.js', ['--all', '--sync']);
  const stabilized = {
    contextPacket: buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    execplanPacket: buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    validationPacket: buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
    windowStatus: computeWindowStatus(paths, { doc: 'validation', step: 'audit' }),
  };

  return {
    rootDir,
    contextPacket: stabilized.contextPacket,
    execplanPacket: stabilized.execplanPacket,
    validationPacket: stabilized.validationPacket,
    windowStatus: stabilized.windowStatus,
  };
}

function runTargetScript(targetRepo, scriptFile, args = []) {
  return childProcess.execFileSync(
    process.execPath,
    [path.join(targetRepo, 'scripts', 'workflow', scriptFile), ...args],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function verifyInstalledSurface(targetRepo) {
  runTargetScript(targetRepo, 'doctor.js');
  runTargetScript(targetRepo, 'health.js');
  runTargetScript(targetRepo, 'next_step.js');
  const hud = runTargetScript(targetRepo, 'hud.js', ['--json']);
  return JSON.parse(hud);
}

function installWorkflowSurface(targetRepo, options = {}) {
  const {
    mode = 'init',
    forceDocs = false,
    refreshDocs = false,
    overwriteScriptConflicts = false,
    writeAgentsTemplate = false,
    scriptProfile = null,
    manageGitignore = true,
    verify = true,
    sourceRoot = null,
  } = options;
  const source = productSourceLayout(targetRepo, { ...options, sourceRoot });
  const existingManifest = readProductManifest(targetRepo);
  const selectedScriptProfile = normalizeScriptProfile(
    scriptProfile || existingManifest?.scriptProfile,
    'full',
  );
  const docsTarget = path.join(targetRepo, 'docs', 'workflow');
  const scriptsTarget = path.join(targetRepo, 'scripts', 'workflow');
  const cliTarget = path.join(targetRepo, 'scripts', 'cli');
  const binTarget = path.join(targetRepo, 'bin', 'rai.js');
  const aliasBinTargets = [
    path.join(targetRepo, 'bin', 'raiola.js'),
    path.join(targetRepo, 'bin', 'raiola-on.js'),
    path.join(targetRepo, 'bin', 'raiola-mcp.js'),
  ];
  const compareTarget = path.join(targetRepo, 'scripts', 'compare_golden_snapshots.ts');
  const skillTarget = path.join(targetRepo, '.agents', 'skills', 'raiola', 'SKILL.md');
  const skillsTarget = path.join(targetRepo, '.agents', 'skills');
  const workflowIgnoreTarget = path.join(targetRepo, '.workflowignore');
  const docsTargetRelative = 'docs/workflow';
  const scriptsTargetRelative = 'scripts/workflow';
  const cliTargetRelative = 'scripts/cli';
  const binTargetRelative = 'bin/rai.js';
  const aliasBinTargetRelatives = [
    'bin/raiola.js',
    'bin/raiola-on.js',
    'bin/raiola-mcp.js',
  ];
  const compareTargetRelative = 'scripts/compare_golden_snapshots.ts';
  const skillTargetRelative = '.agents/skills/raiola/SKILL.md';
  const skillsTargetRelative = '.agents/skills';
  const workflowIgnoreRelative = '.workflowignore';
  const selectedRuntimeFiles = runtimeFilesForScriptProfile(selectedScriptProfile, {
    targetRepo,
    sourceLayout: source,
    sourceRoot,
  });
  const selectedWorkflowFiles = new Set(
    selectedRuntimeFiles
      .filter((relativeManagedPath) => relativeManagedPath.startsWith('scripts/workflow/'))
      .map((relativeManagedPath) => relativeManagedPath.slice('scripts/workflow/'.length)),
  );
  const includeCompareScript = selectedRuntimeFiles.includes(relativePath(source.repoRoot, source.compareScript));
  const sourceHasTemplates = fs.existsSync(source.templatesDir);
  const templateTargets = sourceHasTemplates
    ? walkFiles(source.templatesDir).map((filePath) => path.posix.join(
      docsTargetRelative,
      relativePath(source.templatesDir, filePath),
    ))
    : [];
  const trustedRuntimeCleanupInventory = buildTrustedRuntimeCleanupInventory(runtimeFilesForScriptProfile('full', {
    targetRepo,
    sourceLayout: source,
    sourceRoot,
  }));
  const installInventory = uniqueNormalizedPaths([
    ...selectedRuntimeFiles,
    ...trustedRuntimeCleanupInventory,
    ...templateTargets,
    '.workflow/product-manifest.json',
    '.workflow/VERSION.md',
    '.workflow/install-report.json',
    '.gitignore',
    ...(writeAgentsTemplate ? ['docs/workflow/AGENTS_PATCH_TEMPLATE.md'] : []),
  ]);
  const preflightTargets = uniqueNormalizedPaths([
    ...selectedRuntimeFiles,
    ...templateTargets,
    '.workflow/product-manifest.json',
    '.workflow/VERSION.md',
    ...(manageGitignore ? ['.gitignore'] : []),
    ...(writeAgentsTemplate ? ['docs/workflow/AGENTS_PATCH_TEMPLATE.md'] : []),
  ]);

  ensureDir(targetRepo);

  const preflight = preflightManagedPaths(targetRepo, preflightTargets, {
    inventory: installInventory,
    label: 'Managed install surface',
  });
  if (!preflight.ok) {
    throw new Error(preflight.blocked.map((entry) => `${entry.path}: ${entry.reason}`).join('; '));
  }

  const docsExists = fs.existsSync(docsTarget);
  if (mode === 'init' && docsExists && !forceDocs) {
    throw new Error(`Workflow root already exists at ${docsTarget}. Run rai migrate or pass --force-docs.`);
  }
  if (!sourceHasTemplates && (mode === 'init' || forceDocs || refreshDocs)) {
    throw new Error('The selected source root does not include templates/workflow. Re-run with --source-root pointing at a Raiola package root.');
  }

  const report = {
    targetRepo,
    mode,
    docs: { created: [], updated: [], skipped: [] },
    scripts: { created: [], updated: [], skipped: [] },
    cli: { created: [], updated: [], skipped: [] },
    nativeCodex: { created: [], updated: [], skipped: [] },
    nativePlugins: { created: [], updated: [], skipped: [] },
    nativeGithub: { created: [], updated: [], skipped: [] },
    layeredAgents: [],
    bin: null,
    binAliases: [],
    compareScript: null,
    skill: null,
    skillPack: { created: [], updated: [], skipped: [] },
    workflowIgnore: null,
    gitignore: null,
    packageScripts: null,
    agentsTemplate: null,
    productManifest: null,
    versionMarker: null,
    legacyArtifactsRemoved: [],
    runtimeSurfaceProfile: runtimeSurfaceProfileForScriptProfile(selectedScriptProfile),
    runtimeFileCount: selectedRuntimeFiles.length,
    prunedRuntimeFiles: [],
    sync: null,
    codexSetup: null,
    hudState: null,
  };

  if (sourceHasTemplates) {
    copyDirectoryTracked(targetRepo, source.templatesDir, docsTargetRelative, {
      overwrite: forceDocs || refreshDocs,
      bucket: report.docs,
      inventory: installInventory,
    });
  }

  copyDirectoryTracked(targetRepo, source.scriptsDir, scriptsTargetRelative, {
    overwrite: true,
    bucket: report.scripts,
    inventory: installInventory,
    filter: (filePath) => selectedWorkflowFiles.has(relativePath(source.scriptsDir, filePath)),
  });
  copyDirectoryTracked(targetRepo, source.cliDir, cliTargetRelative, {
    overwrite: true,
    bucket: report.cli,
    inventory: installInventory,
  });

  report.bin = copyFileTracked(targetRepo, source.binFile, binTargetRelative, { overwrite: true, inventory: installInventory });
  report.binAliases = aliasBinTargetRelatives.map((targetPath, index) => copyFileTracked(targetRepo, source.aliasBinFiles[index], targetPath, { overwrite: true, inventory: installInventory }));
  report.compareScript = includeCompareScript
    ? copyFileTracked(targetRepo, source.compareScript, compareTargetRelative, { overwrite: true, inventory: installInventory })
    : 'skipped';
  if (fs.existsSync(source.skillsDir)) {
    copyDirectoryTracked(targetRepo, source.skillsDir, skillsTargetRelative, {
      overwrite: true,
      bucket: report.skillPack,
      inventory: installInventory,
    });
  }
  report.skill = copyFileTracked(targetRepo, source.skillFile, skillTargetRelative, { overwrite: true, inventory: installInventory });
  if (fs.existsSync(source.codexDir)) {
    copyDirectoryTracked(targetRepo, source.codexDir, '.codex', {
      overwrite: true,
      bucket: report.nativeCodex,
      inventory: installInventory,
      filter: (filePath) => relativePath(source.codexDir, filePath) !== 'hooks.json',
    });
  }
  if (fs.existsSync(source.agentsPluginsDir)) {
    copyDirectoryTracked(targetRepo, source.agentsPluginsDir, '.agents/plugins', {
      overwrite: true,
      bucket: report.nativePlugins,
      inventory: installInventory,
    });
  }
  if (fs.existsSync(source.pluginsDir)) {
    copyDirectoryTracked(targetRepo, source.pluginsDir, 'plugins', {
      overwrite: true,
      bucket: report.nativePlugins,
      inventory: installInventory,
    });
  }
  if (fs.existsSync(source.githubCodexDir)) {
    copyDirectoryTracked(targetRepo, source.githubCodexDir, '.github/codex', {
      overwrite: true,
      bucket: report.nativeGithub,
      inventory: installInventory,
    });
  }
  if (fs.existsSync(source.codexWorkflowFile)) {
    copyFileTracked(targetRepo, source.codexWorkflowFile, '.github/workflows/codex-review.yml', { overwrite: true, inventory: installInventory });
  }
  for (const [sourceFile, targetFile] of [
    [source.scriptsAgentsFile, path.join(targetRepo, 'scripts', 'AGENTS.md')],
    [source.workflowAgentsFile, path.join(targetRepo, 'scripts', 'workflow', 'AGENTS.md')],
    [source.githubAgentsFile, path.join(targetRepo, '.github', 'AGENTS.md')],
    [source.docsAgentsFile, path.join(targetRepo, 'docs', 'AGENTS.md')],
    [source.docsWorkflowAgentsFile, path.join(targetRepo, 'docs', 'workflow', 'AGENTS.md')],
    [source.skillsAgentsFile, path.join(targetRepo, 'skills', 'AGENTS.md')],
  ]) {
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      continue;
    }
    report.layeredAgents.push(copyFileTracked(targetRepo, sourceFile, relativePath(targetRepo, targetFile), { overwrite: true, inventory: installInventory }));
  }
  report.workflowIgnore = copyFileTracked(targetRepo, source.workflowIgnore, workflowIgnoreRelative, { overwrite: false, inventory: installInventory });
  if (manageGitignore) {
    report.gitignore = patchGitignore(targetRepo);
  }
  report.packageScripts = patchPackageJsonScripts(targetRepo, {
    overwriteConflicts: overwriteScriptConflicts,
    scriptProfile: selectedScriptProfile,
    sourceLayout: source,
  });

  if (writeAgentsTemplate) {
    report.agentsTemplate = writeAgentsPatchTemplate(targetRepo);
  }

  const pruneReport = pruneManagedRuntimeFiles(targetRepo, selectedRuntimeFiles, trustedRuntimeCleanupInventory, existingManifest);
  report.prunedRuntimeFiles = pruneReport.removed;
  report.blockedRuntimeFiles = pruneReport.blocked;
  report.productManifest = writeProductManifest(targetRepo, {
    scriptProfile: selectedScriptProfile,
    sourceLayout: source,
    sourceRoot,
  });
  report.versionMarker = writeVersionMarker(targetRepo, { mode });
  for (const legacyPath of [
    'bin/cwf.js',
    '.agents/skills/codex-workflow',
  ]) {
    const removal = removeManagedPath(targetRepo, legacyPath, {
      inventory: trustedRuntimeCleanupInventory,
      label: 'Legacy managed runtime path',
    });
    if (removal.ok && removal.status === 'removed') {
      cleanupEmptyManagedParents(targetRepo, legacyPath);
      report.legacyArtifactsRemoved.push(removal.absolutePath);
    }
  }
  report.sync = syncDefaultWorkflowSurface(targetRepo, { setAsActive: mode === 'init' });
  report.codexSetup = seedCodexControl(targetRepo, { repo: true, _: ['setup'] });
  if (verify) {
    report.hudState = verifyInstalledSurface(targetRepo);
  }

  return report;
}

function formatInstallSummary(report) {
  const targetRepo = report.targetRepo;
  const lines = [
    `- Target: \`${targetRepo}\``,
    `- Docs created: \`${report.docs.created.length}\``,
    `- Docs updated: \`${report.docs.updated.length}\``,
    `- Scripts created: \`${report.scripts.created.length}\``,
    `- Scripts updated: \`${report.scripts.updated.length}\``,
    `- CLI helpers created: \`${report.cli.created.length}\``,
    `- CLI helpers updated: \`${report.cli.updated.length}\``,
    `- Bin: \`${report.bin}\``,
    `- Compare script: \`${report.compareScript}\``,
    `- Skill: \`${report.skill}\``,
    `- Skill pack created: \`${report.skillPack.created.length}\``,
    `- Skill pack updated: \`${report.skillPack.updated.length}\``,
  ];

  if (report.packageScripts.missingPackageJson) {
    lines.push('- Package scripts: `package.json missing, so script patching was skipped`');
  } else {
    if (report.packageScripts.createdPackageJson) {
      lines.push('- Package JSON: `created minimal package.json for workflow scripts`');
    }
    lines.push(`- Package script profile: \`${report.packageScripts.scriptProfile}\``);
    lines.push(`- Runtime surface profile: \`${report.runtimeSurfaceProfile}\``);
    lines.push(`- Runtime files tracked: \`${report.runtimeFileCount}\``);
    lines.push(`- Package scripts added: \`${report.packageScripts.added.length}\``);
    lines.push(`- Package scripts updated: \`${report.packageScripts.updated.length}\``);
    if (report.packageScripts.removed.length > 0) {
      lines.push(`- Package scripts removed: \`${report.packageScripts.removed.length}\``);
    }
    if (report.packageScripts.conflicts.length > 0) {
      lines.push(`- Package script conflicts: \`${report.packageScripts.conflicts.length}\``);
    }
  }

  if (report.prunedRuntimeFiles.length > 0) {
    lines.push(`- Runtime files pruned: \`${report.prunedRuntimeFiles.length}\``);
  }

  if (report.gitignore) {
    lines.push(`- Gitignore: \`${report.gitignore.status}\``);
    if (report.gitignore.addedEntries.length > 0) {
      lines.push(`- Gitignore entries added: \`${report.gitignore.addedEntries.join(', ')}\``);
    }
  }

  if (report.agentsTemplate) {
    lines.push(`- AGENTS patch template: \`${relativePath(targetRepo, report.agentsTemplate)}\``);
  }

  if (report.versionMarker) {
    lines.push(`- Product version: \`${report.versionMarker.installedVersion}\``);
    lines.push(`- Version marker: \`${relativePath(targetRepo, report.versionMarker.path)}\``);
    if (report.versionMarker.previousVersion && report.versionMarker.previousVersion !== report.versionMarker.installedVersion) {
      lines.push(`- Previous product version: \`${report.versionMarker.previousVersion}\``);
    }
  }

  if (report.productManifest) {
    lines.push(`- Product manifest: \`${relativePath(targetRepo, report.productManifest.path)}\``);
  }

  if (report.hudState) {
    lines.push(`- State file: \`${report.hudState.stateFileRelative || relativePath(targetRepo, report.hudState.stateFile)}\``);
    lines.push(`- HUD health: \`${report.hudState.health.status}\` (\`${report.hudState.health.failCount}\` fail / \`${report.hudState.health.warnCount}\` warn)`);
  }

  return lines;
}

module.exports = {
  formatInstallSummary,
  missingGitignoreEntries,
  installWorkflowSurface,
  loadTargetRuntimeScripts,
  normalizeScriptProfile,
  patchGitignore,
  patchPackageJsonScripts,
  productManifestPath,
  readProductManifest,
  readInstalledVersionMarker,
  relativePath,
  runtimeFilesForScriptProfile,
  sourceLayout,
  sourcePackageName,
  sourcePackageVersion,
  sourceRepoRoot,
  versionMarkerPath,
  WORKFLOW_GITIGNORE_ENTRIES,
  writeProductManifest,
  writeVersionMarker,
};
