const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { writeStateSurface } = require('./state_surface');

function printHelp() {
  console.log(`
hud

Usage:
  node scripts/workflow/hud.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --compact         Print compact summary output
  --json            Print machine-readable JSON
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function runJsonSibling(scriptName, cwd, rootDir) {
  const rootRelative = relativePath(cwd, rootDir);
  const raw = childProcess.execFileSync(
    'node',
    [path.join(__dirname, scriptName), '--json', '--root', rootRelative],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return JSON.parse(raw);
}

function healthStatus(health) {
  if (health.failCount > 0) {
    return 'fail';
  }
  if (health.warnCount > 0) {
    return 'warn';
  }
  return 'pass';
}

function collectHudState(cwd, rootDir) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);
  const health = runJsonSibling('health.js', cwd, rootDir);
  const next = runJsonSibling('next_step.js', cwd, rootDir);
  return writeStateSurface(cwd, rootDir, {
    health: {
      status: healthStatus(health),
      failCount: health.failCount,
      warnCount: health.warnCount,
      topChecks: health.checks.slice(0, 5).map((check) => ({
        status: check.status,
        message: check.message,
      })),
    },
    window: {
      decision: next.windowStatus.decision,
      remainingBudget: next.windowStatus.remainingBudget,
      canStartNextStep: next.windowStatus.canStartNextStep,
      canFinishCurrentChunk: next.windowStatus.canFinishCurrentChunk,
      automationRecommendation: next.windowStatus.automationRecommendation,
      packetHash: next.packetHash,
      estimatedTokens: next.estimatedTokens,
      budgetStatus: next.budgetStatus,
    },
    next: {
      title: next.recommendation.title,
      command: next.recommendation.command,
      note: next.recommendation.note,
      checklist: next.recommendation.checklist,
    },
  }, { updatedBy: 'hud' });
}

function printCompact(state) {
  const packetSummary = state.packets
    .map((packet) => `${packet.name}:${packet.hash.slice(0, 12)}${packet.drift ? '*' : ''}/${packet.budgetStatus}`)
    .join(' ');

  console.log(`# HUD\n`);
  console.log(`- root=\`${state.workflowRootRelative}\` workstream=\`${state.activeWorkstream.name}\` milestone=\`${state.workflow.milestone}\` step=\`${state.workflow.step}\` readiness=\`${state.workflow.readiness}\` plan=\`${state.workflow.planGate}\``);
  console.log(`- profile=\`${state.workflow.profile}\` automation=\`${state.workflow.automationMode}\` automation_status=\`${state.workflow.automationStatus}\``);
  console.log(`- health=\`${state.health.status}\` fail=\`${state.health.failCount}\` warn=\`${state.health.warnCount}\` window=\`${state.window.decision}\` remaining=\`${state.window.remainingBudget}\` handoff=\`${state.handoff.status}\` auto_window=\`${state.window.automationRecommendation}\``);
  console.log(`- packets=\`${packetSummary}\``);
  console.log(`- counts=\`carryforward:${state.counts.carryforward} seeds:${state.counts.seeds} recall:${state.counts.activeRecall}\``);
  console.log(`- next=\`${state.next.title}\` command=\`${state.next.command}\``);
  console.log(`- state=\`${state.stateFileRelative}\``);
}

function printStandard(state) {
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
  console.log(`- Health: \`${state.health.status}\` (\`${state.health.failCount}\` fail / \`${state.health.warnCount}\` warn)`);
  console.log(`- Window decision: \`${state.window.decision}\``);
  console.log(`- Remaining budget: \`${state.window.remainingBudget}\``);
  console.log(`- Automation recommendation: \`${state.window.automationRecommendation}\``);
  console.log(`- Handoff: \`${state.handoff.status}\``);
  console.log(`- State file: \`${state.stateFileRelative}\``);

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

  console.log(`\n## Counts\n`);
  console.log(`- Carryforward: \`${state.counts.carryforward}\``);
  console.log(`- Seeds: \`${state.counts.seeds}\``);
  console.log(`- Active recall: \`${state.counts.activeRecall}\``);

  console.log(`\n## Handoff\n`);
  console.log(`- Resume anchor: \`${state.handoff.resumeAnchor}\``);
  console.log(`- Expected first command: \`${state.handoff.expectedFirstCommand}\``);
  console.log(`- Next action: ${state.handoff.nextAction}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const state = collectHudState(cwd, rootDir);

  if (args.json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (args.compact) {
    printCompact(state);
    return;
  }

  printStandard(state);
}

if (require.main === module) {
  main();
}

module.exports = {
  collectHudState,
};
