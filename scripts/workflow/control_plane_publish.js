const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const { compactList, readJson, relativePath, writeExportFile } = require('./control_planes_common');

const STICKY_MARKER = '<!-- raiola:change-control -->';
const DEFAULT_CHANGE_CONTROL_JSON = '.workflow/reports/change-control.json';
const DEFAULT_CHANGE_CONTROL_MD = '.workflow/reports/change-control.md';
const EXPORT_KEY_BY_CONFIG = Object.freeze({
  'github-pr-comment': 'githubPrComment',
  'github-pr-comment-json': 'githubPrCommentJson',
  'github-check-summary': 'githubCheckSummary',
  'github-check-summary-json': 'githubCheckSummaryJson',
  'github-actions-step-summary': 'githubActionsStepSummary',
  'github-actions-output-json': 'githubActionsOutputJson',
  'ci-gate': 'ciGate',
  'repo-status-json': 'repoStatus',
  'status-badge-json': 'statusBadge',
  'issue-tracker-json': 'issueTracker',
  'slack-summary': 'slackSummary',
  'slack-summary-json': 'slackSummaryJson',
  'export-manifest-json': 'exportManifest',
  'control-plane-packet-json': 'controlPlanePacket',
});

function normalizeText(value) {
  return String(value || '').trim();
}

function truncate(text, max = 240) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return '';
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function jsonExport(cwd, fileName, payload) {
  return writeExportFile(cwd, fileName, JSON.stringify(payload, null, 2)).relative;
}

function plannedExportRelativePath(cwd, fileName) {
  return relativePath(cwd, path.join(cwd, '.workflow', 'exports', fileName));
}

function escapeGithubOutputValue(value) {
  return String(value == null ? '' : value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function appendLines(filePath, lines = []) {
  if (!filePath || !Array.isArray(lines) || lines.length === 0) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${lines.join('\n')}\n`);
  return true;
}

function truthyFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = normalizeText(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function badgeColorForVerdict(verdict) {
  const normalized = normalizeText(verdict).toLowerCase();
  if (['blocked', 'hold', 'repair-needed', 'attention-required'].includes(normalized)) {
    return 'red';
  }
  if (['needs-attention', 'watch', 'action-required'].includes(normalized)) {
    return 'yellow';
  }
  if (['ready', 'healthy', 'idle'].includes(normalized)) {
    return 'green';
  }
  return 'lightgrey';
}

function reportJson(cwd, name) {
  return readJson(path.join(cwd, '.workflow', 'reports', name), null);
}

function runtimeJson(cwd, name) {
  return readJson(path.join(cwd, '.workflow', 'runtime', name), null);
}

function buildPublishContext(cwd, payload, options = {}) {
  return {
    trustCenter: options.trustCenter || payload.trustCenter || reportJson(cwd, 'trust-center.json') || null,
    handoff: options.handoff || reportJson(cwd, 'handoff-os.json') || null,
    measurement: options.measurement || reportJson(cwd, 'measurement.json') || null,
    autopilot: options.autopilot || reportJson(cwd, 'autopilot.json') || null,
    teamControl: options.teamControl || reportJson(cwd, 'team-control-room.json') || null,
    lifecycle: options.lifecycle || reportJson(cwd, 'lifecycle-center.json') || null,
    explainability: options.explainability || options.explain || reportJson(cwd, 'explainability.json') || null,
    operatingCenter: options.operatingCenter || reportJson(cwd, 'operating-center.json') || null,
    repoConfig: options.repoConfig || runtimeJson(cwd, 'repo-config.json') || readJson(path.join(cwd, '.workflow', 'repo-config.json'), null) || null,
  };
}

function topReleaseItems(payload) {
  const seen = new Set();
  const items = [];
  const push = (item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const key = `${item.id || ''}::${item.title || ''}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(item);
  };
  for (const item of payload.releaseWave?.topItems || []) {
    push(item);
  }
  for (const item of payload.releaseBoard?.shipReadinessBoard?.topShipBlockers || []) {
    push(item);
  }
  for (const item of payload.releaseBoard?.verifyStatusBoard?.topStatusItems || []) {
    push(item);
  }
  return items.slice(0, 10);
}

function buildStatusBadge(payload) {
  return {
    schema: 1,
    label: 'change-control',
    message: normalizeText(payload.verdict || 'unknown') || 'unknown',
    color: badgeColorForVerdict(payload.verdict),
    generatedAt: payload.generatedAt,
    metadata: {
      riskLevel: payload.riskLevel,
      allowMerge: Boolean(payload.gates?.merge?.allowed),
      allowShip: Boolean(payload.gates?.ship?.allowed),
      verifyQueue: Number(payload.gates?.verify?.queue || 0),
      shipBlockers: Number(payload.gates?.ship?.blockers || 0),
      pendingApprovals: Number(payload.gates?.ship?.pendingApprovals || 0),
    },
  };
}

function buildIssueTrackerExport(payload) {
  const items = [];
  const push = (priority, title, command, reason, kind = 'task') => {
    if (!title || items.some((entry) => entry.title === title && entry.command === command)) {
      return;
    }
    items.push({
      title,
      priority,
      status: 'open',
      kind,
      command: command || null,
      reason: truncate(reason, 280) || null,
      milestone: payload.milestone,
      step: payload.step,
    });
  };
  for (const action of payload.nextActions || []) {
    push(action.priority || 'medium', action.title, action.command, action.reason || action.title, 'next-action');
  }
  for (const item of topReleaseItems(payload).slice(0, 6)) {
    push(item.severity || 'medium', item.title, item.commands?.[0] || payload.releaseWave?.primaryCommand || null, item.detail || `${item.sourceKind} :: ${item.status}`, 'release-blocker');
  }
  return {
    generatedAt: payload.generatedAt,
    controlPlane: 'release-control',
    verdict: payload.verdict,
    riskLevel: payload.riskLevel,
    openItemCount: items.length,
    items,
  };
}

function buildSlackSummary(payload) {
  const topAction = payload.nextActions?.[0];
  const blockers = Number(payload.gates?.ship?.blockers || 0);
  const pendingApprovals = Number(payload.gates?.ship?.pendingApprovals || 0);
  const verifyQueue = Number(payload.gates?.verify?.queue || 0);
  const text = [
    `Release Control · ${String(payload.verdict || 'unknown').toUpperCase()} · risk=${payload.riskLevel}`,
    `merge=${payload.gates?.merge?.allowed ? 'yes' : 'no'} ship=${payload.gates?.ship?.allowed ? 'yes' : 'no'} verifyQueue=${verifyQueue}`,
    `shipBlockers=${blockers} pendingApprovals=${pendingApprovals}`,
    topAction ? `next=${topAction.command || topAction.title}` : 'next=no-op',
  ].join('\n');
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Release Control · ${String(payload.verdict || 'unknown').toUpperCase()}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Risk*\n${payload.riskLevel}` },
        { type: 'mrkdwn', text: `*Verify queue*\n${verifyQueue}` },
        { type: 'mrkdwn', text: `*Ship blockers*\n${blockers}` },
        { type: 'mrkdwn', text: `*Pending approvals*\n${pendingApprovals}` },
      ],
    },
  ];
  if (topAction) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Next action*\n\`${topAction.command || topAction.title}\`` },
    });
  }
  return { text, blocks };
}

