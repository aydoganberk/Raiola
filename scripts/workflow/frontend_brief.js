const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');
const { buildPageBlueprintDoc, buildDesignMdDoc } = require('./frontend_briefs');
const { buildComponentStrategyDoc, buildDesignBenchmarkDoc } = require('./frontend_strategy');
const { buildUiRecipeScaffold } = require('./ui_recipe');
const { buildUiSpec } = require('./ui_spec');
const { relativePath, writeDoc } = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
frontend_brief

Usage:
  node scripts/workflow/frontend_brief.js

Options:
  --goal <text>       Optional product/UI goal to steer the brief
  --taste <id>        Optional explicit taste profile override
  --page <id>         Optional explicit page type override
  --project-root      Also sync a repo-root DESIGN.md mirror
  --root <path>       Workflow root. Defaults to active workstream root
  --json              Print machine-readable output
  `);
}

function buildFrontendBrief(cwd, rootDir, options = {}) {
  const direction = buildUiDirection(cwd, rootDir, options);
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, options);
  const stateAtlas = buildStateAtlasDoc(cwd, rootDir, direction, designDna, options);
  const pageBlueprint = buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, options);
  const designMd = buildDesignMdDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options);
  const componentStrategy = buildComponentStrategyDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint);
  const designBenchmark = buildDesignBenchmarkDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy);
  const recipe = buildUiRecipeScaffold(cwd, rootDir, options);
  const spec = buildUiSpec(cwd, rootDir, options);

  const body = `
- UI direction: \`${direction.file}\`
- Design DNA: \`${designDna.file}\`
- State atlas: \`${stateAtlas.file}\`
- Page blueprint: \`${pageBlueprint.file}\`
- DESIGN.md export: \`${designMd.file}\`
- Component strategy: \`${componentStrategy.file}\`
- Design benchmark: \`${designBenchmark.file}\`
- UI recipe: \`${recipe.file}\`
- UI spec: \`${spec.file}\`

## Build Order

- \`Start with ${direction.experienceThesis.title} and the ${designDna.blend.summary} reference blend.\`
- \`Use ${pageBlueprint.pageType.label} as the default page structure.\`
- \`Reuse/extract/build via ${componentStrategy.file} before inventing new page-local components.\`
- \`Do not skip these required state families: ${stateAtlas.requiredStates.join(', ')}.\`
- \`Translate the DESIGN.md export into implementation prompts or root-level agent context when needed.\`

## Differentiation Plays

${designBenchmark.differentiationPlays.map((item) => `- \`${item.title}\` -> ${item.move}`).join('\n')}

## Immediate Codex Prompts

${designDna.codexRules.map((item) => `- \`${item}\``).join('\n')}
${pageBlueprint.implementationSequence.map((item) => `- \`${item}\``).join('\n')}
`;

  const filePath = writeDoc(path.join(rootDir, 'FRONTEND-BRIEF.md'), 'FRONTEND BRIEF', body);
  const payload = {
    generatedAt: new Date().toISOString(),
    file: relativePath(cwd, filePath),
    direction,
    designDna,
    stateAtlas,
    pageBlueprint,
    designMd,
    componentStrategy,
    designBenchmark,
    recipe,
    spec,
  };
  const runtimeFile = writeRuntimeJson(cwd, 'frontend-brief.json', payload);
  return {
    ...payload,
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildFrontendBrief(cwd, rootDir, {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
    projectRoot: Boolean(args['project-root']),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# FRONTEND BRIEF\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Page blueprint: \`${payload.pageBlueprint.file}\``);
  console.log(`- DESIGN.md export: \`${payload.designMd.file}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFrontendBrief,
  main,
};
