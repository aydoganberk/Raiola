const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJsonIfExists } = require('./runtime_helpers');
const { uniqueSorted } = require('./finding_model');

const STATUS_ORDER = Object.freeze({
  new: 1,
  triaged: 2,
  planned: 3,
  patched: 4,
  failed_verification: 5,
  verified: 6,
  rereviewed: 7,
  closed: 8,
});

const SEVERITY_ORDER = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
});

function reportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePathLike(value) {
  return normalizeText(value).replace(/\\/g, '/');
}

function compactList(values, limit = 8) {
  return uniqueSorted(values).slice(0, limit);
}

function slugFrom(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12)}`;
}

function normalizeStatus(value) {
  const status = normalizeText(value).toLowerCase();
  return STATUS_ORDER[status] ? status : 'new';
}

function canonicalSeverity(sourceType, severity) {
  const normalized = normalizeText(severity).toLowerCase();
  if (sourceType === 'review') {
    if (normalized === 'blocker') return 'critical';
    if (normalized === 'must_fix') return 'high';
    if (normalized === 'should_fix') return 'medium';
    return 'low';
  }
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
    return normalized;
  }
  return 'medium';
}

function categoryFromText(rawCategory, title, detail) {
  const text = [rawCategory, title, detail].filter(Boolean).join(' ').toLowerCase();
  if (/security|auth|permission|secret|credential|token|xss|csrf|injection|firewall|rules|vuln/.test(text)) {
    return 'security';
  }
  if (/performance|perf|latency|slow|n\+1|bundle size|render cost|memory|cache/.test(text)) {
    return 'performance';
  }
  if (/architecture|contract|boundary|coupling|dependency|shared surface|shared contract|workspace|monorepo|subsystem/.test(text)) {
    return 'architecture';
  }
  if (/test gap|tests?|coverage|verify|verification|replay|regression|smoke|assertion|flaky/.test(text)) {
    return 'test-gap';
  }
  if (/maintain|cleanup|debt|dup|duplicate|readability|consistency|style|simplify|refactor/.test(text)) {
    return 'maintainability';
  }
  if (/reliab|crash|panic|null|undefined|error state|loading state|data drift|migration|rollback|availability/.test(text)) {
    return 'reliability';
  }
  return 'correctness';
}

function inferScopeType(scopePath, packageGraph) {
  const normalized = normalizePathLike(scopePath);
  if (!normalized || normalized === 'repo') {
    return 'repo';
  }
  if (normalized === 'test') {
    return 'repo';
  }
  const packageEntries = Array.isArray(packageGraph?.packages) ? packageGraph.packages : [];
  if (packageEntries.some((pkg) => normalizePathLike(pkg.path) === normalized || normalizeText(pkg.id) === normalized)) {
    return 'package';
  }
  if (/^(packages|apps|services|libs|modules|workspaces?)\//.test(normalized)) {
    return normalized.split('/').length <= 2 ? 'package' : 'subsystem';
  }
  if (/\.[A-Za-z0-9]+$/.test(normalized)) {
    return 'file';
  }
  if (normalized.includes('/')) {
    return packageGraph?.repoShape === 'monorepo' ? 'subsystem' : 'file';
  }
  return 'subsystem';
}

function ownerForScope(scopePath, scopeType, packageGraph) {
  const normalized = normalizePathLike(scopePath);
  if (!normalized || normalized === 'repo') {
    return 'repo';
  }
  if (scopeType === 'file') {
    if (packageGraph?.ownership?.[normalized]) {
      return normalizeText(packageGraph.ownership[normalized]);
    }
    const packageEntries = Array.isArray(packageGraph?.packages) ? packageGraph.packages : [];
    const matched = packageEntries
      .filter((pkg) => normalized === normalizePathLike(pkg.path) || normalized.startsWith(`${normalizePathLike(pkg.path)}/`))
      .sort((left, right) => normalizePathLike(right.path).length - normalizePathLike(left.path).length)[0];
    return normalizeText(matched?.id || matched?.path || normalized.split('/')[0] || 'repo');
  }
  return normalizeText(normalized);
}

function defaultWaveForFixability(fixability) {
  if (fixability === 'safe_patch') {
    return 'surgical';
  }
  if (fixability === 'bounded_refactor') {
    return 'bounded-refactor';
  }
  return 'hardening';
}

function inferFixability(item) {
  const text = [item.category, item.title, item.detail, item.scopeType, item.scopePath].filter(Boolean).join(' ').toLowerCase();
  if (item.scopeType === 'repo' || /migration|schema|rollback|secret|credential|payment|billing|prod|production|public api|policy/.test(text)) {
    return 'human_decision';
  }
  if (item.category === 'architecture' || /refactor|extract|restructure|boundary|shared surface|coupling|fan out|workspace|package/.test(text)) {
    return ['file', 'package', 'subsystem'].includes(item.scopeType) ? 'bounded_refactor' : 'human_decision';
  }
  if (item.category === 'security' && item.severity === 'critical') {
    return 'human_decision';
  }
  if (item.scopeType === 'subsystem' || item.scopeType === 'package') {
    return item.confidence >= 0.84 && ['correctness', 'reliability', 'test-gap'].includes(item.category)
      ? 'bounded_refactor'
      : 'human_decision';
  }
  if (item.scopeType === 'file' && item.confidence >= 0.78) {
    return 'safe_patch';
  }
  return item.scopeType === 'file' ? 'bounded_refactor' : 'human_decision';
}

function buildTaskHintMap(taskGraph) {
  const mapByFingerprint = new Map();
  const mapByFileTitle = new Map();
  for (const wave of taskGraph?.waves || []) {
    for (const task of wave.tasks || []) {
      for (const ref of task.findingRefs || []) {
        const key = normalizeText(ref.fingerprint || '');
        if (key) {
          mapByFingerprint.set(key, {
            taskId: task.id,
            wave: wave.label,
            mode: task.mode,
            verifyCommands: compactList(task.verifyCommands || [], 6),
            owner: task.owner,
          });
        }
        const fallback = `${normalizePathLike(ref.file)}::${normalizeText(ref.title).toLowerCase()}`;
        if (normalizeText(ref.title)) {
          mapByFileTitle.set(fallback, {
            taskId: task.id,
            wave: wave.label,
            mode: task.mode,
            verifyCommands: compactList(task.verifyCommands || [], 6),
            owner: task.owner,
          });
        }
      }
    }
  }
  return { mapByFingerprint, mapByFileTitle };
}

function buildAuditCorrectionHintMap(correctionPlan) {
  const mapByFingerprint = new Map();
  const mapByAreaTitle = new Map();
  for (const item of correctionPlan || []) {
    const fingerprint = normalizeText(item.findingFingerprint);
    if (fingerprint) {
      mapByFingerprint.set(fingerprint, {
        patchGroupId: item.patchGroupId,
        priority: item.priority,
        verifyCommands: compactList(item.verifyChain || item.verify || [], 6),
        area: normalizePathLike(item.area),
      });
    }
    const key = `${normalizePathLike(item.area)}::${normalizeText(item.title).toLowerCase()}`;
    mapByAreaTitle.set(key, {
      patchGroupId: item.patchGroupId,
      priority: item.priority,
      verifyCommands: compactList(item.verifyChain || item.verify || [], 6),
      area: normalizePathLike(item.area),
    });
  }
  return { mapByFingerprint, mapByAreaTitle };
}

function verifyCommandsForCategory(item, goal) {
  const commands = [];
  const verificationGoal = normalizeText(goal) || item.title;
  if (item.category === 'test-gap') {
    commands.push('rai verify-shell --cmd "npm test"');
  }
  if (item.category === 'security') {
    commands.push('rai secure --json');
  }
  if (item.category === 'architecture' || item.fixability === 'bounded_refactor') {
    commands.push('rai review-tasks --json');
  }
  const text = [item.title, item.detail, item.scopePath].join(' ').toLowerCase();
  if (/frontend|ui|a11y|accessibility|responsive|design/.test(text)) {
    commands.push(`rai ui-review --goal ${JSON.stringify(verificationGoal)} --json`);
  }
  commands.push(`rai verify --goal ${JSON.stringify(`verify ${verificationGoal}`)}`);
  commands.push('rai re-review');
  return compactList(commands, 6);
}

function matchHint(item, taskHints, auditHints) {
  const fingerprint = normalizeText(item.sourceFingerprint);
  if (fingerprint && taskHints.mapByFingerprint.has(fingerprint)) {
    return { kind: 'task', ...taskHints.mapByFingerprint.get(fingerprint) };
  }
  if (fingerprint && auditHints.mapByFingerprint.has(fingerprint)) {
    return { kind: 'correction-plan', ...auditHints.mapByFingerprint.get(fingerprint) };
  }
  const fileKey = `${normalizePathLike(item.scopePath)}::${normalizeText(item.title).toLowerCase()}`;
  if (taskHints.mapByFileTitle.has(fileKey)) {
    return { kind: 'task', ...taskHints.mapByFileTitle.get(fileKey) };
  }
  if (auditHints.mapByAreaTitle.has(fileKey)) {
    return { kind: 'correction-plan', ...auditHints.mapByAreaTitle.get(fileKey) };
  }
  if (item.sourceType === 'audit') {
    const areaKey = `${normalizePathLike(item.scopePath)}::${normalizeText(item.title).toLowerCase()}`;
    if (auditHints.mapByAreaTitle.has(areaKey)) {
      return { kind: 'correction-plan', ...auditHints.mapByAreaTitle.get(areaKey) };
    }
  }
  return null;
}

function deriveStatus(previousItem, matchedHint, options = {}) {
  const previousStatus = normalizeStatus(previousItem?.status);
  const hasExplicitPlan = Boolean(matchedHint) || Boolean(options.promotePlanned);
  if (previousItem && ['patched', 'verified', 'rereviewed'].includes(previousStatus) && !hasExplicitPlan) {
    return 'triaged';
  }
  if (hasExplicitPlan) {
    return 'planned';
  }
  if (previousItem && previousStatus !== 'closed') {
    return previousStatus === 'new' ? 'triaged' : previousStatus;
  }
  return options.defaultStatus || 'triaged';
}

function compactVerifyRecipe(commands, matchedHint) {
  const ordered = compactList([
    ...(matchedHint?.verifyCommands || []),
    ...(commands || []),
  ], 8);
  return {
    commands: ordered,
    primaryCommand: ordered[0] || '',
    rereviewCommand: ordered.find((entry) => /re-review/.test(entry)) || 'rai re-review',
  };
}

function compactRegistryItem(item) {
  return {
    id: item.id,
    title: item.title,
    severity: item.severity,
    category: item.category,
    confidence: item.confidence,
    scopeType: item.scopeType,
    scopePath: item.scopePath,
    fixability: item.fixability,
    status: item.status,
    verify: item.verifyRecipe.commands,
  };
}

function buildWavePlan(openItems) {
  const buckets = {
    surgical: [],
    'bounded-refactor': [],
    hardening: [],
  };
  for (const item of openItems) {
    buckets[item.suggestedWave || defaultWaveForFixability(item.fixability)].push(item);
  }

  const waves = [];
  for (const [mode, items] of Object.entries(buckets)) {
    if (!items.length) {
      continue;
    }
    const verifyQueue = compactList(items.flatMap((item) => item.verifyRecipe.commands), 12);
    waves.push({
      id: `${mode}-wave-1`,
      mode,
      label: mode === 'surgical' ? 'Surgical Correction' : mode === 'bounded-refactor' ? 'Bounded Refactor Correction' : 'Hardening Correction',
      summary: mode === 'surgical'
        ? 'Apply the smallest safe file-local patches first.'
        : mode === 'bounded-refactor'
          ? 'Handle cross-file or package-bounded fixes after quick wins.'
          : 'Finish with verification, guardrails, and re-review closure.',
      itemCount: items.length,
      highRiskCount: items.filter((item) => SEVERITY_ORDER[item.severity] >= SEVERITY_ORDER.high).length,
      itemIds: items.map((item) => item.id),
      verifyQueue,
      rereviewRequired: verifyQueue.some((entry) => /re-review/.test(entry)) || items.some((item) => item.fixability !== 'safe_patch'),
    });
  }
  return waves;
}

function buildHotspots(context, registryItems) {
  const candidates = [];
  for (const item of context.review?.heatmap || []) {
    candidates.push({
      path: normalizePathLike(item.file),
      severityScore: Number(item.severityScore || 0),
      findings: Number(item.findings || 0),
      categories: compactList(item.categories || [], 6),
      source: 'review',
      reason: `review heatmap ${item.findings || 0} findings`,
    });
  }
  for (const item of context.repoAudit?.subsystemHeatmap || []) {
    candidates.push({
      path: normalizePathLike(item.area),
      severityScore: Number(item.riskScore || 0),
      findings: Number(item.findingCount || item.verifiedCount || 0),
      categories: compactList(item.tags || [], 6),
      source: 'audit',
      reason: item.why || `${item.severity || 'unknown'} hotspot`,
    });
  }
  for (const item of context.monorepo?.hotspots || []) {
    candidates.push({
      path: normalizePathLike(item.path || item.packagePath || item.packageName),
      severityScore: Number(item.riskScore || item.score || 0),
      findings: Number(item.findingCount || 0),
      categories: compactList(item.reasons || [], 6),
      source: 'monorepo',
      reason: item.summary || item.why || 'monorepo hotspot',
    });
  }
  if (candidates.length === 0) {
    const fallback = new Map();
    for (const item of registryItems.filter((entry) => entry.status !== 'closed')) {
      const key = item.scopePath;
      const current = fallback.get(key) || {
        path: key,
        severityScore: 0,
        findings: 0,
        categories: [],
        source: item.sourceType,
        reason: '',
      };
      current.severityScore += SEVERITY_ORDER[item.severity] || 1;
      current.findings += 1;
      current.categories = compactList([...current.categories, item.category], 6);
      current.reason = current.reason || `${item.sourceType} registry hotspot`;
      fallback.set(key, current);
    }
    return [...fallback.values()]
      .sort((left, right) => right.severityScore - left.severityScore || right.findings - left.findings || left.path.localeCompare(right.path))
      .slice(0, 8);
  }
  return candidates
    .sort((left, right) => right.severityScore - left.severityScore || right.findings - left.findings || left.path.localeCompare(right.path))
    .slice(0, 8);
}

function buildRankedPackages(context, registryItems) {
  const ranked = [];
  const seen = new Set();
  for (const item of context.repoAudit?.suggestedPassOrder || []) {
    const key = normalizePathLike(item.area);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      area: key,
      severity: normalizeText(item.severity || 'medium').toLowerCase() || 'medium',
      riskScore: Number(item.riskScore || 0),
      why: item.why || '',
      readFirst: compactList(item.readFirst || [], 6),
      source: 'repo-audit',
    });
  }
  for (const item of context.monorepo?.criticalAreas || []) {
    const key = normalizePathLike(item.path || item.packageName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ranked.push({
      area: key,
      severity: normalizeText(item.severity || 'medium').toLowerCase() || 'medium',
      riskScore: Number(item.riskScore || 0),
      why: item.why || item.summary || '',
      readFirst: compactList(item.files || item.reviewNext || [], 6),
      source: 'monorepo',
    });
  }
  if (ranked.length === 0) {
    const byOwner = new Map();
    for (const item of registryItems.filter((entry) => entry.status !== 'closed')) {
      const key = item.owner;
      const current = byOwner.get(key) || {
        area: key,
        severity: item.severity,
        riskScore: 0,
        why: '',
        readFirst: [],
        source: item.sourceType,
      };
      current.riskScore += SEVERITY_ORDER[item.severity] || 1;
      current.severity = SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[current.severity] ? item.severity : current.severity;
      current.readFirst = compactList([...current.readFirst, item.scopePath], 6);
      current.why = current.why || `${item.sourceType} ownership cluster`;
      byOwner.set(key, current);
    }
    return [...byOwner.values()]
      .sort((left, right) => right.riskScore - left.riskScore || left.area.localeCompare(right.area))
      .slice(0, 8);
  }
  return ranked
    .sort((left, right) => right.riskScore - left.riskScore || left.area.localeCompare(right.area))
    .slice(0, 8);
}

function summarizeRegistry(items) {
  const summary = {
    total: items.length,
    open: items.filter((item) => item.status !== 'closed').length,
    closed: items.filter((item) => item.status === 'closed').length,
    blockers: items.filter((item) => item.status !== 'closed' && SEVERITY_ORDER[item.severity] >= SEVERITY_ORDER.high).length,
    highConfidenceFixes: items.filter((item) => item.status !== 'closed' && item.confidence >= 0.8 && item.fixability === 'safe_patch').length,
    riskyRefactors: items.filter((item) => item.status !== 'closed' && item.fixability !== 'safe_patch').length,
    byStatus: {},
    bySeverity: {},
    byCategory: {},
    byScope: {},
    byFixability: {},
    bySource: {},
  };
  for (const item of items) {
    const increment = (bucket, key) => {
      bucket[key] = (bucket[key] || 0) + 1;
    };
    increment(summary.byStatus, item.status);
    increment(summary.bySeverity, item.severity);
    increment(summary.byCategory, item.category);
    increment(summary.byScope, item.scopeType);
    increment(summary.byFixability, item.fixability);
    increment(summary.bySource, item.sourceType);
  }
  return summary;
}

function buildClusters(items) {
  const buckets = new Map();
  for (const item of items.filter((entry) => entry.status !== 'closed')) {
    const clusterKey = `${item.owner}::${item.category}::${item.suggestedWave}`;
    const current = buckets.get(clusterKey) || {
      id: hashId('cluster', clusterKey),
      key: clusterKey,
      owner: item.owner,
      category: item.category,
      mode: item.suggestedWave,
      itemIds: [],
      itemCount: 0,
      highestSeverity: 'low',
      averageConfidence: 0,
      scopes: [],
    };
    current.itemIds.push(item.id);
    current.itemCount += 1;
    current.scopes = compactList([...current.scopes, item.scopePath], 6);
    current.highestSeverity = SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[current.highestSeverity] ? item.severity : current.highestSeverity;
    current.averageConfidence += item.confidence;
    buckets.set(clusterKey, current);
  }
  return [...buckets.values()]
    .map((cluster) => ({
      ...cluster,
      averageConfidence: Number((cluster.averageConfidence / Math.max(cluster.itemCount, 1)).toFixed(2)),
    }))
    .sort((left, right) => SEVERITY_ORDER[right.highestSeverity] - SEVERITY_ORDER[left.highestSeverity] || right.itemCount - left.itemCount || left.owner.localeCompare(right.owner));
}

function buildReviewControlRoom(context, registryItems, waves, hotspots) {
  const openItems = registryItems.filter((item) => item.status !== 'closed');
  return {
    activeLane: context.activeLane,
    openBlockerCount: openItems.filter((item) => SEVERITY_ORDER[item.severity] >= SEVERITY_ORDER.high).length,
    highConfidenceFixes: openItems.filter((item) => item.confidence >= 0.8 && item.fixability === 'safe_patch').length,
    riskyRefactors: openItems.filter((item) => item.fixability !== 'safe_patch').length,
    topHotspots: hotspots,
    verifyQueue: compactList(waves.flatMap((wave) => wave.verifyQueue), 12),
    rereviewNeededItems: openItems
      .filter((item) => item.verifyRecipe.commands.some((command) => /re-review/.test(command)))
      .slice(0, 8)
      .map((item) => compactRegistryItem(item)),
  };
}

function buildCorrectionBoard(registryItems, waves, goal) {
  const openItems = registryItems.filter((item) => item.status !== 'closed');
  const readyToPatchItems = openItems.filter((item) => item.fixability === 'safe_patch');
  const needsHumanDecisionItems = openItems.filter((item) => item.fixability === 'human_decision');
  const riskyRefactorItems = openItems.filter((item) => item.fixability === 'bounded_refactor');
  const patchedButUnverifiedItems = registryItems.filter((item) => item.status === 'patched');
  const failedVerificationItems = registryItems.filter((item) => item.status === 'failed_verification');
  const closedFindings = registryItems.filter((item) => item.status === 'closed');
  const verifyQueue = compactList(waves.flatMap((wave) => wave.verifyQueue), 12);
  return {
    readyToPatchCount: readyToPatchItems.length,
    needsHumanDecisionCount: needsHumanDecisionItems.length,
    riskyRefactorCount: riskyRefactorItems.length,
    patchedButUnverifiedCount: patchedButUnverifiedItems.length,
    failedVerificationCount: failedVerificationItems.length,
    closedFindingCount: closedFindings.length,
    readyToPatchItems: readyToPatchItems.slice(0, 10).map((item) => compactRegistryItem(item)),
    needsHumanDecisionItems: needsHumanDecisionItems.slice(0, 10).map((item) => compactRegistryItem(item)),
    riskyRefactorItems: riskyRefactorItems.slice(0, 10).map((item) => compactRegistryItem(item)),
    patchedButUnverifiedItems: patchedButUnverifiedItems.slice(0, 10).map((item) => compactRegistryItem(item)),
    failedVerificationItems: failedVerificationItems.slice(0, 10).map((item) => compactRegistryItem(item)),
    closedFindings: closedFindings.slice(0, 10).map((item) => compactRegistryItem(item)),
    verifyQueue,
    recommendedStarterCommand: `rai start correction --goal ${JSON.stringify(normalizeText(goal) || 'land the next correction wave')} --with repair|regression`,
  };
}

function buildLargeRepoBoard(context, rankedPackages, waves) {
  const currentShard = rankedPackages[0] || null;
  const nextShard = rankedPackages[1] || null;
  const totalDepth = rankedPackages.length;
  const coverageDepth = totalDepth >= 6
    ? 'deep'
    : totalDepth >= 3
      ? 'balanced'
      : totalDepth >= 1
        ? 'speed'
        : 'idle';
  return {
    rankedPackages: rankedPackages.slice(0, 8),
    currentShard,
    nextShard,
    correctionWaveProgress: {
      totalWaves: waves.length,
      activeWave: waves[0]?.id || '',
      readyToPatchCount: waves.find((wave) => wave.mode === 'surgical')?.itemCount || 0,
      verifyQueueCount: compactList(waves.flatMap((wave) => wave.verifyQueue), 20).length,
    },
    coverageDepth,
    repoShape: context.packageGraph?.repoShape || context.repoAudit?.repoShape || context.monorepo?.repoShape || 'standard',
  };
}

function renderMarkdown(controlPlane) {
  const lines = [
    '# REVIEW CORRECTION CONTROL PLANE',
    '',
    `- Goal: \`${controlPlane.goal}\``,
    `- Active lane: \`${controlPlane.reviewControlRoom.activeLane}\``,
    `- Open findings: \`${controlPlane.findingsRegistry.summary.open}\``,
    `- Open blockers: \`${controlPlane.reviewControlRoom.openBlockerCount}\``,
    `- High-confidence fixes: \`${controlPlane.reviewControlRoom.highConfidenceFixes}\``,
    `- Risky refactors: \`${controlPlane.reviewControlRoom.riskyRefactors}\``,
    '',
    '## Review Control Room',
    '',
    ...(controlPlane.reviewControlRoom.topHotspots.length > 0
      ? controlPlane.reviewControlRoom.topHotspots.map((item) => `- \`${item.path}\` score=${item.severityScore} findings=${item.findings} source=${item.source}`)
      : ['- `No hotspots were detected.`']),
    '',
    '## Correction Waves',
    '',
    ...(controlPlane.correctionPlanner.waves.length > 0
      ? controlPlane.correctionPlanner.waves.flatMap((wave) => ([
        `### ${wave.label}`,
        '',
        `- Mode: \`${wave.mode}\``,
        `- Items: \`${wave.itemCount}\``,
        `- High risk: \`${wave.highRiskCount}\``,
        `- Verify queue: \`${wave.verifyQueue.join(', ') || 'none'}\``,
        '',
      ]))
      : ['- `No correction waves were generated.`', '']),
    '## Correction Board',
    '',
    `- Ready to patch: \`${controlPlane.correctionBoard.readyToPatchCount}\``,
    `- Needs human decision: \`${controlPlane.correctionBoard.needsHumanDecisionCount}\``,
    `- Risky refactors: \`${controlPlane.correctionBoard.riskyRefactorCount}\``,
    `- Closed findings: \`${controlPlane.correctionBoard.closedFindingCount}\``,
    '',
    '## Large Repo Board',
    '',
    ...(controlPlane.largeRepoBoard.rankedPackages.length > 0
      ? controlPlane.largeRepoBoard.rankedPackages.map((item) => `- \`${item.area}\` score=${item.riskScore} severity=${item.severity} source=${item.source}`)
      : ['- `No ranked packages or shards were recorded.`']),
    '',
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildRegistryItems(context, previousRegistry, options = {}) {
  const taskHints = buildTaskHintMap(context.taskGraph || null);
  const auditHints = buildAuditCorrectionHintMap(context.repoAudit?.correctionPlan || context.correctionPlan || []);
  const previousByKey = new Map((previousRegistry?.items || []).map((item) => [normalizeText(item.registryKey || item.sourceFingerprint || item.id), item]));
  const currentItems = [];

  const registerItem = (input) => {
    const scopePath = normalizePathLike(input.scopePath || input.file || input.area || 'repo') || 'repo';
    const scopeType = input.scopeType || inferScopeType(scopePath, context.packageGraph || null);
    const owner = ownerForScope(scopePath, scopeType, context.packageGraph || null);
    const sourceFingerprint = normalizeText(input.sourceFingerprint || input.fingerprint || `${input.sourceType}:${scopePath}:${input.title}`);
    const registryKey = normalizeText(`${scopePath}::${normalizeText(input.title).toLowerCase()}::${input.category || ''}::${input.sourceType}`);
    const previousItem = previousByKey.get(registryKey) || previousByKey.get(sourceFingerprint) || null;
    const matchedHint = matchHint({
      sourceFingerprint,
      scopePath,
      title: input.title,
      sourceType: input.sourceType,
    }, taskHints, auditHints);
    const severity = canonicalSeverity(input.sourceType, input.originalSeverity || input.severity);
    const category = categoryFromText(input.originalCategory || input.category, input.title, input.detail);
    const draft = {
      id: hashId('finding', `${sourceFingerprint}::${registryKey}`),
      registryKey,
      sourceType: input.sourceType,
      sourceMode: normalizeText(input.sourceMode || input.mode || input.sourceType),
      sourceFingerprint,
      title: normalizeText(input.title),
      detail: normalizeText(input.detail),
      originalCategory: normalizeText(input.originalCategory || input.category),
      category,
      originalSeverity: normalizeText(input.originalSeverity || input.severity),
      severity,
      confidence: Number(Number(input.confidence ?? 0.74).toFixed(2)),
      scopeType,
      scopePath,
      owner,
      evidence: compactList(input.evidence || input.fileRefs || [scopePath], 8),
      suggestedNextAction: normalizeText(input.suggestedNextAction),
      whyFound: normalizeText(input.whyFound || input.detail),
      sourceLane: input.sourceLane,
      matchedHint,
    };
    draft.fixability = inferFixability(draft);
    draft.suggestedWave = defaultWaveForFixability(draft.fixability);
    draft.status = deriveStatus(previousItem, matchedHint, options);
    draft.verifyRecipe = compactVerifyRecipe(verifyCommandsForCategory(draft, context.goal), matchedHint);
    draft.clusterKey = `${draft.owner}::${draft.category}::${draft.suggestedWave}`;
    currentItems.push(draft);
  };

  for (const finding of context.review?.findings || []) {
    registerItem({
      sourceType: 'review',
      sourceLane: 'diff-review',
      sourceMode: finding.sourceMode || context.review?.mode || 'review',
      sourceFingerprint: finding.fingerprint,
      scopePath: finding.file,
      title: finding.title,
      detail: finding.detail,
      originalCategory: finding.category,
      originalSeverity: finding.severity,
      confidence: finding.confidence,
      evidence: finding.evidence || finding.fileRefs || [finding.file],
      fileRefs: finding.fileRefs,
      whyFound: finding.whyFound,
      suggestedNextAction: finding.suggestedNextAction,
    });
  }

  for (const classification of ['verified', 'probable', 'heuristic']) {
    for (const finding of context.repoAudit?.findings?.[classification] || []) {
      registerItem({
        sourceType: 'audit',
        sourceLane: context.packageGraph?.repoShape === 'monorepo' ? 'large-repo-review' : 'repo-review',
        sourceMode: finding.sourceMode || 'audit-repo',
        sourceFingerprint: finding.fingerprint,
        scopePath: finding.area,
        title: finding.title,
        detail: finding.detail,
        originalCategory: finding.classification,
        originalSeverity: finding.severity,
        confidence: finding.confidence,
        evidence: finding.evidence || finding.fileRefs || [finding.area],
        fileRefs: finding.fileRefs,
        whyFound: finding.whyFound,
        suggestedNextAction: finding.suggestedNextAction,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of currentItems.sort((left, right) => {
    return (SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity])
      || (right.confidence - left.confidence)
      || left.title.localeCompare(right.title);
  })) {
    if (seen.has(item.registryKey)) {
      continue;
    }
    seen.add(item.registryKey);
    deduped.push(item);
  }

  const closed = [];
  for (const item of previousRegistry?.items || []) {
    const key = normalizeText(item.registryKey || item.sourceFingerprint || item.id);
    const exists = deduped.some((entry) => entry.registryKey === key || entry.sourceFingerprint === key || entry.id === item.id);
    if (!exists) {
      closed.push({
        ...item,
        status: 'closed',
        closedAt: new Date().toISOString(),
      });
    }
  }

  return [...deduped, ...closed]
    .sort((left, right) => {
      return (STATUS_ORDER[left.status] - STATUS_ORDER[right.status])
        || (SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity])
        || left.title.localeCompare(right.title);
    });
}

function writeArtifacts(cwd, payload) {
  const dir = reportsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const registryPath = path.join(dir, 'findings-registry.json');
  const controlJsonPath = path.join(dir, 'correction-control.json');
  const controlMdPath = path.join(dir, 'correction-control.md');
  fs.writeFileSync(registryPath, `${JSON.stringify(payload.findingsRegistry, null, 2)}\n`);
  fs.writeFileSync(controlJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(controlMdPath, renderMarkdown(payload));
  return {
    findingsRegistry: relativePath(cwd, registryPath),
    correctionControl: relativePath(cwd, controlJsonPath),
    correctionControlMarkdown: relativePath(cwd, controlMdPath),
  };
}

function buildReviewCorrectionControlPlane(cwd, context = {}, options = {}) {
  const previousRegistry = readJsonIfExists(path.join(reportsDir(cwd), 'findings-registry.json')) || { items: [] };
  const activeLane = normalizeText(context.activeLane)
    || (context.packageGraph?.repoShape === 'monorepo' ? 'large-repo-review' : context.repoAudit ? 'repo-review' : context.review ? 'diff-review' : 'correction-wave');
  const registryItems = buildRegistryItems({
    ...context,
    activeLane,
  }, previousRegistry, options);
  const clusters = buildClusters(registryItems);
  const openItems = registryItems.filter((item) => item.status !== 'closed');
  const waves = buildWavePlan(openItems);
  const hotspots = buildHotspots(context, registryItems);
  const rankedPackages = buildRankedPackages(context, registryItems);
  const controlPlane = {
    generatedAt: new Date().toISOString(),
    goal: normalizeText(context.goal || 'review and correction control plane'),
    reviewControlRoom: buildReviewControlRoom({
      ...context,
      activeLane,
    }, registryItems, waves, hotspots),
    findingsRegistry: {
      summary: summarizeRegistry(registryItems),
      clusters,
      items: registryItems,
    },
    correctionPlanner: {
      waveCount: waves.length,
      waves,
      recommendedNextCommand: waves[0]?.mode === 'surgical'
        ? `rai fix --goal ${JSON.stringify(normalizeText(context.goal) || 'open the next surgical correction wave')}`
        : `rai start correction --goal ${JSON.stringify(normalizeText(context.goal) || 'open the next correction wave')} --with repair|regression`,
    },
    correctionBoard: buildCorrectionBoard(registryItems, waves, context.goal),
    largeRepoBoard: buildLargeRepoBoard(context, rankedPackages, waves),
    artifacts: null,
  };
  controlPlane.artifacts = writeArtifacts(cwd, controlPlane);
  return controlPlane;
}

module.exports = {
  buildReviewCorrectionControlPlane,
};
