const path = require('node:path');
const { parseArgs } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

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

function approvalsPath(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'approvals.json');
}

function readApprovals(cwd) {
  return readJsonFile(approvalsPath(cwd), {
    generatedAt: new Date().toISOString(),
    grants: [],
  });
}

function grantApproval(cwd, target, reason) {
  const payload = readApprovals(cwd);
  payload.grants.push({
    target,
    reason,
    grantedAt: new Date().toISOString(),
  });
  writeJsonFile(approvalsPath(cwd), payload);
  return {
    action: 'grant',
    file: relativePath(cwd, approvalsPath(cwd)),
    grant: payload.grants[payload.grants.length - 1],
  };
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
      file: relativePath(cwd, approvalsPath(cwd)),
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
