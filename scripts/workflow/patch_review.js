const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, safeArtifactToken } = require('./common');
const { listEntries, relativePath } = require('./roadmap_os');

function patchDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'patches');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    console.log('Usage: node scripts/workflow/patch_review.js [--task <id>] [--json]');
    return;
  }
  const cwd = process.cwd();
  const task = args.task ? safeArtifactToken(String(args.task), { label: 'Task id', prefix: 'task' }) : '';
  const patches = listEntries(patchDir(cwd), { filesOnly: true })
    .filter((entry) => entry.name.endsWith('.patch') && (!task || entry.name === `${task}.patch`))
    .map((entry) => ({
      taskId: entry.name.replace(/\.patch$/, ''),
      file: relativePath(cwd, entry.fullPath),
      preview: fs.readFileSync(entry.fullPath, 'utf8').split('\n').slice(0, 8).join('\n'),
    }));
  const payload = {
    generatedAt: new Date().toISOString(),
    patches,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# PATCH REVIEW\n');
  for (const patch of patches) {
    console.log(`- \`${patch.taskId}\` -> \`${patch.file}\``);
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
