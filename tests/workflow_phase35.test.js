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

function readJson(targetRepo, relativeFile) {
  return JSON.parse(fs.readFileSync(path.join(targetRepo, relativeFile), 'utf8'));
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('repo-config detects stack packs and start/do/profile honor repo-native defaults', () => {
  const targetRepo = makeTempRepo('raiola-phase35-repo-config-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase35-repo-config',
    scripts: {
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
    dependencies: {
      next: '14.2.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
      stripe: '17.0.0',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>Dashboard</main>; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const repoConfig = JSON.parse(run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo));
  const start = JSON.parse(run('node', [targetBin, 'start', 'recommend', '--goal', 'ship the premium dashboard surface', '--json'], targetRepo));
  const routed = JSON.parse(run('node', [targetBin, 'do', 'ship the premium dashboard surface', '--json'], targetRepo));
  const profile = JSON.parse(run('node', [targetBin, 'profile', '--json'], targetRepo));

  assert.equal(repoConfig.file.exists, true);
  assert.equal(repoConfig.written, true);
  assert.ok(repoConfig.detectedProfiles.some((entry) => entry.id === 'nextjs-app'));
  assert.ok(repoConfig.detectedProfiles.some((entry) => entry.id === 'supabase-stripe'));
  assert.equal(repoConfig.activeConfig.defaultProfile, 'deep');
  assert.equal(repoConfig.activeConfig.trustLevel, 'strict');
  assert.ok(repoConfig.activeConfig.preferredBundles.includes('frontend-delivery'));
  assert.ok(repoConfig.activeConfig.requiredVerifications.includes('npm run build'));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'repo-config.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'repo-config.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'repo-config.md')));

  assert.equal(start.profile.id, 'deep');
  assert.equal(start.repoConfig.trustLevel, 'strict');
  assert.ok(start.repoConfig.preferredBundles.includes('frontend-delivery'));
  assert.ok(start.bundle.id === 'frontend-delivery' || start.bundle.id === 'frontend-review' || start.bundle.id === 'frontend-ship-readiness');

  assert.equal(routed.repoConfig.defaultProfile, 'deep');
  assert.equal(routed.repoConfig.trustLevel, 'strict');
  assert.ok(routed.repoConfig.detectedProfiles.includes('nextjs-app'));

  assert.equal(profile.repoConfig.defaultProfile, 'deep');
  assert.equal(profile.repoConfig.trustLevel, 'strict');
  assert.ok(profile.repoConfig.requiredVerifications.includes('rai verify-work --json'));
});

