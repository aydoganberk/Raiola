const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { summarizeOrchestration } = require('./runtime_collector');
const { readJson, relativePath, writePlaneArtifacts } = require('./control_planes_common');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { getLogSnapshot } = require('./team_runtime_log_index');

function orchestrationStatePath(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'state.json');
}

function buildRoleOwnership(tasks = []) {
  const byRole = new Map();
  for (const task of tasks) {
    const role = String(task.role || 'unassigned');
    if (!byRole.has(role)) {
      byRole.set(role, {
        role,
        ownerType: task.ownerType || 'child',
        writeScope: [],
        tasks: [],
        activeTaskId: null,
        waitingOn: [],
      });
    }
    const entry = byRole.get(role);
    entry.writeScope.push(...(task.writeScope || []));
    entry.tasks.push({
      id: task.id,
      wave: task.wave,
      status: task.status,
      task: task.task,
      mode: task.mode,
      summary: task.summary || '',
      next: task.next || '',
    });
    if (['ready', 'in_progress', 'blocked', 'failed'].includes(task.status) && !entry.activeTaskId) {
      entry.activeTaskId = task.id;
    }
    if (['blocked', 'failed', 'queued'].includes(task.status)) {
      entry.waitingOn.push(task.id);
    }
  }
  return [...byRole.values()].map((entry) => ({
    ...entry,
    writeScope: [...new Set(entry.writeScope.filter(Boolean))],
  }));
}

function buildLaneSummary(waves = [], tasks = []) {
  return (waves || []).map((wave) => {
    const waveTasks = tasks.filter((task) => task.wave === wave.wave);
    const counts = waveTasks.reduce((accumulator, task) => {
      accumulator[task.status] = (accumulator[task.status] || 0) + 1;
      return accumulator;
    }, {});
    return {
      wave: wave.wave,
      label: wave.label || `Wave ${wave.wave}`,
      roleCount: Array.isArray(wave.roles) ? wave.roles.length : 0,
      queued: counts.queued || 0,
      ready: counts.ready || 0,
      inProgress: counts.in_progress || 0,
      blocked: (counts.blocked || 0) + (counts.failed || 0),
      completed: counts.completed || 0,
      skipped: counts.skipped || 0,
    };
  });
}

function buildHandoffQueue(tasks = []) {
  return (tasks || [])
    .filter((task) => ['queued', 'blocked', 'failed', 'ready'].includes(task.status))
    .map((task) => ({
      id: task.id,
      role: task.role || 'unassigned',
      status: task.status,
      wave: task.wave,
      summary: task.summary || task.task || '',
      next: task.next || '',
      writeScope: task.writeScope || [],
    }))
    .slice(0, 12);
}

function buildOwnershipGaps(ownership = []) {
  const gaps = [];
  for (const entry of ownership) {
    const incompleteCount = entry.tasks.filter((task) => !['completed', 'skipped'].includes(task.status)).length;
    if (entry.role === 'unassigned') {
      gaps.push(`Unassigned tasks exist without explicit role ownership.`);
    }
    if (incompleteCount > 0 && !entry.activeTaskId) {
      gaps.push(`${entry.role} has pending work but no active task anchor.`);
    }
    if (entry.ownerType !== 'manager' && entry.writeScope.length === 0 && incompleteCount > 0) {
      gaps.push(`${entry.role} has pending work without an explicit write scope.`);
    }
  }
  return [...new Set(gaps)].slice(0, 10);
}

function buildActivity(mailboxSnapshot, timelineSnapshot) {
  const recentMailbox = [...(mailboxSnapshot.recent || [])].slice(-8).reverse();
  const recentTimeline = [...(timelineSnapshot.recent || [])].slice(-8).reverse();
  return {
    mailboxEntries: mailboxSnapshot.count,
    timelineEntries: timelineSnapshot.count,
    recentMailbox,
    recentTimeline,
    mailboxKinds: [...new Set(recentMailbox.map((entry) => entry.kind).filter(Boolean))].slice(0, 8),
    timelineEvents: [...new Set(recentTimeline.map((entry) => entry.event).filter(Boolean))].slice(0, 8),
  };
}

function renderTeamControlMarkdown(payload) {
  return `# TEAM CONTROL ROOM

- Verdict: \`${payload.verdict}\`
- Runtime status: \`${payload.runtime.status}\`
- Active wave: \`${payload.runtime.activeWave || 'none'}\`
- Roles: \`${payload.ownership.length}\`
- Merge queue next: \`${payload.mergeQueue.nextTaskId || 'none'}\`
- Conflict blockers: \`${payload.conflicts.blockerCount || 0}\`
- Mailbox entries: \`${payload.activity.mailboxEntries}\`
- Handoff queue: \`${payload.handoffQueue.length}\`

## Ownership

${payload.ownership.length > 0
    ? payload.ownership.map((entry) => `- \`${entry.role}\` active=${entry.activeTaskId || 'none'} write=${entry.writeScope.join(', ') || 'read-only'} waiting=${entry.waitingOn.length}`).join('\n')
    : '- `No orchestration ownership map is active.`'}

## Parallel Lanes

${payload.lanes.length > 0
    ? payload.lanes.map((lane) => `- ${lane.label}: ready=${lane.ready} in_progress=${lane.inProgress} blocked=${lane.blocked} completed=${lane.completed}`).join('\n')
    : '- `No wave plan is active.`'}

## Activity

