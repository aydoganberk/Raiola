const fs = require('node:fs');
const path = require('node:path');
const { baseLifecycleContext } = require('./lifecycle_common');
const { checkClaims } = require('./claims');
const { checkPolicy, domainForFile, readApprovals } = require('./policy');
const { writeJsonFile, relativePath, readTableDocument } = require('./roadmap_os');

function reportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function ensureReportsDir(cwd) {
  fs.mkdirSync(reportsDir(cwd), { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function latestReviewData(cwd) {
  const baseDir = reportsDir(cwd);
  const findings = readJson(path.join(baseDir, 'review-findings.json'), []);
  const heatmap = readJson(path.join(baseDir, 'risk-heatmap.json'), []);
  const replay = readJson(path.join(baseDir, 'review-replay.json'), {
    resolved: [],
    persistent: [],
    introduced: [],
  });
  return {
    findings,
    heatmap,
    replay,
    blockers: findings.filter((finding) => ['must_fix', 'should_fix'].includes(finding.severity)),
  };
}

function manualChecksFromArgs(args) {
  return parseList(args.checks).map((text, index) => ({
    id: `manual-${index + 1}`,
    label: text,
    status: String(args.status || 'pending').trim(),
    source: 'cli',
  }));
}

function normalizeResidualRiskItems(items) {
  return (items || []).filter((item) => !/No residual risks recorded/i.test(item));
}

function summarizeEvidenceCoverage(graph) {
  const kinds = graph.nodes.reduce((counts, node) => {
    counts[node.kind] = (counts[node.kind] || 0) + 1;
    return counts;
  }, {});
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    supportedClaims: graph.coverage.supportedClaims,
    claimCount: graph.coverage.claimCount,
    questionCount: kinds.question || 0,
    assumptionCount: kinds.assumption || 0,
    reviewFindingCount: kinds.review_finding || 0,
    approvalCount: kinds.approval || 0,
    verifyRunCount: graph.coverage.verifyRunCount,
  };
}

function buildEvidenceGraphSnapshot(cwd) {
  return require('./evidence').buildEvidenceGraph(cwd);
}

function summarizeVerificationSnapshot(cwd) {
  return require('./runtime_collector').summarizeVerifications(cwd);
}

function buildFixPlan({ verificationSummary, review, claims, context, manualChecks }) {
  const plan = [];
  if (verificationSummary.shell.latest?.verdict === 'fail') {
    plan.push({
      lane: 'shell',
      priority: 'high',
      action: `Re-run the failing shell verification: ${verificationSummary.shell.latest.target}`,
      evidence: verificationSummary.shell.latest.artifactDir,
    });
  }
  if (verificationSummary.browser.latest?.verdict === 'fail') {
    plan.push({
      lane: 'browser',
      priority: 'high',
      action: `Re-run browser verification for ${verificationSummary.browser.latest.target}`,
      evidence: verificationSummary.browser.latest.artifactDir,
    });
  }
  for (const finding of review.blockers.slice(0, 4)) {
    plan.push({
      lane: 'review',
      priority: finding.severity === 'must_fix' ? 'high' : 'medium',
      action: `${finding.title} in ${finding.file}`,
      evidence: finding.category,
    });
  }
  for (const row of claims.rows.filter((item) => item.status !== 'supported').slice(0, 4)) {
    plan.push({
      lane: 'claims',
      priority: row.status === 'missing_evidence' ? 'high' : 'medium',
      action: `Attach or refresh evidence for claim: ${row.claim}`,
      evidence: row.evidence || 'missing',
    });
  }
  for (const requirement of (context.openRequirements || []).slice(0, 3)) {
    if (/No open requirement rows recorded/i.test(requirement)) {
      continue;
    }
    plan.push({
      lane: 'requirements',
      priority: 'medium',
      action: `Close or explicitly defer open requirement: ${requirement}`,
      evidence: 'docs/workflow/EXECPLAN.md',
    });
  }
  for (const check of manualChecks.filter((item) => item.status === 'fail').slice(0, 3)) {
    plan.push({
      lane: 'manual-check',
      priority: 'high',
      action: `Investigate failed manual check: ${check.label}`,
      evidence: 'manual verification input',
    });
  }
  return plan;
}

function renderVerifyWorkMarkdown(payload) {
  return `# VERIFY WORK

- Verdict: \`${payload.verdict}\`
- Confidence: \`${payload.confidence}\`
- Review blockers: \`${payload.review.blockerCount}\`
- Shell verdict: \`${payload.verification.shell.latest?.verdict || 'none'}\`
- Browser verdict: \`${payload.verification.browser.latest?.verdict || 'none'}\`
- Evidence coverage: \`${payload.evidence.supportedClaims}/${payload.evidence.claimCount}\` supported claims

## Manual Checks

${payload.manualChecks.length > 0
    ? payload.manualChecks.map((check) => `- [${check.status}] ${check.label}`).join('\n')
    : '- `No manual checks were recorded.`'}

## Reasons

${payload.reasons.length > 0
    ? payload.reasons.map((reason) => `- \`${reason}\``).join('\n')
    : '- `No verification gaps were detected.`'}

## Fix Plan

${payload.fixPlan.length > 0
    ? payload.fixPlan.map((item) => `- [${item.priority}] ${item.action} (${item.lane})`).join('\n')
    : '- `No fix plan is needed.`'}
`;
}

function renderShipReadinessMarkdown(payload) {
  return `# SHIP READINESS

- Verdict: \`${payload.verdict}\`
- Score: \`${payload.score}\`
- Review outcome: \`${payload.review.outcome}\`
- Verify work: \`${payload.verifyWork.verdict}\`
- Pending approvals: \`${payload.approvalPlan.pending.length}\`

## Reasons

${payload.reasons.length > 0
    ? payload.reasons.map((reason) => `- \`${reason}\``).join('\n')
    : '- `No ship-readiness concerns were raised.`'}

