const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const delegation = require('./delegation_plan');
const { appendJsonl, readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

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

Options:
  --root <path>                 Workflow root. Defaults to active workstream root
  --adapter <plan-only|worktree>
                                Runtime adapter. Defaults to plan-only
  --activation-text <text>      Raw parallel activation text
  --goal <text>                 Optional goal text
  --parallel                    Explicit parallel activation
  --write-scope <a,b;c>         Worker scopes
  --json                        Print machine-readable output
  `);
}

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'runtime');
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

function patchDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'patches');
}

function writeRuntimeState(cwd, payload) {
  fs.mkdirSync(runtimeDir(cwd), { recursive: true });
  fs.writeFileSync(runtimeStatePath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
}

function readRuntimeState(cwd) {
  if (!fs.existsSync(runtimeStatePath(cwd))) {
    return null;
  }
  return JSON.parse(fs.readFileSync(runtimeStatePath(cwd), 'utf8'));
}

function ensureAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown team adapter: ${name}`);
  }
  return adapter;
}

function buildRuntimeEnvelope(cwd, orchestrationState, adapterName) {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    adapter: adapterName,
    policy: 'standard',
    status: 'prepared',
    orchestrationStateFile: path.relative(cwd, delegation.orchestrationPaths(cwd).stateFile).replace(/\\/g, '/'),
    dispatchedTasks: [],
    collectedTasks: [],
    collectedResults: {},
    workspaces: {},
    mailboxFile: path.relative(cwd, mailboxPath(cwd)).replace(/\\/g, '/'),
    timelineFile: path.relative(cwd, timelinePath(cwd)).replace(/\\/g, '/'),
  };
}

function writeTimelineEvent(cwd, event, payload = {}) {
  appendJsonl(timelinePath(cwd), {
    generatedAt: new Date().toISOString(),
    event,
    ...payload,
  });
}

function writeMailboxEvent(cwd, kind, payload = {}) {
  appendJsonl(mailboxPath(cwd), {
    generatedAt: new Date().toISOString(),
    kind,
    ...payload,
  });
}

function createPatchBundle(cwd, workspace, taskId) {
  ensurePatchDir(cwd);
  const patchPath = path.join(patchDir(cwd), `${taskId}.patch`);
  let patch = '';
  if (workspace.mode === 'git-worktree') {
    const result = childProcess.spawnSync('git', ['diff', '--relative'], {
      cwd: workspace.path,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    patch = result.stdout || '';
  }
  if (!patch.trim()) {
    patch = `# PATCH BUNDLE PLACEHOLDER\n# task=${taskId}\n# mode=${workspace.mode}\n`;
  }
  fs.mkdirSync(path.dirname(patchPath), { recursive: true });
  fs.writeFileSync(patchPath, patch);
  return path.relative(cwd, patchPath).replace(/\\/g, '/');
}

function ensurePatchDir(cwd) {
  fs.mkdirSync(patchDir(cwd), { recursive: true });
}

function startRuntime(cwd, rootDir, args) {
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
  runtimeState = adapter.prepare(orchestrationState, runtimeState);
  runtimeState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, runtimeState);
  writeTimelineEvent(cwd, 'runtime_started', {
    adapter: adapterName,
    policy: runtimeState.policy,
  });
  return {
    adapter: adapterName,
    runtimeState,
    orchestrationState,
  };
}

function dispatchRuntime(cwd) {
  let orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }

  const adapter = ensureAdapter(runtimeState.adapter);
  for (const task of orchestrationState.tasks.filter((item) => item.wave === orchestrationState.activeWave && item.status === 'ready')) {
    orchestrationState = delegation.markTaskStarted(orchestrationState, { taskId: task.id });
  }
  runtimeState = adapter.dispatch(orchestrationState, runtimeState);
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

function monitorRuntime(cwd) {
  const orchestrationState = delegation.loadRuntimeState(cwd);
  const runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }
  const adapter = ensureAdapter(runtimeState.adapter);
  const polledState = adapter.poll(orchestrationState, runtimeState);
  polledState.updatedAt = new Date().toISOString();
  writeRuntimeState(cwd, polledState);
  writeTimelineEvent(cwd, 'runtime_polled', {
    adapter: polledState.adapter,
    workspaceCount: Object.keys(polledState.workspaces || {}).length,
  });
  return {
    runtimeState: polledState,
    orchestrationState,
  };
}

