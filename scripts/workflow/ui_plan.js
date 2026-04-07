const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiRecipeScaffold } = require('./ui_recipe');
const { buildUiSpec } = require('./ui_spec');
const { buildUiDirection } = require('./design_intelligence');
const { relativePath, writeDoc } = require('./frontend_os');

function printHelp() {
  console.log(`
ui_plan

Usage:
  node scripts/workflow/ui_plan.js

Options:
  --goal <text>  Optional product/UI goal to steer the brief
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
  const spec = buildUiSpec(cwd, rootDir, uiOptions);
  const direction = buildUiDirection(cwd, rootDir, uiOptions);
  const recipe = buildUiRecipeScaffold(cwd, rootDir, uiOptions);
  const body = `
- UI spec: \`${spec.file}\`
- UI direction: \`${direction.file}\`
- UI recipe: \`${recipe.file}\`
- Primary framework: \`${spec.profile.framework.primary}\`
- Product archetype: \`${direction.archetype.label}\`
- Taste profile: \`${direction.taste.profile.label}\`
- Taste signature: \`${direction.taste.tagline}\`
- Experience thesis: \`${direction.experienceThesis.title}\`

## Execution Order

- \`Lock shell hierarchy, core states, and responsive layout before decorative polish.\`
- \`Prefer shared components from the inventory before adding new primitives.\`
- \`Translate the UI direction into tokens, spacing, radius, and typography decisions early.\`
- \`Use the selected recipe scaffold (${recipe.recipe.title}) as the first implementation slice before widening the surface.\`
- \`Use the selected taste profile (${direction.taste.profile.label}) as the tie-breaker when multiple UI options seem valid.\`
- \`Patch empty/loading/error/success states together when they share the same component boundary.\`
- \`Validate responsive behavior on each breakpoint row.\`
- \`Close with ui-review plus browser evidence.\`

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
