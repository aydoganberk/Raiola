const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildShipReadinessPayload } = require('./trust_os');

function printHelp() {
  console.log(`
ship_readiness

Usage:
  node scripts/workflow/ship_readiness.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --mode <value>      auto|review|audit-only
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
  const payload = buildShipReadinessPayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# SHIP READINESS\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Score: \`${payload.score}\``);
  console.log(`- Trust mode: \`${payload.trustMode}\``);
  console.log(`- Output: \`${payload.outputPathRelative}\``);
  console.log(`- Release control: \`${payload.releaseControl?.artifacts?.markdown || 'n/a'}\``);
  console.log(`- Pending approvals: \`${payload.approvalPlan.pending.length}\``);
  console.log(`- Ship blockers: \`${payload.releaseControl?.shipReadinessBoard?.shipBlockerCount || 0}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
