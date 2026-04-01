const {
  assertWorkflowFiles,
  extractSection,
  parseArgs,
  parseSeedEntries,
  read,
  renderSeedSection,
  replaceField,
  replaceSection,
  resolveWorkflowRoot,
  today,
  toList,
  workflowPaths,
  write,
} = require('./common');

function printHelp() {
  console.log(`
plant_seed

Usage:
  node scripts/workflow/plant_seed.js --title "..." --trigger "..."

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --title <text>        Required. Seed title
  --trigger <text>      Required. When this should surface
  --note <text>         Optional explanation
  --tags <a|b|c>        Optional tags
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
  const trigger = String(args.trigger || '').trim();
  if (!title || !trigger) {
    throw new Error('--title and --trigger are required');
  }

  const rootDir = resolveWorkflowRoot(process.cwd(), args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const note = String(args.note || '').trim();
  const source = String(args.source || 'user-triggered').trim();
  const tags = toList(args.tags);
  const dryRun = Boolean(args['dry-run']);

  let seeds = read(paths.seeds);
  const openSeeds = parseSeedEntries(extractSection(seeds, 'Open Seeds'), 'Henuz acik seed yok');
  const nextEntries = [
    {
      date: today(),
      title,
      fields: {
        Trigger: trigger,
        Status: 'open',
        Source: source,
        ...(note ? { Note: note } : {}),
        ...(tags.length > 0 ? { Tags: tags.join(', ') } : {}),
      },
    },
    ...openSeeds.filter((entry) => entry.title !== title),
  ];

  seeds = replaceField(seeds, 'Last updated', today());
  seeds = replaceSection(seeds, 'Open Seeds', renderSeedSection(nextEntries, 'Henuz acik seed yok'));

  if (dryRun) {
    console.log(`DRY RUN: would write seed "${title}" to ${paths.seeds}`);
    return;
  }

  write(paths.seeds, seeds);
  console.log(`Planted seed "${title}"`);
}

main();