function buildGithubOutputMap(payload, externalExports, context = {}) {
  return {
    release_verdict: payload.verdict,
    release_risk_level: payload.riskLevel,
    release_allow_merge: payload.gates?.merge?.allowed ? 'true' : 'false',
    release_allow_ship: payload.gates?.ship?.allowed ? 'true' : 'false',
    release_verify_queue: String(payload.gates?.verify?.queue || 0),
    release_ship_blockers: String(payload.gates?.ship?.blockers || 0),
    release_pending_approvals: String(payload.gates?.ship?.pendingApprovals || 0),
    release_primary_command: payload.releaseWave?.primaryCommand || payload.nextActions?.[0]?.command || '',
    release_pr_comment_path: externalExports.githubPrComment,
    release_check_summary_path: externalExports.githubCheckSummary,
    release_step_summary_path: externalExports.githubActionsStepSummary,
    release_ci_gate_path: externalExports.ciGate,
    release_repo_status_path: externalExports.repoStatus,
    release_export_manifest_path: externalExports.exportManifest,
    release_change_control_path: payload.artifacts?.json || DEFAULT_CHANGE_CONTROL_JSON,
    control_plane_packet_path: externalExports.controlPlanePacket || '',
    continuity_bundle_path: context.handoff?.exports?.continuityBundle || '',
    trust_center_path: payload.trustCenter?.artifacts?.json || '',
    trust_start_decision: payload.trustCenter?.decisions?.start || '',
    trust_merge_decision: payload.trustCenter?.decisions?.merge || '',
    trust_ship_decision: payload.trustCenter?.decisions?.ship || '',
    handoff_path: context.handoff?.artifacts?.json || '',
    measurement_path: context.measurement?.artifacts?.controlPlane?.json || '',
    lifecycle_path: context.lifecycle?.artifacts?.json || '',
    team_control_path: context.teamControl?.artifacts?.json || '',
    autopilot_path: context.autopilot?.artifacts?.json || '',
    explainability_path: context.explainability?.artifacts?.json || '',
    explainability_tier: context.explainability?.confidenceBreakdown?.tier || '',
    explainability_confidence: context.explainability?.confidenceBreakdown?.overall == null ? '' : String(context.explainability.confidenceBreakdown.overall),
    repo_config_path: context.repoConfig?.path || context.repoConfig?.file?.relative || '',
    operating_center_path: context.operatingCenter?.artifacts?.json || '',
    team_control_verdict: context.teamControl?.verdict || '',
    autopilot_verdict: context.autopilot?.verdict || '',
    operating_center_verdict: context.operatingCenter?.verdict || '',
    operating_center_active_plane: context.operatingCenter?.activePlane?.id || '',
  };
}

