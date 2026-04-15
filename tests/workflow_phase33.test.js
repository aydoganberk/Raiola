const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const largeMonorepoFixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepoFromFixture(fixturePath, prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(fixturePath, tempDir, { recursive: true });
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

test('start recommend routes correction-heavy goals into correction-wave with repair and regression overlays', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase33-start-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'recommend', '--goal', 'fix the highest-risk review findings and verify the patch wave', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'correction-wave');
  assert.match(payload.recommendedStarterCommand, /rai start correction --goal/);
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'repair'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'regression'));
  assert.equal(payload.selectionReason, 'correction_lane');
});

test('start correction exposes triage, repair, and regression phases in one bundled plan', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase33-bundle-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'correction', '--goal', 'fix the highest-risk review findings and verify the patch wave', '--with', 'repair|regression', '--json'],
    targetRepo,
  ));

  const phaseIds = payload.phases.map((phase) => phase.id);
  assert.equal(payload.bundle.id, 'correction-wave');
  assert.ok(phaseIds.includes('triage'));
  assert.ok(phaseIds.includes('shape'));
  assert.ok(phaseIds.includes('prove'));
  assert.ok(phaseIds.includes('repair'));
  assert.ok(phaseIds.includes('regression'));
});

test('audit-repo emits shared control-plane artifacts for repo review lanes', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase33-audit-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  writeFile(targetRepo, 'src/auth/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'app/api/route.ts', 'export async function GET() { return Response.json({ ok: true }); }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'audit the full repo and plan correction waves', '--json'],
    targetRepo,
  ));

  assert.equal(payload.controlPlane.reviewControlRoom.activeLane, 'repo-review');
  assert.ok(payload.controlPlane.findingsRegistry.summary.open >= 1);
  assert.match(payload.controlPlane.correctionPlanner.recommendedNextCommand, /rai (start correction|fix) --goal/);
  assert.ok(payload.controlPlane.largeRepoBoard.rankedPackages.length >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, payload.controlPlane.artifacts.findingsRegistry)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.controlPlane.artifacts.correctionControl)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.controlPlane.artifacts.correctionControlMarkdown)));
});

test('review syncs diff findings into the shared findings registry and correction control', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase33-review-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { return a + b; }\n');
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { const token = process.env.API_TOKEN; return token ? a - b : a + b; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run('node', [targetBin, 'review', '--json'], targetRepo));

  assert.equal(payload.controlPlane.reviewControlRoom.activeLane, 'diff-review');
  assert.ok(payload.controlPlane.findingsRegistry.summary.open >= 1);
  assert.ok(payload.controlPlane.correctionPlanner.waveCount >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, payload.controlPlane.artifacts.findingsRegistry)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.controlPlane.artifacts.correctionControlMarkdown)));
});

test('monorepo audit keeps ranked shards and correction starter in the large-repo board', () => {
  const targetRepo = makeTempRepoFromFixture(largeMonorepoFixture, 'raiola-phase33-mono-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const rootPackageJsonPath = path.join(targetRepo, 'package.json');
  const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  rootPackageJson.scripts = {
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, 2)}\n`);

  writeFile(targetRepo, 'packages/auth/src/permission.ts', 'export function requirePermission() { return true; }\n');
  writeFile(targetRepo, 'packages/data/src/repository.ts', 'export function repository() { return { ok: true }; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'run a full repo audit and fix the highest risk issues', '--json'],
    targetRepo,
  ));

  assert.equal(payload.controlPlane.reviewControlRoom.activeLane, 'large-repo-review');
  assert.ok(payload.controlPlane.largeRepoBoard.rankedPackages.length >= 1);
  assert.ok(payload.controlPlane.largeRepoBoard.currentShard?.area);
  assert.match(payload.controlPlane.correctionBoard.recommendedStarterCommand, /rai start correction --goal/);
});

test('dashboard renders review, correction, and large-repo panels from the shared control plane', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase33-dashboard-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  writeFile(targetRepo, 'src/auth/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'app/api/route.ts', 'export async function GET() { return Response.json({ ok: true }); }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'audit the full repo and plan correction waves', '--json'],
    targetRepo,
  );

  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const html = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');
  const state = JSON.parse(fs.readFileSync(path.join(targetRepo, dashboard.stateFile), 'utf8'));

  assert.match(html, /Review Control Room/i);
  assert.match(html, /Correction Board/i);
  assert.match(html, /Large Repo Board/i);
  assert.match(html, /Correction Waves/i);
  assert.match(html, /Ranked Packages/i);
  assert.equal(state.controlPlane.reviewControlRoom.activeLane, 'repo-review');
  assert.ok(dashboard.summary.openBlockers >= 0);
  assert.ok(dashboard.summary.rankedShards >= 1);
});
