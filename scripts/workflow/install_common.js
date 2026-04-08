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
const {
  PACKET_VERSION,
  buildPacketSnapshot,
  computeWindowStatus,
  controlPaths,
  ensureField,
  ensureSection,
  ensureDir,
  extractSection,
  getFieldValue,
  parseWorkstreamTable,
  read,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  syncStablePacketSet,
  tryExtractSection,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
} = require('./common');

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
      path.join(repoRoot, 'bin', 'cwf.js'),
    ],
    compareScript: path.join(repoRoot, 'scripts', 'compare_golden_snapshots.ts'),
    skillFile: path.join(repoRoot, 'skill', 'SKILL.md'),
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

function resolveProductSourceRoot(targetRepo = null) {
  const currentRoot = sourceRepoRoot();
  if (isProductPackageRoot(currentRoot)) {
    return currentRoot;
  }

  const manifest = targetRepo ? readProductManifest(targetRepo) : null;
  const candidates = [
    process.env.RAIOLA_SOURCE_ROOT || null,
    process.env.CODEX_WORKFLOW_KIT_SOURCE_ROOT || null,
    manifest?.installerSourceRoot || null,
    resolveInstalledPackageRoot(targetRepo),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const absoluteCandidate = path.resolve(candidate);
    if (isProductPackageRoot(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return currentRoot;
}

function productSourceLayout(targetRepo = null) {
  return layoutFromRoot(resolveProductSourceRoot(targetRepo));
}

function sourcePackageVersion() {
  return productVersion();
}

function sourcePackageName() {
  return productName();
}

const WORKFLOW_GITIGNORE_ENTRIES = Object.freeze([
  '.workflow/',
  '.agents/',
]);

const WORKFLOW_SCRIPT_PROFILES = Object.freeze({
  pilot: [
    'workflow:backlog',
    'workflow:checkpoint',
    'workflow:codex',
    'workflow:contextpack',
    'workflow:dashboard',
    'workflow:do',
    'workflow:doctor',
    'workflow:health',
    'workflow:hud',
    'workflow:init',
    'workflow:launch',
    'workflow:manager',
    'workflow:migrate',
    'workflow:monorepo',
    'workflow:new-milestone',
    'workflow:next',
    'workflow:next-prompt',
    'workflow:note',
    'workflow:quick',
    'workflow:review',
    'workflow:setup',
    'workflow:ship-readiness',
    'workflow:team',
    'workflow:thread',
    'workflow:uninstall',
    'workflow:update',
    'workflow:verify-shell',
    'workflow:verify-work',
  ],
  core: [
    'workflow:approval',
    'workflow:approvals',
    'workflow:assumptions',
    'workflow:automation',
    'workflow:backlog',
    'workflow:benchmark',
    'workflow:checkpoint',
    'workflow:claims',
    'workflow:codex',
    'workflow:complete-milestone',
    'workflow:contextpack',
    'workflow:control',
    'workflow:dashboard',
    'workflow:delegation-plan',
    'workflow:discuss',
    'workflow:do',
    'workflow:doctor',
    'workflow:ensure-isolation',
    'workflow:evidence',
    'workflow:explore',
    'workflow:health',
    'workflow:hud',
    'workflow:init',
    'workflow:launch',
    'workflow:manager',
    'workflow:map-codebase',
    'workflow:map-frontend',
    'workflow:migrate',
    'workflow:monorepo',
    'workflow:new-milestone',
    'workflow:next',
    'workflow:next-prompt',
    'workflow:note',
    'workflow:packet',
    'workflow:plan-check',
    'workflow:profile',
    'workflow:quick',
    'workflow:review',
    'workflow:review-mode',
    'workflow:review-orchestrate',
    'workflow:review-tasks',
    'workflow:route',
    'workflow:secure',
    'workflow:setup',
    'workflow:ship',
    'workflow:ship-readiness',
    'workflow:stats',
    'workflow:step-fulfillment',
    'workflow:team',
    'workflow:thread',
    'workflow:ui-direction',
    'workflow:ui-plan',
    'workflow:ui-review',
    'workflow:ui-spec',
    'workflow:uninstall',
    'workflow:update',
    'workflow:verify-browser',
    'workflow:verify-shell',
    'workflow:verify-work',
    'workflow:window',
    'workflow:workspaces',
    'workflow:workstreams',
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
  const content = `# WORKFLOW PRODUCT VERSION

- Installed version: \`${installedVersion}\`
- Previous version: \`${previousVersion}\`
- Install mode: \`${mode}\`
- Last refreshed at: \`${refreshedAt}\`
- Source package: \`${sourcePackageName()}@${installedVersion}\`

## Update Guidance

- \`Run rai update after pulling a newer raiola release\`
- \`Run rai doctor --strict if package scripts, runtime files, or skill aliases look stale\`
`;

  ensureDir(path.dirname(markerPath));
  fs.writeFileSync(markerPath, content);
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
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeProductManifest(targetRepo, options = {}) {
  const installedVersion = options.installedVersion || sourcePackageVersion();
  const scriptProfile = normalizeScriptProfile(options.scriptProfile, 'full');
  const productSource = options.sourceLayout || productSourceLayout(targetRepo);
  const manifestPath = productManifestPath(targetRepo);
  const runtimeFiles = runtimeFilesForScriptProfile(scriptProfile, {
    targetRepo,
    sourceLayout: productSource,
  });
  const manifest = {
    installedVersion,
    sourcePackageName: sourcePackageName(),
    sourcePackageVersion: sourcePackageVersion(),
    generatedAt: new Date().toISOString(),
    versionMarkerPath: '.workflow/VERSION.md',
    skillPath: '.agents/skills/raiola/SKILL.md',
    installerSourceRoot: productSource.repoRoot !== targetRepo ? productSource.repoRoot : null,
    scriptProfile,
    runtimeScripts: loadTargetRuntimeScripts(scriptProfile, {
      targetRepo,
      sourceLayout: productSource,
    }),
    runtimeSurfaceProfile: runtimeSurfaceProfileForScriptProfile(scriptProfile),
    runtimeFileCount: runtimeFiles.length,
    runtimeFiles,
    recommendedGitignoreEntries: [...WORKFLOW_GITIGNORE_ENTRIES],
  };

  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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

function copyFileTracked(sourcePath, targetPath, options = {}) {
  const { overwrite = false, bucket } = options;
  ensureDir(path.dirname(targetPath));

  const exists = fs.existsSync(targetPath);
  if (exists && !overwrite) {
    if (bucket) {
      bucket.skipped.push(targetPath);
    }
    return 'skipped';
  }

  fs.copyFileSync(sourcePath, targetPath);
  if (bucket) {
    bucket[exists ? 'updated' : 'created'].push(targetPath);
  }
  return exists ? 'updated' : 'created';
}

function copyDirectoryTracked(sourceDir, targetDir, options = {}) {
  const {
    overwrite = false,
    bucket = { created: [], updated: [], skipped: [] },
    filter = () => true,
  } = options;

  ensureDir(targetDir);
  const files = walkFiles(sourceDir, filter);
  for (const sourcePath of files) {
    const relative = path.relative(sourceDir, sourcePath);
    const targetPath = path.join(targetDir, relative);
    copyFileTracked(sourcePath, targetPath, { overwrite, bucket });
  }

  return bucket;
}

function loadTargetRuntimeScripts(profile = 'full', options = {}) {
  const source = options.sourceLayout || productSourceLayout(options.targetRepo || null);
  const sourcePackage = readJson(source.packageJson);
  const normalizedProfile = normalizeScriptProfile(profile, 'full');
  const allScripts = Object.entries(sourcePackage.scripts || {}).filter(([name]) => name.startsWith('workflow:'));
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
  const productSource = options.sourceLayout || productSourceLayout(options.targetRepo || null);
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
  const source = options.sourceLayout || productSourceLayout(options.targetRepo || null);
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
  ];

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
  const productSource = options.sourceLayout || productSourceLayout(targetRepo);
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
    ['cwf', 'node bin/cwf.js'],
  ]) {
    if (!packageJson.scripts[name]) {
      packageJson.scripts[name] = value;
      report.added.push(name);
    }
  }
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return report;
}

function cleanupEmptyParentDirs(startPath, stopPath) {
  let current = path.dirname(startPath);
  const absoluteStop = path.resolve(stopPath);
  while (current.startsWith(absoluteStop) && current !== absoluteStop) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) {
      return;
    }
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function pruneManagedRuntimeFiles(targetRepo, desiredRuntimeFiles, previousManifest = null) {
  const desired = new Set(desiredRuntimeFiles);
  const previouslyManaged = [...new Set((previousManifest?.runtimeFiles || []).filter(Boolean))];
  const removed = [];

  for (const relativeManagedPath of previouslyManaged) {
    if (desired.has(relativeManagedPath)) {
      continue;
    }
    const absoluteManagedPath = path.join(targetRepo, relativeManagedPath);
    if (!fs.existsSync(absoluteManagedPath)) {
      continue;
    }
    fs.rmSync(absoluteManagedPath, { recursive: true, force: true });
    cleanupEmptyParentDirs(absoluteManagedPath, targetRepo);
    removed.push(absoluteManagedPath);
  }

  return {
    removed,
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
- Use \`npm run workflow:hud\`, \`npm run workflow:next\`, and \`npm run workflow:health -- --strict\` to orient, route, and verify.
- Keep \`.workflow/state.json\` generated and non-canonical; markdown files remain the source of truth.
`;

  ensureDir(path.dirname(templatePath));
  fs.writeFileSync(templatePath, content);
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
  fs.writeFileSync(gitignorePath, `${lines.join('\n')}\n`);

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
  } = options;
  const source = productSourceLayout(targetRepo);
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
    path.join(targetRepo, 'bin', 'cwf.js'),
  ];
  const compareTarget = path.join(targetRepo, 'scripts', 'compare_golden_snapshots.ts');
  const skillTarget = path.join(targetRepo, '.agents', 'skills', 'raiola', 'SKILL.md');
  const legacySkillTarget = path.join(targetRepo, '.agents', 'skills', 'codex-workflow', 'SKILL.md');
  const workflowIgnoreTarget = path.join(targetRepo, '.workflowignore');
  const selectedRuntimeFiles = runtimeFilesForScriptProfile(selectedScriptProfile, {
    targetRepo,
    sourceLayout: source,
  });
  const selectedWorkflowFiles = new Set(
    selectedRuntimeFiles
      .filter((relativeManagedPath) => relativeManagedPath.startsWith('scripts/workflow/'))
      .map((relativeManagedPath) => relativeManagedPath.slice('scripts/workflow/'.length)),
  );
  const includeCompareScript = selectedRuntimeFiles.includes(relativePath(source.repoRoot, source.compareScript));

  ensureDir(targetRepo);

  const docsExists = fs.existsSync(docsTarget);
  if (mode === 'init' && docsExists && !forceDocs) {
    throw new Error(`Workflow root already exists at ${docsTarget}. Run workflow:migrate or pass --force-docs.`);
  }

  const report = {
    targetRepo,
    mode,
    docs: { created: [], updated: [], skipped: [] },
    scripts: { created: [], updated: [], skipped: [] },
    cli: { created: [], updated: [], skipped: [] },
    bin: null,
    binAliases: [],
    compareScript: null,
    skill: null,
    legacySkill: null,
    workflowIgnore: null,
    gitignore: null,
    packageScripts: null,
    agentsTemplate: null,
    productManifest: null,
    versionMarker: null,
    runtimeSurfaceProfile: runtimeSurfaceProfileForScriptProfile(selectedScriptProfile),
    runtimeFileCount: selectedRuntimeFiles.length,
    prunedRuntimeFiles: [],
    sync: null,
    hudState: null,
  };

  copyDirectoryTracked(source.templatesDir, docsTarget, {
    overwrite: forceDocs || refreshDocs,
    bucket: report.docs,
  });

  copyDirectoryTracked(source.scriptsDir, scriptsTarget, {
    overwrite: true,
    bucket: report.scripts,
    filter: (filePath) => selectedWorkflowFiles.has(relativePath(source.scriptsDir, filePath)),
  });
  copyDirectoryTracked(source.cliDir, cliTarget, {
    overwrite: true,
    bucket: report.cli,
  });

  report.bin = copyFileTracked(source.binFile, binTarget, { overwrite: true });
  report.binAliases = aliasBinTargets.map((targetPath, index) => copyFileTracked(source.aliasBinFiles[index], targetPath, { overwrite: true }));
  report.compareScript = includeCompareScript
    ? copyFileTracked(source.compareScript, compareTarget, { overwrite: true })
    : 'skipped';
  report.skill = copyFileTracked(source.skillFile, skillTarget, { overwrite: true });
  report.legacySkill = copyFileTracked(source.skillFile, legacySkillTarget, { overwrite: true });
  report.workflowIgnore = copyFileTracked(source.workflowIgnore, workflowIgnoreTarget, { overwrite: false });
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

  report.prunedRuntimeFiles = pruneManagedRuntimeFiles(targetRepo, selectedRuntimeFiles, existingManifest).removed;
  report.productManifest = writeProductManifest(targetRepo, {
    scriptProfile: selectedScriptProfile,
    sourceLayout: source,
  });
  report.versionMarker = writeVersionMarker(targetRepo, { mode });
  report.sync = syncDefaultWorkflowSurface(targetRepo, { setAsActive: mode === 'init' });
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
