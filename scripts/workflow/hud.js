const path = require('node:path');
const { readJsonIfExists } = require('./runtime_helpers');
const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const { collectRuntimeState } = require('./runtime_collector');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
hud

Usage:
  node scripts/workflow/hud.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --compact         Print compact summary output
  --intent          Include route/capability intent detail
  --cost            Include packet/token budget detail
  --risk            Include risk detail from doctor/health
  --watch           Refresh continuously
  --interval <sec>  Watch refresh interval. Defaults to 2 seconds
  --iterations <n>  Optional watch iteration cap for tests
  --json            Print machine-readable JSON
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function collectHudState(cwd, rootDir, options = {}) {
  const state = collectRuntimeState(cwd, rootDir, {
    updatedBy: 'hud',
    includeDoctor: Boolean(options.includeDoctor),
  }).state;
  const routeCache = readJsonIfExists(path.join(cwd, '.workflow', 'cache', 'model-routing.json'));
  const runtimeFile = writeRuntimeJson(cwd, 'hud.json', {
    ...state,
    route: routeCache?.lastRecommendation || null,
    runtimeFileRelative: '.workflow/runtime/hud.json',
  });

  return {
    ...state,
    route: routeCache?.lastRecommendation || null,
    runtimeFileRelative: relativePath(cwd, runtimeFile),
  };
}

function printCompact(state, options = {}) {
  const packetSummary = state.packets
    .map((packet) => `${packet.name}:${packet.hash.slice(0, 12)}${packet.drift ? '*' : ''}/${packet.budgetStatus}`)
    .join(' ');

  console.log(`# HUD\n`);
  console.log(`- root=\`${state.workflowRootRelative}\` workstream=\`${state.activeWorkstream.name}\` milestone=\`${state.workflow.milestone}\` step=\`${state.workflow.step}\` readiness=\`${state.workflow.readiness}\` plan=\`${state.workflow.planGate}\``);
  console.log(`- profile=\`${state.workflow.profile}\` automation=\`${state.workflow.automationMode}\` automation_status=\`${state.workflow.automationStatus}\``);
  if (state.frontend) {
    console.log(`- frontend=\`${state.frontend.status}\` framework=\`${state.frontend.framework}\` adapters=\`${(state.frontend.adapters || []).join(', ') || 'none'}\` visual_verdict=\`${state.frontend.visualVerdictRequired ? 'yes' : 'no'}\``);
  }
  console.log(`- health=\`${state.health.status}\` fail=\`${state.health.failCount}\` warn=\`${state.health.warnCount}\` window=\`${state.window.decision}\` remaining=\`${state.window.remainingBudget}\` handoff=\`${state.handoff.status}\` auto_window=\`${state.window.automationRecommendation}\``);
  console.log(`- packets=\`${packetSummary}\``);
  console.log(`- counts=\`carryforward:${state.counts.carryforward} seeds:${state.counts.seeds} recall:${state.counts.activeRecall}\``);
  console.log(`- next=\`${state.next.title}\` command=\`${state.next.command}\``);
  console.log(`- team=\`${state.orchestration?.status || 'idle'}\` verify_shell=\`${state.verifications?.shell?.latest?.verdict || 'none'}\` verify_browser=\`${state.verifications?.browser?.latest?.verdict || 'none'}\``);
  const extraTeamSignals = Boolean(
    state.orchestration?.supervisor
    || state.orchestration?.mergeQueue
    || state.orchestration?.conflicts
    || state.orchestration?.prFeedback
    || state.orchestration?.reviewLoop
  ) && (
    state.orchestration?.status !== 'idle'
    || (state.orchestration?.supervisor?.cycleCount || 0) > 0
    || (state.orchestration?.mergeQueue?.queueLength || 0) > 0
    || (state.orchestration?.conflicts?.blockerCount || 0) > 0
    || (state.orchestration?.conflicts?.warnCount || 0) > 0
    || (state.orchestration?.prFeedback?.openCount || 0) > 0
    || (state.orchestration?.reviewLoop?.findingsCount || 0) > 0
  );
  if (extraTeamSignals) {
    console.log(`- team_runtime=\`supervisor:${state.orchestration?.supervisor?.status || 'idle'} merge_next:${state.orchestration?.mergeQueue?.nextTaskId || 'none'} blockers:${state.orchestration?.conflicts?.blockerCount || 0} feedback:${state.orchestration?.prFeedback?.openCount || 0} review:${state.orchestration?.reviewLoop?.verdict || 'noop'}\``);
  }
  if (options.showIntent && state.route) {
    console.log(`- intent=\`${state.route.recommendedCapability}\` preset=\`${state.route.recommendedPreset}\` confidence=\`${state.route.confidence}\``);
  }
  if (options.showCost) {
    console.log(`- cost=\`tokens:${state.window.estimatedTokens} budget:${state.window.budgetStatus}\``);
  }
  if (options.showRisk) {
    console.log(`- risk=\`health:${state.health.status}${state.doctor?.risk ? ` doctor:${state.doctor.risk.level}/${state.doctor.risk.score}` : ''}\``);
  }
  console.log(`- state=\`${state.stateFileRelative}\``);
}

