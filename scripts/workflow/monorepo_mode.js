const path = require('node:path');
const { readJsonIfExists } = require('./io/json');
const {
  parseArgs,
  replaceOrAppendSection,
  resolveWorkflowRoot,
  warnAgentsSize,
} = require('./common');
const {
  ensureDir,
  readTextIfExists: readIfExists,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const { buildCodebaseMap } = require('./map_codebase');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildPackageGraph } = require('./package_graph');
const { analyzeIntent } = require('./intent_engine');
const { selectCodexProfile } = require('./codex_profile_engine');
const { buildCodexContextPack } = require('./context_pack');
const { buildReviewCorrectionControlPlane } = require('./review_correction_control_plane');
const { buildCommandPlan } = require('./command_plan');
const { runRepoAudit } = require('./repo_audit_engine');

const TRACK_DEFINITIONS = Object.freeze([
  {
    id: 'track-a',
    label: 'Track A',
    focus: 'auth / session / permission / middleware',
    keywords: ['auth', 'session', 'permission', 'middleware', 'acl', 'rbac'],
    summary: 'Identity, access control, and guard boundaries.',
  },
  {
    id: 'track-b',
    label: 'Track B',
    focus: 'API boundary / routes / handlers / validation',
    keywords: ['api', 'route', 'router', 'handler', 'endpoint', 'validation', 'contract'],
    summary: 'Request/response contracts and boundary validation.',
  },
  {
    id: 'track-c',
    label: 'Track C',
    focus: 'domain engines / business logic / scoring / calculation',
    keywords: ['domain', 'engine', 'business', 'core', 'calc', 'score', 'workflow'],
    summary: 'Core behavior, orchestration, and domain rules.',
  },
  {
    id: 'track-d',
    label: 'Track D',
    focus: 'data layer / schema / repository / DB mapping',
    keywords: ['data', 'db', 'database', 'schema', 'repository', 'storage', 'model'],
    summary: 'Persistence, schema contracts, and storage translation.',
  },
  {
    id: 'track-e',
    label: 'Track E',
    focus: 'sync jobs / background workers / provider integration',
    keywords: ['sync', 'worker', 'job', 'queue', 'cron', 'provider', 'integration', 'adapter'],
    summary: 'Async execution, retries, and third-party/system boundaries.',
  },
  {
    id: 'track-f',
    label: 'Track F',
    focus: 'frontend state / caching / query invalidation / UX flows',
    keywords: ['frontend', 'web', 'admin', 'ui', 'component', 'page', 'state', 'query'],
    summary: 'User-facing state flow, caching, and UX continuity.',
  },
  {
    id: 'track-g',
    label: 'Track G',
    focus: 'tests / observability / error handling / logging',
    keywords: ['test', 'spec', 'observability', 'logging', 'error', 'monitoring', 'telemetry'],
    summary: 'Confidence surfaces, detection, and operational feedback.',
  },
]);

const PHASES = Object.freeze([
  {
    id: 'repo-map',
    title: 'Phase 1: Repo map',
    deliverable: 'docs/workflow/REPO_MAP.md',
    objective: 'Map the repository before making claims about behavior, ownership, or risk.',
  },
  {
    id: 'critical-areas',
    title: 'Phase 2: Critical subsystem discovery',
    deliverable: '.workflow/reports/monorepo-mode.md',
    objective: 'Rank the highest-risk subsystems and decide what must be reviewed before implementation.',
  },
  {
    id: 'deep-analysis',
    title: 'Phase 3: Deep analysis of selected subsystem',
    deliverable: 'docs/workflow/REVIEW_SCOPE.md',
    objective: 'Deep-review one subsystem at a time and separate confirmed findings from inferences.',
  },
  {
    id: 'risks',
    title: 'Phase 4: Risks and technical debt',
    deliverable: '.workflow/reports/monorepo-mode.md',
    objective: 'Condense the meaningful risks into a dense, severity-ordered engineering list.',
  },
  {
    id: 'patch-plan',
    title: 'Phase 5: Refactor / implementation plan',
    deliverable: 'docs/workflow/PATCH_PLAN.md',
    objective: 'Produce a safe patch plan before any code change starts.',
  },
  {
    id: 'execute',
    title: 'Phase 6: Patch execution',
    deliverable: '.workflow/reports/monorepo-mode.md',
    objective: 'Apply the highest-value, lowest-regret fixes in bounded packages or domains.',
  },
  {
    id: 'verify',
    title: 'Phase 7: Verification',
    deliverable: '.workflow/reports/monorepo-mode.md',
    objective: 'Verify what is truly covered, what is still inferred, and what remains risky.',
  },
]);

function isRepoWideAuditGoal(goal) {
  return /\b(full repo|whole repo|entire repo|repo[- ]wide|full codebase|whole codebase|oneshot|one-shot|repo audit|audit the repo|audit this repo|full repo audit|codebase audit)\b/i.test(String(goal || ''));
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}


