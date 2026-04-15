const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { applyMergeQueue } = require('../scripts/workflow/team_runtime_artifacts');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-materialization-guard-'));
}

test('applyMergeQueue blocks materialization manifests that escape repo boundaries', () => {
  const repo = makeTempRepo();
  const materializedDir = path.join(repo, '.workflow', 'orchestration', 'materialized');
  fs.mkdirSync(materializedDir, { recursive: true });

  const outsideTarget = path.join(os.tmpdir(), `raiola-materialized-target-${Date.now()}.txt`);
  const outsideSnapshot = path.join(os.tmpdir(), `raiola-materialized-snapshot-${Date.now()}.txt`);
  fs.writeFileSync(outsideTarget, 'keep');
  fs.writeFileSync(outsideSnapshot, 'pwned');

  const manifestFile = '.workflow/orchestration/materialized/tampered.manifest.json';
  fs.writeFileSync(path.join(repo, manifestFile), JSON.stringify({
    generatedAt: new Date().toISOString(),
    snapshotDir: '.workflow/orchestration/materialized/tampered',
    entries: [
      {
        path: path.relative(repo, outsideTarget).replace(/\\/g, '/'),
        exists: true,
        sha256: 'deadbeef',
        size: 5,
        permissions: 0o644,
        snapshotFile: path.relative(repo, outsideSnapshot).replace(/\\/g, '/'),
      },
    ],
  }, null, 2));

  const payload = applyMergeQueue(repo, {
    queue: [
      {
        taskId: 'T1',
        status: 'queued',
        patchFile: '.workflow/orchestration/patches/t1.patch',
        manifestFile,
        changedFiles: [],
      },
    ],
  }, { applyAll: true });

  assert.equal(payload.queue[0].status, 'conflict');
  assert.match(payload.queue[0].applyError, /boundary/i);
  assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'keep');
});
