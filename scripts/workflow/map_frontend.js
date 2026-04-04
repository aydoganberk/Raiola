const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  ensureDir,
  getFieldValue,
  hashString,
  parseArgs,
  read,
  readIfExists,
  renderMarkdownTable,
  replaceOrAppendField,
  replaceOrAppendSection,
  resolveWorkflowRoot,
  safeExec,
  today,
  tryExtractSection,
  workflowPaths,
  write,
} = require('./common');
const { listIndexedRepoFiles } = require('./fs_index');
const { writeStateSurface } = require('./state_surface');

const GENERATOR_VERSION = 'phase5-frontend-v1';
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
const INTENT_KEYWORDS = [
  { id: 'landing_page', label: 'landing page', pattern: /\blanding page\b/i },
  { id: 'frontend', label: 'frontend', pattern: /\bfrontend\b/i },
  { id: 'ui', label: 'UI', pattern: /\bui\b/i },
  { id: 'screen', label: 'screen', pattern: /\bscreen(s)?\b/i },
  { id: 'component', label: 'component', pattern: /\bcomponent(s)?\b/i },
  { id: 'design', label: 'design', pattern: /\bdesign\b/i },
  { id: 'responsive', label: 'responsive', pattern: /\bresponsive\b/i },
];
const FRONTEND_CONFIG_PATTERNS = [
  /^next\.config\./,
  /^vite\.config\./,
  /^astro\.config\./,
  /^remix\.config\./,
  /^tailwind\.config\./,
  /^postcss\.config\./,
  /^playwright\.config\./,
  /^storybook\.config\./,
];

