const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiRecipeScaffold } = require('./ui_recipe');
const { buildUiSpec } = require('./ui_spec');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');
const { buildDesignMdDoc, buildPageBlueprintDoc } = require('./frontend_briefs');
const { buildComponentStrategyDoc, buildDesignBenchmarkDoc } = require('./frontend_strategy');
const { relativePath, writeDoc } = require('./frontend_os');

function printHelp() {
  console.log(`
ui_plan

Usage:
  node scripts/workflow/ui_plan.js

Options:
  --goal <text>  Optional product/UI goal to steer the brief
  --taste <id>   Optional explicit taste profile override
  --page <id>    Optional explicit page type override for downstream briefs
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
    page: args.page ? String(args.page).trim() : '',
  };
  const spec = buildUiSpec(cwd, rootDir, uiOptions);
  const direction = buildUiDirection(cwd, rootDir, uiOptions);
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, uiOptions);
  const stateAtlas = buildStateAtlasDoc(cwd, rootDir, direction, designDna, uiOptions);
  const pageBlueprint = buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, uiOptions);
  const designMd = buildDesignMdDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, uiOptions);
  const componentStrategy = buildComponentStrategyDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint);
  const designBenchmark = buildDesignBenchmarkDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy);
  const recipe = buildUiRecipeScaffold(cwd, rootDir, uiOptions);
  const body = `
- UI spec: \`${spec.file}\`
- UI direction: \`${direction.file}\`
- Design DNA: \`${designDna.file}\`
- State atlas: \`${stateAtlas.file}\`
- Page blueprint: \`${pageBlueprint.file}\`
- DESIGN.md export: \`${designMd.file}\`
- Component strategy: \`${componentStrategy.file}\`
- Design benchmark: \`${designBenchmark.file}\`
- UI recipe: \`${recipe.file}\`
- Primary framework: \`${spec.profile.framework.primary}\`
- Product archetype: \`${direction.archetype.label}\`
- Taste profile: \`${direction.taste.profile.label}\`
- Taste signature: \`${direction.taste.tagline}\`
- Experience thesis: \`${direction.experienceThesis.title}\`

## Execution Order

- \`Lock shell hierarchy, core states, and responsive layout before decorative polish.\`
- \`Choose the external design blend (${designDna.blend.summary}) before touching hero art, card styling, or accent color usage.\`
- \`Use ${pageBlueprint.pageType.label} as the default section spine instead of inventing page structure ad hoc.\`
- \`Follow ${componentStrategy.file} so reuse/extract/build decisions happen before page-local duplication spreads.\`
- \`Translate the UI direction into tokens, spacing, radius, and typography decisions early.\`
- \`Use STATE-ATLAS as a hard requirement for loading, empty, error, success, and high-risk transitions.\`
- \`Use the selected recipe scaffold (${recipe.recipe.title}) as the first implementation slice before widening the surface.\`
- \`Use the selected taste profile (${direction.taste.profile.label}) as the tie-breaker when multiple UI options seem valid.\`
- \`Patch empty/loading/error/success states together when they share the same component boundary.\`
- \`Validate responsive behavior on each breakpoint row.\`
- \`Close with ui-review plus browser evidence.\`

## Reference Blend

- \`${designDna.blend.summary}\`
${designDna.references.map((item) => `- \`${item.label}\` -> adopt ${item.adopt[0]}`).join('\n')}

## Required State Atlas

${stateAtlas.requiredStates.map((item) => `- \`${item}\``).join('\n')}
${stateAtlas.atlasGuidance.map((item) => `- \`${item}\``).join('\n')}

## Page Blueprint

${pageBlueprint.sections.map((item) => `- \`${item.title}\` -> components: ${item.components.join(', ')} | states: ${item.states.join(', ')}`).join('\n')}

## Component Strategy

${componentStrategy.reuseNow.length > 0
    ? componentStrategy.reuseNow.map((item) => `- \`Reuse ${item.title}\` -> ${item.file}`).join('\n')
    : '- `No obvious shared reuse candidate was detected yet.`'}
${componentStrategy.buildNow.length > 0
    ? componentStrategy.buildNow.map((item) => `- \`Build ${item.title}\` -> ${item.target}`).join('\n')
    : '- `No urgent build target is missing from inventory coverage.`'}

## Design Benchmark

${designBenchmark.differentiationPlays.map((item) => `- \`${item.title}\` -> ${item.move}`).join('\n')}
${designBenchmark.reviewQuestions.slice(0, 3).map((item) => `- \`${item}\``).join('\n')}

## DESIGN.md Export

- \`${designMd.file}\`
- \`Use this file as the portable design contract when another agent or tool expects a DESIGN.md surface.\`

## Signature Moments To Land

${direction.signatureMoments.map((item) => `- \`${item.title}: ${item.description}\``).join('\n')}

## Screen Blueprint Priorities

${direction.screenBlueprints.map((item) => `- \`${item.title}: ${item.recipe}\``).join('\n')}

## Design System Actions

${direction.designSystemActions.map((item) => `- \`${item}\``).join('\n')}

## Recipe Scaffold

- \`${recipe.recipe.title}: ${recipe.recipe.structure}\`
${recipe.translationNotes.map((item) => `- \`${item}\``).join('\n')}
${recipe.verificationPlan.map((item) => `- \`Verify: ${item}\``).join('\n')}

## Codex Prompts

${direction.implementationPrompts.map((item) => `- \`${item}\``).join('\n')}

## Codex Notes

${direction.codexRecipes.map((item) => `- \`${item}\``).join('\n')}
`;
  const filePath = writeDoc(path.join(rootDir, 'UI-PLAN.md'), 'UI PLAN', body);
  const payload = {
    file: relativePath(cwd, filePath),
    uiSpec: spec.file,
    uiDirection: direction.file,
    designDna: designDna.file,
    stateAtlas: stateAtlas.file,
    pageBlueprint: pageBlueprint.file,
    designMd: designMd.file,
    componentStrategy: componentStrategy.file,
    designBenchmark: designBenchmark.file,
    uiRecipe: recipe.file,
    archetype: direction.archetype.label,
    tasteProfile: direction.taste.profile.id,
    signatureMoments: direction.signatureMoments.length,
    screenBlueprints: direction.screenBlueprints.length,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# UI PLAN\n');
  console.log(`- File: \`${payload.file}\``);
}

if (require.main === module) {
  main();
}
