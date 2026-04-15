const PLANE_CATALOG = Object.freeze([
  {
    id: 'repo-config',
    kind: 'plane',
    title: 'Repo Config',
    question: 'How should this repo behave by default?',
    entryCommand: 'rai repo-config --json',
    refreshCommand: 'rai repo-config --refresh --json',
    compresses: ['profile', 'map-frontend', 'monorepo', 'start', 'do'],
  },
  {
    id: 'repo-control',
    kind: 'plane',
    title: 'Repo Control Room',
    question: 'Which repo-wide surfaces, packages, and hotspots need operator focus next?',
    entryCommand: 'rai repo-control --json',
    refreshCommand: 'rai repo-control --refresh --json',
    compresses: ['audit-repo', 'workspaces', 'monorepo', 'map-codebase', 'repo-config', 'review-mode'],
  },
  {
    id: 'monorepo-control',
    kind: 'plane',
    title: 'Monorepo Control Room',
    question: 'How should a large monorepo sequence its impact waves, workspace ownership, and verification next?',
    entryCommand: 'rai monorepo-control --json',
    refreshCommand: 'rai monorepo-control --refresh --json',
    compresses: ['workspace-impact', 'monorepo', 'monorepo-mode', 'review-orchestrate', 'review-tasks', 'workspaces', 'team', 'audit-repo'],
  },
  {
    id: 'frontend-control',
    kind: 'plane',
    title: 'Frontend Control Room',
    question: 'Does the frontend have enough evidence, state coverage, and primitive discipline to move safely?',
    entryCommand: 'rai frontend-control --json',
    refreshCommand: 'rai frontend-control --refresh --json',
    compresses: ['map-frontend', 'ui-review', 'component-map', 'responsive-matrix', 'design-debt', 'state-atlas', 'verify-browser', 'preview', 'frontend-brief'],
  },
  {
    id: 'safety-control',
    kind: 'plane',
    title: 'Safety Control Room',
    question: 'Are security posture, failure forecasts, and self-healing repair paths tight enough to proceed?',
    entryCommand: 'rai safety-control --json',
    refreshCommand: 'rai safety-control --refresh --json',
    compresses: ['secure', 'doctor', 'health', 'repair', 'policy', 'incident', 'workspace-impact', 'trust'],
  },
  {
    id: 'trust',
    kind: 'plane',
    title: 'Trust Center',
    question: 'Is it safe to start, merge, and ship?',
    entryCommand: 'rai trust --json',
    refreshCommand: 'rai trust --json',
    compresses: ['doctor', 'health', 'policy', 'approvals', 'claims', 'evidence', 'evidence-check', 'secure', 'plan-check', 'validation-map', 'verify-work', 'ship-readiness'],
  },
  {
    id: 'release-control',
    kind: 'plane',
    title: 'Release / Change Control',
    question: 'What is the safest path from change preparation to ship and rollback?',
    entryCommand: 'rai release-control --json',
    refreshCommand: 'rai release-control --json',
    compresses: ['preview', 'patch-review', 'patch-apply', 'patch-rollback', 'ship', 'ship-readiness', 'verify', 'verify-shell', 'verify-browser', 'release-notes', 'pr-brief', 'session-report'],
  },
  {
    id: 'autopilot',
    kind: 'plane',
    title: 'Autopilot',
    question: 'Which routine or recovery lane should be triggered automatically next?',
    entryCommand: 'rai autopilot --json',
    refreshCommand: 'rai autopilot --json',
    compresses: ['automation', 'daemon', 'hooks', 'notify', 'sessions', 'window', 'checkpoint', 'pause-work', 'resume-work', 'switch-workstream', 'next'],
  },
  {
    id: 'handoff',
    kind: 'plane',
    title: 'Handoff OS',
    question: 'If work stops now, how does another operator continue safely?',
    entryCommand: 'rai handoff --json',
    refreshCommand: 'rai handoff --json',
    compresses: ['contextpack', 'packet', 'note', 'save-memory', 'session-report', 'checkpoint', 'next-prompt', 'release-notes', 'pr-brief'],
  },
  {
    id: 'team-control',
    kind: 'plane',
    title: 'Team Control Room',
    question: 'What is each agent or lane doing, waiting on, or escalating?',
    entryCommand: 'rai team-control --json',
    refreshCommand: 'rai team-control --json',
    compresses: ['team', 'team-runtime', 'fleet', 'manager', 'subagents', 'delegation-plan', 'team-status', 'team-stop', 'team-resume', 'patch-review', 'patch-apply'],
  },
  {
    id: 'measure',
    kind: 'plane',
    title: 'Measurement / ROI',
    question: 'What measurable value did the workflow produce?',
    entryCommand: 'rai measure --json',
    refreshCommand: 'rai measure --json',
    compresses: ['stats', 'benchmark', 'audit-repo', 'review', 'design-debt'],
  },
  {
    id: 'explain',
    kind: 'plane',
    title: 'Explainability',
    question: 'Why was this lane chosen and what is still unsurveyed?',
    entryCommand: 'rai explain --json',
    refreshCommand: 'rai explain --json',
    compresses: ['start', 'do', 'dashboard', 'benchmark', 'stats', 'profile'],
  },
  {
    id: 'lifecycle',
    kind: 'plane',
    title: 'Lifecycle Center',
    question: 'Is install or upgrade drift preventing safe operation?',
    entryCommand: 'rai lifecycle --json',
    refreshCommand: 'rai lifecycle --json',
    compresses: ['init', 'setup', 'doctor', 'repair', 'update', 'migrate', 'uninstall', 'health'],
  },
  {
    id: 'control-plane-publish',
    kind: 'bridge',
    title: 'External Publish Bridge',
    question: 'How do the control planes publish into GitHub, CI, Slack, and issue trackers?',
    entryCommand: 'node scripts/workflow/control_plane_publish.js --json',
    refreshCommand: 'node scripts/workflow/control_plane_publish.js --json',
    compresses: ['github-pr-comment', 'github-check-summary', 'github-step-summary', 'github-output', 'ci-gate', 'issue-tracker', 'slack', 'repo-status'],
  },
]);

