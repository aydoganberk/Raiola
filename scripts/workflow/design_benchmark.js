const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');
const { buildPageBlueprintDoc } = require('./frontend_briefs');
const { buildComponentStrategyDoc, buildDesignBenchmarkDoc } = require('./frontend_strategy');

function printHelp() {
  console.log(`
design_benchmark

Usage:
  node scripts/workflow/design_benchmark.js

Options:
  --goal <text>  Optional product/UI goal to steer the benchmark
  --taste <id>   Optional explicit taste profile override
  --page <id>    Optional explicit page type override
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
  const options = {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  };
  const direction = buildUiDirection(cwd, rootDir, options);
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, options);
  const stateAtlas = buildStateAtlasDoc(cwd, rootDir, direction, designDna, options);
  const pageBlueprint = buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, options);
  const componentStrategy = buildComponentStrategyDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint);
  const payload = buildDesignBenchmarkDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DESIGN BENCHMARK\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Differentiation plays: \`${payload.differentiationPlays.length}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