test('control planes publish artifacts, exports, and dashboard panels as one product surface', () => {
  const targetRepo = makeTempRepo('raiola-phase35-planes-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase35-planes',
    scripts: {
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { return a + b; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { const token = process.env.API_TOKEN; return token ? a - b : a + b; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo);

  const trust = JSON.parse(run('node', [targetBin, 'trust', '--json'], targetRepo));
  const releaseControl = JSON.parse(run('node', [targetBin, 'release-control', '--json'], targetRepo));
  const autopilot = JSON.parse(run('node', [targetBin, 'autopilot', '--json'], targetRepo));
  const handoff = JSON.parse(run('node', [targetBin, 'handoff', '--json'], targetRepo));
  const teamControl = JSON.parse(run('node', [targetBin, 'team-control', '--json'], targetRepo));
  const measurement = JSON.parse(run('node', [targetBin, 'measure', '--json'], targetRepo));
  const explainability = JSON.parse(run('node', [targetBin, 'explain', '--json'], targetRepo));
  const lifecycle = JSON.parse(run('node', [targetBin, 'lifecycle', '--json'], targetRepo));
  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const html = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');
  const state = JSON.parse(fs.readFileSync(path.join(targetRepo, dashboard.stateFile), 'utf8'));

  assert.ok(fs.existsSync(path.join(targetRepo, trust.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, trust.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, releaseControl.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, releaseControl.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, autopilot.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, handoff.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, teamControl.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, measurement.artifacts.controlPlane.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, explainability.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, lifecycle.artifacts.markdown)));

  assert.equal(typeof trust.decisions.start, 'string');
  assert.equal(typeof trust.decisions.merge, 'string');
  assert.equal(typeof trust.decisions.ship, 'string');
  assert.equal(typeof releaseControl.gates.ship.allowed, 'boolean');
  assert.ok(Object.keys(releaseControl.externalExports).length >= 5);
  for (const relativeFile of Object.values(releaseControl.externalExports)) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)));
  }
  assert.ok(autopilot.routines.length >= 1);
  assert.ok(Array.isArray(handoff.openDecisions));
  assert.ok(['idle', 'active', 'attention-required'].includes(teamControl.verdict));
  assert.ok(measurement.metrics.verification.passRate >= 0);
  assert.ok(Array.isArray(explainability.deepMode.addedCommands));
  assert.ok(lifecycle.selfHealing.safeActions >= 0);

  assert.match(html, /Repo Config/i);
  assert.match(html, /Trust Center/i);
  assert.match(html, /Change Control/i);
  assert.match(html, /Autopilot/i);
  assert.match(html, /Handoff OS/i);
  assert.match(html, /Team Control Room/i);
  assert.match(html, /Measurement \/ ROI/i);
  assert.match(html, /Explainability/i);
  assert.match(html, /Lifecycle Center/i);

  assert.equal(state.trustCenter.verdict, trust.verdict);
  assert.equal(state.changeControl.verdict, releaseControl.verdict);
  assert.equal(state.autopilot.verdict, autopilot.verdict);
  assert.equal(state.handoffOs.verdict, handoff.verdict);
  assert.equal(state.teamControlRoom.verdict, teamControl.verdict);
  assert.equal(state.lifecycleCenter.verdict, lifecycle.verdict);
  assert.equal(state.repoConfig.activeConfig.trustLevel, 'standard');
});

test('patch apply and rollback append patch-event history that measurement can read', () => {
  const targetRepo = makeTempRepo('raiola-phase35-patch-events-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({ name: 'phase35-patch-events' }, null, 2)}\n`);
  writeFile(targetRepo, 'hello.txt', 'v1\n');
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'hello.txt', 'v2\n');
  const patchDir = path.join(targetRepo, '.workflow', 'orchestration', 'patches');
  fs.mkdirSync(patchDir, { recursive: true });
  const patchFile = path.join(patchDir, 'sample-task.patch');
  fs.writeFileSync(patchFile, run('git', ['diff', '--binary', '--', 'hello.txt'], targetRepo));
  run('git', ['checkout', '--', 'hello.txt'], targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const applyPayload = JSON.parse(run('node', [targetBin, 'patch-apply', '--task', 'sample-task', '--json'], targetRepo));
  assert.equal(applyPayload.applied, true);
  assert.equal(fs.readFileSync(path.join(targetRepo, 'hello.txt'), 'utf8'), 'v2\n');

  const rollbackPayload = JSON.parse(run('node', [targetBin, 'patch-rollback', '--task', 'sample-task', '--json'], targetRepo));
  assert.equal(rollbackPayload.rolledBack, true);
  assert.equal(fs.readFileSync(path.join(targetRepo, 'hello.txt'), 'utf8'), 'v1\n');

  const eventsPath = path.join(targetRepo, applyPayload.eventsFile);
  const events = fs.readFileSync(eventsPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.length, 2);
  assert.equal(events[0].action, 'apply');
  assert.equal(events[0].success, true);
  assert.equal(events[1].action, 'rollback');
  assert.equal(events[1].success, true);

  const measurement = JSON.parse(run('node', [targetBin, 'measure', '--json'], targetRepo));
  assert.equal(measurement.metrics.corrections.automated, 1);
  assert.equal(measurement.metrics.corrections.rollbacks, 1);
  assert.ok(fs.existsSync(path.join(targetRepo, measurement.artifacts.controlPlane.json)));
});
