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

function run(command, args, cwd, extra = {}) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readJson(targetRepo, relativeFile) {
  return JSON.parse(fs.readFileSync(path.join(targetRepo, relativeFile), 'utf8'));
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('operate refresh ranks planes and repo-config exposes opinionated stack packs', () => {
  const targetRepo = makeTempRepo('raiola-phase37-operate-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase37-operate',
    scripts: {
      test: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
    dependencies: {
      next: '14.2.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
      stripe: '14.25.0',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>Dashboard</main>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const repoConfig = JSON.parse(run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo));

  assert.ok(repoConfig.stackPacks.some((entry) => entry.id === 'nextjs-app'));
  assert.ok(repoConfig.stackPacks.some((entry) => entry.id === 'supabase-stripe'));
  assert.ok(repoConfig.activeConfig.preferredPlanes.includes('release-control'));
  assert.ok(repoConfig.activeConfig.preferredPlanes.includes('trust'));

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { const flag = process.env.UI_FLAG; return <main>{flag ? "ship" : "preview"}</main>; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo);

  const operate = JSON.parse(run('node', [targetBin, 'operate', '--refresh', '--json'], targetRepo));

  assert.equal(operate.action, 'operate');
  assert.ok(Array.isArray(operate.planeBoard));
  assert.ok(operate.planeBoard.length >= 9);
  assert.ok(operate.activePlane.id);
  assert.ok(operate.operatorSequence.length >= 1);
  assert.ok(operate.focusQuestions.length >= 1);
  assert.ok(operate.compression.totalSurfaceCount >= 10);
  assert.ok(operate.compression.underlyingCommandCount >= 60);
  assert.ok(operate.publishSurface.coverageRatio >= 80);
  assert.ok(operate.stackPacks.some((entry) => entry.id === 'nextjs-app'));
  assert.ok(operate.stackPacks.some((entry) => entry.id === 'supabase-stripe'));
  assert.ok(fs.existsSync(path.join(targetRepo, operate.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, operate.artifacts.markdown)));
});

test('dashboard refresh-planes and control-plane-publish carry operating-center state through exports', () => {
  const targetRepo = makeTempRepo('raiola-phase37-dashboard-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase37-dashboard',
    scripts: {
      test: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'src/index.ts', 'export function score(a, b) { return a + b; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function score(a, b) { const token = process.env.API_TOKEN; return token ? a - b : a + b; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'release-control', '--json'], targetRepo);

  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--refresh-planes', '--json'], targetRepo));
  const dashboardState = readJson(targetRepo, dashboard.stateFile);
  const publish = JSON.parse(run('node', [targetBin, 'control-plane-publish', '--json'], targetRepo));
  const exportManifest = readJson(targetRepo, publish.externalExports.exportManifest);
  const repoStatus = readJson(targetRepo, publish.externalExports.repoStatus);

  assert.notEqual(dashboard.summary.operatingVerdict, 'n/a');
  assert.notEqual(dashboard.summary.activePlane, 'n/a');
  assert.ok(dashboardState.operatingCenter);
  assert.ok(dashboardState.operatingCenter.activePlane.id);
  assert.ok(dashboardState.operatingCenter.primaryCommand);
  assert.ok(dashboardState.operatingCenter.publishSurface.coverageRatio >= 0);

  assert.equal(publish.context.operatingCenterVerdict, dashboardState.operatingCenter.verdict);
  assert.equal(publish.context.operatingCenterActivePlane, dashboardState.operatingCenter.activePlane.id);
  assert.equal(exportManifest.context.operatingCenterVerdict, dashboardState.operatingCenter.verdict);
  assert.equal(exportManifest.context.operatingCenterActivePlane, dashboardState.operatingCenter.activePlane.id);
  assert.equal(publish.githubOutputs.operating_center_verdict, dashboardState.operatingCenter.verdict);
  assert.equal(publish.githubOutputs.operating_center_active_plane, dashboardState.operatingCenter.activePlane.id);
  assert.equal(repoStatus.operatingCenterVerdict, dashboardState.operatingCenter.verdict);
  assert.equal(repoStatus.operatingCenterActivePlane, dashboardState.operatingCenter.activePlane.id);
  assert.ok(repoStatus.artifacts.operatingCenter.json.endsWith('operating-center.json'));
  assert.ok(fs.existsSync(path.join(targetRepo, repoStatus.artifacts.operatingCenter.json)));
});
