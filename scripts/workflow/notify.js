const path = require('node:path');
const { parseArgs } = require('./common');
const { appendJsonl, relativePath } = require('./roadmap_os');

function notifyLog(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'notifications.jsonl');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'test';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/notify.js test [--json]');
    return;
  }
  const cwd = process.cwd();
  const event = {
    event: action,
    generatedAt: new Date().toISOString(),
    summary: 'Workflow notification smoke event',
  };
  appendJsonl(notifyLog(cwd), event);
  const payload = {
    action,
    file: relativePath(cwd, notifyLog(cwd)),
    event,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# NOTIFY\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Event: \`${payload.event.event}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
