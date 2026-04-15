const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  getFieldValue,
  hashString,
  parseArgs,
  replaceOrAppendField,
  replaceOrAppendSection,
  resolveWorkflowRoot,
  tryExtractSection,
  workflowPaths,
} = require('./common');
const {
  ensureDir,
  readText: read,
  readTextIfExists: readIfExists,
  writeText: write,
} = require('./io/files');
const { readJsonIfExists } = require('./io/json');
const { listIndexedRepoFiles } = require('./fs_index');
const { writeStateSurface } = require('./state_surface');
const { buildComponentIntelligenceSummary } = require('./frontend_component_intelligence');
const {
  buildVisualVerdict,
  renderEvidenceList,
  renderFrontendAuditModeSection,
  renderFrontendProfileMarkdown,
  renderVisualVerdictTable,
  summarizeProfile,
} = require('./frontend_profile_render');

const GENERATOR_VERSION = 'phase5-frontend-v1';
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

function findMatchingFiles(files, pattern, limit = 8) {
  return files.filter((filePath) => pattern.test(filePath)).slice(0, limit);
}

function hasMatchingFile(files, pattern) {
  return files.some((filePath) => pattern.test(filePath));
}

function packageRootForFile(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length >= 2 && ['apps', 'packages', 'services'].includes(parts[0])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return '.';
}

function stripPackageRoot(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const root = packageRootForFile(normalized);
  return root === '.' ? normalized : normalized.slice(root.length + 1);
}

function routeFamilyForFile(filePath) {
  const normalized = stripPackageRoot(filePath);
  const matchers = [
    'app/routes/',
    'app/',
    'pages/',
    'src/pages/',
    'src/screens/',
    'screens/',
    'lib/',
  ];
  for (const marker of matchers) {
    const index = normalized.indexOf(marker);
    if (index === -1) {
      continue;
    }
    const after = normalized.slice(index + marker.length);
    const parts = after.split('/').filter(Boolean);
    if (parts.length === 0) {
      return 'root';
    }
    const first = parts[0].replace(/\.[^.]+$/, '');
    return ['page', 'index', '_layout', 'layout', 'route'].includes(first) ? 'root' : first;
  }
  return 'root';
}