function renderPrComment(payload, context = {}) {
  const blockers = topReleaseItems(payload).slice(0, 5)
    .map((item) => `- [${item.status}] ${item.title} (${item.severity} · ${item.sourceKind})`);
  const nextActions = (payload.nextActions || []).slice(0, 6)
    .map((item) => `- \`${item.command || item.title}\``);
  return `${STICKY_MARKER}
# Release / Change Control

- Verdict: \`${payload.verdict}\`
- Risk level: \`${payload.riskLevel}\`
- Safe to merge: \`${payload.gates?.merge?.allowed ? 'yes' : 'no'}\`
- Safe to ship: \`${payload.gates?.ship?.allowed ? 'yes' : 'no'}\`
- Verify queue: \`${payload.gates?.verify?.queue || 0}\`
- Ship blockers: \`${payload.gates?.ship?.blockers || 0}\`
- Pending approvals: \`${payload.gates?.ship?.pendingApprovals || 0}\`

## Release Wave

${blockers.length > 0 ? blockers.join('\n') : '- `No open release-wave blockers.`'}

## Next Actions

${nextActions.length > 0 ? nextActions.join('\n') : '- `No queued follow-up action.`'}

## Linked Surfaces

- Trust Center: \`${payload.trustCenter?.artifacts?.markdown || 'n/a'}\`
- Handoff OS: \`${context.handoff?.artifacts?.markdown || 'n/a'}\`
- Measurement: \`${context.measurement?.artifacts?.controlPlane?.markdown || 'n/a'}\`
- Lifecycle: \`${context.lifecycle?.artifacts?.markdown || 'n/a'}\`
- Explainability: \`${context.explainability?.artifacts?.markdown || 'n/a'}\`
- Continuity bundle: \`${context.handoff?.exports?.continuityBundle || 'n/a'}\`
- Operating Center: \`${context.operatingCenter?.artifacts?.markdown || 'n/a'}\`
`;
}

function renderCheckSummary(payload) {
  const statusLine = payload.verdict === 'ready'
    ? 'Change control gate is clear.'
    : payload.verdict === 'needs-attention'
      ? 'Change control gate needs operator attention.'
      : 'Change control gate is blocked.';
  return `# Change Control Gate

- Status: \`${payload.verdict}\`
- ${statusLine}
- Risk level: \`${payload.riskLevel}\`
- Verify queue: \`${payload.gates?.verify?.queue || 0}\`
- Ship blockers: \`${payload.gates?.ship?.blockers || 0}\`
- Pending approvals: \`${payload.gates?.ship?.pendingApprovals || 0}\`
- Browser evidence: \`${payload.evidence?.browserArtifacts || 0}\`
- Rollback ready: \`${payload.rollback?.ready ? 'yes' : 'no'}\`
- Primary command: \`${payload.releaseWave?.primaryCommand || payload.nextActions?.[0]?.command || 'none'}\`
`;
}

function buildStepSummaryMarkdown(payload, context = {}) {
  const measurement = context.measurement || {};
  const handoff = context.handoff || {};
  const autopilot = context.autopilot || {};
  const lifecycle = context.lifecycle || {};
  const teamControl = context.teamControl || {};
  const explainability = context.explainability || {};
  const operatingCenter = context.operatingCenter || {};
  const trustCenter = context.trustCenter || payload.trustCenter || {};
  const releaseItems = topReleaseItems(payload).slice(0, 5)
    .map((item) => `- [${item.status}] ${item.title} (${item.severity})`);
  const nextActions = (payload.nextActions || []).slice(0, 6)
    .map((item) => `- \`${item.command || item.title}\``);
  return `# Engineering Control Plane Summary

- Milestone: \`${payload.milestone}\`
- Step: \`${payload.step}\`
- Release verdict: \`${payload.verdict}\`
- Risk level: \`${payload.riskLevel}\`
- Safe to merge: \`${payload.gates?.merge?.allowed ? 'yes' : 'no'}\`
- Safe to ship: \`${payload.gates?.ship?.allowed ? 'yes' : 'no'}\`
- Trust verdict: \`${trustCenter.verdict || 'n/a'}\`
- Handoff verdict: \`${handoff.verdict || 'n/a'}\`
- Explainability: tier=\`${explainability.confidenceBreakdown?.tier || 'n/a'}\` overall=\`${explainability.confidenceBreakdown?.overall ?? 'n/a'}\`
- Lifecycle verdict: \`${lifecycle.verdict || 'n/a'}\`
- Operating Center: \`${operatingCenter.verdict || 'n/a'}\` / active=\`${operatingCenter.activePlane?.id || 'n/a'}\`

## Change Control

- Verify queue: \`${payload.gates?.verify?.queue || 0}\`
- Failed verification: \`${payload.gates?.verify?.failed || 0}\`
- Ship blockers: \`${payload.gates?.ship?.blockers || 0}\`
- Pending approvals: \`${payload.gates?.ship?.pendingApprovals || 0}\`
- Rollback ready: \`${payload.rollback?.ready ? 'yes' : 'no'}\`

## Top Release Items

${releaseItems.length > 0 ? releaseItems.join('\n') : '- `No open release item.`'}

## Next Actions

${nextActions.length > 0 ? nextActions.join('\n') : '- `No queued next action.`'}

## Supporting Planes

- Measurement: findings=\`${measurement.metrics?.findings?.total ?? 'n/a'}\`, verify-pass=\`${measurement.metrics?.verification?.passRate ?? 'n/a'}\`%, exports=\`${measurement.metrics?.exports?.produced ?? 'n/a'}\`
- Autopilot: verdict=\`${autopilot.verdict || 'n/a'}\`, routines=\`${autopilot.routines?.length || 0}\`, event=\`${autopilot.eventContext?.eventName || 'local'}\`
- Team Control: verdict=\`${teamControl.verdict || 'n/a'}\`, mailbox=\`${teamControl.activity?.mailboxEntries ?? teamControl.runtime?.mailboxEntries ?? 'n/a'}\`, handoff queue=\`${teamControl.handoffQueue?.length || 0}\`
- Handoff: open decisions=\`${handoff.openDecisions?.length || 0}\`, unresolved risks=\`${handoff.unresolvedRisks?.length || 0}\`, continuity=\`${handoff.exports?.continuityBundle || 'n/a'}\`
- Explainability: lane=\`${explainability.route?.lane || 'n/a'}\`, bundle=\`${explainability.start?.bundle?.id || 'n/a'}\`, unsurveyed=\`${explainability.unsurveyedSurfaces?.length || 0}\`
- Operating Center: primary=\`${operatingCenter.primaryCommand || 'n/a'}\`, compression=\`${operatingCenter.compression?.summary || 'n/a'}\`
`;
}

