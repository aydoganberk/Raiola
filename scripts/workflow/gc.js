const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const { listEntries, relativePath } = require('./roadmap_os');

function printHelp() {
  console.log(`
gc

Usage:
  node scripts/workflow/gc.js --keep 5

Options:
  --keep <n>         Keep the newest n directories per artifact bucket. Defaults to 5
  --json             Print machine-readable output
  `);
}

function pruneDir(baseDir, keep) {
  const entries = listEntries(baseDir, { directoriesOnly: true })
    .map((entry) => ({
      ...entry,
      mtimeMs: fs.statSync(entry.fullPath).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const removed = [];
  for (const entry of entries.slice(keep)) {
    fs.rmSync(entry.fullPath, { recursive: true, force: true });
    removed.push(entry.fullPath);
  }
  return removed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const keep = Number.parseInt(String(args.keep || '5'), 10);
  const buckets = [
    path.join(cwd, '.workflow', 'verifications', 'browser'),
    path.join(cwd, '.workflow', 'verifications', 'shell'),
    path.join(cwd, '.workflow', 'packets'),
    path.join(cwd, '.workflow', 'runtime', 'codex-control', 'backups'),
  ];
  const removed = buckets.flatMap((bucket) => pruneDir(bucket, keep))
    .map((item) => relativePath(cwd, item));
  const payload = {
    generatedAt: new Date().toISOString(),
    keep,
    removed,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# GC\n');
  console.log(`- Keep: \`${keep}\``);
  console.log(`- Removed: \`${removed.length}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
