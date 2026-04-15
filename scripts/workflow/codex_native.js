const fs = require('node:fs');
const path = require('node:path');
const { readJsonIfExists } = require('./io/json');
const { resolveWorkflowRoot } = require('./common');
const { ensureDir } = require('./io/files');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { deriveRepoRoles, relativePath, writeJsonFile } = require('./roadmap_os');


function trustCenterPaths(cwd) {
  return [
    path.join(cwd, '.workflow', 'runtime', 'trust-center.json'),
    path.join(cwd, '.workflow', 'reports', 'trust-center.json'),
  ];
}

function loadTrustCenter(cwd) {
  for (const filePath of trustCenterPaths(cwd)) {
    const payload = readJsonIfExists(filePath, null);
    if (payload) {
      return { payload, filePath };
    }
  }
  return {
    payload: null,
    filePath: null,
  };
}

function normalizeString(value, fallback = '') {
  const normalized = String(value || fallback).trim();
  return normalized || fallback;
}

function normalizeLower(value, fallback = '') {
  return normalizeString(value, fallback).toLowerCase();
}

function detectRepoSignals(cwd, repoConfigPayload) {
  const detectedProfiles = new Set((repoConfigPayload.detectedProfiles || []).map((entry) => normalizeLower(entry.id || entry)));
  const packageGraph = repoConfigPayload.packageGraph || {};
  const rawEcosystems = packageGraph.ecosystems || packageGraph.workspaceDiscovery?.ecosystems || [];
  const ecosystems = [...new Set((Array.isArray(rawEcosystems)
    ? rawEcosystems
    : typeof rawEcosystems === 'object' && rawEcosystems
      ? Object.entries(rawEcosystems).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
      : [])
    .map((entry) => normalizeLower(entry))
    .filter(Boolean))];
  const mobile = Number(repoConfigPayload.frontend?.mobileRoutes || 0) > 0
    || detectedProfiles.has('expo-react-native');
  const frontend = Boolean(repoConfigPayload.frontend?.active)
    || Number(repoConfigPayload.frontend?.routes || 0) > 0
    || detectedProfiles.has('nextjs-app')
    || detectedProfiles.has('design-system-heavy-frontend')
    || mobile;
  const api = Number(repoConfigPayload.api?.endpointCount || 0) > 0
    || detectedProfiles.has('express-api')
    || detectedProfiles.has('hono-api');
  const monorepo = Number(packageGraph.packageCount || 0) > 1
    || normalizeLower(packageGraph.repoShape).includes('monorepo')
    || detectedProfiles.has('monorepo-workspace')
    || detectedProfiles.has('polyglot-monorepo')
    || detectedProfiles.has('nx-workspace')
    || detectedProfiles.has('turbo-workspace');
  const docsHeavy = fs.existsSync(path.join(cwd, 'docs'));
  return {
    frontend,
    mobile,
    api,
    monorepo,
    docsHeavy,
    ecosystems,
    packageCount: Number(packageGraph.packageCount || 0),
    apiEndpointCount: Number(repoConfigPayload.api?.endpointCount || 0),
    changedPackages: Array.isArray(packageGraph.changedPackages) ? [...packageGraph.changedPackages] : [],
    impactedPackages: Array.isArray(packageGraph.impactedPackages) ? [...packageGraph.impactedPackages] : [],
    workspaceRoots: (packageGraph.workspaces || packageGraph.workspaceDiscovery?.workspaces || [])
      .map((entry) => normalizeString(entry?.root || entry?.id || entry?.path || ''))
      .filter(Boolean),
    surfaceRoots: (repoConfigPayload.frontend?.surfaceRoots || []).map((entry) => normalizeString(entry)).filter(Boolean),
    apiRoots: (repoConfigPayload.api?.packages || []).map((entry) => normalizeString(entry.packagePath || entry.path || '')).filter(Boolean),
  };
}

function highestRiskLevel(trustLevel, riskLevel) {
  const scale = ['low', 'medium', 'high', 'critical'];
  const trustToRisk = trustLevel === 'strict'
    ? 'high'
    : trustLevel === 'elevated'
      ? 'medium'
      : 'low';
  const candidates = [trustToRisk, normalizeLower(riskLevel, 'low')].filter(Boolean);
  return candidates.sort((left, right) => scale.indexOf(left) - scale.indexOf(right)).pop() || 'low';
}

function extractGoalText(options = {}) {
  return [...new Set([
    options.goal,
    options.task,
    options.prompt,
    options.intent,
    options.query,
  ].map((value) => normalizeString(value)).filter(Boolean))].join(' | ');
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function deriveTaskSignals(goalText, repoConfigPayload, repoSignals) {
  const text = normalizeLower(goalText);
  const changedPackages = (repoConfigPayload.packageGraph?.changedPackages || []).map((entry) => normalizeString(entry)).filter(Boolean);
  const impactedPackages = (repoConfigPayload.packageGraph?.impactedPackages || []).map((entry) => normalizeString(entry)).filter(Boolean);
  const workspaceRoots = (repoConfigPayload.packageGraph?.workspaces || repoConfigPayload.packageGraph?.workspaceDiscovery?.workspaces || [])
    .map((entry) => normalizeString(entry?.root || entry?.id || entry?.path || ''))
    .filter(Boolean);
  const touchedPackageCount = new Set([...changedPackages, ...impactedPackages]).size;
  const mobileTask = matchesAny(text, [
    /\b(expo|react native|mobile|screen|ios|android|gesture|tab bar|bottom sheet|simulator)\b/,
  ]);
  const backendTask = matchesAny(text, [
    /\b(api|backend|server|route|routes|endpoint|endpoints|hono|middleware|firestore|redis|upstash|jwt|repository pattern|auth flow|contract)\b/,
  ]);
  const frontendTask = mobileTask || matchesAny(text, [
    /\b(frontend|ui|page|component|css|responsive|preview|browser|visual|design system|design|accessibility|journey|screenshot)\b/,
  ]);
  const monorepoTask = matchesAny(text, [
    /\b(monorepo|workspace|workspaces|packages?|repo-wide|cross-package|cross repo|dependency graph|graph|ownership|affected|bazel|nx|turbo|cargo workspace|go work|gradle|maven)\b/,
  ]) || touchedPackageCount > 1 || repoSignals.ecosystems.length > 1;
  const releaseTask = matchesAny(text, [
    /\b(release|ship|publish|deploy|tag|version|changelog|handoff|closeout|cut release)\b/,
  ]);
  const verifyTask = matchesAny(text, [
    /\b(verify|verification|test|tests|lint|typecheck|proof|assert|check|smoke|regression|validate)\b/,
  ]);
  const browserProof = !mobileTask && matchesAny(text, [
    /\b(browser|preview|visual|screenshot|playwright|journey|responsive|accessibility)\b/,
  ]);
  const docsTask = matchesAny(text, [
    /\b(doc|docs|readme|guide|architecture|explain|adr)\b/,
  ]);
  const repoWideEdit = matchesAny(text, [
    /\b(repo-wide|entire repo|whole repo|all packages|global sweep|mass update|codemod|rename everywhere)\b/,
  ]);
  const riskTask = backendTask || matchesAny(text, [
    /\b(auth|payment|billing|permission|security|migration|schema|ci|release|publish|deploy)\b/,
  ]);
  const wantsNetwork = browserProof || matchesAny(text, [
    /\b(preview|browser|deploy|publish|registry|http|https|download|install)\b/,
  ]);
  return {
    goalText,
    changedPackages,
    impactedPackages,
    workspaceRoots,
    touchedPackageCount,
    frontendTask,
    mobileTask,
    backendTask,
    monorepoTask,
    releaseTask,
    verifyTask,
    browserProof,
    docsTask,
    repoWideEdit,
    riskTask,
    wantsNetwork,
    packageAware: changedPackages.length > 0 || impactedPackages.length > 0 || monorepoTask || backendTask,
  };
}

function scoreProfiles(repoSignals, taskSignals, strictMode) {
  const scores = {
    'raiola-balanced': 1,
    'raiola-strict': strictMode ? 4 : 0,
    'raiola-frontend': repoSignals.frontend ? 1 : 0,
    'raiola-monorepo': repoSignals.monorepo ? 2 : 0,
  };

  if (taskSignals.frontendTask) {
    scores['raiola-frontend'] += 4;
  }
  if (taskSignals.mobileTask) {
    scores['raiola-frontend'] += 3;
  }
  if (taskSignals.browserProof) {
    scores['raiola-frontend'] += 3;
  }
  if (taskSignals.backendTask && repoSignals.monorepo) {
    scores['raiola-monorepo'] += 2;
  }
  if (taskSignals.monorepoTask) {
    scores['raiola-monorepo'] += 4;
  }
  if (taskSignals.packageAware && repoSignals.monorepo) {
    scores['raiola-monorepo'] += 2;
  }
  if (taskSignals.releaseTask) {
    scores['raiola-strict'] += 3;
  }
  if (taskSignals.riskTask) {
    scores['raiola-strict'] += 2;
  }
  if (taskSignals.repoWideEdit) {
    scores['raiola-strict'] += 2;
    scores['raiola-monorepo'] += 1;
  }
  if (taskSignals.docsTask && !taskSignals.releaseTask && !taskSignals.riskTask) {
    scores['raiola-balanced'] += 2;
  }
  if (taskSignals.touchedPackageCount > 1) {
    scores['raiola-monorepo'] += 2;
  }
  if (repoSignals.mobile && taskSignals.mobileTask && repoSignals.monorepo) {
    scores['raiola-monorepo'] += 1;
  }
  return scores;
}

function selectProfile(scores) {
  const priority = ['raiola-strict', 'raiola-monorepo', 'raiola-frontend', 'raiola-balanced'];
  return Object.entries(scores)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return priority.indexOf(left[0]) - priority.indexOf(right[0]);
    })[0]?.[0] || 'raiola-balanced';
}

function existingRepoPaths(cwd, candidates = []) {
  return [...new Set(candidates
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .filter((entry) => entry === '.' || fs.existsSync(path.join(cwd, entry))))];
}

function fixtureLikeRoot(root) {
  return /^(tests\/fixtures|tests\/corpus|proofs|fixtures|corpus)\//.test(normalizeString(root));
}