function evaluateExpectedExports(expected = [], externalExports = {}) {
  const requested = Array.isArray(expected) ? expected : [];
  const missing = requested.filter((name) => !externalExports[EXPORT_KEY_BY_CONFIG[name]]);
  const produced = requested.filter((name) => externalExports[EXPORT_KEY_BY_CONFIG[name]]);
  return {
    expected: requested.length,
    produced: produced.length,
    missing,
    coverageRatio: requested.length > 0 ? Number(((produced.length / requested.length) * 100).toFixed(1)) : 100,
  };
}

function buildPublishPlan(payload, externalExports, context = {}, issueTracker = null) {
  const coverage = evaluateExpectedExports(payload.repoConfig?.externalExports || [], externalExports);
  return {
    github: {
      ready: Boolean(externalExports.githubPrComment && externalExports.githubCheckSummary && externalExports.githubActionsStepSummary),
      stickyCommentMarker: STICKY_MARKER,
      prComment: externalExports.githubPrComment,
      checkSummary: externalExports.githubCheckSummary,
      stepSummary: externalExports.githubActionsStepSummary,
    },
    ci: {
      ready: Boolean(externalExports.ciGate && externalExports.githubActionsOutputJson),
      gate: externalExports.ciGate,
      outputs: externalExports.githubActionsOutputJson,
    },
    slack: {
      ready: Boolean(externalExports.slackSummary && externalExports.slackSummaryJson),
      text: externalExports.slackSummary,
      structured: externalExports.slackSummaryJson,
    },
    issueTracker: {
      ready: Boolean(externalExports.issueTracker),
      queue: externalExports.issueTracker,
      openItemCount: issueTracker?.openItemCount || 0,
    },
    statusBadge: {
      ready: Boolean(externalExports.statusBadge),
      file: externalExports.statusBadge,
    },
    repoStatus: {
      ready: Boolean(externalExports.repoStatus),
      file: externalExports.repoStatus,
    },
    controlPlanePacket: {
      ready: Boolean(externalExports.controlPlanePacket),
      file: externalExports.controlPlanePacket,
    },
    exportCoverage: {
      ...coverage,
      producedKeys: Object.keys(externalExports || {}).length,
    },
    linkedPlanes: {
      trustCenter: Boolean(context.trustCenter),
      handoff: Boolean(context.handoff),
      measurement: Boolean(context.measurement),
      lifecycle: Boolean(context.lifecycle),
      teamControl: Boolean(context.teamControl),
      autopilot: Boolean(context.autopilot),
      explainability: Boolean(context.explainability),
      operatingCenter: Boolean(context.operatingCenter),
    },
  };
}

