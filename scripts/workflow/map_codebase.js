const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  ensureDir,
  hashString,
  loadPreferences,
  parseArgs,
  parseRefTable,
  read,
  resolveWorkflowRoot,
  safeExec,
  workflowPaths,
  write,
} = require('./common');
const { listIndexedRepoFiles } = require('./fs_index');

const GENERATOR_VERSION = 'phase2-map-v1';
const DEFAULT_LANES = ['stack', 'architecture', 'quality', 'risks'];
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.workflow',
  'dist',
  'build',
  'coverage',
]);

function printHelp() {
  console.log(`
map_codebase

Usage:
  node scripts/workflow/map_codebase.js

Options:
  --root <path>              Workflow root. Defaults to active workstream root
  --scope <workstream|repo>  Mapping scope. Defaults to workstream
  --paths <a,b;c>            Optional focused paths. Groups are separated by ;
  --lanes <a|b|c>            Lanes to refresh. Defaults to stack|architecture|quality|risks
  --refresh <incremental|full>
                             Refresh policy. Defaults to incremental
  --json                     Print machine-readable JSON
  --compact                  Print compact summary output
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parsePathGroups(value) {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value) ? value.join(';') : String(value);
  return raw
    .split(';')
    .map((group) => group.split(',').map((item) => item.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

function walkFiles(cwd, currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(cwd, fullPath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath(cwd, fullPath));
    }
  }

  return files;
}

function listRepoFiles(cwd, refreshMode = 'incremental') {
  return listIndexedRepoFiles(cwd, { refreshMode });
}

function fileExtensionCounts(files) {
  const counts = new Map();
  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase() || '<none>';
    counts.set(extension, (counts.get(extension) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([extension, count]) => ({ extension, count }));
}

function topLevelDirectories(files) {
  const dirs = new Map();
  for (const filePath of files) {
    const [head] = filePath.split('/');
    if (!head) {
      continue;
    }
    dirs.set(head, (dirs.get(head) || 0) + 1);
  }

  return [...dirs.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, fileCount]) => ({ name, fileCount }));
}

function detectPackageManager(fileSet) {
  if (fileSet.has('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (fileSet.has('yarn.lock')) {
    return 'yarn';
  }
  if (fileSet.has('bun.lockb') || fileSet.has('bun.lock')) {
    return 'bun';
  }
  if (fileSet.has('package-lock.json')) {
    return 'npm';
  }
  return 'unknown';
}

function maybeReadPackageJson(cwd) {
  const filePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function dependencyNames(pkg) {
  if (!pkg) {
    return [];
  }

  return Object.keys({
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  }).sort();
}

function detectFrameworks(pkg, fileSet) {
  const deps = new Set(dependencyNames(pkg));
  const frameworks = [];

  const register = (name, condition) => {
    if (condition) {
      frameworks.push(name);
    }
  };

  register('next', deps.has('next') || [...fileSet].some((file) => file.startsWith('app/') || file.startsWith('pages/')));
  register('react', deps.has('react'));
  register('vite', deps.has('vite') || [...fileSet].some((file) => /^vite\.config\./.test(path.basename(file))));
  register('tailwind', deps.has('tailwindcss') || [...fileSet].some((file) => /^tailwind\.config\./.test(path.basename(file))) || fileSet.has('components.json'));
  register('vitest', deps.has('vitest') || [...fileSet].some((file) => /^vitest\.config\./.test(path.basename(file))));
  register('jest', deps.has('jest') || [...fileSet].some((file) => /^jest\.config\./.test(path.basename(file))));
  register('playwright', deps.has('@playwright/test') || fileSet.has('playwright.config.ts') || fileSet.has('playwright.config.js'));
  register('storybook', deps.has('@storybook/react') || fileSet.has('.storybook/main.ts') || fileSet.has('.storybook/main.js'));
  register('express', deps.has('express'));
  register('typescript', deps.has('typescript') || fileSet.has('tsconfig.json'));

  return frameworks;
}

function detectLanguages(extensionCounts) {
  const mapping = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript/TSX',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript/JSX',
    '.mjs': 'JavaScript modules',
    '.cjs': 'CommonJS',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
    '.yml': 'YAML',
    '.yaml': 'YAML',
    '.sh': 'Shell',
  };

  return extensionCounts
    .filter((item) => mapping[item.extension])
    .slice(0, 6)
    .map((item) => `${mapping[item.extension]} (${item.count})`);
}

function canonicalWorkflowRefs(paths) {
  const refs = [];
  for (const filePath of [paths.context, paths.execplan, paths.validation]) {
    const content = read(filePath);
    refs.push(...parseRefTable(content, 'Canonical Refs').map((item) => item.ref));
    refs.push(...parseRefTable(content, 'Upstream Refs').map((item) => item.ref));
  }

  return [...new Set(refs)].sort();
}

function repoShape(pkg) {
  if (!pkg) {
    return 'no-package-json';
  }

  if (Array.isArray(pkg.workspaces) || pkg.workspaces?.packages) {
    return 'monorepo';
  }

  return 'single-package';
}

function listCiWorkflows(files) {
  return files.filter((filePath) => filePath.startsWith('.github/workflows/') && /\.(yml|yaml)$/.test(filePath));
}

function listTestFiles(files) {
  return files.filter((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath) || /\.(test|spec)\.[^.]+$/.test(path.basename(filePath)));
}

function workflowScriptNames(pkg) {
  return Object.keys(pkg?.scripts || {}).filter((name) => name.startsWith('workflow:')).sort();
}

function dependencyVersionMap(pkg) {
  return {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
    ...(pkg?.peerDependencies || {}),
    ...(pkg?.optionalDependencies || {}),
  };
}

function lintAndVerifyScripts(pkg) {
  return Object.keys(pkg?.scripts || {}).filter((name) => /(lint|test|check|verify|typecheck|build)/i.test(name)).sort();
}

function detectIntegrations(pkg, files) {
  const deps = dependencyVersionMap(pkg);
  const fileSet = new Set(files);
  const rules = [
    { name: 'GitHub Actions', check: () => files.some((filePath) => filePath.startsWith('.github/workflows/')), evidence: files.filter((filePath) => filePath.startsWith('.github/workflows/')).slice(0, 5) },
    { name: 'Storybook', check: () => 'storybook' in deps || files.some((filePath) => filePath.startsWith('.storybook/')), evidence: files.filter((filePath) => filePath.startsWith('.storybook/')).slice(0, 5) },
    { name: 'Playwright', check: () => '@playwright/test' in deps || fileSet.has('playwright.config.ts') || fileSet.has('playwright.config.js'), evidence: ['@playwright/test', 'playwright.config.ts', 'playwright.config.js'].filter((item) => item in deps || fileSet.has(item)) },
    { name: 'Cypress', check: () => 'cypress' in deps || fileSet.has('cypress.config.ts') || fileSet.has('cypress.config.js'), evidence: ['cypress', 'cypress.config.ts', 'cypress.config.js'].filter((item) => item in deps || fileSet.has(item)) },
    { name: 'Vercel', check: () => 'vercel' in deps || files.some((filePath) => filePath.startsWith('.vercel/')), evidence: ['vercel', '.vercel/'].filter((item) => item in deps || files.some((filePath) => filePath.startsWith('.vercel/'))) },
    { name: 'Supabase', check: () => '@supabase/supabase-js' in deps, evidence: ['@supabase/supabase-js'].filter((item) => item in deps) },
    { name: 'Stripe', check: () => 'stripe' in deps || '@stripe/stripe-js' in deps, evidence: ['stripe', '@stripe/stripe-js'].filter((item) => item in deps) },
    { name: 'Sentry', check: () => '@sentry/node' in deps || '@sentry/react' in deps || '@sentry/nextjs' in deps, evidence: ['@sentry/node', '@sentry/react', '@sentry/nextjs'].filter((item) => item in deps) },
    { name: 'Tailwind', check: () => 'tailwindcss' in deps || files.some((filePath) => /^tailwind\.config\./.test(path.basename(filePath))), evidence: ['tailwindcss'].filter((item) => item in deps).concat(files.filter((filePath) => /^tailwind\.config\./.test(path.basename(filePath))).slice(0, 3)) },
    { name: 'shadcn/ui', check: () => fileSet.has('components.json'), evidence: ['components.json'].filter((item) => fileSet.has(item)) },
  ];

  return rules
    .filter((rule) => rule.check())
    .map((rule) => ({
      name: rule.name,
      evidence: rule.evidence,
    }));
}

function computeFingerprint(cwd, inputPaths, extra = {}) {
  const payload = inputPaths
    .sort()
    .map((relativeFile) => {
      const absoluteFile = path.join(cwd, relativeFile);
      if (!fs.existsSync(absoluteFile)) {
        return { path: relativeFile, missing: true };
      }

      const stat = fs.statSync(absoluteFile);
      return {
        path: relativeFile,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      };
    });

  return hashString(JSON.stringify({ payload, extra }));
}

function take(files, predicates) {
  return files.filter((filePath) => predicates.some((predicate) => predicate(filePath)));
}

function laneInputs({ cwd, files, paths, workstreamRefs }) {
  const fileSet = new Set(files);
  const stackInputs = take(files, [
    (filePath) => /(^|\/)package\.json$/.test(filePath),
    (filePath) => /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig\.json|jsconfig\.json|components\.json)$/.test(filePath),
    (filePath) => /(next\.config|vite\.config|tailwind\.config|postcss\.config|vitest\.config|jest\.config|playwright\.config|cypress\.config)\./.test(path.basename(filePath)),
  ]);
  const architectureInputs = [
    ...new Set([
      'README.md',
      'AGENTS.md',
      relativePath(cwd, paths.project),
      relativePath(cwd, paths.runtime),
      relativePath(cwd, paths.execplan),
      ...workstreamRefs,
      ...topLevelDirectories(files).slice(0, 12).map((item) => `${item.name}/`),
    ]),
  ];
  const qualityInputs = take(files, [
    (filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath),
    (filePath) => /\.(test|spec)\.[^.]+$/.test(path.basename(filePath)),
    (filePath) => /(vitest\.config|jest\.config|playwright\.config|cypress\.config|eslint\.config|\.eslintrc|prettier|lefthook|husky)/.test(path.basename(filePath)),
    (filePath) => filePath.startsWith('.github/workflows/'),
    (filePath) => filePath.startsWith('tests/golden/'),
    (filePath) => filePath === 'package.json',
  ]);
  const riskInputs = [
    ...new Set([
      'package.json',
      'AGENTS.md',
      relativePath(cwd, paths.preferences),
      relativePath(cwd, paths.workstreams),
      ...qualityInputs.slice(0, 16),
    ]),
  ].filter((filePath) => filePath && (fileSet.has(filePath) || filePath.endsWith('/')));

  return {
    stack: stackInputs,
    architecture: architectureInputs,
    quality: qualityInputs,
    risks: riskInputs,
  };
}

function buildStackLane({ cwd, files, pkg, fileSet, extensionCounts, laneInputPaths }) {
  const packageManager = detectPackageManager(fileSet);
  const frameworks = detectFrameworks(pkg, fileSet);
  const scripts = Object.keys(pkg?.scripts || {}).sort();
  const workflowScripts = workflowScriptNames(pkg);
  const uiSignals = [];
  if (fileSet.has('components.json')) {
    uiSignals.push('components.json present');
  }
  if ([...fileSet].some((filePath) => /^tailwind\.config\./.test(path.basename(filePath))) || frameworks.includes('tailwind')) {
    uiSignals.push('Tailwind detected');
  }
  if ([...fileSet].some((filePath) => filePath.startsWith('components/'))) {
    uiSignals.push('components/ directory present');
  }

  return {
    lane: 'stack',
    fingerprint: computeFingerprint(cwd, laneInputPaths, {
      packageManager,
      frameworks,
      scripts: scripts.length,
    }),
    inputs: laneInputPaths.sort(),
    summary: [
      `Package manager: ${packageManager}`,
      `Frameworks/tooling: ${frameworks.length > 0 ? frameworks.join(', ') : 'none detected'}`,
      `Primary languages: ${detectLanguages(extensionCounts).join(', ') || 'unknown'}`,
      `Workflow scripts present: ${workflowScripts.length}`,
    ],
    data: {
      packageManager,
      frameworks,
      languages: detectLanguages(extensionCounts),
      scripts,
      workflowScripts,
      uiSignals,
      dependencyCount: dependencyNames(pkg).length,
    },
  };
}

function buildIntegrationLane({ pkg, files }) {
  const integrations = detectIntegrations(pkg, files);
  return {
    summary: integrations.length > 0
      ? integrations.map((item) => `${item.name}: ${item.evidence.join(', ') || 'detected'}`)
      : ['No prominent integration surfaces detected from config files and dependencies'],
    data: {
      integrations,
    },
  };
}

function buildArchitectureLane({ cwd, files, pkg, paths, workstreamRefs, laneInputPaths }) {
  const topDirs = topLevelDirectories(files);
  const likelyRoots = topDirs
    .filter((item) => ['src', 'app', 'pages', 'components', 'lib', 'packages', 'tests', 'scripts', 'docs'].includes(item.name))
    .map((item) => item.name);
  const workflowRoot = relativePath(cwd, paths.rootDir);
  const appSignals = files.filter((filePath) => /^(src|app|pages|components|lib)\//.test(filePath)).slice(0, 12);

  return {
    lane: 'architecture',
    fingerprint: computeFingerprint(cwd, laneInputPaths.filter((item) => !item.endsWith('/')), {
      repoShape: repoShape(pkg),
      topDirs: topDirs.slice(0, 12),
      workstreamRefCount: workstreamRefs.length,
    }),
    inputs: laneInputPaths.sort(),
    summary: [
      `Repo shape: ${repoShape(pkg)}`,
      `Top-level directories: ${topDirs.slice(0, 6).map((item) => `${item.name}(${item.fileCount})`).join(', ') || 'none'}`,
      `Likely implementation roots: ${likelyRoots.join(', ') || 'none detected'}`,
      `Workflow root: ${workflowRoot} with ${workstreamRefs.length} tracked refs`,
    ],
    data: {
      repoShape: repoShape(pkg),
      topLevelDirectories: topDirs,
      likelyRoots,
      workflowRoot,
      workstreamRefs,
      sampleAppFiles: appSignals,
    },
  };
}

function buildQualityLane({ cwd, files, pkg, laneInputPaths }) {
  const testFiles = listTestFiles(files);
  const ciWorkflows = listCiWorkflows(files);
  const lintScripts = lintAndVerifyScripts(pkg);
  const goldenFiles = files.filter((filePath) => filePath.startsWith('tests/golden/'));
  const qualitySignals = [];

  if (testFiles.length > 0) {
    qualitySignals.push(`${testFiles.length} test file(s)`);
  }
  if (ciWorkflows.length > 0) {
    qualitySignals.push(`${ciWorkflows.length} CI workflow(s)`);
  }
  if (goldenFiles.length > 0) {
    qualitySignals.push(`${goldenFiles.length} golden snapshot file(s)`);
  }

  return {
    lane: 'quality',
    fingerprint: computeFingerprint(cwd, laneInputPaths, {
      testCount: testFiles.length,
      ciCount: ciWorkflows.length,
      scriptCount: lintScripts.length,
    }),
    inputs: laneInputPaths.sort(),
    summary: [
      `Tests: ${testFiles.length > 0 ? `${testFiles.length} file(s)` : 'none detected'}`,
      `CI workflows: ${ciWorkflows.length > 0 ? ciWorkflows.join(', ') : 'none detected'}`,
      `Verify scripts: ${lintScripts.length > 0 ? lintScripts.join(', ') : 'none detected'}`,
      `Golden coverage: ${goldenFiles.length > 0 ? `${goldenFiles.length} file(s)` : 'none detected'}`,
    ],
    data: {
      testFiles: testFiles.slice(0, 50),
      ciWorkflows,
      verifyScripts: lintScripts,
      goldenFiles: goldenFiles.slice(0, 50),
      qualitySignals,
    },
  };
}

function buildRiskLane({ cwd, files, pkg, fileSet, laneInputPaths }) {
  const risks = [];
  const testFiles = listTestFiles(files);
  const ciWorkflows = listCiWorkflows(files);
  const packageManagerLocks = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock']
    .filter((filePath) => fileSet.has(filePath));
  const gitStatus = safeExec('git', ['status', '--short'], { cwd });
  const hasDirtyWorktree = gitStatus.ok && Boolean(gitStatus.stdout);

  const pushRisk = (severity, title, detail, evidence = []) => {
    risks.push({ severity, title, detail, evidence });
  };

  if (packageManagerLocks.length === 0 && fs.existsSync(path.join(cwd, 'package.json'))) {
    pushRisk('medium', 'No lockfile detected', 'Dependency installs may drift across machines.', ['package.json']);
  }
  if (packageManagerLocks.length > 1) {
    pushRisk('medium', 'Multiple lockfiles detected', 'Tooling intent is ambiguous and install commands may diverge.', packageManagerLocks);
  }
  if (testFiles.length === 0) {
    pushRisk('high', 'No automated tests detected', 'Parallel execution and audit work will rely on manual verification.', []);
  }
  if (ciWorkflows.length === 0) {
    pushRisk('medium', 'No CI workflow detected', 'Quality regressions may only be caught locally.', []);
  }
  if (hasDirtyWorktree) {
    pushRisk('medium', 'Dirty worktree', 'Delegation and packet freshness can drift while local changes are unstaged or uncommitted.', gitStatus.stdout.split('\n').slice(0, 10));
  }
  if ((pkg?.scripts && !pkg.scripts.test) || !pkg?.scripts) {
    pushRisk('low', 'No canonical test script', 'Audit planning may need command-by-command setup instead of one stable entrypoint.', ['package.json']);
  }

  return {
    lane: 'risks',
    fingerprint: computeFingerprint(cwd, laneInputPaths, {
      riskCount: risks.length,
      dirty: hasDirtyWorktree,
    }),
    inputs: laneInputPaths.sort(),
    summary: risks.length > 0
      ? risks.map((risk) => `${risk.severity.toUpperCase()}: ${risk.title}`)
      : ['No immediate structural risks detected from the repo surface'],
    data: {
      risks,
      dirtyWorktree: hasDirtyWorktree,
      lockfiles: packageManagerLocks,
    },
  };
}

function renderMarkdown(map) {
  const lines = [
    '# CODEBASE MAP',
    '',
    `- Generated at: \`${map.generatedAt}\``,
    `- Generator version: \`${map.generatorVersion}\``,
    `- Scope: \`${map.scope.kind}\``,
    `- Workflow root: \`${map.workflowRootRelative}\``,
    `- Refresh mode: \`${map.freshness.refreshMode}\``,
    `- Refresh status: \`${map.freshness.refreshStatus}\``,
    `- Input fingerprint: \`${map.freshness.inputFingerprint}\``,
    '',
  ];

  for (const laneName of DEFAULT_LANES) {
    const lane = map.lanes[laneName];
    lines.push(`## ${laneName[0].toUpperCase()}${laneName.slice(1)}`);
    lines.push('');
    lines.push(`- Refresh: \`${lane.refreshStatus}\``);
    lines.push(`- Fingerprint: \`${lane.fingerprint}\``);
    lines.push(`- Inputs: \`${lane.inputs.length}\``);
    for (const item of lane.summary) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderSectionDocument(title, subtitle, bullets, sections = []) {
  const lines = [`# ${title}`, '', ...subtitle.map((line) => `- ${line}`), ''];

  for (const section of sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');
    if (!section.items || section.items.length === 0) {
      lines.push('- `None`');
    } else {
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
    }
    lines.push('');
  }

  if (bullets.length > 0) {
    lines.push('## Summary');
    lines.push('');
    for (const bullet of bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderStackDocument(map) {
  const lane = map.lanes.stack;
  return renderSectionDocument(
    'STACK',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Refresh: \`${lane.refreshStatus}\``,
      `Fingerprint: \`${lane.fingerprint}\``,
    ],
    lane.summary,
    [
      {
        heading: 'Frameworks',
        items: lane.data.frameworks.map((item) => `\`${item}\``),
      },
      {
        heading: 'Primary Languages',
        items: lane.data.languages.map((item) => `\`${item}\``),
      },
      {
        heading: 'UI Signals',
        items: lane.data.uiSignals.map((item) => `\`${item}\``),
      },
      {
        heading: 'Workflow Scripts',
        items: lane.data.workflowScripts.map((item) => `\`${item}\``),
      },
    ],
  );
}

function renderIntegrationsDocument(map) {
  const integration = map.surfaces.integrations;
  return renderSectionDocument(
    'INTEGRATIONS',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Source lane: \`stack\``,
    ],
    integration.summary,
    [
      {
        heading: 'Detected Integrations',
        items: integration.data.integrations.map((item) => `\`${item.name}\` -> ${item.evidence.join(', ') || 'detected'}`),
      },
    ],
  );
}

function renderArchitectureDocument(map) {
  const lane = map.lanes.architecture;
  return renderSectionDocument(
    'ARCHITECTURE',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Refresh: \`${lane.refreshStatus}\``,
      `Fingerprint: \`${lane.fingerprint}\``,
    ],
    lane.summary,
    [
      {
        heading: 'Likely Roots',
        items: lane.data.likelyRoots.map((item) => `\`${item}\``),
      },
      {
        heading: 'Workstream Refs',
        items: lane.data.workstreamRefs.map((item) => `\`${item}\``),
      },
      {
        heading: 'Sample App Files',
        items: lane.data.sampleAppFiles.map((item) => `\`${item}\``),
      },
    ],
  );
}

function renderStructureDocument(map) {
  return renderSectionDocument(
    'STRUCTURE',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Scope: \`${map.scope.kind}\``,
      `File count: \`${map.repo.fileCount}\``,
    ],
    [
      `Top-level directories tracked: ${map.repo.topLevelDirectories.length}`,
      `Extension families tracked: ${map.repo.extensionCounts.length}`,
    ],
    [
      {
        heading: 'Top-Level Directories',
        items: map.repo.topLevelDirectories.slice(0, 20).map((item) => `\`${item.name}\` -> ${item.fileCount} file(s)`),
      },
      {
        heading: 'Extension Counts',
        items: map.repo.extensionCounts.slice(0, 20).map((item) => `\`${item.extension}\` -> ${item.count}`),
      },
      {
        heading: 'Focused Paths',
        items: map.scope.focusedPaths.map((item) => `\`${item}\``),
      },
    ],
  );
}

function renderTestingDocument(map) {
  const lane = map.lanes.quality;
  return renderSectionDocument(
    'TESTING',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Refresh: \`${lane.refreshStatus}\``,
      `Fingerprint: \`${lane.fingerprint}\``,
    ],
    lane.summary,
    [
      {
        heading: 'Verify Scripts',
        items: lane.data.verifyScripts.map((item) => `\`${item}\``),
      },
      {
        heading: 'CI Workflows',
        items: lane.data.ciWorkflows.map((item) => `\`${item}\``),
      },
      {
        heading: 'Test Files',
        items: lane.data.testFiles.map((item) => `\`${item}\``),
      },
      {
        heading: 'Golden Files',
        items: lane.data.goldenFiles.map((item) => `\`${item}\``),
      },
    ],
  );
}