function detectFramework(pkg, fileSet, files) {
  const deps = dependencyVersionMap(pkg);
  const evidence = {};
  const scores = new Map();
  const detected = [];

  const nextConfigs = findMatchingFiles(files, /(^|\/)next\.config\./);
  const nextLayouts = findMatchingFiles(files, /(^|\/)app\/layout\.(tsx|jsx|ts|js)$/);
  const nextPagesApp = findMatchingFiles(files, /(^|\/)pages\/_app\.(tsx|jsx|ts|js)$/);
  const viteConfigs = findMatchingFiles(files, /(^|\/)vite\.config\./);
  const astroConfigs = findMatchingFiles(files, /(^|\/)astro\.config\./);
  const remixConfigs = findMatchingFiles(files, /(^|\/)remix\.config\./);
  const expoConfigs = findMatchingFiles(files, /(^|\/)(app\.json|eas\.json|app\.config\.(js|jsx|ts|tsx|json))$/);
  const expoLayouts = findMatchingFiles(files, /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/);
  const reactNativeScreens = findMatchingFiles(files, /(^|\/)(src\/)?screens\/.+\.(tsx|jsx|ts|js)$/);
  const flutterFiles = findMatchingFiles(files, /(^|\/)lib\/.+\.dart$/);

  const register = (name, condition, items, score = 0) => {
    if (!condition) {
      return;
    }
    detected.push(name);
    evidence[name] = items.filter(Boolean);
    scores.set(name, score);
  };

  register('Next', Boolean(deps.next) || nextConfigs.length > 0 || nextLayouts.length > 0 || nextPagesApp.length > 0, [
    deps.next ? 'next' : '',
    ...nextConfigs.slice(0, 2),
    nextLayouts[0] || '',
    nextPagesApp[0] || '',
  ], (deps.next ? 3 : 0) + nextConfigs.length + nextLayouts.length + nextPagesApp.length);
  register('Vite', Boolean(deps.vite) || viteConfigs.length > 0, [
    deps.vite ? 'vite' : '',
    ...viteConfigs.slice(0, 2),
  ], (deps.vite ? 3 : 0) + viteConfigs.length);
  register('Astro', Boolean(deps.astro) || astroConfigs.length > 0, [
    deps.astro ? 'astro' : '',
    ...astroConfigs.slice(0, 2),
  ], (deps.astro ? 3 : 0) + astroConfigs.length);
  register('Remix', Boolean(deps['@remix-run/react']) || Boolean(deps['@remix-run/node']) || remixConfigs.length > 0, [
    deps['@remix-run/react'] ? '@remix-run/react' : '',
    deps['@remix-run/node'] ? '@remix-run/node' : '',
    ...remixConfigs.slice(0, 2),
  ], (deps['@remix-run/react'] ? 2 : 0) + (deps['@remix-run/node'] ? 2 : 0) + remixConfigs.length);
  register('Expo', Boolean(deps.expo) || Boolean(deps['expo-router']) || expoConfigs.length > 0 || expoLayouts.length > 0, [
    deps.expo ? 'expo' : '',
    deps['expo-router'] ? 'expo-router' : '',
    ...expoConfigs.slice(0, 3),
    expoLayouts[0] || '',
  ], (deps.expo ? 3 : 0) + (deps['expo-router'] ? 3 : 0) + expoConfigs.length + expoLayouts.length);
  register('React Native', Boolean(deps['react-native']) || reactNativeScreens.length > 0 || hasMatchingFile(files, /(^|\/)(ios|android)\//), [
    deps['react-native'] ? 'react-native' : '',
    reactNativeScreens[0] || '',
    hasMatchingFile(files, /(^|\/)ios\//) ? 'ios/' : '',
    hasMatchingFile(files, /(^|\/)android\//) ? 'android/' : '',
  ], (deps['react-native'] ? 3 : 0) + reactNativeScreens.length + (hasMatchingFile(files, /(^|\/)(ios|android)\//) ? 1 : 0));
  register('Flutter', fileSet.has('pubspec.yaml') || fileSet.has('lib/main.dart') || flutterFiles.length > 0, [
    fileSet.has('pubspec.yaml') ? 'pubspec.yaml' : '',
    fileSet.has('lib/main.dart') ? 'lib/main.dart' : '',
    flutterFiles[0] || '',
  ], (fileSet.has('pubspec.yaml') ? 3 : 0) + (fileSet.has('lib/main.dart') ? 2 : 0) + flutterFiles.length);

  const ranked = detected
    .map((name) => ({ name, score: scores.get(name) || 0 }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const primary = ranked[0]?.name || 'Custom';
  return {
    primary,
    detected: ranked.length > 0 ? ranked.map((entry) => entry.name) : ['Custom'],
    evidence,
    ranked,
  };
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


function detectRouting(framework, fileSet, files) {
  const expoRoots = new Set([
    ...findMatchingFiles(files, /(^|\/)(app\.json|eas\.json|app\.config\.(js|jsx|ts|tsx|json))$/).map((filePath) => packageRootForFile(filePath)),
    ...findMatchingFiles(files, /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/).map((filePath) => packageRootForFile(filePath)),
  ]);
  const appRouterFiles = findMatchingFiles(files, /(^|\/)app\/(.+\/)?page\.(tsx|jsx|ts|js)$/)
    .filter((filePath) => !expoRoots.has(packageRootForFile(filePath)));
  const pageRouterFiles = findMatchingFiles(files, /(^|\/)pages\/.+\.(tsx|jsx|ts|js)$/)
    .filter((filePath) => !/(^|\/)pages\/(?:_app|_document|_error)\./.test(filePath));
  const remixRoutes = findMatchingFiles(files, /(^|\/)app\/routes\/.+\.(tsx|jsx|ts|js)$/);
  const astroPages = findMatchingFiles(files, /(^|\/)(src\/pages|pages)\/.+\.(astro|mdx|tsx|jsx|ts|js)$/);
  const expoRouterLayouts = findMatchingFiles(files, /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/)
    .filter((filePath) => expoRoots.has(packageRootForFile(filePath)));
  const expoRouterScreens = findMatchingFiles(files, /(^|\/)app\/.+\.(tsx|jsx|ts|js)$/)
    .filter((filePath) => expoRoots.has(packageRootForFile(filePath)))
    .filter((filePath) => !/(^|\/)app\/(?:layout|_layout|route)\./.test(filePath));
  const reactNativeScreens = findMatchingFiles(files, /(^|\/)(src\/)?screens\/.+\.(tsx|jsx|ts|js)$/);
  const flutterViews = findMatchingFiles(files, /(^|\/)lib\/.+\.dart$/)
    .filter((filePath) => /(screen|page|view|route|shell|navigator)/i.test(path.basename(filePath)));
  const viteSpa = (hasMatchingFile(files, /(^|\/)src\/main\.(tsx|jsx|ts|js)$/))
    && (hasMatchingFile(files, /(^|\/)src\/App\.(tsx|jsx|ts|js)$/));

  const detected = [];
  const evidence = {};
  const register = (id, condition, items) => {
    if (!condition) {
      return;
    }
    detected.push(id);
    evidence[id] = items.filter(Boolean);
  };

  register('next-app-router', appRouterFiles.length > 0, appRouterFiles.slice(0, 6));
  register('next-pages-router', pageRouterFiles.length > 0, pageRouterFiles.slice(0, 6));
  register('remix-routes', remixRoutes.length > 0, remixRoutes.slice(0, 6));
  register('astro-pages', astroPages.length > 0, astroPages.slice(0, 6));
  register('expo-router', framework.detected.includes('Expo') || expoRouterLayouts.length > 0, [
    ...expoRouterLayouts.slice(0, 2),
    ...expoRouterScreens.slice(0, 4),
  ]);
  register('react-native-navigation', framework.detected.includes('React Native') || reactNativeScreens.length > 0, reactNativeScreens.slice(0, 6));
  register('flutter-navigator', framework.primary === 'Flutter' || flutterViews.length > 0, [fileSet.has('lib/main.dart') ? 'lib/main.dart' : '', ...flutterViews.slice(0, 5)]);
  register('vite-spa', (framework.primary === 'Vite' || framework.primary === 'Custom') && viteSpa, ['src/main.*', 'src/App.*']);

  const primary = detected[0] || (framework.primary === 'Flutter'
    ? 'flutter-navigator'
    : framework.primary === 'Expo'
      ? 'expo-router'
      : framework.primary === 'React Native'
        ? 'react-native-navigation'
        : framework.primary === 'Next'
          ? 'next-app-router'
          : framework.primary === 'Remix'
            ? 'remix-routes'
            : framework.primary === 'Astro'
              ? 'astro-pages'
              : framework.primary === 'Vite'
                ? 'vite-spa'
                : 'custom');
  const labelMap = {
    'next-app-router': 'Next App Router',
    'next-pages-router': 'Next Pages Router',
    'remix-routes': 'Remix Routes',
    'astro-pages': 'Astro Pages',
    'expo-router': 'Expo Router',
    'react-native-navigation': 'React Native Navigation',
    'flutter-navigator': 'Flutter Navigator',
    'vite-spa': 'Vite SPA',
    custom: 'Custom Routing',
  };

  return {
    primary,
    label: labelMap[primary] || 'Custom Routing',
    detected: detected.length > 0 ? detected : [primary],
    evidence,
  };
}

function buildSurfaceInventory(framework, files) {
  const expoRoots = new Set([
    ...findMatchingFiles(files, /(^|\/)(app\.json|eas\.json|app\.config\.(js|jsx|ts|tsx|json))$/).map((filePath) => packageRootForFile(filePath)),
    ...findMatchingFiles(files, /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/).map((filePath) => packageRootForFile(filePath)),
  ]);
  const pageFiles = files.filter((filePath) => (
    /(^|\/)app\/(.+\/)?page\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)app\/routes\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)(src\/pages|pages)\/.+\.(astro|mdx|tsx|jsx|ts|js)$/.test(filePath)
  ))
    .filter((filePath) => !/(^|\/)pages\/(?:_app|_document|_error)\./.test(filePath))
    .filter((filePath) => !expoRoots.has(packageRootForFile(filePath)));
  const expoFiles = files.filter((filePath) => /(^|\/)app\/.+\.(tsx|jsx|ts|js)$/.test(filePath))
    .filter((filePath) => expoRoots.has(packageRootForFile(filePath)))
    .filter((filePath) => !/(^|\/)app\/route\./.test(filePath));
  const reactNativeScreens = files.filter((filePath) => /(^|\/)(src\/)?screens\/.+\.(tsx|jsx|ts|js)$/.test(filePath));
  const flutterScreens = files.filter((filePath) => /^lib\/.+\.(dart)$/.test(filePath) && /(screen|page|view|flow|route)/i.test(path.basename(filePath)));
  const screenFiles = [...new Set([
    ...expoFiles,
    ...reactNativeScreens,
    ...flutterScreens,
  ])];
  const routeFiles = [...new Set([...pageFiles, ...screenFiles])];
  const sharedComponents = files.filter((filePath) => /^(components|src\/components|app\/components|packages\/ui|ui)\/.+\.(tsx|jsx|ts|js|dart)$/.test(filePath));
  const localComponents = files.filter((filePath) => /\/(components|_components)\/.+\.(tsx|jsx|ts|js)$/.test(filePath) && !/^(components|src\/components|app\/components|packages\/ui|ui)\//.test(filePath));
  const routeFamilies = new Set();
  const surfaceRoots = new Set();
  for (const filePath of routeFiles) {
    routeFamilies.add(routeFamilyForFile(filePath));
    surfaceRoots.add(packageRootForFile(filePath));
  }

  const webRouteCount = pageFiles.length;
  const mobileRouteCount = screenFiles.length;
  const surfaceKinds = [];
  if (webRouteCount > 0) {
    surfaceKinds.push('web');
  }
  if (mobileRouteCount > 0) {
    surfaceKinds.push('mobile');
  }

  return {
    pageCount: pageFiles.length,
    screenCount: screenFiles.length,
    routeCount: routeFiles.length,
    webRouteCount,
    mobileRouteCount,
    routeFamilyCount: routeFamilies.size,
    sharedComponentCount: sharedComponents.length,
    localComponentCount: localComponents.length,
    surfaceKinds,
    surfaceRoots: [...surfaceRoots].sort((left, right) => left.localeCompare(right)),
    sampleRoutes: routeFiles.slice(0, 8),
    sampleSharedComponents: sharedComponents.slice(0, 8),
  };
}

function buildPlanningSignals(profile) {
  const mobileSurface = profile.productSurface?.id === 'mobile-app'
    || profile.framework.primary === 'Flutter'
    || profile.framework.detected.includes('Expo')
    || profile.framework.detected.includes('React Native');
  const webSurface = (profile.surfaceInventory?.webRouteCount || 0) > 0 || (!mobileSurface && (profile.surfaceInventory?.routeCount || 0) > 0);
  const hybridSurface = mobileSurface && webSurface;
  const denseSurface = ['dashboard', 'web-app', 'saas-app', 'developer-tool'].includes(profile.productSurface?.id);
  const routeCount = profile.surfaceInventory?.routeCount || 0;
  const componentCount = (profile.surfaceInventory?.sharedComponentCount || 0) + (profile.surfaceInventory?.localComponentCount || 0);
  const previewRequested = Boolean(profile.signals?.previewNeed || profile.stack?.presence?.playwright || profile.stack?.presence?.storybook);
  const dominantFamilyCount = profile.componentIntelligence?.dominantFamilies?.length || 0;
  const reuseHotspots = profile.componentIntelligence?.reuse?.hotspotCount || 0;
  const signals = {
    needsStateAtlas: profile.frontendMode.active && (mobileSurface || denseSurface || routeCount >= 2 || (profile.componentIntelligence?.stateCoverage?.missing || []).length > 0),
    needsComponentStrategy: profile.frontendMode.active && (
      componentCount >= 2
      || profile.uiSystem.primary === 'custom'
      || dominantFamilyCount >= 3
      || reuseHotspots >= 2
      || (profile.componentIntelligence?.reuse?.verdict === 'warn')
    ),
    needsResponsiveMatrix: profile.frontendMode.active && webSurface,
    needsUiReview: profile.frontendMode.active,
    needsFullBrief: profile.frontendMode.active && (
      routeCount >= 4
      || componentCount >= 6
      || profile.figma.present
      || profile.signals.hits.length >= 4
      || dominantFamilyCount >= 4
      || reuseHotspots >= 3
    ),
    needsDesignDna: profile.frontendMode.active,
    previewRequested,
    mobileSurface,
    webSurface,
    hybridSurface,
  };
  signals.bundleId = signals.needsUiReview && /(review|audit|responsive|accessibility)/i.test((profile.signals.intentMatches || []).join(' '))
    ? 'frontend-review'
    : mobileSurface
      ? 'mobile-surface-pack'
      : 'frontend-delivery';
  return signals;
}

function buildBrowserReadiness(profile) {
  const protocol = profile.visualVerdict?.protocol || (profile.productSurface?.id === 'mobile-app' ? 'mobile' : 'web');
  const previewRequested = Boolean(profile.signals?.previewNeed || profile.stack?.presence?.playwright || profile.stack?.presence?.storybook);
  const hasPreviewHarness = Boolean(profile.stack?.presence?.playwright || profile.stack?.presence?.storybook);
  const hasProofHarness = Boolean(profile.stack?.presence?.playwright);
  const mobileSurface = protocol === 'mobile';
  let recommendedLane = 'on-demand';
  let reason = 'No strong preview signal was detected yet, so browser verification can stay lightweight until the UI surface expands.';
  if (mobileSurface) {
    recommendedLane = 'simulator-smoke';
    reason = 'The detected surface is mobile-first, so screen-flow and device-fit evidence matter more than browser proof.';
  } else if (hasProofHarness) {
    recommendedLane = 'playwright-proof';
    reason = 'Playwright is available, so the repo can capture browser proof instead of stopping at smoke-only evidence.';
  } else if (hasPreviewHarness) {
    recommendedLane = 'storybook-plus-smoke';
    reason = 'A preview surface exists, but full proof still depends on browser execution rather than preview-only screenshots.';
  } else if (previewRequested || profile.visualVerdict?.required) {
    recommendedLane = 'smoke-plus-manual';
    reason = 'Frontend mode is active without a dedicated preview harness, so smoke evidence should be paired with an explicit manual UI review note.';
  }
  const observationTargets = [
    ...(profile.componentIntelligence?.previewAnchors || []).map((item) => item.label),
    (!mobileSurface && (profile.surfaceInventory?.webRouteCount || 0) > 0) ? 'route hierarchy' : '',
    ((profile.componentIntelligence?.stateCoverage?.missing || []).length > 0) ? 'critical state coverage' : '',
  ].filter((item, index, array) => item && array.indexOf(item) === index);
  return {
    protocol,
    required: Boolean(profile.visualVerdict?.required),
    previewRequested,
    hasPreviewHarness,
    hasProofHarness,
    evidenceGap: !mobileSurface && Boolean(profile.visualVerdict?.required) && !hasPreviewHarness,
    recommendedLane,
    reason,
    observationTargets,
  };
}

function buildCommandPacks(profile) {
  const qGoal = '<goal>';
  const mobileSurface = profile.planningSignals.mobileSurface;
  const packs = [];
  const push = (id, label, summary, when, commands) => {
    packs.push({ id, label, summary, when, commands });
  };

  push(
    'frontend-lean-core',
    'Lean core pack',
    'Fastest structured frontend lane for most product slices.',
    'Default when the surface is known but the full brief would be overkill.',
    [
      'rai map-frontend --json',
      `rai ui-direction --goal ${qGoal} --json`,
      `rai ui-spec --goal ${qGoal} --json`,
      `rai state-atlas --goal ${qGoal} --json`,
      `rai component-strategy --goal ${qGoal} --json`,
      `rai ui-plan --goal ${qGoal} --json`,
      `rai ui-review --goal ${qGoal} --json`,
    ],
  );
  push(
    'frontend-full-brief',
    'Full brief pack',
    'Wider productization lane for bigger surfaces, more screens, or richer design input.',
    'Use when the repo has many routes/components or design references materially shape the work.',
    [
      'rai map-frontend --json',
      `rai ui-direction --goal ${qGoal} --json`,
      `rai frontend-brief --goal ${qGoal} --json`,
      `rai design-dna --goal ${qGoal} --json`,
      `rai page-blueprint --goal ${qGoal} --json`,
      `rai state-atlas --goal ${qGoal} --json`,
      `rai component-strategy --goal ${qGoal} --json`,
      `rai ui-plan --goal ${qGoal} --json`,
      `rai ui-recipe --goal ${qGoal} --json`,
      `rai ui-review --goal ${qGoal} --json`,
    ],
  );
  push(
    'frontend-review-stack',
    'Frontend review stack',
    'Quality-focused bundle that groups overlapping frontend review commands.',
    'Use when responsiveness, accessibility, browser evidence, or design debt is the main concern.',
    [
      'rai map-frontend --json',
      `rai ui-review --goal ${qGoal} --json`,
      'rai responsive-matrix --json',
      'rai design-debt --json',
      `rai verify --goal ${JSON.stringify('verify <goal>')}`,
      'rai ship-readiness',
    ],
  );
  if (mobileSurface) {
    push(
      'mobile-surface-pack',
      'Mobile surface pack',
      'Mobile-first lane that keeps screen flow and gesture fidelity explicit.',
      'Use when the detected surface is Flutter or otherwise mobile-first.',
      [
        'rai map-frontend --json',
        `rai ui-direction --goal ${qGoal} --json`,
        `rai page-blueprint --goal ${qGoal} --json`,
        `rai state-atlas --goal ${qGoal} --json`,
        `rai component-strategy --goal ${qGoal} --json`,
        `rai ui-review --goal ${qGoal} --json`,
      ],
    );
  }

  let selected = packs[0];
  if (mobileSurface) {
    selected = packs.find((item) => item.id === 'mobile-surface-pack') || packs[0];
  } else if (profile.planningSignals.needsFullBrief) {
    selected = packs.find((item) => item.id === 'frontend-full-brief') || packs[0];
  } else if (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook) {
    selected = packs.find((item) => item.id === 'frontend-review-stack') || packs[0];
  }

  return {
    selected: selected.id,
    available: packs,
    recommended: {
      ...selected,
      reason: selected.id === 'mobile-surface-pack'
        ? 'mobile_surface_detected'
        : selected.id === 'frontend-full-brief'
          ? 'surface_complexity_requires_full_brief'
          : selected.id === 'frontend-review-stack'
            ? 'preview_or_review_signals_detected'
            : 'lean_core_default',
    },
  };
}

function detectFigmaLinks(text) {
  const matches = [...String(text || '').matchAll(/https?:\/\/(?:www\.)?figma\.com\/[^\s)]+/gi)];
  return [...new Set(matches.map((match) => match[0]))];
}

function detectProductSurface({ framework, files, fileSet, workflowText, intentText }) {
  const text = `${workflowText}\n${intentText}\n${files.join('\n')}`.toLowerCase();
  const mobileSignals = framework.detected.includes('Expo')
    || framework.detected.includes('React Native')
    || framework.detected.includes('Flutter')
    || fileSet.has('pubspec.yaml')
    || hasMatchingFile(files, /(^|\/)(app\.json|eas\.json|app\.config\.(js|jsx|ts|tsx|json))$/)
    || hasMatchingFile(files, /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/)
    || hasMatchingFile(files, /(^|\/)(src\/)?screens\/.+\.(tsx|jsx|ts|js)$/);
  const webSignals = ['Next', 'Vite', 'Astro', 'Remix'].some((name) => framework.detected.includes(name));
  const surfaceHints = [
    {
      id: 'mobile-app',
      label: 'Mobile App',
      score: (
        (mobileSignals ? 8 : 0)
        + (/\b(expo|react native|mobile app|consumer app|ios app|android app|phone app|screen flow|bottom sheet|tab bar|pull to refresh|swipe|gesture)\b/.test(text) ? 4 : 0)
        + (hasMatchingFile(files, /(^|\/)(src\/)?screens\/.+\.(tsx|jsx|ts|js)$/) ? 2 : 0)
      ),
      cues: ['mobile/expo/react-native cues', 'screen flow', 'gesture-heavy interaction'],
      interactionModel: /\b(swipe|gesture|drag|bottom sheet|pull to refresh|long press)\b/.test(text) || mobileSignals
        ? 'gesture-heavy'
        : 'tap-driven',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      score: (
        (/\b(dashboard|analytics|metrics|monitoring|ops|admin|reporting|control plane)\b/.test(text) ? 6 : 0)
        + (/\b(table|grid|timeline|queue|filters?)\b/.test(text) ? 2 : 0)
      ),
      cues: ['operator workflow', 'dense data', 'scan-first navigation'],
      interactionModel: 'data-dense',
    },
    {
      id: 'landing-page',
      label: 'Landing Page',
      score: (
        (/\b(landing|homepage|marketing|hero|campaign|launch|pricing)\b/.test(text) ? 6 : 0)
        + (/\b(cta|testimonial|logo row|proof strip)\b/.test(text) ? 2 : 0)
      ),
      cues: ['narrative structure', 'hero + CTA', 'scroll-led proof'],
      interactionModel: 'scroll-led',
    },
    {
      id: 'settings-surface',
      label: 'Settings Surface',
      score: (
        (/\b(settings|preferences|billing|account|profile|configuration)\b/.test(text) ? 6 : 0)
        + (/\b(form|save|danger zone|permissions)\b/.test(text) ? 2 : 0)
      ),
      cues: ['form groups', 'save states', 'risk boundaries'],
      interactionModel: 'form-led',
    },
    {
      id: 'studio-workspace',
      label: 'Studio Workspace',
      score: (
        (/\b(editor|compose|draft|publish|studio|asset|canvas|builder|workspace)\b/.test(text) ? 6 : 0)
        + (/\b(panel|inspector|toolbox|canvas)\b/.test(text) ? 2 : 0)
      ),
      cues: ['focus surface', 'editor rails', 'multi-panel workflow'],
      interactionModel: 'workspace-led',
    },
    {
      id: 'web-app',
      label: 'Web App',
      score: (
        (webSignals ? 4 : 0)
        + (/\b(app|web app|portal|workspace|screen|page|frontend)\b/.test(text) ? 2 : 0)
      ),
      cues: ['screen-based web product', 'responsive layouts', 'browser flow'],
      interactionModel: 'tap-and-form',
    },
  ]
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  const winner = surfaceHints[0]?.score > 0
    ? surfaceHints[0]
    : {
      id: mobileSignals ? 'mobile-app' : 'web-app',
      label: mobileSignals ? 'Mobile App' : 'Web App',
      cues: ['fallback surface'],
      interactionModel: mobileSignals ? 'tap-driven' : webSignals ? 'tap-and-form' : 'mixed',
      score: 0,
    };

  const reason = winner.score > 0
    ? `Matched ${winner.label.toLowerCase()} signals from repo structure and current intent.`
    : `No strong surface cue was found, so ${winner.label.toLowerCase()} is the safest default.`;
  const confidence = winner.score >= 7 ? 'high' : winner.score >= 4 ? 'medium' : 'low';

  return {
    id: winner.id,
    label: winner.label,
    confidence,
    score: winner.score,
    reason,
    cues: winner.cues,
    interactionModel: winner.interactionModel,
  };
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
  const mobileFramework = framework.detected.includes('Expo') || framework.detected.includes('React Native') || framework.detected.includes('Flutter');
  const routeSurfaceFiles = files.filter((filePath) => (
    /(^|\/)app\/(.+\/)?page\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)app\/routes\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)(src\/pages|pages)\/.+\.(astro|mdx|tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)src\/App\.(tsx|jsx|ts|js)$/.test(filePath)
    || /(^|\/)src\/main\.(tsx|jsx|ts|js)$/.test(filePath)
  ))
    .filter((filePath) => !/(^|\/)pages\/(?:_app|_document|_error)\./.test(filePath));
  const lightweightWebFramework = ['Next', 'Vite', 'Astro', 'Remix'].includes(framework.primary);

  const push = (id, label, evidence, why) => {
    hits.push({
      id,
      label,
      evidence: evidence.filter(Boolean),
      why,
    });
  };

  if (workflowActive && tsxCount >= 8 && lightweightWebFramework) {
    push('react_tsx_surface', 'React/TSX-heavy surface detected', [`tsx/jsx files: ${tsxCount}`, framework.primary], 'Frontend-heavy component work is likely');
  }
  if (workflowActive && lightweightWebFramework && routeSurfaceFiles.length > 0) {
    push('route_surface', 'Route-backed frontend surface detected', [framework.primary, ...routeSurfaceFiles.slice(0, 3)], 'A lightweight frontend app should still activate UI planning and verification lanes');
  }
  if (workflowActive && mobileFramework) {
    push('mobile_surface', 'Mobile surface detected', [framework.primary, ...framework.detected.slice(1, 3)], 'Mobile-first screen flow should stay explicit in planning and review');
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
  const mobileSurface = Boolean(profile.planningSignals?.mobileSurface || profile.productSurface?.id === 'mobile-app');

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
    profile.frontendMode.active && !mobileSurface,
    profile.frontendMode.active
      ? mobileSurface
        ? 'Skipped because the detected surface is mobile-first rather than web-first'
        : 'Frontend mode expands UX and accessibility expectations'
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
    profile.frontendMode.active && !mobileSurface && (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook),
    profile.frontendMode.active && !mobileSurface && (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook)
      ? 'Visual verification surface exists or is requested'
      : mobileSurface
        ? 'Skipped because the detected surface is mobile-first rather than browser-first'
        : 'Select when preview/browser validation is needed',
    !mobileSurface && (profile.signals.previewNeed || profile.stack.presence.playwright || profile.stack.presence.storybook),
  );

  return { selected, registry };
}

function buildFrontendProfile(cwd, rootDir, options = {}) {
  const scope = String(options.scope || 'workstream').trim().toLowerCase() === 'repo' ? 'repo' : 'workstream';
  const refresh = String(options.refresh || 'incremental').trim().toLowerCase() === 'full' ? 'full' : 'incremental';
  const allowMissingWorkflow = Boolean(options.allowMissingWorkflow);
  const paths = workflowPaths(rootDir);
  if (!allowMissingWorkflow) {
    assertWorkflowFiles(paths);
  }

  const repoIndex = listRepoFiles(cwd, refresh);
  const files = repoIndex.files;
  const fileSet = new Set(files);
  const pkg = maybeReadPackageJson(cwd);
  const extensionCounts = countExtensions(files);
  const framework = detectFramework(pkg, fileSet, files);
  const routing = detectRouting(framework, fileSet, files);
  const styling = detectStyling(pkg, files);
  const uiSystem = detectUiSystem(pkg, fileSet, files);
  const stack = detectStackFamilies(pkg, fileSet, files);

  const safeReadWorkflow = (filePath) => allowMissingWorkflow ? (readIfExists(filePath) || '') : read(filePath);
  const statusDoc = safeReadWorkflow(paths.status);
  const contextDoc = safeReadWorkflow(paths.context);
  const validationDoc = safeReadWorkflow(paths.validation);
  const milestonesDoc = safeReadWorkflow(paths.milestones);
  const handoffDoc = safeReadWorkflow(paths.handoff);
  const milestoneValue = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const workflowActive = allowMissingWorkflow ? (milestoneValue !== 'NONE' || files.length > 0) : milestoneValue !== 'NONE';
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
  const productSurface = detectProductSurface({
    framework,
    files,
    fileSet,
    workflowText,
    intentText,
  });
  const surfaceInventory = buildSurfaceInventory(framework, files);
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
    dart: extensionCounts.get('.dart') || 0,
  };
  const componentIntelligence = buildComponentIntelligenceSummary(cwd, {
    refreshMode: refresh,
    repoIndex,
    surfaceInventory,
  });

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
    routing,
    productSurface,
    surfaceInventory,
    interactionModel: {
      primary: productSurface.interactionModel,
      label: productSurface.interactionModel,
    },
    styling,
    uiSystem,
    stack,
    figma: {
      links: figmaLinks,
      present: figmaLinks.length > 0,
    },
    fileSignals,
    fileCounts,
    componentIntelligence,
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
  profile.browserReadiness = buildBrowserReadiness(profile);
  profile.frontendMode.visualVerdictRequired = profile.visualVerdict.required;
  profile.frontendMode.visualAuditExpanded = profile.frontendMode.active && (profile.browserReadiness.previewRequested || profile.browserReadiness.observationTargets.length > 0);
  profile.adapters = buildAdapterRegistry(profile);
  profile.planningSignals = buildPlanningSignals(profile);
  profile.commandPacks = buildCommandPacks(profile);
  profile.recommendedCommandPack = profile.commandPacks.recommended;

  return profile;
}

function syncValidationWithFrontendProfile(paths, cwd, profile) {
  let validation = read(paths.validation);
  const frontendProfileRef = relativePath(cwd, path.join(paths.rootDir, 'FRONTEND_PROFILE.md'));

  validation = replaceOrAppendField(validation, 'Frontend mode', profile.frontendMode.status);
  validation = replaceOrAppendField(validation, 'Frontend profile ref', frontendProfileRef);
  validation = replaceOrAppendField(validation, 'Frontend profile json', '.workflow/frontend-profile.json');
  validation = replaceOrAppendField(validation, 'Frontend adapter route', profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none');
  validation = replaceOrAppendField(validation, 'Frontend routing', profile.routing.label);
  validation = replaceOrAppendField(validation, 'Frontend command pack', profile.recommendedCommandPack.id);
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
  const allowMissingWorkflow = Boolean(options.allowMissingWorkflow);
  const hasWorkflowScaffold = [
    paths.status,
    paths.validation,
    paths.handoff,
    paths.memory,
    paths.seeds,
    paths.workstreams,
  ].every((filePath) => fs.existsSync(filePath));

  ensureDir(path.dirname(jsonPath));
  write(jsonPath, `${JSON.stringify(profile, null, 2)}
`);
  write(markdownPath, renderFrontendProfileMarkdown(profile, cwd, rootDir));

  if (options.syncValidation !== false && (!allowMissingWorkflow || hasWorkflowScaffold)) {
    syncValidationWithFrontendProfile(paths, cwd, profile);
  }

  if (!allowMissingWorkflow || hasWorkflowScaffold) {
    writeStateSurface(cwd, rootDir, {
      frontend: {
        active: profile.frontendMode.active,
        status: profile.frontendMode.status,
        reason: profile.frontendMode.reason,
        framework: profile.framework.primary,
        productSurface: profile.productSurface.label,
        interactionModel: profile.interactionModel.label,
        routing: profile.routing.label,
        uiSystem: profile.uiSystem.primary,
        adapters: profile.adapters.selected,
        commandPack: profile.recommendedCommandPack.id,
        visualVerdictRequired: profile.visualVerdict.required,
        browserLane: profile.browserReadiness.recommendedLane,
        componentReuseVerdict: profile.componentIntelligence.reuse.verdict,
        refreshStatus: profile.fingerprint.refreshStatus,
        profileRef: relativePath(cwd, markdownPath),
        profileJson: relativePath(cwd, jsonPath),
        signals: profile.signals.hits.map((item) => item.label),
      },
    }, { updatedBy: 'map-frontend' });
  }

  return {
    jsonPath,
    markdownPath,
  };
}

function printCompact(profile, rootDir) {
  const summary = summarizeProfile(profile);
  console.log('# FRONTEND MAP\n');
  console.log(`- root=\`${relativePath(process.cwd(), rootDir)}\` scope=\`${profile.scope.mode}\` frontend=\`${summary.frontendMode}\` surface=\`${summary.productSurface}\` framework=\`${summary.framework}\` routing=\`${summary.routing}\` ui=\`${summary.uiSystem}\` refresh=\`${summary.refreshStatus}\``);
  console.log(`- styling=\`${summary.styling.join(', ') || 'none'}\` pack=\`${summary.commandPack}\` adapters=\`${summary.adapters.join(', ') || 'none'}\` visual_verdict=\`${summary.visualVerdictRequired ? 'yes' : 'no'}\` reuse=\`${summary.reuseVerdict}\` browser_lane=\`${summary.browserLane}\` signals=\`${summary.signalCount}\``);
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
  console.log(`- Product surface: \`${summary.productSurface}\``);
  console.log(`- Framework: \`${summary.framework}\``);
  console.log(`- Routing: \`${summary.routing}\``);
  console.log(`- Styling: \`${summary.styling.join(', ') || 'none'}\``);
  console.log(`- UI system: \`${summary.uiSystem}\``);
  console.log(`- Recommended pack: \`${summary.commandPack}\``);
  console.log(`- Selected adapters: \`${summary.adapters.join(', ') || 'none'}\``);
  console.log(`- Visual verdict required: \`${summary.visualVerdictRequired ? 'yes' : 'no'}\``);
  console.log(`- Component reuse: \`${summary.reuseVerdict}\``);
  console.log(`- Browser lane: \`${summary.browserLane}\``);
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
  console.log('\n## Recommended Command Pack\n');
  console.log(`- \`${profile.recommendedCommandPack.label}\` -> ${profile.recommendedCommandPack.summary}`);
  for (const command of profile.recommendedCommandPack.commands) {
    console.log(`- \`${command}\``);
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