function buildControlPlanePacket(payload, context = {}, externalExports = {}, githubOutputs = {}, issueTracker = null, badge = null) {
  const trustCenter = context.trustCenter || payload.trustCenter || {};
  const handoff = context.handoff || {};
  const measurement = context.measurement || {};
  const autopilot = context.autopilot || {};
  const teamControl = context.teamControl || {};
  const lifecycle = context.lifecycle || {};
  const explainability = context.explainability || {};
  const operatingCenter = context.operatingCenter || {};
  const repoConfig = context.repoConfig || {};
  const releaseItems = topReleaseItems(payload).slice(0, 6).map((item) => ({
    title: item.title,
    status: item.status,
    severity: item.severity,
    sourceKind: item.sourceKind,
    command: item.commands?.[0] || payload.releaseWave?.primaryCommand || null,
  }));

  return {
    generatedAt: payload.generatedAt,
    controlPlane: 'release-control',
    milestone: payload.milestone,
    step: payload.step,
    repoConfig: {
      defaultProfile: repoConfig.activeConfig?.defaultProfile || payload.repoConfig?.defaultProfile || null,
      trustLevel: repoConfig.activeConfig?.trustLevel || payload.repoConfig?.trustLevel || null,
      handoffStandard: repoConfig.activeConfig?.handoffStandard || payload.repoConfig?.handoffStandard || null,
      requiredVerifications: repoConfig.activeConfig?.requiredVerifications || payload.repoConfig?.requiredVerifications || [],
      externalExports: repoConfig.activeConfig?.externalExports || payload.repoConfig?.externalExports || [],
      path: repoConfig.path || repoConfig.file?.relative || null,
    },
    trust: {
      verdict: trustCenter.verdict || payload.trustCenter?.verdict || null,
      riskLevel: trustCenter.risk?.level || payload.riskLevel || null,
      decisions: trustCenter.decisions || payload.trustCenter?.decisions || {},
      governance: trustCenter.governance || null,
      priorityActions: (trustCenter.priorityActions || []).slice(0, 6),
      artifact: trustCenter.artifacts?.json || payload.trustCenter?.artifacts?.json || null,
    },
    release: {
      verdict: payload.verdict,
      riskLevel: payload.riskLevel,
      mergeAllowed: Boolean(payload.gates?.merge?.allowed),
      shipAllowed: Boolean(payload.gates?.ship?.allowed),
      verifyQueue: Number(payload.gates?.verify?.queue || 0),
      failedVerification: Number(payload.gates?.verify?.failed || 0),
      shipBlockers: Number(payload.gates?.ship?.blockers || 0),
      pendingApprovals: Number(payload.gates?.ship?.pendingApprovals || 0),
      rollbackReady: Boolean(payload.rollback?.ready),
      primaryCommand: payload.releaseWave?.primaryCommand || payload.nextActions?.[0]?.command || null,
      topItems: releaseItems,
      artifact: payload.artifacts?.json || DEFAULT_CHANGE_CONTROL_JSON,
    },
    continuity: {
      verdict: handoff.verdict || null,
      resumeAnchor: handoff.resumeAnchor || handoff.nextAction?.command || null,
      nextAction: handoff.nextAction || null,
      openDecisions: handoff.openDecisions?.length || 0,
      unresolvedRisks: handoff.unresolvedRisks?.length || 0,
      bundle: handoff.exports?.continuityBundle || null,
      artifact: handoff.artifacts?.json || null,
    },
    explainability: {
      tier: explainability.confidenceBreakdown?.tier || null,
      overall: explainability.confidenceBreakdown?.overall ?? null,
      lane: explainability.route?.lane || null,
      bundle: explainability.start?.bundle?.id || null,
      unsurveyedSurfaces: explainability.unsurveyedSurfaces?.length || 0,
      nextCommand: explainability.nextSteps?.[0]?.command || null,
      artifact: explainability.artifacts?.json || null,
    },
    measurement: {
      openFindings: measurement.metrics?.findings?.open ?? null,
      verifyPassRate: measurement.metrics?.verification?.passRate ?? null,
      mergeReadinessRatio: measurement.metrics?.mergeReadiness?.ratio ?? null,
      exportCoverage: measurement.metrics?.exports?.coverageRatio ?? null,
      automatedCorrections: measurement.metrics?.corrections?.automated ?? null,
      artifact: measurement.artifacts?.controlPlane?.json || null,
    },
    automation: {
      verdict: autopilot.verdict || null,
      topRoutine: autopilot.routines?.[0] || null,
      recoverySignals: autopilot.recoverySignals || [],
      artifact: autopilot.artifacts?.json || null,
    },
    teamOps: {
      verdict: teamControl.verdict || null,
      handoffQueue: teamControl.handoffQueue?.length || 0,
      mailboxEntries: teamControl.activity?.mailboxEntries ?? teamControl.runtime?.mailboxEntries ?? null,
      blockerCount: teamControl.conflicts?.blockerCount ?? 0,
      escalationCount: teamControl.escalations?.length || 0,
      artifact: teamControl.artifacts?.json || null,
    },
    lifecycle: {
      verdict: lifecycle.verdict || null,
      configDrift: lifecycle.drift?.config?.present ?? null,
      exportDrift: lifecycle.drift?.exports?.present ?? null,
      selfHealingActions: lifecycle.selfHealing?.safeActions ?? null,
      artifact: lifecycle.artifacts?.json || null,
    },
    operatingCenter: {
      verdict: operatingCenter.verdict || null,
      activePlane: operatingCenter.activePlane?.id || null,
      primaryCommand: operatingCenter.primaryCommand || null,
      artifact: operatingCenter.artifacts?.json || null,
    },
    publish: {
      exports: externalExports,
      githubOutputs,
      issueTrackerOpenItems: issueTracker?.openItemCount || 0,
      statusBadge: badge,
    },
    linkedArtifacts: {
      prBrief: payload.closeout?.paths?.prBrief || null,
      releaseNotes: payload.closeout?.paths?.releaseNotes || null,
      sessionReport: payload.closeout?.paths?.sessionReport || null,
      shipPackage: payload.closeout?.paths?.shipPackage || null,
      continuityBundle: handoff.exports?.continuityBundle || null,
      repoStatus: externalExports.repoStatus || null,
      exportManifest: externalExports.exportManifest || null,
      controlPlanePacket: externalExports.controlPlanePacket || null,
    },
  };
}

