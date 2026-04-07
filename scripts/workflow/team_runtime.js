const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const {
  listMailbox,
  listTimeline,
  printConflicts,
  printMailbox,
  printMergeQueue,
  printPrFeedback,
  printQuality,
  printTimeline,
  renderSummary,
} = require('./team_runtime_state');
const {
  collectRuntime,
  conflictsRuntime,
  dispatchRuntime,
  mergeQueueRuntime,
  monitorRuntime,
  prFeedbackRuntime,
  qualityRuntime,
  startRuntime,
  steerRuntime,
} = require('./team_runtime_core');
const { superviseRuntime } = require('./team_runtime_supervisor');

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
  if ((summary.guardrails?.orphanTaskRefsRemoved || 0) > 0) {
    console.log(`- Guardrails: pruned=\`${summary.guardrails.orphanTaskRefsRemoved}\` collections=\`${(summary.guardrails.affectedCollections || []).join(', ') || 'none'}\``);
  }
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
  startRuntime,
  superviseRuntime,
};
