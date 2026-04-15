const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix = 'raiola-hooks-default-off-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(blankFixture, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('source repo keeps codex hooks disabled by default', () => {
  const config = fs.readFileSync(path.join(repoRoot, '.codex', 'config.toml'), 'utf8');
  const status = JSON.parse(run('node', [path.join(repoRoot, 'scripts', 'workflow', 'hooks.js'), 'status', '--json'], repoRoot));

  assert.match(config, /codex_hooks = false/);
  assert.equal(fs.existsSync(path.join(repoRoot, '.codex', 'hooks.json')), false);
  assert.equal(status.hooksEnabled, false);
  assert.equal(status.registrationPresent, false);
  assert.equal(status.shippedHookAssets.present, true);
});

test('repo setup leaves hooks off until explicitly enabled', () => {
  const targetRepo = makeTempRepo();
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const hooksScript = path.join(repoRoot, 'scripts', 'workflow', 'hooks.js');
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const configPath = path.join(targetRepo, '.codex', 'config.toml');
  const hookConfigPath = path.join(targetRepo, '.codex', 'hooks.json');

  const initialStatus = JSON.parse(run('node', [targetBin, 'codex', 'status', '--repo', '--json'], targetRepo));
  assert.equal(initialStatus.hooksEnabled, false);
  assert.equal(initialStatus.hooksExists, false);
  assert.equal(fs.existsSync(hookConfigPath), false);
  assert.match(fs.readFileSync(configPath, 'utf8'), /codex_hooks = false/);

  const enabled = JSON.parse(run('node', [hooksScript, 'enable', '--json'], targetRepo));
  assert.equal(enabled.hooksEnabled, true);
  assert.equal(enabled.registrationPresent, true);
  assert.equal(fs.existsSync(hookConfigPath), true);
  assert.match(fs.readFileSync(configPath, 'utf8'), /codex_hooks = true/);

  const validateEnabled = JSON.parse(run('node', [hooksScript, 'validate', '--json'], targetRepo));
  assert.equal(validateEnabled.verdict, 'pass');
  assert.equal(validateEnabled.registrationRequired, true);

  const disabled = JSON.parse(run('node', [hooksScript, 'disable', '--json'], targetRepo));
  assert.equal(disabled.hooksEnabled, false);
  assert.equal(disabled.registrationPresent, false);
  assert.equal(fs.existsSync(hookConfigPath), false);
  assert.match(fs.readFileSync(configPath, 'utf8'), /codex_hooks = false/);
});

test('codex setup can opt into hooks explicitly and disable them again', () => {
  const targetRepo = makeTempRepo('raiola-hooks-enable-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const hookConfigPath = path.join(targetRepo, '.codex', 'hooks.json');

  const enabled = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--enable-hooks', '--json'], targetRepo));
  assert.equal(enabled.hooksEnabled, true);
  assert.equal(fs.existsSync(hookConfigPath), true);

  const disabled = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--disable-hooks', '--json'], targetRepo));
  assert.equal(disabled.hooksEnabled, false);
  assert.equal(fs.existsSync(hookConfigPath), false);
});