function quote(value) {
  return JSON.stringify(String(value || '').trim());
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function renderCodeBlock(text) {
  return ['```md', String(text || '').trimEnd(), '```'].join('\n');
}

function severityFromScore(score) {
  if (score >= 30) {
    return 'critical';
  }
  if (score >= 22) {
    return 'high';
  }
  if (score >= 14) {
    return 'medium';
  }
  return 'low';
}

function matchesKeyword(text, keywords) {
  const normalized = String(text || '').toLowerCase();
  return (keywords || []).some((keyword) => normalized.includes(keyword));
}

function detectPackageTags(pkg) {
  const normalized = `${pkg.id} ${pkg.name} ${pkg.path}`.toLowerCase();
  const tags = new Set();

  if (pkg.path.startsWith('apps/')) {
    tags.add('app');
  }
  if (pkg.path.startsWith('packages/') || pkg.path.startsWith('libs/') || pkg.path.startsWith('lib/')) {
    tags.add('shared');
  }
  if (/auth|session|permission|middleware|acl|rbac/.test(normalized)) {
    tags.add('auth');
  }
  if (/api|route|router|handler|endpoint|server|backend|service/.test(normalized)) {
    tags.add('api');
    tags.add('backend');
  }
  if (/web|frontend|site|admin|ui|component|page/.test(normalized)) {
    tags.add('frontend');
  }
  if (/data|db|database|schema|repository|storage|model|prisma/.test(normalized)) {
    tags.add('data');
  }
  if (/config|env|setting|flag/.test(normalized)) {
    tags.add('config');
  }
  if (/worker|job|queue|cron|sync|task/.test(normalized)) {
    tags.add('jobs');
  }
  if (/provider|integration|adapter|client|sdk/.test(normalized)) {
    tags.add('integration');
  }
  if (/workflow|engine|domain|business|core|score|calc/.test(normalized)) {
    tags.add('domain');
  }
  if (/test|spec|qa|smoke|e2e/.test(normalized)) {
    tags.add('tests');
  }
  return [...tags];
}

function packageFileList(pkg, repoFiles) {
  if (pkg.path === '.') {
    return repoFiles.filter((filePath) => !filePath.includes('/'));
  }
  return repoFiles.filter((filePath) => filePath === pkg.path || filePath.startsWith(`${pkg.path}/`));
}

function interestingFileScore(filePath, tags) {
  let score = 0;
  const lower = String(filePath || '').toLowerCase();
  const base = path.basename(lower);
  if (base === 'package.json') {
    score += 20;
  }
  if (/app\/layout|app\/page|src\/main|src\/index|server|router|route|handler|schema|contract|type|config|env|auth|session|middleware|worker|queue/.test(lower)) {
    score += 10;
  }
  for (const tag of tags || []) {
    if (lower.includes(tag)) {
      score += 4;
    }
  }
  if (/\.(ts|tsx|js|jsx|json|ya?ml|md)$/.test(lower)) {
    score += 2;
  }
  score -= lower.length / 200;
  return score;
}

function interestingPackageFiles(pkg, repoFiles, tags, limit = 6) {
  return packageFileList(pkg, repoFiles)
    .map((filePath) => ({ filePath, score: interestingFileScore(filePath, tags) }))
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
    .slice(0, limit)
    .map((item) => item.filePath);
}

function findFiles(files, regexes, limit = 8) {
  return files
    .filter((filePath) => regexes.some((regex) => regex.test(filePath)))
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .slice(0, limit);
}

function topLevelAreas(map, packageMeta, repoFiles) {
  const topDirs = new Set((map.repo?.topLevelDirectories || []).map((item) => item.name));
  return {
    apps: packageMeta.filter((pkg) => pkg.path.startsWith('apps/')).map((pkg) => pkg.path),
    packages: packageMeta.filter((pkg) => pkg.path.startsWith('packages/')).map((pkg) => pkg.path),
    services: packageMeta.filter((pkg) => pkg.tags.includes('backend') || pkg.path.startsWith('services/')).map((pkg) => pkg.path),
    libraries: packageMeta.filter((pkg) => pkg.tags.includes('shared')).map((pkg) => pkg.path),
    scripts: topDirs.has('scripts') ? ['scripts/'] : [],
    configs: unique([
      ...findFiles(repoFiles, [/package\.json$/, /pnpm-workspace\.yaml$/, /tsconfig\.json$/, /(next|vite|tailwind|playwright|vitest|jest)\.config\./], 10),
      ...packageMeta.filter((pkg) => pkg.tags.includes('config')).map((pkg) => pkg.path),
    ]),
    infra: ['infra', 'infrastructure', 'terraform', '.github', 'deploy', 'ops'].filter((name) => topDirs.has(name)).map((name) => `${name}/`),
    docs: topDirs.has('docs') ? ['docs/'] : [],
    tests: unique([
      ...['tests', '__tests__', 'e2e'].filter((name) => topDirs.has(name)).map((name) => `${name}/`),
      ...findFiles(repoFiles, [/(^|\/)(test|tests|__tests__)\//, /\.(test|spec)\./], 8),
    ]),
  };
}

function buildArchitectureEntries(packageMeta, repoFiles) {
  const packagesByTag = (tag) => packageMeta.filter((pkg) => pkg.tags.includes(tag)).map((pkg) => pkg.path);
  return [
    {
      label: 'Frontend app(s)',
      confidence: packagesByTag('frontend').length > 0 ? 'fact' : 'inference',
      entries: unique([
        ...packageMeta.filter((pkg) => pkg.path.startsWith('apps/') && pkg.tags.includes('frontend')).map((pkg) => pkg.path),
        ...findFiles(repoFiles, [/^app\//, /^pages\//, /components\//], 6),
      ]),
      note: packagesByTag('frontend').length > 0
        ? 'Workspace and file-path signals identify the user-facing surfaces directly.'
        : 'No dedicated frontend package name was obvious, so treat this as a likely surface until entrypoints are confirmed.',
    },
    {
      label: 'Backend/API',
      confidence: packagesByTag('backend').length > 0 ? 'fact' : 'inference',
      entries: unique([
        ...packagesByTag('backend'),
        ...findFiles(repoFiles, [/(^|\/)(api|server|routes?|router|handlers?)\//, /server\.(ts|js)$/], 6),
      ]),
      note: packagesByTag('backend').length > 0
        ? 'Backend and route surfaces show up in package names or route/server file patterns.'
        : 'No standalone backend workspace was obvious from package names; inspect route registration files before assuming frontend-only runtime.',
    },
    {
      label: 'Shared packages',
      confidence: packageMeta.some((pkg) => pkg.tags.includes('shared')) ? 'fact' : 'inference',
      entries: packageMeta.filter((pkg) => pkg.tags.includes('shared')).map((pkg) => pkg.path),
      note: 'Shared workspaces are strong coupling points because multiple apps or services can depend on them.',
    },
    {
      label: 'Data layer',
      confidence: packagesByTag('data').length > 0 ? 'fact' : 'inference',
      entries: unique([...packagesByTag('data'), ...findFiles(repoFiles, [/(schema|repository|model|prisma|db|database)/], 6)]),
      note: 'Schema and repository names usually expose the persistence contract surface.',
    },
    {
      label: 'Auth',
      confidence: packagesByTag('auth').length > 0 ? 'fact' : 'inference',
      entries: unique([...packagesByTag('auth'), ...findFiles(repoFiles, [/(auth|session|permission|middleware|acl|rbac)/], 6)]),
      note: 'Auth packages and middleware/session files are the clearest source-of-truth candidates for identity flow.',
    },
    {
      label: 'Background jobs / workers',
      confidence: packageMeta.some((pkg) => pkg.tags.includes('jobs')) ? 'fact' : 'inference',
      entries: unique([...packagesByTag('jobs'), ...findFiles(repoFiles, [/(worker|queue|job|cron|sync)/], 6)]),
      note: 'Async or scheduled work often hides the highest incident fan-out in large repos.',
    },
    {
      label: 'Integrations',
      confidence: packageMeta.some((pkg) => pkg.tags.includes('integration')) ? 'fact' : 'inference',
      entries: unique([...packagesByTag('integration'), ...findFiles(repoFiles, [/(provider|integration|adapter|client|sdk)/], 6)]),
      note: 'Provider adapters and SDK/client packages mark external contract boundaries.',
    },
  ];
}

function buildSourceOfTruth(repoFiles, packageMeta) {
  const rootPackages = packageMeta.map((pkg) => pkg.path);
  const fallbackRoot = rootPackages[0] || 'package.json';
  return [
    {
      label: 'App bootstrapping',
      kind: 'fact',
      files: findFiles(repoFiles, [/app\/layout\.(tsx|jsx)$/, /app\/page\.(tsx|jsx)$/, /src\/(main|index)\.(tsx?|jsx?)$/, /pages\/_app\.(tsx|jsx)$/], 8),
      fallback: `Inspect ${fallbackRoot} and app entrypoints if a dedicated bootstrap file is not obvious.`,
    },
    {
      label: 'Server startup',
      kind: 'fact',
      files: findFiles(repoFiles, [/(^|\/)(src\/)?(server|app|main|index)\.(ts|js)$/, /(^|\/)(api|server)\//], 8),
      fallback: 'No clear standalone server bootstrap file was detected from names alone.',
    },
    {
      label: 'Dependency injection / container setup',
      kind: 'inference',
      files: findFiles(repoFiles, [/(container|registry|inject|provider|module)\.(ts|js)$/], 6),
      fallback: 'If there is no container file, inspect package entrypoints and provider modules for implicit wiring.',
    },
    {
      label: 'Auth flow',
      kind: 'fact',
      files: findFiles(repoFiles, [/(auth|session|permission|middleware|acl|rbac)/], 8),
      fallback: 'Auth and middleware file names were not dominant; verify identity flow from app bootstraps and shared packages.',
    },
    {
      label: 'API route registration',
      kind: 'fact',
      files: findFiles(repoFiles, [/(^|\/)(api|routes?|router|handlers?|endpoints?)\//, /(router|routes?)\.(ts|js)$/], 8),
      fallback: 'Route registration may be co-located with feature packages rather than a single API folder.',
    },
    {
      label: 'Schema / types / contracts',
      kind: 'fact',
      files: findFiles(repoFiles, [/(schema|contract|types?|dto|model|zod|openapi|graphql)/], 10),
      fallback: 'If schema files are thin, treat shared package entrypoints as the contract boundary until deeper review proves otherwise.',
    },
    {
      label: 'Env / config loading',
      kind: 'fact',
      files: findFiles(repoFiles, [/(env|config|settings|dotenv)/, /package\.json$/, /pnpm-workspace\.yaml$/], 8),
      fallback: 'Config loading may be spread across apps and shared config packages.',
    },
    {
      label: 'Build / test tooling',
      kind: 'fact',
      files: unique([
        ...findFiles(repoFiles, [/package\.json$/, /pnpm-workspace\.yaml$/, /tsconfig\.json$/, /(playwright|vitest|jest|cypress)\.config\./, /\.github\/workflows\//], 12),
      ]),
      fallback: 'Tooling surface is usually rooted in package.json plus workspace and test config files.',
    },
  ];
}

function buildActivitySignals(graph, packageMeta, monorepo) {
  const active = [];
  const stale = [];
  if ((graph.changedPackages || []).length > 0) {
    active.push({
      confidence: 'fact',
      detail: `Changed packages: ${(graph.changedPackages || []).join(', ')}`,
    });
  }
  if ((graph.impactedPackages || []).length > 0) {
    active.push({
      confidence: 'fact',
      detail: `Impacted packages: ${(graph.impactedPackages || []).join(', ')}`,
    });
  }
  for (const hotspot of (monorepo.hotspots || []).slice(0, 3)) {
    active.push({
      confidence: 'inference',
      detail: `${hotspot.packageName} is a hotspot because ${hotspot.reason}.`,
    });
  }

  const staleCandidates = packageMeta
    .filter((pkg) => !graph.changedPackages.includes(pkg.id))
    .filter((pkg) => !graph.impactedPackages.includes(pkg.id))
    .filter((pkg) => (pkg.testFiles || []).length === 0)
    .filter((pkg) => (pkg.dependents || []).length === 0)
    .sort((left, right) => left.fileCount - right.fileCount || left.path.localeCompare(right.path))
    .slice(0, 4);

  for (const pkg of staleCandidates) {
    stale.push({
      confidence: 'inference',
      detail: `${pkg.path} has no direct change signal, no local test files, and no downstream dependents in the package graph.`,
    });
  }

  if (stale.length === 0) {
    stale.push({
      confidence: 'inference',
      detail: 'No strong stale-package signal stood out from package names, file counts, and test ownership alone.',
    });
  }

  return { active, stale };
}

function failureModesForTags(tags) {
  const modes = [];
  if (tags.includes('auth')) {
    modes.push('permission or session guard drift across apps and shared packages');
  }
  if (tags.includes('api')) {
    modes.push('route/handler validation mismatches at the boundary');
  }
  if (tags.includes('data')) {
    modes.push('schema or repository drift leaking into runtime contracts');
  }
  if (tags.includes('frontend')) {
    modes.push('state/query/UI regressions caused by stale shared assumptions');
  }
  if (tags.includes('jobs') || tags.includes('integration')) {
    modes.push('retry, sync, or provider-boundary failures that are hard to replay');
  }
  if (tags.includes('config')) {
    modes.push('environment or config divergence across packages');
  }
  if (tags.includes('domain')) {
    modes.push('business-rule drift hidden behind shared abstractions');
  }
  if (modes.length === 0) {
    modes.push('shared dependency drift that fans out beyond the directly touched files');
  }
  return modes.slice(0, 3);
}

function riskReasons(meta) {
  const reasons = [];
  if (meta.changed) {
    reasons.push('directly changed');
  }
  if (meta.impacted && !meta.changed) {
    reasons.push('impacted by upstream package changes');
  }
  if ((meta.dependents || []).length > 0) {
    reasons.push(`${meta.dependents.length} downstream dependents`);
  }
  if ((meta.internalDependencies || []).length > 0) {
    reasons.push(`${meta.internalDependencies.length} internal dependencies`);
  }
  if (meta.hotspot) {
    reasons.push(`hotspot score ${meta.hotspot.score}`);
  }
  if ((meta.testFiles || []).length === 0) {
    reasons.push('no local test files');
  }
  if ((meta.verifyCommands || []).length === 0) {
    reasons.push('no package-local verify command');
  }
  return reasons;
}

function scorePackageRisk(meta) {
  let score = 0;
  if (meta.changed) {
    score += 10;
  }
  if (meta.impacted) {
    score += 7;
  }
  score += Math.min((meta.dependents || []).length * 4, 12);
  score += Math.min((meta.internalDependencies || []).length * 2, 8);
  score += Math.min(meta.fileCount || 0, 24) / 4;
  if (meta.hotspot) {
    score += Math.min(meta.hotspot.score || 0, 12);
  }
  if (meta.tags.includes('auth')) {
    score += 8;
  }
  if (meta.tags.includes('data')) {
    score += 7;
  }
  if (meta.tags.includes('api')) {
    score += 6;
  }
  if (meta.tags.includes('frontend')) {
    score += 5;
  }
  if (meta.tags.includes('config')) {
    score += 4;
  }
  if (meta.tags.includes('jobs') || meta.tags.includes('integration')) {
    score += 5;
  }
  if ((meta.testFiles || []).length === 0) {
    score += 4;
  }
  if ((meta.verifyCommands || []).length === 0) {
    score += 3;
  }
  return Math.round(score);
}

function buildPackageMeta(graph, monorepo, repoFiles) {
  const hotspotByPackage = new Map((monorepo.hotspots || []).map((item) => [item.packageId, item]));
  const verifyByPackage = new Map((monorepo.verify?.perPackage || []).map((item) => [item.packageId, item]));
  return (graph.packages || [])
    .filter((pkg) => !(graph.repoShape === 'monorepo' && pkg.id === '.'))
    .map((pkg) => {
      const tags = detectPackageTags(pkg);
      const testFiles = graph.testsByPackage?.[pkg.id] || [];
      const verifyCommands = verifyByPackage.get(pkg.id)?.commands || [];
      const hotspot = hotspotByPackage.get(pkg.id) || null;
      const meta = {
        ...pkg,
        tags,
        changed: (graph.changedPackages || []).includes(pkg.id),
        impacted: (graph.impactedPackages || []).includes(pkg.id),
        hotspot,
        verifyCommands,
        testFiles: testFiles.slice(0, 8),
      };
      meta.primaryFiles = interestingPackageFiles(pkg, repoFiles, tags);
      meta.riskScore = scorePackageRisk(meta);
      meta.severity = severityFromScore(meta.riskScore);
      meta.reasons = riskReasons(meta);
      meta.failures = failureModesForTags(tags);
      return meta;
    })
    .sort((left, right) => right.riskScore - left.riskScore || left.path.localeCompare(right.path));
}

function buildCriticalAreas(packageMeta) {
  return packageMeta.slice(0, 5).map((meta) => ({
    id: toSlug(meta.path),
    name: meta.name,
    packageId: meta.id,
    path: meta.path,
    severity: meta.severity,
    riskScore: meta.riskScore,
    why: meta.reasons.join('; ') || 'shared package with meaningful downstream fan-out',
    files: unique([meta.path, ...meta.primaryFiles, ...meta.testFiles]).slice(0, 10),
    failures: meta.failures,
    auditFindings: meta.auditFindings || [],
    auditWhy: meta.auditWhy || [],
    reviewBeforeImplementation: ['critical', 'high'].includes(meta.severity) ? 'yes' : 'recommended',
    tags: meta.tags,
    verifyCommands: meta.verifyCommands.slice(0, 4),
  }));
}

function selectSubsystem(criticalAreas, subsystem, repoAudit = null) {
  if (!subsystem) {
    const suggestedArea = repoAudit?.suggestedPassOrder?.[0]?.area;
    if (suggestedArea) {
      const matched = criticalAreas.find((item) => item.path === suggestedArea || item.packageId === suggestedArea || item.name === suggestedArea);
      if (matched) {
        return matched;
      }
    }
    return criticalAreas[0] || null;
  }
  const needle = String(subsystem).trim().toLowerCase();
  return criticalAreas.find((item) => (
    String(item.name).toLowerCase().includes(needle)
      || String(item.path).toLowerCase().includes(needle)
      || String(item.packageId).toLowerCase().includes(needle)
  )) || criticalAreas[0] || null;
}

function trackScore(track, packageMeta) {
  return packageMeta
    .filter((pkg) => pkg.tags.some((tag) => track.keywords.includes(tag)) || matchesKeyword(`${pkg.path} ${pkg.name}`, track.keywords))
    .reduce((sum, pkg) => sum + pkg.riskScore, 0);
}

function buildTracks(trackDefs, packageMeta, sourceOfTruth) {
  const sourceFiles = sourceOfTruth.flatMap((entry) => entry.files || []);
  return trackDefs.map((track) => {
    const matchedPackages = packageMeta.filter((pkg) => (
      pkg.tags.some((tag) => track.keywords.includes(tag))
        || matchesKeyword(`${pkg.path} ${pkg.name}`, track.keywords)
    ));
    const dangerousFiles = unique([
      ...matchedPackages.flatMap((pkg) => [pkg.path, ...pkg.primaryFiles]),
      ...sourceFiles.filter((filePath) => matchesKeyword(filePath, track.keywords)),
    ]).slice(0, 10);
    const unresolvedCoupling = matchedPackages
      .flatMap((pkg) => {
        const notes = [];
        if ((pkg.internalDependencies || []).length > 0) {
          notes.push(`${pkg.path} depends on ${pkg.internalDependencies.join(', ')}`);
        }
        if ((pkg.dependents || []).length > 0) {
          notes.push(`${pkg.path} fans out into ${pkg.dependents.join(', ')}`);
        }
        return notes;
      })
      .slice(0, 6);
    const staleAssumptions = matchedPackages
      .flatMap((pkg) => {
        const notes = [];
        if ((pkg.testFiles || []).length === 0) {
          notes.push(`${pkg.path} has no local test ownership, so integration drift may only show up downstream.`);
        }
        if (!pkg.changed && (pkg.dependents || []).length > 0) {
          notes.push(`${pkg.path} is a shared dependency even when it is not directly changed.`);
        }
        return notes;
      })
      .slice(0, 5);
    const score = trackScore(track, packageMeta);
    return {
      ...track,
      priority: severityFromScore(score),
      riskScore: score,
      architecturalSpine: matchedPackages.length > 0
        ? `${matchedPackages.slice(0, 4).map((pkg) => pkg.path).join(', ')} form the clearest spine for ${track.focus}.`
        : `No dedicated workspace name mapped cleanly to ${track.focus}; treat the matched source-of-truth files as the initial boundary.`,
      matchedPackages: matchedPackages.map((pkg) => pkg.path),
      dangerousFiles,
      unresolvedCoupling: unresolvedCoupling.length > 0 ? unresolvedCoupling : ['No strong coupling signal from package names alone; confirm real execution paths before refactoring.'],
      staleAssumptions: staleAssumptions.length > 0 ? staleAssumptions : ['No obvious stale assumption surfaced from package metadata alone.'],
      reviewNext: dangerousFiles.slice(0, 6),
      summary: track.summary,
    };
  }).sort((left, right) => right.riskScore - left.riskScore || left.label.localeCompare(right.label));
}

function areaForAuditFinding(finding) {
  return String(finding?.area || '').trim();
}

function mergePackageMetaWithRepoAudit(packageMeta, repoAudit) {
  if (!repoAudit) {
    return packageMeta;
  }
  const heatByArea = new Map((repoAudit.subsystemHeatmap || []).map((item) => [item.area, item]));
  const passOrderByArea = new Map((repoAudit.suggestedPassOrder || []).map((item) => [item.area, item.order]));
  const findingsByArea = new Map();
  for (const finding of [...(repoAudit.findings?.verified || []), ...(repoAudit.findings?.probable || [])]) {
    const area = areaForAuditFinding(finding);
    if (!area || area === 'repo' || area === 'test') {
      continue;
    }
    const bucket = findingsByArea.get(area) || [];
    bucket.push(finding);
    findingsByArea.set(area, bucket);
  }

  return packageMeta
    .map((meta) => {
      const auditHeat = heatByArea.get(meta.path) || null;
      const auditFindings = findingsByArea.get(meta.path) || [];
      const auditPriority = passOrderByArea.get(meta.path) || null;
      const auditBoost = (auditHeat ? Math.min(10, Math.round((auditHeat.riskScore || 0) / 6)) : 0)
        + Math.min(8, auditFindings.length * 2)
        + (auditPriority && auditPriority <= 3 ? 4 : 0);
      const auditWhy = [];
      if (auditHeat) {
        auditWhy.push(`repo-audit ${auditHeat.severity} hotspot score ${auditHeat.riskScore}`);
      }
      if (auditPriority) {
        auditWhy.push(`repo-audit pass order ${auditPriority}`);
      }
      if (auditFindings.length > 0) {
        auditWhy.push(...auditFindings.slice(0, 2).map((finding) => finding.title));
      }
      const next = {
        ...meta,
        auditHeat,
        auditFindings: auditFindings.slice(0, 4),
        auditPriority,
        auditWhy,
        riskScore: meta.riskScore + auditBoost,
        reasons: unique([...(meta.reasons || []), ...auditWhy]),
        failures: unique([...(meta.failures || []), ...auditFindings.slice(0, 3).map((finding) => finding.title)]).slice(0, 5),
      };
      next.severity = severityFromScore(next.riskScore);
      return next;
    })
    .sort((left, right) => right.riskScore - left.riskScore || left.path.localeCompare(right.path));
}

function buildRepoMap(cwd, map, graph, packageMeta, monorepo, rootDir) {
  const repoFiles = Object.keys(graph.ownership || {}).sort();
  const areas = topLevelAreas(map, packageMeta, repoFiles);
  const architecture = buildArchitectureEntries(packageMeta, repoFiles);
  const sourceOfTruth = buildSourceOfTruth(repoFiles, packageMeta);
  const activity = buildActivitySignals(graph, packageMeta, monorepo);
  const inspectNext = unique([
    ...sourceOfTruth.flatMap((entry) => entry.files.slice(0, 2)),
    ...(monorepo.hotspots || []).flatMap((item) => item.readFirst.slice(0, 3)),
  ]).slice(0, 12);
  return {
    workflowRoot: relativePath(cwd, rootDir),
    topLevelAreas: areas,
    architecture,
    sourceOfTruth,
    activeAreas: activity.active,
    staleAreas: activity.stale,
    inspectNext,
  };
}

function buildPatchPlan(criticalAreas, monorepo, goal, repoAudit = null) {
  const repoLevelNotes = [
    ...(repoAudit?.findings?.verified || []).filter((finding) => finding.area === 'repo').map((finding) => `${finding.title}: ${finding.detail}`),
    ...(repoAudit?.findings?.probable || []).filter((finding) => finding.area === 'repo').map((finding) => `${finding.title}: ${finding.detail}`),
  ].slice(0, 4);
  const patchGroups = criticalAreas.slice(0, 3).map((area, index) => ({
    id: `patch-${index + 1}`,
    title: `Bounded slice for ${area.path}`,
    why: `${area.severity} risk area: ${area.why}`,
    impactedFiles: area.files.slice(0, 6),
    verification: area.verifyCommands.length > 0 ? area.verifyCommands : monorepo.verify.rootSmoke.slice(0, 3),
    auditFindings: (area.auditFindings || []).map((finding) => `[${finding.severity}] ${finding.title}`).slice(0, 3),
    rollbackSensitivity: area.severity === 'critical'
      ? 'high: shared contracts or boundary behavior may fan out across dependents'
      : 'medium: keep the change package-local until downstream checks are clean',
  }));
  const dependencyNotes = unique([
    ...repoLevelNotes,
    ...criticalAreas.slice(0, 4).map((area) => `${area.path}: ${area.why}`),
    ...(monorepo.performanceRisks || []).slice(0, 3),
  ]).slice(0, 8);
  const verificationStrategy = unique([
    ...monorepo.verify.perPackage.flatMap((entry) => entry.commands).slice(0, 8),
    ...monorepo.verify.rootSmoke.slice(0, 4),
    'rai re-review',
    'rai verify-work',
  ]);
  const rollbackSensitivity = patchGroups.map((group) => `${group.title}: ${group.rollbackSensitivity}`);
  const firstSmallSafeChanges = patchGroups.map((group) => `${group.title} -> ${group.impactedFiles.slice(0, 3).join(', ')}`);
  return {
    goal,
    patchGroups,
    dependencyNotes,
    verificationStrategy,
    rollbackSensitivity,
    firstSmallSafeChanges,
  };
}

function buildPhasePlan(goal, selectedSubsystem, files) {
  const qGoal = quote(goal);
  const subsystemLabel = selectedSubsystem?.path || selectedSubsystem?.name || 'top-risk subsystem';
  return PHASES.map((phase) => {
    const commands = [];
    if (phase.id === 'repo-map') {
      commands.push(`rai audit-repo --mode oneshot --goal ${qGoal}`);
      commands.push('rai map-codebase --scope repo');
      commands.push(`rai monorepo-mode --phase repo-map --goal ${qGoal}`);
    } else if (phase.id === 'critical-areas') {
      commands.push(`rai audit-repo --mode oneshot --goal ${qGoal}`);
      commands.push('rai monorepo --json');
      commands.push(`rai monorepo-mode --phase critical-areas --goal ${qGoal}`);
    } else if (phase.id === 'deep-analysis') {
      commands.push(`rai monorepo-mode --phase deep-analysis --goal ${qGoal} --subsystem ${quote(subsystemLabel)}`);
      commands.push(`rai review-mode --goal ${quote(`deep review ${subsystemLabel}`)}`);
    } else if (phase.id === 'patch-plan') {
      commands.push(`rai monorepo-mode --phase patch-plan --goal ${qGoal}`);
      commands.push('rai review-tasks --json');
    } else if (phase.id === 'execute') {
      commands.push(`rai monorepo-mode --phase execute --goal ${qGoal}`);
      commands.push('rai patch-review');
    } else if (phase.id === 'verify') {
      commands.push(`rai monorepo-mode --phase verify --goal ${qGoal}`);
      commands.push('rai verify-work');
      commands.push('rai ship-readiness');
    } else {
      commands.push(`rai monorepo-mode --phase ${phase.id} --goal ${qGoal}`);
    }
    return {
      ...phase,
      commands,
      artifact: files[phase.id] || phase.deliverable,
    };
  });
}

function buildPromptLibrary(goal, selectedSubsystem, tracks, repoAudit = null) {
  const trackLines = tracks.map((track) => `${track.label}: ${track.focus}`).join('\n');
  const selectedLabel = selectedSubsystem?.path || selectedSubsystem?.name || '[SUBSYSTEM_NAME]';
  const auditSummaryLines = repoAudit
    ? [
      `Repo health: ${repoAudit.repoHealth?.verdict || 'unknown'} / score ${repoAudit.repoHealth?.score ?? 'n/a'}`,
      `Top pass order: ${(repoAudit.suggestedPassOrder || []).slice(0, 4).map((item) => item.area).join(' -> ') || 'none'}`,
      `Top verified findings: ${(repoAudit.findings?.verified || []).slice(0, 4).map((item) => `${item.area}: ${item.title}`).join(' | ') || 'none'}`,
      `Top probable findings: ${(repoAudit.findings?.probable || []).slice(0, 4).map((item) => `${item.area}: ${item.title}`).join(' | ') || 'none'}`,
    ]
    : ['No repo-audit prepass summary was available.'];
  const selectedAuditLines = selectedSubsystem?.auditFindings?.length
    ? selectedSubsystem.auditFindings.map((finding) => `${finding.severity}: ${finding.title} -> ${finding.detail}`)
    : ['No subsystem-specific audit findings were preloaded for this area.'];
  const master = `You are doing a principal-level monorepo analysis.

This is a large repository. Do NOT pretend to understand everything at once.

Repo-audit scout summary:
${auditSummaryLines.map((line) => `- ${line}`).join('\n')}

Work in phases:

Phase 1: Build a repo map
- identify apps, packages, services, shared modules, tests, infra, configs
- identify likely entrypoints and source-of-truth files
- identify the architectural spine

Phase 2: Identify the highest-risk subsystems
- rank by correctness risk, security risk, coupling, contract fragility, and production impact

Phase 3: Deep-review only the top priority subsystem
- inspect real code paths
- distinguish confirmed findings from inference
- produce a dense findings list with severity and impact

Phase 4: Produce a safe patch plan
- smallest highest-value fixes first
- mention impacted files and verification method

Phase 5: Execute changes carefully
- avoid unnecessary broad refactors
- preserve behavior unless fixing a bug
- add/update tests where logic changes

Phase 6: Verify
- identify verified vs unverified areas
- state remaining risks explicitly

Output format:
- Repo Map
- Top Risk Areas
- Deep Findings
- Assumptions / Inferences
- Patch Plan
- Verification Notes`;

  const repoMap = `Start with Phase 1 only: build a repository map.

Tasks:
1. Identify top-level apps, packages, services, libraries, scripts, configs, infra, docs, and test areas.
2. Infer the main runtime architecture:
   - frontend app(s)
   - backend/API
   - shared packages
   - data layer
   - auth
   - background jobs / workers
   - integrations
3. Identify likely source-of-truth files for:
   - app bootstrapping
   - server startup
   - dependency injection / container setup
   - auth flow
   - API route registration
   - schema/types/contracts
   - env/config loading
   - build/test tooling
4. Identify which areas are likely stale vs active.
5. Produce a prioritized list of folders/files I should inspect next.

Do not review everything yet.
Do not propose refactors yet.
Just build the map and point out the likely architectural spine.

Use the repo-audit scout as your seed, but correct it if source code disproves it.`;

  const criticalAreas = `Based on the repository map, identify the 5 highest-risk subsystems from an engineering perspective.

Evaluate risk using:
- correctness risk
- security risk
- hidden coupling
- data contract fragility
- testability gaps
- production incident potential
- maintainability cost

For each subsystem provide:
- why it is high-risk
- what files likely matter most
- what kinds of failures may exist
- whether it should be reviewed before implementation work

Do not give generic advice.
Tie every claim to concrete code areas or file paths where possible.

Audit scout hints:
${auditSummaryLines.map((line) => `- ${line}`).join('\n')}`;

  const deepReview = `Now do a deep review of this subsystem only: ${selectedLabel}

Preloaded audit findings for this subsystem:
${selectedAuditLines.map((line) => `- ${line}`).join('\n')}

Review goals:
- find real engineering risks, not style issues
- inspect code paths, not just type definitions
- identify correctness bugs, missing guards, invalid assumptions, broken abstractions, hidden coupling, weak contracts, race conditions, stale patterns, and test gaps
- distinguish confirmed findings from inferences

Focus on:
- architecture
- execution flow
- data contracts
- failure modes
- extension safety
- observability
- test coverage quality

Output format:
1. Confirmed findings
2. Likely findings / inferences
3. Architectural weaknesses
4. Data flow risks
5. Test gaps
6. Suggested minimal refactor plan
7. Suggested larger redesign if needed

For each finding include:
- severity: critical / high / medium / low
- why it matters
- likely runtime effect
- what code area should be changed`;

  const denseFindings = `Give me a dense engineering findings list.

Rules:
- maximize signal density
- no long prose
- no motivational language
- no repetition
- one finding per bullet
- each bullet must include: severity, issue, impact, suggested direction
- prefer many concrete bullets over a few broad paragraphs

Focus only on meaningful issues, not stylistic nits.`;

  const planFirst = `Do not implement yet.

First produce:
1. a patch plan,
2. dependency/risk notes,
3. verification strategy,
4. rollback sensitivity.

Repo-audit prepass should influence patch ordering, but not replace code inspection.

Then wait for execution within the same reasoning process and apply the plan in safe order.`;

  const execution = `Now switch from review mode to execution mode.

Your task:
Implement the highest-value, lowest-regret fixes first.

Execution rules:
- avoid massive refactors unless necessary
- preserve behavior unless a behavior bug is explicitly being fixed
- keep changes modular and reviewable
- update or add tests when changing logic
- do not silently change public contracts without flagging it
- if multiple changes are needed, group them into coherent patches

Work in this order:
1. critical correctness issues
2. security / auth / boundary issues
3. contract consistency
4. testability improvements
5. maintainability refactors
6. optional enhancements

For each patch:
- explain what you are changing
- explain why
- mention impacted files
- mention verification method`;

  const verification = `Now verify the changes.

Verification tasks:
- run or inspect the relevant tests
- identify what is still unverified
- look for broken imports, contract mismatches, stale call sites, and type-level drift
- check whether the patch introduced hidden behavior changes
- tell me what remains risky after the patch

Output:
- verified
- partially verified
- unverified
- remaining risks
- next recommended fixes`;

  const trackSplit = `Treat this repo as a multi-track system.
Do not reason about the whole repository as one undifferentiated blob.

Split analysis into these tracks:
${trackLines}

For each track:
- identify the architectural spine
- identify the most dangerous files
- identify unresolved coupling points
- identify likely stale assumptions
- identify what should be reviewed next

Then rank tracks by priority.`;

  return {
    master,
    repoMap,
    criticalAreas,
    deepReview,
    denseFindings,
    planFirst,
    execution,
    verification,
    trackSplit,
    microPrompts: [
      'Do not assume understanding from surface file names. Trace actual execution paths and contracts before making claims.',
      'Do not summarize prematurely. Build a working model of the subsystem first.',
      'Prefer source-of-truth code paths over descriptive docs.',
    ],
  };
}

function renderAgentsMonorepoSection() {
  const phaseLine = PHASES.map((phase) => phase.title.replace(/^Phase \d+:\s*/, '')).join(' -> ');
  const trackLines = TRACK_DEFINITIONS.map((track) => `- \`${track.label}: ${track.focus}\``).join('\n');
  return [
    '- `Generated by rai monorepo-mode; rerunning the command refreshes this section.`',
    '- `Use rai monorepo-mode --goal "<goal>" for large-repo review, bug hunt, refactor, or feature work when one-shot prompting would lose context.`',
    `- \`Never ask for whole-repo one-shot review or implementation. Work in phases: ${phaseLine}.\``,
    '- `Canonical artifacts for this mode: docs/workflow/MONOREPO.md, docs/workflow/REPO_MAP.md, docs/workflow/REVIEW_SCOPE.md, docs/workflow/PATCH_PLAN.md, and .workflow/reports/monorepo-mode.md.`',
    '- `Source-of-truth order when docs and code conflict: runtime code -> schema/contracts -> integration code -> tests -> docs.`',
    '- `Always distinguish confirmed facts from inferences and trace actual execution paths before making architectural claims.`',
    '- `Do not broad-refactor before dependency boundaries, package fan-out, and contract surfaces are explicit.`',
    '- `Preserve public contracts unless the change explicitly calls for a contract change, and add or update tests when logic changes.`',
    '- `Verify package-local first, then root smoke checks, then one explicit re-review or residual-risk pass.`',
    '- `Treat the repository as a multi-track system rather than one undifferentiated blob:`',
    trackLines,
    '- `Definition of done for this mode: selected subsystem is explicit, REPO_MAP/REVIEW_SCOPE/PATCH_PLAN are refreshed, verified vs unverified areas are called out, and remaining risks stay visible.`',
  ].join('\n');
}

function syncAgentsMonorepoLayer(cwd) {
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const existed = Boolean(readIfExists(agentsPath));
  let content = readIfExists(agentsPath);
  if (!content) {
    content = '# AGENTS\n\n- Keep changes explicit and easy to review.\n- Prefer small, targeted edits.\n';
  }
  if (!/^#\s+AGENTS\b/m.test(content)) {
    content = `# AGENTS\n\n${String(content).trim()}\n`;
  }
  const next = replaceOrAppendSection(content, 'Large Monorepo Workflow Layer', renderAgentsMonorepoSection());
  const writeResult = writeIfChanged(agentsPath, `${String(next).trimEnd()}\n`);
  return {
    path: relativePath(cwd, agentsPath),
    existed,
    changed: writeResult.changed,
    sizeWarning: warnAgentsSize(cwd),
  };
}

function renderRepoMapMarkdown(goal, repoMap, filePath) {
  const lines = [
    '# REPO MAP',
    '',
    `- Goal: \`${goal}\``,
    `- Generated by: \`${filePath}\``,
    '',
    '## Top-Level Areas',
    '',
    `- Apps: \`${repoMap.topLevelAreas.apps.join(', ') || 'none detected'}\``,
    `- Packages: \`${repoMap.topLevelAreas.packages.join(', ') || 'none detected'}\``,
    `- Services: \`${repoMap.topLevelAreas.services.join(', ') || 'none detected'}\``,
    `- Libraries: \`${repoMap.topLevelAreas.libraries.join(', ') || 'none detected'}\``,
    `- Scripts: \`${repoMap.topLevelAreas.scripts.join(', ') || 'none detected'}\``,
    `- Configs: \`${repoMap.topLevelAreas.configs.join(', ') || 'none detected'}\``,
    `- Infra: \`${repoMap.topLevelAreas.infra.join(', ') || 'none detected'}\``,
    `- Docs: \`${repoMap.topLevelAreas.docs.join(', ') || 'none detected'}\``,
    `- Tests: \`${repoMap.topLevelAreas.tests.join(', ') || 'none detected'}\``,
    '',
    '## Architectural Spine',
    '',
  ];

  for (const entry of repoMap.architecture) {
    lines.push(`- [${entry.confidence}] ${entry.label}: \`${entry.entries.join(', ') || 'none detected'}\``);
    lines.push(`  ${entry.note}`);
  }

  lines.push('', '## Source Of Truth Candidates', '');
  for (const entry of repoMap.sourceOfTruth) {
    lines.push(`- ${entry.label}: \`${entry.files.join(', ') || 'none detected'}\``);
    lines.push(`  ${entry.files.length > 0 ? 'Treat the detected files as first-pass source-of-truth candidates.' : entry.fallback}`);
  }

  lines.push('', '## Likely Active Areas', '');
  for (const item of repoMap.activeAreas) {
    lines.push(`- [${item.confidence}] ${item.detail}`);
  }

  lines.push('', '## Likely Stale Areas', '');
  for (const item of repoMap.staleAreas) {
    lines.push(`- [${item.confidence}] ${item.detail}`);
  }

  lines.push('', '## Inspect Next', '');
  for (const file of repoMap.inspectNext) {
    lines.push(`- \`${file}\``);
  }
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderReviewScopeMarkdown(goal, selectedSubsystem, criticalAreas, tracks, promptLibrary, filePath) {
  const lines = [
    '# REVIEW SCOPE',
    '',
    `- Goal: \`${goal}\``,
    `- Selected subsystem: \`${selectedSubsystem?.path || selectedSubsystem?.name || 'none'}\``,
    `- Generated by: \`${filePath}\``,
    '',
    '## Top Risk Areas',
    '',
  ];

  for (const area of criticalAreas) {
    lines.push(`- \`${area.severity}\` ${area.path} -> ${area.why}`);
    lines.push(`  Files: \`${area.files.join(', ')}\``);
    lines.push(`  Failures: \`${area.failures.join(' | ')}\``);
    if ((area.auditFindings || []).length > 0) {
      lines.push(`  Audit findings: \`${area.auditFindings.map((finding) => `[${finding.severity}] ${finding.title}`).join(' | ')}\``);
    }
  }

  lines.push('', '## Track Ranking', '');
  for (const track of tracks) {
    lines.push(`- \`${track.priority}\` ${track.label}: ${track.focus}`);
    lines.push(`  Spine: ${track.architecturalSpine}`);
    lines.push(`  Review next: \`${track.reviewNext.join(', ') || 'none'}\``);
  }

  lines.push('', '## Deep Review Prompt', '', renderCodeBlock(promptLibrary.deepReview), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderPatchPlanMarkdown(goal, patchPlan, phasePlan, promptLibrary, filePath) {
  const lines = [
    '# PATCH PLAN',
    '',
    `- Goal: \`${goal}\``,
    `- Generated by: \`${filePath}\``,
    '',
    '## Patch Groups',
    '',
  ];

  for (const group of patchPlan.patchGroups) {
    lines.push(`- ${group.title}`);
    lines.push(`  Why: ${group.why}`);
    lines.push(`  Impacted files: \`${group.impactedFiles.join(', ') || 'none'}\``);
    if ((group.auditFindings || []).length > 0) {
      lines.push(`  Audit findings: \`${group.auditFindings.join(' | ')}\``);
    }
    lines.push(`  Verification: \`${group.verification.join(' | ') || 'none'}\``);
    lines.push(`  Rollback sensitivity: \`${group.rollbackSensitivity}\``);
  }

  lines.push('', '## Dependency / Risk Notes', '');
  for (const note of patchPlan.dependencyNotes) {
    lines.push(`- ${note}`);
  }

  lines.push('', '## Verification Strategy', '');
  for (const command of patchPlan.verificationStrategy) {
    lines.push(`- \`${command}\``);
  }

  lines.push('', '## Rollback Sensitivity', '');
  for (const item of patchPlan.rollbackSensitivity) {
    lines.push(`- ${item}`);
  }

  lines.push('', '## First Small Safe Changes', '');
  for (const item of patchPlan.firstSmallSafeChanges) {
    lines.push(`- ${item}`);
  }

  lines.push('', '## Phase Commands', '');
  for (const phase of phasePlan) {
    lines.push(`- ${phase.title}: \`${phase.commands.join(' | ')}\``);
  }

  lines.push('', '## Plan-First Prompt', '', renderCodeBlock(promptLibrary.planFirst), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderMonorepoModeMarkdown(payload) {
  const lines = [
    '# MONOREPO MODE',
    '',
    `- Goal: \`${payload.goal}\``,
    `- Phase focus: \`${payload.phase}\``,
    `- Profile: \`${payload.profile.id}\``,
    `- Repo shape: \`${payload.monorepo.repoShape}\``,
    `- Selected subsystem: \`${payload.selectedSubsystem?.path || payload.selectedSubsystem?.name || 'none'}\``,
    '',
    '## Repo Audit Scout',
    '',
    `- Report: \`${payload.files.repoAudit}\``,
    `- Repo health: \`${payload.repoAudit.repoHealth.verdict}\``,
    `- Score: \`${payload.repoAudit.repoHealth.score}\``,
    `- Verified findings: \`${payload.repoAudit.repoHealth.counts.verified}\``,
    `- Probable findings: \`${payload.repoAudit.repoHealth.counts.probable}\``,
    ...(payload.repoAudit.suggestedPassOrder.length > 0
      ? payload.repoAudit.suggestedPassOrder.slice(0, 4).map((item) => `- Pass ${item.order}: \`${item.area}\` -> ${item.why}`)
      : ['- `No audit pass order was generated.`']),
    '',
    '## Repo Map',
    '',
    `- REPO_MAP.md: \`${payload.files.repoMap}\``,
    `- Top apps: \`${payload.repoMap.topLevelAreas.apps.join(', ') || 'none'}\``,
    `- Inspect next: \`${payload.repoMap.inspectNext.join(', ') || 'none'}\``,
    '',
    '## Critical Areas',
    '',
    ...(payload.criticalAreas.length > 0
      ? payload.criticalAreas.map((area) => `- \`${area.severity}\` ${area.path} -> ${area.why}`)
      : ['- `No critical areas were inferred.`']),
    '',
    '## Track Priority',
    '',
    ...(payload.tracks.length > 0
      ? payload.tracks.map((track) => `- \`${track.priority}\` ${track.label}: ${track.focus} -> ${track.architecturalSpine}`)
      : ['- `No track ranking was inferred.`']),
    '',
    '## Phase Plan',
    '',
    ...payload.phasePlan.map((phase) => `- ${phase.title} -> \`${phase.artifact}\` :: \`${phase.commands.join(' | ')}\``),
    '',
    '## Prompt Library',
    '',
    '### Master Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.master),
    '',
    '### Repo Map Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.repoMap),
    '',
    '### Critical Areas Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.criticalAreas),
    '',
    '### Deep Review Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.deepReview),
    '',
    '### Dense Findings Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.denseFindings),
    '',
    '### Plan-First Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.planFirst),
    '',
    '### Execution Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.execution),
    '',
    '### Verification Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.verification),
    '',
    '### Track Split Prompt',
    '',
    renderCodeBlock(payload.promptLibrary.trackSplit),
    '',
    '## Prompt Guardrails',
    '',
    ...payload.promptLibrary.microPrompts.map((prompt) => `- ${prompt}`),
    '',
    '## Patch Plan Snapshot',
    '',
    ...payload.patchPlan.patchGroups.map((group) => `- ${group.title} -> \`${group.impactedFiles.join(', ') || 'none'}\``),
    '',
    '## Command Plan',
    '',
    `- Primary: \`${payload.commandPlan.primaryCommand}\``,
    ...payload.commandPlan.secondaryCommands.map((command) => `- Follow-up: \`${command}\``),
    '',
  ];

  if (payload.contextPack) {
    lines.push('## Context Pack', '');
    lines.push(`- File: \`${payload.contextPack.file}\``);
    lines.push(`- JSON: \`${payload.contextPack.jsonFile}\``);
    lines.push(`- Focus files: \`${payload.contextPack.focusFiles.slice(0, 8).join(', ') || 'none'}\``);
    lines.push('');
  }

  if (payload.agents) {
    lines.push('## AGENTS Sync', '');
    lines.push(`- File: \`${payload.agents.path}\``);
    lines.push(`- Existed before run: \`${payload.agents.existed ? 'yes' : 'no'}\``);
    lines.push(`- Changed in this run: \`${payload.agents.changed ? 'yes' : 'no'}\``);
    lines.push(`- Size check: \`${payload.agents.sizeWarning}\``);
    lines.push('');
  }

  lines.push('## Artifacts', '');
  lines.push(`- Report: \`${payload.files.report}\``);
  lines.push(`- JSON: \`${payload.files.json}\``);
  lines.push(`- AGENTS: \`${payload.files.agents}\``);
  lines.push(`- REPO_MAP: \`${payload.files.repoMap}\``);
  lines.push(`- REVIEW_SCOPE: \`${payload.files.reviewScope}\``);
  lines.push(`- PATCH_PLAN: \`${payload.files.patchPlan}\``);
  lines.push(`- REPO_AUDIT: \`${payload.files.repoAudit}\``);
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function phaseToPrompt(phase, promptLibrary) {
  const map = {
    'repo-map': promptLibrary.repoMap,
    'critical-areas': promptLibrary.criticalAreas,
    'deep-analysis': promptLibrary.deepReview,
    risks: promptLibrary.denseFindings,
    'patch-plan': promptLibrary.planFirst,
    execute: promptLibrary.execution,
    verify: promptLibrary.verification,
    full: promptLibrary.master,
  };
  return map[phase] || promptLibrary.master;
}

function buildMonorepoMode(cwd, rootDir, options = {}) {
  const goal = String(options.goal || 'run the staged monorepo workflow').trim();
  const phase = String(options.phase || 'full').trim().toLowerCase();
  const validPhases = new Set(['full', ...PHASES.map((item) => item.id)]);
  if (!validPhases.has(phase)) {
    throw new Error(`Unknown phase: ${phase}`);
  }

  const map = buildCodebaseMap(cwd, rootDir, {
    scopeKind: 'repo',
    refreshMode: 'incremental',
    writeFiles: true,
  });
  const monorepo = buildMonorepoIntelligence(cwd, rootDir, {
    writeFiles: true,
    maxWorkers: options.maxWorkers || 4,
  });
  const repoAudit = options['skip-audit-prepass']
    ? readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'repo-audit.json'), null)
    : runRepoAudit(cwd, {
      goal: `repo audit prepass for ${goal}`,
      mode: 'oneshot',
      stack: options.stack,
      writeArtifacts: true,
    });
  const graph = buildPackageGraph(cwd, { writeFiles: true });
  const repoFiles = Object.keys(graph.ownership || {}).sort();
  const packageMeta = mergePackageMetaWithRepoAudit(buildPackageMeta(graph, monorepo, repoFiles), repoAudit);
  const repoMap = buildRepoMap(cwd, map, graph, packageMeta, monorepo, rootDir);
  const criticalAreas = buildCriticalAreas(packageMeta);
  const selectedSubsystem = selectSubsystem(criticalAreas, options.subsystem, repoAudit);
  const tracks = buildTracks(TRACK_DEFINITIONS, packageMeta, repoMap.sourceOfTruth);
  const patchPlan = buildPatchPlan(criticalAreas, monorepo, goal, repoAudit);
  const files = {
    report: path.join(cwd, '.workflow', 'reports', 'monorepo-mode.md'),
    json: path.join(cwd, '.workflow', 'reports', 'monorepo-mode.json'),
    agents: path.join(cwd, 'AGENTS.md'),
    repoAudit: path.join(cwd, '.workflow', 'reports', 'repo-audit.md'),
    repoMap: path.join(rootDir, 'REPO_MAP.md'),
    reviewScope: path.join(rootDir, 'REVIEW_SCOPE.md'),
    patchPlan: path.join(rootDir, 'PATCH_PLAN.md'),
    'repo-map': relativePath(cwd, path.join(rootDir, 'REPO_MAP.md')),
    'critical-areas': relativePath(cwd, path.join(cwd, '.workflow', 'reports', 'monorepo-mode.md')),
    'deep-analysis': relativePath(cwd, path.join(rootDir, 'REVIEW_SCOPE.md')),
    risks: relativePath(cwd, path.join(cwd, '.workflow', 'reports', 'monorepo-mode.md')),
    'patch-plan': relativePath(cwd, path.join(rootDir, 'PATCH_PLAN.md')),
    execute: relativePath(cwd, path.join(cwd, '.workflow', 'reports', 'monorepo-mode.md')),
    verify: relativePath(cwd, path.join(cwd, '.workflow', 'reports', 'monorepo-mode.md')),
  };
  const promptLibrary = buildPromptLibrary(goal, selectedSubsystem, tracks, repoAudit);
  const phasePlan = buildPhasePlan(goal, selectedSubsystem, {
    ...files,
    report: relativePath(cwd, files.report),
    json: relativePath(cwd, files.json),
    repoMap: relativePath(cwd, files.repoMap),
    reviewScope: relativePath(cwd, files.reviewScope),
    patchPlan: relativePath(cwd, files.patchPlan),
  });

  const intentAnalysis = analyzeIntent(cwd, rootDir, goal);
  const profile = selectCodexProfile({ analysis: intentAnalysis });
  const contextPack = buildCodexContextPack(cwd, rootDir, goal, intentAnalysis, profile, {
    writeFiles: true,
  });
  const commandPlan = buildCommandPlan({
    goal,
    lane: 'review',
    capability: 'review.deep_review',
    repoSignals: { monorepo: true },
    trust: { verifyNeeded: true },
    profile,
    monorepo: {
      markdownFile: monorepo.markdownFile,
    },
  });
  if (commandPlan.bundleId === 'correction-wave' && !isRepoWideAuditGoal(goal)) {
    commandPlan.resolvedPrimaryCommand = `rai monorepo-mode --goal ${JSON.stringify(goal)}`;
  }
  const agents = options.skipAgents ? null : syncAgentsMonorepoLayer(cwd);

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: 'monorepo-mode',
    goal,
    phase,
    profile,
    repoAudit: {
      repoHealth: repoAudit?.repoHealth || { verdict: 'unknown', score: 0, counts: { verified: 0, probable: 0, heuristic: 0 } },
      suggestedPassOrder: (repoAudit?.suggestedPassOrder || []).slice(0, 6),
      stackPack: repoAudit?.stackPack || null,
      stackDiagnostics: repoAudit?.stackDiagnostics || null,
      artifacts: repoAudit?.artifacts || null,
      topVerifiedFindings: (repoAudit?.findings?.verified || []).slice(0, 5),
      topProbableFindings: (repoAudit?.findings?.probable || []).slice(0, 5),
    },
    repoMap,
    monorepo,
    criticalAreas,
    selectedSubsystem,
    tracks,
    patchPlan,
    phasePlan,
    promptLibrary,
    activePrompt: phaseToPrompt(phase, promptLibrary),
    agents,
    contextPack: {
      file: contextPack.file,
      jsonFile: contextPack.jsonFile,
      focusFiles: contextPack.focusFiles,
    },
    commandPlan,
    files: {
      report: relativePath(cwd, files.report),
      json: relativePath(cwd, files.json),
      agents: relativePath(cwd, files.agents),
      repoAudit: relativePath(cwd, files.repoAudit),
      repoMap: relativePath(cwd, files.repoMap),
      reviewScope: relativePath(cwd, files.reviewScope),
      patchPlan: relativePath(cwd, files.patchPlan),
    },
  };

  payload.controlPlane = buildReviewCorrectionControlPlane(cwd, {
    goal,
    repoAudit,
    monorepo: {
      ...monorepo,
      criticalAreas,
    },
    packageGraph: graph,
    activeLane: 'large-repo-review',
  }, {
    promotePlanned: true,
  });

  writeIfChanged(files.repoMap, renderRepoMapMarkdown(goal, repoMap, payload.files.repoMap));
  writeIfChanged(
    files.reviewScope,
    renderReviewScopeMarkdown(goal, selectedSubsystem, criticalAreas, tracks, promptLibrary, payload.files.reviewScope),
  );
  writeIfChanged(
    files.patchPlan,
    renderPatchPlanMarkdown(goal, patchPlan, phasePlan, promptLibrary, payload.files.patchPlan),
  );
  writeIfChanged(files.report, renderMonorepoModeMarkdown(payload));
  writeJson(files.json, payload);

  return payload;
}

function printHelp() {
  console.log(`
monorepo_mode

Usage:
  node scripts/workflow/monorepo_mode.js --goal "review the largest risk in this monorepo"

Options:
  --goal <text>         Goal text for the monorepo-mode run
  --root <path>         Workflow root. Defaults to active workstream root
  --phase <id>          full|repo-map|critical-areas|deep-analysis|risks|patch-plan|execute|verify
  --subsystem <name>    Explicit subsystem/package to deep-review first
  --stack <name>        Optional audit stack override such as flutter-firebase
  --skip-audit-prepass  Reuse the latest repo-audit artifact instead of running a fresh scout
  --max-workers <n>     Maximum bounded write lanes for monorepo planning
  --skip-agents         Do not create or refresh the root AGENTS.md monorepo section
  --json                Print machine-readable output
  `);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildMonorepoMode(cwd, rootDir, {
    goal: String(args.goal || args._.join(' ') || 'run the staged monorepo workflow').trim(),
    phase: args.phase ? String(args.phase).trim() : 'full',
    subsystem: args.subsystem ? String(args.subsystem).trim() : '',
    stack: args.stack ? String(args.stack).trim() : '',
    'skip-audit-prepass': Boolean(args['skip-audit-prepass']),
    maxWorkers: Number(args['max-workers'] || 4),
    skipAgents: Boolean(args['skip-agents']),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# MONOREPO MODE\n');
  console.log(`- File: \`${payload.files.report}\``);
  console.log(`- JSON: \`${payload.files.json}\``);
  console.log(`- AGENTS: \`${payload.files.agents}\``);
  console.log(`- REPO_MAP: \`${payload.files.repoMap}\``);
  console.log(`- REVIEW_SCOPE: \`${payload.files.reviewScope}\``);
  console.log(`- PATCH_PLAN: \`${payload.files.patchPlan}\``);
  console.log(`- Critical areas: \`${payload.criticalAreas.length}\``);
  if (payload.controlPlane?.artifacts?.correctionControlMarkdown) {
    console.log(`- Control plane: \`${payload.controlPlane.artifacts.correctionControlMarkdown}\``);
  }
  console.log(`- Tracks: \`${payload.tracks.length}\``);
  console.log(`- Selected subsystem: \`${payload.selectedSubsystem?.path || payload.selectedSubsystem?.name || 'none'}\``);
  console.log(`- Phase prompt: \`${payload.phase}\``);
  console.log(`- Context pack: \`${payload.contextPack.file}\``);
}

module.exports = {
  buildMonorepoMode,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
