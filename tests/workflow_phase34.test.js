const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
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

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('verify-work and ship-readiness publish release-control boards from the shared findings registry', () => {
  const targetRepo = makeTempRepo('raiola-phase34-release-control-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M60',
      '--name', 'Release control audit',
      '--goal', 'Exercise release-control boards across verify-work and ship-readiness',
    ],
    targetRepo,
  );

  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { return a + b; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { const token = process.env.API_TOKEN; return token ? a - b : a + b; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo);

  const verifyWork = JSON.parse(run('node', [targetBin, 'verify-work', '--status', 'fail', '--checks', 'Manual gate failed', '--json'], targetRepo));
  const shipReadiness = JSON.parse(run('node', [targetBin, 'ship-readiness', '--json'], targetRepo));
  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const html = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');
  const state = JSON.parse(fs.readFileSync(path.join(targetRepo, dashboard.stateFile), 'utf8'));

  assert.equal(verifyWork.releaseControl.activeSurface, 'verify-work');
  assert.ok(verifyWork.releaseControl.findingsStatusModel.sharedRegistryAvailable);
  assert.ok(verifyWork.releaseControl.verifyStatusBoard.queuedForVerifyCount >= 1);
  assert.ok(verifyWork.releaseControl.verifyStatusBoard.failedVerificationCount >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, verifyWork.artifacts.releaseControl)));
  assert.ok(fs.existsSync(path.join(targetRepo, verifyWork.artifacts.releaseControlMarkdown)));

  assert.equal(shipReadiness.releaseControl.activeSurface, 'ship-readiness');
  assert.ok(shipReadiness.releaseControl.shipReadinessBoard.shipBlockerCount >= 1);
  assert.ok(shipReadiness.releaseControl.shipReadinessBoard.releaseWave.primaryCommand);
  assert.ok(fs.existsSync(path.join(targetRepo, shipReadiness.artifacts.releaseControl)));
  assert.ok(fs.existsSync(path.join(targetRepo, shipReadiness.artifacts.releaseControlMarkdown)));

  assert.match(html, /Verify Status Board/i);
  assert.match(html, /Ship Readiness Board/i);
  assert.ok(state.releaseControl.verifyStatusBoard.queuedForVerifyCount >= 1);
  assert.ok(state.releaseControl.shipReadinessBoard.shipBlockerCount >= 1);
});
