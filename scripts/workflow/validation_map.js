const path = require('node:path');
const childProcess = require('node:child_process');

function printHelp() {
  console.log(`
validation_map

Usage:
  node scripts/workflow/validation_map.js

Notes:
  This is a roadmap-compatible wrapper over \`validate_contract.js\`.
  `);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.includes('help')) {
    printHelp();
    return;
  }
  const targetScript = path.join(__dirname, 'validate_contract.js');
  const result = childProcess.spawnSync('node', [targetScript, ...argv], {
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