## Pending Approvals

${payload.approvalPlan.pending.length > 0
    ? payload.approvalPlan.pending.map((item) => `- \`${item.target}\` ${item.reason}`).join('\n')
    : '- `No approval gaps were detected.`'}

## Evidence Summary

- Claims: \`${payload.evidence.claimCount}\`
- Supported claims: \`${payload.evidence.supportedClaims}\`
- Review findings: \`${payload.evidence.reviewFindingCount}\`
- Approvals: \`${payload.evidence.approvalCount}\`

## Next Safe Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((item) => `- \`${item}\``).join('\n')
    : '- `Ship path is clear.`'}
`;
}

function approvalReasonForGroup(group) {
  const categories = [...new Set(group.findings.map((finding) => finding.category))];
  const files = group.files.slice(0, 4).join(', ');
  if (categories.includes('data/migration')) {
    return `Migration-sensitive edits in ${files} need a deliberate rollout/rollback acknowledgement.`;
  }
  if (categories.includes('security')) {
    return `Security-sensitive edits in ${files} need an explicit approval note before ship.`;
  }
  if (group.domain === 'config' || group.domain === 'infra') {
    return `Config or infra edits in ${files} cross the default workflow policy threshold.`;
  }
  return `Policy currently wants a human acknowledgement for ${group.domain} edits in ${files}.`;
}

function buildApprovalPlan(cwd, options = {}) {
  const review = latestReviewData(cwd);
  const changedFiles = (options.changedFiles || []).length > 0
    ? options.changedFiles
    : [...new Set([
      ...review.findings.map((finding) => finding.file),
      ...review.heatmap.map((item) => item.file),
    ])];
  const policyResult = changedFiles.length > 0
    ? checkPolicy(cwd, {
      files: changedFiles.join(';'),
      operation: options.operation || 'edit',
      actor: options.actor || 'solo',
      mode: options.mode || 'standard',
    })
    : { results: [], verdict: 'pass', mode: options.mode || 'standard' };
  const approvals = readApprovals(cwd).grants;
  const groups = new Map();

  for (const result of policyResult.results) {
    const findings = review.findings.filter((finding) => finding.file === result.file);
    const needsApproval = result.decision === 'human_needed'
      || findings.some((finding) => ['security', 'data/migration'].includes(finding.category));
    if (!needsApproval) {
      continue;
    }
    const target = findings.some((finding) => finding.category === 'data/migration')
      ? 'migrations'
      : findings.some((finding) => finding.category === 'security')
        ? 'secrets'
        : result.domain || domainForFile(result.file);
    if (!groups.has(target)) {
      groups.set(target, {
        target,
        domain: result.domain || target,
        decision: result.decision,
        files: [],
        findings: [],
      });
    }
    const group = groups.get(target);
    group.files.push(result.file);
    group.findings.push(...findings);
  }

  const pending = [...groups.values()].map((group) => {
    const alreadyGranted = approvals.some((grant) => grant.target === group.target || grant.target === group.domain || grant.target === '*');
    return {
      target: group.target,
      decision: group.decision,
      files: [...new Set(group.files)],
      categories: [...new Set(group.findings.map((finding) => finding.category))],
      alreadyGranted,
      reason: approvalReasonForGroup(group),
      suggestedCommand: `cwf approvals grant --target ${group.target} --reason "${approvalReasonForGroup(group).replace(/"/g, "'")}"`,
    };
  }).filter((item) => !item.alreadyGranted);

  return {
    generatedAt: new Date().toISOString(),
    mode: policyResult.mode || options.mode || 'standard',
    verdict: pending.length > 0 ? 'warn' : 'pass',
    pending,
    checkedFiles: changedFiles,
    policy: policyResult,
  };
}