function writeControlPlaneExports(cwd, payload, options = {}) {
  const context = options.context || buildPublishContext(cwd, payload, options);
  const badge = buildStatusBadge(payload);
  const issueTracker = buildIssueTrackerExport(payload);
  const slack = buildSlackSummary(payload);
  const prComment = renderPrComment(payload, context);
  const checkSummary = renderCheckSummary(payload);
  const stepSummary = buildStepSummaryMarkdown(payload, context);

  const externalExports = {
    githubPrComment: writeExportFile(cwd, 'github-pr-comment.md', prComment).relative,
    githubPrCommentJson: jsonExport(cwd, 'github-pr-comment.json', {
      generatedAt: payload.generatedAt,
      marker: STICKY_MARKER,
      mode: 'sticky',
      title: 'Release / Change Control',
      body: prComment,
    }),
    githubCheckSummary: writeExportFile(cwd, 'github-check-summary.md', checkSummary).relative,
    githubCheckSummaryJson: jsonExport(cwd, 'github-check-summary.json', {
      generatedAt: payload.generatedAt,
      title: 'Change Control Gate',
      body: checkSummary,
    }),
    githubActionsStepSummary: writeExportFile(cwd, 'github-actions-step-summary.md', stepSummary).relative,
    repoStatus: plannedExportRelativePath(cwd, 'repo-status.json'),
    statusBadge: jsonExport(cwd, 'status-badge.json', badge),
    issueTracker: jsonExport(cwd, 'issue-tracker.json', issueTracker),
    slackSummary: writeExportFile(cwd, 'slack-summary.txt', slack.text).relative,
    slackSummaryJson: jsonExport(cwd, 'slack-summary.json', slack),
    exportManifest: plannedExportRelativePath(cwd, 'export-manifest.json'),
    controlPlanePacket: plannedExportRelativePath(cwd, 'control-plane-packet.json'),
    githubActionsOutputJson: plannedExportRelativePath(cwd, 'github-actions-output.json'),
  };

  externalExports.ciGate = jsonExport(cwd, 'ci-gate.json', {
    generatedAt: payload.generatedAt,
    verdict: payload.verdict,
    riskLevel: payload.riskLevel,
    allowMerge: Boolean(payload.gates?.merge?.allowed),
    allowShip: Boolean(payload.gates?.ship?.allowed),
    verifyQueue: Number(payload.gates?.verify?.queue || 0),
    failedVerification: Number(payload.gates?.verify?.failed || 0),
    shipBlockers: Number(payload.gates?.ship?.blockers || 0),
    pendingApprovals: Number(payload.gates?.ship?.pendingApprovals || 0),
    rollbackReady: Boolean(payload.rollback?.ready),
    nextCommands: (payload.nextActions || []).map((item) => item.command).filter(Boolean),
    changeControl: payload.artifacts?.json || DEFAULT_CHANGE_CONTROL_JSON,
    trustCenter: payload.trustCenter?.artifacts?.json || '',
    trust: {
      start: payload.trustCenter?.decisions?.start || '',
      merge: payload.trustCenter?.decisions?.merge || '',
      ship: payload.trustCenter?.decisions?.ship || '',
    },
    explainability: {
      tier: context.explainability?.confidenceBreakdown?.tier || null,
      overall: context.explainability?.confidenceBreakdown?.overall ?? null,
      artifact: context.explainability?.artifacts?.json || null,
    },
    continuity: {
      bundle: context.handoff?.exports?.continuityBundle || null,
      resumeAnchor: context.handoff?.resumeAnchor || context.handoff?.nextAction?.command || null,
    },
    controlPlanePacket: externalExports.controlPlanePacket,
  });

  const githubOutputs = buildGithubOutputMap(payload, externalExports, context);
  externalExports.githubActionsOutputJson = jsonExport(cwd, 'github-actions-output.json', githubOutputs);

  const publishPlan = buildPublishPlan(payload, externalExports, context, issueTracker);
  const controlPlanePacket = buildControlPlanePacket(payload, context, externalExports, githubOutputs, issueTracker, badge);
  controlPlanePacket.publish.plan = publishPlan;
  externalExports.controlPlanePacket = jsonExport(cwd, 'control-plane-packet.json', controlPlanePacket);

  const repoStatus = {
    generatedAt: payload.generatedAt,
    controlPlane: 'release-control',
    milestone: payload.milestone,
    step: payload.step,
    verdict: payload.verdict,
    riskLevel: payload.riskLevel,
    trustVerdict: context.trustCenter?.verdict || payload.trustCenter?.verdict || null,
    trustDecisions: controlPlanePacket.trust.decisions,
    handoffVerdict: context.handoff?.verdict || null,
    lifecycleVerdict: context.lifecycle?.verdict || null,
    operatingCenterVerdict: context.operatingCenter?.verdict || null,
    operatingCenterActivePlane: context.operatingCenter?.activePlane?.id || null,
    explainability: {
      tier: controlPlanePacket.explainability.tier,
      overall: controlPlanePacket.explainability.overall,
      lane: controlPlanePacket.explainability.lane,
      bundle: controlPlanePacket.explainability.bundle,
      unsurveyedSurfaces: controlPlanePacket.explainability.unsurveyedSurfaces,
    },
    continuity: {
      resumeAnchor: controlPlanePacket.continuity.resumeAnchor,
      bundle: controlPlanePacket.continuity.bundle,
      openLoops: Number(controlPlanePacket.continuity.openDecisions || 0) + Number(controlPlanePacket.continuity.unresolvedRisks || 0),
      nextCommand: controlPlanePacket.continuity.nextAction?.command || null,
    },
    measurement: {
      openFindings: controlPlanePacket.measurement.openFindings,
      verifyPassRate: controlPlanePacket.measurement.verifyPassRate,
      exportCoverage: controlPlanePacket.measurement.exportCoverage,
      automatedCorrections: controlPlanePacket.measurement.automatedCorrections,
    },
    automation: {
      verdict: controlPlanePacket.automation.verdict,
      topRoutine: controlPlanePacket.automation.topRoutine?.command || controlPlanePacket.automation.topRoutine?.title || null,
      recoverySignals: controlPlanePacket.automation.recoverySignals,
    },
    teamOps: {
      verdict: controlPlanePacket.teamOps.verdict,
      handoffQueue: controlPlanePacket.teamOps.handoffQueue,
      blockerCount: controlPlanePacket.teamOps.blockerCount,
      mailboxEntries: controlPlanePacket.teamOps.mailboxEntries,
    },
    releaseGate: {
      allowMerge: Boolean(payload.gates?.merge?.allowed),
      allowShip: Boolean(payload.gates?.ship?.allowed),
      verifyQueue: Number(payload.gates?.verify?.queue || 0),
      shipBlockers: Number(payload.gates?.ship?.blockers || 0),
      pendingApprovals: Number(payload.gates?.ship?.pendingApprovals || 0),
    },
    artifacts: {
      changeControl: payload.artifacts?.json || DEFAULT_CHANGE_CONTROL_JSON,
      changeControlMarkdown: payload.artifacts?.markdown || DEFAULT_CHANGE_CONTROL_MD,
      trustCenter: payload.trustCenter?.artifacts || null,
      handoff: context.handoff?.artifacts || null,
      measurement: context.measurement?.artifacts?.controlPlane || null,
      lifecycle: context.lifecycle?.artifacts || null,
      teamControl: context.teamControl?.artifacts || null,
      autopilot: context.autopilot?.artifacts || null,
      explainability: context.explainability?.artifacts || null,
      operatingCenter: context.operatingCenter?.artifacts || null,
    },
    exports: {},
  };
  externalExports.repoStatus = jsonExport(cwd, 'repo-status.json', repoStatus);

  const exportManifest = {
    generatedAt: payload.generatedAt,
    controlPlane: 'release-control',
    verdict: payload.verdict,
    riskLevel: payload.riskLevel,
    expectedExports: payload.repoConfig?.externalExports || [],
    exports: externalExports,
    publishPlan,
    badge,
    issueTracker: {
      openItemCount: issueTracker.openItemCount,
      file: externalExports.issueTracker,
    },
    githubOutputs,
    context: {
      trustVerdict: context.trustCenter?.verdict || payload.trustCenter?.verdict || null,
      trustShipDecision: payload.trustCenter?.decisions?.ship || null,
      handoffVerdict: context.handoff?.verdict || null,
      continuityBundle: context.handoff?.exports?.continuityBundle || null,
      measurementVerifyPassRate: context.measurement?.metrics?.verification?.passRate ?? null,
      measurementExportCoverage: context.measurement?.metrics?.exports?.coverageRatio ?? null,
      lifecycleVerdict: context.lifecycle?.verdict || null,
      teamVerdict: context.teamControl?.verdict || null,
      teamHandoffQueue: context.teamControl?.handoffQueue?.length || 0,
      autopilotVerdict: context.autopilot?.verdict || null,
      explainabilityTier: context.explainability?.confidenceBreakdown?.tier || null,
      explainabilityOverall: context.explainability?.confidenceBreakdown?.overall ?? null,
      operatingCenterVerdict: context.operatingCenter?.verdict || null,
      operatingCenterActivePlane: context.operatingCenter?.activePlane?.id || null,
      repoConfigPath: context.repoConfig?.path || context.repoConfig?.file?.relative || null,
      controlPlanePacket: externalExports.controlPlanePacket,
    },
  };
  externalExports.exportManifest = jsonExport(cwd, 'export-manifest.json', exportManifest);

  repoStatus.exports = externalExports;
  writeExportFile(cwd, 'repo-status.json', JSON.stringify(repoStatus, null, 2));

  return {
    externalExports,
    publishPlan,
    badge,
    issueTracker,
    githubOutputs,
    controlPlanePacket,
    context,
  };
}

