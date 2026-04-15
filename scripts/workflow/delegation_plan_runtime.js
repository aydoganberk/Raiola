const fs = require('node:fs');
const path = require('node:path');
const {
  ensureDir,
  writeText: write,
} = require('./io/files');

const COMPLETED_STATUSES = new Set(['completed', 'skipped']);
const ACTIVE_STATUSES = new Set(['ready', 'in_progress']);

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function orchestrationPaths(cwd) {
  const orchestrationDir = path.join(cwd, '.workflow', 'orchestration');
  return {
    orchestrationDir,
    stateFile: path.join(orchestrationDir, 'state.json'),
    planFile: path.join(orchestrationDir, 'PLAN.md'),
    statusFile: path.join(orchestrationDir, 'STATUS.md'),
    wavesFile: path.join(orchestrationDir, 'WAVES.md'),
    resultsFile: path.join(orchestrationDir, 'RESULTS.md'),
    packetsDir: path.join(orchestrationDir, 'packets'),
    resultsDir: path.join(orchestrationDir, 'results'),
  };
}

function buildTasksFromPlan(plan) {
  const tasks = [];
  for (const wave of plan.waves) {
    for (const role of wave.roles) {
      const roleSlug = role.role.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const taskId = `wave${wave.wave}-${roleSlug}`;
      tasks.push({
        id: taskId,
        wave: wave.wave,
        role: role.role,
        mode: role.mode || 'owner',
        ownerType: role.role === 'main' ? 'main' : 'child',
        task: role.task,
        writeScope: role.writeScope || [],
        status: wave.wave === 1 ? 'ready' : 'queued',
        startedAt: null,
        completedAt: null,
        resultStatus: null,
        summary: '',
        details: '',
        evidence: [],
        next: '',
      });
    }
  }
  return tasks;
}

function renderTaskPacket(state, task) {
  const lines = [
    `# TASK PACKET: ${task.id}`,
    '',
    `- Workflow root: \`${state.workflowRootRelative}\``,
    `- Milestone: \`${state.milestone}\``,
    `- Step: \`${state.step}\``,
    `- Intent: \`${state.intent}\``,
    `- Wave: \`${task.wave}\``,
    `- Role: \`${task.role}\``,
    `- Mode: \`${task.mode}\``,
    `- Task: \`${task.task}\``,
    `- Owner type: \`${task.ownerType}\``,
    `- Write scope: \`${task.writeScope.length > 0 ? task.writeScope.join(', ') : 'read-only'}\``,
    '',
    '## Guardrails',
    '',
    ...state.guardrails.map((item) => `- ${item}`),
    '',
    '## Recommended Read Set',
    '',
    `- \`${state.workflowRootRelative}/CONTEXT.md\``,
    `- \`${state.workflowRootRelative}/EXECPLAN.md\``,
    `- \`${state.workflowRootRelative}/VALIDATION.md\``,
    `- \`${state.workflowRootRelative}/WINDOW.md\``,
    ...Object.values(state.codebaseMap.surfaces).map((item) => `- \`${item}\``),
    '',
    '## Reporting Contract',
    '',
    '- Return a short summary, evidence, and the next recommended route.',
    '- Workers must stay inside their write scope and should not revert other changes.',
    '- Read-only roles should not make edits.',
    '',
  ];

  return `${lines.join('\n').trimEnd()}\n`;
}