function sourceRepoFallbackRoots(cwd) {
  return existingRepoPaths(cwd, [
    'scripts',
    'tests',
    'docs',
    '.codex',
    '.claude',
    'bin',
    'skills',
    'templates',
    'agents',
    'plugins',
    'README.md',
    'CHANGELOG.md',
    'AGENTS.md',
    'package.json',
  ]);
}

function preferredWorkspaceRoots(cwd, repoSignals, taskSignals, selectedProfile) {
  const workspaceRoots = (taskSignals.workspaceRoots || []).filter(Boolean);
  if (workspaceRoots.length === 0) {
    return [];
  }

  const goalText = normalizeLower(taskSignals.goalText);
  const fixtureTask = /\b(fixture|fixtures|corpus|proof\s*pack|proof\s*corpus|snapshot|golden|regression fixture)\b/.test(goalText);
  if (fixtureTask) {
    return workspaceRoots;
  }

  const nonFixtureRoots = workspaceRoots.filter((root) => !fixtureLikeRoot(root));
  if (nonFixtureRoots.length > 0) {
    return nonFixtureRoots;
  }

  const sourceRoots = sourceRepoFallbackRoots(cwd);
  const sourceRepoLike = sourceRoots.length > 0
    && fs.existsSync(path.join(cwd, 'package.json'))
    && fs.existsSync(path.join(cwd, 'scripts'));
  if (sourceRepoLike && (repoSignals.docsHeavy || selectedProfile === 'raiola-monorepo')) {
    return sourceRoots;
  }

  return workspaceRoots;
}

function deriveWriteBoundary(cwd, repoSignals, taskSignals, selectedProfile) {
  const roots = [];
  const push = (value) => {
    const normalized = normalizeString(value);
    if (!normalized || roots.includes(normalized)) {
      return;
    }
    roots.push(normalized);
  };

  for (const pkg of taskSignals.changedPackages) {
    if (pkg !== '.') {
      push(pkg);
    }
  }
  for (const pkg of taskSignals.impactedPackages.slice(0, 6)) {
    if (pkg !== '.') {
      push(pkg);
    }
  }
  if (roots.length === 0) {
    const fallbackRoots = preferredWorkspaceRoots(cwd, repoSignals, taskSignals, selectedProfile);
    for (const root of fallbackRoots.slice(0, selectedProfile === 'raiola-monorepo' ? 6 : 3)) {
      push(root);
    }
  }
  if (taskSignals.frontendTask || taskSignals.mobileTask) {
    for (const candidate of existingRepoPaths(cwd, [
      ...(repoSignals.surfaceRoots || []),
      'apps/web',
      'apps/mobile',
      'packages/web',
      'packages/mobile',
      'app',
      'pages',
      'components',
      'src',
      'public',
    ])) {
      push(candidate);
    }
  }
  if (taskSignals.backendTask) {
    for (const candidate of existingRepoPaths(cwd, [
      ...(repoSignals.apiRoots || []),
      'apps/api',
      'services/api',
      'packages/api',
      'api',
      'server',
      'src',
    ])) {
      push(candidate);
    }
  }
  if (taskSignals.docsTask) {
    for (const candidate of existingRepoPaths(cwd, ['docs', 'README.md', 'AGENTS.md'])) {
      push(candidate);
    }
  }
  if (taskSignals.releaseTask) {
    for (const candidate of existingRepoPaths(cwd, ['.github', 'scripts/release', 'CHANGELOG.md', 'package.json'])) {
      push(candidate);
    }
  }
  if (roots.length === 0) {
    push('.');
  }

  const mode = selectedProfile === 'raiola-monorepo'
    ? 'changed-packages-first'
    : selectedProfile === 'raiola-frontend'
      ? 'surface-bounded'
      : selectedProfile === 'raiola-strict'
        ? 'explicit-write-boundary'
        : selectedProfile === 'raiola-locked'
          ? 'read-only'
          : 'task-root';

  return {
    mode,
    roots,
    protectedRoots: ['.git', '.workflow', 'node_modules'],
    allowGeneratedWorkflowWrites: Boolean(taskSignals.verifyTask || taskSignals.releaseTask),
    repoWideChangeThreshold: repoSignals.monorepo ? 8 : 3,
  };
}

function shellCommandInRoot(root, command) {
  const normalizedRoot = normalizeString(root, '.');
  const normalizedCommand = normalizeString(command);
  if (!normalizedCommand) {
    return null;
  }
  if (!normalizedRoot || normalizedRoot === '.') {
    return normalizedCommand;
  }
  return `cd ${JSON.stringify(normalizedRoot)} && ${normalizedCommand}`;
}

function packageRowsForVerifyMatrix(repoConfigPayload = {}) {
  const packageGraph = repoConfigPayload.packageGraph || {};
  const rawPackages = Array.isArray(packageGraph.packages)
    ? packageGraph.packages
    : [];
  return rawPackages
    .map((entry) => ({
      id: normalizeString(entry.id || entry.path || ''),
      path: normalizeString(entry.path || entry.id || ''),
      name: normalizeString(entry.name || entry.id || entry.path || ''),
      ecosystem: normalizeLower(entry.ecosystem, 'unknown'),
      manifest: normalizeString(entry.manifest || ''),
      owners: Array.isArray(entry.owners) ? entry.owners.filter(Boolean) : [],
    }))
    .filter((entry) => entry.id && entry.id !== '.');
}

