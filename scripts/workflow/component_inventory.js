const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const {
  buildFrontendProfile,
  collectComponentInventory,
  relativePath,
  writeDoc,
} = require('./frontend_os');

function buildComponentInventoryDoc(cwd, rootDir) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const body = `
- Framework: \`${profile.framework.primary}\`
- UI system: \`${profile.uiSystem.primary}\`

## Components

${inventory.length > 0
    ? inventory.map((item) => `- \`${item.name}\` -> ${item.file} (${item.shared ? 'shared' : 'local'})`).join('\n')
    : '- `No component files were detected.`'}
`;
  const filePath = writeDoc(path.join(rootDir, 'COMPONENT-INVENTORY.md'), 'COMPONENT INVENTORY', body);
  return {
    file: relativePath(cwd, filePath),
    inventory,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildComponentInventoryDoc(cwd, rootDir);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# COMPONENT INVENTORY\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Components: \`${payload.inventory.length}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildComponentInventoryDoc,
  main,
};
