const path = require('node:path');
const {
  assertWorkflowFiles,
  parseArgs,
  resolveWorkflowRoot,
  validateValidationContract,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
validate_contract

Usage:
  node scripts/workflow/validate_contract.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --strict          Exit non-zero on fail checks
  --json            Print machine-readable output
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

  const checks = validateValidationContract(paths);
  const failCount = checks.filter((item) => item.status === 'fail').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;

  if (args.json) {
    console.log(JSON.stringify({ rootDir: path.relative(cwd, rootDir), failCount, warnCount, checks }, null, 2));
    return;
  }

  console.log(`# VALIDATION CONTRACT\n`);
  console.log(`- Root: \`${path.relative(cwd, rootDir)}\``);
  console.log(`- Fail count: \`${failCount}\``);
  console.log(`- Warn count: \`${warnCount}\``);
  console.log(`\n## Checks\n`);
  if (checks.length === 0) {
    console.log('- [PASS] Validation contract complete');
  } else {
    for (const check of checks) {
      console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
    }
  }

  if (args.strict && failCount > 0) {
    process.exitCode = 1;
  }
}

main();
