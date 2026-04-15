const fs = require('node:fs');
const path = require('node:path');
const { listIndexedRepoFiles } = require('./fs_index');
const { commandFor, detectPackageManager } = require('./package/repo');
const { buildPackageGraph } = require('./package_graph');
const { buildReviewCorrectionControlPlane } = require('./review_correction_control_plane');
const { relativePath, writeJsonFile } = require('./roadmap_os');
const { buildFindingReplay, createAuditFinding } = require('./finding_model');

const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|dart|swift|kt|java|go|py|rb|php|rs)$/i;
const TEST_FILE_RE = /(^|\/)(test|tests|__tests__|integration_test|e2e)\//i;
const TEST_BASENAME_RE = /\.(test|spec)\.[^.]+$/i;
const VERIFY_SCRIPT_RE = /^(test|lint|typecheck|build|check|verify)(:.*)?$/i;
const ROOT_LEVEL_IGNORES = new Set([
  '.github',
  '.workflow',
  'docs',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const SEVERITY_ORDER = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
});

const SCORE_PENALTIES = Object.freeze({
  verified: {
    critical: 22,
    high: 16,
    medium: 10,
    low: 4,
  },
  probable: {
    critical: 12,
    high: 8,
    medium: 5,
    low: 2,
  },
  heuristic: {
    critical: 6,
    high: 4,
    medium: 2,
    low: 1,
  },
});

const TAG_WEIGHTS = Object.freeze({
  auth: 8,
  api: 7,
  data: 7,
  jobs: 6,
  integration: 5,
  payments: 5,
  firebase: 5,
  rules: 5,
  config: 4,
  frontend: 4,
  localization: 4,
  deeplink: 4,
  ads: 4,
  workflow: 3,
  app: 3,
});

const STACK_PACKS = Object.freeze({
  'generic-repo': {
    id: 'generic-repo',
    label: 'Generic repository',
    focusAreas: [
      'entrypoints and startup wiring',
      'test and CI coverage stability',
      'high-risk contracts and shared utilities',
    ],
    contractChecks: [
      'runtime entrypoints match the package and config surface',
      'shared utilities have an explicit verification path',
      'critical integrations are covered by tests or smoke checks',
    ],
  },
  'next-react': {
    id: 'next-react',
    label: 'Next.js / React app',
    focusAreas: [
      'route handlers, middleware, and auth boundaries',
      'server/client contract drift and data fetching edges',
      'UI state coverage, browser verification, and accessibility smoke',
    ],
    contractChecks: [
      'app routes, middleware, and API handlers stay aligned with auth and data contracts',
      'server components and client components preserve ownership and state flow',
      'critical pages have test or preview evidence for loading, success, and failure states',
    ],
  },
  'node-monorepo': {
    id: 'node-monorepo',
    label: 'Node monorepo',
    focusAreas: [
      'workspace boundaries and package fan-out',
      'shared package verification depth',
      'root-only scripts versus package-local quality gates',
    ],
    contractChecks: [
      'workspace manifests, internal dependencies, and dependents stay coherent',
      'shared packages with downstream consumers have direct tests or a documented verify path',
      'repo-wide CI is not the only place where risky packages get exercised',
    ],
  },
  'express-api': {
    id: 'express-api',
    label: 'Express API',
    focusAreas: [
      'route, controller, and middleware boundaries',
      'auth and error-handling enforcement',
      'API contract tests and rollback-safe verification',
    ],
    contractChecks: [
      'route handlers and auth middleware stay aligned',
      'error handling is centralized instead of hidden in local handlers',
      'API surfaces own tests or targeted smoke verification',
    ],
  },
  'supabase-pg': {
    id: 'supabase-pg',
    label: 'Supabase / Postgres',
    focusAreas: [
      'schema and migration visibility',
      'query or repository ownership',
      'policy and data-contract verification',
    ],
    contractChecks: [
      'schema or migration changes are visible next to data access code',
      'high-risk queries have direct tests or contract checks',
      'policy-sensitive data access is not only verified in broad app tests',
    ],
  },
  stripe: {
    id: 'stripe',
    label: 'Stripe integration',
    focusAreas: [
      'checkout and webhook contract safety',
      'billing and subscription flow verification',
      'event handling and idempotency signals',
    ],
    contractChecks: [
      'Stripe server routes expose a visible webhook surface',
      'payment or subscription flows have targeted tests or smoke checks',
      'webhook event handling is explicit enough to audit',
    ],
  },
  auth: {
    id: 'auth',
    label: 'Authentication stack',
    focusAreas: [
      'session and middleware enforcement',
      'route-to-auth boundary drift',
      'high-risk auth behavior verification',
    ],
    contractChecks: [
      'auth dependencies stay aligned with middleware or route enforcement',
      'session-bearing routes have direct verification',
      'critical auth flows are not left to generic repo-level smoke tests',
    ],
  },
  'workers-cloudflare': {
    id: 'workers-cloudflare',
    label: 'Cloudflare Workers',
    focusAreas: [
      'worker entrypoints and wrangler config',
      'edge/runtime verification coverage',
      'event and observability wiring',
    ],
    contractChecks: [
      'worker bindings and config stay visible in the repo',
      'worker entrypoints have direct tests or smoke commands',
      'runtime behavior is observable enough to audit safely',
    ],
  },
  'flutter-firebase': {
    id: 'flutter-firebase',
    label: 'Flutter + Firebase',
    focusAreas: [
      'bootstrap/auth/deep-link wiring',
      'model/service/firestore.rules alignment',
      'localization parity and premium/ads/runtime wiring',
    ],
    contractChecks: [
      'Flutter startup flows match Firebase config and auth assumptions',
      'Firestore usage and rules are checked together instead of in isolation',
      'high-risk product flows have widget or integration coverage, not just static code review',
    ],
  },
});

const FLUTTER_FIREBASE_DEPS = Object.freeze([
  'firebase_core',
  'firebase_auth',
  'cloud_firestore',
  'firebase_messaging',
  'firebase_dynamic_links',
]);

const FLUTTER_DEEP_LINK_DEPS = Object.freeze([
  'app_links',
  'uni_links',
  'firebase_dynamic_links',
]);

const FLUTTER_ADS_DEPS = Object.freeze([
  'google_mobile_ads',
]);

const FLUTTER_PREMIUM_DEPS = Object.freeze([
  'in_app_purchase',
  'purchases_flutter',
  'revenuecat_ui',
]);

const FLUTTER_WIRING_DEPS = Object.freeze([
  'provider',
  'flutter_riverpod',
  'riverpod',
  'get_it',
  'flutter_bloc',
  'bloc',
]);

const NEXT_AUTH_DEPS = Object.freeze([
  'next-auth',
  '@clerk/nextjs',
  '@auth0/nextjs-auth0',
  'better-auth',
  'lucia',
]);

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeReadText(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function reportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function configDir(cwd) {
  return path.join(cwd, '.workflow', 'config');
}

function findingPolicyPath(cwd) {
  return path.join(configDir(cwd), 'finding-policy.json');
}

function repoAuditHistoryPath(cwd) {
  return path.join(reportsDir(cwd), 'repo-audit-history.json');
}

function isTestFile(filePath) {
  const normalized = String(filePath || '');
  if (/(^|\/)(fixtures|corpus)\//.test(normalized)) {
    return false;
  }
  return TEST_FILE_RE.test(normalized) || TEST_BASENAME_RE.test(path.basename(normalized));
}

function readFindingPolicy(cwd) {
  const payload = readJson(findingPolicyPath(cwd), {});
  return {
    suppressions: Array.isArray(payload.suppressions) ? payload.suppressions : [],
    acceptedRisks: Array.isArray(payload.acceptedRisks) ? payload.acceptedRisks : [],
    knownDebt: Array.isArray(payload.knownDebt) ? payload.knownDebt : [],
  };
}

function ruleMatchesFinding(finding, rule) {
  if (!rule) {
    return false;
  }
  if (typeof rule === 'string') {
    const value = rule.toLowerCase();
    return (
      String(finding.title || '').toLowerCase().includes(value)
      || String(finding.area || '').toLowerCase().includes(value)
      || String(finding.fingerprint || '').toLowerCase().includes(value)
    );
  }
  const checks = [
    ['title', (value) => String(finding.title || '') === String(value)],
    ['area', (value) => String(finding.area || '') === String(value)],
    ['classification', (value) => String(finding.classification || '') === String(value)],
    ['severity', (value) => String(finding.severity || '') === String(value)],
    ['fingerprint', (value) => String(finding.fingerprint || '') === String(value)],
    ['sourceMode', (value) => String(finding.sourceMode || '') === String(value)],
    ['contains', (value) => {
      const needle = String(value || '').toLowerCase();
      return (
        String(finding.title || '').toLowerCase().includes(needle)
        || String(finding.detail || '').toLowerCase().includes(needle)
        || String(finding.area || '').toLowerCase().includes(needle)
      );
    }],
  ];
  return checks.every(([field, check]) => !rule[field] || check(rule[field]));
}

function applyFindingPolicy(findings, policy) {
  const active = {
    verified: [],
    probable: [],
    heuristic: [],
  };
  const applied = {
    suppressions: [],
    acceptedRisks: [],
    knownDebt: [],
  };

  for (const classification of ['verified', 'probable', 'heuristic']) {
    for (const finding of findings[classification] || []) {
      const suppression = policy.suppressions.find((rule) => ruleMatchesFinding(finding, rule));
      if (suppression) {
        applied.suppressions.push({
          ...finding,
          policyReason: typeof suppression === 'string' ? suppression : String(suppression.reason || suppression.contains || suppression.title || 'suppressed').trim(),
        });
        continue;
      }

      const acceptedRisk = policy.acceptedRisks.find((rule) => ruleMatchesFinding(finding, rule));
      if (acceptedRisk) {
        applied.acceptedRisks.push({
          ...finding,
          policyReason: typeof acceptedRisk === 'string' ? acceptedRisk : String(acceptedRisk.reason || acceptedRisk.contains || acceptedRisk.title || 'accepted risk').trim(),
        });
        continue;
      }

      const knownDebt = policy.knownDebt.find((rule) => ruleMatchesFinding(finding, rule));
      if (knownDebt) {
        applied.knownDebt.push({
          ...finding,
          policyReason: typeof knownDebt === 'string' ? knownDebt : String(knownDebt.reason || knownDebt.contains || knownDebt.title || 'known debt').trim(),
        });
        continue;
      }

      active[classification].push(finding);
    }
  }

  return {
    findings: active,
    policySummary: {
      suppressions: applied.suppressions,
      acceptedRisks: applied.acceptedRisks,
      knownDebt: applied.knownDebt,
    },
  };
}

function isSourceFile(filePath) {
  return SOURCE_FILE_RE.test(String(filePath || '')) && !isTestFile(filePath);
}

function listCiWorkflows(files) {
  return files.filter((filePath) => filePath.startsWith('.github/workflows/') && /\.(yml|yaml)$/.test(filePath));
}

function listLockfiles(files) {
  return files.filter((filePath) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|bun\.lock)$/.test(filePath));
}

