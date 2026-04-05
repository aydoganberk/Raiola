const path = require('node:path');
const {
  parseArgs,
  readIfExists,
  replaceOrAppendSection,
  writeIfChanged,
} = require('./common');
const {
  appendMarkdownListItem,
  ensureMarkdownDocument,
  relativePath,
} = require('./roadmap_os');
const { writeRuntimeMarkdown } = require('./runtime_helpers');

function printHelp() {
  console.log(`
note

Usage:
  node scripts/workflow/note.js "Capture this quickly"

Options:
  --promote <backlog|thread|seed>
  --thread <name>      Thread target when using --promote thread
  --json               Print machine-readable output
  `);
}

function threadFilePath(cwd, name) {
  return path.join(cwd, 'docs', 'workflow', 'THREADS', `${String(name || 'thread')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'thread'}.md`);
}

function appendInbox(cwd, text) {
  const inboxPath = path.join(cwd, '.workflow', 'runtime', 'inbox.md');
  ensureMarkdownDocument(inboxPath, 'RUNTIME INBOX', '## Captured Notes\n');
  const line = `- [${new Date().toISOString()}] ${text}`;
  appendMarkdownListItem(inboxPath, 'RUNTIME INBOX', 'Captured Notes', line);
  return inboxPath;
}

function promote(cwd, promoteTarget, text, threadName) {
  if (promoteTarget === 'backlog') {
    const filePath = path.join(cwd, 'docs', 'workflow', 'BACKLOG.md');
    appendMarkdownListItem(filePath, 'BACKLOG', 'Open Backlog', `- [ ] ${text}`);
    return filePath;
  }
  if (promoteTarget === 'thread') {
    const filePath = threadFilePath(cwd, threadName || text);
    ensureMarkdownDocument(filePath, threadName || text, '## Notes\n');
    appendMarkdownListItem(filePath, threadName || text, 'Notes', `- [${new Date().toISOString()}] ${text}`);
    return filePath;
  }
  if (promoteTarget === 'seed') {
    const filePath = path.join(cwd, 'docs', 'workflow', 'SEEDS.md');
    ensureMarkdownDocument(filePath, 'SEEDS', '## Open Seeds\n');
    const current = readIfExists(filePath) || '# SEEDS\n\n## Open Seeds\n';
    const section = `- Seed: \`${text}\`\n- Status: \`open\``;
    const next = replaceOrAppendSection(current, 'Open Seeds', section);
    writeIfChanged(filePath, `${next.trimEnd()}\n`);
    return filePath;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const text = String(args.text || args._.join(' ')).trim();
  if (!text) {
    throw new Error('Provide note text via free-form args or --text.');
  }
  const inboxPath = appendInbox(cwd, text);
  const promotedPath = args.promote ? promote(cwd, String(args.promote), text, args.thread) : null;
  const payload = {
    generatedAt: new Date().toISOString(),
    text,
    inbox: relativePath(cwd, inboxPath),
    promotedTo: promotedPath ? relativePath(cwd, promotedPath) : null,
  };
  writeRuntimeMarkdown(cwd, 'last-note.md', `# LAST NOTE\n\n- Note: \`${text}\`\n- Inbox: \`${payload.inbox}\`\n- Promoted: \`${payload.promotedTo || 'none'}\`\n`);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# NOTE\n');
  console.log(`- Inbox: \`${payload.inbox}\``);
  console.log(`- Promoted: \`${payload.promotedTo || 'none'}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