${payload.activity.recentTimeline.length > 0
    ? payload.activity.recentTimeline.map((item) => `- [timeline] ${item.event || 'event'} :: ${item.taskId || item.generatedAt || 'n/a'}`).join('\n')
    : '- `No recent timeline activity.`'}

## Handoff Queue

${payload.handoffQueue.length > 0
    ? payload.handoffQueue.map((item) => `- [${item.status}] ${item.role} :: ${item.id} :: ${item.summary || 'pending task'}`).join('\n')
    : '- `No handoff queue item is pending.`'}

## Ownership Gaps

${payload.ownershipGaps.length > 0
    ? payload.ownershipGaps.map((item) => `- ${item}`).join('\n')
    : '- `No ownership gap is open.`'}

## Escalations

${payload.escalations.length > 0
    ? payload.escalations.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')
    : '- `No escalation is open.`'}
`;
}

function buildTeamControlPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const runtime = summarizeOrchestration(cwd);
  const state = readJson(orchestrationStatePath(cwd), {
    activeWave: null,
    waves: [],
    tasks: [],
    paused: false,
    intent: null,
    goal: null,
  });
  const mailboxSnapshot = getLogSnapshot(cwd, 'mailbox');
  const timelineSnapshot = getLogSnapshot(cwd, 'timeline');
  const ownership = buildRoleOwnership(state.tasks || []);
  const lanes = buildLaneSummary(state.waves || [], state.tasks || []);
  const activity = buildActivity(mailboxSnapshot, timelineSnapshot);
  const handoffQueue = buildHandoffQueue(state.tasks || []);
  const ownershipGaps = buildOwnershipGaps(ownership);
  const waitingRoles = ownership
    .filter((entry) => entry.waitingOn.length > 0)
    .map((entry) => ({ role: entry.role, waitingOn: entry.waitingOn.slice(0, 6) }));
  const escalations = [];
  const pushEscalation = (priority, title, command, reason) => {
    if (!title || escalations.some((item) => item.title === title && item.command === command)) {
      return;
    }
    escalations.push({ priority, title, command, reason });
  };

  const blockedTasks = (state.tasks || []).filter((task) => ['blocked', 'failed'].includes(task.status));
  for (const task of blockedTasks.slice(0, 6)) {
    pushEscalation('high', `Resolve blocked task ${task.id}`, 'rai team-runtime monitor --json', task.task || 'Blocked team task');
  }
  if ((runtime.conflicts?.blockerCount || 0) > 0) {
    pushEscalation('high', 'Resolve merge conflicts before merging the queue', 'rai team-runtime conflicts --json', 'Conflict blockers are present in the runtime state.');
  }
  if ((runtime.mergeQueue?.counts?.queued || 0) > 0) {
    pushEscalation('medium', 'Inspect or apply the next queued patch', 'rai patch-review --json', 'Merge queue already has queued patch output.');
  }
  if ((runtime.prFeedback?.openCount || 0) > 0) {
    pushEscalation('medium', 'Triage unresolved PR feedback', 'rai team-runtime pr-feedback list --json', 'PR feedback is open in the runtime state.');
  }
  if ((runtime.reviewLoop?.verdict || '') === 'fail' || (runtime.reviewLoop?.blockerCount || 0) > 0) {
    pushEscalation('medium', 'Re-run the review loop before more delegation', 'rai review-tasks --json', 'Review loop still sees blockers.');
  }
  if (state.paused) {
    pushEscalation('medium', 'Resume the paused team orchestration', 'rai team resume --json', 'The orchestration state is paused.');
  }
  if (ownershipGaps.length > 0) {
    pushEscalation('medium', 'Repair ownership gaps before widening delegation', 'rai team-control --json', ownershipGaps[0]);
  }
  if (handoffQueue.length > 0 && activity.mailboxEntries > 0) {
    pushEscalation('medium', 'Refresh the handoff queue against mailbox activity', 'rai handoff --json', 'Pending work and mailbox activity exist at the same time.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'team-control',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    verdict: escalations.some((item) => item.priority === 'high')
      ? 'attention-required'
      : runtime.active || handoffQueue.length > 0
        ? 'active'
        : 'idle',
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    runtime,
    orchestration: {
      intent: state.intent || null,
      goal: state.goal || null,
      paused: Boolean(state.paused),
      activeWave: state.activeWave,
      taskCount: (state.tasks || []).length,
      waveCount: (state.waves || []).length,
      stateFile: relativePath(cwd, orchestrationStatePath(cwd)),
    },
    ownership,
    lanes,
    handoffQueue,
    ownershipGaps,
    waitingRoles,
    activity,
    mergeQueue: runtime.mergeQueue || {
      nextTaskId: null,
      counts: {},
      queueLength: 0,
    },
    conflicts: runtime.conflicts || {
      blockerCount: 0,
      warnCount: 0,
    },
    quality: runtime.quality || {
      averageScore: 0,
      verdictCounts: {},
    },
    prFeedback: runtime.prFeedback || {
      openCount: 0,
      resolvedCount: 0,
      source: null,
    },
    escalations,
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'team-control-room', payload, renderTeamControlMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
team_control_room

Usage:
  node scripts/workflow/team_control_room.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
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
  const payload = buildTeamControlPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# TEAM CONTROL ROOM\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Runtime: \`${payload.runtime.status}\``);
  console.log(`- Active wave: \`${payload.runtime.activeWave || 'none'}\``);
  console.log(`- Roles: \`${payload.ownership.length}\``);
  console.log(`- Handoff queue: \`${payload.handoffQueue.length}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
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
  buildTeamControlPayload,
};