function detectVerifyScripts(manifest) {
  return Object.keys(manifest?.scripts || {}).filter((scriptName) => VERIFY_SCRIPT_RE.test(scriptName)).sort();
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function extractMatches(text, regex, transform = (match) => match[1]) {
  const matches = [];
  const source = String(text || '');
  const pattern = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let match = pattern.exec(source);
  while (match) {
    matches.push(transform(match));
    match = pattern.exec(source);
  }
  return matches;
}

function dependencyDeclared(pubspecText, dependencyName) {
  return new RegExp(`^\\s{2,}${escapeRegex(dependencyName)}\\s*:`, 'm').test(String(pubspecText || ''));
}

function declaredDependencies(pubspecText, candidates) {
  return candidates.filter((dependencyName) => dependencyDeclared(pubspecText, dependencyName));
}

function buildContentMap(cwd, files, predicate = () => true) {
  const map = {};
  for (const filePath of files) {
    if (!predicate(filePath)) {
      continue;
    }
    map[filePath] = safeReadText(path.join(cwd, filePath));
  }
  return map;
}

function detectRiskTags(value) {
  const text = normalizeText(value);
  const tags = new Set();
  const rules = [
    ['auth', /\b(auth|session|permission|acl|rbac|middleware)\b/],
    ['api', /\b(api|route|router|handler|endpoint|controller|schema)\b/],
    ['data', /\b(data|db|database|schema|repository|storage|model|prisma)\b/],
    ['config', /\b(config|env|setting|flag)\b/],
    ['integration', /\b(provider|adapter|integration|client|sdk)\b/],
    ['jobs', /\b(worker|queue|job|cron|task|sync)\b/],
    ['frontend', /\b(frontend|web|ui|component|page|screen|view)\b/],
    ['workflow', /\b(workflow|orchestration|review|audit)\b/],
    ['payments', /\b(payment|billing|stripe|premium)\b/],
    ['localization', /\b(locale|i18n|l10n|translation)\b/],
    ['firebase', /\b(firebase|firestore|fcm)\b/],
    ['rules', /\b(rules|policy|firestore\.rules|storage\.rules)\b/],
    ['deeplink', /\b(deep-?link|deeplink)\b/],
    ['ads', /\b(ad|ads|advert)\b/],
    ['app', /\b(app|apps\/)\b/],
  ];
  for (const [tag, pattern] of rules) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
}

function workflowInstalled(cwd) {
  return fs.existsSync(path.join(cwd, 'docs', 'workflow', 'WORKSTREAMS.md'));
}

function validationRowCount(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'VALIDATION.md');
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|/.test(line))
    .filter((line) => !/^-+\|/.test(line.replace(/\s/g, '')))
    .length;
}

function detectStackPack(files, rootManifest, graph, preferredStack = '') {
  const explicit = String(preferredStack || '').trim();
  if (explicit) {
    return STACK_PACKS[explicit] || {
      id: explicit,
      label: explicit,
      focusAreas: STACK_PACKS['generic-repo'].focusAreas,
      contractChecks: STACK_PACKS['generic-repo'].contractChecks,
    };
  }
  const fileSet = new Set(files);
  const dependencies = {
    ...(rootManifest.dependencies || {}),
    ...(rootManifest.devDependencies || {}),
  };
  if (fileSet.has('pubspec.yaml') && (fileSet.has('firebase.json') || fileSet.has('firestore.rules') || fileSet.has('storage.rules'))) {
    return STACK_PACKS['flutter-firebase'];
  }
  if (graph.repoShape === 'monorepo' && graph.packageCount > 1) {
    return STACK_PACKS['node-monorepo'];
  }
  if ('next' in dependencies || files.some((filePath) => filePath.startsWith('app/') || filePath.startsWith('pages/'))) {
    return STACK_PACKS['next-react'];
  }
  if ('express' in dependencies) {
    return STACK_PACKS['express-api'];
  }
  if ('@supabase/supabase-js' in dependencies || 'pg' in dependencies || 'postgres' in dependencies || 'prisma' in dependencies || 'drizzle-orm' in dependencies) {
    return STACK_PACKS['supabase-pg'];
  }
  if ('stripe' in dependencies) {
    return STACK_PACKS.stripe;
  }
  if (Object.keys(dependencies).some((name) => NEXT_AUTH_DEPS.includes(name) || /auth|clerk|lucia|session/.test(name))) {
    return STACK_PACKS.auth;
  }
  if (files.some((filePath) => /^wrangler\.(toml|json|jsonc)$/.test(filePath)) || '@cloudflare/workers-types' in dependencies || 'wrangler' in dependencies) {
    return STACK_PACKS['workers-cloudflare'];
  }
  return STACK_PACKS['generic-repo'];
}

function sourceLikeFilesForPath(allFiles, pathPrefix) {
  if (pathPrefix === '.' || pathPrefix === 'root') {
    return allFiles.filter((filePath) => isSourceFile(filePath) && !filePath.includes('/'));
  }
  return allFiles.filter((filePath) => filePath === pathPrefix || filePath.startsWith(`${pathPrefix}/`));
}

function testFilesForPath(allFiles, pathPrefix) {
  if (pathPrefix === '.' || pathPrefix === 'root') {
    return allFiles.filter((filePath) => isTestFile(filePath) && !filePath.includes('/'));
  }
  return allFiles.filter((filePath) => filePath === pathPrefix || filePath.startsWith(`${pathPrefix}/`));
}

