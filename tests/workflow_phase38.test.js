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

test('release-control materializes supporting planes and persists artifact paths in reports and exports', () => {
  const targetRepo = makeTempRepo('raiola-phase38-release-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase38-release',
    scripts: {
      test: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
    dependencies: {
      next: '14.2.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>release-control</main>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { const flag = process.env.UI_FLAG; return <main>{flag ? "ship" : "preview"}</main>; }\n');
  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo);

  const release = JSON.parse(run('node', [targetBin, 'release-control', '--json'], targetRepo));
  const changeControl = readJson(targetRepo, '.workflow/reports/change-control.json');
  const handoff = readJson(targetRepo, '.workflow/reports/handoff-os.json');
  const measurement = readJson(targetRepo, '.workflow/reports/measurement.json');
  const lifecycle = readJson(targetRepo, '.workflow/reports/lifecycle-center.json');
  const teamControl = readJson(targetRepo, '.workflow/reports/team-control-room.json');
  const autopilot = readJson(targetRepo, '.workflow/reports/autopilot.json');
  const exportManifest = readJson(targetRepo, '.workflow/exports/export-manifest.json');
  const repoStatus = readJson(targetRepo, '.workflow/exports/repo-status.json');

  assert.ok(release.supportingPlanes.materialized.length >= 5);
  assert.equal(release.supportingPlanes.failures.length, 0);
  assert.ok(changeControl.artifacts.json.endsWith('change-control.json'));
  assert.ok(changeControl.artifacts.runtimeJson.endsWith('change-control.json'));
  assert.ok(handoff.artifacts.json.endsWith('handoff-os.json'));
  assert.ok(lifecycle.artifacts.json.endsWith('lifecycle-center.json'));
  assert.ok(teamControl.artifacts.json.endsWith('team-control-room.json'));
  assert.ok(autopilot.artifacts.json.endsWith('autopilot.json'));
  assert.ok(measurement.artifacts.controlPlane.json.endsWith('measurement.json'));
  assert.ok(measurement.artifacts.controlPlane.runtimeJson.endsWith('measurement.json'));

  assert.equal(release.publishPlan.exportCoverage.coverageRatio, 100);
  assert.equal(exportManifest.exports.exportManifest, '.workflow/exports/export-manifest.json');
  assert.equal(exportManifest.exports.repoStatus, '.workflow/exports/repo-status.json');
  assert.equal(exportManifest.publishPlan.exportCoverage.coverageRatio, 100);
  assert.equal(exportManifest.githubOutputs.release_repo_status_path, '.workflow/exports/repo-status.json');
  assert.equal(exportManifest.githubOutputs.release_export_manifest_path, '.workflow/exports/export-manifest.json');
  assert.equal(exportManifest.githubOutputs.release_ci_gate_path, '.workflow/exports/ci-gate.json');
  assert.ok(exportManifest.githubOutputs.handoff_path.endsWith('handoff-os.json'));
  assert.ok(exportManifest.githubOutputs.measurement_path.endsWith('measurement.json'));
  assert.ok(exportManifest.githubOutputs.lifecycle_path.endsWith('lifecycle-center.json'));
  assert.ok(exportManifest.githubOutputs.team_control_path.endsWith('team-control-room.json'));
  assert.ok(exportManifest.githubOutputs.autopilot_path.endsWith('autopilot.json'));
  assert.equal(repoStatus.exports.exportManifest, '.workflow/exports/export-manifest.json');
  assert.equal(repoStatus.exports.repoStatus, '.workflow/exports/repo-status.json');
  assert.ok(repoStatus.artifacts.handoff.json.endsWith('handoff-os.json'));
  assert.ok(repoStatus.artifacts.measurement.json.endsWith('measurement.json'));
  assert.ok(repoStatus.artifacts.lifecycle.json.endsWith('lifecycle-center.json'));
  assert.ok(repoStatus.artifacts.teamControl.json.endsWith('team-control-room.json'));
  assert.ok(repoStatus.artifacts.autopilot.json.endsWith('autopilot.json'));
});
