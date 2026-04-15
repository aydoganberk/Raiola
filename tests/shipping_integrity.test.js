const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildDoctorReport } = require('../scripts/workflow/doctor');
const { resolveWorkflowRoot } = require('../scripts/workflow/common');
const { embeddedProductMeta } = require('../scripts/workflow/product_version');
const packageJson = require('../package.json');

test('source repo release inventory and embedded version stay green', () => {
  const cwd = path.resolve(__dirname, '..');
  const report = buildDoctorReport(cwd, resolveWorkflowRoot(cwd));
  const releaseInventory = report.checks.find((check) => check.message.startsWith('Release inventory -> package.json files entries resolve'));
  const githubSurface = report.checks.find((check) => check.message.startsWith('Release inventory -> GitHub surfaces are present'));
  const archiveHygiene = report.checks.find((check) => check.message.startsWith('Release inventory -> archive hygiene excludes .workflow runtime state'));

  const unexpectedFailures = report.checks.filter((check) => check.status === 'fail' && !check.message.startsWith('Node.js runtime ->'));

  assert.equal(unexpectedFailures.length, 0);
  assert.ok(releaseInventory);
  assert.equal(releaseInventory.status, 'pass');
  assert.ok(githubSurface);
  assert.equal(githubSurface.status, 'pass');
  assert.ok(archiveHygiene);
  assert.equal(archiveHygiene.status, 'pass');
  assert.equal(embeddedProductMeta().version, packageJson.version);
});
