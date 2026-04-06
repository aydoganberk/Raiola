const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiSpec } = require('./ui_spec');
const { buildUiDirection } = require('./design_intelligence');
const { relativePath, writeDoc } = require('./frontend_os');

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const spec = buildUiSpec(cwd, rootDir);
  const direction = buildUiDirection(cwd, rootDir);
  const body = `
- UI spec: \`${spec.file}\`
- UI direction: \`${direction.file}\`
- Primary framework: \`${spec.profile.framework.primary}\`
- Product archetype: \`${direction.archetype.label}\`
- Taste signature: \`${direction.taste.tagline}\`

## Execution Order

- \`Lock shell hierarchy, core states, and responsive layout before decorative polish.\`
- \`Prefer shared components from the inventory before adding new primitives.\`
- \`Translate the UI direction into tokens, spacing, radius, and typography decisions early.\`
- \`Patch empty/loading/error/success states together when they share the same component boundary.\`
- \`Validate responsive behavior on each breakpoint row.\`
- \`Close with ui-review plus browser evidence.\`

## Codex Notes

${direction.codexRecipes.map((item) => `- \`${item}\``).join('\n')}
`;
  const filePath = writeDoc(path.join(rootDir, 'UI-PLAN.md'), 'UI PLAN', body);
  const payload = {
    file: relativePath(cwd, filePath),
    uiSpec: spec.file,
    uiDirection: direction.file,
    archetype: direction.archetype.label,
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
