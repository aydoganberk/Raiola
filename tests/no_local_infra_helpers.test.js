const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const { scanLocalInfraHelpers } = require(path.join(repoRoot, 'scripts', 'workflow', 'duplicate_helper_report'));

test('workflow runtime keeps local infra helpers on canonical modules only', () => {
  const report = scanLocalInfraHelpers(repoRoot, {
    scanRoot: path.join('scripts', 'workflow'),
  });

  assert.deepEqual(report.totals, {
    readJsonIfExists: 0,
    readTextIfExists: 0,
    detectPackageManager: 0,
    quoteShell: 0,
    commandFor: 0,
  });
  assert.deepEqual(report.duplicates, []);
});
