const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { detectRepoTruth } = require('../scripts/workflow/repo_truth');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-repo-truth-'));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('detectRepoTruth derives workspace and ownership truth from repo sources', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'polyglot-fixture',
    private: true,
    workspaces: ['packages/*'],
  }, null, 2));
  writeFile(targetRepo, 'go.work', 'go 1.22\nuse ./services/go-api\n');
  writeFile(targetRepo, 'packages/core/package.json', JSON.stringify({ name: '@fixture/core' }, null, 2));
  writeFile(targetRepo, 'services/go-api/go.mod', 'module example.com/go-api\n');
  writeFile(targetRepo, 'services/rust-engine/Cargo.toml', '[package]\nname = "rust-engine"\nversion = "0.1.0"\n');
  writeFile(targetRepo, 'CODEOWNERS', [
    '/packages/core @team-core',
    '/services/go-api @team-go',
    '/services/rust-engine @team-engine',
    '',
  ].join('\n'));

  const truth = detectRepoTruth(targetRepo);
  const byRoot = Object.fromEntries(truth.workspaces.map((workspace) => [workspace.root, workspace]));

  assert.deepEqual(truth.sources, ['go.work', 'manifest-scan', 'package.json']);
  assert.deepEqual(truth.ecosystems, ['go', 'node', 'rust']);
  assert.equal(truth.ownership.source, 'CODEOWNERS');
  assert.equal(truth.markers.go, true);
  assert.equal(byRoot['packages/core'].ecosystem, 'node');
  assert.deepEqual(byRoot['packages/core'].owners, ['@team-core']);
  assert.equal(byRoot['services/go-api'].ecosystem, 'go');
  assert.deepEqual(byRoot['services/go-api'].owners, ['@team-go']);
  assert.equal(byRoot['services/rust-engine'].ecosystem, 'rust');
  assert.deepEqual(byRoot['services/rust-engine'].owners, ['@team-engine']);
});
