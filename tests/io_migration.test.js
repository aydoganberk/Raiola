const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const workflowDir = path.join(repoRoot, 'scripts', 'workflow');
const LEGACY_IO_NAMES = new Set(['ensureDir', 'read', 'readIfExists', 'write', 'writeIfChanged']);

function listWorkflowScripts(currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      listWorkflowScripts(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

test('workflow scripts import file IO helpers from io/* instead of the common facade', () => {
  const offenders = [];

  for (const filePath of listWorkflowScripts(workflowDir)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const commonImport = content.match(/const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\/common'\);/);
    if (!commonImport) {
      continue;
    }

    const importedNames = commonImport[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split(':', 1)[0].trim());
    const legacyHits = importedNames.filter((name) => LEGACY_IO_NAMES.has(name));
    if (legacyHits.length > 0) {
      offenders.push({
        file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
        legacyHits,
      });
    }
  }

  assert.deepEqual(offenders, []);
});
