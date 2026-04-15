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

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
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

test('lifecycle FSM, agent runtime contract, browser evidence, and worktree node_modules linking are active', () => {
  const targetRepo = makeTempRepo('raiola-phase48-');
  const targetBin = bootstrapRepo(targetRepo);

  const lifecycle = JSON.parse(run('node', [targetBin, 'lifecycle', '--json'], targetRepo));
  assert.equal(lifecycle.agentRuntime.type, 'AgentRuntimeContract');
  assert.ok(Array.isArray(lifecycle.stateMachine.validTransitions));
  assert.ok(lifecycle.agentRuntime.primary);

  const htmlPath = path.join(targetRepo, 'tmp-verify.html');
  fs.writeFileSync(htmlPath, '<!doctype html><html lang="en"><head><title>Fixture UI</title></head><body><main><h1>Dashboard</h1><button>Save</button><a href="/next">Continue</a></main></body></html>');
  const browser = JSON.parse(run('node', [targetBin, 'verify-browser', '--url', htmlPath, '--json'], targetRepo));
  assert.ok(browser.artifacts.accessibilityTree.endsWith('accessibility-tree.json'));
  assert.ok(fs.existsSync(path.join(targetRepo, browser.artifacts.accessibilityTree)));
  assert.equal(browser.accessibility.verdict, 'pass');

  fs.mkdirSync(path.join(targetRepo, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, 'node_modules', '.keep'), 'fixture');
  const isolationScript = path.join(targetRepo, 'scripts', 'workflow', 'ensure_isolation.js');
  const isolation = JSON.parse(run('node', [isolationScript, '--mode', 'worktree', '--link-node-modules', '--json'], targetRepo));
  assert.equal(isolation.status, 'pass');
  assert.ok(isolation.worktreePath);
  assert.ok(isolation.nodeModulesLink);
  assert.equal(isolation.nodeModulesLink.linked, true);
  assert.ok(fs.lstatSync(path.join(isolation.worktreePath, 'node_modules')).isSymbolicLink());
});
