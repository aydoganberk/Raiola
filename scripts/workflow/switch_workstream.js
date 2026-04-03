const path = require('node:path');
const childProcess = require('node:child_process');

function main() {
  childProcess.execFileSync(
    'node',
    [path.join(__dirname, 'workstreams.js'), 'switch', ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );
}

main();
