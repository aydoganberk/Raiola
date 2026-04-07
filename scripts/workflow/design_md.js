const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');
const { buildDesignMdDoc, buildPageBlueprintDoc } = require('./frontend_briefs');

function printHelp() {
  console.log(`
design_md

Usage:
  node scripts/workflow/design_md.js

Options:
  --goal <text>       Optional product/UI goal to steer the export
  --taste <id>        Optional explicit taste profile override
  --page <id>         Optional explicit page type override
  --project-root      Also sync a repo-root DESIGN.md for agent consumption
  --root <path>       Workflow root. Defaults to active workstream root
  --json              Print machine-readable output
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
    projectRoot: Boolean(args['project-root']),
  };
  const direction = buildUiDirection(cwd, rootDir, options);
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, options);
  const stateAtlas = buildStateAtlasDoc(cwd, rootDir, direction, designDna, options);
  const pageBlueprint = buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, options);
  const payload = buildDesignMdDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DESIGN MD\n');
  console.log(`- File: \`${payload.file}\``);
  if (payload.projectRootFile) {
    console.log(`- Project root mirror: \`${payload.projectRootFile}\``);
  }
  console.log(`- Page type: \`${payload.pageType.label}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