function renderConcernsDocument(map) {
  const lane = map.lanes.risks;
  return renderSectionDocument(
    'CONCERNS',
    [
      `Generated at: \`${map.generatedAt}\``,
      `Workflow root: \`${map.workflowRootRelative}\``,
      `Refresh: \`${lane.refreshStatus}\``,
      `Fingerprint: \`${lane.fingerprint}\``,
    ],
    lane.summary,
    [
      {
        heading: 'Risk Ledger',
        items: lane.data.risks.map((item) => `\`${item.severity.toUpperCase()}\` ${item.title}: ${item.detail}`),
      },
      {
        heading: 'Lockfiles',
        items: lane.data.lockfiles.map((item) => `\`${item}\``),
      },
    ],
  );
}

function determineScope(rootDir, scopeKind, pathGroups) {
  return {
    kind: scopeKind,
    workflowRoot: rootDir,
    focusedPaths: pathGroups.flat(),
  };
}

function buildCodebaseMap(cwd, rootDir, options = {}) {
  const refreshMode = options.refreshMode || 'incremental';
  const lanes = options.lanes && options.lanes.length > 0 ? options.lanes : DEFAULT_LANES;
  const scopeKind = options.scopeKind || 'workstream';
  const pathGroups = options.pathGroups || [];
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const preferences = loadPreferences(paths);
  const repoIndex = listRepoFiles(cwd, refreshMode);
  const files = repoIndex.files;
  const fileSet = new Set(files);
  const pkg = maybeReadPackageJson(cwd);
  const extensionCounts = fileExtensionCounts(files);
  const workstreamRefs = canonicalWorkflowRefs(paths);
  const inputByLane = laneInputs({ cwd, files, paths, workstreamRefs });
  const mapFile = path.join(cwd, '.workflow', 'codebase-map.json');
  const markdownFile = path.join(cwd, '.workflow', 'codebase-map.md');
  const previous = refreshMode === 'incremental' ? readJsonIfExists(mapFile) : null;
  const scope = determineScope(rootDir, scopeKind, pathGroups);
  const scopeSignature = hashString(JSON.stringify({
    scopeKind,
    workflowRoot: relativePath(cwd, rootDir),
    focusedPaths: scope.focusedPaths,
    preference: preferences.teamLiteDelegation,
  }));
  const builtLanes = {};
  const laneStatuses = {};

  const builders = {
    stack: () => buildStackLane({ cwd, files, pkg, fileSet, extensionCounts, laneInputPaths: inputByLane.stack }),
    architecture: () => buildArchitectureLane({ cwd, files, pkg, paths, workstreamRefs, laneInputPaths: inputByLane.architecture }),
    quality: () => buildQualityLane({ cwd, files, pkg, laneInputPaths: inputByLane.quality }),
    risks: () => buildRiskLane({ cwd, files, pkg, fileSet, laneInputPaths: inputByLane.risks }),
  };

  for (const laneName of DEFAULT_LANES) {
    if (!lanes.includes(laneName) && previous?.lanes?.[laneName]) {
      builtLanes[laneName] = {
        ...previous.lanes[laneName],
        refreshStatus: 'reused',
      };
      laneStatuses[laneName] = 'reused';
      continue;
    }

    const lane = builders[laneName]();
    const previousLane = previous?.freshness?.scopeSignature === scopeSignature ? previous.lanes?.[laneName] : null;
    if (refreshMode === 'incremental' && previousLane && previousLane.fingerprint === lane.fingerprint) {
      builtLanes[laneName] = {
        ...previousLane,
        refreshStatus: 'reused',
        fingerprint: lane.fingerprint,
        inputs: lane.inputs,
      };
      laneStatuses[laneName] = 'reused';
      continue;
    }

    builtLanes[laneName] = {
      ...lane,
      refreshStatus: previousLane ? 'refreshed' : 'initial',
    };
    laneStatuses[laneName] = builtLanes[laneName].refreshStatus;
  }

  const inputFingerprint = hashString(JSON.stringify({
    scopeSignature,
    laneFingerprints: Object.fromEntries(DEFAULT_LANES.map((lane) => [lane, builtLanes[lane].fingerprint])),
  }));
  const refreshStatus = Object.values(laneStatuses).every((status) => status === 'reused')
    ? 'reused'
    : previous
      ? 'incremental_refresh'
      : 'initial';
  const map = {
    generatedAt: new Date().toISOString(),
    generatorVersion: GENERATOR_VERSION,
    repoRoot: cwd,
    workflowRoot: rootDir,
    workflowRootRelative: relativePath(cwd, rootDir),
    scope,
    freshness: {
      refreshMode,
      refreshStatus,
      scopeSignature,
      inputFingerprint,
      laneStatuses,
      previousGeneratedAt: previous?.generatedAt || null,
      fileCount: files.length,
      indexStatus: repoIndex.refreshStatus,
      changedFileCount: repoIndex.changedFiles.length,
      indexPath: repoIndex.indexPath,
    },
    repo: {
      fileCount: files.length,
      topLevelDirectories: topLevelDirectories(files),
      extensionCounts: extensionCounts.slice(0, 12),
      changedFiles: repoIndex.changedFiles.slice(0, 50),
    },
    lanes: builtLanes,
  };
  map.surfaces = {
    integrations: buildIntegrationLane({ pkg, files }),
  };

  if (options.writeFiles !== false) {
    ensureDir(path.dirname(mapFile));
    const surfacesDir = path.join(cwd, '.workflow', 'codebase');
    ensureDir(surfacesDir);
    write(mapFile, `${JSON.stringify(map, null, 2)}\n`);
    write(markdownFile, renderMarkdown(map));
    const surfaceFiles = {
      stack: path.join(surfacesDir, 'STACK.md'),
      integrations: path.join(surfacesDir, 'INTEGRATIONS.md'),
      architecture: path.join(surfacesDir, 'ARCHITECTURE.md'),
      structure: path.join(surfacesDir, 'STRUCTURE.md'),
      testing: path.join(surfacesDir, 'TESTING.md'),
      concerns: path.join(surfacesDir, 'CONCERNS.md'),
    };
    write(surfaceFiles.stack, renderStackDocument(map));
    write(surfaceFiles.integrations, renderIntegrationsDocument(map));
    write(surfaceFiles.architecture, renderArchitectureDocument(map));
    write(surfaceFiles.structure, renderStructureDocument(map));
    write(surfaceFiles.testing, renderTestingDocument(map));
    write(surfaceFiles.concerns, renderConcernsDocument(map));
    map.files = {
      json: mapFile,
      markdown: markdownFile,
      surfaces: surfaceFiles,
    };
  } else {
    map.files = {
      json: mapFile,
      markdown: markdownFile,
      surfaces: {
        stack: path.join(cwd, '.workflow', 'codebase', 'STACK.md'),
        integrations: path.join(cwd, '.workflow', 'codebase', 'INTEGRATIONS.md'),
        architecture: path.join(cwd, '.workflow', 'codebase', 'ARCHITECTURE.md'),
        structure: path.join(cwd, '.workflow', 'codebase', 'STRUCTURE.md'),
        testing: path.join(cwd, '.workflow', 'codebase', 'TESTING.md'),
        concerns: path.join(cwd, '.workflow', 'codebase', 'CONCERNS.md'),
      },
    };
  }
  return map;
}

