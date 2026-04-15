const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const setupScript = path.join(repoRoot, 'scripts', 'workflow', 'setup.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-repair-guard-'));
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

test('repair ignores poisoned manifest runtime paths outside the trusted inventory', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const manifestPath = path.join(targetRepo, '.workflow', 'product-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.runtimeFiles.push('../repair-escape.txt');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const trustedFile = path.join(targetRepo, '.agents', 'skills', 'raiola', 'SKILL.md');
  const outsideFile = path.join(path.dirname(targetRepo), 'repair-escape.txt');
  fs.rmSync(trustedFile);
  fs.rmSync(outsideFile, { force: true });

  const repair = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'repair.js'), '--kind', 'doctor', '--apply', '--json'],
    targetRepo,
  ));

  assert.ok(repair.manualIssues.some((issue) => issue.type === 'manifest_runtime_paths_ignored'));
  assert.ok(fs.existsSync(trustedFile));
  assert.ok(!fs.existsSync(outsideFile));
});
