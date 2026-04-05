const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  appendMarkdownListItem,
  ensureMarkdownDocument,
  listEntries,
  relativePath,
  writeJsonFile,
} = require('./roadmap_os');

function printHelp() {
  console.log(`
thread

Usage:
  node scripts/workflow/thread.js open regression-review
  node scripts/workflow/thread.js list
  node scripts/workflow/thread.js resume regression-review

Options:
  --json            Print machine-readable output
  `);
}

function slugifyName(value) {
  return String(value || 'thread')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'thread';
}

function threadDir(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'THREADS');
}

function threadFile(cwd, name) {
  return path.join(threadDir(cwd), `${slugifyName(name)}.md`);
}

function openThread(cwd, name) {
  const filePath = threadFile(cwd, name);
  ensureMarkdownDocument(filePath, name, '## Notes\n\n## Next\n');
  appendMarkdownListItem(filePath, name, 'Notes', `- [${new Date().toISOString()}] Thread opened`);
  return {
    action: 'open',
    name,
    file: relativePath(cwd, filePath),
  };
}

function listThreads(cwd) {
  const dirPath = threadDir(cwd);
  const items = listEntries(dirPath, { filesOnly: true })
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => ({
      name: entry.name.replace(/\.md$/, ''),
      file: relativePath(cwd, entry.fullPath),
    }));
  return {
    action: 'list',
    threads: items,
  };
}

function resumeThread(cwd, name) {
  const filePath = threadFile(cwd, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Thread not found: ${name}`);
  }
  writeJsonFile(path.join(cwd, '.workflow', 'runtime', 'thread.json'), {
    generatedAt: new Date().toISOString(),
    activeThread: slugifyName(name),
    file: relativePath(cwd, filePath),
  });
  appendMarkdownListItem(filePath, name, 'Notes', `- [${new Date().toISOString()}] Thread resumed`);
  return {
    action: 'resume',
    name,
    file: relativePath(cwd, filePath),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'list';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const name = args._[1] || args.name;
  const payload = action === 'open'
    ? openThread(cwd, String(name || 'thread'))
    : action === 'resume'
      ? resumeThread(cwd, String(name || 'thread'))
      : listThreads(cwd);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# THREAD\n');
  console.log(`- Action: \`${payload.action}\``);
  if (payload.threads) {
    for (const item of payload.threads) {
      console.log(`- \`${item.name}\` -> \`${item.file}\``);
    }
  } else {
    console.log(`- File: \`${payload.file}\``);
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
