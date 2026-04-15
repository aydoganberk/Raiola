const path = require('node:path');
const {
  assertWorkflowFiles,
  extractSection,
  getFieldValue,
  resolveWorkflowRoot,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  renderMemorySection,
  replaceField,
  replaceSection,
  today,
  toList,
  warnAgentsSize,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  writeText: write,
} = require('./io/files');

function printHelp() {
  console.log(`
save_memory

Usage:
  node scripts/workflow/save_memory.js --title "User preference" --note "Keep responses concise"

Options:
  --root <path>         Workflow root. Default: active workstream root
  --title <text>        Required. Short memory title
  --note <text>         Required. Durable memory content
  --mode <type>         Optional. active | durable. Default: active if milestone exists, else durable
  --tags <a|b|c>        Optional tags. Use | to separate multiple tags
  --source <text>       Optional. Default: user-triggered
  --dry-run             Preview without writing
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const title = String(args.title || '').trim();
  const note = String(args.note || '').trim();
  if (!title || !note) {
    throw new Error('--title and --note are required');
  }

  const rootDir = resolveWorkflowRoot(process.cwd(), args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const tags = toList(args.tags);
  const source = String(args.source || 'user-triggered').trim();
  const dryRun = Boolean(args['dry-run']);
  const status = read(paths.status);
  const currentMilestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const currentStep = String(getFieldValue(status, 'Current milestone step') || 'unknown').trim();
  const explicitMode = String(args.mode || '').trim();
  const mode = explicitMode || (currentMilestone !== 'NONE' ? 'active' : 'durable');

  if (!['active', 'durable'].includes(mode)) {
    throw new Error('--mode must be active or durable');
  }

  if (mode === 'active' && currentMilestone === 'NONE') {
    throw new Error('Active memory requires an active milestone in STATUS.md');
  }

  let memory = read(paths.memory);
  const activeEntries = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry));
  const durableEntries = parseMemoryEntries(extractSection(memory, 'Durable Notes'), 'No durable notes saved yet')
    .map((entry) => parseMemoryEntry(entry));

  const newEntry = {
    date: today(),
    title,
    fields: {
      Mode: mode,
      Note: note,
      Source: source,
    },
  };

  if (mode === 'active') {
    newEntry.fields.Status = 'open';
    newEntry.fields.Milestone = currentMilestone;
    newEntry.fields.Step = currentStep;
    newEntry.fields.Lifecycle = 'auto_recall_until_milestone_complete';
  }

  if (tags.length > 0) {
    newEntry.fields.Tags = tags.join(', ');
  }

  const dedupe = (entry) => {
    if (entry.title !== title || entry.fields.Mode !== mode) {
      return true;
    }

    if (mode === 'active') {
      return entry.fields.Milestone !== currentMilestone;
    }

    return false;
  };

  const nextActiveEntries = mode === 'active'
    ? [newEntry, ...activeEntries.filter(dedupe)]
    : activeEntries;
  const nextDurableEntries = mode === 'durable'
    ? [newEntry, ...durableEntries.filter(dedupe)]
    : durableEntries;

  memory = replaceField(memory, 'Last updated', today());
  memory = replaceField(memory, 'Status', 'active_recall_plus_durable');
  memory = replaceSection(memory, 'Active Recall Items', renderMemorySection(nextActiveEntries, 'No active recall notes yet'));
  memory = replaceSection(memory, 'Durable Notes', renderMemorySection(nextDurableEntries, 'No durable notes saved yet'));

  const warning = warnAgentsSize(process.cwd());
  console.log(warning);

  if (dryRun) {
    console.log(`DRY RUN: would save ${mode} memory entry "${title}" to ${paths.memory}`);
    return;
  }

  write(paths.memory, memory);
  console.log(`Saved ${mode} memory entry "${title}"`);
}

main();
