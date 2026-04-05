const path = require('node:path');
const { parseArgs } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

const DEFAULT_SERVERS = [
  'workflow-state',
  'packet',
  'evidence',
  'mailbox',
  'thread-memory',
  'policy',
];

function manifestPath(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'mcp', 'manifest.json');
}

function loadManifest(cwd) {
  const manifest = readJsonFile(manifestPath(cwd), null);
  if (manifest) {
    return manifest;
  }
  const seeded = {
    generatedAt: new Date().toISOString(),
    enabled: false,
    servers: DEFAULT_SERVERS,
  };
  writeJsonFile(manifestPath(cwd), seeded);
  return seeded;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/mcp.js install|doctor|status [--json]');
    return;
  }
  const cwd = process.cwd();
  const manifest = loadManifest(cwd);
  const payload = {
    action,
    file: relativePath(cwd, manifestPath(cwd)),
    manifest,
    verdict: 'pass',
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# MCP\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Enabled: \`${manifest.enabled ? 'yes' : 'no'}\``);
  console.log(`- Servers: \`${manifest.servers.join(', ')}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