function genericPackageCommands(root, ecosystem, manifest) {
  const normalizedRoot = normalizeString(root, '.');
  const normalizedManifest = normalizeLower(manifest);
  switch (normalizeLower(ecosystem)) {
    case 'go':
      return ['go test ./...', 'go vet ./...'].map((command) => shellCommandInRoot(normalizedRoot, command));
    case 'rust':
      return ['cargo test', 'cargo check'].map((command) => shellCommandInRoot(normalizedRoot, command));
    case 'python':
      return ['python -m pytest', 'python -m compileall .'].map((command) => shellCommandInRoot(normalizedRoot, command));
    case 'java':
      if (normalizedManifest.includes('gradle')) {
        return ['./gradlew test'].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      return ['mvn test'].map((command) => shellCommandInRoot(normalizedRoot, command));
    case 'bazel':
      return ['bazel test //...'].map((command) => shellCommandInRoot(normalizedRoot, command));
    case 'node':
      return ['npm test', 'rai verify-work --json'].map((command) => shellCommandInRoot(normalizedRoot, command));
    default:
      if (normalizedManifest === 'go.mod') {
        return ['go test ./...', 'go vet ./...'].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      if (normalizedManifest === 'cargo.toml') {
        return ['cargo test', 'cargo check'].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      if (normalizedManifest === 'pyproject.toml' || normalizedManifest === 'requirements.txt') {
        return ['python -m pytest', 'python -m compileall .'].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      if (normalizedManifest === 'pom.xml' || normalizedManifest.includes('gradle')) {
        return [(normalizedManifest.includes('gradle') ? './gradlew test' : 'mvn test')].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      if (normalizedManifest.includes('bazel')) {
        return ['bazel test //...'].map((command) => shellCommandInRoot(normalizedRoot, command));
      }
      return [];
  }
}

function derivePackageVerifyContracts(repoConfigPayload, taskSignals) {
  const frontend = repoConfigPayload.frontend || {};
  const api = repoConfigPayload.api || {};
  const packages = packageRowsForVerifyMatrix(repoConfigPayload);
  const surfaceRoots = (frontend.surfaceRoots || []).map((entry) => normalizeString(entry)).filter(Boolean);
  const apiPackages = (api.packages || []).map((entry) => ({
    root: normalizeString(entry.packagePath || entry.path || ''),
    endpointCount: Number(entry.endpointCount || 0),
    frameworks: Array.isArray(entry.frameworks) ? entry.frameworks : [],
  })).filter((entry) => entry.root);
  const targetedRoots = [...new Set([
    ...taskSignals.changedPackages,
    ...taskSignals.impactedPackages,
    ...surfaceRoots,
    ...apiPackages.map((entry) => entry.root),
    ...taskSignals.workspaceRoots,
    ...packages.map((entry) => entry.path),
  ].map((entry) => normalizeString(entry)).filter(Boolean))].slice(0, 16);

  const packageByRoot = new Map(packages.map((entry) => [entry.path, entry]));
  const contracts = [];
  const addContract = (root, lane, commands, reason, extra = {}) => {
    const normalizedRoot = normalizeString(root);
    const normalizedCommands = [...new Set((commands || []).map((entry) => normalizeString(entry)).filter(Boolean))];
    if (!normalizedRoot || normalizedCommands.length === 0 || contracts.some((entry) => entry.root === normalizedRoot && entry.lane === lane)) {
      return;
    }
    contracts.push({
      root: normalizedRoot,
      lane,
      commands: normalizedCommands,
      reason,
      ...extra,
    });
  };

  for (const root of targetedRoots) {
    const lowerRoot = root.toLowerCase();
    const packageRow = packageByRoot.get(root) || null;
    const isSurfaceRoot = surfaceRoots.includes(root);
    const apiPackage = apiPackages.find((entry) => entry.root === root || entry.root.startsWith(`${root}/`) || root.startsWith(`${entry.root}/`));
    const mobileLike = isSurfaceRoot && Number(frontend.mobileRoutes || 0) > 0 && /(^|\/)(mobile|expo|native)/.test(lowerRoot);
    const webLike = isSurfaceRoot && Number(frontend.webRoutes || 0) > 0 && (root === '.' || /(^|\/)(web|site|frontend|app)/.test(lowerRoot)) && !mobileLike;

    if (mobileLike) {
      addContract(root, 'mobile-surface', [
        shellCommandInRoot(root, 'rai map-frontend --json'),
        shellCommandInRoot(root, 'rai verify-work --json'),
      ], 'Mobile surface root requires screen-flow-aware verification.', {
        packageName: packageRow?.name || root,
        ecosystem: packageRow?.ecosystem || 'node',
        manifest: packageRow?.manifest || 'package.json',
        owners: packageRow?.owners || [],
      });
      continue;
    }

    if (webLike) {
      addContract(root, 'web-proof', [
        shellCommandInRoot(root, 'rai map-frontend --json'),
        shellCommandInRoot(root, 'rai verify-browser --url http://localhost:3000 --json --require-proof'),
        shellCommandInRoot(root, 'rai verify-work --json'),
      ], 'Web surface root requires browser-capable proof.', {
        packageName: packageRow?.name || root,
        ecosystem: packageRow?.ecosystem || 'node',
        manifest: packageRow?.manifest || 'package.json',
        owners: packageRow?.owners || [],
      });
      continue;
    }

    if (apiPackage) {
      const commands = [
        shellCommandInRoot(root, 'rai api-surface --json'),
        shellCommandInRoot(root, 'rai verify-work --json'),
      ];
      if ((api.authSignals || []).length > 0 || (api.dataStores || []).length > 0) {
        commands.push(shellCommandInRoot(root, 'rai trust --json'));
      }
      addContract(root, 'api-contract', commands, 'API-owning package root requires route inventory and backend verification.', {
        packageName: packageRow?.name || root,
        ecosystem: packageRow?.ecosystem || 'node',
        manifest: packageRow?.manifest || 'package.json',
        owners: packageRow?.owners || [],
      });
      continue;
    }

    if (!packageRow) {
      continue;
    }

    const genericCommands = genericPackageCommands(root, packageRow.ecosystem, packageRow.manifest);
    if (genericCommands.length === 0) {
      continue;
    }

    const lane = packageRow.ecosystem === 'go'
      ? 'go-contract'
      : packageRow.ecosystem === 'rust'
        ? 'rust-contract'
        : packageRow.ecosystem === 'python'
          ? 'python-contract'
          : packageRow.ecosystem === 'java'
            ? 'java-contract'
            : packageRow.ecosystem === 'bazel'
              ? 'bazel-contract'
              : 'node-package';
    addContract(root, lane, genericCommands, `Package root requires ${packageRow.ecosystem || 'repo'}-aware verification.`, {
      packageName: packageRow.name,
      ecosystem: packageRow.ecosystem,
      manifest: packageRow.manifest,
      owners: packageRow.owners,
    });
  }

  return contracts;
}

function deriveVerifyContract(repoSummary, repoConfigPayload, taskSignals, selectedProfile, debt = {}) {
  const required = [...new Set((repoSummary.requiredVerifications || []).map((entry) => normalizeString(entry)).filter(Boolean))];
  const commands = [];
  const push = (command) => {
    if (command && !commands.includes(command)) {
      commands.push(command);
    }
  };
  for (const command of required) {
    push(command);
  }
  if (taskSignals.releaseTask) {
    push('rai doctor --json');
  }
  if (taskSignals.browserProof) {
    push('rai verify-browser --url http://localhost:3000 --json --require-proof');
  }
  if (taskSignals.backendTask && Number(repoConfigPayload.api?.endpointCount || 0) > 0) {
    push('rai api-surface --json');
  }
  const packageContracts = derivePackageVerifyContracts(repoConfigPayload, taskSignals);
  const ecosystems = [...new Set(packageContracts.map((entry) => normalizeLower(entry.ecosystem)).filter(Boolean))];
  const lanes = [...new Set(packageContracts.map((entry) => normalizeString(entry.lane)).filter(Boolean))];
  return {
    mode: selectedProfile === 'raiola-monorepo'
      ? 'package-contract-first'
      : taskSignals.browserProof
        ? 'browser-proof-preferred'
        : taskSignals.backendTask
          ? 'api-contract-preferred'
          : 'targeted',
    requiredCommands: commands.slice(0, 16),
    packageFirst: selectedProfile === 'raiola-monorepo' || taskSignals.packageAware,
    browserProofPreferred: Boolean(taskSignals.browserProof),
    explicitDegradeOnFallback: true,
    capabilityDegradeMustBeVisible: true,
    packageContracts,
    packageVerificationMatrix: packageContracts.map((entry) => ({
      root: entry.root,
      packageName: entry.packageName || entry.root,
      lane: entry.lane,
      ecosystem: entry.ecosystem || 'unknown',
      manifest: entry.manifest || null,
      owners: entry.owners || [],
      commands: entry.commands,
    })),
    matrixSummary: {
      packageCount: packageContracts.length,
      ecosystems,
      lanes,
    },
    verificationDebt: {
      verificationGaps: Number(debt.verificationGaps || 0),
      planReadinessGaps: Number(debt.planReadinessGaps || 0),
      missingEvidence: Number(debt.missingEvidence || 0),
    },
  };
}

function deriveSelectionRationale(repoSignals, taskSignals, selectedProfile, strictMode, locked) {
  const reasons = [];
  if (locked) {
    reasons.push('Trust Center blocked execution, so the locked profile overrides all task signals.');
    return reasons;
  }
  if (taskSignals.monorepoTask) {
    reasons.push('Task mentions monorepo/package graph concerns, so package-aware routing is foregrounded.');
  }
  if (taskSignals.frontendTask) {
    reasons.push(taskSignals.mobileTask
      ? 'Task mentions mobile/frontend concerns, so screen-flow-aware UI surfaces stay visible.'
      : 'Task mentions frontend/browser concerns, so browser proof and UI surfaces stay visible.');
  }
  if (taskSignals.backendTask) {
    reasons.push('Task mentions backend/API concerns, so route inventory and verification contracts stay explicit.');
  }
  if (taskSignals.releaseTask || taskSignals.riskTask) {
    reasons.push('Release or high-risk signals raise the trust bar and tighten approvals/verification.');
  }
  if (taskSignals.touchedPackageCount > 0) {
    reasons.push(`Changed or impacted package count -> ${taskSignals.touchedPackageCount}.`);
  }
  reasons.push(`Selected ${selectedProfile} for repo frontend=${repoSignals.frontend ? 'yes' : 'no'} monorepo=${repoSignals.monorepo ? 'yes' : 'no'}.`);
  if (strictMode && selectedProfile !== 'raiola-strict') {
    reasons.push('Strict posture is active, but task signals still preferred a more specific session shape; hooks remain strict.');
  }
  return reasons;
}

function deriveNativePolicy(cwd, options = {}) {
  const workflowRoot = resolveWorkflowRoot(cwd, options.root);
  const repoConfigPayload = ensureRepoConfig(cwd, workflowRoot, {
    write: false,
    refresh: false,
    writeIfMissing: false,
    writeSnapshot: false,
  });
  const trustCenter = loadTrustCenter(cwd);
  const trustPayload = trustCenter.payload || null;
  const repoSummary = summarizeRepoConfig(repoConfigPayload);
  const signals = detectRepoSignals(cwd, repoConfigPayload);
  const trustLevel = normalizeLower(repoSummary.trustLevel, 'standard');
  const riskLevel = highestRiskLevel(trustLevel, trustPayload?.risk?.level || 'low');
  const pendingApprovals = Number(trustPayload?.governance?.pendingApprovalCount || 0);
  const verificationGaps = Number(trustPayload?.governance?.verificationGapCount || 0);
  const planReadinessGaps = Number(trustPayload?.governance?.planReadinessGapCount || 0);
  const missingEvidence = Number(trustPayload?.governance?.missingEvidenceCount || 0);
  const trustVerdict = normalizeLower(trustPayload?.verdict || 'ready');
  const startDecision = normalizeLower(trustPayload?.decisions?.start || 'ready');
  const mergeDecision = normalizeLower(trustPayload?.decisions?.merge || 'ready');
  const shipDecision = normalizeLower(trustPayload?.decisions?.ship || 'ready');
  const locked = trustVerdict === 'hold'
    || ['blocked', 'no'].includes(startDecision)
    || ['blocked', 'no'].includes(mergeDecision)
    || ['blocked', 'no'].includes(shipDecision);
  const strictBase = !locked && (
    trustLevel === 'strict'
    || ['high', 'critical'].includes(riskLevel)
    || pendingApprovals > 0
    || verificationGaps > 0
    || missingEvidence > 0
  );

  const goalText = extractGoalText(options);
  const taskSignals = deriveTaskSignals(goalText, repoConfigPayload, signals);
  const strict = strictBase || taskSignals.releaseTask || taskSignals.riskTask;

  const profileBehaviors = {
    'raiola-balanced': {
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
      networkAccess: false,
      reasoningEffort: 'medium',
      agentsMaxThreads: signals.monorepo ? 5 : 4,
      agentsMaxDepth: 1,
      writeScopeMode: 'task-root',
      verifyMode: 'targeted',
    },
    'raiola-strict': {
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
      networkAccess: false,
      reasoningEffort: 'high',
      agentsMaxThreads: signals.monorepo ? 5 : 4,
      agentsMaxDepth: signals.monorepo ? 2 : 1,
      writeScopeMode: 'explicit-write-boundary',
      verifyMode: 'contract-required',
    },
    'raiola-frontend': {
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
      networkAccess: Boolean(taskSignals.wantsNetwork || taskSignals.browserProof),
      reasoningEffort: 'high',
      agentsMaxThreads: 5,
      agentsMaxDepth: 1,
      writeScopeMode: 'surface-bounded',
      verifyMode: 'browser-proof-preferred',
    },
    'raiola-monorepo': {
      approvalPolicy: 'on-request',
      sandboxMode: 'workspace-write',
      networkAccess: false,
      reasoningEffort: 'high',
      agentsMaxThreads: 8,
      agentsMaxDepth: 2,
      writeScopeMode: 'changed-packages-first',
      verifyMode: 'package-contract-first',
    },
    'raiola-locked': {
      approvalPolicy: 'untrusted',
      sandboxMode: 'read-only',
      networkAccess: false,
      reasoningEffort: 'medium',
      agentsMaxThreads: 4,
      agentsMaxDepth: 1,
      writeScopeMode: 'read-only',
      verifyMode: 'read-only-review',
    },
  };

  let selectedProfile = 'raiola-balanced';
  if (locked) {
    selectedProfile = 'raiola-locked';
  } else {
    selectedProfile = selectProfile(scoreProfiles(signals, taskSignals, strict));
  }

  const behavior = profileBehaviors[selectedProfile];
  const writeBoundary = deriveWriteBoundary(cwd, signals, taskSignals, selectedProfile);
  const verifyContract = deriveVerifyContract(repoSummary, repoConfigPayload, taskSignals, selectedProfile, {
    verificationGaps,
    planReadinessGaps,
    missingEvidence,
  });
  const selectionRationale = deriveSelectionRationale(signals, taskSignals, selectedProfile, strict, locked);

  const profileSummaries = Object.fromEntries(Object.entries(profileBehaviors).map(([profileName, profileBehavior]) => ([
    profileName,
    {
      approval_policy: profileBehavior.approvalPolicy,
      sandbox_mode: profileBehavior.sandboxMode,
      model_reasoning_effort: profileBehavior.reasoningEffort,
      web_search: 'cached',
      network_access: Boolean(profileBehavior.networkAccess),
      agents_max_threads: Number(profileBehavior.agentsMaxThreads || 0),
      agents_max_depth: Number(profileBehavior.agentsMaxDepth || 0),
      write_scope_mode: profileBehavior.writeScopeMode,
      verify_mode: profileBehavior.verifyMode,
      explicit_write_boundary_required: profileName === 'raiola-strict' || profileName === 'raiola-monorepo',
      package_first: profileName === 'raiola-monorepo',
      browser_proof_preferred: profileName === 'raiola-frontend',
    },
  ])));

  return {
    generatedAt: new Date().toISOString(),
    repoRoot: '.',
    workflowRoot: relativePath(cwd, workflowRoot),
    repoConfig: repoSummary,
    repoSignals: signals,
    taskSignals,
    trustCenter: trustPayload
      ? {
        file: trustCenter.filePath ? relativePath(cwd, trustCenter.filePath) : null,
        verdict: trustPayload.verdict,
        riskLevel: trustPayload.risk?.level || 'unknown',
        decisions: trustPayload.decisions || {},
        governance: trustPayload.governance || {},
      }
      : null,
    selectedProfile,
    approvalPolicy: behavior.approvalPolicy,
    sandboxMode: behavior.sandboxMode,
    networkAccess: behavior.networkAccess,
    reasoningEffort: behavior.reasoningEffort,
    agentsMaxThreads: behavior.agentsMaxThreads,
    agentsMaxDepth: behavior.agentsMaxDepth,
    locked,
    strict,
    riskLevel,
    pendingApprovals,
    verificationGaps,
    planReadinessGaps,
    missingEvidence,
    selectionRationale,
    profileBehavior: {
      name: selectedProfile,
      writeScopeMode: behavior.writeScopeMode,
      verifyMode: behavior.verifyMode,
      networkAccess: Boolean(behavior.networkAccess),
      agentsMaxThreads: Number(behavior.agentsMaxThreads || 0),
      agentsMaxDepth: Number(behavior.agentsMaxDepth || 0),
      recommendedSubagents: selectedProfile === 'raiola-monorepo'
        ? ['monorepo_planner', 'reviewer']
        : selectedProfile === 'raiola-frontend'
          ? ['docs_researcher', 'reviewer']
          : selectedProfile === 'raiola-strict'
            ? ['reviewer']
            : ['pr_explorer'],
    },
    writeBoundary,
    verifyContract,
    commandPolicy: {
      protectedPaths: writeBoundary.protectedRoots,
      repoWideChangeThreshold: writeBoundary.repoWideChangeThreshold,
      releaseScriptFamilies: ['release', 'publish', 'deploy', 'workflow', 'changeset'],
      explicitWriteBoundaryRequired: selectedProfile === 'raiola-strict' || selectedProfile === 'raiola-monorepo',
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
      capabilityDegradeMustBeExplicit: true,
      ciWorkflowRiskEscalation: true,
      waveWriteRootThreshold: signals.monorepo ? Math.min(4, writeBoundary.repoWideChangeThreshold) : 2,
      commandDenylist: [
        'npm publish',
        'pnpm publish',
        'yarn npm publish',
        'gh release',
        'git push --tags',
      ],
      commandAllowlist: [
        'npm test',
        'pnpm test',
        'yarn test',
        'node --test',
        'rai verify-work --json',
      ],
    },
    profileSummaries,
    roles: deriveRepoRoles(cwd),
  };
}

function tomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => tomlValue(entry)).join(', ')}]`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(String(value ?? ''));
}

function renderSection(name, entries = {}) {
  const lines = [`[${name}]`];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  return lines.join('\n');
}

const DEFAULT_CODEX_HOOKS_ENABLED = false;

function existingHooksRegistrationPresent(cwd) {
  return fs.existsSync(path.join(cwd, '.codex', 'hooks.json'));
}

function existingConfigHooksEnabled(cwd) {
  const filePath = path.join(cwd, '.codex', 'config.toml');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  if (/^codex_hooks\s*=\s*true/m.test(text)) {
    return true;
  }
  if (/^codex_hooks\s*=\s*false/m.test(text)) {
    return false;
  }
  return null;
}

function resolveCodexHooksEnabled(cwd, options = {}) {
  if (options.hooksEnabled != null) {
    return Boolean(options.hooksEnabled);
  }
  if (options.enableHooks != null || options['enable-hooks'] != null) {
    return Boolean(options.enableHooks || options['enable-hooks']);
  }
  if (options.disableHooks != null || options['disable-hooks'] != null) {
    return !(options.disableHooks || options['disable-hooks']);
  }
  if (existingHooksRegistrationPresent(cwd)) {
    return true;
  }
  const existing = existingConfigHooksEnabled(cwd);
  return existing == null ? DEFAULT_CODEX_HOOKS_ENABLED : existing;
}

function buildConfigSpec(cwd, options = {}) {
  const policy = deriveNativePolicy(cwd, options);
  const hooksEnabled = resolveCodexHooksEnabled(cwd, options);
  return {
    generatedAt: policy.generatedAt,
    policy,
    topLevel: {
      model: 'gpt-5.4',
      model_reasoning_effort: policy.reasoningEffort,
      approval_policy: policy.approvalPolicy,
      sandbox_mode: policy.sandboxMode,
      web_search: 'cached',
      profile: policy.selectedProfile,
      project_root_markers: ['.git', '.codex', 'package.json', 'pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'Cargo.toml', 'go.work', 'pyproject.toml', 'pom.xml', 'settings.gradle', 'WORKSPACE', 'MODULE.bazel'],
    },
    sandboxWorkspaceWrite: {
      network_access: policy.networkAccess,
    },
    features: {
      codex_hooks: hooksEnabled,
    },
    agents: {
      max_threads: policy.agentsMaxThreads,
      max_depth: policy.agentsMaxDepth,
    },
    profiles: policy.profileSummaries,
    mcpServers: {
      openaiDeveloperDocs: {
        url: 'https://developers.openai.com/mcp',
      },
      raiolaWorkflowState: {
        command: 'node',
        args: ['scripts/workflow/mcp_server.js', '--server', 'workflow-state', '--repo', '.'],
        cwd: '.',
      },
      raiolaPolicy: {
        command: 'node',
        args: ['scripts/workflow/mcp_server.js', '--server', 'policy', '--repo', '.'],
        cwd: '.',
      },
      raiolaThreadMemory: {
        command: 'node',
        args: ['scripts/workflow/mcp_server.js', '--server', 'thread-memory', '--repo', '.'],
        cwd: '.',
      },
    },
  };
}

function renderConfigToml(spec) {
  const lines = [
    '#:schema https://developers.openai.com/codex/config-schema.json',
    '# Generated by rai codex setup',
    '# Repo-local Codex defaults for Raiola.',
  ];

  for (const [key, value] of Object.entries(spec.topLevel)) {
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  lines.push('');
  lines.push(renderSection('sandbox_workspace_write', spec.sandboxWorkspaceWrite));
  lines.push('');
  lines.push(renderSection('features', spec.features));
  lines.push('');
  lines.push(renderSection('agents', spec.agents));

  for (const [profileName, profileValues] of Object.entries(spec.profiles)) {
    lines.push('');
    lines.push(renderSection(`profiles.${profileName}`, profileValues));
  }

  for (const [serverName, serverValues] of Object.entries(spec.mcpServers)) {
    lines.push('');
    lines.push(renderSection(`mcp_servers.${serverName}`, serverValues));
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function resolveHookScriptPath(scriptName) {
  const escapedScript = String(scriptName).replace(/"/g, '\\"');
  const shell = `root="$PWD"; while [ ! -f "$root/.codex/hooks/${escapedScript}" ] && [ "$root" != "/" ]; do root=$(dirname "$root"); done; node "$root/.codex/hooks/${escapedScript}"`;
  return `bash -lc ${JSON.stringify(shell)}`;
}

function hookConfigObject() {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume',
          hooks: [
            {
              type: 'command',
              command: resolveHookScriptPath('session_start.js'),
              statusMessage: 'Loading Raiola session context',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: resolveHookScriptPath('pre_tool_use_policy.js'),
              statusMessage: 'Checking Raiola command policy',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: resolveHookScriptPath('post_tool_use_review.js'),
              statusMessage: 'Reviewing Raiola command output',
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: resolveHookScriptPath('user_prompt_submit.js'),
              statusMessage: 'Applying Raiola prompt guardrails',
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: resolveHookScriptPath('stop_continue.js'),
              timeout: 20,
              statusMessage: 'Checking Raiola stop conditions',
            },
          ],
        },
      ],
    },
  };
}

function commonHookScript() {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    '',
    'function readStdin(handler) {',
    '  const chunks = [];',
    "  process.stdin.on('data', (chunk) => chunks.push(chunk));",
    "  process.stdin.on('end', () => {",
    "    const raw = Buffer.concat(chunks).toString('utf8').trim();",
    '    if (!raw) {',
    '      finish({}, handler);',
    '      return;',
    '    }',
    '    try {',
    '      finish(JSON.parse(raw), handler);',
    '    } catch {',
    '      finish({ raw }, handler);',
    '    }',
    '  });',
    '  if (process.stdin.isTTY) {',
    '    finish({}, handler);',
    '  }',
    '}',
    '',
    'let finished = false;',
    'function finish(payload, handler) {',
    '  if (finished) {',
    '    return;',
    '  }',
    '  finished = true;',
    "  const targetHandler = typeof handler === 'function' ? handler : module.exports.__handler;",
    '  if (targetHandler) {',
    '    Promise.resolve(targetHandler(payload)).catch((error) => {',
    '      process.stderr.write(String(error && error.message ? error.message : error));',
    '      process.exitCode = 1;',
    '    });',
    '  }',
    '}',
    '',
    'function findRepoRoot(startDir) {',
    '  let current = path.resolve(startDir || process.cwd());',
    '  while (true) {',
    "    if (fs.existsSync(path.join(current, '.codex')) || fs.existsSync(path.join(current, 'package.json'))) {",
    '      return current;',
    '    }',
    '    const parent = path.dirname(current);',
    '    if (parent === current) {',
    '      return path.resolve(startDir || process.cwd());',
    '    }',
    '    current = parent;',
    '  }',
    '}',
    '',
    'function readJsonIfExists(filePath, fallback = null) {',
    '  if (!fs.existsSync(filePath)) {',
    '    return fallback;',
    '  }',
    '  try {',
    "    return JSON.parse(fs.readFileSync(filePath, 'utf8'));",
    '  } catch {',
    '    return fallback;',
    '  }',
    '}',
    '',
    'function loadPolicy(rootDir) {',
    "  return readJsonIfExists(path.join(rootDir, '.codex', 'raiola-policy.json'), {",
    "    selectedProfile: 'raiola-balanced',",
    "    approvalPolicy: 'on-request',",
    "    sandboxMode: 'workspace-write',",
    '    networkAccess: false,',
    '    locked: false,',
    '    strict: false,',
    "    repoSignals: { frontend: false, monorepo: false },",
    "    repoConfig: { trustLevel: 'standard' },",
    '    verificationGaps: 0,',
    '    pendingApprovals: 0,',
    '    missingEvidence: 0,',
    '  });',
    '}',
    '',
    'function runtimeDir(rootDir) {',
    "  return path.join(rootDir, '.workflow', 'runtime', 'codex-control');",
    '}',
    '',
    'function telemetryDir(rootDir) {',
    "  return path.join(runtimeDir(rootDir), 'telemetry');",
    '}',
    '',
    'function ensureDir(dirPath) {',
    '  fs.mkdirSync(dirPath, { recursive: true });',
    '}',
    '',
    'function truncateText(value, max = 220) {',
    "  const text = String(value ?? '');",
    "  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;",
    '}',
    '',
    'function loadLatestOperator(rootDir) {',
    "  return readJsonIfExists(path.join(runtimeDir(rootDir), 'cockpit', 'manifest.json'))",
    "    || readJsonIfExists(path.join(runtimeDir(rootDir), 'operator.json'))",
    '    || null;',
    '}',
    '',
    'function findClosestAgents(startDir, rootDir) {',
    '  let current = path.resolve(startDir || process.cwd());',
    '  const stopDir = path.resolve(rootDir || findRepoRoot(current));',
    '  while (current.startsWith(stopDir)) {',
    "    const candidate = path.join(current, 'AGENTS.md');",
    '    if (fs.existsSync(candidate)) {',
    "      return path.relative(stopDir, candidate).replace(/\\\\/g, '/');",
    '    }',
    '    if (current === stopDir) {',
    '      break;',
    '    }',
    '    current = path.dirname(current);',
    '  }',
    "  const repoRootCandidate = path.join(stopDir, 'AGENTS.md');",
    "  return fs.existsSync(repoRootCandidate) ? 'AGENTS.md' : null;",
    '}',
    '',
    'function printJson(payload) {',
    "  process.stdout.write(JSON.stringify(payload) + '\\n');",
    '}',
    '',
    'function dangerousCommand(command) {',
    "  const text = String(command || '');",
    "  return /(rm\\s+-rf\\s+\\/|rm\\s+-rf\\s+\\.|git\\s+reset\\s+--hard|git\\s+clean\\s+-fd|:\\s*>\\s*\\/dev\\/sda|mkfs\\.|dd\\s+if=|shutdown\\s+-h|reboot\\b|sudo\\s+)/.test(text);",
    '}',
    '',
    'function recordHookEvent(rootDir, eventName, details = {}) {',
    '  const operator = loadLatestOperator(rootDir);',
    '  const policy = loadPolicy(rootDir);',
    '  const dir = telemetryDir(rootDir);',
    '  ensureDir(dir);',
    '  const at = new Date().toISOString();',
    '  const row = {',
    '    at,',
    '    eventName,',
    "    nativeProfile: policy.selectedProfile || operator?.nativeProfile || 'unknown',",
    '    sessionGenomeId: operator?.sessionGenome?.id || operator?.sessionGenomeId || null,',
    '    goal: operator?.goal || null,',
    '    ...details,',
    '  };',
    "  if (typeof row.command === 'string') {",
    '    row.command = truncateText(row.command, 240);',
    '  }',
    "  if (typeof row.prompt === 'string') {",
    '    row.prompt = truncateText(row.prompt, 240);',
    '  }',
    "  if (typeof row.reason === 'string') {",
    '    row.reason = truncateText(row.reason, 240);',
    '  }',
    '  if (Array.isArray(row.notes)) {',
    '    row.notes = row.notes.map((note) => truncateText(note, 240));',
    '  }',
    "  const eventsFile = path.join(dir, 'events.jsonl');",
    "  fs.appendFileSync(eventsFile, `${JSON.stringify(row)}\\n`);",
    "  fs.writeFileSync(path.join(dir, 'latest-session.json'), `${JSON.stringify({ lastUpdatedAt: at, latestEvent: row, sessionGenomeId: row.sessionGenomeId, nativeProfile: row.nativeProfile }, null, 2)}\\n`);",
    '  return row;',
    '}',
    '',
    'module.exports = {',
    '  readStdin,',
    '  findRepoRoot,',
    '  readJsonIfExists,',
    '  loadPolicy,',
    '  findClosestAgents,',
    '  printJson,',
    '  dangerousCommand,',
    '  truncateText,',
    '  recordHookEvent,',
    '};',
    '',
  ].join('\n');
}

function sessionStartScript() {
  return [
    "const { readStdin, findRepoRoot, loadPolicy, findClosestAgents, printJson, recordHookEvent } = require('./common');",
    '',
    'module.exports.__handler = async function handle(input) {',
    '  const repoRoot = findRepoRoot(input.cwd || process.cwd());',
    '  const policy = loadPolicy(repoRoot);',
    '  const closestAgents = findClosestAgents(input.cwd || process.cwd(), repoRoot);',
    '  const context = [',
    "    'Raiola native Codex layer is active.',",
    '    `Active profile: ${policy.selectedProfile}.`,',
    "    `Approvals: ${policy.approvalPolicy}; sandbox: ${policy.sandboxMode}; network: ${policy.networkAccess ? 'enabled in workspace-write' : 'restricted'}.`,",
    "    closestAgents ? `Read the closest AGENTS.md before editing: ${closestAgents}.` : 'Read AGENTS.md guidance before editing.',",
    "    'Treat docs/workflow/*.md as canonical workflow state and .workflow/* as generated runtime mirrors.',",
    '    policy.locked',
    "      ? 'Trust Center is holding the repo in a locked posture. Prefer diagnosis, review, and planning over edits.'",
    '      : policy.strict',
    "        ? 'Trust posture is strict. Keep changes narrow and verification explicit.'",
    "        : 'Keep work bounded, verification visible, and close with the next safest command.',",
    "  ].join(' ');",
    '',
    "  recordHookEvent(repoRoot, 'SessionStart', {",
    "    decision: 'note',",
    '    notes: [context],',
    "    cwd: input.cwd || process.cwd(),",
    '  });',
    '',
    '  printJson({',
    '    continue: true,',
    '    hookSpecificOutput: {',
    "      hookEventName: 'SessionStart',",
    '      additionalContext: context,',
    '    },',
    '  });',
    '};',
    '',
    'readStdin(module.exports.__handler);',
    '',
  ].join('\n');
}

function preToolUseScript() {
  return [
    "const { readStdin, findRepoRoot, loadPolicy, printJson, dangerousCommand, recordHookEvent } = require('./common');",
    '',
    'module.exports.__handler = async function handle(input) {',
    '  const repoRoot = findRepoRoot(input.cwd || process.cwd());',
    '  const policy = loadPolicy(repoRoot);',
    "  const command = String(input.tool_input?.command || '');",
    "  const wantsNetwork = /\\b(curl|wget|npm\\s+install|pnpm\\s+add|yarn\\s+add|pip\\s+install|cargo\\s+add)\\b/.test(command);",
    "  const touchesGeneratedWorkflow = /\\.workflow\\//.test(command);",
    '',
    '  if (dangerousCommand(command) && (policy.locked || policy.strict)) {',
    "    recordHookEvent(repoRoot, 'PreToolUse', {",
    "      decision: 'deny',",
    '      command,',
    "      reason: 'Raiola native policy blocks destructive shell commands in strict or locked mode.',",
    "      notes: ['Destructive shell command blocked under strict or locked posture.'],",
    '    });',
    '    printJson({',
    "      systemMessage: 'Raiola blocked a destructive shell command while native policy is strict.',",
    '      hookSpecificOutput: {',
    "        hookEventName: 'PreToolUse',",
    "        permissionDecision: 'deny',",
    "        permissionDecisionReason: 'Raiola native policy blocks destructive shell commands in strict or locked mode.',",
    '      },',
    '    });',
    '    return;',
    '  }',
    '',
    '  if (wantsNetwork && !policy.networkAccess) {',
    "    recordHookEvent(repoRoot, 'PreToolUse', {",
    "      decision: 'warn',",
    '      command,',
    "      reason: 'This command likely needs network access, but the active Raiola profile keeps network restricted.',",
    '    });',
    '    printJson({',
    "      systemMessage: 'This command likely needs network access, but the active Raiola profile keeps network restricted. Switch profiles or request approval intentionally.',",
    '    });',
    '    return;',
    '  }',
    '',
    '  if (touchesGeneratedWorkflow) {',
    "    recordHookEvent(repoRoot, 'PreToolUse', {",
    "      decision: 'warn',",
    '      command,',
    "      notes: ['Generated workflow surface touched before closeout.'],",
    '    });',
    '    printJson({',
    "      systemMessage: 'You are touching .workflow generated artifacts. Prefer updating canonical docs or product sources first unless this command is explicitly refreshing derived state.',",
    '    });',
    '  }',
    '};',
    '',
    'readStdin(module.exports.__handler);',
    '',
  ].join('\n');
}

function postToolUseScript() {
  return [
    "const { readStdin, findRepoRoot, loadPolicy, printJson, recordHookEvent } = require('./common');",
    '',
    'module.exports.__handler = async function handle(input) {',
    '  const repoRoot = findRepoRoot(input.cwd || process.cwd());',
    '  const policy = loadPolicy(repoRoot);',
    "  const command = String(input.tool_input?.command || '');",
    "  const response = typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response || {});",
    '  const notes = [];',
    '',
    "  if (/not a git repository/i.test(response)) {",
    "    notes.push('This project may be running outside a Git checkout. Use .codex project root markers and repo-local paths instead of assuming git metadata is present.');",
    '  }',
    "  if (/permission denied|operation not permitted/i.test(response) && policy.sandboxMode === 'read-only') {",
    "    notes.push('The active Raiola profile is read-only. Tighten the plan or switch permissions before retrying write operations.');",
    '  }',
    "  if (/\\.workflow\\//.test(command)) {",
    "    notes.push('A generated workflow surface changed. Re-check docs/workflow canonical sources before closeout.');",
    '  }',
    '  if (notes.length === 0) {',
    '    return;',
    '  }',
    '',
    "  recordHookEvent(repoRoot, 'PostToolUse', {",
    "    decision: 'interrupt',",
    '    command,',
    '    notes,',
    '  });',
    '',
    '  printJson({',
    '    continue: false,',
    '    systemMessage: notes[0],',
    '    hookSpecificOutput: {',
    "      hookEventName: 'PostToolUse',",
    "      additionalContext: notes.join(' '),",
    '    },',
    '  });',
    '};',
    '',
    'readStdin(module.exports.__handler);',
    '',
  ].join('\n');
}

function userPromptSubmitScript() {
  return [
    "const { readStdin, findRepoRoot, loadPolicy, findClosestAgents, printJson, recordHookEvent } = require('./common');",
    '',
    'module.exports.__handler = async function handle(input) {',
    '  const repoRoot = findRepoRoot(input.cwd || process.cwd());',
    '  const policy = loadPolicy(repoRoot);',
    "  const prompt = String(input.prompt || '');",
    '  const closestAgents = findClosestAgents(input.cwd || process.cwd(), repoRoot);',
    '  const notes = [];',
    '',
    "  if (/ignore\\s+agents|skip\\s+review|skip\\s+verify|ship\\s+it\\s+now/i.test(prompt)) {",
    "    notes.push('Do not bypass AGENTS guidance, review, or verification without explicitly recording the reason.');",
    '  }',
    "  if (policy.repoSignals?.monorepo && /review|plan|large repo|monorepo/i.test(prompt)) {",
    "    notes.push('This repo has monorepo signals. Prefer /agent with monorepo_planner or ask Raiola to shard the work before editing.');",
    '  }',
    "  if (policy.repoSignals?.frontend && /ui|frontend|design|browser/i.test(prompt)) {",
    "    notes.push('This repo has frontend signals. Prefer the frontend lane, browser evidence, and state-aware review for user-visible changes.');",
    '  }',
    '  if (closestAgents) {',
    '    notes.push(`Closest AGENTS guidance: ${closestAgents}.`);',
    '  }',
    '',
    '  if (notes.length === 0) {',
    '    return;',
    '  }',
    '',
    "  recordHookEvent(repoRoot, 'UserPromptSubmit', {",
    "    decision: 'note',",
    '    prompt,',
    '    notes,',
    '  });',
    '',
    '  printJson({',
    '    continue: true,',
    '    hookSpecificOutput: {',
    "      hookEventName: 'UserPromptSubmit',",
    "      additionalContext: notes.join(' '),",
    '    },',
    '  });',
    '};',
    '',
    'readStdin(module.exports.__handler);',
    '',
  ].join('\n');
}

function stopContinueScript() {
  return [
    "const { readStdin, findRepoRoot, loadPolicy, printJson, recordHookEvent } = require('./common');",
    '',
    'module.exports.__handler = async function handle(input) {',
    '  const repoRoot = findRepoRoot(input.cwd || process.cwd());',
    '  const policy = loadPolicy(repoRoot);',
    '  const alreadyContinued = Boolean(input.stop_hook_active);',
    '  const gaps = Number(policy.pendingApprovals || 0) + Number(policy.verificationGaps || 0) + Number(policy.missingEvidence || 0);',
    '',
    '  if (alreadyContinued || gaps === 0) {',
    '    printJson({ continue: true });',
    '    return;',
    '  }',
    '',
    "  recordHookEvent(repoRoot, 'StopContinue', {",
    "    decision: 'block',",
    '    blockerCount: gaps,',
    "    reason: 'Before stopping, summarize the remaining Raiola blockers from .codex/raiola-policy.json and name the next safest command to clear them.',",
    '  });',
    '',
    '  printJson({',
    "    decision: 'block',",
    "    reason: 'Before stopping, summarize the remaining Raiola blockers from .codex/raiola-policy.json and name the next safest command to clear them.',",
    '  });',
    '};',
    '',
    'readStdin(module.exports.__handler);',
    '',
  ].join('\n');
}

function readSourceHookAsset(fileName, fallbackFactory) {
  const filePath = path.join(__dirname, '..', '..', '.codex', 'hooks', fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return typeof fallbackFactory === 'function' ? fallbackFactory() : '';
}

function hookScripts() {
  return {
    'common.js': readSourceHookAsset('common.js', commonHookScript),
    'session_start.js': readSourceHookAsset('session_start.js', sessionStartScript),
    'pre_tool_use_policy.js': readSourceHookAsset('pre_tool_use_policy.js', preToolUseScript),
    'post_tool_use_review.js': readSourceHookAsset('post_tool_use_review.js', postToolUseScript),
    'user_prompt_submit.js': readSourceHookAsset('user_prompt_submit.js', userPromptSubmitScript),
    'stop_continue.js': readSourceHookAsset('stop_continue.js', stopContinueScript),
  };
}

function nativeAgentDefinitions() {
  return [
    {
      file: 'pr-explorer.toml',
      content: [
        'name = "pr_explorer"',
        'description = "Read-only codebase explorer for gathering evidence before changes are proposed."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Stay in exploration mode.',
        'Trace the real execution path, cite files and symbols, and avoid proposing fixes unless the parent agent asks for them.',
        'Prefer fast search and targeted file reads over broad scans.',
        'Respect the closest AGENTS.md guidance for each file you inspect.',
        '"""',
        'nickname_candidates = ["Atlas", "Scout", "Trace"]',
        '',
      ].join('\n'),
    },
    {
      file: 'reviewer.toml',
      content: [
        'name = "reviewer"',
        'description = "PR reviewer focused on correctness, security, and missing tests."',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Review code like an owner.',
        'Prioritize correctness, security, behavior regressions, and missing test coverage.',
        'Lead with concrete findings, include reproduction steps when possible, and avoid style-only comments unless they hide a real bug.',
        'Treat stale generated output, missing closeout evidence, and undocumented operational drift as real findings.',
        '"""',
        'nickname_candidates = ["Delta", "Echo", "North"]',
        '',
      ].join('\n'),
    },
    {
      file: 'docs-researcher.toml',
      content: [
        'name = "docs_researcher"',
        'description = "Documentation specialist that uses the docs MCP server to verify APIs and framework behavior."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Use the docs MCP server to confirm APIs, options, and version-specific behavior.',
        'Return concise answers with links or exact references when available.',
        'Do not make code changes.',
        '"""',
        '[mcp_servers.openaiDeveloperDocs]',
        'url = "https://developers.openai.com/mcp"',
        '',
      ].join('\n'),
    },
    {
      file: 'monorepo-planner.toml',
      content: [
        'name = "monorepo_planner"',
        'description = "Package-aware planner for large repos, shard selection, and bounded execution slices."',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Map package boundaries, changed packages, blast radius, and likely verification scope before work starts.',
        'Suggest the smallest safe shard plan and keep write scopes disjoint.',
        'When guidance conflicts, prefer the closest AGENTS.md and explicit repo policy over assumptions.',
        '"""',
        '[mcp_servers.raiolaWorkflowState]',
        'command = "node"',
        'args = ["scripts/workflow/mcp_server.js", "--server", "workflow-state", "--repo", "."]',
        'cwd = "."',
        '',
      ].join('\n'),
    },
    {
      file: 'code-mapper.toml',
      content: [
        'name = "code_mapper"',
        'description = "Read-only codebase explorer for locating the relevant frontend and backend code paths."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Map the code that owns the failing flow.',
        'Identify entry points, state transitions, data dependencies, and likely files before the worker starts editing.',
        'Do not drift into fixes until the failure surface is explicit.',
        '"""',
        '',
      ].join('\n'),
    },
    {
      file: 'browser-debugger.toml',
      content: [
        'name = "browser_debugger"',
        'description = "UI debugger that uses browser tooling to reproduce issues and capture evidence."',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "workspace-write"',
        'developer_instructions = """',
        'Reproduce the issue in the browser, capture exact steps, and report what the UI actually does.',
        'Use browser tooling for screenshots, console output, and network evidence.',
        'Do not edit application code.',
        '"""',
        '[mcp_servers.chrome_devtools]',
        'url = "http://localhost:3000/mcp"',
        'startup_timeout_sec = 20',
        '',
      ].join('\n'),
    },
    {
      file: 'ui-fixer.toml',
      content: [
        'name = "ui_fixer"',
        'description = "Implementation-focused agent for small, targeted fixes after the issue is understood."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "workspace-write"',
        'developer_instructions = """',
        'Own the fix once the issue is reproduced.',
        'Make the smallest defensible change, keep unrelated files untouched, and validate only the behavior you changed.',
        'Leave the follow-up verification command in your closeout.',
        '"""',
        '',
      ].join('\n'),
    },

    {
      file: 'operator-supervisor.toml',
      content: [
        'name = "operator_supervisor"',
        'description = "Supervisor for long-running or cross-surface tasks that need deterministic routing, handoff, and escalation."',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Stay in orchestration mode.',
        'Choose the smallest safe lane, assign bounded subagents, and keep work reviewable.',
        'Prefer plans, shard maps, and explicit next commands over speculative edits.',
        '"""',
        '',
      ].join('\n'),
    },
    {
      file: 'trust-analyst.toml',
      content: [
        'name = "trust_analyst"',
        'description = "Read-only analyst for approvals, sandbox posture, verification gaps, and policy drift."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Inspect approval posture, risk, and missing evidence before work widens.',
        'Translate trust signals into concrete next steps instead of vague warnings.',
        '"""',
        '[mcp_servers.raiolaPolicy]',
        'command = "node"',
        'args = ["scripts/workflow/mcp_server.js", "--server", "policy", "--repo", "."]',
        'cwd = "."',
        '',
      ].join('\n'),
    },
    {
      file: 'release-gatekeeper.toml',
      content: [
        'name = "release_gatekeeper"',
        'description = "Read-only release checker for merge blockers, migration notes, and ship readiness."',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Inspect release artifacts, migration notes, closeout evidence, and unresolved blockers before approval.',
        'Prefer specific blockers and explicit verification steps.',
        '"""',
        '[mcp_servers.raiolaWorkflowState]',
        'command = "node"',
        'args = ["scripts/workflow/mcp_server.js", "--server", "workflow-state", "--repo", "."]',
        'cwd = "."',
        '',
      ].join('\n'),
    },
    {
      file: 'automation-curator.toml',
      content: [
        'name = "automation_curator"',
        'description = "Planner for Codex app automations, worktree runs, and recurring review loops."',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "medium"',
        'sandbox_mode = "read-only"',
        'developer_instructions = """',
        'Turn recurring operator work into automation-ready prompts and worktree-safe execution plans.',
        'Prefer deterministic prompts, stable entrypoints, and explicit archive/no-findings behavior.',
        '"""',
        '',
      ].join('\n'),
    },
  ];
}


function operatorSupportFiles(spec = {}) {
  const policy = spec.policy || {};
  const selectedProfile = policy.selectedProfile || 'raiola-balanced';
  return {
    'AGENTS.md': [
      '# AGENTS',
      '',
      'This `.codex/` directory is the native Raiola operator layer for Codex.',
      '',
      '## Working rules',
      '',
      '- Keep `.codex/config.toml`, hooks, subagents, and operator templates aligned.',
      '- Treat `.workflow/` runtime state as derived unless a document explicitly says otherwise.',
      '- Use `rai codex operator` before large, risky, or cross-surface tasks.',
      '- Use `rai codex cockpit` when a task needs a runnable launch kit, resume surface, and operator packet bundle.',
      '- Use `rai codex telemetry --json` to review the native hook flight recorder before repeating or widening the session.',
      '- Use `rai codex managed-export` when Trust Center decisions need to become deployable native requirements.',
      '',
      '## Current generated posture',
      '',
      `- Native profile: \`${selectedProfile}\``,
      `- Approval policy: \`${policy.approvalPolicy || 'on-request'}\``,
      `- Sandbox mode: \`${policy.sandboxMode || 'workspace-write'}\``,
      '',
    ].join('\n'),
    'hooks/AGENTS.md': [
      '# AGENTS',
      '',
      'These files are Codex lifecycle hooks, not user-facing business logic.',
      '',
      '- Keep hooks deterministic and fast.',
      '- Emit guidance or denials only when the reason is concrete and actionable.',
      '- Prefer reading `.codex/raiola-policy.json` and the closest `AGENTS.md` over inventing policy in code.',
      '- Record native operator telemetry through the shared helpers instead of inventing new file formats.',
      '',
    ].join('\n'),
    'operator/README.md': [
      '# Codex Operator Layer',
      '',
      'Raiola uses this directory as the native operator surface for Codex.',
      '',
      '## What is here',
      '',
      '- `agents-sdk/` -> first-party Codex MCP + Agents SDK scaffold',
      '- `app-server/` -> remote and embedded Codex app-server notes',
      '- `cockpit/` -> launch-kit guidance for `rai codex cockpit`',
      '- `evals/` -> repeatable `codex exec --json` evaluation loop',
      '- `telemetry/` -> hook flight-recorder guidance for `rai codex telemetry`',
      '- `repo-control/` -> repo-wide control-room guidance for `rai repo-control`',
      '- `monorepo-control/` -> large-monorepo control-room guidance for `rai monorepo-control`',
      '- `frontend-control/` -> frontend control-room guidance for `rai frontend-control`',
      '- `safety-control/` -> safety, repair, and failure-forecast guidance for `rai safety-control`',
      '- `runbooks/` -> large-repo and release-gate operating playbooks',
      '',
      '## Daily loop',
      '',
      '1. `rai codex operator --goal "..."`',
      '2. `rai safety-control --json` when the session should tighten security posture, failure forecasts, or repair actions before editing',
      '3. `rai repo-control --json`, `rai workspace-impact --json`, `rai monorepo-control --json`, or `rai frontend-control --json` when the repo needs a control room before editing',
      '4. `rai codex cockpit --goal "..." --json` when you need a runnable launch kit',
      '5. Start native Codex with `CODEX_HOME=$(pwd)/.codex codex --profile <profile>` or one of the generated cockpit launchers',
      '6. Review `rai codex telemetry --json` before repeating or widening the session',
      '7. Close with Raiola trust/release/handoff surfaces when the task becomes important',
      '',
    ].join('\n'),
    'operator/cockpit/README.md': [
      '# Codex Cockpit',
      '',
      'Use `rai codex cockpit --goal "..." --json` to materialize a runnable native Codex launch kit.',
      '',
      '## Output set',
      '',
      '- session prompt and slash flow ready to paste or reopen',
      '- launch scripts for interactive, `codex exec`, remote TUI, app-server, Agents SDK, evals, telemetry, and managed export',
      '- manifest, automation brief, context pack, prompt pack, and resume card references',
      '',
      '## Why it exists',
      '',
      'This gives Codex a repo-native operating layer that can be resumed, shared, and relaunched without reconstructing the operator context from memory.',
      '',
      '## Core loop',
      '',
      '1. Run `rai codex operator --goal "..."`.',
      '2. Run `rai codex cockpit --goal "..." --json`.',
      '3. Open `.workflow/runtime/codex-control/cockpit/launch/` and use the preferred launcher.',
      '4. Keep the generated `session-prompt.txt` and `slash-flow.md` beside the live session.',
      '',
    ].join('\n'),
    'operator/repo-control/README.md': [
      '# Repo Control Room',
      '',
      'Use `rai repo-control --json` when the session needs a repo-wide management surface instead of jumping straight into one package or one diff.',
      '',
      '## What it aggregates',
      '',
      '- package graph and changed/impacted package ranking',
      '- workspace registry and active roots',
      '- repo audit hotspots, correction-plan pressure, and repo-health verdict',
      '- frontend presence summary so UI-heavy repos stay visible inside repo management',
      '',
      '## Good fits',
      '',
      '- monorepos and multi-package repos',
      '- cross-cutting refactors',
      '- deciding which subsystem should become the next Codex goal',
      '',
    ].join('\n'),
    'operator/monorepo-control/README.md': [
      '# Monorepo Control Room',
      '',
      'Use `rai monorepo-control --json` when a large monorepo needs an explicit operating surface for impact waves, workspace ownership, and verification sequencing.',
      '',
      '## What it aggregates',
      '',
      '- workspace-impact blast radius and development waves',
      '- dependency hubs, bottlenecks, and cross-package fan-out risk',
      '- workspace coordination gaps and bounded parallel-lane posture',
      '- repo-health posture so large-repo planning stays tied to release/trust state',
      '',
      '## Good fits',
      '',
      '- large monorepos with many internal packages',
      '- cross-cutting refactors that should open in waves',
      '- choosing the next Codex goal for a broad repo without widening write scope too early',
      '',
    ].join('\n'),
    'operator/frontend-control/README.md': [
      '# Frontend Control Room',
      '',
      'Use `rai frontend-control --json` when UI work should stay evidence-backed, state-aware, and reusable instead of being treated as isolated polish.',
      '',
      '## What it aggregates',
      '',
      '- detected framework, routing, UI system, and surface inventory',
      '- browser evidence, accessibility verdicts, journey coverage, and missing states',
      '- design debt, primitive opportunities, and scorecard posture',
      '',
      '## Good fits',
      '',
      '- dashboard or app-shell work',
      '- route-heavy frontend repos',
      '- deciding whether the next wave should be browser verification, state atlas, UI review, or component reuse work',
      '',
    ].join('\n'),
    'operator/safety-control/README.md': [
      '# Safety Control Room',
      '',
      'Use `rai safety-control --json` when the repo should tighten security posture, forecast likely failures, and review safe repair moves before wider work continues.',
      '',
      '## What it aggregates',
      '',
      '- secure-phase findings and top risks',
      '- doctor and health failures that indicate operator-surface drift',
      '- self-healing repair actions and manual repair lanes',
      '- workspace-impact exposure for high-fan-out packages without local verification',
      '- incident memory and Codex-native follow-through guidance',
      '',
      '## Good fits',
      '',
      '- hardening a risky repo before release work continues',
      '- recovering from repeated operator drift or corrupt runtime state',
      '- deciding whether the next move should be secure-phase review, repair review, or trust refresh',
      '',
      '## Native follow-through',
      '',
      '1. Run `rai safety-control --json`.',
      '2. Inspect `rai secure --scope repo --json` for high-confidence findings.',
      '3. Review `rai repair --kind health --json` before applying any self-healing action.',
      '4. Refresh `rai trust --json` after the stabilization wave.',
      '5. Continue with `rai codex operator --goal "stabilize the current security and repair wave" --json` when the next step belongs in native Codex.',
      '',
    ].join('\n'),
    'operator/agents-sdk/README.md': [
      '# Agents SDK + Codex MCP',
      '',
      'Use the scaffold in this folder when a task needs a reviewable multi-agent pipeline instead of a single interactive thread.',
      '',
      '## Entry points',
      '',
      '- `python codex_operator_pipeline.py` -> runs a bounded supervisor pipeline against `codex mcp-server`',
      '- Set `CODEX_HOME=$(pwd)/.codex` so the pipeline uses repo-local profiles and MCP config',
      '',
      '## Suggested use cases',
      '',
      '- large-repo shard mapping',
      '- release gating',
      '- read-only review fan-out followed by a narrow patch lane',
      '',
    ].join('\n'),
    'operator/agents-sdk/codex_operator_pipeline.py': [
      'import asyncio',
      'import os',
      '',
      'from agents import Agent, Runner',
      'from agents.mcp import MCPServerStdio',
      '',
      '',
      'async def main() -> None:',
      '    codex_home = os.environ.get("CODEX_HOME") or os.path.join(os.getcwd(), ".codex")',
      '    env = os.environ.copy()',
      '    env["CODEX_HOME"] = codex_home',
      '',
      '    async with MCPServerStdio(',
      '        name="Codex CLI",',
      '        params={',
      '            "command": "codex",',
      '            "args": ["mcp-server"],',
      '            "env": env,',
      '        },',
      '        client_session_timeout_seconds=360000,',
      '    ) as codex_server:',
      '        planner = Agent(',
      '            name="Raiola Planner",',
      '            instructions="Plan first. Keep tasks bounded and reviewable. Use Codex MCP to inspect the repo before proposing work.",',
      '            mcp_servers=[codex_server],',
      '        )',
      '        operator = Agent(',
      '            name="Raiola Operator",',
      '            instructions="Use the plan, enforce bounded scopes, and report verification plus next actions.",',
      '            mcp_servers=[codex_server],',
      '        )',
      '',
      '        plan = await Runner.run(planner, "Summarize the repository, choose the safest lane, and list bounded next steps.")',
      '        result = await Runner.run(operator, f"Use this plan and continue only with reviewable steps:\n\n{plan.final_output}")',
      '        print(result.final_output)',
      '',
      '',
      'if __name__ == "__main__":',
      '    asyncio.run(main())',
      '',
    ].join('\n'),
    'operator/app-server/README.md': [
      '# Codex App Server Notes',
      '',
      'Use `codex app-server` when Raiola needs a deep, event-streaming integration instead of plain CLI control.',
      '',
      '## Local remote-TUI loop',
      '',
      '- Start the server: `CODEX_HOME=$(pwd)/.codex codex app-server --listen ws://127.0.0.1:4500`',
      '- Connect the TUI: `CODEX_HOME=$(pwd)/.codex codex --remote ws://127.0.0.1:4500`',
      '',
      'Keep non-local listeners behind authentication and TLS before real remote use.',
      '',
    ].join('\n'),
    'operator/evals/README.md': [
      '# Codex Evals Loop',
      '',
      'This directory holds a minimal repeatable eval runner built around `codex exec --json` traces.',
      '',
      '## Loop',
      '',
      '1. Write a prompt set for the skill or workflow you care about.',
      '2. Run `node run_skill_evals.mjs`.',
      '3. Parse the JSONL traces and score deterministic checks.',
      '',
      'Use this to tune skills, operator prompts, and large-repo routing.',
      '',
    ].join('\n'),
    'operator/evals/run_skill_evals.mjs': [
      'import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";',
      'import { spawnSync } from "node:child_process";',
      'import path from "node:path";',
      '',
      'const promptsFile = path.join(process.cwd(), ".codex", "operator", "evals", "prompts.json");',
      'const outputDir = path.join(process.cwd(), ".workflow", "reports", "codex-evals");',
      'mkdirSync(outputDir, { recursive: true });',
      '',
      'const prompts = existsSync(promptsFile)',
      '  ? JSON.parse(readFileSync(promptsFile, "utf8"))',
      '  : [',
      '      { id: "review", prompt: "Review the current repository and name the top 3 risks." },',
      '      { id: "release", prompt: "List the remaining release blockers and missing migration notes." },',
      '    ];',
      '',
      'const results = prompts.map((entry) => {',
      '  const run = spawnSync("codex", ["exec", "--json", "--full-auto", entry.prompt], {',
      '    cwd: process.cwd(),',
      '    env: { ...process.env, CODEX_HOME: path.join(process.cwd(), ".codex") },',
      '    encoding: "utf8",',
      '  });',
      '  const file = path.join(outputDir, `${entry.id}.jsonl`);',
      '  writeFileSync(file, run.stdout || "");',
      '  return { id: entry.id, status: run.status === 0 ? "pass" : "warn", file };',
      '});',
      '',
      'writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify({ results }, null, 2));',
      'console.log(JSON.stringify({ results }, null, 2));',
      '',
    ].join('\n'),
    'operator/evals/prompts.json': JSON.stringify([
      {
        'id': 'review',
        'prompt': 'Review the current repository and name the top 3 risks.',
      },
      {
        'id': 'release',
        'prompt': 'List the remaining release blockers and missing migration notes.',
      },
    ], null, 2),
    'operator/runbooks/large-repo.md': [
      '# Large Repo Runbook',
      '',
      '1. Start with `rai codex operator --goal "audit the large repo"`.',
      '2. Launch Codex with the repo-local home and the generated profile.',
      '3. Use `/plan-mode`, `/status`, `/agent`, and `/mcp` before editing.',
      '4. Run `monorepo_planner` + `pr_explorer` first, then open a bounded fix lane only after the shard map is explicit.',
      '5. Prefer dedicated worktrees for recurring review or correction loops.',
      '',
    ].join('\n'),
    'operator/runbooks/release-gate.md': [
      '# Release Gate Runbook',
      '',
      '1. Refresh `rai trust`, `rai release-control`, and `rai handoff`.',
      '2. Run `rai codex managed-export --json` when you need a deployable managed Codex policy.',
      '3. Use `release_gatekeeper` and `trust_analyst` before any approval or ship decision.',
      '4. Keep migration notes, rollback hints, and verification evidence visible in the final closeout.',
      '',
    ].join('\n'),
    'operator/telemetry/README.md': [
      '# Codex Telemetry',
      '',
      'Raiola records a native hook flight recorder for Codex sessions so operator guidance can be resumed instead of reconstructed.',
      '',
      '## Files',
      '',
      '- `.workflow/runtime/codex-control/telemetry/events.jsonl` -> append-only event stream',
      '- `.workflow/runtime/codex-control/telemetry/latest-session.json` -> last session snapshot',
      '- `.workflow/runtime/codex-control/telemetry.json` and `.md` -> generated summary from `rai codex telemetry --json`',
      '',
      '## What to look for',
      '',
      '- denied commands under strict or locked profiles',
      '- warnings about network, `.workflow/` writes, or missing operator prep',
      '- interruption or steering notes that explain why a session drifted',
      '',
      '## Loop',
      '',
      '1. Work through the native Codex session.',
      '2. Run `rai codex telemetry --json`.',
      '3. Use the summary to tighten prompts, slash flow, and automation posture.',
      '',
    ].join('\n'),
    'managed/README.md': [
      '# Managed Requirements',
      '',
      'Raiola keeps managed Codex policy as an exportable template, not as a silently enforced repo-local file.',
      '',
      'Use `rai codex managed-export --json` to write a `requirements.toml` template under `.workflow/exports/codex/`.',
      'Then deploy that file to cloud-managed Codex requirements or `/etc/codex/requirements.toml` on trusted machines.',
      '',
    ].join('\n'),
  };
}

