const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const {
  detectLocalDeclarations,
  scanLocalInfraHelpers,
} = require(path.join(repoRoot, 'scripts', 'workflow', 'duplicate_helper_report'));

function writeFile(rootDir, relativeFile, content) {
  const filePath = path.join(rootDir, relativeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('duplicate helper guard catches local function declarations but ignores strings and canonical files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-dup-guard-'));

  writeFile(tempDir, 'scripts/workflow/io/json.js', 'function readJsonIfExists(filePath, fallback = null) { return fallback; }\nmodule.exports = { readJsonIfExists };\n');
  writeFile(tempDir, 'scripts/workflow/package/repo.js', 'function detectPackageManager(value) { return "npm"; }\nfunction quoteShell(value) { return value; }\nfunction commandFor() { return "npm test"; }\nmodule.exports = { detectPackageManager, quoteShell, commandFor };\n');
  writeFile(tempDir, 'scripts/workflow/feature.js', [
    'function readJsonIfExists(filePath) { return null; }',
    'const detectPackageManager = () => "npm";',
    'const commandFor = function () { return "npm test"; };',
    'const quoteShell = (value) => value;',
    'const example = "function readJsonIfExists(filePath) { return null; }";',
  ].join('\n'));
  writeFile(tempDir, 'scripts/workflow/notes.js', '// function detectPackageManager(files) { return "npm"; }\n');

  const report = scanLocalInfraHelpers(tempDir, {
    scanRoot: path.join('scripts', 'workflow'),
  });

  assert.deepEqual(report.totals, {
    readJsonIfExists: 1,
    readTextIfExists: 0,
    detectPackageManager: 1,
    quoteShell: 1,
    commandFor: 1,
  });
  assert.deepEqual(
    report.duplicates.map((entry) => ({ helper: entry.helper, file: entry.file })),
    [
      { helper: 'commandFor', file: 'scripts/workflow/feature.js' },
      { helper: 'detectPackageManager', file: 'scripts/workflow/feature.js' },
      { helper: 'quoteShell', file: 'scripts/workflow/feature.js' },
      { helper: 'readJsonIfExists', file: 'scripts/workflow/feature.js' },
    ],
  );

  assert.deepEqual(detectLocalDeclarations('const value = "function readJsonIfExists(filePath) {}";', 'readJsonIfExists'), []);
  assert.deepEqual(detectLocalDeclarations('// function commandFor() {}', 'commandFor'), []);
});
