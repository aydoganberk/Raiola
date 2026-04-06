const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildVerifyWorkPayload } = require('./trust_os');

function printHelp() {
  console.log(`
verify_work

Usage:
  node scripts/workflow/verify_work.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --status <value>    auto|pass|warn|fail for manual override
  --checks <a;b;c>    Semicolon-separated manual verification checks
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
  const payload = buildVerifyWorkPayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# VERIFY WORK\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Confidence: \`${payload.confidence}\``);
  console.log(`- Output: \`${payload.outputPathRelative}\``);
  console.log(`- Fix plan items: \`${payload.fixPlan.length}\``);
  if (payload.reasons.length > 0) {
    console.log('\n## Reasons\n');
    for (const reason of payload.reasons) {
      console.log(`- \`${reason}\``);
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
