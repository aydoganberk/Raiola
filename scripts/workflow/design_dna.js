const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc } = require('./design_contracts');

function printHelp() {
  console.log(`
design_dna

Usage:
  node scripts/workflow/design_dna.js

Options:
  --goal <text>  Optional product/UI goal to steer the contract
  --taste <id>   Optional explicit taste profile override
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
  const direction = buildUiDirection(cwd, rootDir, {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
  });
  const payload = buildDesignDnaDoc(cwd, rootDir, direction, {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DESIGN DNA\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Product category: \`${payload.productCategory.label}\``);
  console.log(`- Blend: \`${payload.blend.summary}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
