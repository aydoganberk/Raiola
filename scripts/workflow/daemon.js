const path = require('node:path');
const { parseArgs } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

function daemonPath(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'daemon.json');
}

function loadDaemon(cwd) {
  return readJsonFile(daemonPath(cwd), {
    generatedAt: new Date().toISOString(),
    running: false,
    heartbeatAt: null,
    mode: 'optional',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/daemon.js status|restart|stop [--json]');
    return;
  }
  const cwd = process.cwd();
  const daemon = loadDaemon(cwd);
  if (action === 'restart') {
    daemon.running = true;
    daemon.heartbeatAt = new Date().toISOString();
    daemon.generatedAt = daemon.generatedAt || daemon.heartbeatAt;
    writeJsonFile(daemonPath(cwd), daemon);
  }
  if (action === 'stop') {
    daemon.running = false;
    daemon.heartbeatAt = new Date().toISOString();
    writeJsonFile(daemonPath(cwd), daemon);
  }
  const payload = {
    action,
    file: relativePath(cwd, daemonPath(cwd)),
    daemon,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# DAEMON\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Running: \`${daemon.running ? 'yes' : 'no'}\``);
  console.log(`- Heartbeat: \`${daemon.heartbeatAt || 'never'}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
