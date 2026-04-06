const { parseArgs } = require('./common');
const { readApprovals, grantApproval } = require('./policy');

function printHelp() {
  console.log(`
approvals

Usage:
  node scripts/workflow/approvals.js
  node scripts/workflow/approvals.js grant --target config --reason "Allow package script drift repair"

Options:
  --target <name>    Approval target or domain
  --reason <text>    Human rationale
  --json             Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'list';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = action === 'grant'
    ? grantApproval(cwd, String(args.target || ''), String(args.reason || ''))
    : {
      action: 'list',
      file: 'docs/workflow/POLICY.md',
      grants: readApprovals(cwd).grants,
    };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# APPROVALS\n');
  console.log(`- Action: \`${payload.action}\``);
  for (const grant of payload.grants || [payload.grant]) {
    console.log(`- \`${grant.target}\` -> ${grant.reason}`);
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
