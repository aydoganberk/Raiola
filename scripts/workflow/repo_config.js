const fs = require('node:fs');
const path = require('node:path');
const { readJsonIfExists } = require('./io/json');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { buildFrontendProfile } = require('./map_frontend');
const { buildApiSurface } = require('./api_surface');
const { findStartAddOn, findStartProfile } = require('./workflow_start_intelligence');
const { writeJsonFile } = require('./roadmap_os');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const { planeById } = require('./plane_registry');

const CONFIG_VERSION = 3;
const DEFAULT_EXTERNAL_EXPORTS = Object.freeze([
  'github-pr-comment',
  'github-pr-comment-json',
  'github-check-summary',
  'github-check-summary-json',
  'github-actions-step-summary',
  'github-actions-output-json',
  'ci-gate',
  'repo-status-json',
  'status-badge-json',
  'issue-tracker-json',
  'slack-summary',
  'slack-summary-json',
  'export-manifest-json',
  'control-plane-packet-json',
]);

const STACK_PACK_CATALOG = Object.freeze({
  'nextjs-app': {
    summary: 'Browser proof, preview discipline, and closeout artifacts matter for app-router or pages-router work.',
    preferredPlanes: ['frontend-control', 'release-control', 'handoff'],
    bundleBias: ['frontend-delivery', 'frontend-review', 'frontend-ship-readiness'],
    addOnBias: ['browser', 'surface', 'state', 'handoff'],
    verificationBias: ['npm run build', 'rai verify-browser --url http://localhost:3000 --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'reviewLaneOnPr', 'pullRequestPublish'],
    releaseBias: ['stickyPrComment', 'ciGate', 'statusBadge'],
  },
  'express-api': {
    summary: 'Contract discipline, regression checks, and ship gating matter more than UI proof.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['npm test', 'rai verify-work --json'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'statusBadge'],
  },
  'cloudflare-workers': {
    summary: 'Edge runtime repos need strict trust, explicit deployment gates, and CI-native exports.',
    preferredPlanes: ['safety-control', 'trust', 'release-control'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['npm run build', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['reviewLaneOnPr', 'ciFailureRecovery', 'pullRequestPublish'],
    releaseBias: ['ciGate', 'stickyPrComment', 'statusBadge'],
  },
  'supabase-stripe': {
    summary: 'Payment or auth-sensitive repos should stay strict, evidence-heavy, and rollback-aware.',
    preferredPlanes: ['safety-control', 'trust', 'release-control'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression', 'handoff'],
    verificationBias: ['npm test', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'pullRequestPublish'],
    releaseBias: ['ciGate', 'stickyPrComment', 'requireRollbackHint'],
  },
  'monorepo-workspace': {
    summary: 'Monorepos benefit from impact-wave planning, ownership clarity, shard-aware review, and continuity-aware automation.',
    preferredPlanes: ['monorepo-control', 'safety-control', 'repo-control'],
    bundleBias: ['monorepo-audit-wave', 'correction-wave', 'ship-closeout'],
    addOnBias: ['parallel', 'ownership', 'shard', 'repair'],
    verificationBias: ['rai audit-repo --mode oneshot --json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'teamMailboxRecovery', 'releaseWaveRefresh'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'uploadArtifacts'],
  },
  'design-system-heavy-frontend': {
    summary: 'Frontend-heavy repos need explainable routing, browser proof, design debt tracking, and polished handoff.',
    preferredPlanes: ['frontend-control', 'release-control', 'handoff'],
    bundleBias: ['frontend-delivery', 'frontend-review', 'frontend-ship-readiness'],
    addOnBias: ['browser', 'state', 'design-system', 'handoff'],
    verificationBias: ['rai verify-browser --url http://localhost:3000 --json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'reviewLaneOnPr', 'inactiveThreadRecovery'],
    releaseBias: ['stickyPrComment', 'statusBadge', 'slackStructuredPayload'],
  },
  'repo-native-cli': {
    summary: 'CLI repos benefit from lifecycle, rollback visibility, and publish-ready change control.',
    preferredPlanes: ['lifecycle', 'release-control', 'measure'],
    bundleBias: ['slice-delivery', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['npm test', 'npm run build'],
    handoffStandard: 'compact',
    trustLevel: 'standard',
    automationBias: ['dailySummary', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge', 'uploadArtifacts'],
  },

  'nx-workspace': {
    summary: 'Nx repos benefit from task-graph awareness, target-level verification, and explicit affected-scope routing.',
    preferredPlanes: ['monorepo-control', 'repo-control', 'measure'],
    bundleBias: ['monorepo-audit-wave', 'review-wave'],
    addOnBias: ['parallel', 'ownership', 'shard'],
    verificationBias: ['npx nx show projects', 'npx nx affected --target=test', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'reviewLaneOnPr', 'releaseWaveRefresh'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'statusBadge'],
  },
  'turbo-workspace': {
    summary: 'Turbo repos benefit from task-pipeline awareness, scoped verification, and release-safe monorepo routing.',
    preferredPlanes: ['monorepo-control', 'repo-control', 'measure'],
    bundleBias: ['monorepo-audit-wave', 'review-wave'],
    addOnBias: ['parallel', 'ownership', 'shard'],
    verificationBias: ['npx turbo run test --dry=json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'reviewLaneOnPr', 'releaseWaveRefresh'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'statusBadge'],
  },
  'polyglot-monorepo': {
    summary: 'Polyglot monorepos need repo-truth adapters, ownership overlays, and package-aware verify contracts.',
    preferredPlanes: ['monorepo-control', 'safety-control', 'repo-control'],
    bundleBias: ['monorepo-audit-wave', 'correction-wave', 'ship-closeout'],
    addOnBias: ['parallel', 'ownership', 'shard', 'repair', 'trust'],
    verificationBias: ['rai monorepo --json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'teamMailboxRecovery', 'releaseWaveRefresh'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'uploadArtifacts'],
  },
  'python-service': {
    summary: 'Python repos benefit from repo-truth ownership, import-aware impact checks, and pytest-first verification.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['python -m pytest', 'python -m compileall .'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'go-service': {
    summary: 'Go repos benefit from module-aware verification, vet/test defaults, and conservative release posture.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['go test ./...', 'go vet ./...'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'rust-workspace': {
    summary: 'Rust workspaces benefit from cargo-aware impact checks, strict verification, and release gating.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['cargo test', 'cargo check'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'java-workspace': {
    summary: 'Java repos benefit from module-aware verification, ownership clarity, and explicit release contracts.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['mvn test', './gradlew test'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'expo-react-native': {
    summary: 'Expo/React Native repos need mobile screen flow awareness, simulator-friendly proof, and package-scoped planning.',
    preferredPlanes: ['frontend-control', 'handoff', 'measure'],
    bundleBias: ['frontend-delivery', 'review-wave'],
    addOnBias: ['surface', 'state', 'handoff'],
    verificationBias: ['rai map-frontend --json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'reviewLaneOnPr', 'inactiveThreadRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'hono-api': {
    summary: 'Hono APIs need route inventory, contract checks, and backend-aware verification rather than browser-only proof.',
    preferredPlanes: ['trust', 'release-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['rai api-surface --json', 'npm test', 'rai verify-work --json'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'issueTrackerExport', 'statusBadge'],
  },
  'firestore-data': {
    summary: 'Firestore-heavy repos need repository-aware audit trails, migration caution, and evidence-heavy release checks.',
    preferredPlanes: ['trust', 'safety-control', 'measure'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['rai api-surface --json', 'rai trust --json', 'rai verify-work --json'],
    handoffStandard: 'release-ready',
    trustLevel: 'strict',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'requireRollbackHint', 'statusBadge'],
  },
  'upstash-redis': {
    summary: 'Redis/cache surfaces need explicit data-flow review and verification that stateful behavior stayed bounded.',
    preferredPlanes: ['trust', 'measure', 'release-control'],
    bundleBias: ['review-wave', 'ship-closeout'],
    addOnBias: ['trust', 'regression'],
    verificationBias: ['rai api-surface --json', 'rai verify-work --json'],
    handoffStandard: 'compact',
    trustLevel: 'elevated',
    automationBias: ['dailySummary', 'correctionOnVerifyFail', 'ciFailureRecovery'],
    releaseBias: ['ciGate', 'statusBadge'],
  },
  'generic-node': {
    summary: 'Balanced defaults keep trust, release, and lifecycle visible without overfitting.',
    preferredPlanes: ['trust', 'release-control', 'lifecycle'],
    bundleBias: ['slice-delivery', 'review-wave'],
    addOnBias: ['trust', 'handoff'],
    verificationBias: ['rai verify-work --json'],
    handoffStandard: 'compact',
    trustLevel: 'standard',
    automationBias: ['dailySummary', 'branchStartAdvice', 'inactiveThreadRecovery'],
    releaseBias: ['ciGate', 'stickyPrComment'],
  },
});

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function repoConfigPath(cwd) {
  return path.join(cwd, '.workflow', 'repo-config.json');
}


function readPackageJson(cwd) {
  return readJsonIfExists(path.join(cwd, 'package.json'), {});
}

function dependencyMap(pkg = {}) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
    ...(pkg.optionalDependencies || {}),
  };
}

function fileExists(cwd, relativeFile) {
  return fs.existsSync(path.join(cwd, relativeFile));
}


function detectedEcosystems(packageGraph = {}) {
  const raw = packageGraph.workspaceDiscovery?.ecosystems || [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw
      ? Object.entries(raw).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
      : [];
  return [...new Set(list
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean))];
}

function detectedWorkspaceMarkers(packageGraph = {}) {
  const raw = packageGraph.workspaceDiscovery?.markers || [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw
      ? Object.entries(raw).filter(([, enabled]) => Boolean(enabled)).map(([key]) => `${key}.json`)
      : [];
  return [...new Set(list
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean))];
}

function safeFrontendProfile(cwd, rootDir) {
  try {
    return buildFrontendProfile(cwd, rootDir, {
      scope: 'repo',
      refresh: 'incremental',
      allowMissingWorkflow: true,
    });
  } catch {
    return null;
  }
}

function safeApiSurface(cwd, packageGraph) {
  try {
    return buildApiSurface(cwd, {
      refresh: 'incremental',
      writeFiles: true,
      packageGraph,
    });
  } catch {
    return null;
  }
}

function pushProfile(profiles, id, label, evidence = [], summary = '') {
  if (profiles.some((entry) => entry.id === id)) {
    return;
  }
  profiles.push({
    id,
    label,
    summary,
    evidence: [...new Set(evidence.filter(Boolean))],
  });
}

function detectProfiles(cwd, rootDir) {
  const pkg = readPackageJson(cwd);
  const deps = dependencyMap(pkg);
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const frontendProfile = safeFrontendProfile(cwd, rootDir);
  const apiSurface = safeApiSurface(cwd, packageGraph);
  const ecosystems = new Set(detectedEcosystems(packageGraph));
  const truthMarkers = new Set(detectedWorkspaceMarkers(packageGraph));
  const profiles = [];
  const add = (id, label, evidence, summary) => pushProfile(profiles, id, label, evidence, summary);

  const frontendFrameworks = new Set(frontendProfile?.framework?.detected || []);
  const frontendRoutes = new Set(frontendProfile?.routing?.detected || []);
  const apiFrameworks = new Set(apiSurface?.frameworks || []);
  const dataStores = new Set(apiSurface?.dataStores || []);
  const authSignals = new Set(apiSurface?.authSignals || []);

  if (deps.next || frontendFrameworks.has('Next') || frontendRoutes.has('next-app-router') || frontendRoutes.has('next-pages-router')) {
    add('nextjs-app', 'Next.js app', [
      deps.next ? 'dependency:next' : '',
      frontendProfile?.framework?.primary === 'Next' ? 'frontend:Next' : '',
      frontendProfile?.routing?.detected?.includes('next-app-router') ? 'routing:next-app-router' : '',
      frontendProfile?.routing?.detected?.includes('next-pages-router') ? 'routing:next-pages-router' : '',
    ], 'Frontend routing, browser proof, and UI ship gates matter.');
  }

  if (frontendFrameworks.has('Expo') || frontendFrameworks.has('React Native') || frontendRoutes.has('expo-router') || frontendRoutes.has('react-native-navigation')) {
    add('expo-react-native', 'Expo / React Native app', [
      frontendFrameworks.has('Expo') ? 'framework:Expo' : '',
      frontendFrameworks.has('React Native') ? 'framework:React Native' : '',
      frontendRoutes.has('expo-router') ? 'routing:expo-router' : '',
      frontendRoutes.has('react-native-navigation') ? 'routing:react-native-navigation' : '',
      frontendProfile?.surfaceInventory?.screenCount ? `screens:${frontendProfile.surfaceInventory.screenCount}` : '',
    ], 'Mobile screen flow, state transitions, and non-browser proof should stay visible.');
  }

  if (deps.express || deps.fastify || deps.koa || apiFrameworks.has('express') || apiFrameworks.has('fastify') || apiFrameworks.has('koa') || fileExists(cwd, 'src/server.ts') || fileExists(cwd, 'src/server.js') || fileExists(cwd, 'server.ts') || fileExists(cwd, 'server.js')) {
    add('express-api', 'Express/API service', [
      deps.express ? 'dependency:express' : '',
      deps.fastify ? 'dependency:fastify' : '',
      deps.koa ? 'dependency:koa' : '',
      apiFrameworks.has('express') ? 'api:express' : '',
      apiFrameworks.has('fastify') ? 'api:fastify' : '',
      apiFrameworks.has('koa') ? 'api:koa' : '',
      fileExists(cwd, 'src/server.ts') ? 'src/server.ts' : '',
      fileExists(cwd, 'src/server.js') ? 'src/server.js' : '',
      fileExists(cwd, 'server.ts') ? 'server.ts' : '',
      fileExists(cwd, 'server.js') ? 'server.js' : '',
    ], 'API and contract verification should stay explicit.');
  }

  if (apiFrameworks.has('hono')) {
    add('hono-api', 'Hono API service', [
      'api:hono',
      apiSurface?.endpointCount ? `endpoints:${apiSurface.endpointCount}` : '',
      ...(apiSurface?.packages || []).slice(0, 3).map((entry) => `package:${entry.packagePath}`),
    ], 'Route inventory, middleware visibility, and backend verification should be first-class.');
  }

  if (dataStores.has('firestore')) {
    add('firestore-data', 'Firestore data surface', [
      'data:firestore',
      apiSurface?.repositoryPatternFiles?.length ? `repositories:${apiSurface.repositoryPatternFiles.length}` : '',
      authSignals.has('jwt') ? 'auth:jwt' : '',
    ], 'Repository-heavy data paths and auth-adjacent changes should keep trust and regression visible.');
  }

  if (dataStores.has('redis')) {
    add('upstash-redis', 'Redis / Upstash cache surface', [
      'data:redis',
      authSignals.has('jwt') ? 'auth:jwt' : '',
      apiSurface?.middlewareCount ? `middleware:${apiSurface.middlewareCount}` : '',
    ], 'Cache behavior and stateful side effects should keep verification and release gates visible.');
  }

  if (deps.wrangler || deps['@cloudflare/workers-types'] || deps['miniflare'] || fileExists(cwd, 'wrangler.toml') || fileExists(cwd, 'wrangler.jsonc')) {
    add('cloudflare-workers', 'Cloudflare Workers', [
      deps.wrangler ? 'dependency:wrangler' : '',
      deps['@cloudflare/workers-types'] ? 'dependency:@cloudflare/workers-types' : '',
      deps.miniflare ? 'dependency:miniflare' : '',
      fileExists(cwd, 'wrangler.toml') ? 'wrangler.toml' : '',
      fileExists(cwd, 'wrangler.jsonc') ? 'wrangler.jsonc' : '',
    ], 'Runtime, deployment, and edge-safe verification should be stricter.');
  }

  if (deps['@supabase/supabase-js'] || deps.stripe || deps['stripe'] || fileExists(cwd, 'supabase/config.toml')) {
    add('supabase-stripe', 'Supabase / Stripe', [
      deps['@supabase/supabase-js'] ? 'dependency:@supabase/supabase-js' : '',
      deps.stripe || deps['stripe'] ? 'dependency:stripe' : '',
      fileExists(cwd, 'supabase/config.toml') ? 'supabase/config.toml' : '',
    ], 'Payments or auth-sensitive flows benefit from stronger trust defaults.');
  }

  if (packageGraph.repoShape === 'monorepo' || Number(packageGraph.packageCount || 0) > 1) {
    add('monorepo-workspace', 'Monorepo workspace', [
      `repo-shape:${packageGraph.repoShape}`,
      `packages:${packageGraph.packageCount || 0}`,
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Ranked shards, ownership, and package-aware review should be default.');
  }

  if (fileExists(cwd, 'nx.json') || truthMarkers.has('nx.json')) {
    add('nx-workspace', 'Nx workspace', [
      fileExists(cwd, 'nx.json') ? 'nx.json' : '',
      truthMarkers.has('nx.json') ? 'marker:nx.json' : '',
    ], 'Affected-scope verification and task-graph-aware routing should be available.');
  }

  if (fileExists(cwd, 'turbo.json') || truthMarkers.has('turbo.json')) {
    add('turbo-workspace', 'Turbo workspace', [
      fileExists(cwd, 'turbo.json') ? 'turbo.json' : '',
      truthMarkers.has('turbo.json') ? 'marker:turbo.json' : '',
    ], 'Task-pipeline awareness and scoped verification should be available.');
  }

  if ((packageGraph.repoShape === 'monorepo' || Number(packageGraph.packageCount || 0) > 1) && ecosystems.size > 1) {
    add('polyglot-monorepo', 'Polyglot monorepo', [
      `ecosystems:${[...ecosystems].join(',')}`,
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Repo truth, ownership overlays, and per-ecosystem verify contracts should be default.');
  }

  if (ecosystems.has('python')) {
    add('python-service', 'Python service or workspace', [
      'ecosystem:python',
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Pytest-first verification and package-aware routing should stay explicit.');
  }

  if (ecosystems.has('go')) {
    add('go-service', 'Go service or module', [
      'ecosystem:go',
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Module-aware verification and package ownership should stay explicit.');
  }

  if (ecosystems.has('rust')) {
    add('rust-workspace', 'Rust workspace', [
      'ecosystem:rust',
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Cargo-aware verification and workspace ownership should stay explicit.');
  }

  if (ecosystems.has('java')) {
    add('java-workspace', 'Java workspace', [
      'ecosystem:java',
      ...((packageGraph.workspaceDiscovery?.sources || []).map((entry) => `workspace:${entry}`)),
    ], 'Module-aware verification and release discipline should stay explicit.');
  }

  const componentCount = Number(frontendProfile?.surfaceInventory?.sharedComponentCount || frontendProfile?.metrics?.sharedComponentCount || 0) + Number(frontendProfile?.surfaceInventory?.localComponentCount || frontendProfile?.metrics?.localComponentCount || 0);
  const routeCount = Number(frontendProfile?.surfaceInventory?.routeCount || frontendProfile?.metrics?.routeCount || 0);
  const uiSystem = String(frontendProfile?.uiSystem?.primary || '').toLowerCase();
  if (frontendProfile?.frontendMode?.active && (
    componentCount >= 8
      || routeCount >= 4
      || /shadcn|radix|mui|chakra|storybook/.test(uiSystem)
      || Boolean(deps.storybook)
  )) {
    add('design-system-heavy-frontend', 'Design-system-heavy frontend', [
      frontendProfile?.uiSystem?.primary ? `ui-system:${frontendProfile.uiSystem.primary}` : '',
      routeCount ? `routes:${routeCount}` : '',
      componentCount ? `components:${componentCount}` : '',
      frontendProfile?.framework?.primary ? `framework:${frontendProfile.framework.primary}` : '',
    ], 'State coverage, design debt, browser proof, and handoff outputs should be first-class.');
  }

  if ((pkg.bin && Object.keys(pkg.bin).length > 0) || fileExists(cwd, 'bin/rai.js')) {
    add('repo-native-cli', 'Repo-native CLI', [
      pkg.bin ? `bin:${Object.keys(pkg.bin).join(',')}` : '',
      fileExists(cwd, 'bin/rai.js') ? 'bin/rai.js' : '',
    ], 'Shell safety, release notes, and rollback visibility matter for distributed installs.');
  }

  if (profiles.length === 0) {
    add('generic-node', 'Generic Node repo', [pkg.name ? `package:${pkg.name}` : 'package.json'], 'Balanced defaults with explicit verification stay safest.');
  }

  return {
    packageGraph,
    frontendProfile,
    apiSurface,
    profiles,
    pkg,
    deps,
  };
}

function scriptCommands(pkg = {}) {
  return Object.keys(pkg.scripts || {});
}

function normalizeProfileId(value, fallback = 'balanced') {
  return findStartProfile(value)?.id || fallback;
}

function normalizeAddOnIds(values = []) {
  return [...new Set((values || [])
    .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    .map((entry) => findStartAddOn(entry)?.id || String(entry || '').trim())
    .filter(Boolean))];
}

function normalizePlaneIds(values = []) {
  return [...new Set((values || [])
    .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => planeById(entry) && planeById(entry).kind === 'plane'))];
}

function stackPackSpec(profileId) {
  return STACK_PACK_CATALOG[profileId] || STACK_PACK_CATALOG['generic-node'];
}

function defaultVerifications(pkg = {}, detection = {}) {
  const commands = [];
  const scripts = scriptCommands(pkg);
  const ecosystems = new Set(detectedEcosystems(detection.packageGraph));
  const frontendProfile = detection.frontendProfile || {};
  const apiSurface = detection.apiSurface || {};
  const hasWebSurface = Number(frontendProfile?.surfaceInventory?.webRouteCount || 0) > 0;
  const hasMobileSurface = Number(frontendProfile?.surfaceInventory?.mobileRouteCount || 0) > 0;
  const push = (command) => {
    if (!command || commands.includes(command)) {
      return;
    }
    commands.push(command);
  };

  if (scripts.includes('test')) {
    push('npm test');
  }
  if (scripts.includes('lint')) {
    push('npm run lint');
  }
  if (scripts.includes('typecheck')) {
    push('npm run typecheck');
  }
  if (scripts.includes('build')) {
    push('npm run build');
  }
  if (ecosystems.has('python')) {
    push('python -m pytest');
    push('python -m compileall .');
  }
  if (ecosystems.has('go')) {
    push('go test ./...');
    push('go vet ./...');
  }
  if (ecosystems.has('rust')) {
    push('cargo test');
    push('cargo check');
  }
  if (ecosystems.has('java')) {
    push('mvn test');
  }
  if (fileExists(process.cwd(), 'nx.json') || detectedWorkspaceMarkers(detection.packageGraph).includes('nx.json')) {
    push('npx nx affected --target=test');
  }
  if (fileExists(process.cwd(), 'turbo.json') || detectedWorkspaceMarkers(detection.packageGraph).includes('turbo.json')) {
    push('npx turbo run test --dry=json');
  }
  if (frontendProfile?.frontendMode?.active || hasWebSurface || hasMobileSurface) {
    push('rai map-frontend --json');
  }
  if (hasWebSurface) {
    push('rai verify-browser --url http://localhost:3000 --json');
  }
  if (Number(apiSurface.endpointCount || 0) > 0) {
    push('rai api-surface --json');
  }
  if ((apiSurface.dataStores || []).length > 0 || (apiSurface.authSignals || []).length > 0) {
    push('rai trust --json');
  }
  push('rai verify-work --json');
  if (detection.packageGraph?.repoShape === 'monorepo') {
    push('rai audit-repo --mode oneshot --json');
  }
  return commands;
}

function defaultBundles(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  const bundles = [];
  const push = (value) => {
    if (value && !bundles.includes(value)) {
      bundles.push(value);
    }
  };

  if (ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace')) {
    push('monorepo-audit-wave');
    push('correction-wave');
    push('ship-closeout');
  }
  if (ids.includes('design-system-heavy-frontend') || ids.includes('nextjs-app') || ids.includes('expo-react-native')) {
    push('frontend-delivery');
    push('frontend-review');
    push('frontend-ship-readiness');
  }
  if (ids.includes('express-api') || ids.includes('cloudflare-workers') || ids.includes('hono-api') || ids.includes('firestore-data') || ids.includes('upstash-redis')) {
    push('review-wave');
    push('ship-closeout');
  }
  if (!bundles.length) {
    push('slice-delivery');
    push('review-wave');
  }
  return bundles;
}

function defaultAddOns(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  const addOns = [];
  const push = (value) => {
    if (findStartAddOn(value) && !addOns.includes(value)) {
      addOns.push(value);
    }
  };

  if (ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend') || ids.includes('expo-react-native')) {
    if (ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend')) {
      push('browser');
    }
    push('surface');
    push('state');
    push('handoff');
  }
  if (ids.includes('design-system-heavy-frontend')) {
    push('design-system');
  }
  if (ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace')) {
    push('parallel');
    push('ownership');
    push('shard');
    push('repair');
  }
  if (ids.includes('polyglot-monorepo')) {
    push('trust');
  }
  if (ids.includes('express-api') || ids.includes('cloudflare-workers') || ids.includes('supabase-stripe') || ids.includes('hono-api') || ids.includes('firestore-data') || ids.includes('upstash-redis')) {
    push('trust');
    push('regression');
  }
  if (!addOns.length) {
    push('trust');
    push('handoff');
  }
  return addOns;
}

function defaultTrustLevel(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  if (ids.includes('supabase-stripe') || ids.includes('cloudflare-workers') || ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('firestore-data')) {
    return 'strict';
  }
  if (ids.includes('express-api') || ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend') || ids.includes('expo-react-native') || ids.includes('hono-api') || ids.includes('upstash-redis') || ids.includes('python-service') || ids.includes('go-service') || ids.includes('rust-workspace') || ids.includes('java-workspace')) {
    return 'elevated';
  }
  return 'standard';
}

function defaultStartProfile(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  if (ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('design-system-heavy-frontend') || ids.includes('expo-react-native') || ids.includes('supabase-stripe') || ids.includes('firestore-data')) {
    return 'deep';
  }
  if (ids.includes('repo-native-cli')) {
    return 'balanced';
  }
  return 'balanced';
}

function defaultPreferredPlanes(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  const planes = [];
  const push = (value) => {
    if (planeById(value) && planeById(value).kind === 'plane' && !planes.includes(value)) {
      planes.push(value);
    }
  };

  push('repo-config');
  if (ids.includes('supabase-stripe') || ids.includes('cloudflare-workers') || ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('firestore-data')) {
    push('safety-control');
  }
  if (ids.includes('supabase-stripe') || ids.includes('cloudflare-workers') || ids.includes('hono-api') || ids.includes('firestore-data') || ids.includes('upstash-redis')) {
    push('trust');
  }
  push('release-control');
  if (ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace')) {
    push('monorepo-control');
    push('repo-control');
    push('team-control');
    push('autopilot');
  }
  if (ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend') || ids.includes('expo-react-native')) {
    push('handoff');
    push('explain');
    if (!ids.includes('expo-react-native') || ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend')) {
      // web-oriented frontend keeps browser proof visible elsewhere; mobile still uses explain/handoff.
    }
  }
  if (ids.includes('repo-native-cli')) {
    push('lifecycle');
  }
  push('measure');
  push('lifecycle');
  return planes;
}

function defaultHandoffStandard(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  if (ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('design-system-heavy-frontend') || ids.includes('expo-react-native') || ids.includes('supabase-stripe') || ids.includes('firestore-data')) {
    return 'release-ready';
  }
  return 'compact';
}

function defaultAutomation(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  return {
    dailySummary: true,
    branchStartAdvice: true,
    reviewLaneOnPr: true,
    correctionOnVerifyFail: true,
    milestoneDriftAlert: true,
    inactiveThreadRecovery: true,
    ciFailureRecovery: true,
    pullRequestPublish: true,
    teamMailboxRecovery: ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('design-system-heavy-frontend'),
    releaseWaveRefresh: true,
  };
}

function defaultReleaseControl(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  return {
    publishStepSummary: true,
    stickyPrComment: true,
    ciGate: true,
    issueTrackerExport: true,
    slackStructuredPayload: true,
    statusBadge: true,
    uploadArtifacts: true,
    preferJsonArtifacts: true,
    requireRollbackHint: ids.includes('repo-native-cli') || ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') || ids.includes('supabase-stripe'),
  };
}


function surfaceCompressionSpec(detection = {}) {
  const ids = detection.profiles.map((entry) => entry.id);
  const coreFlows = [
    {
      id: 'start-safe',
      label: 'Start safe',
      commands: ['rai start', 'rai do', 'rai next'],
      summary: 'Daily entry path for bounded work and stepwise execution.',
    },
    {
      id: 'prove-and-close',
      label: 'Prove and close',
      commands: ['rai verify-work --json', 'rai doctor --json', 'rai handoff'],
      summary: 'Default closeout path that keeps proof and handoff visible.',
    },
    {
      id: 'codex-operator',
      label: 'Shape Codex session',
      commands: ['rai codex operator --goal "..."', 'rai codex cockpit --goal "..." --json'],
      summary: 'Task-aware session shaping for native Codex runs.',
    },
    {
      id: 'frontend-proof',
      label: 'Frontend proof',
      commands: ['rai map-frontend', 'rai verify-browser --url http://localhost:3000 --json'],
      summary: 'Web/frontend golden path for browser proof and UI review.',
      when: ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend'),
    },
    {
      id: 'mobile-surface',
      label: 'Mobile surface',
      commands: ['rai map-frontend', 'rai ui-review --goal "..." --json', 'rai verify-work --json'],
      summary: 'Mobile-first path that keeps screen flow and state coverage explicit.',
      when: ids.includes('expo-react-native'),
    },
    {
      id: 'api-contract',
      label: 'API contract',
      commands: ['rai api-surface --json', 'rai trust --json', 'rai verify-work --json'],
      summary: 'Backend-first path that surfaces endpoints, auth/data signals, and verification debt.',
      when: ids.includes('hono-api') || ids.includes('express-api') || ids.includes('firestore-data') || ids.includes('upstash-redis'),
    },
    {
      id: 'monorepo-audit',
      label: 'Monorepo audit',
      commands: ['rai monorepo', 'rai review-orchestrate', 'rai audit-repo --mode oneshot --json'],
      summary: 'Package-aware path for large or polyglot repos.',
      when: ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace'),
    },
    {
      id: 'ship',
      label: 'Ship',
      commands: ['rai release-control', 'rai control-plane-publish'],
      summary: 'Release-oriented lane with export and gate artifacts.',
    },
  ].filter((entry) => entry.when !== false)
    .map(({ when, ...entry }) => entry);

  const optionalPacks = [
    { id: 'frontend-pack', opens: ['browser', 'surface', 'design-system', 'handoff'], when: ids.includes('nextjs-app') || ids.includes('design-system-heavy-frontend') },
    { id: 'mobile-pack', opens: ['surface', 'state', 'handoff'], when: ids.includes('expo-react-native') },
    { id: 'monorepo-pack', opens: ['parallel', 'ownership', 'shard', 'repair'], when: ids.includes('monorepo-workspace') || ids.includes('polyglot-monorepo') || ids.includes('nx-workspace') || ids.includes('turbo-workspace') },
    { id: 'trust-pack', opens: ['trust', 'regression', 'release-control'], when: ids.includes('express-api') || ids.includes('cloudflare-workers') || ids.includes('supabase-stripe') || ids.includes('hono-api') || ids.includes('firestore-data') || ids.includes('upstash-redis') || ids.includes('python-service') || ids.includes('go-service') || ids.includes('rust-workspace') || ids.includes('java-workspace') },
    { id: 'cli-pack', opens: ['lifecycle', 'rollback', 'publish'], when: ids.includes('repo-native-cli') },
  ].filter((entry) => entry.when !== false)
    .map(({ when, ...entry }) => entry);

  return {
    summary: `${coreFlows.length} golden path(s) stay foregrounded; advanced capabilities open as optional packs.`,
    coreFlows,
    optionalPacks,
  };
}

function buildGeneratedDefaults(detection) {
  return {
    version: CONFIG_VERSION,
    defaultProfile: defaultStartProfile(detection),
    trustLevel: defaultTrustLevel(detection),
    preferredBundles: defaultBundles(detection),
    preferredAddOns: defaultAddOns(detection),
    preferredPlanes: defaultPreferredPlanes(detection),
    requiredVerifications: defaultVerifications(detection.pkg, detection),
    handoffStandard: defaultHandoffStandard(detection),
    automation: defaultAutomation(detection),
    externalExports: [...DEFAULT_EXTERNAL_EXPORTS],
    releaseControl: defaultReleaseControl(detection),
    surfaceCompression: surfaceCompressionSpec(detection),
    explainability: {
      showWhy: true,
      showUnsurveyedSurfaces: true,
      showDeepModeDelta: true,
      showConfidenceBreakdown: true,
      showCoverageSignals: true,
    },
  };
}

function buildStackPacks(detection = {}, activeConfig = {}) {
  const profiles = detection.profiles.length > 0 ? detection.profiles : [{
    id: 'generic-node',
    label: 'Generic Node repo',
    summary: 'Balanced defaults with explicit verification stay safest.',
    evidence: ['package.json'],
  }];
  return profiles.map((profile) => {
    const spec = stackPackSpec(profile.id);
    const preferredPlanes = normalizePlaneIds(spec.preferredPlanes || activeConfig.preferredPlanes || []);
    return {
      id: profile.id,
      label: profile.label,
      summary: spec.summary || profile.summary || '',
      evidence: [...new Set((profile.evidence || []).filter(Boolean))],
      preferredPlane: preferredPlanes[0] || activeConfig.preferredPlanes?.[0] || 'release-control',
      preferredPlanes: preferredPlanes.map((planeId) => ({
        id: planeId,
        title: planeById(planeId)?.title || planeId,
      })),
      bundleBias: [...new Set((spec.bundleBias || activeConfig.preferredBundles || []).filter(Boolean))],
      addOnBias: normalizeAddOnIds(spec.addOnBias || activeConfig.preferredAddOns || []),
      verificationBias: [...new Set((spec.verificationBias || activeConfig.requiredVerifications || []).filter(Boolean))].slice(0, 8),
      handoffStandard: spec.handoffStandard || activeConfig.handoffStandard || 'compact',
      trustLevel: spec.trustLevel || activeConfig.trustLevel || 'standard',
      automationBias: (spec.automationBias || []).map((key) => ({
        key,
        enabled: Boolean(activeConfig.automation?.[key]),
      })),
      releaseBias: (spec.releaseBias || []).map((key) => ({
        key,
        enabled: Boolean(activeConfig.releaseControl?.[key]),
      })),
    };
  });
}

function mergeActiveConfig(generatedDefaults, storedConfig = null, detection = {}) {
  const stored = storedConfig && typeof storedConfig === 'object' ? storedConfig : {};
  return {
    version: CONFIG_VERSION,
    defaultProfile: normalizeProfileId(stored.defaultProfile || generatedDefaults.defaultProfile, generatedDefaults.defaultProfile),
    trustLevel: String(stored.trustLevel || generatedDefaults.trustLevel || 'standard').trim().toLowerCase(),
    preferredBundles: [...new Set((stored.preferredBundles || generatedDefaults.preferredBundles || []).map((entry) => String(entry).trim()).filter(Boolean))],
    preferredAddOns: normalizeAddOnIds(stored.preferredAddOns || generatedDefaults.preferredAddOns || []),
    preferredPlanes: normalizePlaneIds(stored.preferredPlanes || generatedDefaults.preferredPlanes || []),
    requiredVerifications: [...new Set((stored.requiredVerifications || generatedDefaults.requiredVerifications || []).map((entry) => String(entry).trim()).filter(Boolean))],
    handoffStandard: String(stored.handoffStandard || generatedDefaults.handoffStandard || 'compact').trim().toLowerCase(),
    automation: {
      ...generatedDefaults.automation,
      ...(stored.automation || {}),
    },
    externalExports: [...new Set((stored.externalExports || generatedDefaults.externalExports || []).map((entry) => String(entry).trim()).filter(Boolean))],
    releaseControl: {
      ...generatedDefaults.releaseControl,
      ...(stored.releaseControl || {}),
    },
    surfaceCompression: generatedDefaults.surfaceCompression,
    explainability: {
      ...generatedDefaults.explainability,
      ...(stored.explainability || {}),
    },
    detectedProfiles: detection.profiles,
    notes: Array.isArray(stored.notes) ? stored.notes.map((entry) => String(entry).trim()).filter(Boolean) : [],
  };
}

function configWarnings(activeConfig, detection) {
  const warnings = [];
  const defaultProfile = findStartProfile(activeConfig.defaultProfile);
  if (!defaultProfile) {
    warnings.push(`Unknown defaultProfile: ${activeConfig.defaultProfile}`);
  }
  if (detection.profiles.some((entry) => entry.id === 'design-system-heavy-frontend') && !activeConfig.preferredAddOns.includes('browser')) {
    warnings.push('Frontend-heavy repos usually benefit from browser proof in preferredAddOns.');
  }
  if (detection.profiles.some((entry) => entry.id === 'monorepo-workspace') && !activeConfig.preferredAddOns.includes('parallel')) {
    warnings.push('Monorepo repos usually benefit from the parallel add-on.');
  }
  if (detection.profiles.some((entry) => entry.id === 'nextjs-app') && !(activeConfig.preferredPlanes || []).includes('release-control')) {
    warnings.push('Next.js repos usually benefit from foregrounding release-control in preferredPlanes.');
  }
  if (detection.profiles.some((entry) => entry.id === 'monorepo-workspace') && !(activeConfig.preferredPlanes || []).includes('monorepo-control')) {
    warnings.push('Monorepo repos usually benefit from foregrounding monorepo-control in preferredPlanes.');
  }
  if (detection.profiles.some((entry) => entry.id === 'monorepo-workspace') && !(activeConfig.preferredPlanes || []).includes('team-control')) {
    warnings.push('Monorepo repos usually benefit from foregrounding team-control in preferredPlanes.');
  }
  if ((activeConfig.preferredPlanes || []).length === 0) {
    warnings.push('preferredPlanes is empty, so the operating center has less guidance about which plane to foreground.');
  }
  if (activeConfig.requiredVerifications.length === 0) {
    warnings.push('requiredVerifications is empty, so trust and release planes will have less structure.');
  }
  if ((activeConfig.releaseControl?.publishStepSummary ?? true) && !activeConfig.externalExports.includes('github-actions-step-summary')) {
    warnings.push('releaseControl.publishStepSummary is on but github-actions-step-summary is missing from externalExports.');
  }
  if ((activeConfig.releaseControl?.ciGate ?? true) && !activeConfig.externalExports.includes('ci-gate')) {
    warnings.push('releaseControl.ciGate is on but ci-gate is missing from externalExports.');
  }
  if ((activeConfig.releaseControl?.issueTrackerExport ?? true) && !activeConfig.externalExports.includes('issue-tracker-json')) {
    warnings.push('releaseControl.issueTrackerExport is on but issue-tracker-json is missing from externalExports.');
  }
  if ((activeConfig.releaseControl?.uploadArtifacts ?? true) && !activeConfig.externalExports.includes('control-plane-packet-json')) {
    warnings.push('releaseControl.uploadArtifacts is on but control-plane-packet-json is missing from externalExports.');
  }
  if ((activeConfig.automation?.pullRequestPublish ?? true) && (activeConfig.releaseControl?.stickyPrComment ?? true) === false) {
    warnings.push('PR publish automation is enabled but stickyPrComment is disabled in releaseControl.');
  }
  if ((activeConfig.externalExports || []).length < 5) {
    warnings.push('externalExports is sparse, so GitHub/CI/Slack coverage may be incomplete.');
  }
  if ((detection.profiles || []).length > 7) {
    warnings.push('Repo surface is broad; keep operators on the golden-path compression layer before opening advanced packs.');
  }
  return warnings;
}

function renderRepoConfigMarkdown(payload) {
  return `# REPO CONFIG

- File: \`${payload.file.relative}\`
- Exists: \`${payload.file.exists ? 'yes' : 'no'}\`
- Default profile: \`${payload.activeConfig.defaultProfile}\`
- Trust level: \`${payload.activeConfig.trustLevel}\`
- Handoff standard: \`${payload.activeConfig.handoffStandard}\`
- Preferred bundles: \`${payload.activeConfig.preferredBundles.join(', ') || 'none'}\`
- Preferred add-ons: \`${payload.activeConfig.preferredAddOns.join(', ') || 'none'}\`
- Preferred planes: \`${payload.activeConfig.preferredPlanes.join(', ') || 'none'}\`

## Detected Profiles

${payload.detectedProfiles.length > 0
    ? payload.detectedProfiles.map((entry) => `- \`${entry.label}\` -> ${(entry.evidence || []).join(', ') || 'no evidence captured'}`).join('\n')
    : '- `No stack profiles were detected.`'}

## Stack Packs

${payload.stackPacks.length > 0
    ? payload.stackPacks.map((entry) => `- \`${entry.label}\` -> plane=${entry.preferredPlane}; bundles=${entry.bundleBias.join(', ') || 'none'}; add-ons=${entry.addOnBias.join(', ') || 'none'}`).join('\n')
    : '- `No stack packs are active.`'}

## Surface Compression

- Summary: \`${payload.activeConfig.surfaceCompression?.summary || 'none'}\`

### Golden Paths

${(payload.activeConfig.surfaceCompression?.coreFlows || []).length > 0
    ? payload.activeConfig.surfaceCompression.coreFlows.map((entry) => `- \`${entry.label}\` -> ${(entry.commands || []).join(' | ')} :: ${entry.summary}`).join('\n')
    : '- `No golden paths configured.`'}

### Optional Packs

${(payload.activeConfig.surfaceCompression?.optionalPacks || []).length > 0
    ? payload.activeConfig.surfaceCompression.optionalPacks.map((entry) => `- \`${entry.id}\` -> ${(entry.opens || []).join(', ')}`).join('\n')
    : '- `No optional packs configured.`'}

## Required Verifications

${payload.activeConfig.requiredVerifications.length > 0
    ? payload.activeConfig.requiredVerifications.map((entry) => `- \`${entry}\``).join('\n')
    : '- `No required verifications configured.`'}

## Automation Defaults

${Object.entries(payload.activeConfig.automation || {}).map(([key, value]) => `- \`${key}\`: \`${value ? 'on' : 'off'}\``).join('\n')}

## Release Control Defaults

${Object.entries(payload.activeConfig.releaseControl || {}).map(([key, value]) => `- \`${key}\`: \`${value ? 'on' : 'off'}\``).join('\n')}

## External Exports

${payload.activeConfig.externalExports.length > 0
    ? payload.activeConfig.externalExports.map((entry) => `- \`${entry}\``).join('\n')
    : '- `No external exports configured.`'}

## Explainability Defaults

${Object.entries(payload.activeConfig.explainability || {}).map(([key, value]) => `- \`${key}\`: \`${value ? 'on' : 'off'}\``).join('\n')}

## Warnings

${payload.warnings.length > 0
    ? payload.warnings.map((entry) => `- ${entry}`).join('\n')
    : '- `No repo-config warnings.`'}
`;
}


function packageOverridePath(cwd, packageId) {
  if (!packageId || packageId === '.') {
    return null;
  }
  return path.join(cwd, packageId, '.workflow', 'package-config.json');
}

function readPackageOverrides(cwd, packageGraph) {
  return (packageGraph.packages || [])
    .filter((pkg) => pkg.id !== '.')
    .map((pkg) => {
      const filePath = packageOverridePath(cwd, pkg.id);
      const config = filePath ? readJsonIfExists(filePath, null) : null;
      return config ? {
        packageId: pkg.id,
        packageName: pkg.name,
        file: relativePath(cwd, filePath),
        config,
      } : null;
    })
    .filter(Boolean);
}

function buildRepoConfigPayload(cwd, rootDir, options = {}) {
  const filePath = repoConfigPath(cwd);
  const detection = detectProfiles(cwd, rootDir);
  const existing = readJsonIfExists(filePath, null);
  const generatedDefaults = buildGeneratedDefaults(detection);
  const activeConfig = mergeActiveConfig(generatedDefaults, existing, detection);
  const stackPacks = buildStackPacks(detection, activeConfig);
  const warnings = configWarnings(activeConfig, detection);
  const packageOverrides = readPackageOverrides(cwd, detection.packageGraph);
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: relativePath(cwd, rootDir),
    file: {
      absolute: filePath,
      relative: relativePath(cwd, filePath),
      exists: fs.existsSync(filePath),
    },
    detectedProfiles: detection.profiles,
    packageGraph: {
      repoShape: detection.packageGraph.repoShape,
      packageCount: detection.packageGraph.packageCount,
      changedPackages: detection.packageGraph.changedPackages || [],
      impactedPackages: detection.packageGraph.impactedPackages || [],
      workspaceSources: detection.packageGraph.workspaceDiscovery?.sources || [],
      ecosystems: detection.packageGraph.workspaceDiscovery?.ecosystems || [],
      markers: detection.packageGraph.workspaceDiscovery?.markers || [],
      ownershipSource: detection.packageGraph.workspaceDiscovery?.ownershipSource || null,
      workspaces: detection.packageGraph.workspaceDiscovery?.workspaces || [],
      packages: (detection.packageGraph.packages || []).map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        path: pkg.path,
        ecosystem: pkg.ecosystem || 'unknown',
        manifest: pkg.manifest || null,
        owners: Array.isArray(pkg.owners) ? pkg.owners : [],
      })),
    },
    frontend: detection.frontendProfile
      ? {
        active: Boolean(detection.frontendProfile.frontendMode?.active),
        framework: detection.frontendProfile.framework?.primary || 'unknown',
        frameworks: detection.frontendProfile.framework?.detected || [],
        routing: detection.frontendProfile.routing?.detected || [],
        uiSystem: detection.frontendProfile.uiSystem?.primary || 'unknown',
        routes: Number(detection.frontendProfile.surfaceInventory?.routeCount || detection.frontendProfile.metrics?.routeCount || 0),
        webRoutes: Number(detection.frontendProfile.surfaceInventory?.webRouteCount || 0),
        mobileRoutes: Number(detection.frontendProfile.surfaceInventory?.mobileRouteCount || 0),
        surfaceKinds: detection.frontendProfile.surfaceInventory?.surfaceKinds || [],
        surfaceRoots: detection.frontendProfile.surfaceInventory?.surfaceRoots || [],
        sharedComponents: Number(detection.frontendProfile.surfaceInventory?.sharedComponentCount || detection.frontendProfile.metrics?.sharedComponentCount || 0),
        localComponents: Number(detection.frontendProfile.surfaceInventory?.localComponentCount || detection.frontendProfile.metrics?.localComponentCount || 0),
      }
      : null,
    api: detection.apiSurface
      ? {
        endpointCount: Number(detection.apiSurface.endpointCount || 0),
        middlewareCount: Number(detection.apiSurface.middlewareCount || 0),
        frameworks: detection.apiSurface.frameworks || [],
        authSignals: detection.apiSurface.authSignals || [],
        dataStores: detection.apiSurface.dataStores || [],
        packages: (detection.apiSurface.packages || []).map((entry) => ({
          packagePath: entry.packagePath,
          packageName: entry.packageName,
          endpointCount: entry.endpointCount,
          frameworks: entry.frameworks,
        })),
      }
      : null,
    generatedDefaults,
    activeConfig,
    packageOverrides,
    stackPacks,
    warnings,
  };

  if (options.writeSnapshot !== false) {
    payload.artifacts = {
      runtimeJson: relativePath(cwd, writeRuntimeJson(cwd, 'repo-config.json', payload)),
      runtimeMarkdown: relativePath(cwd, writeRuntimeMarkdown(cwd, 'repo-config.md', renderRepoConfigMarkdown(payload))),
    };
  }

  return payload;
}

function ensureRepoConfig(cwd, rootDir, options = {}) {
  const payload = buildRepoConfigPayload(cwd, rootDir, options);
  const shouldWrite = Boolean(options.write) || Boolean(options.refresh) || (!payload.file.exists && Boolean(options.writeIfMissing));
  if (shouldWrite) {
    const output = {
      ...payload.activeConfig,
      generatedAt: payload.generatedAt,
      generatedDefaults: payload.generatedDefaults,
      stackPacks: payload.stackPacks,
    };
    writeJsonFile(repoConfigPath(cwd), output);
    payload.file.exists = true;
    payload.written = true;
  } else {
    payload.written = false;
  }
  return payload;
}

function summarizeRepoConfig(payload) {
  return {
    path: payload.file.relative,
    exists: payload.file.exists,
    defaultProfile: payload.activeConfig.defaultProfile,
    trustLevel: payload.activeConfig.trustLevel,
    preferredBundles: payload.activeConfig.preferredBundles,
    preferredAddOns: payload.activeConfig.preferredAddOns,
    preferredPlanes: payload.activeConfig.preferredPlanes,
    requiredVerifications: payload.activeConfig.requiredVerifications,
    handoffStandard: payload.activeConfig.handoffStandard,
    automation: payload.activeConfig.automation,
    releaseControl: payload.activeConfig.releaseControl,
    surfaceCompression: payload.activeConfig.surfaceCompression,
    externalExports: payload.activeConfig.externalExports,
    explainability: payload.activeConfig.explainability,
    detectedProfiles: payload.detectedProfiles.map((entry) => entry.id),
    stackPacks: payload.stackPacks.map((entry) => ({
      id: entry.id,
      preferredPlane: entry.preferredPlane,
      preferredPlanes: entry.preferredPlanes.map((plane) => plane.id),
      bundleBias: entry.bundleBias,
      addOnBias: entry.addOnBias,
    })),
  };
}

function printHelp() {
  console.log(`
repo-config

Usage:
  node scripts/workflow/repo_config.js [--write] [--refresh] [--json]

Options:
  --root <path>      Workflow root. Defaults to active workstream root
  --write            Write .workflow/repo-config.json if missing
  --refresh          Recompute and rewrite the repo config snapshot
  --json             Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = ensureRepoConfig(cwd, rootDir, {
    write: Boolean(args.write),
    refresh: Boolean(args.refresh),
    writeIfMissing: Boolean(args.write),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# REPO CONFIG\n');
  console.log(`- File: \`${payload.file.relative}\``);
  console.log(`- Exists: \`${payload.file.exists ? 'yes' : 'no'}\``);
  console.log(`- Written: \`${payload.written ? 'yes' : 'no'}\``);
  console.log(`- Default profile: \`${payload.activeConfig.defaultProfile}\``);
  console.log(`- Trust level: \`${payload.activeConfig.trustLevel}\``);
  console.log(`- Preferred bundles: \`${payload.activeConfig.preferredBundles.join(', ') || 'none'}\``);
  console.log(`- Preferred add-ons: \`${payload.activeConfig.preferredAddOns.join(', ') || 'none'}\``);
  console.log(`- Preferred planes: \`${payload.activeConfig.preferredPlanes.join(', ') || 'none'}\``);
  console.log(`- Handoff standard: \`${payload.activeConfig.handoffStandard}\``);
  console.log(`- Compression: \`${payload.activeConfig.surfaceCompression?.summary || 'none'}\``);
  if (payload.detectedProfiles.length > 0) {
    console.log('\n## Detected Profiles\n');
    for (const profile of payload.detectedProfiles) {
      console.log(`- \`${profile.label}\` -> ${(profile.evidence || []).join(', ') || 'no evidence captured'}`);
    }
  }
  if (payload.stackPacks.length > 0) {
    console.log('\n## Stack Packs\n');
    for (const pack of payload.stackPacks) {
      console.log(`- \`${pack.label}\` -> plane=${pack.preferredPlane}; bundles=${pack.bundleBias.join(', ') || 'none'}; add-ons=${pack.addOnBias.join(', ') || 'none'}`);
    }
  }
  if (payload.warnings.length > 0) {
    console.log('\n## Warnings\n');
    for (const warning of payload.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildRepoConfigPayload,
  ensureRepoConfig,
  readRepoConfig: (cwd) => readJsonIfExists(repoConfigPath(cwd), null),
  repoConfigPath,
  summarizeRepoConfig,
};