function singleRepoUnitKey(filePath) {
  const parts = String(filePath || '').split('/').filter(Boolean);
  if (parts.length === 0) {
    return 'root';
  }
  if (parts.length === 1) {
    return 'root';
  }
  if (['src', 'lib', 'app', 'pages', 'server', 'client', 'features', 'modules'].includes(parts[0]) && parts[1] && !/\.[^.]+$/.test(parts[1])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function buildSingleRepoUnits(cwd, files, rootManifest, manager) {
  const buckets = new Map();
  for (const filePath of files) {
    if (!isSourceFile(filePath) && !isTestFile(filePath) && !/package\.json$/.test(filePath)) {
      continue;
    }
    const key = singleRepoUnitKey(filePath);
    const bucket = buckets.get(key) || [];
    bucket.push(filePath);
    buckets.set(key, bucket);
  }

  const rootVerifyScripts = detectVerifyScripts(rootManifest);
  const repoTestFiles = files.filter((filePath) => isTestFile(filePath));
  const units = [];
  for (const [key, unitFiles] of buckets.entries()) {
    const displayPath = key === 'root' ? '.' : key;
    const sourceFiles = unitFiles.filter((filePath) => isSourceFile(filePath));
    const testFiles = unitFiles.filter((filePath) => isTestFile(filePath));
    if (sourceFiles.length === 0 && testFiles.length === 0 && key !== 'root') {
      continue;
    }
    const tags = detectRiskTags(`${key} ${unitFiles.join(' ')}`);
    const testStatus = testFiles.length > 0
      ? 'covered'
      : repoTestFiles.length > 0
        ? 'shared'
        : 'missing';
    const verifyScripts = key === 'root' ? rootVerifyScripts : [];
    units.push({
      id: key,
      name: key === 'root' ? 'Root surface' : key,
      path: displayPath,
      packagePath: displayPath,
      type: key === 'root' ? 'root' : 'subsystem',
      sourceFiles: uniqueSorted(sourceFiles),
      testFiles: uniqueSorted(testFiles),
      fileCount: unitFiles.length,
      tags,
      dependentCount: 0,
      internalDependencyCount: 0,
      verifyScripts,
      verifyCommands: verifyScripts.slice(0, 4).map((scriptName) => commandFor(manager, '.', scriptName)),
      testStatus,
      manifestPath: 'package.json',
    });
  }
  return units.sort((left, right) => left.path.localeCompare(right.path));
}

function buildMonorepoUnits(cwd, files, graph, manager) {
  const rootManifest = readJson(path.join(cwd, 'package.json'), {});
  const rootVerifyScripts = detectVerifyScripts(rootManifest);
  const repoTestFiles = files.filter((filePath) => isTestFile(filePath));
  const units = [];

  for (const pkg of graph.packages || []) {
    if (pkg.id === '.' && graph.packageCount > 1 && pkg.fileCount === 1) {
      continue;
    }
    const packagePath = pkg.path || '.';
    const manifestPath = packagePath === '.' ? 'package.json' : `${packagePath}/package.json`;
    const manifest = readJson(path.join(cwd, manifestPath), {});
    const packageFiles = packagePath === '.'
      ? files.filter((filePath) => !filePath.includes('/'))
      : files.filter((filePath) => filePath === packagePath || filePath.startsWith(`${packagePath}/`));
    const sourceFiles = packageFiles.filter((filePath) => isSourceFile(filePath));
    const directTests = uniqueSorted(graph.testsByPackage?.[pkg.id] || []);
    const tags = detectRiskTags(`${pkg.id} ${pkg.name} ${pkg.path} ${packageFiles.slice(0, 24).join(' ')}`);
    if (pkg.path.startsWith('apps/')) {
      tags.push('app');
    }
    const verifyScripts = detectVerifyScripts(manifest);
    const testStatus = directTests.length > 0
      ? 'covered'
      : repoTestFiles.length > 0
        ? 'shared'
        : 'missing';
    units.push({
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      packagePath: pkg.path,
      type: pkg.path.startsWith('apps/') ? 'app' : pkg.path === '.' ? 'root' : 'package',
      sourceFiles: uniqueSorted(sourceFiles),
      testFiles: directTests,
      fileCount: packageFiles.length,
      tags: uniqueSorted(tags),
      dependentCount: (pkg.dependents || []).length,
      internalDependencyCount: (pkg.internalDependencies || []).length,
      verifyScripts,
      verifyCommands: verifyScripts.slice(0, 4).map((scriptName) => commandFor(manager, pkg.path, scriptName)),
      inheritedVerifyScripts: verifyScripts.length === 0 ? rootVerifyScripts : [],
      testStatus,
      manifestPath,
    });
  }

  return units
    .filter((unit) => unit.path !== '.' || unit.sourceFiles.length > 0 || unit.testFiles.length > 0 || unit.verifyScripts.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function scoreUnit(unit, rootVerifyScripts) {
  let score = Math.max(3, unit.sourceFiles.length);
  const drivers = [];

  for (const tag of unit.tags) {
    const weight = TAG_WEIGHTS[tag] || 0;
    if (weight > 0) {
      score += weight;
      drivers.push(`${tag}+${weight}`);
    }
  }
  if (unit.type === 'app') {
    score += 3;
    drivers.push('app+3');
  }
  if (unit.dependentCount > 0) {
    const dependentScore = unit.dependentCount * 3;
    score += dependentScore;
    drivers.push(`dependents+${dependentScore}`);
  }
  if (unit.internalDependencyCount > 0) {
    score += unit.internalDependencyCount;
    drivers.push(`internal-deps+${unit.internalDependencyCount}`);
  }
  if (unit.sourceFiles.length >= 8) {
    score += 4;
    drivers.push('broad-surface+4');
  }
  if (unit.testStatus === 'missing') {
    const penalty = unit.tags.some((tag) => ['auth', 'api', 'data', 'jobs', 'payments', 'firebase', 'rules'].includes(tag)) ? 10 : 5;
    score += penalty;
    drivers.push(`missing-tests+${penalty}`);
  } else if (unit.testStatus === 'shared') {
    const penalty = unit.tags.some((tag) => ['auth', 'api', 'data'].includes(tag)) ? 6 : 2;
    score += penalty;
    drivers.push(`shared-tests+${penalty}`);
  }
  if (unit.verifyScripts.length === 0) {
    const penalty = rootVerifyScripts.length > 0 && unit.packagePath !== '.'
      ? 3
      : 5;
    score += penalty;
    drivers.push(`verify-gap+${penalty}`);
  }

  return {
    score,
    drivers,
    severity: score >= 34 ? 'critical' : score >= 24 ? 'high' : score >= 15 ? 'medium' : 'low',
  };
}

function defaultSuggestedAction(classification, area, detail) {
  if (classification === 'verified') {
    return `Open a bounded correction wave for ${area || 'repo'}, fix the concrete contract gap, and re-run the narrowest verify command that proves it.`;
  }
  if (classification === 'probable') {
    return `Investigate ${area || 'repo'} first, confirm whether the signal is real, and either fix it or downgrade it explicitly with evidence.`;
  }
  return `Treat this as a heuristic observation for ${area || 'repo'} until code or runtime evidence confirms it: ${detail}`;
}

function makeFinding(classification, severity, title, detail, area, evidence, confidence) {
  return createAuditFinding({
    classification,
    severity,
    title,
    detail,
    area,
    evidence: uniqueSorted(evidence).slice(0, 8),
    confidence: Number(confidence.toFixed(2)),
    whyFound: detail,
    suggestedNextAction: defaultSuggestedAction(classification, area, detail),
  });
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.classification}:${finding.severity}:${finding.area}:${finding.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeFindings(base, extra) {
  return {
    verified: dedupeFindings([...(base.verified || []), ...(extra.verified || [])]).sort(compareFindings),
    probable: dedupeFindings([...(base.probable || []), ...(extra.probable || [])]).sort(compareFindings),
    heuristic: dedupeFindings([...(base.heuristic || []), ...(extra.heuristic || [])]).sort(compareFindings),
  };
}

function extractFirestoreCollectionsFromDart(contentMap) {
  const collections = new Set();
  for (const text of Object.values(contentMap)) {
    for (const collection of extractMatches(text, /collection\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      if (/^[a-z0-9_-]+$/i.test(collection)) {
        collections.add(collection);
      }
    }
  }
  return [...collections].sort();
}

function extractFirestoreCollectionsFromRules(rulesText) {
  const collections = new Set();
  for (const collection of extractMatches(rulesText, /\/([A-Za-z0-9_-]+)\/\{/g)) {
    if (!['databases', 'documents'].includes(collection)) {
      collections.add(collection);
    }
  }
  return [...collections].sort();
}

function hasAnyPatternInMap(contentMap, patterns) {
  return Object.values(contentMap).some((text) => patterns.some((pattern) => pattern.test(text)));
}

function parseArbFile(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildNextReactAudit(cwd, files, rootManifest) {
  const findings = {
    verified: [],
    probable: [],
    heuristic: [],
  };
  const dependencies = {
    ...(rootManifest.dependencies || {}),
    ...(rootManifest.devDependencies || {}),
  };
  const authDeps = Object.keys(dependencies).filter((name) => NEXT_AUTH_DEPS.includes(name));
  const routeFiles = files.filter((filePath) => /(^|\/)(app\/api\/.+\/route|pages\/api\/.+|api\/.+)\.(ts|tsx|js|jsx)$/.test(filePath));
  const pageFiles = files.filter((filePath) => /(^|\/)(app|pages)\/.+\/(page|layout)\.(tsx|jsx|ts|js)$/.test(filePath));
  const loadingFiles = files.filter((filePath) => /(^|\/)(loading|error|not-found)\.(tsx|jsx|ts|js)$/.test(filePath));
  const middlewareFiles = files.filter((filePath) => /(^|\/)middleware\.(ts|tsx|js|jsx)$/.test(filePath));
  const relevantFiles = uniqueSorted([
    ...routeFiles,
    ...pageFiles,
    ...middlewareFiles,
    ...loadingFiles,
    ...files.filter((filePath) => /(^|\/)(src\/)?(auth|lib\/auth|server|services|components)\//.test(filePath)),
  ]);
  const contentMap = buildContentMap(cwd, relevantFiles);
  const authSignalsPresent = hasAnyPatternInMap(contentMap, [
    /\b(getServerSession|auth\(|auth\.)\b/,
    /\b(clerkMiddleware|currentUser|getAuth)\b/,
    /\b(handleAuth|withPageAuthRequired|withApiAuthRequired)\b/,
    /\b(redirect\(['"`]\/sign-in|redirect\(['"`]\/login)\b/,
  ]);
  const routeTests = files.filter((filePath) => isTestFile(filePath) && /\b(api|route|handler)\b/i.test(filePath));
  const loadingSignalsMissing = pageFiles.length > 0 && loadingFiles.length === 0;
  const clientBoundaryViolations = [];

  for (const [filePath, text] of Object.entries(contentMap)) {
    if (!/^\s*['"]use client['"]\s*;?/m.test(text)) {
      continue;
    }
    if (/\b(next\/headers|server-only)\b/.test(text) || /\b(cookies|headers)\s*\(/.test(text) || /process\.env\.(?!NEXT_PUBLIC_)/.test(text)) {
      clientBoundaryViolations.push(filePath);
    }
  }

  if (clientBoundaryViolations.length > 0) {
    findings.verified.push(makeFinding(
      'verified',
      'high',
      'Client components reference server-only runtime APIs',
      'One or more `use client` files import server-only modules or read non-public environment variables. This creates route-to-runtime contract drift that should be fixed before trust gates rely on the UI.',
      clientBoundaryViolations[0],
      clientBoundaryViolations,
      0.93,
    ));
  }

  if (authDeps.length > 0 && middlewareFiles.length === 0 && !authSignalsPresent) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Auth dependencies are present without visible route or middleware enforcement',
      'Auth packages were detected, but no middleware, server session guard, or auth boundary signal was found in routes or app code.',
      'app',
      ['package.json', ...pageFiles.slice(0, 3), ...routeFiles.slice(0, 3)],
      0.83,
    ));
  }

  if (routeFiles.length > 0 && routeTests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Route handlers have no visible owned tests',
      'API or route handlers were found, but no route-focused tests were detected. This leaves the route -> service -> data contract under-specified for audit correction work.',
      routeFiles[0],
      routeFiles.slice(0, 5),
      0.84,
    ));
  }

  if (loadingSignalsMissing) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'App Router pages lack explicit loading or error states',
      'Page or layout files exist, but no `loading.tsx`, `error.tsx`, or `not-found.tsx` files were found nearby. This often hides failure-state drift between UI and API behavior.',
      pageFiles[0],
      pageFiles.slice(0, 4),
      0.76,
    ));
  }

  if (pageFiles.length > 0 && !files.some((filePath) => isTestFile(filePath) && /\b(page|ui|component|screen)\b/i.test(filePath))) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Frontend routes have thin direct UI verification signals',
      'Page-level files were found, but no obvious page or component tests were detected. Treat this as a cue to add browser evidence or targeted UI coverage.',
      pageFiles[0],
      pageFiles.slice(0, 4),
      0.63,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'next-react',
      summary: [
        `Auth deps: ${authDeps.join(', ') || 'none'}`,
        `Route handlers: ${routeFiles.length}`,
        `Pages/layouts: ${pageFiles.length}`,
        `Middleware files: ${middlewareFiles.length}`,
        `Route tests: ${routeTests.length}`,
      ],
      contractRisks: [
        authDeps.length > 0 && middlewareFiles.length === 0 && !authSignalsPresent
          ? `auth deps without visible enforcement: ${authDeps.join(', ')}`
          : null,
        clientBoundaryViolations.length > 0
          ? `client/server boundary drift in ${clientBoundaryViolations.join(', ')}`
          : null,
        routeFiles.length > 0 && routeTests.length === 0
          ? 'route handlers have no visible owned tests'
          : null,
        loadingSignalsMissing
          ? 'page routes lack explicit loading/error boundaries'
          : null,
      ].filter(Boolean),
      signals: {
        authDeps,
        routeFiles,
        pageFiles,
        middlewareFiles,
        routeTests,
      },
    },
  };
}

function buildNodeMonorepoAudit(cwd, files, graph, units) {
  const findings = {
    verified: [],
    probable: [],
    heuristic: [],
  };
  const packageByName = new Map((graph.packages || []).map((pkg) => [pkg.name, pkg]));
  const workspaceConsumers = (units || []).filter((unit) => unit.type === 'package' || unit.type === 'app');
  const manifests = new Map(workspaceConsumers.map((unit) => [
    unit.path,
    readJson(path.join(cwd, unit.manifestPath), {}),
  ]));

  const rootOnlyPackages = workspaceConsumers.filter((unit) => unit.verifyScripts.length === 0 && (unit.inheritedVerifyScripts || []).length > 0);
  if (rootOnlyPackages.length >= Math.max(2, Math.ceil(workspaceConsumers.length / 2))) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Most workspace packages rely on root-only verification',
      'A large share of workspace packages do not expose their own verify scripts, which makes correction planning and ownership blurry in large monorepos.',
      'repo',
      rootOnlyPackages.slice(0, 6).map((unit) => unit.manifestPath),
      0.8,
    ));
  }

  for (const unit of workspaceConsumers) {
    const manifest = manifests.get(unit.path) || {};
    if (unit.dependentCount >= 2 && unit.testFiles.length === 0 && unit.verifyScripts.length === 0) {
      findings.verified.push(makeFinding(
        'verified',
        'high',
        'Shared package fans out without owned tests or verify scripts',
        `This package has ${unit.dependentCount} downstream consumers, but it lacks both local tests and a package-owned verify entrypoint.`,
        unit.path,
        [unit.manifestPath, ...unit.sourceFiles.slice(0, 4)],
        0.91,
      ));
    }

    if (unit.dependentCount > 0 && !manifest.exports && !manifest.main && !manifest.types) {
      findings.probable.push(makeFinding(
        'probable',
        unit.dependentCount >= 3 ? 'high' : 'medium',
        'Internal package has downstream consumers but no explicit public contract surface',
        'The package is consumed internally, but its manifest does not define `exports`, `main`, or `types`. That usually means cross-package imports are implicit and easy to drift.',
        unit.path,
        [unit.manifestPath],
        0.78,
      ));
    }

    const unresolvedWorkspaceDeps = Object.keys({
      ...(manifest.dependencies || {}),
      ...(manifest.devDependencies || {}),
      ...(manifest.peerDependencies || {}),
    }).filter((name) => /^@/.test(name) && !packageByName.has(name));
    if (unresolvedWorkspaceDeps.length > 0) {
      findings.probable.push(makeFinding(
        'probable',
        'medium',
        'Workspace manifest references internal-looking packages that are not present in the package graph',
        `The manifest references ${unresolvedWorkspaceDeps.join(', ')}, but those packages were not discovered in the workspace graph.`,
        unit.path,
        [unit.manifestPath],
        0.74,
      ));
    }
  }

  if ((graph.packages || []).length > 1 && !files.some((filePath) => /^\.github\/workflows\//.test(filePath))) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Monorepo has no repo-level CI workflow',
      'A large workspace repo is present, but no repo-level CI workflow was detected. This weakens cross-package regression detection.',
      'repo',
      ['.github/workflows/'],
      0.62,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'node-monorepo',
      summary: [
        `Workspace packages: ${workspaceConsumers.length}`,
        `Root-only verify packages: ${rootOnlyPackages.length}`,
        `Packages with dependents: ${workspaceConsumers.filter((unit) => unit.dependentCount > 0).length}`,
      ],
      contractRisks: [
        rootOnlyPackages.length >= Math.max(2, Math.ceil(workspaceConsumers.length / 2))
          ? 'most packages rely on root-only verification'
          : null,
        ...workspaceConsumers
          .filter((unit) => unit.dependentCount >= 2 && unit.testFiles.length === 0 && unit.verifyScripts.length === 0)
          .slice(0, 4)
          .map((unit) => `${unit.path} fans out to ${unit.dependentCount} consumers without owned verification`),
      ].filter(Boolean),
      signals: {
        packageCount: workspaceConsumers.length,
        rootOnlyVerifyPackages: rootOnlyPackages.map((unit) => unit.path),
      },
    },
  };
}

function buildExpressApiAudit(cwd, files) {
  const findings = { verified: [], probable: [], heuristic: [] };
  const routeFiles = files.filter((filePath) => /(^|\/)(api|routes?|controllers?)\/.+\.(ts|js|mjs|cjs)$/i.test(filePath));
  const middlewareFiles = files.filter((filePath) => /(^|\/)middleware\/.+\.(ts|js|mjs|cjs)$/i.test(filePath) || /middleware\.(ts|js)$/i.test(filePath));
  const tests = files.filter((filePath) => isTestFile(filePath) && /\b(api|route|controller|auth|middleware)\b/i.test(filePath));
  const contentMap = buildContentMap(cwd, uniqueSorted([...routeFiles, ...middlewareFiles]));
  const authSignals = hasAnyPatternInMap(contentMap, [
    /\b(authenticate|authorize|requireAuth|requireSession|passport|jwt)\b/i,
    /\b(router\.use\(.+auth|app\.use\(.+auth)\b/i,
  ]);
  const errorHandler = hasAnyPatternInMap(contentMap, [
    /\bnext\s*\(\s*err\s*\)/,
    /\bapp\.use\s*\(\s*\(\s*err\b/,
    /\berrorHandler\b/,
  ]);

  if (routeFiles.length > 0 && tests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Express route surfaces have no visible owned tests',
      'Route or controller files were found, but no API-focused tests were detected near the service surface.',
      routeFiles[0],
      routeFiles.slice(0, 6),
      0.84,
    ));
  }
  if (routeFiles.some((filePath) => /auth|session|user|admin/i.test(filePath)) && !authSignals && middlewareFiles.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Auth-sensitive routes lack visible middleware enforcement',
      'The API surface looks auth-sensitive, but no clear auth middleware or guard signal was detected.',
      routeFiles[0],
      routeFiles.slice(0, 5),
      0.79,
    ));
  }
  if (routeFiles.length > 0 && !errorHandler) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Express API lacks a visible central error handler',
      'No obvious error-handling middleware was found in the scanned API surface. This is a useful audit hint for closeout safety.',
      routeFiles[0],
      routeFiles.slice(0, 4),
      0.62,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'express-api',
      summary: [
        `Routes/controllers: ${routeFiles.length}`,
        `Middleware files: ${middlewareFiles.length}`,
        `API tests: ${tests.length}`,
      ],
      contractRisks: [
        routeFiles.length > 0 && tests.length === 0 ? 'API routes have no visible owned tests' : null,
        routeFiles.some((filePath) => /auth|session|user|admin/i.test(filePath)) && !authSignals && middlewareFiles.length === 0
          ? 'auth-sensitive routes lack visible middleware enforcement'
          : null,
      ].filter(Boolean),
    },
  };
}

