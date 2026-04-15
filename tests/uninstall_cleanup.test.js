const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-uninstall-cleanup-'));
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

test('uninstall report advertises generated-artifact cleanup coverage and preserves docs by default', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  fs.mkdirSync(path.join(targetRepo, '.workflow', 'runtime', 'custom-lane'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, '.workflow', 'runtime', 'custom-lane', 'artifact.json'), '{"ok":true}\n');
  fs.writeFileSync(path.join(targetRepo, '.workflow', 'repo-config.json'), '{"ok":true}\n');

  const uninstall = JSON.parse(run('node', [raiBin, 'uninstall', '--target', targetRepo, '--json'], repoRoot));

  assert.equal(uninstall.schema, 'raiola/uninstall-report/v1');
  assert.ok(uninstall.generatedArtifacts.cleanupCoverage.includes('.workflow/runtime'));
  assert.ok(uninstall.generatedArtifacts.cleanupCoverage.includes('.workflow/install-report.json'));
  assert.ok(uninstall.preserved.some((entry) => /docs\/workflow/.test(entry)));
  assert.ok(fs.existsSync(path.join(targetRepo, 'docs', 'workflow', 'STATUS.md')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflow', 'runtime')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflow', 'repo-config.json')));
});


test('uninstall removes the installed runtime footprint, not just generated artifacts', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const uninstall = JSON.parse(run('node', [raiBin, 'uninstall', '--target', targetRepo, '--json'], repoRoot));

  assert.equal(uninstall.installedRuntime.manifestPresent, true);
  assert.ok(!fs.existsSync(path.join(targetRepo, '.codex', 'config.toml')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.agents', 'plugins', 'marketplace.json')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflowignore')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'bin', 'raiola-mcp.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'package.json')));
});

test('uninstall blocks manifest paths that escape the target repo', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const outsideFile = path.join(path.dirname(targetRepo), 'escape-target.txt');
  fs.writeFileSync(outsideFile, 'preserve me\n');

  const manifestPath = path.join(targetRepo, '.workflow', 'product-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.generatedArtifacts.generatedArtifactFiles.push('../escape-target.txt');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const uninstall = JSON.parse(run('node', [raiBin, 'uninstall', '--target', targetRepo, '--json'], repoRoot));

  assert.ok(fs.existsSync(outsideFile));
  assert.ok(uninstall.blocked.includes('../escape-target.txt'));
});
