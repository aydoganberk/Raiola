const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { uniqueSorted } = require('./finding_model');
const { readJsonIfExists } = require('./runtime_helpers');

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

const ATTENTION_ORDER = Object.freeze({
  failed_verification: 7,
  planned: 6,
  triaged: 5,
  new: 4,
  patched: 3,
  verified: 2,
  rereviewed: 1,
  closed: 0,
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

function compactOrderedList(values, limit = 8) {
  const result = [];
  const seen = new Set();
  for (const entry of values || []) {
    const value = normalizeText(entry);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12)}`;
}

function severityValue(severity) {
  return SEVERITY_ORDER[normalizeText(severity).toLowerCase()] || 1;
}

function statusValue(status) {
  return STATUS_ORDER[normalizeText(status).toLowerCase()] || 0;
}

function attentionValue(status) {
  return ATTENTION_ORDER[normalizeText(status).toLowerCase()] || 0;
}

function compactItem(item) {
  return {
    id: item.id,
    title: item.title,
    detail: item.detail,
    severity: item.severity,
    category: item.category,
    status: item.status,
    fixability: item.fixability,
    sourceKind: item.sourceKind,
    sourceLane: item.sourceLane,
    scopeType: item.scopeType,
    scopePath: item.scopePath,
    owner: item.owner,
    commands: compactOrderedList(item.commands || [], 6),
  };
}

function createStatusItem(input = {}) {
  const title = normalizeText(input.title);
  const detail = normalizeText(input.detail);
  const scopePath = normalizePathLike(input.scopePath || 'repo') || 'repo';
  const status = normalizeText(input.status).toLowerCase() || 'planned';
  return {
    id: normalizeText(input.id) || hashId('release-item', `${input.sourceKind || 'release'}::${scopePath}::${title}`),
    sourceKind: normalizeText(input.sourceKind || 'trust-gap') || 'trust-gap',
    sourceLane: normalizeText(input.sourceLane || 'release-control') || 'release-control',
    title,
    detail,
    severity: normalizeText(input.severity).toLowerCase() || 'medium',
    category: normalizeText(input.category).toLowerCase() || 'test-gap',
    status: STATUS_ORDER[status] ? status : 'planned',
    fixability: normalizeText(input.fixability || 'safe_patch') || 'safe_patch',
    scopeType: normalizeText(input.scopeType || 'repo') || 'repo',
    scopePath,
    owner: normalizeText(input.owner || 'repo') || 'repo',
    commands: compactOrderedList(input.commands || [], 8),
  };
}

function normalizeSharedRegistryItems(findingsRegistry) {
  return (findingsRegistry?.items || [])
    .filter((item) => normalizeText(item.status).toLowerCase() !== 'closed')
    .map((item) => createStatusItem({
      id: item.id,
      sourceKind: `registry:${normalizeText(item.sourceType || 'review') || 'review'}`,
      sourceLane: item.sourceLane || item.sourceType || 'review',
      title: item.title,
      detail: item.detail,
      severity: item.severity,
      category: item.category,
      status: item.status,
      fixability: item.fixability,
      scopeType: item.scopeType,
      scopePath: item.scopePath,
      owner: item.owner,
      commands: item.verifyRecipe?.commands || item.verify || [],
    }));
}

function mergeStatusItems(sharedItems, trustItems) {
  const merged = [];
  const seen = new Set();
  const items = [...(sharedItems || []), ...(trustItems || [])]
    .sort((left, right) => {
      return attentionValue(right.status) - attentionValue(left.status)
        || severityValue(right.severity) - severityValue(left.severity)
        || left.title.localeCompare(right.title);
    });
  for (const item of items) {
    const key = `${item.sourceKind}::${item.scopePath}::${item.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function summarizeItems(items, sharedSummary = {}) {
  const summary = {
    total: Number(sharedSummary.total || 0),
    open: 0,
    closed: Number(sharedSummary.closed || 0),
    blockers: 0,
    queuedForVerify: 0,
    failedVerification: 0,
    byStatus: {},
    bySeverity: {},
    byCategory: {},
    bySource: {},
  };
  const increment = (bucket, key) => {
    bucket[key] = (bucket[key] || 0) + 1;
  };
  if (summary.closed > 0) {
    increment(summary.byStatus, 'closed');
  }
  for (const item of items || []) {
    summary.total += 1;
    summary.open += 1;
    increment(summary.byStatus, item.status);
    increment(summary.bySeverity, item.severity);
    increment(summary.byCategory, item.category);
    increment(summary.bySource, item.sourceKind);
    if (severityValue(item.severity) >= SEVERITY_ORDER.high) {
      summary.blockers += 1;
    }
    if (['planned', 'patched', 'failed_verification'].includes(item.status)) {
      summary.queuedForVerify += 1;
    }
    if (item.status === 'failed_verification') {
      summary.failedVerification += 1;
    }
  }
  return summary;
}

function buildTrustDerivedItems(context = {}) {
  const items = [];
  const trustMode = normalizeText(context.trustMode).toLowerCase() || 'review-centric';
  const verificationSummary = context.verificationSummary || {};
  const shellVerdict = verificationSummary.shell?.latest?.verdict || 'missing';
  const browserVerdict = verificationSummary.browser?.latest?.verdict || 'missing';
  const unsupportedClaims = context.unsupportedClaims || [];
  const residualRisks = context.residualRisks || [];
  const manualFailures = (context.manualChecks || []).filter((item) => normalizeText(item.status).toLowerCase() === 'fail');
  const pendingApprovals = (context.approvalPlan?.pending || []).filter(Boolean);
  const repoHealthVerdict = normalizeText(context.repoAudit?.repoHealth?.verdict).toLowerCase();

  if (shellVerdict === 'fail') {
    items.push(createStatusItem({
      sourceKind: 'verification:shell',
      sourceLane: 'verify-work',
      title: 'Shell verification is failing',
      detail: normalizeText(verificationSummary.shell?.latest?.target) || 'The latest shell verification artifact failed.',
      severity: 'high',
      category: 'test-gap',
      status: 'failed_verification',
      fixability: 'bounded_refactor',
      commands: ['rai verify-shell --cmd "npm test" --json', 'rai verify-work --json'],
    }));
  } else if (shellVerdict === 'missing' && trustMode !== 'audit-only') {
    items.push(createStatusItem({
      sourceKind: 'verification:shell',
      sourceLane: 'verify-work',
      title: 'Shell verification artifact is missing',
      detail: 'Trust checks do not have a current shell verification run to anchor the verify queue.',
      severity: 'medium',
      category: 'test-gap',
      status: 'planned',
      fixability: 'safe_patch',
      commands: ['rai verify-shell --cmd "npm test" --json', 'rai verify-work --json'],
    }));
  }

  if (browserVerdict === 'fail') {
    items.push(createStatusItem({
      sourceKind: 'verification:browser',
      sourceLane: 'verify-work',
      title: 'Browser verification is failing',
      detail: normalizeText(verificationSummary.browser?.latest?.target) || 'The latest browser verification artifact failed.',
      severity: 'high',
      category: 'test-gap',
      status: 'failed_verification',
      fixability: 'bounded_refactor',
      commands: ['rai verify-browser --url http://localhost:3000 --json', 'rai verify-work --json'],
    }));
  }

  if (unsupportedClaims.length > 0) {
    items.push(createStatusItem({
      sourceKind: 'evidence:claims',
      sourceLane: 'verify-work',
      title: unsupportedClaims.length === 1 ? 'One claim still needs evidence' : `${unsupportedClaims.length} claims still need evidence`,
      detail: compactOrderedList(unsupportedClaims.map((row) => row.claim), 3).join(' | ') || 'Claims are still missing evidence links.',
      severity: unsupportedClaims.length >= 3 ? 'high' : 'medium',
      category: 'test-gap',
      status: 'planned',
      fixability: 'safe_patch',
      commands: ['rai claims check', 'rai evidence --json', 'rai verify-work --json'],
    }));
  }

  if (context.validationMissing && trustMode !== 'audit-only') {
    items.push(createStatusItem({
      sourceKind: 'contract:validation',
      sourceLane: 'verify-work',
      title: 'Validation contract is missing or empty',
      detail: 'Review and release status should not advance without an explicit validation map.',
      severity: 'medium',
      category: 'architecture',
      status: 'triaged',
      fixability: 'human_decision',
      commands: ['rai validation-map', 'rai verify-work --json'],
    }));
  }

  if (residualRisks.length > 0) {
    items.push(createStatusItem({
      sourceKind: 'risk:residual',
      sourceLane: 'ship-readiness',
      title: residualRisks.length === 1 ? 'One residual risk item remains open' : `${residualRisks.length} residual risk items remain open`,
      detail: compactOrderedList(residualRisks, 3).join(' | '),
      severity: residualRisks.length >= 3 ? 'high' : 'medium',
      category: 'reliability',
      status: 'triaged',
      fixability: 'human_decision',
      commands: ['rai ship-readiness --json', 'rai verify-work --json'],
    }));
  }

  if (manualFailures.length > 0) {
    items.push(createStatusItem({
      sourceKind: 'verification:manual',
      sourceLane: 'verify-work',
      title: manualFailures.length === 1 ? 'One manual verification check failed' : `${manualFailures.length} manual verification checks failed`,
      detail: compactOrderedList(manualFailures.map((item) => item.label), 3).join(' | '),
      severity: 'high',
      category: 'test-gap',
      status: 'failed_verification',
      fixability: 'human_decision',
      commands: ['rai verify-work --json'],
    }));
  }

  if (pendingApprovals.length > 0 && trustMode !== 'audit-only') {
    const securitySensitive = pendingApprovals.some((item) => {
      const text = [item.target, ...(item.categories || []), item.reason].join(' ').toLowerCase();
      return /secret|security|auth|credential|token|migration/.test(text);
    });
    items.push(createStatusItem({
      sourceKind: 'approval:pending',
      sourceLane: 'ship-readiness',
      title: pendingApprovals.length === 1 ? 'One approval grant still blocks ship' : `${pendingApprovals.length} approval grants still block ship`,
      detail: compactOrderedList(pendingApprovals.map((item) => `${item.target}: ${item.reason}`), 3).join(' | '),
      severity: 'high',
      category: securitySensitive ? 'security' : 'architecture',
      status: 'planned',
      fixability: 'human_decision',
      commands: [...pendingApprovals.map((item) => item.suggestedCommand), 'rai ship-readiness --json'],
    }));
  }

  if (repoHealthVerdict === 'critical' || repoHealthVerdict === 'at_risk') {
    items.push(createStatusItem({
      sourceKind: 'repo-health',
      sourceLane: 'ship-readiness',
      title: repoHealthVerdict === 'critical' ? 'Repo audit health is critical' : 'Repo audit health is still at risk',
      detail: normalizeText(context.repoAudit?.repoHealth?.summary) || 'Repo audit health still says release risk is elevated.',
      severity: repoHealthVerdict === 'critical' ? 'high' : 'medium',
      category: 'reliability',
      status: repoHealthVerdict === 'critical' ? 'planned' : 'triaged',
      fixability: 'human_decision',
      commands: ['rai audit-repo --json', 'rai ship-readiness --json'],
    }));
  }

  return items;
}

function buildVerifyStatusBoard(context = {}) {
  const items = context.items || [];
  const correctionControl = context.correctionControl || {};
  const verificationSummary = context.verificationSummary || {};
  const correctionQueue = correctionControl.correctionBoard?.verifyQueue
    || correctionControl.reviewControlRoom?.verifyQueue
    || correctionControl.correctionPlanner?.waves?.[0]?.verifyQueue
    || [];
  const itemQueue = items.flatMap((item) => item.commands || []);
  const verifyQueue = compactOrderedList([...correctionQueue, ...itemQueue], 12);
  const queuedForVerify = items.filter((item) => ['planned', 'patched', 'failed_verification'].includes(item.status));
  const failedVerificationItems = items.filter((item) => item.status === 'failed_verification');
  const evidenceGapItems = items.filter((item) => /evidence:claims|contract:validation/.test(item.sourceKind));
  const rereviewItems = items.filter((item) => (item.commands || []).some((command) => /re-review/.test(command)));
  const recommendedCommands = compactOrderedList([
    failedVerificationItems[0]?.commands?.[0],
    verifyQueue[0],
    correctionControl.correctionPlanner?.recommendedNextCommand,
    'rai verify-work --json',
    'rai ship-readiness --json',
  ], 6);

  return {
    shellGate: verificationSummary.shell?.latest?.verdict || 'missing',
    browserGate: verificationSummary.browser?.latest?.verdict || 'missing',
    openBlockerCount: items.filter((item) => severityValue(item.severity) >= SEVERITY_ORDER.high).length,
    queuedForVerifyCount: queuedForVerify.length,
    failedVerificationCount: failedVerificationItems.length,
    evidenceGapCount: evidenceGapItems.length,
    pendingRereviewCount: rereviewItems.length,
    verifyQueue,
    topStatusItems: items.slice(0, 8).map((item) => compactItem(item)),
    recommendedCommands,
    primaryCommand: recommendedCommands[0] || '',
  };
}

function buildShipReadinessBoard(context = {}) {
  const items = context.items || [];
  const shipReadiness = context.shipReadiness || {};
  const verifyStatusBoard = context.verifyStatusBoard || {};
  const approvalPlan = context.approvalPlan || { pending: [] };
  const repoAudit = context.repoAudit || {};
  const pendingApprovals = approvalPlan.pending || [];
  const pendingApprovalCommands = pendingApprovals.map((item) => item.suggestedCommand);
  const shipBlockerItems = items.filter((item) => {
    return item.status === 'failed_verification'
      || (severityValue(item.severity) >= SEVERITY_ORDER.high && ['planned', 'triaged', 'new', 'patched'].includes(item.status));
  });
  const releaseQueue = compactOrderedList([
    ...pendingApprovalCommands,
    ...verifyStatusBoard.verifyQueue || [],
    ...(shipReadiness.nextActions || []),
    'rai ship --json',
    'rai release-notes --json',
  ], 12);
  const releaseWaveLabel = pendingApprovals.length > 0
    ? 'Approval closeout wave'
    : verifyStatusBoard.failedVerificationCount > 0
      ? 'Verification recovery wave'
      : shipBlockerItems.length > 0
        ? 'Residual blocker wave'
        : 'Ship closeout wave';
  const releaseWaveCommand = pendingApprovalCommands[0]
    || verifyStatusBoard.primaryCommand
    || releaseQueue[0]
    || 'rai ship-readiness --json';
  const previewScore = Number.isFinite(Number(shipReadiness.score))
    ? Number(shipReadiness.score)
    : Math.max(0, Math.min(100,
      100
        - Math.min(40, shipBlockerItems.length * 10)
        - Math.min(25, pendingApprovals.length * 10)
        - Math.min(15, verifyStatusBoard.evidenceGapCount * 5)));
  const previewVerdict = normalizeText(shipReadiness.verdict).toLowerCase()
    || (pendingApprovals.length > 0 || verifyStatusBoard.failedVerificationCount > 0 ? 'blocked' : shipBlockerItems.length > 0 ? 'warn' : 'ready');
  const readyForCloseoutCount = items.filter((item) => ['verified', 'rereviewed', 'closed'].includes(item.status)).length;
  return {
    verdict: previewVerdict,
    score: previewScore,
    shipBlockerCount: shipBlockerItems.length + pendingApprovals.length,
    pendingApprovalCount: pendingApprovals.length,
    pendingVerificationCount: verifyStatusBoard.queuedForVerifyCount,
    acceptedRiskCount: Number(repoAudit.policySummary?.acceptedRisks?.length || 0),
    residualRiskCount: items.filter((item) => item.sourceKind === 'risk:residual').length,
    readyForCloseoutCount,
    topShipBlockers: shipBlockerItems.slice(0, 8).map((item) => compactItem(item)),
    releaseWave: {
      label: releaseWaveLabel,
      primaryCommand: releaseWaveCommand,
      commandQueue: releaseQueue,
    },
    nextActions: compactOrderedList(shipReadiness.nextActions || releaseQueue, 8),
  };
}

function renderMarkdown(payload) {
  const lines = [
    '# RELEASE CONTROL',
    '',
    `- Active surface: \`${payload.activeSurface}\``,
    `- Trust mode: \`${payload.trustMode}\``,
    `- Open findings: \`${payload.findingsStatusModel.summary.open}\``,
    `- Open blockers: \`${payload.verifyStatusBoard.openBlockerCount}\``,
    `- Queued for verify: \`${payload.verifyStatusBoard.queuedForVerifyCount}\``,
    `- Ship blockers: \`${payload.shipReadinessBoard.shipBlockerCount}\``,
    '',
    '## Findings Status Model',
    '',
    `- Shared registry available: \`${payload.findingsStatusModel.sharedRegistryAvailable ? 'yes' : 'no'}\``,
    `- Shared open findings: \`${payload.findingsStatusModel.sourceSummary.sharedRegistryOpen}\``,
    `- Trust-derived items: \`${payload.findingsStatusModel.sourceSummary.trustDerivedOpen}\``,
    `- Correction waves: \`${payload.findingsStatusModel.sourceSummary.correctionWaveCount}\``,
    '',
    ...(payload.findingsStatusModel.items.length > 0
      ? payload.findingsStatusModel.items.slice(0, 10).map((item) => `- [${item.status}] ${item.title} (${item.severity} · ${item.sourceKind})`)
      : ['- `No release-control findings are open.`']),
    '',
    '## Verify Status Board',
    '',
    `- Shell gate: \`${payload.verifyStatusBoard.shellGate}\``,
    `- Browser gate: \`${payload.verifyStatusBoard.browserGate}\``,
    `- Failed verification: \`${payload.verifyStatusBoard.failedVerificationCount}\``,
    `- Evidence gaps: \`${payload.verifyStatusBoard.evidenceGapCount}\``,
    `- Verify queue: \`${payload.verifyStatusBoard.verifyQueue.join(', ') || 'none'}\``,
    '',
    '## Ship Readiness Board',
    '',
    `- Verdict: \`${payload.shipReadinessBoard.verdict}\``,
    `- Score: \`${payload.shipReadinessBoard.score}\``,
    `- Pending approvals: \`${payload.shipReadinessBoard.pendingApprovalCount}\``,
    `- Release wave: \`${payload.shipReadinessBoard.releaseWave.label}\``,
    `- Release queue: \`${payload.shipReadinessBoard.releaseWave.commandQueue.join(', ') || 'none'}\``,
    '',
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function writeArtifacts(cwd, payload) {
  const dir = reportsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, 'release-control.json');
  const markdownPath = path.join(dir, 'release-control.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(payload));
  return {
    json: relativePath(cwd, jsonPath),
    markdown: relativePath(cwd, markdownPath),
  };
}

function readArtifactIfPresent(cwd, relativeFile) {
  if (!relativeFile) {
    return '';
  }
  const fullPath = path.join(cwd, relativeFile);
  return fs.existsSync(fullPath) ? relativePath(cwd, fullPath) : '';
}

function buildReleaseControlPlane(cwd, context = {}) {
  const findingsRegistry = context.sharedControlPlane?.findingsRegistry
    || readJsonIfExists(path.join(reportsDir(cwd), 'findings-registry.json'))
    || { summary: {}, items: [] };
  const correctionControl = context.sharedControlPlane
    || readJsonIfExists(path.join(reportsDir(cwd), 'correction-control.json'))
    || null;
  const sharedItems = normalizeSharedRegistryItems(findingsRegistry);
  const trustItems = buildTrustDerivedItems(context);
  const items = mergeStatusItems(sharedItems, trustItems);
  const verifyStatusBoard = buildVerifyStatusBoard({
    items,
    correctionControl,
    verificationSummary: context.verificationSummary,
  });
  const shipReadinessBoard = buildShipReadinessBoard({
    items,
    shipReadiness: context.shipReadiness,
    verifyStatusBoard,
    approvalPlan: context.approvalPlan,
    repoAudit: context.repoAudit,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    activeSurface: normalizeText(context.surface || 'verify-work') || 'verify-work',
    trustMode: normalizeText(context.trustMode || 'review-centric') || 'review-centric',
    findingsStatusModel: {
      sharedRegistryAvailable: sharedItems.length > 0 || Number(findingsRegistry?.summary?.open || 0) > 0,
      sourceSummary: {
        sharedRegistryOpen: Number(findingsRegistry?.summary?.open || sharedItems.length || 0),
        sharedRegistryClosed: Number(findingsRegistry?.summary?.closed || 0),
        trustDerivedOpen: trustItems.length,
        correctionWaveCount: Number(correctionControl?.correctionPlanner?.waveCount || 0),
      },
      summary: summarizeItems(items, findingsRegistry?.summary || {}),
      items: items.slice(0, 20).map((item) => compactItem(item)),
      sourceArtifacts: {
        findingsRegistry: correctionControl?.artifacts?.findingsRegistry
          || readArtifactIfPresent(cwd, '.workflow/reports/findings-registry.json')
          || '',
        correctionControl: correctionControl?.artifacts?.correctionControl
          || readArtifactIfPresent(cwd, '.workflow/reports/correction-control.json')
          || '',
        correctionControlMarkdown: correctionControl?.artifacts?.correctionControlMarkdown
          || readArtifactIfPresent(cwd, '.workflow/reports/correction-control.md')
          || '',
      },
    },
    verifyStatusBoard,
    shipReadinessBoard,
    artifacts: null,
  };
  payload.artifacts = writeArtifacts(cwd, payload);
  return payload;
}

module.exports = {
  buildReleaseControlPlane,
};
