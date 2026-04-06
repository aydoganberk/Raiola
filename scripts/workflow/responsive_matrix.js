const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const {
  buildFrontendProfile,
  buildResponsiveMatrix,
  collectComponentInventory,
  relativePath,
  writeDoc,
} = require('./frontend_os');

function buildResponsiveMatrixDoc(cwd, rootDir) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const rows = buildResponsiveMatrix(profile, inventory);
  const body = `
- Frontend mode: \`${profile.frontendMode.status}\`

## Breakpoints

${rows.map((row) => `- \`${row.viewport} ${row.width}\` -> ${row.expectation} | components: ${row.components.join(', ') || 'none'} | evidence: ${row.evidence}`).join('\n')}
`;
  const filePath = writeDoc(path.join(rootDir, 'RESPONSIVE-MATRIX.md'), 'RESPONSIVE MATRIX', body);
  return {
    file: relativePath(cwd, filePath),
    rows,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildResponsiveMatrixDoc(cwd, rootDir);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# RESPONSIVE MATRIX\n');
  console.log(`- File: \`${payload.file}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildResponsiveMatrixDoc,
};
