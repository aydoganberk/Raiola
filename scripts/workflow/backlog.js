const path = require('node:path');
const { parseArgs } = require('./common');
const {
  appendMarkdownListItem,
  ensureMarkdownDocument,
  readMarkdownList,
  relativePath,
} = require('./roadmap_os');

function printHelp() {
  console.log(`
backlog

Usage:
  node scripts/workflow/backlog.js add "Investigate audit drift"
  node scripts/workflow/backlog.js park "Defer this until after review parity"
  node scripts/workflow/backlog.js review

Options:
  --json            Print machine-readable output
  `);
}

function backlogPath(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'BACKLOG.md');
}

function addBacklogItem(cwd, text) {
  const filePath = backlogPath(cwd);
  ensureMarkdownDocument(filePath, 'BACKLOG', '## Open Backlog\n\n## Parked\n');
  appendMarkdownListItem(filePath, 'BACKLOG', 'Open Backlog', `- [ ] ${text}`);
  return {
    action: 'add',
    file: relativePath(cwd, filePath),
    text,
  };
}

function parkBacklogItem(cwd, text) {
  const filePath = backlogPath(cwd);
  ensureMarkdownDocument(filePath, 'BACKLOG', '## Open Backlog\n\n## Parked\n');
  appendMarkdownListItem(filePath, 'BACKLOG', 'Parked', `- [ ] ${text}`);
  return {
    action: 'park',
    file: relativePath(cwd, filePath),
    text,
  };
}

function reviewBacklog(cwd) {
  const filePath = backlogPath(cwd);
  const openItems = readMarkdownList(filePath, 'Open Backlog', {
    title: 'BACKLOG',
    extraBody: '## Open Backlog\n\n## Parked\n',
  });
  const parkedItems = readMarkdownList(filePath, 'Parked', {
    title: 'BACKLOG',
    extraBody: '## Open Backlog\n\n## Parked\n',
  });
  return {
    action: 'review',
    file: relativePath(cwd, filePath),
    items: openItems,
    parkedItems,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'review';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = action === 'add'
    ? addBacklogItem(cwd, String(args._.slice(1).join(' ') || args.text || '').trim())
    : action === 'park'
      ? parkBacklogItem(cwd, String(args._.slice(1).join(' ') || args.text || '').trim())
    : reviewBacklog(cwd);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# BACKLOG\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- File: \`${payload.file}\``);
  if (payload.items) {
    for (const item of payload.items) {
      console.log(item);
    }
  }
  if (payload.parkedItems?.length > 0) {
    console.log('\n# PARKED\n');
    for (const item of payload.parkedItems) {
      console.log(item);
    }
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
