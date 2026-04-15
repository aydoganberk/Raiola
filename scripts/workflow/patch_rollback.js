const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs } = require('./common');
const { currentBranch } = require('./common_git');
const { safeArtifactToken } = require('./common_identity');
const { ensureDir } = require('./io/files');
const { relativePath } = require('./roadmap_os');

function patchPath(cwd, taskId) {
  return path.join(
    cwd,
    '.workflow',
    'orchestration',
    'patches',
    `${safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' })}.patch`,
  );
}

function patchEventsPath(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'runtime', 'patch-events.jsonl');
}

function appendPatchEvent(cwd, event) {
  const filePath = patchEventsPath(cwd);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
  return filePath;
}

function safeBranch(cwd) {
  try {
    return currentBranch(cwd) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskId = String(args.task || args._[0] || '').trim();
  if (args.help || !taskId) {
    console.log('Usage: node scripts/workflow/patch_rollback.js --task <id> [--json]');
    return;
  }
  const cwd = process.cwd();
  const filePath = patchPath(cwd, taskId);
  const result = childProcess.spawnSync('git', ['apply', '-R', '--3way', filePath], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const success = result.status === 0;
  const payload = {
    taskId,
    file: relativePath(cwd, filePath),
    rolledBack: success,
    success,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  const event = {
    generatedAt: new Date().toISOString(),
    action: 'rollback',
    taskId,
    file: payload.file,
    success,
    status: result.status,
    branch: safeBranch(cwd),
    stdout: payload.stdout,
    stderr: payload.stderr,
  };
  const eventsFile = appendPatchEvent(cwd, event);
  payload.eventsFile = relativePath(cwd, eventsFile);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# PATCH ROLLBACK\n');
  console.log(`- Patch: \`${payload.file}\``);
  console.log(`- Rolled back: \`${payload.rolledBack ? 'yes' : 'no'}\``);
  console.log(`- Events: \`${payload.eventsFile}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
