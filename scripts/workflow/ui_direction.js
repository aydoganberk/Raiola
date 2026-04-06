
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');

function printHelp() {
  console.log(`
ui_direction

Usage:
  node scripts/workflow/ui_direction.js

Options:
  --root <path>  Workflow root. Defaults to active workstream root
  --json         Print machine-readable output
  `);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildUiDirection(cwd, rootDir);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# UI DIRECTION\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Archetype: \`${payload.archetype.label}\``);
  console.log(`- Taste: \`${payload.taste.tagline}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