function computeRoute(state) {
  const tasks = state.tasks;
  const activeWave = state.activeWave;
  const currentWaveTasks = tasks.filter((task) => task.wave === activeWave);
  const readyTasks = currentWaveTasks.filter((task) => task.status === 'ready');
  const inProgressTasks = currentWaveTasks.filter((task) => task.status === 'in_progress');
  const blockedTasks = currentWaveTasks.filter((task) => ['blocked', 'failed'].includes(task.status));
  const incompleteTasks = currentWaveTasks.filter((task) => !COMPLETED_STATUSES.has(task.status));
  const queuedTasks = tasks.filter((task) => task.status === 'queued');
  const allDone = tasks.every((task) => COMPLETED_STATUSES.has(task.status));

  if (allDone) {
    return {
      action: 'orchestration_complete',
      recommendation: state.intent === 'research'
        ? 'Integrate the research output into workflow docs and continue with raiola:next.'
        : state.intent === 'execute'
          ? 'Run the audit route next or return to raiola:next for the next routed step.'
          : 'Return to raiola:next to continue the milestone.',
      canAdvance: false,
    };
  }

  if (blockedTasks.length > 0) {
    return {
      action: 'resolve_blocked_tasks',
      recommendation: `Resolve blocked task(s): ${blockedTasks.map((task) => task.id).join(', ')}`,
      canAdvance: false,
    };
  }

  if (readyTasks.length > 0 && inProgressTasks.length === 0) {
    return {
      action: 'dispatch_ready_tasks',
      recommendation: `Dispatch or run ready task(s): ${readyTasks.map((task) => task.id).join(', ')}`,
      canAdvance: false,
    };
  }

  if (inProgressTasks.length > 0) {
    return {
      action: 'wait_for_in_progress_tasks',
      recommendation: `Wait for active task(s): ${inProgressTasks.map((task) => task.id).join(', ')}`,
      canAdvance: false,
    };
  }

  if (incompleteTasks.length === 0 && queuedTasks.length > 0) {
    const nextWave = Math.min(...queuedTasks.map((task) => task.wave));
    return {
      action: 'advance_wave',
      recommendation: `Advance to wave ${nextWave} and activate its queued tasks.`,
      canAdvance: true,
      nextWave,
    };
  }

  return {
    action: 'continue_current_wave',
    recommendation: 'Continue the current wave until all tasks are completed or explicitly skipped.',
    canAdvance: false,
  };
}

function summarizeState(state) {
  const counts = {
    queued: state.tasks.filter((task) => task.status === 'queued').length,
    ready: state.tasks.filter((task) => task.status === 'ready').length,
    inProgress: state.tasks.filter((task) => task.status === 'in_progress').length,
    completed: state.tasks.filter((task) => task.status === 'completed').length,
    blocked: state.tasks.filter((task) => ['blocked', 'failed'].includes(task.status)).length,
    skipped: state.tasks.filter((task) => task.status === 'skipped').length,
  };

  if (state.paused) {
    return {
      counts,
      route: {
        action: 'orchestration_paused',
        recommendation: state.pauseSummary || 'Resume the orchestration runtime before dispatching more work.',
        canAdvance: false,
      },
      status: 'paused',
    };
  }

  const route = computeRoute(state);
  const status = counts.blocked > 0
    ? 'blocked'
    : route.action === 'orchestration_complete'
      ? 'completed'
      : 'active';

  return {
    counts,
    route,
    status,
  };
}

