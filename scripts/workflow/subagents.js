const path = require('node:path');
const childProcess = require('node:child_process');

function printHelp() {
  console.log(`
subagents

Usage:
  node scripts/workflow/subagents.js plan --goal "review the current diff"

Notes:
  This is a roadmap-compatible wrapper over \`rai codex plan-subagents\`.
  `);
}

function main() {
  const argv = process.argv.slice(2);
  const action = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'plan';
  if (action === '--help' || action === '-h' || action === 'help') {
    printHelp();
    return;
  }
  if (action !== 'plan') {
    throw new Error(`Unknown subagents action: ${action}`);
  }
  const forwarded = action === 'plan' ? argv.slice(1) : argv;
  const targetScript = path.join(__dirname, 'codex_control.js');
  const result = childProcess.spawnSync(process.execPath, [targetScript, 'plan-subagents', ...forwarded], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
  });
  process.exitCode = typeof result.status === 'number' ? result.status : 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