function buildSupabasePgAudit(cwd, files) {
  const findings = { verified: [], probable: [], heuristic: [] };
  const schemaFiles = files.filter((filePath) => /(^|\/)(supabase\/migrations\/.+\.sql|migrations?\/.+\.sql|schema\.sql|prisma\/schema\.prisma|drizzle\/.+\.(sql|ts))$/i.test(filePath));
  const dataFiles = files.filter((filePath) => /(^|\/)(db|data|repository|repositories|queries?|sql|prisma)\//i.test(filePath));
  const tests = files.filter((filePath) => isTestFile(filePath) && /\b(db|data|repo|query|sql|prisma|supabase)\b/i.test(filePath));

  if (dataFiles.length > 0 && schemaFiles.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Data-access surface lacks visible schema or migration files',
      'Repository or query files were found, but no schema or migration surface was discovered nearby.',
      dataFiles[0],
      dataFiles.slice(0, 6),
      0.78,
    ));
  }
  if (schemaFiles.length > 0 && tests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Schema-bearing data layer has no visible contract tests',
      'Schema or migration files are present, but no data-focused tests were detected to prove the query contract stays aligned.',
      schemaFiles[0],
      schemaFiles.slice(0, 5),
      0.82,
    ));
  }
  if (files.some((filePath) => filePath.startsWith('supabase/')) && !files.some((filePath) => /policy|rls|seed/i.test(filePath))) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Supabase surface has thin visible policy signals',
      'Supabase files were found, but no obvious policy or seed artifacts were detected in the scanned repo surface.',
      'supabase',
      files.filter((filePath) => filePath.startsWith('supabase/')).slice(0, 5),
      0.6,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'supabase-pg',
      summary: [
        `Schema/migration files: ${schemaFiles.length}`,
        `Data-access files: ${dataFiles.length}`,
        `Data tests: ${tests.length}`,
      ],
      contractRisks: [
        dataFiles.length > 0 && schemaFiles.length === 0 ? 'data-access code lacks visible schema or migration files' : null,
        schemaFiles.length > 0 && tests.length === 0 ? 'schema-bearing data layer has no visible contract tests' : null,
      ].filter(Boolean),
    },
  };
}

function buildStripeAudit(cwd, files) {
  const findings = { verified: [], probable: [], heuristic: [] };
  const routeFiles = files.filter((filePath) => /(^|\/)(api|routes?|app\/api)\/.+\.(ts|js|tsx|jsx)$/i.test(filePath));
  const webhookRoutes = routeFiles.filter((filePath) => /webhook|stripe/i.test(filePath));
  const tests = files.filter((filePath) => isTestFile(filePath) && /\b(stripe|billing|checkout|subscription|webhook)\b/i.test(filePath));
  const contentMap = buildContentMap(cwd, webhookRoutes);
  const eventHandlingSignals = hasAnyPatternInMap(contentMap, [
    /\bconstructEvent\b/,
    /\bwebhooks?\./i,
    /\bidempot/i,
  ]);

  if (routeFiles.length > 0 && webhookRoutes.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Stripe dependency lacks a visible webhook surface',
      'Stripe is typically unsafe to audit without a webhook or billing callback route, but none was found in the scanned API files.',
      'api',
      routeFiles.slice(0, 5),
      0.83,
    ));
  }
  if (tests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Stripe or billing flows have no visible targeted tests',
      'No checkout, webhook, billing, or subscription-focused tests were found for the Stripe integration surface.',
      webhookRoutes[0] || 'api',
      webhookRoutes.length > 0 ? webhookRoutes.slice(0, 4) : routeFiles.slice(0, 4),
      0.78,
    ));
  }
  if (webhookRoutes.length > 0 && !eventHandlingSignals) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Webhook routes lack visible event-verification or idempotency signals',
      'Webhook files were found, but no obvious event construction or idempotency signal was detected in the scanned surface.',
      webhookRoutes[0],
      webhookRoutes.slice(0, 4),
      0.61,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'stripe',
      summary: [
        `API routes: ${routeFiles.length}`,
        `Webhook routes: ${webhookRoutes.length}`,
        `Stripe tests: ${tests.length}`,
      ],
      contractRisks: [
        routeFiles.length > 0 && webhookRoutes.length === 0 ? 'stripe integration lacks a visible webhook route' : null,
        tests.length === 0 ? 'stripe flows have no visible targeted tests' : null,
      ].filter(Boolean),
    },
  };
}

function buildAuthAudit(cwd, files) {
  const findings = { verified: [], probable: [], heuristic: [] };
  const authFiles = files.filter((filePath) => /(^|\/)(auth|session|middleware|guards?)\//i.test(filePath) || /middleware\.(ts|js|tsx|jsx)$/i.test(filePath));
  const tests = files.filter((filePath) => isTestFile(filePath) && /\b(auth|session|login|signin|middleware)\b/i.test(filePath));
  const contentMap = buildContentMap(cwd, authFiles);
  const enforcementSignals = hasAnyPatternInMap(contentMap, [
    /\b(auth|session|requireUser|redirect)\b/i,
    /\bmiddleware\b/i,
  ]);

  if (authFiles.length > 0 && tests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Authentication surface has no visible targeted tests',
      'Auth or session-bearing files were found, but no auth-focused tests were detected nearby.',
      authFiles[0],
      authFiles.slice(0, 6),
      0.82,
    ));
  }
  if (authFiles.length > 0 && !enforcementSignals) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Authentication files have thin visible enforcement signals',
      'Auth files were found, but the scanned surface does not clearly show middleware or route enforcement.',
      authFiles[0],
      authFiles.slice(0, 4),
      0.6,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'auth',
      summary: [
        `Auth-related files: ${authFiles.length}`,
        `Auth tests: ${tests.length}`,
      ],
      contractRisks: [
        authFiles.length > 0 && tests.length === 0 ? 'auth surface has no visible targeted tests' : null,
      ].filter(Boolean),
    },
  };
}

