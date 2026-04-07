const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');

function printHelp() {
  console.log(`
state_atlas

Usage:
  node scripts/workflow/state_atlas.js

Options:
  --goal <text>  Optional product/UI goal to steer the atlas
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
  const uiOptions = {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
  };
  const direction = buildUiDirection(cwd, rootDir, uiOptions);
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, uiOptions);
  const payload = buildStateAtlasDoc(cwd, rootDir, direction, designDna, uiOptions);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# STATE ATLAS\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- State families: \`${payload.stateCount}\``);
  console.log(`- Required: \`${payload.requiredStates.join(', ')}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
