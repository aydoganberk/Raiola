const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildWorkspacePayload } = require('../scripts/workflow/workspaces_center');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-workspaces-center-'));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('workspaces center treats WORKSTREAMS as overlay on top of repo truth', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'overlay-fixture',
    private: true,
    workspaces: ['packages/*'],
  }, null, 2));
  writeFile(targetRepo, 'packages/core/package.json', JSON.stringify({ name: '@fixture/core' }, null, 2));
  writeFile(targetRepo, 'CODEOWNERS', '/packages/core @core-team\n');
  writeFile(targetRepo, 'docs/workflow/WORKSTREAMS.md', [
    '# WORKSTREAMS',
    '',
    '- Active workstream name: core',
    '- Active workstream root: docs/workflow',
    '',
    '## Workstream Table',
    '| Name | Root | Status | Current milestone | Step | Packet hash | Budget status | Health | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| @fixture/core | packages/core | active | NONE | mapped |  | n/a | green | Overlay row |',
    '',
  ].join('\n'));

  const payload = buildWorkspacePayload(targetRepo);
  const row = payload.workspaces.find((entry) => entry.root === 'packages/core');

  assert.equal(payload.registrySource, 'repo-truth+overlay');
  assert.equal(payload.overlay.role, 'coordination-overlay');
  assert.ok(row);
  assert.equal(row.sourceOfTruth, 'repo-truth');
  assert.equal(row.overlayApplied, true);
  assert.deepEqual(row.owners, ['@core-team']);
});