function renderTaskResult(task) {
  const lines = [
    `# TASK RESULT: ${task.id}`,
    '',
    `- Role: \`${task.role}\``,
    `- Status: \`${task.resultStatus || task.status}\``,
    `- Started at: \`${task.startedAt || 'unknown'}\``,
    `- Completed at: \`${task.completedAt || 'unknown'}\``,
    '',
    '## Summary',
    '',
    `- ${task.summary || 'No summary recorded'}`,
    '',
  ];

  if (task.details) {
    lines.push('## Details');
    lines.push('');
    lines.push(task.details);
    lines.push('');
  }
  if (task.evidence.length > 0) {
    lines.push('## Evidence');
    lines.push('');
    for (const item of task.evidence) {
      lines.push(`- \`${item}\``);
    }
    lines.push('');
  }
  if (task.next) {
    lines.push('## Suggested Next');
    lines.push('');
    lines.push(`- ${task.next}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderPlanMarkdown(plan) {
  const lines = [
    '# DELEGATION PLAN',
    '',
    `- Generated at: \`${plan.generatedAt}\``,
    `- Workflow root: \`${plan.workflowRootRelative}\``,
    `- Milestone: \`${plan.milestone}\``,
    `- Step: \`${plan.step}\``,
    `- Intent: \`${plan.intent}\``,
    `- Team Lite policy: \`${plan.teamLite.policy}\``,
    `- Team Lite active: \`${plan.teamLite.active ? 'yes' : 'no'}\``,
    `- Activation reason: \`${plan.teamLite.activationReason}\``,
    '',
    '## Natural Language Signals',
    '',
    ...(plan.activationSignals.hits.length > 0
      ? plan.activationSignals.hits.map((item) => `- \`${item.phrase}\` matched explicit parallel intent`)
      : ['- `No explicit parallel phrase detected`']),
    '',
    '## Guardrails',
    '',
    ...plan.guardrails.map((item) => `- ${item}`),
    '',
    '## Blockers',
    '',
    ...(plan.blockers.length > 0 ? plan.blockers.map((item) => `- ${item}`) : ['- `No blockers`']),
    '',
    '## Waves',
    '',
  ];

  for (const wave of plan.waves) {
    lines.push(`### Wave ${wave.wave}`);
    lines.push('');
    lines.push(`- Rationale: \`${wave.rationale}\``);
    for (const role of wave.roles) {
      lines.push(`- \`${role.role}\` -> ${role.task}`);
    }
    lines.push('');
  }

  lines.push('## Recommendation');
  lines.push('');
  lines.push(`- ${plan.recommendation}`);
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderCanonicalPlanMarkdown(state) {
  return `# ORCHESTRATION PLAN

- Workflow root: \`${state.workflowRootRelative}\`
- Milestone: \`${state.milestone}\`
- Step: \`${state.step}\`
- Intent: \`${state.intent}\`
- Team Lite active: \`${state.teamLite.active ? 'yes' : 'no'}\`
- Active wave: \`${state.activeWave}\`
- Paused: \`${state.paused ? 'yes' : 'no'}\`

## Guardrails

${state.guardrails.map((item) => `- ${item}`).join('\n')}

## Write Scope

${state.writeScope.groups.length > 0
    ? state.writeScope.groups.map((group) => `- \`${group.worker}\` -> ${group.paths.join(', ')}`).join('\n')
    : '- `Read-only orchestration or main-only flow`'}

## Recommendation

- \`${summarizeState(state).route.recommendation}\`
`;
}