function printHelp() {
  console.log(`
map_frontend

Usage:
  node scripts/workflow/map_frontend.js

Options:
  --root <path>              Workflow root. Defaults to active workstream root
  --scope <workstream|repo>  Mapping scope. Defaults to workstream
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
  const content = readIfExists(filePath);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
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

function maybeReadPackageJson(cwd) {
  const filePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function dependencyVersionMap(pkg) {
  return {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
    ...(pkg?.peerDependencies || {}),
    ...(pkg?.optionalDependencies || {}),
  };
}

function dependencyNames(pkg) {
  return Object.keys(dependencyVersionMap(pkg)).sort();
}

function firstExisting(files, patterns) {
  for (const filePath of files) {
    const base = path.basename(filePath);
    if (patterns.some((pattern) => pattern.test(base))) {
      return filePath;
    }
  }
  return null;
}

function detectFramework(pkg, fileSet, files) {
  const deps = dependencyVersionMap(pkg);
  const evidence = {};
  const detected = [];

  const register = (name, condition, items) => {
    if (!condition) {
      return;
    }
    detected.push(name);
    evidence[name] = items.filter(Boolean);
  };

  register('Next', Boolean(deps.next) || files.some((filePath) => /^next\.config\./.test(path.basename(filePath))) || fileSet.has('app/layout.tsx'), [
    deps.next ? 'next' : '',
    firstExisting(files, [/^next\.config\./]),
    fileSet.has('app/layout.tsx') ? 'app/layout.tsx' : '',
  ]);
  register('Vite', Boolean(deps.vite) || files.some((filePath) => /^vite\.config\./.test(path.basename(filePath))), [
    deps.vite ? 'vite' : '',
    firstExisting(files, [/^vite\.config\./]),
  ]);
  register('Astro', Boolean(deps.astro) || files.some((filePath) => /^astro\.config\./.test(path.basename(filePath))), [
    deps.astro ? 'astro' : '',
    firstExisting(files, [/^astro\.config\./]),
  ]);
  register('Remix', Boolean(deps['@remix-run/react']) || Boolean(deps['@remix-run/node']) || files.some((filePath) => /^remix\.config\./.test(path.basename(filePath))), [
    deps['@remix-run/react'] ? '@remix-run/react' : '',
    deps['@remix-run/node'] ? '@remix-run/node' : '',
    firstExisting(files, [/^remix\.config\./]),
  ]);

  const primary = detected[0] || 'Custom';
  return { primary, detected: detected.length > 0 ? detected : ['Custom'], evidence };
}

function detectStyling(pkg, files) {
  const deps = dependencyVersionMap(pkg);
  const cssModuleFiles = files.filter((filePath) => /\.module\.(css|scss|sass|less)$/.test(filePath)).slice(0, 8);
  const detected = [];
  const evidence = {};

  if (deps.tailwindcss || files.some((filePath) => /^tailwind\.config\./.test(path.basename(filePath))) || files.some((filePath) => /^postcss\.config\./.test(path.basename(filePath)))) {
    detected.push('Tailwind');
    evidence.Tailwind = [
      deps.tailwindcss ? 'tailwindcss' : '',
      firstExisting(files, [/^tailwind\.config\./, /^postcss\.config\./]),
    ].filter(Boolean);
  }
  if (cssModuleFiles.length > 0) {
    detected.push('CSS Modules');
    evidence['CSS Modules'] = cssModuleFiles;
  }
  if (deps['styled-components']) {
    detected.push('styled-components');
    evidence['styled-components'] = ['styled-components'];
  }

  if (detected.length === 0) {
    detected.push('custom');
    evidence.custom = files.filter((filePath) => /\.(css|scss|sass|less)$/.test(filePath)).slice(0, 8);
  }

  return { detected, evidence };
}

function detectUiSystem(pkg, fileSet, files) {
  const deps = dependencyVersionMap(pkg);
  const radixDeps = dependencyNames(pkg).filter((name) => name.startsWith('@radix-ui/'));
  const detected = [];
  const evidence = {};

  if (fileSet.has('components.json')) {
    detected.push('shadcn');
    evidence.shadcn = ['components.json'];
  }
  if (radixDeps.length > 0) {
    detected.push('Radix');
    evidence.Radix = radixDeps.slice(0, 8);
  }
  if (deps['@mui/material']) {
    detected.push('MUI');
    evidence.MUI = ['@mui/material'];
  }
  if (deps['@chakra-ui/react']) {
    detected.push('Chakra');
    evidence.Chakra = ['@chakra-ui/react'];
  }
  if (detected.length === 0) {
    detected.push('custom');
    evidence.custom = files.filter((filePath) => /^(components|src\/components|app\/components|ui)\//.test(filePath)).slice(0, 8);
  }

  return { primary: detected[0], detected, evidence };
}

function detectStackFamilies(pkg, fileSet, files) {
  const deps = dependencyVersionMap(pkg);
  const forms = [
    'react-hook-form',
    'formik',
    'final-form',
    'zod',
    '@conform-to/react',
  ].filter((name) => Boolean(deps[name]));
  const data = [
    '@tanstack/react-query',
    'swr',
    '@apollo/client',
    'urql',
    'axios',
    'ky',
  ].filter((name) => Boolean(deps[name]));
  const motion = [
    'framer-motion',
    'motion',
    'react-spring',
    'auto-animate',
  ].filter((name) => Boolean(deps[name]));
  const tests = [
    'vitest',
    'jest',
    '@playwright/test',
    'cypress',
    '@testing-library/react',
    '@storybook/react',
  ].filter((name) => Boolean(deps[name]));
  const presence = {
    storybook: Boolean(deps['@storybook/react']) || files.some((filePath) => filePath.startsWith('.storybook/')),
    playwright: Boolean(deps['@playwright/test']) || fileSet.has('playwright.config.ts') || fileSet.has('playwright.config.js'),
  };

  return {
    forms,
    data,
    motion,
    tests,
    presence,
  };
}

function detectFigmaLinks(text) {
  const matches = [...String(text || '').matchAll(/https?:\/\/(?:www\.)?figma\.com\/[^\s)]+/gi)];
  return [...new Set(matches.map((match) => match[0]))];
}

function countExtensions(files) {
  const counts = new Map();
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase() || '<none>';
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return counts;
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

function detectIntentMatches(text) {
  return INTENT_KEYWORDS.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function buildSignalHits({ workflowActive, framework, files, fileSet, extensionCounts, workflowText, intentText, figmaLinks, stack }) {
  const hits = [];
  const tsxCount = (extensionCounts.get('.tsx') || 0) + (extensionCounts.get('.jsx') || 0);
  const intentMatches = detectIntentMatches(intentText);
  const previewNeed = /(dev server|preview|browser|localhost|vercel\.app|screenshot|visual audit|visual verdict|responsive)/i.test(workflowText);

  const push = (id, label, evidence, why) => {
    hits.push({
      id,
      label,
      evidence: evidence.filter(Boolean),
      why,
    });
  };

  if (workflowActive && tsxCount >= 8 && ['Next', 'Vite', 'Astro', 'Remix'].includes(framework.primary)) {
    push('react_tsx_surface', 'React/TSX-heavy surface detected', [`tsx/jsx files: ${tsxCount}`, framework.primary], 'Frontend-heavy component work is likely');
  }
  if (fileSet.has('components.json')) {
    push('components_json', 'components.json present', ['components.json'], 'shadcn-style design system routing is available');
  }
  if (files.some((filePath) => /^tailwind\.config\./.test(path.basename(filePath)))) {
    push('tailwind_config', 'Tailwind config detected', [firstExisting(files, [/^tailwind\.config\./])], 'Styling and component composition likely depend on Tailwind');
  }
  if (stack.presence.storybook) {
    push('storybook', 'Storybook detected', files.filter((filePath) => filePath.startsWith('.storybook/')).slice(0, 3), 'Visual component review surface exists');
  }
  if (figmaLinks.length > 0) {
    push('figma_link', 'Figma link detected', figmaLinks.slice(0, 3), 'Design implementation routing is relevant');
  }
  if (previewNeed) {
    push('preview_validation', 'Preview/browser validation need detected', ['workflow docs mention preview/browser/screenshot work'], 'Visual verification should be expanded');
  }
  if (intentMatches.length > 0) {
    push('frontend_intent', 'Frontend/UI intent detected', intentMatches, 'Workflow should specialize toward UI delivery and verification');
  }

  return {
    hits,
    previewNeed,
    intentMatches,
  };
}

function buildAdapterRegistry(profile) {
  const selected = [];
  const registry = [];
  const intentText = profile.signals.intentMatches.join(', ');

  const push = (id, label, selectedNow, reason, trigger) => {
    if (selectedNow) {
      selected.push(id);
    }
    registry.push({
      id,
      label,
      status: selectedNow ? 'selected' : trigger ? 'available' : 'not_applicable',
      reason,
      trigger,
    });
  };

  const hasReactSurface = ['Next', 'Vite', 'Astro', 'Remix'].includes(profile.framework.primary)
    || profile.fileCounts.tsxJsx > 0;
  push(
    'shadcn',
    'shadcn',
    profile.uiSystem.detected.includes('shadcn'),
    profile.uiSystem.detected.includes('shadcn')
      ? 'components.json enables shadcn-aware routing'
      : 'Select when components.json appears',
    profile.fileSignals.componentsJson,
  );
  push(
    'react-best-practices',
    'React best practices',
    hasReactSurface,
    hasReactSurface
      ? 'React/TSX surface detected'
      : 'Select when React/TSX editing becomes active',
    hasReactSurface,
  );
  push(
    'web-design-guidelines',
    'web-design-guidelines',
    profile.frontendMode.active,
    profile.frontendMode.active
      ? 'Frontend mode expands UX and accessibility expectations'
      : 'Select when frontend mode activates',
    true,
  );
  push(
    'figma-implement-design',
    'Figma implement-design',
    profile.figma.links.length > 0 || /(design|screen|component)/i.test(intentText),
    profile.figma.links.length > 0
      ? 'Figma references were found in workflow docs'
      : 'Select when design implementation intent is present',
    profile.figma.links.length > 0 || /(design|screen|component)/i.test(intentText),
  );
  push(
    'browser-verify',
    'browser verify',
    profile.frontendMode.active && (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook),
    profile.frontendMode.active && (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook)
      ? 'Visual verification surface exists or is requested'
      : 'Select when preview/browser validation is needed',
    profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook,
  );

  return { selected, registry };
}

function buildVisualVerdict(profile) {
  const required = profile.frontendMode.active;
  const requiredLabel = required ? 'required' : 'optional';

  return {
    required,
    status: requiredLabel,
    areas: [
      {
        area: 'responsive',
        expectation: 'Desktop and mobile layouts preserve hierarchy without overflow or broken spacing.',
        howToObserve: 'Check at least one narrow and one wide viewport or documented responsive breakpoint.',
        evidenceExpectation: 'Screenshot pair or browser-verify note.',
      },
      {
        area: 'interaction',
        expectation: 'Primary interactions, states, and form behavior feel complete and predictable.',
        howToObserve: 'Exercise key clicks, navigation, hover/focus, and any milestone-specific UI state changes.',
        evidenceExpectation: 'Manual check note, test output, or browser-verify trace.',
      },
      {
        area: 'visual consistency',
        expectation: 'Typography, spacing, color, and motion stay coherent with the chosen UI system.',
        howToObserve: 'Review changed screens/components against the active design direction or design system.',
        evidenceExpectation: 'Review note plus screenshot evidence when relevant.',
      },
      {
        area: 'component reuse',
        expectation: 'UI changes reuse the existing design system or shared component surfaces instead of fragmenting them.',
        howToObserve: 'Inspect changed components and note whether shared primitives/components were used.',
        evidenceExpectation: 'Diff review note referencing reused component surfaces.',
      },
      {
        area: 'accessibility smoke',
        expectation: 'Basic semantic structure, focusability, labels, and contrast concerns are checked at smoke-test level.',
        howToObserve: 'Review obvious keyboard/label/semantic issues or run lightweight a11y checks when available.',
        evidenceExpectation: 'Manual smoke note or tool output.',
      },
      {
        area: 'screenshot evidence',
        expectation: 'At least one screenshot or equivalent visual artifact backs up the UI verdict when frontend mode is active.',
        howToObserve: 'Capture or reference a screenshot artifact for the changed view when practical.',
        evidenceExpectation: 'Screenshot path, URL, or explicit note explaining why none was needed.',
      },
    ],
  };
}

function buildFrontendProfile(cwd, rootDir, options = {}) {
  const scope = String(options.scope || 'workstream').trim().toLowerCase() === 'repo' ? 'repo' : 'workstream';
  const refresh = String(options.refresh || 'incremental').trim().toLowerCase() === 'full' ? 'full' : 'incremental';
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const repoIndex = listRepoFiles(cwd, refresh);
  const files = repoIndex.files;
  const fileSet = new Set(files);
  const pkg = maybeReadPackageJson(cwd);
  const deps = dependencyVersionMap(pkg);
  const extensionCounts = countExtensions(files);
  const framework = detectFramework(pkg, fileSet, files);
  const styling = detectStyling(pkg, files);
  const uiSystem = detectUiSystem(pkg, fileSet, files);
  const stack = detectStackFamilies(pkg, fileSet, files);

  const statusDoc = read(paths.status);
  const contextDoc = read(paths.context);
  const validationDoc = read(paths.validation);
  const milestonesDoc = read(paths.milestones);
  const handoffDoc = read(paths.handoff);
  const workflowActive = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim() !== 'NONE';
  const workflowText = [
    tryExtractSection(contextDoc, 'User Intent'),
    tryExtractSection(contextDoc, 'Touched Files'),
    tryExtractSection(contextDoc, 'Verification Surface'),
    tryExtractSection(validationDoc, 'Success Contract'),
    tryExtractSection(validationDoc, 'Validation Contract'),
    tryExtractSection(milestonesDoc, 'Active Milestone Card'),
    tryExtractSection(handoffDoc, 'Immediate Next Action'),
  ].join('\n');
  const intentText = [
    tryExtractSection(contextDoc, 'User Intent'),
    tryExtractSection(contextDoc, 'Problem Frame'),
    tryExtractSection(validationDoc, 'Success Contract'),
    tryExtractSection(milestonesDoc, 'Active Milestone Card'),
  ].join('\n');
  const figmaLinks = detectFigmaLinks(workflowText);
  const signals = buildSignalHits({
    workflowActive,
    framework,
    files,
    fileSet,
    extensionCounts,
    workflowText,
    intentText,
    figmaLinks,
    stack,
  });
  const frontendModeActive = workflowActive && signals.hits.length > 0;
  const fileSignals = {
    componentsJson: fileSet.has('components.json'),
    tailwindConfig: files.some((filePath) => /^tailwind\.config\./.test(path.basename(filePath))),
    storybook: stack.presence.storybook,
    playwright: stack.presence.playwright,
  };
  const fileCounts = {
    tsxJsx: (extensionCounts.get('.tsx') || 0) + (extensionCounts.get('.jsx') || 0),
    cssLike: (extensionCounts.get('.css') || 0) + (extensionCounts.get('.scss') || 0) + (extensionCounts.get('.sass') || 0),
  };

  const fingerprintInputs = [
    'package.json',
    'components.json',
    ...files.filter((filePath) => FRONTEND_CONFIG_PATTERNS.some((pattern) => pattern.test(path.basename(filePath)))).slice(0, 12),
    ...files.filter((filePath) => filePath.startsWith('.storybook/')).slice(0, 6),
    ...files.filter((filePath) => /\.(tsx|jsx|css|scss|sass)$/.test(filePath)).slice(0, 24),
    relativePath(cwd, paths.context),
    relativePath(cwd, paths.validation),
    relativePath(cwd, paths.milestones),
  ].filter((item, index, array) => item && array.indexOf(item) === index && fileSet.has(item));

  const fingerprintHash = computeFingerprint(cwd, fingerprintInputs, {
    scope,
    refresh,
    workflowActive,
    framework: framework.detected,
    styling: styling.detected,
    uiSystem: uiSystem.detected,
    signalIds: signals.hits.map((item) => item.id),
  });
  const existingProfile = readJsonIfExists(path.join(cwd, '.workflow', 'frontend-profile.json'));
  const refreshStatus = existingProfile && existingProfile.fingerprint?.hash === fingerprintHash
    && existingProfile.scope?.mode === scope
    && existingProfile.workflowRootRelative === relativePath(cwd, rootDir)
    ? 'current'
    : existingProfile
      ? 'stale'
      : 'new';

  const profile = {
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    scope: {
      mode: scope,
      refresh,
    },
    workflow: {
      active: workflowActive,
      milestone: String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim(),
      step: String(getFieldValue(statusDoc, 'Current milestone step') || 'unknown').trim(),
    },
    fingerprint: {
      hash: fingerprintHash,
      refreshStatus,
      inputs: fingerprintInputs,
      indexStatus: repoIndex.refreshStatus,
      changedFileCount: repoIndex.changedFiles.length,
    },
    framework,
    styling,
    uiSystem,
    stack,
    figma: {
      links: figmaLinks,
      present: figmaLinks.length > 0,
    },
    fileSignals,
    fileCounts,
    signals,
    frontendMode: {
      active: frontendModeActive,
      status: frontendModeActive ? 'active' : 'inactive',
      reason: !workflowActive
        ? 'workflow_inactive'
        : frontendModeActive
          ? 'workflow_active_with_frontend_signals'
          : 'workflow_active_without_frontend_signals',
      designSystemAware: frontendModeActive,
      visualAuditExpanded: frontendModeActive,
    },
  };
  profile.visualVerdict = buildVisualVerdict(profile);
  profile.frontendMode.visualVerdictRequired = profile.visualVerdict.required;
  profile.adapters = buildAdapterRegistry(profile);

  return profile;
}

function renderEvidenceList(items, fallback = 'none') {
  return items.length > 0 ? items.join(', ') : fallback;
}

function renderFrontendProfileMarkdown(profile, cwd, rootDir) {
  const profileDocPath = path.join(rootDir, 'FRONTEND_PROFILE.md');
  const jsonPath = path.join(cwd, '.workflow', 'frontend-profile.json');

  const stylingRows = profile.styling.detected.map((item) => [
    item,
    renderEvidenceList(profile.styling.evidence[item] || []),
  ]);
  const uiRows = profile.uiSystem.detected.map((item) => [
    item,
    renderEvidenceList(profile.uiSystem.evidence[item] || []),
  ]);
  const signalRows = profile.signals.hits.map((item) => [
    item.label,
    renderEvidenceList(item.evidence),
    item.why,
  ]);
  const adapterRows = profile.adapters.registry.map((item) => [
    item.label,
    item.status,
    item.reason,
    item.trigger ? 'yes' : 'no',
  ]);
  const verdictRows = profile.visualVerdict.areas.map((item) => [
    item.area,
    item.expectation,
    item.howToObserve,
    item.evidenceExpectation,
    profile.visualVerdict.required ? 'required' : 'optional',
  ]);

  return `# FRONTEND_PROFILE

- Last updated: \`${today()}\`
- Generator version: \`${profile.generatorVersion}\`
- Workflow root: \`${profile.workflowRootRelative}\`
- Scope: \`${profile.scope.mode}\`
- Refresh policy: \`${profile.scope.refresh}\`
- Refresh status: \`${profile.fingerprint.refreshStatus}\`
- Workflow active: \`${profile.workflow.active ? 'yes' : 'no'}\`
- Frontend mode: \`${profile.frontendMode.status}\`
- Frontend reason: \`${profile.frontendMode.reason}\`
- Selected adapters: \`${profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none'}\`
- Visual verdict required: \`${profile.visualVerdict.required ? 'yes' : 'no'}\`
- Profile JSON: \`${relativePath(cwd, jsonPath)}\`
- Profile markdown: \`${relativePath(cwd, profileDocPath)}\`

## Stack Fingerprint

- Primary framework: \`${profile.framework.primary}\`
- Frameworks detected: \`${profile.framework.detected.join(', ')}\`
- Styling detected: \`${profile.styling.detected.join(', ')}\`
- UI system: \`${profile.uiSystem.primary}\`
- TSX/JSX files: \`${profile.fileCounts.tsxJsx}\`
- CSS-like files: \`${profile.fileCounts.cssLike}\`
- Forms stack: \`${profile.stack.forms.length > 0 ? profile.stack.forms.join(', ') : 'none detected'}\`
- Data stack: \`${profile.stack.data.length > 0 ? profile.stack.data.join(', ') : 'none detected'}\`
- Motion stack: \`${profile.stack.motion.length > 0 ? profile.stack.motion.join(', ') : 'none detected'}\`
- Test stack: \`${profile.stack.tests.length > 0 ? profile.stack.tests.join(', ') : 'none detected'}\`
- Storybook: \`${profile.stack.presence.storybook ? 'yes' : 'no'}\`
- Playwright: \`${profile.stack.presence.playwright ? 'yes' : 'no'}\`
- Figma links: \`${profile.figma.present ? profile.figma.links.length : 0}\`

## Fingerprint Inputs

${profile.fingerprint.inputs.length > 0
    ? profile.fingerprint.inputs.map((item) => `- \`${item}\``).join('\n')
    : '- `No fingerprint inputs were recorded`'}