function printStandard(state, options = {}) {
  console.log(`# WORKFLOW HUD\n`);
  console.log(`- Root: \`${state.workflowRootRelative}\``);
  console.log(`- Workstream: \`${state.activeWorkstream.name}\``);
  console.log(`- Phase: \`${state.workflow.phase}\``);
  console.log(`- Milestone: \`${state.workflow.milestone}\``);
  console.log(`- Step: \`${state.workflow.step}\``);
  console.log(`- Readiness: \`${state.workflow.readiness}\``);
  console.log(`- Plan gate: \`${state.workflow.planGate}\``);
  console.log(`- Workflow profile: \`${state.workflow.profile}\``);
  console.log(`- Automation: \`${state.workflow.automationMode}\` (\`${state.workflow.automationStatus}\`)`);
  if (state.frontend) {
    console.log(`- Frontend mode: \`${state.frontend.status}\``);
    console.log(`- Frontend framework: \`${state.frontend.framework}\``);
    console.log(`- Frontend adapters: \`${(state.frontend.adapters || []).join(', ') || 'none'}\``);
    console.log(`- Visual verdict required: \`${state.frontend.visualVerdictRequired ? 'yes' : 'no'}\``);
  }
  console.log(`- Health: \`${state.health.status}\` (\`${state.health.failCount}\` fail / \`${state.health.warnCount}\` warn)`);
  console.log(`- Window decision: \`${state.window.decision}\``);
  console.log(`- Remaining budget: \`${state.window.remainingBudget}\``);
  console.log(`- Automation recommendation: \`${state.window.automationRecommendation}\``);
  console.log(`- Handoff: \`${state.handoff.status}\``);
  console.log(`- State file: \`${state.stateFileRelative}\``);
  if (options.showIntent && state.route) {
    console.log(`- Intent capability: \`${state.route.recommendedCapability}\``);
    console.log(`- Intent preset: \`${state.route.recommendedPreset}\``);
    console.log(`- Intent confidence: \`${state.route.confidence}\``);
  }
  if (options.showRisk && state.doctor?.risk) {
    console.log(`- Doctor risk: \`${state.doctor.risk.level}\` (\`${state.doctor.risk.score}/100\`)`);
  }

  console.log(`\n## Packets\n`);
  for (const packet of state.packets) {
    console.log(`- \`${packet.name}\` -> hash=\`${packet.hash}\`, drift=\`${packet.drift ? 'yes' : 'no'}\`, budget=\`${packet.budgetStatus}\`, tokens=\`${packet.estimatedTokens}\``);
  }

  console.log(`\n## Health\n`);
  for (const check of state.health.topChecks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
  }

  console.log(`\n## Next\n`);
  console.log(`- Title: \`${state.next.title}\``);
  console.log(`- Command: \`${state.next.command}\``);
  console.log(`- Note: \`${state.next.note}\``);
  if (options.showIntent && state.route) {
    console.log(`- Routed capability: \`${state.route.recommendedCapability}\``);
    console.log(`- Routed preset: \`${state.route.recommendedPreset}\``);
  }

  if (options.showCost) {
    console.log(`\n## Cost\n`);
    console.log(`- Estimated tokens: \`${state.window.estimatedTokens}\``);
    console.log(`- Budget status: \`${state.window.budgetStatus}\``);
  }

  console.log(`\n## Counts\n`);
  console.log(`- Carryforward: \`${state.counts.carryforward}\``);
  console.log(`- Seeds: \`${state.counts.seeds}\``);
  console.log(`- Active recall: \`${state.counts.activeRecall}\``);

  console.log(`\n## Handoff\n`);
  console.log(`- Resume anchor: \`${state.handoff.resumeAnchor}\``);
  console.log(`- Expected first command: \`${state.handoff.expectedFirstCommand}\``);
  console.log(`- Next action: ${state.handoff.nextAction}`);

  if (state.orchestration?.supervisor || state.orchestration?.mergeQueue || state.orchestration?.conflicts || state.orchestration?.prFeedback || state.orchestration?.reviewLoop) {
    console.log(`\n## Team Runtime Signals\n`);
    if (state.orchestration?.supervisor) {
      console.log(`- Supervisor: \`${state.orchestration.supervisor.status}\` cycles=\`${state.orchestration.supervisor.cycleCount || 0}\``);
    }
    if (state.orchestration?.mergeQueue) {
      console.log(`- Merge queue: next=\`${state.orchestration.mergeQueue.nextTaskId || 'none'}\` size=\`${state.orchestration.mergeQueue.queueLength || 0}\``);
    }
    if (state.orchestration?.conflicts) {
      console.log(`- Conflicts: blockers=\`${state.orchestration.conflicts.blockerCount || 0}\` warn=\`${state.orchestration.conflicts.warnCount || 0}\``);
    }
    if (state.orchestration?.prFeedback) {
      console.log(`- PR feedback: open=\`${state.orchestration.prFeedback.openCount || 0}\` resolved=\`${state.orchestration.prFeedback.resolvedCount || 0}\``);
    }
    if (state.orchestration?.reviewLoop) {
      console.log(`- Review loop: \`${state.orchestration.reviewLoop.verdict || 'noop'}\` findings=\`${state.orchestration.reviewLoop.findingsCount || 0}\``);
    }
  }

  if (state.repair?.hints?.length > 0) {
    console.log(`\n## Repair Hints\n`);
    for (const hint of state.repair.hints) {
      console.log(`- \`${hint.command}\` -> ${hint.reason}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHud() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const renderOptions = {
    includeDoctor: Boolean(args.risk),
    showIntent: Boolean(args.intent),
    showCost: Boolean(args.cost),
    showRisk: Boolean(args.risk),
  };
  const watch = Boolean(args.watch);
  const intervalMs = Math.max(1, Number(args.interval || 2)) * 1000;
  const iterationLimit = args.iterations ? Math.max(1, Number(args.iterations)) : null;
  let iterations = 0;

  while (true) {
    const state = collectHudState(cwd, rootDir, renderOptions);

    if (args.json) {
      console.log(JSON.stringify(state, null, 2));
    } else if (args.compact) {
      printCompact(state, renderOptions);
    } else {
      printStandard(state, renderOptions);
    }

    iterations += 1;
    if (!watch || (iterationLimit && iterations >= iterationLimit)) {
      return;
    }
    console.log('\n---\n');
    await sleep(intervalMs);
  }
}

if (require.main === module) {
  runHud().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  collectHudState,
};
