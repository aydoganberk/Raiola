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

test('import graph, component inventory, delta checkpoints, and token/evidence exports are productized', () => {
  const targetRepo = makeTempRepo('raiola-phase47-');
  const targetBin = bootstrapRepo(targetRepo);

  fs.appendFileSync(path.join(targetRepo, 'packages', 'ui', 'src', 'Card.tsx'), '\nexport const CardTone = "warm";\n');

  const impact = JSON.parse(run('node', [targetBin, 'workspace-impact', '--json'], targetRepo));
  assert.equal(impact.repoShape, 'monorepo');
  assert.ok(impact.packageBoard.some((row) => row.packageId === 'packages/ui' && row.changed));
  assert.ok(impact.packageBoard.some((row) => row.packageId === 'apps/web' && row.importImpactedFileCount >= 1));

  const componentMap = JSON.parse(run('node', [targetBin, 'component-map', '--json'], targetRepo));
  const card = componentMap.inventory.find((entry) => /Card\.tsx$/.test(entry.file));
  assert.ok(card);
  assert.ok(card.consumerCount >= 2);
  assert.ok(Array.isArray(card.exports) && card.exports.includes('Card'));

  const uiDirection = JSON.parse(run('node', [targetBin, 'ui-direction', '--goal', 'ship a premium fixture dashboard', '--json'], targetRepo));
  assert.ok(uiDirection.tokenExports.css.endsWith('tokens.css'));
  assert.ok(fs.existsSync(path.join(targetRepo, uiDirection.tokenExports.figmaVariables)));
  assert.ok(fs.existsSync(path.join(targetRepo, uiDirection.tokenExports.tailwindPartial)));

  const firstCheckpoint = JSON.parse(run('node', [targetBin, 'checkpoint', '--next', 'Resume from test checkpoint', '--json'], targetRepo));
  const secondCheckpoint = JSON.parse(run('node', [targetBin, 'checkpoint', '--next', 'Resume from updated checkpoint', '--json'], targetRepo));
  assert.ok(firstCheckpoint.deltaFile);
  assert.ok(secondCheckpoint.deltaFile);
  assert.equal(secondCheckpoint.checkpointStrategy, 'delta-only');
  assert.ok(secondCheckpoint.deltaOperationCount >= 1);

  const evidence = JSON.parse(run('node', [targetBin, 'evidence', '--json'], targetRepo));
  assert.ok(evidence.evidenceStore.objectCount >= 0);

  const explain = JSON.parse(run('node', [targetBin, 'explain', '--goal', 'review and patch the fixture monorepo', '--json'], targetRepo));
  assert.equal(explain.reasoningTrace.type, 'ExplainTrace');
  assert.ok(Array.isArray(explain.reasoningTrace.recommendedCommands));

  const repoConfig = JSON.parse(run('node', [targetBin, 'repo-config', '--json'], targetRepo));
  assert.ok(Array.isArray(repoConfig.packageOverrides));
});