## Styling

${renderMarkdownTable(
    ['Layer', 'Evidence'],
    stylingRows.length > 0 ? stylingRows : [['custom', 'none detected']],
  )}

## UI System

${renderMarkdownTable(
    ['System', 'Evidence'],
    uiRows.length > 0 ? uiRows : [['custom', 'none detected']],
  )}

## Activation Signals

${renderMarkdownTable(
    ['Signal', 'Evidence', 'Why it matters'],
    signalRows.length > 0 ? signalRows : [['No active frontend signal', 'none', 'Frontend auto mode stays inactive']],
  )}

## Adapter Registry

${renderMarkdownTable(
    ['Adapter', 'Status', 'Reason', 'Triggered'],
    adapterRows,
  )}

## Visual Verdict Protocol

${renderMarkdownTable(
    ['Verdict area', 'Expectation', 'How to observe', 'Evidence expectation', 'Required'],
    verdictRows,
  )}
`;
}

function renderFrontendAuditModeSection(profile) {
  return [
    `- \`Frontend mode: ${profile.frontendMode.status}\``,
    `- \`Activation reason: ${profile.frontendMode.reason}\``,
    `- \`Activation signals: ${profile.signals.hits.length > 0 ? profile.signals.hits.map((item) => item.label).join(', ') : 'none'}\``,
    `- \`Design-system aware execution: ${profile.frontendMode.designSystemAware ? 'yes' : 'no'}\``,
    `- \`Adapter route: ${profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none'}\``,
    `- \`Preview/browser verification need: ${profile.signals.previewNeed ? 'yes' : 'no'}\``,
    `- \`Visual verdict required: ${profile.visualVerdict.required ? 'yes' : 'no'}\``,
  ].join('\n');
}

