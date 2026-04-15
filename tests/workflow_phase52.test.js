const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const apiSurfaceScript = path.join(repoRoot, 'scripts', 'workflow', 'api_surface.js');
const auditRepoScript = path.join(repoRoot, 'scripts', 'workflow', 'audit_repo.js');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('api_surface and audit_repo can target an external repo snapshot through --repo', () => {
  const targetRepo = makeMezatLikeRepo('raiola-phase52-');
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-outside-'));

  const apiPayload = JSON.parse(run('node', [apiSurfaceScript, '--repo', targetRepo, '--json'], outsideDir));
  assert.equal(apiPayload.repoShape, 'monorepo');
  assert.ok(apiPayload.endpointCount >= 2);
  assert.ok(fs.existsSync(path.join(targetRepo, apiPayload.artifacts.runtimeJson)));

  const auditPayload = JSON.parse(run('node', [auditRepoScript, '--repo', targetRepo, '--goal', 'audit the external snapshot', '--json'], outsideDir));
  assert.equal(auditPayload.repoShape, 'monorepo');
  assert.ok(auditPayload.repoHealth.score >= 0);
  assert.ok(fs.existsSync(path.join(targetRepo, auditPayload.outputPathRelative)));
});