function writeOperatorAssets(codexRootDir, spec = {}) {
  const written = [];
  for (const [relativeFile, content] of Object.entries(operatorSupportFiles(spec))) {
    const filePath = path.join(codexRootDir, ...relativeFile.split('/'));
    ensureDir(path.dirname(filePath));
    const body = String(content || '');
    fs.writeFileSync(filePath, body.endsWith('\n') ? body : `${body}\n`);
    written.push(filePath);
  }
  return written;
}

function writeHookAssets(codexRootDir, options = {}) {
  const register = options.register != null
    ? Boolean(options.register)
    : options.hooksEnabled != null
      ? Boolean(options.hooksEnabled)
      : Boolean(options.enableHooks || options['enable-hooks']);
  const hooksDir = path.join(codexRootDir, 'hooks');
  ensureDir(hooksDir);
  const written = [];
  for (const [fileName, content] of Object.entries(hookScripts())) {
    const filePath = path.join(hooksDir, fileName);
    fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
    written.push(filePath);
  }
  const configFile = path.join(codexRootDir, 'hooks.json');
  if (register) {
    writeJsonFile(configFile, hookConfigObject());
    written.push(configFile);
  } else if (fs.existsSync(configFile)) {
    fs.rmSync(configFile, { force: true });
  }
  return written;
}

