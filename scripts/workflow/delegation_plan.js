const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  ensureDir,
  fileCoveredByStagePath,
  getFieldValue,
  hashString,
  loadPreferences,
  normalizeStagePath,
  parseArgs,
  parseMilestoneTable,
  read,
  resolveWorkflowRoot,
  toList,
  workflowPaths,
  write,
} = require('./common');
const { buildCodebaseMap } = require('./map_codebase');

const ROLE_CATALOG = ['main', 'explorer', 'planner', 'checker', 'worker', 'verifier', 'debugger'];
const COMPLETED_STATUSES = new Set(['completed', 'skipped']);
const ACTIVE_STATUSES = new Set(['ready', 'in_progress']);
const PARALLEL_PATTERNS = [
  /parallel yap/i,
  /paralel yap/i,
  /\bparallel(?:ize)?\b/i,
  /subagent kullan/i,
  /\bsubagents?\b/i,
  /\bdelegate et\b/i,
  /\bdelegat(?:e|ion)\b/i,
  /\bteam mode\b/i,
  /\bteam lite\b/i,
];

function printHelp() {
  console.log(`
delegation_plan

Usage:
  node scripts/workflow/delegation_plan.js

Plan:
  node scripts/workflow/delegation_plan.js [--intent auto] [--goal "..."] [--activation-text "..."]

Orchestration runtime:
  node scripts/workflow/delegation_plan.js --start
  node scripts/workflow/delegation_plan.js --status
  node scripts/workflow/delegation_plan.js --resume-runtime
  node scripts/workflow/delegation_plan.js --stop --summary "Pause here"
  node scripts/workflow/delegation_plan.js --start-task <task-id>
  node scripts/workflow/delegation_plan.js --complete-task <task-id> --summary "..."
  node scripts/workflow/delegation_plan.js --advance
  node scripts/workflow/delegation_plan.js --task-packet <task-id>

Options:
  --root <path>                 Workflow root. Defaults to active workstream root
  --intent <auto|discuss|research|plan|execute|audit|complete>
                                Delegation intent. Defaults to auto from the active step
  --goal <text>                 Optional goal text used for routing hints
  --activation-text <text>      Raw user phrasing used for natural-language parallel activation
  --parallel                    Explicitly activate Team Lite parallel planning
  --write-scope <a,b;c>         Semicolon-separated worker groups with comma-separated paths
  --status                      Print orchestration runtime status instead of a fresh plan
  --start                       Start an orchestration runtime from the current delegation plan
  --resume-runtime              Resume a paused orchestration runtime
  --stop                        Pause the active orchestration runtime
  --start-task <task-id>        Mark a ready task as in_progress
  --start-role <role>           Mark the active task for a role as in_progress
  --complete-task <task-id>     Complete or block a task
  --complete-role <role>        Complete or block the active task for a role
  --summary <text>              Required for task completion
  --details <text>              Optional longer task result details
  --result-status <completed|blocked|failed|skipped>
                                Defaults to completed
  --evidence <a|b|c>            Pipe-separated evidence refs or notes for the task result
  --next <text>                 Optional next action note from the task owner
  --advance                     Move from a completed wave to the next queued wave
  --task-packet <task-id>       Print the packet markdown for a task
  --json                        Print machine-readable JSON
  --compact                     Print compact summary output
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function parseWriteScope(value, cwd) {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value) ? value.join(';') : String(value);
  return raw
    .split(';')
    .map((group, index) => ({
      worker: `worker-${index + 1}`,
      paths: group.split(',').map((item) => item.trim()).filter(Boolean).map((item) => normalizeStagePath(cwd, item)),
    }))
    .filter((group) => group.paths.length > 0);
}

function groupsOverlap(groups) {
  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
      for (const leftPath of groups[leftIndex].paths) {
        for (const rightPath of groups[rightIndex].paths) {
          if (fileCoveredByStagePath(leftPath, rightPath) || fileCoveredByStagePath(rightPath, leftPath)) {
            return {
              overlap: true,
              left: groups[leftIndex].worker,
              right: groups[rightIndex].worker,
              paths: [leftPath, rightPath],
            };
          }
        }
      }
    }
  }

  return { overlap: false };
}

function inferIntent(step, goal, requestedIntent) {
  if (requestedIntent && requestedIntent !== 'auto') {
    return requestedIntent;
  }

  const normalizedGoal = String(goal || '').toLowerCase();
  if (/(investigate|research|explore|map)/.test(normalizedGoal)) {
    return 'research';
  }
  if (/(plan|design|shape|strategy)/.test(normalizedGoal)) {
    return 'plan';
  }
  if (/(debug|incident|failure|broken|audit|review|verify)/.test(normalizedGoal)) {
    return step === 'audit' ? 'audit' : 'research';
  }
  if (/(build|implement|execute|ship|code|fix)/.test(normalizedGoal)) {
    return 'execute';
  }

  return step;
}

function activeMilestoneGoal(paths) {
  const milestoneTable = parseMilestoneTable(read(paths.milestones));
  const activeRow = milestoneTable.rows.find((row) => row.status === 'active');
  return activeRow?.goal || '';
}

function detectParallelIntent(texts) {
  const normalizedTexts = texts
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const hits = [];

  for (const text of normalizedTexts) {
    for (const pattern of PARALLEL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        hits.push({
          phrase: match[0],
          source: text,
        });
      }
    }
  }

  return {
    active: hits.length > 0,
    hits,
  };
}

function assignRole(roleCatalog, role, attributes) {
  roleCatalog[role] = {
    role,
    status: 'assigned',
    ...attributes,
  };
}

function idleRole(roleCatalog, role, note) {
  roleCatalog[role] = {
    role,
    status: 'idle',
    note,
  };
}

function baseRoleCatalog() {
  return Object.fromEntries(ROLE_CATALOG.map((role) => [role, { role, status: 'idle', note: 'Not assigned for this intent' }]));
}

function createWaveRole(role, task, extras = {}) {
  return {
    role,
    status: 'assigned',
    task,
    ...extras,
  };
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

function buildDelegationPlan(cwd, rootDir, options = {}) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);
  const preferences = loadPreferences(paths);
  const statusDoc = read(paths.status);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(statusDoc, 'Current milestone step') || 'unknown').trim();
  const activeGoal = activeMilestoneGoal(paths);
  const activationSignals = detectParallelIntent([
    options.activationText,
    options.goal,
    activeGoal,
    milestone,
  ]);
  const explicitParallel = Boolean(options.parallel) || activationSignals.active;
  const teamLitePolicy = preferences.teamLiteDelegation;
  const teamLiteActive = explicitParallel;
  const intent = inferIntent(step, options.goal || activeGoal, options.intent);
  const writeScopeGroups = parseWriteScope(options.writeScope, cwd);
  const overlap = groupsOverlap(writeScopeGroups);
  const codebaseMap = buildCodebaseMap(cwd, rootDir, {
    refreshMode: 'incremental',
    scopeKind: 'workstream',
    writeFiles: false,
  });
  const roleCatalog = baseRoleCatalog();
  const waves = [];
  const guardrails = [
    'Team Lite activates only with explicit user intent or explicit parallel mode.',
    'The orchestrator stays thin: it decomposes, waits selectively, integrates, and chooses the next route.',
    'Planner and checker roles are read-only by default.',
    'Main owns integration, routing, and final workflow doc updates.',
  ];
  const blockers = [];

  if (!explicitParallel && teamLitePolicy === 'suggest' && ['research', 'plan', 'execute', 'audit'].includes(intent)) {
    blockers.push('Parallel mode is not active; user language or --parallel must explicitly request Team Lite.');
  }
  if (!explicitParallel && teamLitePolicy === 'off') {
    blockers.push('Repository preference keeps Team Lite off unless explicit user language or --parallel overrides it.');
  }
  if (intent === 'execute') {
    guardrails.push('Write-capable worker fan-out is allowed only when write scopes are explicit and disjoint.');
    if (explicitParallel && writeScopeGroups.length === 0) {
      blockers.push('Parallel execute routing needs --write-scope so every worker has an explicit write contract.');
    }
    if (explicitParallel && overlap.overlap) {
      blockers.push(`Worker scopes overlap between ${overlap.left} and ${overlap.right} (${overlap.paths.join(' vs ')})`);
    }
  }
  if (intent === 'research') {
    guardrails.push('Research fan-out stays lane-bounded and read-only.');
  }
  if (intent === 'audit') {
    guardrails.push('Audit fan-out stays read-only unless remediation is explicitly re-routed into execute.');
  }

  if (intent === 'research' && teamLiteActive) {
    assignRole(roleCatalog, 'main', {
      wave: 1,
      mode: 'owner',
      task: 'Frame the research question set, wait for lane results, and synthesize findings into workflow docs.',
      writeScope: [relativePath(cwd, paths.context), relativePath(cwd, paths.validation)],
    });
    assignRole(roleCatalog, 'explorer', {
      wave: 1,
      mode: 'parallel-read-only',
      task: 'Split research into stack, architecture, quality, and risks lanes.',
      lanes: ['stack', 'architecture', 'quality', 'risks'],
      writeScope: [],
    });
    idleRole(roleCatalog, 'planner', 'Planning remains with main until research lands.');
    idleRole(roleCatalog, 'checker', 'Optional after synthesis, but not required for the initial research wave.');
    idleRole(roleCatalog, 'worker', 'Workers do not write during research.');
    idleRole(roleCatalog, 'verifier', 'Verifier is more useful in audit.');
    idleRole(roleCatalog, 'debugger', 'Debugger is reserved for failing checks or incident work.');
    waves.push({
      wave: 1,
      rationale: 'All research lanes are dependency-free and read-only.',
      roles: [
        roleCatalog.main,
        createWaveRole('explorer-stack', 'Map package manager, frameworks, and tooling signals.', { mode: 'read-only', writeScope: [] }),
        createWaveRole('explorer-architecture', 'Map repository shape, roots, and workstream surfaces.', { mode: 'read-only', writeScope: [] }),
        createWaveRole('explorer-quality', 'Map test, CI, lint, and golden coverage surfaces.', { mode: 'read-only', writeScope: [] }),
        createWaveRole('explorer-risks', 'Map structural risks, lockfile drift, and verification blind spots.', { mode: 'read-only', writeScope: [] }),
      ],
    });
    waves.push({
      wave: 2,
      rationale: 'Main integrates read-only findings and decides whether the next route is plan or more research.',
      roles: [
        createWaveRole('main', 'Consolidate explorer findings into CONTEXT.md and VALIDATION.md.', {
          mode: 'integration',
          writeScope: [relativePath(cwd, paths.context), relativePath(cwd, paths.validation)],
        }),
      ],
    });
  } else if (intent === 'plan' && teamLiteActive) {
    assignRole(roleCatalog, 'main', {
      wave: 1,
      mode: 'owner',
      task: 'Own the plan of record and integration decisions.',
      writeScope: [relativePath(cwd, paths.execplan)],
    });
    assignRole(roleCatalog, 'planner', {
      wave: 1,
      mode: 'read-only',
      task: 'Pressure-test plan sequencing, chunking, and rollback assumptions.',
      writeScope: [],
    });
    assignRole(roleCatalog, 'checker', {
      wave: 1,
      mode: 'read-only',
      task: 'Check dependency boundaries, route risk, and predictability before execution.',
      writeScope: [],
    });
    idleRole(roleCatalog, 'explorer', 'Explorers are less useful once the repo is already mapped.');
    idleRole(roleCatalog, 'worker', 'Workers should wait until plan output defines disjoint write scopes.');
    idleRole(roleCatalog, 'verifier', 'Verifier is primarily an audit role.');
    idleRole(roleCatalog, 'debugger', 'Debugger is not needed unless plan work is incident-driven.');
    waves.push({
      wave: 1,
      rationale: 'Plan work stays on main; planner and checker stay read-only.',
      roles: [roleCatalog.main, roleCatalog.planner, roleCatalog.checker],
    });
  } else if (intent === 'execute' && teamLiteActive && blockers.length === 0) {
    assignRole(roleCatalog, 'main', {
      wave: 1,
      mode: 'orchestrator',
      task: 'Own integration order, conflict checks, and the next route after child work completes.',
      writeScope: [relativePath(cwd, paths.execplan), relativePath(cwd, paths.status)],
    });
    assignRole(roleCatalog, 'worker', {
      wave: 1,
      mode: 'parallel-write',
      task: 'Implement disjoint write scopes with explicit ownership.',
      writeScope: writeScopeGroups,
    });
    assignRole(roleCatalog, 'checker', {
      wave: 2,
      mode: 'read-only',
      task: 'Review merged changes for cross-scope regressions before audit.',
      writeScope: [],
    });
    idleRole(roleCatalog, 'explorer', 'Explorers are not needed once execution is already scoped.');
    idleRole(roleCatalog, 'planner', 'Planner should not rewrite the plan mid-execution.');
    idleRole(roleCatalog, 'verifier', 'Verifier becomes active in audit.');
    idleRole(roleCatalog, 'debugger', 'Debugger activates only when execution hits failures.');
    waves.push({
      wave: 1,
      rationale: 'Worker groups are disjoint, so they can run in parallel.',
      roles: [
        roleCatalog.main,
        ...writeScopeGroups.map((group) => createWaveRole(group.worker, `Own write scope: ${group.paths.join(', ')}`, {
          mode: 'write-owner',
          writeScope: group.paths,
        })),
      ],
    });
    waves.push({
      wave: 2,
      rationale: 'Main integrates child output, then checker verifies the merged result before audit.',
      roles: [
        createWaveRole('main', 'Integrate worker output, reconcile conflicts, and route the next step.', {
          mode: 'integration',
          writeScope: [relativePath(cwd, paths.execplan), relativePath(cwd, paths.status)],
        }),
        roleCatalog.checker,
      ],
    });
  } else if (intent === 'audit' && teamLiteActive) {
    assignRole(roleCatalog, 'main', {
      wave: 1,
      mode: 'owner',
      task: 'Own audit closeout, residual risk decisions, and the next route.',
      writeScope: [relativePath(cwd, paths.validation), relativePath(cwd, paths.status)],
    });
    assignRole(roleCatalog, 'verifier', {
      wave: 1,
      mode: 'parallel-read-only',
      task: 'Run validation contract checks and capture evidence gaps.',
      writeScope: [],
    });
    assignRole(roleCatalog, 'checker', {
      wave: 1,
      mode: 'read-only',
      task: 'Check packet freshness, evidence coverage, and audit completeness.',
      writeScope: [],
    });
    assignRole(roleCatalog, 'debugger', {
      wave: 1,
      mode: 'parallel-read-only',
      task: 'Triage failing checks and isolate likely root causes when audit signals are red.',
      writeScope: [],
    });
    idleRole(roleCatalog, 'explorer', 'Explorers are redundant once the repo is already mapped.');
    idleRole(roleCatalog, 'planner', 'Planner is not required during audit closeout.');
    idleRole(roleCatalog, 'worker', 'Workers should not start new writes while audit is running.');
    waves.push({
      wave: 1,
      rationale: 'Audit fan-out stays read-only and returns to main for the final route.',
      roles: [
        roleCatalog.main,
        roleCatalog.verifier,
        roleCatalog.checker,
        roleCatalog.debugger,
      ],
    });
  } else {
    assignRole(roleCatalog, 'main', {
      wave: 1,
      mode: 'owner',
      task: 'Keep the current step on main and avoid unnecessary delegation.',
      writeScope: [relativePath(cwd, paths.context), relativePath(cwd, paths.execplan), relativePath(cwd, paths.validation)],
    });
    for (const role of ROLE_CATALOG.filter((item) => item !== 'main')) {
      idleRole(roleCatalog, role, 'Current intent does not justify parallel delegation yet.');
    }
    waves.push({
      wave: 1,
      rationale: 'Current intent stays on main because Team Lite is inactive or explicit safety inputs are missing.',
      roles: [roleCatalog.main],
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    planHash: hashString(JSON.stringify({
      root: rootDir,
      milestone,
      step,
      intent,
      teamLitePolicy,
      activationSignals,
      writeScopeGroups,
      waves,
    })),
    repoRoot: cwd,
    workflowRoot: rootDir,
    workflowRootRelative: relativePath(cwd, rootDir),
    milestone,
    step,
    intent,
    goal: options.goal || activeGoal || '',
    activationSignals,
    teamLite: {
      policy: teamLitePolicy,
      explicitParallelRequested: explicitParallel,
      active: teamLiteActive,
      activationReason: Boolean(options.parallel)
        ? 'explicit_parallel_flag'
        : activationSignals.active
          ? 'natural_language_trigger'
          : 'parallel_not_requested',
    },
    codebaseMap: {
      refreshStatus: codebaseMap.freshness.refreshStatus,
      fingerprint: codebaseMap.freshness.inputFingerprint,
      workflowRootRelative: codebaseMap.workflowRootRelative,
      surfaces: Object.fromEntries(Object.entries(codebaseMap.files.surfaces).map(([key, filePath]) => [key, relativePath(cwd, filePath)])),
    },
    writeScope: {
      groups: writeScopeGroups,
      disjoint: !overlap.overlap,
      overlap: overlap.overlap ? overlap : null,
    },
    waves,
    roleCatalog: ROLE_CATALOG.map((role) => roleCatalog[role]),
    guardrails,
    blockers,
    recommendation: blockers.length > 0
      ? 'Resolve blockers before activating Team Lite.'
      : teamLiteActive
        ? 'Delegation plan is safe to activate through the orchestration runtime.'
        : 'Keep work on main unless the user explicitly asks for parallel mode.',
  };

  const jsonFile = path.join(cwd, '.workflow', 'delegation-plan.json');
  const markdownFile = path.join(cwd, '.workflow', 'delegation-plan.md');
  ensureDir(path.dirname(jsonFile));
  write(jsonFile, `${JSON.stringify(plan, null, 2)}\n`);
  write(markdownFile, renderPlanMarkdown(plan));
  plan.files = {
    json: jsonFile,
    markdown: markdownFile,
    orchestration: orchestrationPaths(cwd).stateFile,
  };
  return plan;
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
        ? 'Integrate the research output into workflow docs and continue with workflow:next.'
        : state.intent === 'execute'
          ? 'Run the audit route next or return to workflow:next for the next routed step.'
          : 'Return to workflow:next to continue the milestone.',
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
  if (state.paused) {
    return {
      counts: {
        queued: state.tasks.filter((task) => task.status === 'queued').length,
        ready: state.tasks.filter((task) => task.status === 'ready').length,
        inProgress: state.tasks.filter((task) => task.status === 'in_progress').length,
        completed: state.tasks.filter((task) => task.status === 'completed').length,
        blocked: state.tasks.filter((task) => ['blocked', 'failed'].includes(task.status)).length,
        skipped: state.tasks.filter((task) => task.status === 'skipped').length,
      },
      route: {
        action: 'orchestration_paused',
        recommendation: state.pauseSummary || 'Resume the orchestration runtime before dispatching more work.',
        canAdvance: false,
      },
      status: 'paused',
    };
  }
  const counts = {
    queued: state.tasks.filter((task) => task.status === 'queued').length,
    ready: state.tasks.filter((task) => task.status === 'ready').length,
    inProgress: state.tasks.filter((task) => task.status === 'in_progress').length,
    completed: state.tasks.filter((task) => task.status === 'completed').length,
    blocked: state.tasks.filter((task) => ['blocked', 'failed'].includes(task.status)).length,
    skipped: state.tasks.filter((task) => task.status === 'skipped').length,
  };
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
    throw new Error('No orchestration runtime exists yet. Run workflow:delegation-plan -- --start first.');
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

function printCompactPlan(plan) {
  const waveCount = plan.waves.length;
  const assignedRoles = plan.roleCatalog.filter((role) => role.status === 'assigned').map((role) => role.role).join(',');
  console.log('# DELEGATION\n');
  console.log(`- root=\`${plan.workflowRootRelative}\` milestone=\`${plan.milestone}\` step=\`${plan.step}\` intent=\`${plan.intent}\``);
  console.log(`- team-lite=\`${plan.teamLite.active ? 'active' : 'inactive'}\` policy=\`${plan.teamLite.policy}\` waves=\`${waveCount}\` roles=\`${assignedRoles || 'main'}\``);
  console.log(`- blockers=\`${plan.blockers.length}\` write-scope=\`${plan.writeScope.groups.length}\` disjoint=\`${plan.writeScope.disjoint ? 'yes' : 'no'}\``);
  console.log(`- files=\`.workflow/delegation-plan.json .workflow/delegation-plan.md\``);
}