function applyGitHubEnvironmentFiles(cwd, payload, options = {}) {
  const stepSummaryFile = options.stepSummaryFile || process.env.GITHUB_STEP_SUMMARY || null;
  const outputFile = options.outputFile || process.env.GITHUB_OUTPUT || null;
  const envFile = options.envFile || process.env.GITHUB_ENV || null;
  const context = options.context || buildPublishContext(cwd, payload, options);
  const exportResult = options.exportResult || writeControlPlaneExports(cwd, payload, { context });
  const outputs = exportResult.githubOutputs || buildGithubOutputMap(payload, exportResult.externalExports, context);
  const stepSummaryPath = path.join(cwd, exportResult.externalExports.githubActionsStepSummary);
  const summaryContent = fs.existsSync(stepSummaryPath)
    ? fs.readFileSync(stepSummaryPath, 'utf8').trimEnd()
    : buildStepSummaryMarkdown(payload, context);

  const stepSummaryApplied = stepSummaryFile
    ? appendLines(stepSummaryFile, [summaryContent])
    : false;
  const outputApplied = outputFile
    ? appendLines(outputFile, Object.entries(outputs).map(([key, value]) => `${key}=${escapeGithubOutputValue(value)}`))
    : false;
  const envMap = {
    RAIOLA_RELEASE_VERDICT: payload.verdict,
    RAIOLA_RELEASE_RISK_LEVEL: payload.riskLevel,
    RAIOLA_RELEASE_ALLOW_MERGE: payload.gates?.merge?.allowed ? 'true' : 'false',
    RAIOLA_RELEASE_ALLOW_SHIP: payload.gates?.ship?.allowed ? 'true' : 'false',
    RAIOLA_RELEASE_PR_COMMENT_PATH: exportResult.externalExports.githubPrComment,
    RAIOLA_RELEASE_CHECK_SUMMARY_PATH: exportResult.externalExports.githubCheckSummary,
    RAIOLA_RELEASE_STEP_SUMMARY_PATH: exportResult.externalExports.githubActionsStepSummary,
    RAIOLA_RELEASE_CI_GATE_PATH: exportResult.externalExports.ciGate,
    RAIOLA_RELEASE_REPO_STATUS_PATH: exportResult.externalExports.repoStatus,
    RAIOLA_RELEASE_EXPORT_MANIFEST_PATH: exportResult.externalExports.exportManifest,
    RAIOLA_CONTROL_PLANE_PACKET_PATH: exportResult.externalExports.controlPlanePacket,
    RAIOLA_CONTINUITY_BUNDLE_PATH: exportResult.context.handoff?.exports?.continuityBundle || '',
    RAIOLA_CHANGE_CONTROL_PATH: payload.artifacts?.json || DEFAULT_CHANGE_CONTROL_JSON,
  };
  const envApplied = envFile
    ? appendLines(envFile, Object.entries(envMap).map(([key, value]) => `${key}=${escapeGithubOutputValue(value)}`))
    : false;

  return {
    stepSummaryApplied,
    outputApplied,
    envApplied,
    stepSummaryFile: stepSummaryFile ? relativePath(cwd, stepSummaryFile) : null,
    outputFile: outputFile ? relativePath(cwd, outputFile) : null,
    envFile: envFile ? relativePath(cwd, envFile) : null,
    outputs,
    env: envMap,
    externalExports: exportResult.externalExports,
  };
}