function buildWorkersCloudflareAudit(cwd, files) {
  const findings = { verified: [], probable: [], heuristic: [] };
  const wranglerFiles = files.filter((filePath) => /^wrangler\.(toml|json|jsonc)$/.test(filePath));
  const workerFiles = files.filter((filePath) => /(^|\/)(workers?|src)\/.+\.(ts|js|mjs|cjs)$/i.test(filePath));
  const tests = files.filter((filePath) => isTestFile(filePath) && /\b(worker|edge|wrangler|fetch)\b/i.test(filePath));
  const contentMap = buildContentMap(cwd, workerFiles);
  const observabilitySignals = hasAnyPatternInMap(contentMap, [
    /\bconsole\.(error|log|warn)\b/,
    /\bwaitUntil\b/,
    /\bctx\./,
  ]);

  if (workerFiles.length > 0 && wranglerFiles.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Worker entrypoints exist without visible wrangler config',
      'Worker-like entrypoints were found, but no wrangler config file was detected in the repo root.',
      workerFiles[0],
      workerFiles.slice(0, 5),
      0.77,
    ));
  }
  if (workerFiles.length > 0 && tests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Cloudflare Worker surface has no visible targeted tests',
      'Worker entrypoints were found, but no edge or worker-focused tests were detected nearby.',
      workerFiles[0],
      workerFiles.slice(0, 5),
      0.79,
    ));
  }
  if (workerFiles.length > 0 && !observabilitySignals) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Worker runtime has thin visible observability signals',
      'The scanned Worker surface does not show obvious logging or runtime instrumentation signals.',
      workerFiles[0],
      workerFiles.slice(0, 4),
      0.59,
    ));
  }

  return {
    findings,
    diagnostics: {
      stackId: 'workers-cloudflare',
      summary: [
        `Wrangler config files: ${wranglerFiles.length}`,
        `Worker entry files: ${workerFiles.length}`,
        `Worker tests: ${tests.length}`,
      ],
      contractRisks: [
        workerFiles.length > 0 && wranglerFiles.length === 0 ? 'worker entrypoints lack visible wrangler config' : null,
        workerFiles.length > 0 && tests.length === 0 ? 'worker surface has no visible targeted tests' : null,
      ].filter(Boolean),
    },
  };
}

