const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { baseLifecycleContext } = require('./lifecycle_common');
const { buildShipReadinessPayload, buildVerifyWorkPayload, buildApprovalPlan, readAssumptions } = require('./trust_os');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { compactList, riskLevelFromCounts, readinessVerdict, writePlaneArtifacts } = require('./control_planes_common');

function trustQuestion(decision) {
  if (decision === 'ready') {
    return 'yes';
  }
  if (decision === 'needs-attention') {
    return 'mostly, but not without clearing the highlighted gaps';
  }
  return 'no';
}

function renderTrustCenterMarkdown(payload) {
  return `# TRUST CENTER

- Verdict: \`${payload.verdict}\`
- Risk level: \`${payload.risk.level}\`
- Safe to start: \`${payload.decisions.start}\`
- Safe to merge: \`${payload.decisions.merge}\`
- Safe to ship: \`${payload.decisions.ship}\`
- Repo trust level: \`${payload.repoConfig.trustLevel}\`

## Core Answer

Bu işi başlatmak / merge etmek / ship etmek güvenli mi?

- Start: \`${payload.decisions.start}\` → ${trustQuestion(payload.decisions.start)}
- Merge: \`${payload.decisions.merge}\` → ${trustQuestion(payload.decisions.merge)}
- Ship: \`${payload.decisions.ship}\` → ${trustQuestion(payload.decisions.ship)}

## Governance Summary

- Policy issues: \`${payload.governance.policyIssueCount}\`
- Missing evidence: \`${payload.governance.missingEvidenceCount}\`
- Pending approvals: \`${payload.governance.pendingApprovalCount}\`
- Plan readiness gaps: \`${payload.governance.planReadinessGapCount}\`
- Verification gaps: \`${payload.governance.verificationGapCount}\`
- Residual risks: \`${payload.governance.residualRiskCount}\`

## Priority Actions

${payload.priorityActions.length > 0
    ? payload.priorityActions.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')
    : '- `No trust actions are queued.`'}

## Missing Evidence

${payload.evidence.gaps.length > 0
    ? payload.evidence.gaps.map((item) => `- ${item}`).join('\n')
    : '- `No claim-evidence gap is open.`'}

## Pending Approvals

${payload.approvals.pending.length > 0
    ? payload.approvals.pending.map((item) => `- \`${item.target}\` ${item.reason}`).join('\n')
    : '- `No approval gap is open.`'}

## Verification Snapshot

- Verify-work: \`${payload.verification.verifyWorkVerdict}\`
- Ship-readiness: \`${payload.verification.shipReadinessVerdict}\`
- Shell verify: \`${payload.verification.shellVerdict}\`
- Browser verify: \`${payload.verification.browserVerdict}\`
- Queued for verify: \`${payload.verification.queuedForVerify}\`
- Ship blockers: \`${payload.verification.shipBlockers}\`
`;
}

function buildTrustCenterPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const verifyWork = buildVerifyWorkPayload(cwd, rootDir, options);
  const shipReadiness = buildShipReadinessPayload(cwd, rootDir, options);
  const context = baseLifecycleContext(cwd, rootDir);
  const approvalPlan = shipReadiness.approvalPlan || buildApprovalPlan(cwd, options);
  const claimRows = verifyWork.claims?.rows || [];
  const unsupportedClaims = claimRows.filter((row) => row.status !== 'supported');
  const missingEvidenceClaims = unsupportedClaims
    .filter((row) => row.status === 'missing_evidence' || !String(row.evidence || '').trim())
    .map((row) => row.claim);
  const policyIssues = compactList([
    ...((verifyWork.repoAudit?.policySummary?.knownDebt || []).map((item) => item.title || item)),
    ...((verifyWork.repoAudit?.policySummary?.acceptedRisks || []).map((item) => item.title || item)),
    ...((verifyWork.repoAudit?.policySummary?.suppressions || []).map((item) => item.title || item)),
    ...((approvalPlan.policy?.results || [])
      .filter((item) => ['warn', 'human_needed'].includes(String(item.decision || '').toLowerCase()))
      .map((item) => `${item.file}: ${item.decision}`)),
  ], 12);
  const assumptions = readAssumptions(cwd);
  const verificationGaps = compactList([
    verifyWork.verdict !== 'pass' ? `verify-work:${verifyWork.verdict}` : '',
    shipReadiness.verdict !== 'pass' ? `ship-readiness:${shipReadiness.verdict}` : '',
    verifyWork.verification?.shell?.latest?.verdict === 'fail' ? 'shell-verification:fail' : '',
    !verifyWork.verification?.shell?.latest && verifyWork.trustMode !== 'audit-only' ? 'shell-verification:missing' : '',
    verifyWork.verification?.browser?.latest?.verdict === 'fail' ? 'browser-verification:fail' : '',
    (verifyWork.releaseControl?.verifyStatusBoard?.queuedForVerifyCount || 0) > 0 ? 'verify-queue:not-empty' : '',
  ], 10);
  const planReadinessGaps = compactList([
    ...(context.openRequirements || []).filter((item) => !/No open requirement rows recorded/i.test(item)),
    assumptions.some((item) => !/closed|validated/i.test(String(item.status || ''))) ? 'active-assumptions:unresolved' : '',
  ], 10);
  const residualRisks = compactList(verifyWork.residualRisks || [], 10);
  const riskLevel = riskLevelFromCounts({
    fail: verifyWork.verdict === 'fail' ? 1 : 0,
    blockers: (shipReadiness.releaseControl?.shipReadinessBoard?.shipBlockerCount || 0) + (verifyWork.review?.blockerCount || 0),
    warn: verifyWork.verdict === 'warn' || shipReadiness.verdict === 'warn' ? 1 : 0,
    pendingApprovals: approvalPlan.pending.length,
    verificationGaps: verificationGaps.length,
    unsupportedClaims: missingEvidenceClaims.length,
    trustLevel: repoConfigPayload.activeConfig.trustLevel,
  });
  const decisions = {
    start: readinessVerdict({
      riskLevel,
      fail: verifyWork.verdict === 'fail' ? 1 : 0,
      blockers: planReadinessGaps.length > 0 ? 1 : 0,
      verificationGaps: verificationGaps.length,
    }),
    merge: readinessVerdict({
      riskLevel,
      fail: verifyWork.verdict === 'fail' ? 1 : 0,
      blockers: (verifyWork.review?.blockerCount || 0) + (verifyWork.releaseControl?.verifyStatusBoard?.failedVerificationCount || 0),
      pendingApprovals: approvalPlan.pending.length,
      verificationGaps: verificationGaps.length,
    }),
    ship: readinessVerdict({
      riskLevel,
      fail: shipReadiness.verdict === 'blocked' ? 1 : 0,
      blockers: shipReadiness.releaseControl?.shipReadinessBoard?.shipBlockerCount || 0,
      pendingApprovals: approvalPlan.pending.length,
      verificationGaps: verificationGaps.length,
    }),
  };

  const priorityActions = [];
  const pushAction = (priority, title, command, reason) => {
    if (!title || priorityActions.some((item) => item.title === title && item.command === command)) {
      return;
    }
    priorityActions.push({ priority, title, command, reason });
  };
  for (const item of (verifyWork.fixPlan || []).slice(0, 6)) {
    const command = item.lane === 'shell'
      ? 'rai verify-shell --cmd "npm test" --json'
      : item.lane === 'browser'
        ? 'rai verify-browser --url http://localhost:3000 --json'
        : item.lane === 'review'
          ? 'rai review-tasks --json'
          : item.lane === 'repo-audit'
            ? 'rai audit-repo --mode oneshot --json'
            : item.lane === 'claims'
              ? 'rai evidence --json'
              : 'rai verify-work --json';
    pushAction(item.priority, item.action, command, item.evidence || item.lane);
  }
  for (const approval of approvalPlan.pending.slice(0, 4)) {
    pushAction('high', `Resolve approval for ${approval.target}`, approval.suggestedCommand, approval.reason);
  }
  if (policyIssues.length > 0) {
    pushAction('medium', 'Inspect policy and governance gaps', 'rai policy --json', 'Policy or debt signals are active.');
  }
  if (planReadinessGaps.length > 0) {
    pushAction('medium', 'Close open plan readiness gaps', 'rai packet explain --step plan', 'Open requirements or unresolved assumptions remain.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'trust-center',
    workflowRoot: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    verdict: decisions.ship === 'ready' ? 'ready' : decisions.ship === 'needs-attention' ? 'needs-attention' : 'hold',
    risk: {
      level: riskLevel,
      scorecard: {
        verifyWork: verifyWork.verdict,
        shipReadiness: shipReadiness.verdict,
        reviewBlockers: verifyWork.review?.blockerCount || 0,
        shipBlockers: shipReadiness.releaseControl?.shipReadinessBoard?.shipBlockerCount || 0,
        pendingApprovals: approvalPlan.pending.length,
        verificationGaps: verificationGaps.length,
        missingEvidence: missingEvidenceClaims.length,
      },
    },
    decisions,
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    governance: {
      policyIssueCount: policyIssues.length,
      missingEvidenceCount: missingEvidenceClaims.length,
      pendingApprovalCount: approvalPlan.pending.length,
      planReadinessGapCount: planReadinessGaps.length,
      verificationGapCount: verificationGaps.length,
      residualRiskCount: residualRisks.length,
    },
    policy: {
      issues: policyIssues,
      repoHealth: verifyWork.repoAudit?.repoHealth || null,
      knownDebt: verifyWork.repoAudit?.policySummary?.knownDebt || [],
      acceptedRisks: verifyWork.repoAudit?.policySummary?.acceptedRisks || [],
    },
    approvals: approvalPlan,
    evidence: {
      claimCount: verifyWork.evidence?.claimCount || 0,
      supportedClaims: verifyWork.evidence?.supportedClaims || 0,
      gaps: compactList(missingEvidenceClaims, 12),
      unsupportedClaims: unsupportedClaims.slice(0, 12).map((row) => ({
        claim: row.claim,
        status: row.status,
        evidence: row.evidence || '',
      })),
    },
    verification: {
      verifyWorkVerdict: verifyWork.verdict,
      shipReadinessVerdict: shipReadiness.verdict,
      shellVerdict: verifyWork.verification?.shell?.latest?.verdict || 'missing',
      browserVerdict: verifyWork.verification?.browser?.latest?.verdict || 'missing',
      queuedForVerify: verifyWork.releaseControl?.verifyStatusBoard?.queuedForVerifyCount || 0,
      failedVerification: verifyWork.releaseControl?.verifyStatusBoard?.failedVerificationCount || 0,
      shipBlockers: shipReadiness.releaseControl?.shipReadinessBoard?.shipBlockerCount || 0,
      pendingVerification: shipReadiness.releaseControl?.shipReadinessBoard?.pendingVerificationCount || 0,
      topStatusItems: verifyWork.releaseControl?.verifyStatusBoard?.topStatusItems || [],
      topShipBlockers: shipReadiness.releaseControl?.shipReadinessBoard?.topShipBlockers || [],
    },
    planReadiness: {
      openRequirements: (context.openRequirements || []).filter((item) => !/No open requirement rows recorded/i.test(item)),
      unresolvedAssumptions: assumptions.filter((item) => !/closed|validated/i.test(String(item.status || ''))),
      handoffNext: context.handoffNext,
    },
    residualRisks,
    priorityActions,
    sources: {
      verifyWork: verifyWork.artifacts,
      shipReadiness: shipReadiness.artifacts,
      releaseControl: shipReadiness.releaseControl?.artifacts || verifyWork.releaseControl?.artifacts || null,
    },
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'trust-center', payload, renderTrustCenterMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
trust_center

Usage:
  node scripts/workflow/trust_center.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --mode <value>      auto|review|audit-only
  --json              Print machine-readable output
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
  const payload = buildTrustCenterPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# TRUST CENTER\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Risk level: \`${payload.risk.level}\``);
  console.log(`- Start: \`${payload.decisions.start}\``);
  console.log(`- Merge: \`${payload.decisions.merge}\``);
  console.log(`- Ship: \`${payload.decisions.ship}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
  console.log(`- Pending approvals: \`${payload.approvals.pending.length}\``);
  console.log(`- Missing evidence: \`${payload.evidence.gaps.length}\``);
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
  buildTrustCenterPayload,
};