function buildVerifyWorkPayload(cwd, rootDir, args = {}) {
  const context = baseLifecycleContext(cwd, rootDir);
  const verificationSummary = summarizeVerificationSnapshot(cwd);
  const review = latestReviewData(cwd);
  const claims = checkClaims(cwd);
  const graph = buildEvidenceGraphSnapshot(cwd);
  const evidenceCoverage = summarizeEvidenceCoverage(graph);
  const manualChecks = manualChecksFromArgs(args);
  const residualRisks = normalizeResidualRiskItems(context.residualRisks);
  const reasons = [];

  if (verificationSummary.shell.latest?.verdict === 'fail') {
    reasons.push('Latest shell verification failed.');
  } else if (!verificationSummary.shell.latest) {
    reasons.push('No shell verification artifact is present.');
  }
  if (verificationSummary.browser.latest?.verdict === 'fail') {
    reasons.push('Latest browser verification failed.');
  }
  if (review.blockers.length > 0) {
    reasons.push(`${review.blockers.length} review blocker(s) remain open.`);
  }
  const unsupportedClaims = claims.rows.filter((row) => row.status !== 'supported');
  if (unsupportedClaims.length > 0) {
    reasons.push(`${unsupportedClaims.length} claim(s) still need evidence.`);
  }
  if (context.validationRows.length === 0) {
    reasons.push('Validation contract is empty or missing.');
  }
  if (residualRisks.length > 0) {
    reasons.push(`${residualRisks.length} residual risk item(s) remain open.`);
  }
  if (manualChecks.some((item) => item.status === 'fail')) {
    reasons.push('Manual verification reported at least one failed check.');
  }

  const forcedStatus = String(args.status || 'auto').trim();
  let verdict = 'pass';
  if (
    forcedStatus === 'fail'
    || review.blockers.length > 0
    || verificationSummary.shell.latest?.verdict === 'fail'
    || verificationSummary.browser.latest?.verdict === 'fail'
    || manualChecks.some((item) => item.status === 'fail')
  ) {
    verdict = 'fail';
  } else if (
    forcedStatus === 'warn'
    || unsupportedClaims.length > 0
    || context.validationRows.length === 0
    || residualRisks.length > 0
    || !verificationSummary.shell.latest
  ) {
    verdict = 'warn';
  }

  const confidence = verdict === 'pass'
    ? 0.92
    : verdict === 'warn'
      ? 0.74
      : 0.58;
  const fixPlan = buildFixPlan({
    verificationSummary,
    review,
    claims,
    context,
    manualChecks,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'verify-work',
    verdict,
    confidence,
    workflowRoot: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    review: {
      blockerCount: review.blockers.length,
      findingCount: review.findings.length,
      blockers: review.blockers,
    },
    verification: verificationSummary,
    evidence: evidenceCoverage,
    claims,
    manualChecks,
    reasons,
    fixPlan,
    residualRisks,
    outputPath: null,
    outputPathRelative: null,
  };

  ensureReportsDir(cwd);
  const jsonPath = path.join(reportsDir(cwd), 'verify-work.json');
  const markdownPath = path.join(reportsDir(cwd), 'verify-work.md');
  writeJsonFile(jsonPath, payload);
  fs.writeFileSync(markdownPath, `${renderVerifyWorkMarkdown(payload).trimEnd()}\n`);
  payload.outputPath = markdownPath;
  payload.outputPathRelative = relativePath(cwd, markdownPath);
  payload.artifacts = {
    json: relativePath(cwd, jsonPath),
    markdown: payload.outputPathRelative,
  };

  return payload;
}

function latestVerifyWork(cwd) {
  return readJson(path.join(reportsDir(cwd), 'verify-work.json'), null);
}

function buildShipReadinessPayload(cwd, rootDir, args = {}) {
  const context = baseLifecycleContext(cwd, rootDir);
  const verifyWork = latestVerifyWork(cwd) || buildVerifyWorkPayload(cwd, rootDir, args);
  const review = latestReviewData(cwd);
  const approvalPlan = buildApprovalPlan(cwd, args);
  const evidence = summarizeEvidenceCoverage(buildEvidenceGraphSnapshot(cwd));
  const residualRisks = normalizeResidualRiskItems(context.residualRisks);
  const reasons = [];
  let score = 100;

  if (review.blockers.length > 0) {
    reasons.push(`${review.blockers.length} review blocker(s) still block ship.`);
    score -= Math.min(45, review.blockers.length * 18);
  }
  if (verifyWork.verdict === 'fail') {
    reasons.push('Verify-work is failing.');
    score -= 30;
  } else if (verifyWork.verdict === 'warn') {
    reasons.push('Verify-work still has unresolved follow-up items.');
    score -= 12;
  }
  if (approvalPlan.pending.length > 0) {
    reasons.push(`${approvalPlan.pending.length} approval grant(s) are still pending.`);
    score -= Math.min(25, approvalPlan.pending.length * 10);
  }
  if (evidence.claimCount > 0 && evidence.supportedClaims < evidence.claimCount) {
    reasons.push('Evidence coverage is incomplete for one or more claims.');
    score -= 10;
  }
  if (residualRisks.length > 0) {
    reasons.push(`${residualRisks.length} residual risk item(s) remain open.`);
    score -= Math.min(12, residualRisks.length * 4);
  }

  score = Math.max(0, Math.min(100, score));
  let verdict = 'pass';
  if (review.blockers.length > 0 || verifyWork.verdict === 'fail' || approvalPlan.pending.length > 0) {
    verdict = 'blocked';
  } else if (score < 85) {
    verdict = 'warn';
  }

  const nextActions = [
    ...approvalPlan.pending.map((item) => item.suggestedCommand),
    ...verifyWork.fixPlan.slice(0, 4).map((item) => item.action),
  ].slice(0, 8);

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'ship-readiness',
    verdict,
    score,
    workflowRoot: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    review: {
      blockerCount: review.blockers.length,
      findingCount: review.findings.length,
      outcome: review.blockers.length > 0 ? 'blocked' : review.findings.length > 0 ? 'needs_follow_up' : 'ready',
    },
    verifyWork: {
      verdict: verifyWork.verdict,
      confidence: verifyWork.confidence,
      artifact: verifyWork.artifacts?.json || 'none',
    },
    approvalPlan,
    evidence,
    reasons,
    nextActions,
    outputPath: null,
    outputPathRelative: null,
  };

  ensureReportsDir(cwd);
  const jsonPath = path.join(reportsDir(cwd), 'ship-readiness.json');
  const markdownPath = path.join(reportsDir(cwd), 'ship-readiness.md');
  writeJsonFile(jsonPath, payload);
  fs.writeFileSync(markdownPath, `${renderShipReadinessMarkdown(payload).trimEnd()}\n`);
  payload.outputPath = markdownPath;
  payload.outputPathRelative = relativePath(cwd, markdownPath);
  payload.artifacts = {
    json: relativePath(cwd, jsonPath),
    markdown: payload.outputPathRelative,
  };

  return payload;
}

function readAssumptions(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'ASSUMPTIONS.md');
  const table = readTableDocument(filePath, 'Active Assumptions', {
    title: 'ASSUMPTIONS',
    headers: ['Id', 'Assumption', 'Impact', 'Status', 'Exit Trigger'],
  });
  return table.rows.map((row) => ({
    id: row[0],
    assumption: row[1],
    impact: row[2],
    status: row[3],
    exitTrigger: row[4],
  })).filter((row) => row.assumption);
}

module.exports = {
  buildApprovalPlan,
  buildShipReadinessPayload,
  buildVerifyWorkPayload,
  latestReviewData,
  latestVerifyWork,
  parseList,
  readAssumptions,
  reportsDir,
};
