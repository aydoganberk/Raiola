const path = require('node:path');
const { parseArgs } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

const DEFAULT_HOOKS = Object.freeze({
  events: [
    'session_start',
    'question_needed',
    'verify_failed',
    'phase_complete',
    'session_idle',
    'session_end',
  ],
  enabled: false,
});

function hooksPath(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'hooks', 'config.json');
}

function loadHooks(cwd) {
  const hooks = readJsonFile(hooksPath(cwd), null);
  if (hooks) {
    return hooks;
  }
  const seeded = {
    ...DEFAULT_HOOKS,
    generatedAt: new Date().toISOString(),
  };
  writeJsonFile(hooksPath(cwd), seeded);
  return seeded;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'list';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/hooks.js init|validate|list [--json]');
    return;
  }
  const cwd = process.cwd();
  const hooks = loadHooks(cwd);
  const payload = action === 'validate'
    ? {
      action,
      file: relativePath(cwd, hooksPath(cwd)),
      verdict: hooks.enabled ? 'pass' : 'pass',
      eventCount: hooks.events.length,
      enabled: hooks.enabled,
    }
    : {
      action: action === 'init' ? 'init' : 'list',
      file: relativePath(cwd, hooksPath(cwd)),
      hooks,
    };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# HOOKS\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Enabled: \`${hooks.enabled ? 'yes' : 'no'}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