function buildFlutterFirebaseAudit(cwd, files) {
  const findings = {
    verified: [],
    probable: [],
    heuristic: [],
  };
  const pubspecPath = files.find((filePath) => filePath === 'pubspec.yaml');
  const pubspecText = pubspecPath ? safeReadText(path.join(cwd, pubspecPath)) : '';
  if (!pubspecText) {
    return {
      findings,
      diagnostics: {
        stackId: 'flutter-firebase',
        summary: ['Flutter/Firebase stack was requested but `pubspec.yaml` was not found.'],
        contractRisks: [],
      },
    };
  }

  const dartFiles = files.filter((filePath) => filePath.endsWith('.dart'));
  const arbFiles = files.filter((filePath) => /^lib\/l10n\/.+\.arb$/i.test(filePath));
  const contentMap = buildContentMap(cwd, [
    ...dartFiles,
    ...arbFiles,
    ...files.filter((filePath) => /(^|\/)(firestore\.rules|storage\.rules|firebase\.json|google-services\.json|GoogleService-Info\.plist)$/.test(filePath)),
  ]);
  const firebaseDeps = declaredDependencies(pubspecText, FLUTTER_FIREBASE_DEPS);
  const deepLinkDeps = declaredDependencies(pubspecText, FLUTTER_DEEP_LINK_DEPS);
  const adsDeps = declaredDependencies(pubspecText, FLUTTER_ADS_DEPS);
  const premiumDeps = declaredDependencies(pubspecText, FLUTTER_PREMIUM_DEPS);
  const wiringDeps = declaredDependencies(pubspecText, FLUTTER_WIRING_DEPS);
  const mainFile = files.find((filePath) => filePath === 'lib/main.dart') || files.find((filePath) => /^lib\/.+main.+\.dart$/i.test(filePath)) || '';
  const mainText = mainFile ? contentMap[mainFile] || safeReadText(path.join(cwd, mainFile)) : '';
  const firestoreRulesPath = files.find((filePath) => /(^|\/)firestore\.rules$/.test(filePath)) || '';
  const firestoreRulesText = firestoreRulesPath ? contentMap[firestoreRulesPath] || '' : '';
  const dartCollections = extractFirestoreCollectionsFromDart(contentMap);
  const rulesCollections = extractFirestoreCollectionsFromRules(firestoreRulesText);
  const wildcardRules = /match\s+\/\{[A-Za-z0-9_]+=\\*\\*}/.test(firestoreRulesText) || /match\s+\/\{document=\*\*}/.test(firestoreRulesText);
  const localeParities = [];
  const localePayloads = arbFiles.map((filePath) => ({
    filePath,
    data: parseArbFile(contentMap[filePath] || ''),
  })).filter((entry) => entry.data);
  const localeKeyMap = new Map(localePayloads.map((entry) => [
    entry.filePath,
    new Set(Object.keys(entry.data).filter((key) => !key.startsWith('@') && key !== '@@locale')),
  ]));
  const allLocaleKeys = new Set([...localeKeyMap.values()].flatMap((set) => [...set]));
  for (const [filePath, keys] of localeKeyMap.entries()) {
    const missing = [...allLocaleKeys].filter((key) => !keys.has(key));
    if (missing.length > 0) {
      localeParities.push({
        filePath,
        missing,
      });
    }
  }
  const deepLinkHandlersPresent = hasAnyPatternInMap(contentMap, [
    /uriLinkStream/,
    /getInitialLink\s*\(/,
    /AppLinks\s*\(/,
    /FirebaseDynamicLinks\.instance/,
    /\.onLink\b/,
    /getInitialAppLink\s*\(/,
  ]);
  const adsInitPresent = hasAnyPatternInMap(contentMap, [
    /MobileAds\.instance\.initialize\s*\(/,
    /MobileAds\.instance\.updateRequestConfiguration\s*\(/,
  ]);
  const premiumWiringPresent = hasAnyPatternInMap(contentMap, [
    /InAppPurchase\.instance/,
    /purchaseStream/,
    /Purchases\.configure\s*\(/,
    /Purchases\.setup\s*\(/,
    /CustomerInfo/,
    /entitlement/i,
    /offerings/i,
  ]);
  const providerFiles = files.filter((filePath) => /^lib\/.+(provider|notifier|bloc|controller|state).+\.dart$/i.test(filePath) || /^lib\/(providers|state|blocs|controllers|notifiers)\//i.test(filePath));
  const serviceFiles = files.filter((filePath) => /^lib\/(services|repositories)\//i.test(filePath));
  const wiringSignalsPresent = wiringDeps.length > 0 || providerFiles.length > 0 || hasAnyPatternInMap(contentMap, [
    /ChangeNotifierProvider/,
    /Provider</,
    /StateNotifierProvider/,
    /BlocProvider/,
    /GetIt\.I/,
    /GetIt\.instance/,
    /registerSingleton/,
    /registerLazySingleton/,
  ]);
  const deepLinkTests = files.filter((filePath) => isTestFile(filePath) && /\b(link|deeplink|dynamic)\b/i.test(filePath));
  const adsTests = files.filter((filePath) => isTestFile(filePath) && /\b(ad|ads|banner|reward)\b/i.test(filePath));
  const premiumTests = files.filter((filePath) => isTestFile(filePath) && /\b(premium|subscription|paywall|purchase)\b/i.test(filePath));

  if (!mainFile) {
    findings.verified.push(makeFinding(
      'verified',
      'critical',
      'Flutter app has no visible startup entrypoint',
      'A Flutter/Firebase app should expose `lib/main.dart` or an equivalent startup file so bootstrap and runtime wiring can be audited.',
      'lib',
      ['lib/main.dart'],
      0.99,
    ));
  }

  if (firebaseDeps.length > 0 && !/Firebase\.initializeApp\s*\(/.test(mainText) && !hasAnyPatternInMap(contentMap, [/Firebase\.initializeApp\s*\(/])) {
    findings.verified.push(makeFinding(
      'verified',
      'high',
      'Firebase dependencies are present but startup does not visibly initialize Firebase',
      'Firebase packages were declared, but no `Firebase.initializeApp()` call was found in the startup path or other Dart files.',
      mainFile || 'lib',
      [mainFile || 'lib/main.dart', 'pubspec.yaml'],
      0.95,
    ));
  }

  if (firebaseDeps.includes('cloud_firestore') && firestoreRulesPath && dartCollections.length > 0 && !wildcardRules) {
    const missingRuleCollections = dartCollections.filter((collection) => !rulesCollections.includes(collection));
    if (missingRuleCollections.length > 0) {
      findings.verified.push(makeFinding(
        'verified',
        'high',
        'Firestore collections used in Dart are missing from firestore.rules',
        `Dart code references ${missingRuleCollections.join(', ')}, but those collections are not visible in Firestore rules. This is the exact model/service/rules drift the repo audit should catch.`,
        'firestore.rules',
        [firestoreRulesPath, ...dartFiles.filter((filePath) => /service|repo|data|model/i.test(filePath)).slice(0, 3)],
        0.92,
      ));
    }
    const unusedRuleCollections = rulesCollections.filter((collection) => !dartCollections.includes(collection));
    if (unusedRuleCollections.length > 0) {
      findings.heuristic.push(makeFinding(
        'heuristic',
        'low',
        'Firestore rules expose collections with no visible Dart callers',
        `Rules define ${unusedRuleCollections.join(', ')}, but current Dart collection references do not mention them. This may be stale policy surface or just an unscanned path.`,
        'firestore.rules',
        [firestoreRulesPath],
        0.58,
      ));
    }
  }

  if (localeParities.length > 0) {
    findings.verified.push(makeFinding(
      'verified',
      'medium',
      'Localization keys drift across ARB locales',
      localeParities.map((item) => `${path.basename(item.filePath)} missing ${item.missing.join(', ')}`).join('; '),
      'lib/l10n',
      localeParities.map((item) => item.filePath),
      0.97,
    ));
  }

  if (deepLinkDeps.length > 0 && !deepLinkHandlersPresent) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Deep-link packages are declared without a visible startup handler',
      'The repo declares deep-link dependencies, but no `getInitialLink`, `uriLinkStream`, `AppLinks`, or `FirebaseDynamicLinks` handler was found in Dart code.',
      mainFile || 'lib',
      [mainFile || 'lib/main.dart', 'pubspec.yaml'],
      0.82,
    ));
  }

  if (adsDeps.length > 0 && !adsInitPresent) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Ads SDK is present without visible initialization',
      'The repo depends on `google_mobile_ads`, but `MobileAds.instance.initialize()` or equivalent startup configuration was not found.',
      mainFile || 'lib',
      [mainFile || 'lib/main.dart', 'pubspec.yaml'],
      0.84,
    ));
  }

  if (premiumDeps.length > 0 && !premiumWiringPresent) {
    findings.probable.push(makeFinding(
      'probable',
      'high',
      'Premium or purchase dependencies lack visible runtime wiring',
      'Purchase dependencies were declared, but no purchase stream, entitlement, or RevenueCat wiring was detected in Dart code.',
      'lib',
      ['pubspec.yaml', ...serviceFiles.slice(0, 3)],
      0.81,
    ));
  }

  if (serviceFiles.length >= 2 && !wiringSignalsPresent) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Service layer exists without a visible provider or registration boundary',
      'Multiple service/repository files exist, but no Provider, Riverpod, Bloc, or GetIt-style wiring surface was detected. This often means service-layer drift is hidden in ad hoc startup code.',
      'lib/services',
      serviceFiles.slice(0, 4),
      0.74,
    ));
  }

  if (deepLinkDeps.length > 0 && deepLinkTests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Deep-link behavior has no visible widget or integration tests',
      'Deep-link runtime is high-risk in Flutter apps because startup timing matters, but no matching widget or integration tests were found.',
      'test',
      [mainFile || 'lib/main.dart'],
      0.78,
    ));
  }

  if (adsDeps.length > 0 && adsTests.length === 0) {
    findings.heuristic.push(makeFinding(
      'heuristic',
      'low',
      'Ads surface has no obvious targeted tests',
      'No ad-focused widget or integration tests were found. This is a useful audit hint, not a blocker by itself.',
      'test',
      ['pubspec.yaml'],
      0.62,
    ));
  }

  if (premiumDeps.length > 0 && premiumTests.length === 0) {
    findings.probable.push(makeFinding(
      'probable',
      'medium',
      'Premium flow has no obvious targeted tests',
      'Premium or purchase logic is present, but no matching widget or integration tests were found for subscription, purchase, or paywall behavior.',
      'test',
      ['pubspec.yaml', ...serviceFiles.slice(0, 2)],
      0.77,
    ));
  }

  const contractRisks = [
    firebaseDeps.length > 0 && !/Firebase\.initializeApp\s*\(/.test(mainText) && !hasAnyPatternInMap(contentMap, [/Firebase\.initializeApp\s*\(/])
      ? 'startup bootstrap does not visibly initialize Firebase'
      : null,
    firebaseDeps.includes('cloud_firestore') && dartCollections.length > 0 && rulesCollections.length > 0 && !wildcardRules
      ? `dart collections=${dartCollections.join(', ') || 'none'} / rules collections=${rulesCollections.join(', ') || 'none'}`
      : null,
    localeParities.length > 0
      ? `locale drift in ${localeParities.map((item) => path.basename(item.filePath)).join(', ')}`
      : null,
    deepLinkDeps.length > 0 && !deepLinkHandlersPresent
      ? `deep-link deps without visible handler: ${deepLinkDeps.join(', ')}`
      : null,
    adsDeps.length > 0 && !adsInitPresent
      ? `ads deps without visible init: ${adsDeps.join(', ')}`
      : null,
    premiumDeps.length > 0 && !premiumWiringPresent
      ? `premium deps without runtime wiring: ${premiumDeps.join(', ')}`
      : null,
  ].filter(Boolean);

  return {
    findings,
    diagnostics: {
      stackId: 'flutter-firebase',
      summary: [
        `Firebase deps: ${firebaseDeps.join(', ') || 'none'}`,
        `Firestore collections in Dart: ${dartCollections.join(', ') || 'none'}`,
        `Firestore collections in rules: ${rulesCollections.join(', ') || 'none'}`,
        `Locale files: ${arbFiles.length > 0 ? arbFiles.join(', ') : 'none'}`,
        `Deep-link deps: ${deepLinkDeps.join(', ') || 'none'}`,
        `Ads deps: ${adsDeps.join(', ') || 'none'}`,
        `Premium deps: ${premiumDeps.join(', ') || 'none'}`,
        `Service files: ${serviceFiles.length}`,
      ],
      contractRisks,
      signals: {
        firebaseDeps,
        dartCollections,
        rulesCollections,
        locales: arbFiles,
        deepLinkDeps,
        adsDeps,
        premiumDeps,
        wiringDeps,
      },
    },
  };
}

function buildStackAudit(cwd, files, stackPack, context = {}) {
  if (stackPack.id === 'flutter-firebase') {
    return buildFlutterFirebaseAudit(cwd, files);
  }
  if (stackPack.id === 'next-react') {
    return buildNextReactAudit(cwd, files, context.rootManifest || {});
  }
  if (stackPack.id === 'node-monorepo') {
    return buildNodeMonorepoAudit(cwd, files, context.graph || {}, context.units || []);
  }
  if (stackPack.id === 'express-api') {
    return buildExpressApiAudit(cwd, files);
  }
  if (stackPack.id === 'supabase-pg') {
    return buildSupabasePgAudit(cwd, files);
  }
  if (stackPack.id === 'stripe') {
    return buildStripeAudit(cwd, files);
  }
  if (stackPack.id === 'auth') {
    return buildAuthAudit(cwd, files);
  }
  if (stackPack.id === 'workers-cloudflare') {
    return buildWorkersCloudflareAudit(cwd, files);
  }
  return {
    findings: {
      verified: [],
      probable: [],
      heuristic: [],
    },
    diagnostics: {
      stackId: stackPack.id,
      summary: [],
      contractRisks: [],
    },
  };
}

function buildRepoFindings(cwd, files, graph, units, stackPack, rootManifest, rootVerifyScripts) {
  const repoSourceFiles = files.filter((filePath) => isSourceFile(filePath));
  const repoTestFiles = files.filter((filePath) => isTestFile(filePath));
  const ciWorkflows = listCiWorkflows(files);
  const lockfiles = listLockfiles(files);
  const findings = {
    verified: [],
    probable: [],
    heuristic: [],
  };

  if (repoSourceFiles.length > 0 && repoTestFiles.length === 0) {
    findings.verified.push(makeFinding(
      'verified',
      'high',
      'Repository has executable code but no automated tests',
      'The repo contains source files but no test files were discovered, so full-repo audit and correction work would rely on manual verification.',
      'repo',
      repoSourceFiles.slice(0, 6),
      0.98,
    ));
  }

  if (ciWorkflows.length === 0) {
    findings.verified.push(makeFinding(
      'verified',
      'medium',
      'Repository has no CI workflow',
      'No `.github/workflows/*` file was found, so regressions can escape local-only validation.',
      'repo',
      ['.github/workflows/'],
      0.97,
    ));
  }

  if (repoSourceFiles.length > 0 && rootVerifyScripts.length === 0) {
    findings.verified.push(makeFinding(
      'verified',
      'medium',
      'Repository has no stable verify entrypoint',
      'The root manifest does not expose a canonical `test` / `lint` / `typecheck` / `build` script family, which slows audit correction loops.',
      'repo',
      ['package.json'],
      0.95,
    ));
  }

  if (lockfiles.length === 0 && fs.existsSync(path.join(cwd, 'package.json'))) {
    findings.probable.push(makeFinding(
      'probable',
      'low',
      'Dependency installs may drift between machines',
      'A root `package.json` is present but no lockfile was detected, so reproduction and CI parity are weaker than they should be.',
      'repo',
      ['package.json'],
      0.79,
    ));
  }

  for (const unit of units) {
    const highRisk = unit.tags.some((tag) => ['auth', 'api', 'data', 'jobs', 'payments', 'firebase', 'rules'].includes(tag));
    if (unit.sourceFiles.length === 0) {
      continue;
    }
    if (highRisk && unit.testStatus === 'missing') {
      findings.verified.push(makeFinding(
        'verified',
        'high',
        'High-risk area has no owned tests',
        'This area handles risky contracts or runtime behavior but no directly owned tests were found under the same package or subsystem surface.',
        unit.path,
        [unit.manifestPath, ...unit.sourceFiles.slice(0, 4)],
        0.93,
      ));
    }
    if (unit.dependentCount >= 2 && unit.testStatus !== 'covered') {
      findings.probable.push(makeFinding(
        'probable',
        unit.dependentCount >= 4 ? 'high' : 'medium',
        'Shared surface fans out without direct test ownership',
        `This package has ${unit.dependentCount} downstream dependents, but its verification surface is not clearly owned within the package.`,
        unit.path,
        [unit.manifestPath, ...unit.sourceFiles.slice(0, 4)],
        0.73,
      ));
    }
    if (graph.repoShape === 'monorepo'
      && unit.verifyScripts.length === 0
      && unit.packagePath !== '.'
      && rootVerifyScripts.length > 0) {
      findings.probable.push(makeFinding(
        'probable',
        'medium',
        'Package relies on root-only verification',
        'The package has no direct verify scripts, so the audit loop must guess which root command actually covers this surface.',
        unit.path,
        [unit.manifestPath],
        0.71,
      ));
    }
    if (unit.sourceFiles.length >= 8 && unit.testFiles.length === 0) {
      findings.probable.push(makeFinding(
        'probable',
        highRisk ? 'high' : 'medium',
        'Large code surface has thin local test density',
        'The subsystem is large enough that fix waves will be risky unless tests or targeted smoke checks are added nearby.',
        unit.path,
        [unit.manifestPath, ...unit.sourceFiles.slice(0, 4)],
        0.77,
      ));
    }
    if (graph.repoShape === 'monorepo'
      && unit.packagePath !== '.'
      && unit.dependentCount === 0
      && unit.internalDependencyCount === 0
      && unit.testFiles.length === 0
      && !unit.tags.some((tag) => ['app', 'config', 'frontend'].includes(tag))) {
      findings.heuristic.push(makeFinding(
        'heuristic',
        'low',
        'Possible orphan workspace',
        'This workspace has no internal dependency edges and no owned tests, so it may be stale or under-verified. Confirm usage before deleting or rewriting it.',
        unit.path,
        [unit.manifestPath],
        0.57,
      ));
    }
  }

  if (stackPack.id === 'flutter-firebase') {
    const fileSet = new Set(files);
    if (fileSet.has('firebase.json') && !fileSet.has('firestore.rules')) {
      findings.probable.push(makeFinding(
        'probable',
        'high',
        'Firebase config exists without Firestore rules in repo',
        'A Firebase-backed app usually needs visible datastore rules in the same audit pass so model/service/rules drift can be checked together.',
        'repo',
        ['firebase.json', 'firestore.rules'],
        0.76,
      ));
    }
  }

  return {
    verified: dedupeFindings(findings.verified).sort(compareFindings),
    probable: dedupeFindings(findings.probable).sort(compareFindings),
    heuristic: dedupeFindings(findings.heuristic).sort(compareFindings),
  };
}

function severityScore(severity) {
  return SEVERITY_ORDER[severity] || 0;
}

function compareFindings(left, right) {
  return (
    severityScore(right.severity) - severityScore(left.severity)
    || right.confidence - left.confidence
    || left.area.localeCompare(right.area)
    || left.title.localeCompare(right.title)
  );
}

function recommendedTestStrategy(unit) {
  const tags = new Set(unit.tags || []);
  if (tags.has('frontend') || tags.has('deeplink') || tags.has('ads')) {
    return {
      type: unit.testStatus === 'covered' ? 'browser-or-widget-smoke' : 'widget-or-browser-smoke',
      reason: 'UI-heavy or runtime-entry surfaces need behavior coverage beyond pure unit tests.',
    };
  }
  if (tags.has('auth') || tags.has('api') || tags.has('data') || tags.has('payments') || tags.has('firebase') || tags.has('rules')) {
    return {
      type: unit.testStatus === 'covered' ? 'owned-contract-tests' : 'contract-plus-integration',
      reason: 'High-risk contract surfaces should own tests near the package or subsystem boundary.',
    };
  }
  if (tags.has('jobs') || unit.dependentCount > 0) {
    return {
      type: 'integration-or-consumer-smoke',
      reason: 'Background jobs and shared packages need downstream-proof verification, not only root CI.',
    };
  }
  return {
    type: 'targeted-unit-or-smoke',
    reason: 'A small nearby test or smoke command is enough for this surface.',
  };
}

function buildTestGapMatrix(units, rootVerifyScripts) {
  return units
    .filter((unit) => unit.sourceFiles.length > 0)
    .map((unit) => {
      const strategy = recommendedTestStrategy(unit);
      return {
        area: unit.path,
        severity: unit.severity,
        riskScore: unit.riskScore,
        sourceFiles: unit.sourceFiles.length,
        testFiles: unit.testFiles.length,
        verifyScripts: unit.verifyScripts.length > 0 ? unit.verifyScripts : unit.packagePath !== '.' ? rootVerifyScripts : [],
        status: unit.testStatus,
        suggestedTestType: strategy.type,
        why: strategy.reason,
      };
    })
    .sort((left, right) => right.riskScore - left.riskScore || left.area.localeCompare(right.area));
}

function buildSubsystemHeatmap(units) {
  return units
    .filter((unit) => unit.sourceFiles.length > 0)
    .map((unit) => ({
      area: unit.path,
      name: unit.name,
      type: unit.type,
      severity: unit.severity,
      riskScore: unit.riskScore,
      sourceFiles: unit.sourceFiles.length,
      testFiles: unit.testFiles.length,
      dependentCount: unit.dependentCount,
      tags: unit.tags,
      testStatus: unit.testStatus,
      drivers: unit.riskDrivers.slice(0, 8),
      readFirst: uniqueSorted([unit.manifestPath, ...unit.sourceFiles.slice(0, 4), ...unit.testFiles.slice(0, 2)]).slice(0, 8),
    }))
    .sort((left, right) => right.riskScore - left.riskScore || left.area.localeCompare(right.area));
}

function buildPassOrder(heatmap, findings) {
  const findingAreas = new Map();
  for (const item of [...findings.verified, ...findings.probable]) {
    findingAreas.set(item.area, (findingAreas.get(item.area) || 0) + severityScore(item.severity));
  }

  return heatmap
    .map((item, index) => ({
      order: index + 1,
      area: item.area,
      severity: item.severity,
      riskScore: item.riskScore,
      why: [
        `${item.sourceFiles} source files`,
        `${item.testFiles} test files`,
        item.dependentCount > 0 ? `${item.dependentCount} dependents` : null,
        findingAreas.get(item.area) ? `active findings score ${findingAreas.get(item.area)}` : null,
      ].filter(Boolean).join(', '),
      readFirst: item.readFirst,
    }))
    .slice(0, 8);
}

function buildCorrectionPlan(findings, passOrder, manager, units) {
  const unitMap = new Map(units.map((unit) => [unit.path, unit]));
  const tasks = [];
  for (const finding of [...findings.verified, ...findings.probable].slice(0, 8)) {
    const unit = unitMap.get(finding.area);
    const verifyCommands = unit?.verifyCommands?.length
      ? unit.verifyCommands
      : [];
    tasks.push({
      patchGroupId: `${finding.area || 'repo'}:${finding.severity}:${finding.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72),
      title: finding.title,
      priority: finding.severity,
      area: finding.area,
      goal: finding.classification === 'verified'
        ? `Fix the verified issue in ${finding.area || 'repo'} and keep the patch reviewable.`
        : `Investigate and either fix or explicitly downgrade the probable issue in ${finding.area || 'repo'}.`,
      whyFound: finding.whyFound,
      fileRefs: finding.fileRefs,
      findingFingerprint: finding.fingerprint,
      verify: verifyCommands.slice(0, 4),
      verifyChain: verifyCommands.slice(0, 4),
      manager,
    });
  }
  if (tasks.length === 0 && passOrder.length > 0) {
    tasks.push({
      patchGroupId: `${passOrder[0].area}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72),
      title: 'Start with the top subsystem audit wave',
      priority: passOrder[0].severity,
      area: passOrder[0].area,
      goal: `Audit ${passOrder[0].area} first, then land the smallest safe verification improvement.`,
      whyFound: passOrder[0].why,
      fileRefs: passOrder[0].readFirst,
      findingFingerprint: '',
      verify: [],
      verifyChain: [],
      manager,
    });
  }
  return tasks;
}

function buildFollowOnPasses(payload) {
  const frontendAreas = payload.subsystemHeatmap
    .filter((item) => item.tags.includes('frontend') || payload.stackPack.id === 'next-react')
    .slice(0, 4)
    .map((item) => ({
      area: item.area,
      command: 'rai ui-review --json',
      why: `The audit heatmap marks ${item.area} as frontend-heavy and a dedicated UI pass should validate browser or state behavior.`,
    }));

  const simplifyBacklog = payload.correctionPlan
    .filter((item) => /large code surface|root-only verification|service layer exists/i.test(`${item.title} ${item.whyFound || ''}`))
    .slice(0, 5)
    .map((item) => ({
      area: item.area,
      command: `rai simplify --scope ${JSON.stringify(item.area)}`,
      why: `This audit finding reads like maintainability debt and is a good candidate for a behavior-preserving simplify wave after the risky fix lands.`,
    }));

  return {
    uiReview: frontendAreas,
    simplify: simplifyBacklog,
  };
}

function buildWorkflowObservations(cwd, graph) {
  const observations = [];
  if (!workflowInstalled(cwd)) {
    observations.push('Workflow docs are not installed; repo-health audit still runs, but continuity artifacts and lifecycle traceability are unavailable.');
  } else if (validationRowCount(cwd) === 0) {
    observations.push('Workflow is installed but VALIDATION.md is thin or empty; this is an observation, not a repo-health blocker.');
  }
  if ((graph.changedFiles || []).length > 0) {
    observations.push('Audit is reading the current working tree, so uncommitted local changes are included in the repo-health snapshot.');
  }
  return observations;
}

function buildRepoHealth(findings) {
  let score = 100;
  for (const [classification, items] of Object.entries(findings)) {
    for (const item of items) {
      score -= SCORE_PENALTIES[classification][item.severity] || 0;
    }
  }
  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 86
    ? 'strong'
    : score >= 70
      ? 'watch'
      : score >= 50
        ? 'at_risk'
        : 'critical';
  return {
    score,
    verdict,
    counts: {
      verified: findings.verified.length,
      probable: findings.probable.length,
      heuristic: findings.heuristic.length,
    },
  };
}

function renderPrompts(payload) {
  const passOrder = payload.suggestedPassOrder.slice(0, 4).map((item) => item.area).join(' -> ') || 'repo';
  const focusAreas = payload.stackPack.focusAreas.map((item) => `- ${item}`).join('\n');
  const contractChecks = payload.stackPack.contractChecks.map((item) => `- ${item}`).join('\n');
  const diagnostics = (payload.stackDiagnostics?.summary || []).map((item) => `- ${item}`).join('\n') || '- none';
  const contractRisks = (payload.stackDiagnostics?.contractRisks || []).map((item) => `- ${item}`).join('\n') || '- none';
  const acceptedRisks = payload.policySummary.acceptedRisks.map((item) => `- ${item.area}: ${item.title}`).join('\n') || '- none';
  const knownDebt = payload.policySummary.knownDebt.map((item) => `- ${item.area}: ${item.title}`).join('\n') || '- none';
  const history = payload.history.persistent.map((item) => `- ${item.area || item.file}: ${item.title}`).join('\n') || '- none';
  const oneshot = `Audit this repository in repo-health mode, not diff-review mode.

Rules:
- do not emulate a snapshot diff against /dev/null
- separate verified findings, probable findings, and heuristic observations
- do not turn missing approvals or thin workflow docs into blockers
- prioritize the repo as a graph of subsystems, not one undifferentiated blob
- use this initial pass order: ${passOrder}

Detected stack lens: ${payload.stackPack.label}

Stack focus areas:
${focusAreas}

Cross-file checks:
${contractChecks}

Stack diagnostics:
${diagnostics}

Known contract risks:
${contractRisks}

Accepted risks:
${acceptedRisks}

Known debt:
${knownDebt}

Persisting findings from the previous audit:
${history}

Required output:
1. repo health summary
2. verified findings
3. probable findings
4. heuristic observations
5. subsystem heatmap
6. test gap matrix
7. suggested pass order
8. minimal correction plan

After the audit, implement only the first safe correction wave and verify it before widening scope.`;

  const correction = `Use the repo audit report as the source of truth and start the correction pass.

Execution rules:
- fix verified findings before speculative cleanup
- keep patches bounded to one subsystem at a time
- preserve public contracts unless a verified bug requires a deliberate change
- add tests or smoke checks when touching risky code
- keep heuristic observations out of the blocker lane unless code confirms them
- route frontend-heavy fixes through ui-review when the audit suggests it
- move maintainability-only cleanup into simplify waves after risky contract fixes

Correction order:
${payload.correctionPlan.map((task, index) => `${index + 1}. ${task.area}: ${task.title}`).join('\n') || '1. Start from the highest-risk subsystem.'}

When you finish each wave, report:
- what was fixed
- what was verified
- what remains probable
- what remains heuristic`;

  return {
    oneshot,
    correction,
  };
}

function renderMarkdown(payload) {
  const lines = [
    '# REPO AUDIT',
    '',
    `- Goal: \`${payload.goal}\``,
    `- Mode: \`${payload.mode}\``,
    `- Repo shape: \`${payload.repoShape}\``,
    `- Stack pack: \`${payload.stackPack.label}\``,
    `- Repo health: \`${payload.repoHealth.verdict}\``,
    `- Score: \`${payload.repoHealth.score}\``,
    '',
    '## Repo Health Summary',
    '',
    `- Verified findings: \`${payload.repoHealth.counts.verified}\``,
    `- Probable findings: \`${payload.repoHealth.counts.probable}\``,
    `- Heuristic observations: \`${payload.repoHealth.counts.heuristic}\``,
    `- Package manager: \`${payload.packageManager}\``,
    `- CI workflows: \`${payload.repoSignals.ciWorkflows.length}\``,
    `- Lockfiles: \`${payload.repoSignals.lockfiles.length > 0 ? payload.repoSignals.lockfiles.join(', ') : 'none'}\``,
    '',
    '## Verified Findings',
    '',
    ...(payload.findings.verified.length > 0
      ? payload.findings.verified.map((item) => `- [${item.severity}] ${item.area}: ${item.title} — ${item.detail} (confidence=${item.confidence}, next=${item.suggestedNextAction})`)
      : ['- `No verified findings were raised.`']),
    '',
    '## Probable Findings',
    '',
    ...(payload.findings.probable.length > 0
      ? payload.findings.probable.map((item) => `- [${item.severity}] ${item.area}: ${item.title} — ${item.detail} (confidence=${item.confidence}, next=${item.suggestedNextAction})`)
      : ['- `No probable findings were raised.`']),
    '',
    '## Heuristic Observations',
    '',
    ...(payload.findings.heuristic.length > 0
      ? payload.findings.heuristic.map((item) => `- [${item.severity}] ${item.area}: ${item.title} — ${item.detail} (confidence=${item.confidence})`)
      : ['- `No heuristic observations were raised.`']),
    '',
    '## Finding Policy',
    '',
    ...(payload.policySummary.suppressions.length > 0
      ? payload.policySummary.suppressions.slice(0, 8).map((item) => `- [suppressed] ${item.area}: ${item.title} -> ${item.policyReason}`)
      : ['- `No suppressions matched this audit run.`']),
    ...(payload.policySummary.acceptedRisks.length > 0
      ? payload.policySummary.acceptedRisks.slice(0, 8).map((item) => `- [accepted-risk] ${item.area}: ${item.title} -> ${item.policyReason}`)
      : ['- `No accepted risks matched this audit run.`']),
    ...(payload.policySummary.knownDebt.length > 0
      ? payload.policySummary.knownDebt.slice(0, 8).map((item) => `- [known-debt] ${item.area}: ${item.title} -> ${item.policyReason}`)
      : ['- `No known debt items matched this audit run.`']),
    '',
    '## Audit History',
    '',
    ...(payload.history.introduced.length > 0
      ? payload.history.introduced.slice(0, 6).map((item) => `- [new] ${item.area || item.file}: ${item.title}`)
      : ['- `No new findings relative to the previous audit.`']),
    ...(payload.history.persistent.length > 0
      ? payload.history.persistent.slice(0, 6).map((item) => `- [persisting] ${item.area || item.file}: ${item.title}`)
      : ['- `No persisting findings were detected.`']),
    ...(payload.history.resolved.length > 0
      ? payload.history.resolved.slice(0, 6).map((item) => `- [resolved] ${item.area || item.file}: ${item.title}`)
      : ['- `No resolved findings were detected.`']),
    ...(payload.history.confidenceChanged.length > 0
      ? payload.history.confidenceChanged.slice(0, 6).map((item) => `- [confidence] ${item.area}: ${item.title} ${item.previous} -> ${item.current}`)
      : ['- `No finding confidence changes were detected.`']),
    '',
    '## Workflow Observations',
    '',
    ...(payload.workflowObservations.length > 0
      ? payload.workflowObservations.map((item) => `- ${item}`)
      : ['- `No workflow observations were added.`']),
    '',
    '## Stack Diagnostics',
    '',
    ...((payload.stackDiagnostics?.summary || []).length > 0
      ? payload.stackDiagnostics.summary.map((item) => `- ${item}`)
      : ['- `No stack diagnostics were generated.`']),
    ...((payload.stackDiagnostics?.contractRisks || []).length > 0
      ? ['', '### Contract Risks', '', ...payload.stackDiagnostics.contractRisks.map((item) => `- ${item}`)]
      : []),
    '',
    '## Subsystem Heatmap',
    '',
    ...(payload.subsystemHeatmap.length > 0
      ? payload.subsystemHeatmap.slice(0, 10).map((item) => `- \`${item.area}\` severity=${item.severity} score=${item.riskScore} tests=${item.testFiles} tags=${item.tags.join(', ') || 'none'}`)
      : ['- `No subsystem heatmap entries were generated.`']),
    '',
    '## Test Gap Matrix',
    '',
    ...(payload.testGapMatrix.length > 0
      ? payload.testGapMatrix.slice(0, 12).map((item) => `- \`${item.area}\` status=${item.status} source=${item.sourceFiles} tests=${item.testFiles} verify=${item.verifyScripts.join(', ') || 'none'} suggested=${item.suggestedTestType} (${item.why})`)
      : ['- `No test gap matrix rows were generated.`']),
    '',
    '## Suggested Pass Order',
    '',
    ...(payload.suggestedPassOrder.length > 0
      ? payload.suggestedPassOrder.map((item) => `- ${item.order}. \`${item.area}\` -> ${item.why}`)
      : ['- `No pass order was generated.`']),
    '',
    '## Correction Plan',
    '',
    ...(payload.correctionPlan.length > 0
      ? payload.correctionPlan.map((item) => `- [${item.priority}] \`${item.area}\` ${item.title} -> patchGroup=${item.patchGroupId} verify=${item.verifyChain.join(', ') || 'none'}`)
      : ['- `No correction plan items were generated.`']),
    '',
    '## Follow-on Passes',
    '',
    ...(payload.followOnPasses.uiReview.length > 0
      ? payload.followOnPasses.uiReview.map((item) => `- [ui-review] \`${item.area}\` -> ${item.command} (${item.why})`)
      : ['- `No dedicated UI audit pass was suggested.`']),
    ...(payload.followOnPasses.simplify.length > 0
      ? payload.followOnPasses.simplify.map((item) => `- [simplify] \`${item.area}\` -> ${item.command} (${item.why})`)
      : ['- `No simplify backlog items were suggested.`']),
    '',
    '## Single-Shot Prompt',
    '',
    '```text',
    payload.promptLibrary.oneshot.trim(),
    '```',
    '',
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderPromptMarkdown(payload) {
  return [
    '# REPO AUDIT PROMPTS',
    '',
    '## One-shot Audit',
    '',
    '```text',
    payload.promptLibrary.oneshot.trim(),
    '```',
    '',
    '## Correction Pass',
    '',
    '```text',
    payload.promptLibrary.correction.trim(),
    '```',
    '',
  ].join('\n');
}

function runRepoAudit(cwd, options = {}) {
  const repoIndex = listIndexedRepoFiles(cwd, {
    refreshMode: options.refresh === 'full' ? 'full' : 'incremental',
  });
  const files = repoIndex.files || [];
  const graph = buildPackageGraph(cwd, {
    writeFiles: true,
    changedFiles: [],
  });
  const rootManifest = readJson(path.join(cwd, 'package.json'), {});
  const manager = detectPackageManager(files);
  const rootVerifyScripts = detectVerifyScripts(rootManifest);
  const stackPack = detectStackPack(files, rootManifest, graph, options.stack);
  const units = graph.repoShape === 'monorepo' && graph.packageCount > 1
    ? buildMonorepoUnits(cwd, files, graph, manager)
    : buildSingleRepoUnits(cwd, files, rootManifest, manager);

  const scoredUnits = units.map((unit) => {
    const score = scoreUnit(unit, rootVerifyScripts);
    return {
      ...unit,
      riskScore: score.score,
      riskDrivers: score.drivers,
      severity: score.severity,
    };
  });

  const baseFindings = buildRepoFindings(cwd, files, graph, scoredUnits, stackPack, rootManifest, rootVerifyScripts);
  const stackAudit = buildStackAudit(cwd, files, stackPack, {
    graph,
    rootManifest,
    units: scoredUnits,
    manager,
  });
  const rawFindings = mergeFindings(baseFindings, stackAudit.findings);
  const findingPolicy = readFindingPolicy(cwd);
  const policyResult = applyFindingPolicy(rawFindings, findingPolicy);
  const findings = policyResult.findings;
  const subsystemHeatmap = buildSubsystemHeatmap(scoredUnits);
  const testGapMatrix = buildTestGapMatrix(scoredUnits, rootVerifyScripts);
  const suggestedPassOrder = buildPassOrder(subsystemHeatmap, findings);
  const correctionPlan = buildCorrectionPlan(findings, suggestedPassOrder, manager, scoredUnits);
  const workflowObservations = buildWorkflowObservations(cwd, graph);
  const repoHealth = buildRepoHealth(findings);
  const previousHistory = readJson(repoAuditHistoryPath(cwd), { runs: [] });
  const history = buildFindingReplay(previousHistory.runs?.[0]?.findings || [], [
    ...findings.verified,
    ...findings.probable,
    ...findings.heuristic,
  ]);
  const payload = {
    generatedAt: new Date().toISOString(),
    goal: String(options.goal || 'audit the repository and plan corrections').trim(),
    mode: String(options.mode || 'oneshot').trim() || 'oneshot',
    auditType: 'repo-health',
    repoShape: graph.repoShape,
    packageManager: manager,
    packageCount: graph.packageCount,
    stackPack,
    repoSignals: {
      fileCount: files.length,
      indexStatus: repoIndex.refreshStatus,
      changedFileCount: repoIndex.changedFiles.length,
      ciWorkflows: listCiWorkflows(files),
      lockfiles: listLockfiles(files),
      rootVerifyScripts,
    },
    findings,
    rawFindings,
    policySummary: policyResult.policySummary,
    subsystemHeatmap,
    testGapMatrix,
    suggestedPassOrder,
    correctionPlan,
    workflowObservations,
    stackDiagnostics: stackAudit.diagnostics,
    repoHealth,
    history,
    artifacts: null,
  };
  payload.followOnPasses = buildFollowOnPasses(payload);
  payload.promptLibrary = renderPrompts(payload);
  payload.controlPlane = buildReviewCorrectionControlPlane(cwd, {
    goal: payload.goal,
    repoAudit: payload,
    packageGraph: graph,
    activeLane: graph.repoShape === 'monorepo' ? 'large-repo-review' : 'repo-review',
  }, {
    promotePlanned: true,
  });

  if (options.writeArtifacts !== false) {
    const dir = reportsDir(cwd);
    ensureDir(dir);
    const markdownPath = path.join(dir, 'repo-audit.md');
    const jsonPath = path.join(dir, 'repo-audit.json');
    const findingsPath = path.join(dir, 'repo-audit-findings.json');
    const heatmapPath = path.join(dir, 'repo-audit-heatmap.json');
    const gapPath = path.join(dir, 'repo-audit-test-gap.json');
    const promptsPath = path.join(dir, 'repo-audit-prompts.md');
    const historyPath = repoAuditHistoryPath(cwd);
    const followOnPath = path.join(dir, 'repo-audit-follow-ons.json');
    payload.artifacts = {
      markdown: relativePath(cwd, markdownPath),
      json: relativePath(cwd, jsonPath),
      findings: relativePath(cwd, findingsPath),
      heatmap: relativePath(cwd, heatmapPath),
      testGap: relativePath(cwd, gapPath),
      prompts: relativePath(cwd, promptsPath),
      history: relativePath(cwd, historyPath),
      followOns: relativePath(cwd, followOnPath),
    };
    payload.outputPath = markdownPath;
    payload.outputPathRelative = payload.artifacts.markdown;
    fs.writeFileSync(markdownPath, renderMarkdown(payload));
    writeJsonFile(jsonPath, payload);
    writeJsonFile(findingsPath, payload.findings);
    writeJsonFile(heatmapPath, payload.subsystemHeatmap);
    writeJsonFile(gapPath, payload.testGapMatrix);
    writeJsonFile(historyPath, {
      generatedAt: payload.generatedAt,
      replay: payload.history,
      policySummary: payload.policySummary,
      runs: [
        {
          at: payload.generatedAt,
          goal: payload.goal,
          repoHealth: payload.repoHealth,
          findings: [
            ...payload.findings.verified,
            ...payload.findings.probable,
            ...payload.findings.heuristic,
          ],
        },
        ...(previousHistory.runs || []),
      ].slice(0, 12),
    });
    writeJsonFile(followOnPath, payload.followOnPasses);
    fs.writeFileSync(promptsPath, renderPromptMarkdown(payload));
  }

  return payload;
}

module.exports = {
  detectRiskTags,
  detectStackPack,
  runRepoAudit,
};
