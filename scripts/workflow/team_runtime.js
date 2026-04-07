const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
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
  prFeedbackFollowupsPath,
  reviewLoopPath,
  reviewLoopMarkdownPath,
  detectChangedFilesForWorkspace,
  createPatchBundle,
  buildConflictAnalysis,
  buildQualityReport,
  buildMergeQueue,
  applyMergeQueue,
  buildReviewLoop,
  importPrFeedback,
  loadPrFeedback,
  resolvePrFeedback,
  loadSupervisorState,
  writeSupervisorState,
} = require('./team_runtime_artifacts');

const adapters = {
  'plan-only': require('./team_adapters/plan_only'),
  worktree: require('./team_adapters/worktree'),
  subagent: require('./team_adapters/subagent'),
  hybrid: require('./team_adapters/hybrid'),
};

function printHelp() {
  console.log(`
team_runtime

Usage:
  node scripts/workflow/team_runtime.js run --adapter worktree
  node scripts/workflow/team_runtime.js dispatch
  node scripts/workflow/team_runtime.js monitor
  node scripts/workflow/team_runtime.js collect
  node scripts/workflow/team_runtime.js supervise --watch --interval 5
  node scripts/workflow/team_runtime.js conflicts
  node scripts/workflow/team_runtime.js merge-queue --apply-next
  node scripts/workflow/team_runtime.js quality
  node scripts/workflow/team_runtime.js pr-feedback import --file review-comments.json

Options:
  --root <path>                 Workflow root. Defaults to active workstream root
  --adapter <plan-only|worktree|subagent|hybrid>
                                Runtime adapter. Defaults to plan-only
  --driver <packet|codex-exec>  Worker execution driver. Defaults to packet
  --activation-text <text>      Raw parallel activation text
  --goal <text>                 Optional goal text
  --parallel                    Explicit parallel activation
  --write-scope <a,b;c>         Worker scopes
  --policy <standard|strict>    Runtime policy label. Defaults to standard
  --codex-bin <path>            Optional Codex CLI path for live worker execution
  --model <name>                Optional Codex model override for live workers
  --profile <name>              Optional Codex profile override for live workers
  --sandbox <mode>              Optional sandbox mode for live workers
  --approval-policy <policy>    Optional approval policy for live workers
  --watch                       Keep the supervisor loop alive between cycles
  --cycles <n>                  Bounded supervisor cycle count. Defaults to 1
  --interval <sec>              Supervisor poll interval. Defaults to 5 seconds
  --background                  Spawn the supervisor as a detached background loop
  --stop                        Stop a background or watch supervisor
  --apply-next                  Apply the next queued patch from the merge queue
  --apply-all                   Apply all queued patches from the merge queue
  --auto-merge                  Apply the next queued patch after each supervise cycle
  --file <path>                 Input file for PR feedback import
  --id <comment-id>             PR feedback comment id to resolve
  --json                        Print machine-readable output
  `);
}

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

function ensureAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown team adapter: ${name}`);
  }
  return adapter;
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
  };
}

function syncRuntimeMetadata(runtimeState, orchestrationState) {
  const metadata = buildTaskMetadata(orchestrationState);
  return {
    ...runtimeState,
    tasks: metadata.tasks,
    taskScopes: metadata.taskScopes,
    taskModes: metadata.taskModes,
    taskRoles: metadata.taskRoles,
    taskWaves: metadata.taskWaves,
  };
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

async function refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState) {
  let nextState = syncRuntimeMetadata(runtimeState, orchestrationState);
  const patchBundles = { ...(nextState.patchBundles || {}) };

  for (const [taskId, workspace] of Object.entries(nextState.workspaces || {})) {
    const task = (orchestrationState.tasks || []).find((entry) => entry.id === taskId);
    if (!workspace || !workspace.path || !fs.existsSync(workspace.path)) {
      continue;
    }
    const changedFiles = detectChangedFilesForWorkspace(cwd, workspace, task);
    patchBundles[taskId] = createPatchBundle(cwd, workspace, task || taskId, {
      changedFiles,
    });
  }

  nextState.patchBundles = patchBundles;
  const conflicts = buildConflictAnalysis(cwd, orchestrationState, nextState);
  const quality = buildQualityReport(cwd, orchestrationState, nextState, conflicts);
  const mergeQueue = buildMergeQueue(cwd, orchestrationState, nextState, conflicts, quality);
  const reviewLoop = await buildReviewLoop(cwd, rootDir, nextState);
  const prFeedback = loadPrFeedback(cwd);
  const supervisor = loadSupervisorState(cwd);

  nextState.conflicts = conflicts;
  nextState.quality = quality;
  nextState.mergeQueue = mergeQueue;
  nextState.reviewLoop = reviewLoop;
  nextState.prFeedback = prFeedback;
  nextState.supervisor = supervisor;
  nextState.conflictsSummary = summarizeConflicts(conflicts);
  nextState.qualitySummary = summarizeQuality(quality);
  nextState.mergeQueueSummary = summarizeMergeQueue(mergeQueue);
  nextState.reviewLoopSummary = summarizeReviewLoop(reviewLoop);
  nextState.prFeedbackSummary = summarizePrFeedback(prFeedback);
  nextState.supervisorSummary = summarizeSupervisor(supervisor);
  return nextState;
}

async function loadRuntimeBundle(cwd, rootDir, options = {}) {
  const orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }
  if (options.refresh !== false) {
    runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
  }
  return { orchestrationState, runtimeState };
}

async function startRuntime(cwd, rootDir, args) {
  const adapterName = String(args.adapter || 'plan-only').trim();
  const adapter = ensureAdapter(adapterName);
  let orchestrationState;

  try {
    orchestrationState = delegation.loadRuntimeState(cwd);
  } catch {
    const plan = delegation.buildDelegationPlan(cwd, rootDir, {
      intent: String(args.intent || 'auto').trim(),
      goal: args.goal ? String(args.goal) : '',
      activationText: args['activation-text'] ? String(args['activation-text']) : '',
      parallel: true,
      writeScope: args['write-scope'],
    });
    orchestrationState = delegation.startOrchestration(plan);
  }

  let runtimeState = buildRuntimeEnvelope(cwd, orchestrationState, adapterName);
  runtimeState.policy = String(args.policy || 'standard').trim();
  runtimeState.runner = buildRunnerConfig(args);
  runtimeState = adapter.prepare(orchestrationState, runtimeState);
  runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
  runtimeState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, runtimeState);
  writeTimelineEvent(cwd, 'runtime_started', {
    adapter: adapterName,
    driver: runtimeState.runner.type,
    policy: runtimeState.policy,
  });
  return {
    adapter: adapterName,
    runtimeState,
    orchestrationState,
  };
}

async function dispatchRuntime(cwd, rootDir) {
  let orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }

  const adapter = ensureAdapter(runtimeState.adapter);
  for (const task of orchestrationState.tasks.filter((item) => item.wave === orchestrationState.activeWave && item.status === 'ready')) {
    orchestrationState = delegation.markTaskStarted(orchestrationState, { taskId: task.id });
  }
  runtimeState = syncRuntimeMetadata(runtimeState, orchestrationState);
  runtimeState = adapter.dispatch(orchestrationState, runtimeState);
  runtimeState.status = 'dispatched';
  runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
  runtimeState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, runtimeState);
  writeTimelineEvent(cwd, 'runtime_dispatched', {
    adapter: runtimeState.adapter,
    dispatchedTasks: runtimeState.dispatchedTasks,
  });
  return {
    runtimeState,
    orchestrationState,
  };
}

async function monitorRuntime(cwd, rootDir) {
  const orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }
  const adapter = ensureAdapter(runtimeState.adapter);
  runtimeState = syncRuntimeMetadata(runtimeState, orchestrationState);
  const polledState = adapter.poll(orchestrationState, runtimeState);
  const nextState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, polledState);
  nextState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, nextState);
  writeTimelineEvent(cwd, 'runtime_polled', {
    adapter: nextState.adapter,
    workspaceCount: Object.keys(nextState.workspaces || {}).length,
  });
  return {
    runtimeState: nextState,
    orchestrationState,
  };
}

async function collectRuntime(cwd, rootDir) {
  let orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }
  const adapter = ensureAdapter(runtimeState.adapter);
  runtimeState = syncRuntimeMetadata(runtimeState, orchestrationState);
  runtimeState = adapter.collect(orchestrationState, runtimeState);

  for (const [taskId, result] of Object.entries(runtimeState.collectedResults || {})) {
    const task = orchestrationState.tasks.find((item) => item.id === taskId);
    if (!task || ['completed', 'blocked', 'failed', 'skipped'].includes(task.status)) {
      continue;
    }
    orchestrationState = delegation.markTaskCompleted(orchestrationState, {
      taskId,
      resultStatus: result.status,
      summary: result.summary,
      details: result.details,
      evidence: result.evidence,
      next: result.next,
    });
    if (runtimeState.workspaces?.[taskId]) {
      const changedFiles = detectChangedFilesForWorkspace(cwd, runtimeState.workspaces[taskId], task);
      const patchBundle = createPatchBundle(cwd, runtimeState.workspaces[taskId], task, { changedFiles });
      runtimeState.patchBundles = {
        ...(runtimeState.patchBundles || {}),
        [taskId]: patchBundle,
      };
      writeMailboxEvent(cwd, 'task_collected', {
        taskId,
        summary: result.summary,
        patchFile: patchBundle.patchFile,
      });
    }
  }

  runtimeState.status = 'collected';
  runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
  runtimeState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, runtimeState);
  writeTimelineEvent(cwd, 'runtime_collected', {
    collectedTasks: runtimeState.collectedTasks,
  });
  return {
    runtimeState,
    orchestrationState,
  };
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

function steerRuntime(cwd, args) {
  const note = String(args.note || args._.slice(1).join(' ') || '').trim();
  if (!note) {
    throw new Error('Provide a steering note via --note or free-form text.');
  }
  writeMailboxEvent(cwd, 'steering_note', {
    note,
  });
  writeTimelineEvent(cwd, 'runtime_steered', {
    note,
  });
  return {
    note,
    mailboxFile: relativePath(cwd, mailboxPath(cwd)),
  };
}

async function conflictsRuntime(cwd, rootDir) {
  const { runtimeState } = await loadRuntimeBundle(cwd, rootDir, { refresh: true });
  return runtimeState.conflicts || readJsonIfExists(conflictsPath(cwd), {
    blockerCount: 0,
    warnCount: 0,
    conflicts: [],
  });
}

async function qualityRuntime(cwd, rootDir) {
  const { runtimeState } = await loadRuntimeBundle(cwd, rootDir, { refresh: true });
  return runtimeState.quality || readJsonIfExists(qualityPath(cwd), {
    averageScore: 0,
    verdictCounts: {},
    tasks: [],
  });
}

async function mergeQueueRuntime(cwd, rootDir, args = {}) {
  const { orchestrationState, runtimeState } = await loadRuntimeBundle(cwd, rootDir, { refresh: true });
  let payload = runtimeState.mergeQueue || readJsonIfExists(mergeQueuePath(cwd), {
    queue: [],
    counts: {},
    nextTaskId: null,
  });
  const applyAllFlag = Boolean(args['apply-all'] || args.applyAll);
  const applyNextFlag = Boolean(args['apply-next'] || args.applyNext || args['auto-merge'] || args.autoMerge);
  if (applyAllFlag || applyNextFlag) {
    payload = applyMergeQueue(cwd, payload, { applyAll: applyAllFlag });
    const nextRuntimeState = {
      ...readRuntimeState(cwd),
      mergeQueue: payload,
      mergeQueueSummary: summarizeMergeQueue(payload),
      updatedAt: new Date().toISOString(),
    };
    writeRuntimeState(cwd, nextRuntimeState);
    writeTimelineEvent(cwd, 'merge_queue_applied', {
      applyAll: applyAllFlag,
      attempted: payload.lastApply?.attempted || 0,
      nextTaskId: payload.nextTaskId,
    });
    return {
      ...payload,
      activeWave: orchestrationState.activeWave,
    };
  }
  return {
    ...payload,
    activeWave: orchestrationState.activeWave,
  };
}

async function prFeedbackRuntime(cwd, rootDir, args) {
  const subaction = String(args._[1] || (args.file ? 'import' : 'status')).trim();
  let orchestrationState;
  let runtimeState;

  if (subaction === 'status') {
    const feedback = loadPrFeedback(cwd);
    return {
      ...feedback,
      followupsFile: fs.existsSync(prFeedbackFollowupsPath(cwd)) ? relativePath(cwd, prFeedbackFollowupsPath(cwd)) : null,
    };
  }

  ({ orchestrationState, runtimeState } = await loadRuntimeBundle(cwd, rootDir, { refresh: false }));

  if (subaction === 'import') {
    const sourceFile = String(args.file || args.input || args._[2] || '').trim();
    if (!sourceFile) {
      throw new Error('Provide a PR feedback file via --file.');
    }
    const imported = importPrFeedback(cwd, runtimeState, sourceFile);
    runtimeState.prFeedback = imported;
    runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
    writeTimelineEvent(cwd, 'pr_feedback_imported', {
      source: imported.source,
      openCount: imported.openCount,
    });
    return {
      ...imported,
      followupsFile: relativePath(cwd, prFeedbackFollowupsPath(cwd)),
    };
  }

  if (subaction === 'resolve') {
    const ids = [];
    if (Array.isArray(args.id)) {
      ids.push(...args.id.map((item) => String(item)));
    } else if (args.id) {
      ids.push(String(args.id));
    }
    if (Array.isArray(args['comment-id'])) {
      ids.push(...args['comment-id'].map((item) => String(item)));
    } else if (args['comment-id']) {
      ids.push(String(args['comment-id']));
    }
    ids.push(...args._.slice(2).map((item) => String(item)));
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error('Provide at least one comment id via --id for PR feedback resolution.');
    }
    const resolved = resolvePrFeedback(cwd, uniqueIds);
    runtimeState.prFeedback = resolved;
    runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
    writeTimelineEvent(cwd, 'pr_feedback_resolved', {
      commentIds: uniqueIds,
      openCount: resolved.openCount,
    });
    return {
      ...resolved,
      followupsFile: fs.existsSync(prFeedbackFollowupsPath(cwd)) ? relativePath(cwd, prFeedbackFollowupsPath(cwd)) : null,
    };
  }

  throw new Error(`Unknown PR feedback action: ${subaction}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberFromArg(value, fallback, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, parsed);
}

