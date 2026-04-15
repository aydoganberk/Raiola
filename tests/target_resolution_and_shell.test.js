const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');
const setupScript = path.join(repoRoot, 'scripts', 'workflow', 'setup.js');
const updateScript = path.join(repoRoot, 'scripts', 'workflow', 'update.js');
const uninstallScript = path.join(repoRoot, 'scripts', 'workflow', 'uninstall.js');

function makeTempRepo(prefix = 'raiola-target-resolution-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(blankFixture, tempDir, { recursive: true });
  return tempDir;
}

function makeTempDir(prefix = 'raiola-runner-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('setup positional target installs into the requested repo instead of the caller cwd', () => {
  const runnerDir = makeTempDir();
  const targetRepo = makeTempRepo();

  run('node', [sourceBin, 'setup', targetRepo, '--skip-verify'], runnerDir);

  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'product-manifest.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'bin', 'rai.js')));
  assert.equal(fs.existsSync(path.join(runnerDir, '.workflow', 'product-manifest.json')), false);
  assert.equal(fs.existsSync(path.join(runnerDir, 'bin', 'rai.js')), false);
});

test('dry-run maintenance surfaces honor positional target paths', () => {
  const runnerDir = makeTempDir('raiola-runner-dryrun-');
  const targetRepo = makeTempRepo('raiola-target-dryrun-');

  const setupPayload = JSON.parse(run('node', [setupScript, targetRepo, '--dry-run', '--json'], runnerDir));
  const updatePayload = JSON.parse(run('node', [updateScript, targetRepo, '--dry-run', '--json'], runnerDir));
  const uninstallPayload = JSON.parse(run('node', [uninstallScript, targetRepo, '--dry-run', '--json'], runnerDir));

  assert.equal(path.resolve(setupPayload.targetRepo), path.resolve(targetRepo));
  assert.equal(path.resolve(updatePayload.targetRepo), path.resolve(targetRepo));
  assert.equal(path.resolve(uninstallPayload.targetRepo), path.resolve(targetRepo));
});

test('pilot shell exposes hooks status after fresh setup', () => {
  const targetRepo = makeTempRepo('raiola-hooks-pilot-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const hooksStatus = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'hooks', 'status', '--json'], targetRepo));

  assert.equal(hooksStatus.hooksEnabled, false);
  assert.equal(hooksStatus.registrationPresent, false);
  assert.equal(hooksStatus.shippedHookAssets.present, true);
});

test('doctor run through an external rai binary does not treat the target repo as the Raiola source package', () => {
  const targetRepo = makeTempRepo('raiola-external-doctor-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const doctorPayload = JSON.parse(run('node', [sourceBin, 'doctor', '--json'], targetRepo));
  const githubCheck = doctorPayload.checks.find((check) => check.message.startsWith('Release inventory -> GitHub surfaces'));

  assert.equal(githubCheck, undefined);
  assert.equal(
    doctorPayload.checks.some((check) => /missing GitHub surfaces/.test(check.message)),
    false,
  );
});