function printCompact(map) {
  const laneSummary = DEFAULT_LANES
    .map((laneName) => `${laneName}:${map.lanes[laneName].refreshStatus}/${map.lanes[laneName].fingerprint.slice(0, 10)}`)
    .join(' ');
  console.log(`# MAP\n`);
  console.log(`- root=\`${map.workflowRootRelative}\` scope=\`${map.scope.kind}\` files=\`${map.repo.fileCount}\` refresh=\`${map.freshness.refreshStatus}\``);
  console.log(`- lanes=\`${laneSummary}\``);
  console.log(`- files=\`.workflow/codebase-map.json .workflow/codebase-map.md .workflow/codebase/*\``);
}

function printStandard(map) {
  process.stdout.write(renderMarkdown(map));
  console.log(`## Files`);
  console.log('');
  console.log(`- JSON: \`${relativePath(map.repoRoot, map.files.json)}\``);
  console.log(`- Markdown: \`${relativePath(map.repoRoot, map.files.markdown)}\``);
  console.log(`- STACK: \`${relativePath(map.repoRoot, map.files.surfaces.stack)}\``);
  console.log(`- INTEGRATIONS: \`${relativePath(map.repoRoot, map.files.surfaces.integrations)}\``);
  console.log(`- ARCHITECTURE: \`${relativePath(map.repoRoot, map.files.surfaces.architecture)}\``);
  console.log(`- STRUCTURE: \`${relativePath(map.repoRoot, map.files.surfaces.structure)}\``);
  console.log(`- TESTING: \`${relativePath(map.repoRoot, map.files.surfaces.testing)}\``);
  console.log(`- CONCERNS: \`${relativePath(map.repoRoot, map.files.surfaces.concerns)}\``);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const map = buildCodebaseMap(cwd, rootDir, {
    refreshMode: args.refresh === 'full' ? 'full' : 'incremental',
    lanes: args.lanes ? String(args.lanes).split('|').map((item) => item.trim()).filter(Boolean) : DEFAULT_LANES,
    scopeKind: args.scope === 'repo' ? 'repo' : 'workstream',
    pathGroups: parsePathGroups(args.paths),
    writeFiles: true,
  });

  if (args.json) {
    console.log(JSON.stringify(map, null, 2));
    return;
  }

  if (args.compact) {
    printCompact(map);
    return;
  }

  printStandard(map);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_LANES,
  buildCodebaseMap,
  renderMarkdown,
};