function collectRuntime(cwd) {
  let orchestrationState = delegation.loadRuntimeState(cwd);
  let runtimeState = readRuntimeState(cwd);
  if (!runtimeState) {
    throw new Error('No team runtime exists yet. Run `cwf team run` first.');
  }
  const adapter = ensureAdapter(runtimeState.adapter);
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
      const patchFile = createPatchBundle(cwd, runtimeState.workspaces[taskId], taskId);
      writeMailboxEvent(cwd, 'task_collected', {
        taskId,
        summary: result.summary,
        patchFile,
      });
    }
  }

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
  const lines = fs.existsSync(mailboxPath(cwd))
    ? fs.readFileSync(mailboxPath(cwd), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return {
    mailboxFile: relativePath(cwd, mailboxPath(cwd)),
    entries: lines.slice(-20),
  };
}

function listTimeline(cwd) {
  const lines = fs.existsSync(timelinePath(cwd))
    ? fs.readFileSync(timelinePath(cwd), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return {
    timelineFile: relativePath(cwd, timelinePath(cwd)),
    entries: lines.slice(-50),
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

function renderSummary(cwd, runtimeState, orchestrationState) {
  return {
    adapter: runtimeState.adapter,
    status: runtimeState.status,
    policy: runtimeState.policy,
    activeWave: orchestrationState.activeWave,
    route: orchestrationState.runtime?.route || null,
    counts: orchestrationState.runtime?.counts || null,
    dispatchedTasks: runtimeState.dispatchedTasks || [],
    collectedTasks: runtimeState.collectedTasks || [],
    workspaces: Object.fromEntries(
      Object.entries(runtimeState.workspaces || {}).map(([taskId, workspace]) => [
        taskId,
        {
          path: path.relative(cwd, workspace.path).replace(/\\/g, '/'),
          mode: workspace.mode,
          exists: workspace.exists,
          hasResult: workspace.hasResult,
        },
      ]),
    ),
    runtimeFile: path.relative(cwd, runtimeStatePath(cwd)).replace(/\\/g, '/'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'monitor';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  let result;

  if (action === 'run') {
    result = startRuntime(cwd, rootDir, args);
  } else if (action === 'dispatch') {
    result = dispatchRuntime(cwd);
  } else if (action === 'monitor') {
    result = monitorRuntime(cwd);
  } else if (action === 'collect') {
    result = collectRuntime(cwd);
  } else if (action === 'mailbox') {
    const payload = listMailbox(cwd);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# TEAM MAILBOX\n');
    console.log(`- File: \`${payload.mailboxFile}\``);
    for (const entry of payload.entries) {
      console.log(`- \`${entry.kind}\` -> ${entry.summary || entry.note || entry.taskId || ''}`);
    }
    return;
  } else if (action === 'timeline') {
    const payload = listTimeline(cwd);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# TEAM TIMELINE\n');
    console.log(`- File: \`${payload.timelineFile}\``);
    for (const entry of payload.entries) {
      console.log(`- \`${entry.event}\``);
    }
    return;
  } else if (action === 'steer') {
    const payload = steerRuntime(cwd, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# TEAM STEER\n');
    console.log(`- Note: \`${payload.note}\``);
    return;
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
  console.log(`- Status: \`${summary.status}\``);
  console.log(`- Active wave: \`${summary.activeWave}\``);
  console.log(`- Runtime file: \`${summary.runtimeFile}\``);
  console.log(`- Dispatched tasks: \`${summary.dispatchedTasks.length}\``);
  console.log(`- Collected tasks: \`${summary.collectedTasks.length}\``);
  if (Object.keys(summary.workspaces).length > 0) {
    console.log('\n## Workspaces\n');
    for (const [taskId, workspace] of Object.entries(summary.workspaces)) {
      console.log(`- \`${taskId}\` -> path=\`${workspace.path}\`, mode=\`${workspace.mode}\`, exists=\`${workspace.exists ? 'yes' : 'no'}\`, result=\`${workspace.hasResult ? 'yes' : 'no'}\``);
    }
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
  collectRuntime,
  dispatchRuntime,
  monitorRuntime,
  startRuntime,
};
