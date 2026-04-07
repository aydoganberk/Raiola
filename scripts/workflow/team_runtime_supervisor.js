const path = require('node:path');
const childProcess = require('node:child_process');
const delegation = require('./delegation_plan');
const {
  readRuntimeState,
  summarizeConflicts,
  summarizeMergeQueue,
  summarizeQuality,
  summarizeSupervisor,
  writeRuntimeState,
  writeTimelineEvent,
} = require('./team_runtime_state');
const {
  loadSupervisorState,
  writeSupervisorState,
} = require('./team_runtime_artifacts');
const {
  collectRuntime,
  dispatchRuntime,
  mergeQueueRuntime,
  monitorRuntime,
  refreshRuntimeArtifacts,
  startRuntime,
} = require('./team_runtime_core');

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
  const childArgs = [path.join(__dirname, 'team_runtime.js'), 'supervise'];
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
    const current = loadSupervisorState(cwd);
    const supervisor = {
      ...current,
      status: 'background',
      pid,
      watch: Boolean(args.watch),
      background: true,
      cycleCount: current.cycleCount || 0,
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
  const current = loadSupervisorState(cwd);
  let supervisor = {
    ...current,
    status: 'running',
    pid: process.pid,
    watch,
    background: false,
    maxCycles: Number.isFinite(maxCycles) ? maxCycles : null,
    intervalMs,
    stopRequested: false,
    startedAt: current.startedAt || new Date().toISOString(),
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

    const latestSupervisor = loadSupervisorState(cwd);
    supervisor = {
      ...latestSupervisor,
      status: latestSummary.status === 'completed' ? 'completed' : latestSummary.status === 'blocked' ? 'blocked' : 'running',
      pid: process.pid,
      watch,
      background: false,
      maxCycles: Number.isFinite(maxCycles) ? maxCycles : null,
      intervalMs,
      stopRequested: false,
      cycleCount: (latestSupervisor.cycleCount || 0) + 1,
      lastCycleAt: cycleRecord.completedAt,
      route: latestSummary.route,
      history: [cycleRecord, ...(latestSupervisor.history || [])].slice(0, 25),
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

module.exports = {
  superviseRuntime,
};
