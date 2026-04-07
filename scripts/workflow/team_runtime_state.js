const fs = require('node:fs');
const path = require('node:path');
const delegation = require('./delegation_plan');
const { relativePath } = require('./roadmap_os');
const { appendIndexedEvent, getLogSnapshot } = require('./team_runtime_log_index');
const { detectCodexBinary } = require('./team_adapters/codex_exec_driver');
const {
  runtimeDir,
  mergeQueuePath,
  conflictsPath,
  qualityPath,
  supervisorPath,
  prFeedbackPath,
  reviewLoopPath,
} = require('./team_runtime_artifacts');

const TASK_OBJECT_KEYS = ['workspaces', 'patchBundles', 'collectedResults'];
const TASK_LIST_KEYS = ['dispatchedTasks', 'collectedTasks'];

function runtimeStatePath(cwd) {
  return path.join(runtimeDir(cwd), 'state.json');
}

function mailboxPath(cwd) {
  return path.join(runtimeDir(cwd), 'mailbox.jsonl');
}

function timelinePath(cwd) {
  return path.join(runtimeDir(cwd), 'timeline.jsonl');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeRuntimeState(cwd, payload) {
  ensureDir(runtimeDir(cwd));
  fs.writeFileSync(runtimeStatePath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
}

function readRuntimeState(cwd) {
  if (!fs.existsSync(runtimeStatePath(cwd))) {
    return null;
  }
  return JSON.parse(fs.readFileSync(runtimeStatePath(cwd), 'utf8'));
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildTaskMetadata(orchestrationState) {
  const tasks = Array.isArray(orchestrationState?.tasks) ? orchestrationState.tasks : [];
  const taskScopes = {};
  const taskModes = {};
  const taskRoles = {};
  const taskWaves = {};

  for (const task of tasks) {
    taskScopes[task.id] = task.writeScope || [];
    taskModes[task.id] = task.mode || 'owner';
    taskRoles[task.id] = task.role || 'worker';
    taskWaves[task.id] = task.wave || null;
  }

  return {
    tasks,
    taskScopes,
    taskModes,
    taskRoles,
    taskWaves,
  };
}

function summarizeSupervisor(supervisor) {
  if (!supervisor) {
    return {
      status: 'idle',
      cycleCount: 0,
      watch: false,
      background: false,
      lastCycleAt: null,
    };
  }
  return {
    status: supervisor.status || 'idle',
    pid: supervisor.pid || null,
    cycleCount: supervisor.cycleCount || 0,
    watch: Boolean(supervisor.watch),
    background: Boolean(supervisor.background),
    lastCycleAt: supervisor.lastCycleAt || null,
    stopRequested: Boolean(supervisor.stopRequested),
  };
}

function summarizeConflicts(conflicts) {
  return {
    blockerCount: conflicts?.blockerCount || 0,
    warnCount: conflicts?.warnCount || 0,
  };
}

function summarizeQuality(quality) {
  return {
    averageScore: quality?.averageScore || 0,
    verdictCounts: quality?.verdictCounts || {},
  };
}

function summarizeMergeQueue(mergeQueue) {
  return {
    nextTaskId: mergeQueue?.nextTaskId || null,
    counts: mergeQueue?.counts || {},
    queueLength: Array.isArray(mergeQueue?.queue) ? mergeQueue.queue.length : 0,
  };
}

function summarizePrFeedback(feedback) {
  return {
    source: feedback?.source || null,
    openCount: feedback?.openCount || 0,
    resolvedCount: feedback?.resolvedCount || 0,
  };
}

function summarizeReviewLoop(reviewLoop) {
  return {
    verdict: reviewLoop?.verdict || 'noop',
    findingsCount: reviewLoop?.findingsCount || 0,
    blockerCount: reviewLoop?.blockerCount || 0,
  };
}

function buildRunnerConfig(args = {}) {
  const type = String(args.driver || 'packet').trim();
  const config = {
    type,
    command: String(args['codex-bin'] || process.env.WORKFLOW_TEAM_CODEX_BIN || 'codex').trim(),
    model: args.model ? String(args.model).trim() : null,
    profile: args.profile ? String(args.profile).trim() : null,
    sandbox: args.sandbox ? String(args.sandbox).trim() : null,
    approvalPolicy: args['approval-policy'] ? String(args['approval-policy']).trim() : null,
  };

  if (type !== 'packet' && type !== 'codex-exec') {
    throw new Error(`Unknown team runtime driver: ${type}`);
  }
  if (type === 'codex-exec' && !detectCodexBinary(config.command)) {
    throw new Error(`Codex CLI not found for live worker execution: ${config.command}`);
  }
  return config;
}

function buildRuntimeEnvelope(cwd, orchestrationState, adapterName) {
  const metadata = buildTaskMetadata(orchestrationState);
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adapter: adapterName,
    runner: {
      type: 'packet',
      command: null,
      model: null,
      profile: null,
      sandbox: null,
      approvalPolicy: null,
    },
    policy: 'standard',
    status: 'prepared',
    runtimeSchemaVersion: 2,
    orchestrationStateFile: path.relative(cwd, delegation.orchestrationPaths(cwd).stateFile).replace(/\\/g, '/'),
    dispatchedTasks: [],
    collectedTasks: [],
    collectedResults: {},
    workspaces: {},
    patchBundles: {},
    tasks: metadata.tasks,
    taskScopes: metadata.taskScopes,
    taskModes: metadata.taskModes,
    taskRoles: metadata.taskRoles,
    taskWaves: metadata.taskWaves,
    mailboxFile: path.relative(cwd, mailboxPath(cwd)).replace(/\\/g, '/'),
    timelineFile: path.relative(cwd, timelinePath(cwd)).replace(/\\/g, '/'),
    conflicts: readJsonIfExists(conflictsPath(cwd), null),
    mergeQueue: readJsonIfExists(mergeQueuePath(cwd), null),
    quality: readJsonIfExists(qualityPath(cwd), null),
    supervisor: readJsonIfExists(supervisorPath(cwd), null),
    prFeedback: readJsonIfExists(prFeedbackPath(cwd), null),
    reviewLoop: readJsonIfExists(reviewLoopPath(cwd), null),
    conflictsSummary: null,
    mergeQueueSummary: null,
    qualitySummary: null,
    supervisorSummary: null,
    prFeedbackSummary: null,
    reviewLoopSummary: null,
    guardrails: {
      validTaskCount: metadata.tasks.length,
      lastPrunedCount: 0,
      orphanTaskRefsRemoved: 0,
      affectedCollections: [],
      updatedAt: new Date().toISOString(),
    },
  };
}

function pruneTaskScopedMap(collection, validTaskIds, key, stats) {
  const nextCollection = {};
  for (const [taskId, value] of Object.entries(collection || {})) {
    if (!validTaskIds.has(taskId)) {
      stats.orphanTaskRefsRemoved += 1;
      stats.affectedCollections.add(key);
      continue;
    }
    nextCollection[taskId] = value;
  }
  return nextCollection;
}

function pruneTaskScopedList(collection, validTaskIds, key, stats) {
  const nextCollection = [];
  for (const item of collection || []) {
    if (!validTaskIds.has(item)) {
      stats.orphanTaskRefsRemoved += 1;
      stats.affectedCollections.add(key);
      continue;
    }
    nextCollection.push(item);
  }
  return nextCollection;
}

function syncRuntimeMetadata(runtimeState, orchestrationState) {
  const metadata = buildTaskMetadata(orchestrationState);
  const validTaskIds = new Set(metadata.tasks.map((task) => task.id));
  const previousGuardrails = runtimeState?.guardrails || {};
  const stats = {
    orphanTaskRefsRemoved: 0,
    affectedCollections: new Set(),
  };
  const nextState = {
    ...runtimeState,
    tasks: metadata.tasks,
    taskScopes: metadata.taskScopes,
    taskModes: metadata.taskModes,
    taskRoles: metadata.taskRoles,
    taskWaves: metadata.taskWaves,
  };

  for (const key of TASK_OBJECT_KEYS) {
    nextState[key] = pruneTaskScopedMap(runtimeState?.[key], validTaskIds, key, stats);
  }
  for (const key of TASK_LIST_KEYS) {
    nextState[key] = pruneTaskScopedList(runtimeState?.[key], validTaskIds, key, stats);
  }

  nextState.guardrails = {
    validTaskCount: metadata.tasks.length,
    lastPrunedCount: stats.orphanTaskRefsRemoved || previousGuardrails.lastPrunedCount || 0,
    orphanTaskRefsRemoved: (previousGuardrails.orphanTaskRefsRemoved || 0) + stats.orphanTaskRefsRemoved,
    affectedCollections: [...new Set([
      ...(Array.isArray(previousGuardrails.affectedCollections) ? previousGuardrails.affectedCollections : []),
      ...stats.affectedCollections,
    ])].sort(),
    updatedAt: new Date().toISOString(),
  };
  return nextState;
}

function writeTimelineEvent(cwd, event, payload = {}) {
  appendIndexedEvent(cwd, 'timeline', {
    generatedAt: new Date().toISOString(),
    event,
    ...payload,
  });
}

function writeMailboxEvent(cwd, kind, payload = {}) {
  appendIndexedEvent(cwd, 'mailbox', {
    generatedAt: new Date().toISOString(),
    kind,
    ...payload,
  });
}

function listMailbox(cwd) {
  const snapshot = getLogSnapshot(cwd, 'mailbox');
  return {
    mailboxFile: relativePath(cwd, mailboxPath(cwd)),
    count: snapshot.count,
    entries: snapshot.recent,
  };
}

function listTimeline(cwd) {
  const snapshot = getLogSnapshot(cwd, 'timeline');
  return {
    timelineFile: relativePath(cwd, timelinePath(cwd)),
    count: snapshot.count,
    entries: snapshot.recent,
  };
}

function renderSummary(cwd, runtimeState, orchestrationState) {
  return {
    adapter: runtimeState.adapter,
    runner: runtimeState.runner || { type: 'packet' },
    status: runtimeState.status,
    policy: runtimeState.policy,
    activeWave: orchestrationState.activeWave,
    route: orchestrationState.runtime?.route || null,
    counts: orchestrationState.runtime?.counts || null,
    dispatchedTasks: runtimeState.dispatchedTasks || [],
    collectedTasks: runtimeState.collectedTasks || [],
    patchBundles: Object.fromEntries(
      Object.entries(runtimeState.patchBundles || {}).map(([taskId, bundle]) => [
        taskId,
        {
          patchFile: bundle.patchFile,
          changedFiles: bundle.changedFiles,
          placeholder: bundle.placeholder,
        },
      ]),
    ),
    workspaces: Object.fromEntries(
      Object.entries(runtimeState.workspaces || {}).map(([taskId, workspace]) => [
        taskId,
        {
          path: workspace.path ? path.relative(cwd, workspace.path).replace(/\\/g, '/') : null,
          mode: workspace.mode,
          exists: workspace.exists,
          hasResult: workspace.hasResult,
          live: workspace.live || null,
        },
      ]),
    ),
    conflicts: runtimeState.conflictsSummary || summarizeConflicts(runtimeState.conflicts),
    mergeQueue: runtimeState.mergeQueueSummary || summarizeMergeQueue(runtimeState.mergeQueue),
    quality: runtimeState.qualitySummary || summarizeQuality(runtimeState.quality),
    supervisor: runtimeState.supervisorSummary || summarizeSupervisor(runtimeState.supervisor),
    prFeedback: runtimeState.prFeedbackSummary || summarizePrFeedback(runtimeState.prFeedback),
    reviewLoop: runtimeState.reviewLoopSummary || summarizeReviewLoop(runtimeState.reviewLoop),
    guardrails: runtimeState.guardrails || {
      validTaskCount: Array.isArray(runtimeState.tasks) ? runtimeState.tasks.length : 0,
      lastPrunedCount: 0,
      orphanTaskRefsRemoved: 0,
      affectedCollections: [],
    },
    runtimeFile: path.relative(cwd, runtimeStatePath(cwd)).replace(/\\/g, '/'),
  };
}

function printMailbox(payload) {
  console.log('# TEAM MAILBOX\n');
  console.log(`- File: \`${payload.mailboxFile}\``);
  console.log(`- Count: \`${payload.count}\``);
  for (const entry of payload.entries) {
    console.log(`- \`${entry.kind}\` -> ${entry.summary || entry.note || entry.taskId || ''}`);
  }
}

function printTimeline(payload) {
  console.log('# TEAM TIMELINE\n');
  console.log(`- File: \`${payload.timelineFile}\``);
  console.log(`- Count: \`${payload.count}\``);
  for (const entry of payload.entries) {
    console.log(`- \`${entry.event}\``);
  }
}

function printConflicts(payload) {
  console.log('# TEAM CONFLICTS\n');
  console.log(`- Blockers: \`${payload.blockerCount || 0}\``);
  console.log(`- Warnings: \`${payload.warnCount || 0}\``);
  if (!Array.isArray(payload.conflicts) || payload.conflicts.length === 0) {
    console.log('- `No active conflicts detected`');
    return;
  }
  for (const conflict of payload.conflicts) {
    const subject = conflict.taskId || conflict.file || (conflict.taskIds || []).join(', ') || 'unknown';
    console.log(`- \`${conflict.kind}\` [${conflict.severity}] -> ${subject}`);
  }
}

function printMergeQueue(payload) {
  console.log('# TEAM MERGE QUEUE\n');
  console.log(`- Next task: \`${payload.nextTaskId || 'none'}\``);
  console.log(`- Queue counts: \`${JSON.stringify(payload.counts || {})}\``);
  for (const item of payload.queue || []) {
    console.log(`- \`${item.taskId}\` -> status=\`${item.status}\` patch=\`${item.patchFile}\``);
  }
}

function printQuality(payload) {
  console.log('# TEAM QUALITY\n');
  console.log(`- Average score: \`${payload.averageScore || 0}\``);
  console.log(`- Verdict counts: \`${JSON.stringify(payload.verdictCounts || {})}\``);
  for (const item of payload.tasks || []) {
    console.log(`- \`${item.taskId}\` -> score=\`${item.score}\` verdict=\`${item.verdict}\``);
  }
}

function printPrFeedback(payload) {
  console.log('# TEAM PR FEEDBACK\n');
  console.log(`- Source: \`${payload.source || 'none'}\``);
  console.log(`- Open comments: \`${payload.openCount || 0}\``);
  console.log(`- Resolved comments: \`${payload.resolvedCount || 0}\``);
  if (payload.followupsFile) {
    console.log(`- Follow-ups: \`${payload.followupsFile}\``);
  }
}

module.exports = {
  buildRuntimeEnvelope,
  buildRunnerConfig,
  listMailbox,
  listTimeline,
  mailboxPath,
  printConflicts,
  printMailbox,
  printMergeQueue,
  printPrFeedback,
  printQuality,
  printTimeline,
  readJsonIfExists,
  readRuntimeState,
  renderSummary,
  runtimeStatePath,
  summarizeConflicts,
  summarizeMergeQueue,
  summarizePrFeedback,
  summarizeQuality,
  summarizeReviewLoop,
  summarizeSupervisor,
  syncRuntimeMetadata,
  timelinePath,
  writeMailboxEvent,
  writeRuntimeState,
  writeTimelineEvent,
};
