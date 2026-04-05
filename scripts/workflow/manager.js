const path = require('node:path');
const {
  parseArgs,
  resolveWorkflowRoot,
} = require('./common');
const { collectRuntimeState } = require('./runtime_collector');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
manager

Usage:
  node scripts/workflow/manager.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --json            Print machine-readable output
  `);
}

function buildManagerPayload(cwd, rootDir) {
  const collected = collectRuntimeState(cwd, rootDir, {
    includeDoctor: true,
    updatedBy: 'manager',
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    workstream: collected.state.activeWorkstream,
    workflow: collected.state.workflow,
    drift: collected.state.drift,
    health: collected.patch.health,
    doctor: collected.patch.doctor,
    window: collected.patch.window,
    next: collected.patch.next,
    orchestration: collected.orchestration,
    verifications: collected.verifications,
    repair: collected.patch.repair,
    counts: collected.state.counts,
    handoff: collected.state.handoff,
  };

  const filePath = writeRuntimeJson(cwd, 'manager.json', payload);
  return {
    ...payload,
    runtimeFile: path.relative(cwd, filePath).replace(/\\/g, '/'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildManagerPayload(cwd, rootDir);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# MANAGER\n');
  console.log(`- Workstream: \`${payload.workstream.name}\``);
  console.log(`- Milestone: \`${payload.workflow.milestone}\``);
  console.log(`- Step: \`${payload.workflow.step}\``);
  console.log(`- Plan gate: \`${payload.workflow.planGate}\``);
  console.log(`- Health: \`${payload.health.status}\` (\`${payload.health.failCount}\` fail / \`${payload.health.warnCount}\` warn)`);
  console.log(`- Doctor: \`${payload.doctor.failCount}\` fail / \`${payload.doctor.warnCount}\` warn`);
  console.log(`- Window: \`${payload.window.decision}\` remaining=\`${payload.window.remainingBudget}\``);
  console.log(`- Drift: \`${payload.drift.count}\``);
  console.log(`- Next: \`${payload.next.title}\``);
  console.log(`- Orchestration: \`${payload.orchestration.status}\``);
  console.log(`- Runtime file: \`${payload.runtimeFile}\``);

  console.log('\n## Repair Hints\n');
  if (payload.repair.hints.length === 0) {
    console.log('- `No active repair hints`');
  } else {
    for (const hint of payload.repair.hints) {
      console.log(`- \`${hint.command}\` -> ${hint.reason}`);
    }
  }

  console.log('\n## Verify Queue\n');
  console.log(`- Shell latest: \`${payload.verifications.shell.latest?.verdict || 'none'}\``);
  console.log(`- Browser latest: \`${payload.verifications.browser.latest?.verdict || 'none'}\``);

  console.log('\n## Team Runtime\n');
  console.log(`- Active: \`${payload.orchestration.active ? 'yes' : 'no'}\``);
  console.log(`- Status: \`${payload.orchestration.status}\``);
  if (payload.orchestration.route) {
    console.log(`- Route: \`${payload.orchestration.route.action}\``);
    console.log(`- Recommendation: \`${payload.orchestration.route.recommendation}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildManagerPayload,
};
