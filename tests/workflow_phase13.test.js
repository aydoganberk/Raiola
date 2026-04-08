const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const ioFiles = require(path.join(repoRoot, 'scripts', 'workflow', 'io', 'files.js'));
const sections = require(path.join(repoRoot, 'scripts', 'workflow', 'markdown', 'sections.js'));
const packetCache = require(path.join(repoRoot, 'scripts', 'workflow', 'packet', 'cache.js'));
const { CLI_COMMANDS } = require(path.join(repoRoot, 'scripts', 'cli', 'rai.js'));

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase13-'));
}

test('io/files reads, writes, and caches text content', () => {
  const tempDir = makeTempDir();
  const filePath = path.join(tempDir, 'sample.txt');

  ioFiles.writeText(filePath, 'hello world\n');
  assert.equal(ioFiles.readText(filePath), 'hello world\n');
  assert.equal(ioFiles.readTextIfExists(filePath), 'hello world\n');
});

test('markdown/sections reads and updates fields and sections', () => {
  const doc = `# SAMPLE

- Status: \`draft\`

## Notes

- \`first note\`
`;

  assert.equal(sections.getFieldValue(doc, 'Status'), 'draft');
  assert.equal(sections.extractSection(doc, 'Notes'), '- `first note`');

  const next = sections.replaceOrAppendSection(
    sections.replaceOrAppendField(doc, 'Status', 'done'),
    'Summary',
    '- `finished`',
  );

  assert.equal(sections.getFieldValue(next, 'Status'), 'done');
  assert.equal(sections.extractSection(next, 'Summary'), '- `finished`');
});

test('markdown/sections supports CRLF documents', () => {
  const doc = '# WINDOW\r\n'
    + '\r\n'
    + '- Status: `draft`\r\n'
    + '\r\n'
    + '## Current Packet Summary\r\n'
    + '\r\n'
    + '- `first packet`\r\n'
    + '\r\n'
    + '## Notes\r\n'
    + '\r\n'
    + '- `keep line endings stable`\r\n';

  assert.equal(sections.extractSection(doc, 'Current Packet Summary'), '- `first packet`');

  const replaced = sections.replaceSection(doc, 'Current Packet Summary', '- `second packet`');
  assert.equal(sections.extractSection(replaced, 'Current Packet Summary'), '- `second packet`');
  assert.match(replaced, /\r\n## Notes\r\n/);

  const appended = sections.replaceOrAppendSection(replaced, 'Summary', '- `done`');
  assert.equal(sections.extractSection(appended, 'Summary'), '- `done`');
  assert.match(appended, /\r\n## Summary\r\n\r\n- `done`\r\n$/);
});

test('packet/cache stores runtime entries and snapshot cache on disk', () => {
  const tempDir = makeTempDir();
  const rootDir = path.join(tempDir, 'docs', 'workflow');
  fs.mkdirSync(rootDir, { recursive: true });

  packetCache.writePacketRuntimeEntry(tempDir, rootDir, 'context', 'discuss', {
    inputHash: 'abc123',
  });
  assert.deepEqual(
    packetCache.readPacketRuntimeEntry(tempDir, rootDir, 'context', 'discuss'),
    { inputHash: 'abc123' },
  );

  packetCache.setPacketSnapshotCache(tempDir, 'snapshot-key', { step: 'plan', cached: true });
  assert.deepEqual(packetCache.getPacketSnapshotCache(tempDir, 'snapshot-key'), { step: 'plan', cached: true });
  assert.ok(fs.existsSync(path.join(tempDir, '.workflow', 'cache', 'packet-snapshot-cache.json')));
});

test('product docs and command references exist', () => {
  const requiredFiles = [
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'DEMO.md',
    '.github/workflows/ci.yml',
    'docs/getting-started.md',
    'docs/commands.md',
    'docs/architecture.md',
    'docs/performance.md',
    'docs/roadmap-audit.md',
  ];

  for (const relativePath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `Missing required doc: ${relativePath}`);
  }

  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const architecture = fs.readFileSync(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');
  assert.match(readme, /rai quick/);
  assert.match(readme, /rai team/);
  assert.match(readme, /rai review/);
  assert.match(readme, /roadmap-audit\.md/);
  assert.match(architecture, /\.workflow\/VERSION\.md/);
});

test('commands documentation tracks the full CLI surface', () => {
  const commandsDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'commands.md'), 'utf8');

  for (const commandName of Object.keys(CLI_COMMANDS)) {
    const escaped = commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(commandsDoc, new RegExp(`rai ${escaped}`), `Missing commands doc entry for ${commandName}`);
  }
});
