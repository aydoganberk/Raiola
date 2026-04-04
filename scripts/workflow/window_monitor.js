const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  parseArgs,
  resolveWorkflowRoot,
  syncWindowDocument,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
window_monitor

Usage:
  node scripts/workflow/window_monitor.js --json

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --step <name>       Optional. Override step for estimation
  --doc <name>        Optional. context|execplan|validation
  --sync              Write WINDOW.md with current estimate
  --json              Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const windowStatus = computeWindowStatus(paths, {
    step: args.step ? String(args.step).trim() : undefined,
    doc: args.doc ? String(args.doc).trim() : undefined,
  });

  if (args.sync) {
    syncWindowDocument(paths, windowStatus);
  }

  const payload = {
    rootDir: path.relative(cwd, rootDir),
    decision: windowStatus.decision,
    recommendedAction: windowStatus.recommendedAction,
    checkpointFreshness: windowStatus.checkpointFreshness,
    checkpointReason: windowStatus.checkpointReason,
    remainingBudget: windowStatus.estimatedRemainingTokens,
    canFinishCurrentChunk: windowStatus.canFinishCurrentChunk,
    canStartNextChunk: windowStatus.canStartNextChunk,
    packetHash: windowStatus.packet.inputHash,
    packetBudgetStatus: windowStatus.packet.budgetStatus,
    readSet: windowStatus.packet.recommendedReadSet,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# WINDOW\n`);
  console.log(`- Root: \`${payload.rootDir}\``);
  console.log(`- Decision: \`${payload.decision}\``);
  console.log(`- Recommended action: \`${payload.recommendedAction}\``);
  console.log(`- Checkpoint freshness: \`${payload.checkpointFreshness}\``);
  console.log(`- Remaining budget: \`${payload.remainingBudget}\``);
  console.log(`- Can finish current chunk: \`${payload.canFinishCurrentChunk ? 'yes' : 'no'}\``);
  console.log(`- Can start next chunk: \`${payload.canStartNextChunk ? 'yes' : 'no'}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Packet budget status: \`${payload.packetBudgetStatus}\``);
}

main();