function spawnBackgroundSupervisor(cwd, args) {
  const childArgs = [__filename, 'supervise'];
  const passThrough = [
    'root',
    'adapter',
    'driver',
    'activation-text',
    'goal',
    'write-scope',
    'policy',
    'codex-bin',
    'model',
    'profile',
    'sandbox',
    'approval-policy',
    'cycles',
    'interval',
  ];
  for (const key of passThrough) {
    if (args[key]) {
      childArgs.push(`--${key}`, String(args[key]));
    }
  }
  for (const key of ['parallel', 'watch', 'auto-merge', 'apply-all', 'apply-next']) {
    if (args[key]) {
      childArgs.push(`--${key}`);
    }
  }
  const child = childProcess.spawn(process.execPath, childArgs, {
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}

async function superviseRuntime(cwd, rootDir, args) {
  if (args.stop) {
    const current = loadSupervisorState(cwd);
    let signalSent = false;
    if (current.pid) {
      try {
        process.kill(current.pid, 'SIGTERM');
        signalSent = true;
      } catch {
        signalSent = false;
      }
    }
    const next = {
      ...current,
      status: 'stopped',
      pid: null,
      stopRequested: true,
      stoppedAt: new Date().toISOString(),
      signalSent,
    };
    writeSupervisorState(cwd, next);
    const runtimeState = readRuntimeState(cwd);
    if (runtimeState) {
      runtimeState.supervisor = next;
      runtimeState.supervisorSummary = summarizeSupervisor(next);
      runtimeState.updatedAt = new Date().toISOString();
      writeRuntimeState(cwd, runtimeState);
    }
    writeTimelineEvent(cwd, 'supervisor_stopped', {
      signalSent,
    });
    return next;
  }

  if (args.background) {
    const pid = spawnBackgroundSupervisor(cwd, args);
    const supervisor = {
      ...loadSupervisorState(cwd),
      status: 'background',
      pid,
      watch: Boolean(args.watch),
      background: true,
      cycleCount: loadSupervisorState(cwd).cycleCount || 0,
      maxCycles: args.cycles ? numberFromArg(args.cycles, 1) : null,
      intervalMs: numberFromArg(args.interval, 5) * 1000,
      stopRequested: false,
      startedAt: new Date().toISOString(),
    };
    writeSupervisorState(cwd, supervisor);
    writeTimelineEvent(cwd, 'supervisor_spawned', {
      pid,
      watch: supervisor.watch,
    });
    return supervisor;
  }

  const watch = Boolean(args.watch);
  const maxCycles = args.cycles
    ? numberFromArg(args.cycles, 1)
    : watch
      ? Number.MAX_SAFE_INTEGER
      : 1;
  const intervalMs = numberFromArg(args.interval, 5) * 1000;
  let supervisor = {
    ...loadSupervisorState(cwd),
    status: 'running',
    pid: process.pid,
    watch,
    background: false,
    maxCycles: Number.isFinite(maxCycles) ? maxCycles : null,
    intervalMs,
    stopRequested: false,
    startedAt: loadSupervisorState(cwd).startedAt || new Date().toISOString(),
  };
  writeSupervisorState(cwd, supervisor);
  writeTimelineEvent(cwd, 'supervisor_started', {
    watch,
    maxCycles: supervisor.maxCycles,
    intervalMs,
  });

  let latestOrchestration = null;
  for (let cycleIndex = 0; cycleIndex < maxCycles; cycleIndex += 1) {
    const currentSupervisor = loadSupervisorState(cwd);
    if (currentSupervisor.stopRequested) {
      supervisor = currentSupervisor;
      break;
    }

    if (!readRuntimeState(cwd)) {
      await startRuntime(cwd, rootDir, args);
    }

    let orchestrationState = delegation.loadRuntimeState(cwd);
    let runtimeState = readRuntimeState(cwd);
    if (!runtimeState) {
      throw new Error('Supervisor could not find or create a runtime state.');
    }

    const cycleRecord = {
      cycle: (currentSupervisor.cycleCount || 0) + 1,
      startedAt: new Date().toISOString(),
      actions: [],
    };
    const currentSummary = delegation.summarizeState(orchestrationState);

    if (currentSummary.route?.action === 'dispatch_ready_tasks'
      || orchestrationState.tasks.some((task) => task.wave === orchestrationState.activeWave && task.status === 'ready')) {
      ({ orchestrationState, runtimeState } = await dispatchRuntime(cwd, rootDir));
      cycleRecord.actions.push('dispatch');
    } else {
      ({ orchestrationState, runtimeState } = await monitorRuntime(cwd, rootDir));
      cycleRecord.actions.push('monitor');
    }

    ({ orchestrationState, runtimeState } = await collectRuntime(cwd, rootDir));
    cycleRecord.actions.push('collect');

    latestOrchestration = delegation.loadRuntimeState(cwd);
    let latestSummary = delegation.summarizeState(latestOrchestration);
    if (latestSummary.route?.canAdvance) {
      latestOrchestration = delegation.advanceWave(latestOrchestration);
      runtimeState = readRuntimeState(cwd) || runtimeState;
      runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, latestOrchestration, runtimeState);
      runtimeState.updatedAt = new Date().toISOString();
      writeRuntimeState(cwd, runtimeState);
      cycleRecord.actions.push('advance');
      latestSummary = delegation.summarizeState(latestOrchestration);
    }

    if (args['auto-merge'] || args['apply-next'] || args['apply-all']) {
      const merged = await mergeQueueRuntime(cwd, rootDir, {
        applyAll: Boolean(args['apply-all']),
        applyNext: Boolean(args['apply-next'] || args['auto-merge']),
      });
      cycleRecord.actions.push((merged.lastApply?.attempted || 0) > 0 ? 'merge' : 'merge-skip');
    }

    const refreshedRuntime = readRuntimeState(cwd) || runtimeState;
    cycleRecord.completedAt = new Date().toISOString();
    cycleRecord.activeWave = latestOrchestration?.activeWave || orchestrationState.activeWave;
    cycleRecord.route = latestSummary.route;
    cycleRecord.conflicts = refreshedRuntime.conflictsSummary || summarizeConflicts(refreshedRuntime.conflicts);
    cycleRecord.mergeQueue = refreshedRuntime.mergeQueueSummary || summarizeMergeQueue(refreshedRuntime.mergeQueue);
    cycleRecord.quality = refreshedRuntime.qualitySummary || summarizeQuality(refreshedRuntime.quality);

    supervisor = {
      ...loadSupervisorState(cwd),
      status: latestSummary.status === 'completed' ? 'completed' : latestSummary.status === 'blocked' ? 'blocked' : 'running',
      pid: process.pid,
      watch,
      background: false,
      maxCycles: Number.isFinite(maxCycles) ? maxCycles : null,
      intervalMs,
      stopRequested: false,
      cycleCount: (loadSupervisorState(cwd).cycleCount || 0) + 1,
      lastCycleAt: cycleRecord.completedAt,
      route: latestSummary.route,
      history: [cycleRecord, ...(loadSupervisorState(cwd).history || [])].slice(0, 25),
    };
    writeSupervisorState(cwd, supervisor);
    const runtimeAfterCycle = readRuntimeState(cwd);
    if (runtimeAfterCycle) {
      runtimeAfterCycle.supervisor = supervisor;
      runtimeAfterCycle.supervisorSummary = summarizeSupervisor(supervisor);
      runtimeAfterCycle.updatedAt = new Date().toISOString();
      writeRuntimeState(cwd, runtimeAfterCycle);
    }

    if (supervisor.status === 'completed' || supervisor.status === 'blocked') {
      break;
    }
    if (cycleIndex + 1 >= maxCycles) {
      break;
    }
    await sleep(intervalMs);
  }

  supervisor = loadSupervisorState(cwd);
  if (supervisor.stopRequested) {
    supervisor.status = 'stopped';
  } else if (supervisor.status === 'running') {
    const orchestrationState = latestOrchestration || delegation.loadRuntimeState(cwd);
    const summary = delegation.summarizeState(orchestrationState);
    supervisor.status = summary.status === 'completed'
      ? 'completed'
      : summary.status === 'blocked'
        ? 'blocked'
        : watch
          ? 'watching'
          : 'idle';
    supervisor.route = summary.route;
  }
  supervisor.finishedAt = new Date().toISOString();
  writeSupervisorState(cwd, supervisor);
  const runtimeState = readRuntimeState(cwd);
  if (runtimeState) {
    runtimeState.supervisor = supervisor;
    runtimeState.supervisorSummary = summarizeSupervisor(supervisor);
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
  }
  return supervisor;
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
          path: path.relative(cwd, workspace.path).replace(/\\/g, '/'),
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'monitor';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);

  if (action === 'mailbox') {
    const payload = listMailbox(cwd);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printMailbox(payload);
    return;
  }

  if (action === 'timeline') {
    const payload = listTimeline(cwd);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printTimeline(payload);
    return;
  }

  if (action === 'steer') {
    const payload = steerRuntime(cwd, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# TEAM STEER\n');
    console.log(`- Note: \`${payload.note}\``);
    return;
  }

  if (action === 'conflicts') {
    const payload = await conflictsRuntime(cwd, rootDir);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printConflicts(payload);
    return;
  }

  if (action === 'merge-queue') {
    const payload = await mergeQueueRuntime(cwd, rootDir, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printMergeQueue(payload);
    return;
  }

  if (action === 'quality') {
    const payload = await qualityRuntime(cwd, rootDir);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printQuality(payload);
    return;
  }

  if (action === 'pr-feedback') {
    const payload = await prFeedbackRuntime(cwd, rootDir, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printPrFeedback(payload);
    return;
  }

  if (action === 'supervise') {
    const payload = await superviseRuntime(cwd, rootDir, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# TEAM SUPERVISOR\n');
    console.log(`- Status: \`${payload.status}\``);
    console.log(`- PID: \`${payload.pid || 'none'}\``);
    console.log(`- Cycles: \`${payload.cycleCount || 0}\``);
    console.log(`- Watch: \`${payload.watch ? 'yes' : 'no'}\``);
    return;
  }

  let result;
  if (action === 'run') {
    result = await startRuntime(cwd, rootDir, args);
  } else if (action === 'dispatch') {
    result = await dispatchRuntime(cwd, rootDir);
  } else if (action === 'monitor') {
    result = await monitorRuntime(cwd, rootDir);
  } else if (action === 'collect') {
    result = await collectRuntime(cwd, rootDir);
  } else {
    throw new Error(`Unknown team runtime action: ${action}`);
  }

  const summary = renderSummary(cwd, result.runtimeState, result.orchestrationState);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('# TEAM RUNTIME\n');
  console.log(`- Adapter: \`${summary.adapter}\``);
  console.log(`- Runner: \`${summary.runner.type}\``);
  console.log(`- Status: \`${summary.status}\``);
  console.log(`- Active wave: \`${summary.activeWave}\``);
  console.log(`- Runtime file: \`${summary.runtimeFile}\``);
  console.log(`- Dispatched tasks: \`${summary.dispatchedTasks.length}\``);
  console.log(`- Collected tasks: \`${summary.collectedTasks.length}\``);
  console.log(`- Conflicts: blockers=\`${summary.conflicts.blockerCount || 0}\` warn=\`${summary.conflicts.warnCount || 0}\``);
  console.log(`- Merge queue: next=\`${summary.mergeQueue.nextTaskId || 'none'}\` queued=\`${summary.mergeQueue.counts?.queued || 0}\``);
  console.log(`- Quality: avg=\`${summary.quality.averageScore || 0}\``);
  if (Object.keys(summary.workspaces).length > 0) {
    console.log('\n## Workspaces\n');
    for (const [taskId, workspace] of Object.entries(summary.workspaces)) {
      const live = workspace.live
        ? `, live=\`${workspace.live.running ? 'running' : 'idle'}\``
        : '';
      console.log(`- \`${taskId}\` -> path=\`${workspace.path}\`, mode=\`${workspace.mode}\`, exists=\`${workspace.exists ? 'yes' : 'no'}\`, result=\`${workspace.hasResult ? 'yes' : 'no'}\`${live}`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  collectRuntime,
  conflictsRuntime,
  dispatchRuntime,
  mergeQueueRuntime,
  monitorRuntime,
  prFeedbackRuntime,
  qualityRuntime,
  refreshRuntimeArtifacts,
  startRuntime,
  superviseRuntime,
};