function listPlaneCatalog(options = {}) {
  const kind = options.kind ? String(options.kind).trim().toLowerCase() : null;
  const includeBridges = options.includeBridges !== false;
  return PLANE_CATALOG
    .filter((plane) => (includeBridges || plane.kind !== 'bridge') && (!kind || plane.kind === kind))
    .map((plane) => ({ ...plane, compresses: [...plane.compresses] }));
}

function planeById(id) {
  const normalized = String(id || '').trim().toLowerCase();
  const plane = PLANE_CATALOG.find((entry) => entry.id === normalized);
  return plane ? { ...plane, compresses: [...plane.compresses] } : null;
}

function uniqueCommands(entries = []) {
  return [...new Set((entries || []).flatMap((entry) => entry.compresses || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function planeCompressionSummary(options = {}) {
  const corePlanes = listPlaneCatalog({ kind: 'plane' });
  const bridges = listPlaneCatalog({ kind: 'bridge' });
  const planes = options.includeBridges === false ? corePlanes : [...corePlanes, ...bridges];
  const commands = uniqueCommands(planes);
  const averageCommandsPerSurface = Number((commands.length / Math.max(1, planes.length)).toFixed(1));
  return {
    corePlaneCount: corePlanes.length,
    bridgeCount: bridges.length,
    totalSurfaceCount: planes.length,
    underlyingCommandCount: commands.length,
    averageCommandsPerSurface,
    reductionRatio: Number((commands.length / Math.max(1, corePlanes.length)).toFixed(1)),
    corePlaneIds: corePlanes.map((plane) => plane.id),
    bridgeIds: bridges.map((plane) => plane.id),
    underlyingCommands: commands,
    summary: `${commands.length} underlying commands compressed into ${corePlanes.length} core planes${options.includeBridges === false ? '' : ` (+${bridges.length} publish bridge)`}`,
  };
}

module.exports = {
  PLANE_CATALOG,
  listPlaneCatalog,
  planeById,
  planeCompressionSummary,
};
