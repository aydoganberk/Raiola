const fs = require('node:fs');
const delegation = require('./delegation_plan');
const { relativePath } = require('./roadmap_os');
const {
  buildRuntimeEnvelope,
  buildRunnerConfig,
  mailboxPath,
  readJsonIfExists,
  readRuntimeState,
  summarizeConflicts,
  summarizeMergeQueue,
  summarizePrFeedback,
  summarizeQuality,
  summarizeReviewLoop,
  summarizeSupervisor,
  syncRuntimeMetadata,
  writeMailboxEvent,
  writeRuntimeState,
  writeTimelineEvent,
} = require('./team_runtime_state');
const {
  mergeQueuePath,
  conflictsPath,
  qualityPath,
  prFeedbackFollowupsPath,
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
} = require('./team_runtime_artifacts');

const adapters = {
  'plan-only': require('./team_adapters/plan_only'),
  worktree: require('./team_adapters/worktree'),
  subagent: require('./team_adapters/subagent'),
  hybrid: require('./team_adapters/hybrid'),
};

function ensureAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown team adapter: ${name}`);
  }
  return adapter;
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
    throw new Error('No team runtime exists yet. Run `rai team run` first.');
  }

  runtimeState = syncRuntimeMetadata(runtimeState, orchestrationState);
  const removedOrphans = runtimeState.guardrails?.orphanTaskRefsRemoved || 0;
  if (options.refresh !== false) {
    runtimeState = await refreshRuntimeArtifacts(cwd, rootDir, orchestrationState, runtimeState);
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
  } else if (removedOrphans > 0) {
    runtimeState.updatedAt = new Date().toISOString();
    writeRuntimeState(cwd, runtimeState);
    writeTimelineEvent(cwd, 'runtime_guardrails_applied', {
      orphanTaskRefsRemoved: removedOrphans,
      affectedCollections: runtimeState.guardrails?.affectedCollections || [],
    });
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
    throw new Error('No team runtime exists yet. Run `rai team run` first.');
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
    throw new Error('No team runtime exists yet. Run `rai team run` first.');
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
    throw new Error('No team runtime exists yet. Run `rai team run` first.');
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

function parsePrFeedbackIds(args) {
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
  return [...new Set(ids.filter(Boolean))];
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
    const uniqueIds = parsePrFeedbackIds(args);
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

module.exports = {
  collectRuntime,
  conflictsRuntime,
  dispatchRuntime,
  ensureAdapter,
  loadRuntimeBundle,
  mergeQueueRuntime,
  monitorRuntime,
  prFeedbackRuntime,
  qualityRuntime,
  refreshRuntimeArtifacts,
  startRuntime,
  steerRuntime,
};