function renderWavesMarkdown(state) {
  const waveMap = new Map();
  for (const wave of state.waves || []) {
    waveMap.set(wave.wave, wave);
  }

  const lines = [
    '# ORCHESTRATION WAVES',
    '',
    `- Workflow root: \`${state.workflowRootRelative}\``,
    `- Active wave: \`${state.activeWave}\``,
    '',
  ];

  const waveNumbers = [...new Set(state.tasks.map((task) => task.wave))].sort((a, b) => a - b);
  for (const waveNumber of waveNumbers) {
    const tasks = state.tasks.filter((task) => task.wave === waveNumber);
    const wave = waveMap.get(waveNumber);
    lines.push(`## Wave ${waveNumber}`);
    lines.push('');
    if (wave?.rationale) {
      lines.push(`- Rationale: \`${wave.rationale}\``);
    }
    for (const task of tasks) {
      lines.push(`- \`${task.id}\` -> role=\`${task.role}\`, status=\`${task.status}\`, scope=\`${task.writeScope.length > 0 ? task.writeScope.join(', ') : 'read-only'}\``);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderResultsMarkdown(state) {
  const completed = state.tasks.filter((task) => task.summary || task.details || task.evidence.length > 0);
  const lines = [
    '# ORCHESTRATION RESULTS',
    '',
    `- Workflow root: \`${state.workflowRootRelative}\``,
    `- Runtime status: \`${summarizeState(state).status}\``,
    '',
  ];

  if (completed.length === 0) {
    lines.push('- `No task results recorded yet`');
    lines.push('');
    return `${lines.join('\n').trimEnd()}\n`;
  }

  for (const task of completed) {
    lines.push(`## ${task.id}`);
    lines.push('');
    lines.push(`- Role: \`${task.role}\``);
    lines.push(`- Status: \`${task.resultStatus || task.status}\``);
    lines.push(`- Summary: \`${task.summary || 'No summary'}\``);
    if (task.evidence.length > 0) {
      lines.push(`- Evidence: \`${task.evidence.join(' | ')}\``);
    }
    if (task.next) {
      lines.push(`- Next: \`${task.next}\``);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderRuntimeMarkdown(state) {
  const summary = summarizeState(state);
  const lines = [
    '# ORCHESTRATION STATUS',
    '',
    `- Workflow root: \`${state.workflowRootRelative}\``,
    `- Milestone: \`${state.milestone}\``,
    `- Step: \`${state.step}\``,
    `- Intent: \`${state.intent}\``,
    `- Active wave: \`${state.activeWave}\``,
    `- Runtime status: \`${summary.status}\``,
    `- Paused: \`${state.paused ? 'yes' : 'no'}\``,
    `- Next route: \`${summary.route.action}\``,
    `- Recommendation: \`${summary.route.recommendation}\``,
    '',
    '## Counts',
    '',
    `- \`queued=${summary.counts.queued}\``,
    `- \`ready=${summary.counts.ready}\``,
    `- \`in_progress=${summary.counts.inProgress}\``,
    `- \`completed=${summary.counts.completed}\``,
    `- \`blocked=${summary.counts.blocked}\``,
    `- \`skipped=${summary.counts.skipped}\``,
    '',
    '## Tasks',
    '',
  ];

  for (const task of state.tasks) {
    lines.push(`- \`${task.id}\` -> status=\`${task.status}\`, wave=\`${task.wave}\`, role=\`${task.role}\``);
  }
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function persistRuntimeState(state) {
  const runtime = orchestrationPaths(state.repoRoot);
  ensureDir(runtime.orchestrationDir);
  ensureDir(runtime.packetsDir);
  ensureDir(runtime.resultsDir);
  state.updatedAt = new Date().toISOString();
  const summary = summarizeState(state);
  state.runtime = {
    counts: summary.counts,
    route: summary.route,
    status: summary.status,
  };

  for (const task of state.tasks) {
    const packetPath = path.join(runtime.packetsDir, `${task.id}.md`);
    const resultPath = path.join(runtime.resultsDir, `${task.id}.md`);
    write(packetPath, renderTaskPacket(state, task));
    if (task.summary || task.details || task.evidence.length > 0) {
      write(resultPath, renderTaskResult(task));
    }
    task.packetFile = packetPath;
    task.resultFile = resultPath;
  }

  write(runtime.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  write(runtime.planFile, renderCanonicalPlanMarkdown(state));
  write(runtime.statusFile, renderRuntimeMarkdown(state));
  write(runtime.wavesFile, renderWavesMarkdown(state));
  write(runtime.resultsFile, renderResultsMarkdown(state));
  state.files = {
    state: runtime.stateFile,
    plan: runtime.planFile,
    status: runtime.statusFile,
    waves: runtime.wavesFile,
    results: runtime.resultsFile,
    packetsDir: runtime.packetsDir,
    resultsDir: runtime.resultsDir,
  };
  return state;
}

function startOrchestration(plan) {
  if (!plan.teamLite.active) {
    throw new Error('Team Lite is not active. Use explicit user language or --parallel before starting orchestration.');
  }
  if (plan.blockers.length > 0) {
    throw new Error(`Cannot start orchestration while blockers exist: ${plan.blockers.join(' | ')}`);
  }

  const state = {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repoRoot: plan.repoRoot,
    workflowRoot: plan.workflowRoot,
    workflowRootRelative: plan.workflowRootRelative,
    milestone: plan.milestone,
    step: plan.step,
    intent: plan.intent,
    goal: plan.goal,
    planHash: plan.planHash,
    activeWave: 1,
    waves: plan.waves,
    teamLite: plan.teamLite,
    activationSignals: plan.activationSignals,
    guardrails: plan.guardrails,
    codebaseMap: plan.codebaseMap,
    writeScope: plan.writeScope,
    paused: false,
    pausedAt: null,
    pauseSummary: '',
    tasks: buildTasksFromPlan(plan),
  };

  return persistRuntimeState(state);
}

function loadRuntimeState(cwd) {
  const runtime = orchestrationPaths(cwd);
  if (!fs.existsSync(runtime.stateFile)) {
    throw new Error('No orchestration runtime exists yet. Run raiola:delegation-plan -- --start first.');
  }
  const state = JSON.parse(fs.readFileSync(runtime.stateFile, 'utf8'));
  state.files = {
    state: runtime.stateFile,
    plan: runtime.planFile,
    status: runtime.statusFile,
    waves: runtime.wavesFile,
    results: runtime.resultsFile,
    packetsDir: runtime.packetsDir,
    resultsDir: runtime.resultsDir,
  };
  return state;
}

function resolveTask(state, options = {}) {
  if (options.taskId) {
    const task = state.tasks.find((item) => item.id === options.taskId);
    if (!task) {
      throw new Error(`Task not found: ${options.taskId}`);
    }
    return task;
  }

  if (options.role) {
    const candidates = state.tasks.filter((item) => item.role === options.role && ACTIVE_STATUSES.has(item.status));
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      throw new Error(`Role ${options.role} has multiple active tasks. Use --task-id instead.`);
    }
    const queuedCandidate = state.tasks.find((item) => item.role === options.role && item.status === 'queued');
    if (queuedCandidate) {
      return queuedCandidate;
    }
    throw new Error(`Role not found or not active: ${options.role}`);
  }

  throw new Error('A task identifier is required.');
}

function markTaskStarted(state, options = {}) {
  if (state.paused) {
    throw new Error('Cannot start a task while orchestration is paused. Resume it first.');
  }
  const task = resolveTask(state, options);
  if (!['ready', 'queued'].includes(task.status)) {
    throw new Error(`Task ${task.id} cannot start from status ${task.status}`);
  }
  if (task.wave !== state.activeWave) {
    throw new Error(`Task ${task.id} belongs to wave ${task.wave}, but active wave is ${state.activeWave}`);
  }
  task.status = 'in_progress';
  task.startedAt = new Date().toISOString();
  return persistRuntimeState(state);
}

function markTaskCompleted(state, options = {}) {
  if (state.paused) {
    throw new Error('Cannot complete a task while orchestration is paused. Resume it first.');
  }
  const task = resolveTask(state, options);
  const resultStatus = String(options.resultStatus || 'completed').trim();
  if (!['completed', 'blocked', 'failed', 'skipped'].includes(resultStatus)) {
    throw new Error(`Unsupported result status: ${resultStatus}`);
  }
  if (!options.summary) {
    throw new Error('--summary is required when completing a task');
  }

  task.status = resultStatus;
  task.resultStatus = resultStatus;
  task.summary = options.summary;
  task.details = options.details || '';
  task.evidence = options.evidence || [];
  task.next = options.next || '';
  if (!task.startedAt) {
    task.startedAt = new Date().toISOString();
  }
  task.completedAt = new Date().toISOString();
  return persistRuntimeState(state);
}

function advanceWave(state) {
  if (state.paused) {
    throw new Error('Cannot advance a paused orchestration runtime. Resume it first.');
  }
  const summary = summarizeState(state);
  if (!summary.route.canAdvance) {
    throw new Error(`Current runtime cannot advance: ${summary.route.recommendation}`);
  }
  const nextWave = summary.route.nextWave;
  for (const task of state.tasks) {
    if (task.wave === nextWave && task.status === 'queued') {
      task.status = 'ready';
    }
  }
  state.activeWave = nextWave;
  return persistRuntimeState(state);
}

function stopOrchestration(state, summary) {
  state.paused = true;
  state.pausedAt = new Date().toISOString();
  state.pauseSummary = summary || 'Orchestration paused by operator request.';
  return persistRuntimeState(state);
}

function resumeOrchestration(state) {
  state.paused = false;
  state.pauseSummary = '';
  state.resumedAt = new Date().toISOString();
  return persistRuntimeState(state);
}

module.exports = {
  advanceWave,
  buildTasksFromPlan,
  computeRoute,
  loadRuntimeState,
  markTaskCompleted,
  markTaskStarted,
  orchestrationPaths,
  persistRuntimeState,
  relativePath,
  renderCanonicalPlanMarkdown,
  renderPlanMarkdown,
  renderResultsMarkdown,
  renderRuntimeMarkdown,
  renderTaskPacket,
  renderTaskResult,
  renderWavesMarkdown,
  resolveTask,
  resumeOrchestration,
  startOrchestration,
  stopOrchestration,
  summarizeState,
};
