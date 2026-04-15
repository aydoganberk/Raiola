const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const largeMonorepoFixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(largeMonorepoFixture, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd, extra = {}) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
    encoding: 'utf8',
    input: extra.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

function bootstrapRepo(targetRepo) {
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'initial state'], targetRepo);
  return path.join(targetRepo, 'bin', 'rai.js');
}

test('codex mission materializes a reusable execution capsule with trust, recovery, and resume surfaces', () => {
  const targetRepo = makeTempRepo('raiola-phase46-mission-');
  const targetBin = bootstrapRepo(targetRepo);

  const help = run('node', [targetBin, 'codex', 'help'], targetRepo);
  assert.match(help, /mission\s+Materialize an execution capsule/i);

  const mission = JSON.parse(run('node', [
    targetBin,
    'codex',
    'mission',
    '--goal',
    'stabilize repo-native codex execution with bounded closeout',
    '--json',
  ], targetRepo));

  assert.equal(mission.action, 'mission');
  assert.ok(mission.missionId.includes('stabilize-repo-native-codex-execution'));
  assert.ok(['interactive', 'exec', 'ephemeral-exec', 'app-server'].includes(mission.preferredEntrypoint));
  assert.ok(['verify-and-checkpoint', 'trust-release-handoff'].includes(mission.closeoutProtocol));
  assert.ok(Array.isArray(mission.stages) && mission.stages.length >= 3);
  assert.ok(Array.isArray(mission.recoveryLadder) && mission.recoveryLadder.length >= 3);
  assert.ok(mission.files.operator.endsWith('.json'));
  assert.ok(mission.files.cockpit.endsWith('.json'));
  assert.ok(mission.files.trustCenter.endsWith('.json'));
  assert.ok(mission.files.releaseControl.endsWith('.json'));
  assert.ok(mission.files.handoff.endsWith('.json'));
  assert.ok(mission.files.missionLauncher.endsWith('launch-mission.sh'));
  assert.ok(mission.resume.command);
  assert.ok(mission.trust.verdict);
  assert.ok(typeof mission.release.shipAllowed === 'boolean');

  for (const relativeFile of [
    mission.file,
    mission.markdownFile,
    mission.recoveryFile,
    mission.files.missionLauncher,
    mission.files.operator,
    mission.files.cockpit,
    mission.files.telemetry,
    mission.files.trustCenter,
    mission.files.releaseControl,
    mission.files.handoff,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  const charter = fs.readFileSync(path.join(targetRepo, mission.markdownFile), 'utf8');
  assert.match(charter, /CODEX MISSION CHARTER/);
  assert.match(charter, /Mission stages/);
  assert.match(charter, /Recovery ladder/);

  const recovery = fs.readFileSync(path.join(targetRepo, mission.recoveryFile), 'utf8');
  assert.match(recovery, /CODEX MISSION RECOVERY/);
  assert.match(recovery, /rai codex telemetry --json/);
  assert.match(recovery, /rai release-control --json/);
});