function writeHookRegistration(codexRootDir) {
  const configFile = path.join(codexRootDir, 'hooks.json');
  writeJsonFile(configFile, hookConfigObject());
  return configFile;
}

function writeAgentAssets(codexRootDir) {
  const agentsDir = path.join(codexRootDir, 'agents');
  ensureDir(agentsDir);
  const written = [];
  for (const agent of nativeAgentDefinitions()) {
    const filePath = path.join(agentsDir, agent.file);
    fs.writeFileSync(filePath, agent.content.endsWith('\n') ? agent.content : `${agent.content}\n`);
    written.push(filePath);
  }
  return written;
}

function writePolicySnapshot(codexRootDir, snapshot) {
  const filePath = path.join(codexRootDir, 'raiola-policy.json');
  writeJsonFile(filePath, snapshot);
  return filePath;
}

module.exports = {
  DEFAULT_CODEX_HOOKS_ENABLED,
  buildConfigSpec,
  deriveNativePolicy,
  existingConfigHooksEnabled,
  existingHooksRegistrationPresent,
  hookConfigObject,
  nativeAgentDefinitions,
  readJsonIfExists,
  renderConfigToml,
  resolveCodexHooksEnabled,
  writeAgentAssets,
  writeHookAssets,
  writeHookRegistration,
  writeOperatorAssets,
  writePolicySnapshot,
};
