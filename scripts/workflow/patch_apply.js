const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs } = require('./common');
const { relativePath } = require('./roadmap_os');

function patchPath(cwd, taskId) {
  return path.join(cwd, '.workflow', 'orchestration', 'patches', `${taskId}.patch`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskId = String(args.task || args._[0] || '').trim();
  if (args.help || !taskId) {
    console.log('Usage: node scripts/workflow/patch_apply.js --task <id> [--json]');
    return;
  }
  const cwd = process.cwd();
  const filePath = patchPath(cwd, taskId);
  const result = childProcess.spawnSync('git', ['apply', '--3way', filePath], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const payload = {
    taskId,
    file: relativePath(cwd, filePath),
    applied: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# PATCH APPLY\n');
  console.log(`- Patch: \`${payload.file}\``);
  console.log(`- Applied: \`${payload.applied ? 'yes' : 'no'}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
