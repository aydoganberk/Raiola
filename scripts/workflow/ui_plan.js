const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiSpec } = require('./ui_spec');
const { relativePath, writeDoc } = require('./frontend_os');

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const spec = buildUiSpec(cwd, rootDir);
  const body = `
- UI spec: \`${spec.file}\`
- Primary framework: \`${spec.profile.framework.primary}\`

## Execution Order

- \`Lock information architecture and critical states first.\`
- \`Prefer shared components from the inventory before adding new primitives.\`
- \`Validate responsive behavior on each breakpoint row.\`
- \`Close with ui-review plus browser evidence.\`
`;
  const filePath = writeDoc(path.join(rootDir, 'UI-PLAN.md'), 'UI PLAN', body);
  const payload = {
    file: relativePath(cwd, filePath),
    uiSpec: spec.file,
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