function printHelp() {
  console.log(`
control_plane_publish

Usage:
  node scripts/workflow/control_plane_publish.js [--apply-github-env] [--json]

Options:
  --apply-github-env   Append the generated step summary / outputs to GitHub env files when present
  --json               Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const changeControl = readJson(path.join(cwd, DEFAULT_CHANGE_CONTROL_JSON), null);
  if (!changeControl) {
    throw new Error('Missing .workflow/reports/change-control.json. Run `rai release-control --json` first.');
  }
  const exportResult = writeControlPlaneExports(cwd, changeControl);
  const applied = truthyFlag(args['apply-github-env']) || truthyFlag(args.apply)
    ? applyGitHubEnvironmentFiles(cwd, changeControl, { exportResult, context: exportResult.context })
    : null;
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'control-plane-publish',
    verdict: changeControl.verdict,
    riskLevel: changeControl.riskLevel,
    externalExports: exportResult.externalExports,
    publishPlan: exportResult.publishPlan,
    githubOutputs: exportResult.githubOutputs,
    context: {
      trustVerdict: exportResult.context.trustCenter?.verdict || changeControl.trustCenter?.verdict || null,
      handoffVerdict: exportResult.context.handoff?.verdict || null,
      measurementVerifyPassRate: exportResult.context.measurement?.metrics?.verification?.passRate ?? null,
      lifecycleVerdict: exportResult.context.lifecycle?.verdict || null,
      teamVerdict: exportResult.context.teamControl?.verdict || null,
      operatingCenterVerdict: exportResult.context.operatingCenter?.verdict || null,
      operatingCenterActivePlane: exportResult.context.operatingCenter?.activePlane?.id || null,
    },
    applied,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# CONTROL PLANE PUBLISH\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Risk level: \`${payload.riskLevel}\``);
  console.log(`- Exports: \`${Object.keys(payload.externalExports).length}\``);
  console.log(`- GitHub ready: \`${payload.publishPlan.github.ready ? 'yes' : 'no'}\``);
  console.log(`- CI ready: \`${payload.publishPlan.ci.ready ? 'yes' : 'no'}\``);
  if (payload.applied) {
    console.log(`- Step summary applied: \`${payload.applied.stepSummaryApplied ? 'yes' : 'no'}\``);
    console.log(`- Output file applied: \`${payload.applied.outputApplied ? 'yes' : 'no'}\``);
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
  DEFAULT_CHANGE_CONTROL_JSON,
  EXPORT_KEY_BY_CONFIG,
  STICKY_MARKER,
  applyGitHubEnvironmentFiles,
  badgeColorForVerdict,
  buildGithubOutputMap,
  buildIssueTrackerExport,
  buildPublishContext,
  buildPublishPlan,
  buildControlPlanePacket,
  buildStatusBadge,
  buildStepSummaryMarkdown,
  evaluateExpectedExports,
  writeControlPlaneExports,
};
