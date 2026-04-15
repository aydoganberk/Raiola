const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');
const { buildDoPayload } = require('../scripts/workflow/do');
const { buildRepoProof } = require('../scripts/workflow/repo_proof');
const { resolveWorkflowRoot } = require('../scripts/workflow/common');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-contract-'));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('stable json surfaces advertise schema and contract version', () => {
  const startPayload = JSON.parse(run('node', [raiBin, 'start', 'recommend', '--goal', 'land the next safe slice', '--json'], repoRoot));
  const doPayload = buildDoPayload(repoRoot, resolveWorkflowRoot(repoRoot), 'fix the next safe slice');
  const repoProof = buildRepoProof(repoRoot, { write: false });

  assert.equal(startPayload.schema, 'raiola/start-plan/v1');
  assert.equal(doPayload.schema, 'raiola/do-route/v1');
  assert.equal(repoProof.schema, 'raiola/repo-proof/v1');
  assert.equal(startPayload.contractVersion, '2026-04');
  assert.equal(doPayload.contractVersion, '2026-04');
  assert.equal(repoProof.contractVersion, '2026-04');
});

test('installed product manifest records artifact schemas and generated-artifact cleanup coverage', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const manifest = JSON.parse(fs.readFileSync(path.join(targetRepo, '.workflow', 'product-manifest.json'), 'utf8'));
  const installReport = JSON.parse(fs.readFileSync(path.join(targetRepo, '.workflow', 'install-report.json'), 'utf8'));

  assert.equal(manifest.schema, 'raiola/product-manifest/v3');
  assert.equal(manifest.contractVersion, '2026-04');
  assert.equal(manifest.cliContractVersion, '2026-04');
  assert.equal(manifest.artifactSchemas.start, 'raiola/start-plan/v1');
  assert.equal(manifest.generatedArtifacts.schema, 'raiola/generated-artifacts/v1');
  assert.equal(installReport.schema, 'raiola/setup-plan/v1');
  assert.equal(installReport.compatibility.schema, 'raiola/install-compatibility/v1');
});
