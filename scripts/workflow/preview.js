const path = require('node:path');
const { parseArgs } = require('./common');
const { latestBrowserArtifacts, relativePath, writeDoc } = require('./frontend_os');

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const artifacts = latestBrowserArtifacts(cwd);
  const body = `
## Preview Gallery

${artifacts.length > 0
    ? artifacts.map((entry) => `- \`${entry.path}\` -> ${entry.meta?.summary || 'no summary'}`).join('\n')
    : '- `No browser verification artifacts are available yet.`'}
`;
  const filePath = writeDoc(path.join(cwd, '.workflow', 'runtime', 'preview-gallery.md'), 'PREVIEW GALLERY', body);
  const payload = {
    file: relativePath(cwd, filePath),
    entries: artifacts,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# PREVIEW\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Entries: \`${payload.entries.length}\``);
}

if (require.main === module) {
  main();
}