function renderVisualVerdictTable(profile) {
  return renderMarkdownTable(
    ['Verdict area', 'Expectation', 'How to observe', 'Evidence expectation', 'Status'],
    profile.visualVerdict.areas.map((item) => [
      item.area,
      item.expectation,
      item.howToObserve,
      item.evidenceExpectation,
      profile.visualVerdict.required ? 'required' : 'optional',
    ]),
  );
}

function syncValidationWithFrontendProfile(paths, cwd, profile) {
  let validation = read(paths.validation);
  const frontendProfileRef = relativePath(cwd, path.join(paths.rootDir, 'FRONTEND_PROFILE.md'));

  validation = replaceOrAppendField(validation, 'Frontend mode', profile.frontendMode.status);
  validation = replaceOrAppendField(validation, 'Frontend profile ref', frontendProfileRef);
  validation = replaceOrAppendField(validation, 'Frontend profile json', '.workflow/frontend-profile.json');
  validation = replaceOrAppendField(validation, 'Frontend adapter route', profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none');
  validation = replaceOrAppendField(validation, 'Visual verdict required', profile.visualVerdict.required ? 'yes' : 'no');
  validation = replaceOrAppendSection(validation, 'Frontend Audit Mode', renderFrontendAuditModeSection(profile));
  validation = replaceOrAppendSection(validation, 'Visual Verdict', renderVisualVerdictTable(profile));

  write(paths.validation, validation);
  return validation;
}

function writeFrontendProfileArtifacts(cwd, rootDir, profile, options = {}) {
  const paths = workflowPaths(rootDir);
  const jsonPath = path.join(cwd, '.workflow', 'frontend-profile.json');
  const markdownPath = path.join(rootDir, 'FRONTEND_PROFILE.md');

  ensureDir(path.dirname(jsonPath));
  write(jsonPath, `${JSON.stringify(profile, null, 2)}\n`);
  write(markdownPath, renderFrontendProfileMarkdown(profile, cwd, rootDir));

  if (options.syncValidation !== false) {
    syncValidationWithFrontendProfile(paths, cwd, profile);
  }

  writeStateSurface(cwd, rootDir, {
    frontend: {
      active: profile.frontendMode.active,
      status: profile.frontendMode.status,
      reason: profile.frontendMode.reason,
      framework: profile.framework.primary,
      uiSystem: profile.uiSystem.primary,
      adapters: profile.adapters.selected,
      visualVerdictRequired: profile.visualVerdict.required,
      refreshStatus: profile.fingerprint.refreshStatus,
      profileRef: relativePath(cwd, markdownPath),
      profileJson: relativePath(cwd, jsonPath),
      signals: profile.signals.hits.map((item) => item.label),
    },
  }, { updatedBy: 'map-frontend' });

  return {
    jsonPath,
    markdownPath,
  };
}

function summarizeProfile(profile) {
  return {
    framework: profile.framework.primary,
    styling: profile.styling.detected,
    uiSystem: profile.uiSystem.primary,
    frontendMode: profile.frontendMode.status,
    adapters: profile.adapters.selected,
    visualVerdictRequired: profile.visualVerdict.required,
    signalCount: profile.signals.hits.length,
    refreshStatus: profile.fingerprint.refreshStatus,
  };
}

function printCompact(profile, rootDir) {
  const summary = summarizeProfile(profile);
  console.log('# FRONTEND MAP\n');
  console.log(`- root=\`${relativePath(process.cwd(), rootDir)}\` scope=\`${profile.scope.mode}\` frontend=\`${summary.frontendMode}\` framework=\`${summary.framework}\` ui=\`${summary.uiSystem}\` refresh=\`${summary.refreshStatus}\``);
  console.log(`- styling=\`${summary.styling.join(', ') || 'none'}\` adapters=\`${summary.adapters.join(', ') || 'none'}\` visual_verdict=\`${summary.visualVerdictRequired ? 'yes' : 'no'}\` signals=\`${summary.signalCount}\``);
}

function printStandard(profile, rootDir, artifacts) {
  const summary = summarizeProfile(profile);
  console.log('# FRONTEND MAP\n');
  console.log(`- Root: \`${relativePath(process.cwd(), rootDir)}\``);
  console.log(`- Scope: \`${profile.scope.mode}\``);
  console.log(`- Refresh policy: \`${profile.scope.refresh}\``);
  console.log(`- Refresh status: \`${summary.refreshStatus}\``);
  console.log(`- Workflow active: \`${profile.workflow.active ? 'yes' : 'no'}\``);
  console.log(`- Frontend mode: \`${summary.frontendMode}\``);
  console.log(`- Framework: \`${summary.framework}\``);
  console.log(`- Styling: \`${summary.styling.join(', ') || 'none'}\``);
  console.log(`- UI system: \`${summary.uiSystem}\``);
  console.log(`- Selected adapters: \`${summary.adapters.join(', ') || 'none'}\``);
  console.log(`- Visual verdict required: \`${summary.visualVerdictRequired ? 'yes' : 'no'}\``);
  console.log(`- Markdown profile: \`${relativePath(process.cwd(), artifacts.markdownPath)}\``);
  console.log(`- JSON profile: \`${relativePath(process.cwd(), artifacts.jsonPath)}\``);
  console.log('\n## Activation Signals\n');
  if (profile.signals.hits.length === 0) {
    console.log('- `No frontend auto-mode signal is active`');
  } else {
    for (const item of profile.signals.hits) {
      console.log(`- \`${item.label}\` -> ${renderEvidenceList(item.evidence)}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const profile = buildFrontendProfile(cwd, rootDir, {
    scope: args.scope,
    refresh: args.refresh,
  });
  const artifacts = writeFrontendProfileArtifacts(cwd, rootDir, profile);

  if (args.json) {
    console.log(JSON.stringify({
      rootDir: relativePath(cwd, rootDir),
      ...profile,
      artifacts: {
        markdown: relativePath(cwd, artifacts.markdownPath),
        json: relativePath(cwd, artifacts.jsonPath),
      },
    }, null, 2));
    return;
  }

  if (args.compact) {
    printCompact(profile, rootDir);
    return;
  }

  printStandard(profile, rootDir, artifacts);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFrontendProfile,
  renderVisualVerdictTable,
  syncValidationWithFrontendProfile,
  writeFrontendProfileArtifacts,
};