function printCompactRuntime(state) {
  const summary = summarizeState(state);
  console.log('# ORCHESTRATION\n');
  console.log(`- root=\`${state.workflowRootRelative}\` milestone=\`${state.milestone}\` intent=\`${state.intent}\` wave=\`${state.activeWave}\``);
  console.log(`- status=\`${summary.status}\` paused=\`${state.paused ? 'yes' : 'no'}\` route=\`${summary.route.action}\` ready=\`${summary.counts.ready}\` in_progress=\`${summary.counts.inProgress}\` completed=\`${summary.counts.completed}\` blocked=\`${summary.counts.blocked}\``);
  console.log(`- files=\`.workflow/orchestration/PLAN.md .workflow/orchestration/STATUS.md .workflow/orchestration/WAVES.md .workflow/orchestration/RESULTS.md\``);
}

function printRuntimeFiles(state) {
  console.log('## Files');
  console.log('');
  console.log(`- State: \`${relativePath(state.repoRoot, state.files.state)}\``);
  console.log(`- Plan: \`${relativePath(state.repoRoot, state.files.plan)}\``);
  console.log(`- Status: \`${relativePath(state.repoRoot, state.files.status)}\``);
  console.log(`- Waves: \`${relativePath(state.repoRoot, state.files.waves)}\``);
  console.log(`- Results: \`${relativePath(state.repoRoot, state.files.results)}\``);
  console.log(`- Packets dir: \`${relativePath(state.repoRoot, state.files.packetsDir)}\``);
  console.log(`- Results dir: \`${relativePath(state.repoRoot, state.files.resultsDir)}\``);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);

  if (args.start) {
    const plan = buildDelegationPlan(cwd, rootDir, {
      intent: String(args.intent || 'auto').trim(),
      goal: args.goal ? String(args.goal) : '',
      activationText: args['activation-text'] ? String(args['activation-text']) : '',
      parallel: Boolean(args.parallel),
      writeScope: args['write-scope'],
    });
    const state = startOrchestration(plan);
    if (args.json) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(state);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(state));
    printRuntimeFiles(state);
    return;
  }

  if (args.status) {
    const state = loadRuntimeState(cwd);
    if (args.json) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(state);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(state));
    printRuntimeFiles(state);
    return;
  }

  if (args['resume-runtime']) {
    const state = loadRuntimeState(cwd);
    const nextState = resumeOrchestration(state);
    if (args.json) {
      console.log(JSON.stringify(nextState, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(nextState);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(nextState));
    printRuntimeFiles(nextState);
    return;
  }

  if (args.stop) {
    const state = loadRuntimeState(cwd);
    const nextState = stopOrchestration(state, args.summary ? String(args.summary) : '');
    if (args.json) {
      console.log(JSON.stringify(nextState, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(nextState);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(nextState));
    printRuntimeFiles(nextState);
    return;
  }

  if (args['start-task'] || args['start-role']) {
    const state = loadRuntimeState(cwd);
    const nextState = markTaskStarted(state, {
      taskId: args['start-task'] ? String(args['start-task']) : '',
      role: args['start-role'] ? String(args['start-role']) : '',
    });
    if (args.json) {
      console.log(JSON.stringify(nextState, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(nextState);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(nextState));
    printRuntimeFiles(nextState);
    return;
  }

  if (args['complete-task'] || args['complete-role']) {
    const state = loadRuntimeState(cwd);
    const nextState = markTaskCompleted(state, {
      taskId: args['complete-task'] ? String(args['complete-task']) : '',
      role: args['complete-role'] ? String(args['complete-role']) : '',
      resultStatus: args['result-status'] ? String(args['result-status']) : 'completed',
      summary: args.summary ? String(args.summary) : '',
      details: args.details ? String(args.details) : '',
      evidence: toList(args.evidence),
      next: args.next ? String(args.next) : '',
    });
    if (args.json) {
      console.log(JSON.stringify(nextState, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(nextState);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(nextState));
    printRuntimeFiles(nextState);
    return;
  }

  if (args.advance) {
    const state = loadRuntimeState(cwd);
    const nextState = advanceWave(state);
    if (args.json) {
      console.log(JSON.stringify(nextState, null, 2));
      return;
    }
    if (args.compact) {
      printCompactRuntime(nextState);
      return;
    }
    process.stdout.write(renderRuntimeMarkdown(nextState));
    printRuntimeFiles(nextState);
    return;
  }

  if (args['task-packet']) {
    const state = loadRuntimeState(cwd);
    const task = resolveTask(state, { taskId: String(args['task-packet']) });
    process.stdout.write(renderTaskPacket(state, task));
    return;
  }

  const plan = buildDelegationPlan(cwd, rootDir, {
    intent: String(args.intent || 'auto').trim(),
    goal: args.goal ? String(args.goal) : '',
    activationText: args['activation-text'] ? String(args['activation-text']) : '',
    parallel: Boolean(args.parallel),
    writeScope: args['write-scope'],
  });

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (args.compact) {
    printCompactPlan(plan);
    return;
  }

  process.stdout.write(renderPlanMarkdown(plan));
  console.log('## Files');
  console.log('');
  console.log(`- JSON: \`${relativePath(plan.repoRoot, plan.files.json)}\``);
  console.log(`- Markdown: \`${relativePath(plan.repoRoot, plan.files.markdown)}\``);
  console.log(`- Orchestration state: \`${relativePath(plan.repoRoot, plan.files.orchestration)}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  ROLE_CATALOG,
  advanceWave,
  buildDelegationPlan,
  detectParallelIntent,
  loadRuntimeState,
  markTaskCompleted,
  markTaskStarted,
  orchestrationPaths,
  persistRuntimeState,
  renderPlanMarkdown,
  renderTaskPacket,
  resumeOrchestration,
  startOrchestration,
  stopOrchestration,
  summarizeState,
};
