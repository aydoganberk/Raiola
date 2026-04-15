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

test('release-control converges trust, explainability, continuity, and export packet surfaces', () => {
  const targetRepo = makeTempRepo('raiola-phase39-convergence-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase39-convergence',
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
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>phase39</main>; }\n');
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
  const explainability = readJson(targetRepo, '.workflow/reports/explainability.json');
  const measurement = readJson(targetRepo, '.workflow/reports/measurement.json');
  const exportManifest = readJson(targetRepo, '.workflow/exports/export-manifest.json');
  const repoStatus = readJson(targetRepo, '.workflow/exports/repo-status.json');
  const controlPlanePacket = readJson(targetRepo, '.workflow/exports/control-plane-packet.json');
  const ciGate = readJson(targetRepo, '.workflow/exports/ci-gate.json');
  const continuityBundle = readJson(targetRepo, handoff.exports.continuityBundle);

  assert.ok(release.supportingPlanes.materialized.some((item) => item.id === 'explainability'));
  assert.equal(release.supportingPlanes.failures.length, 0);
  assert.ok(explainability.artifacts.json.endsWith('explainability.json'));

  assert.equal(release.externalExports.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(changeControl.closeout.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(changeControl.closeout.continuityBundle, handoff.exports.continuityBundle);
  assert.equal(changeControl.explainability.tier, explainability.confidenceBreakdown.tier);
  assert.equal(changeControl.integrationSurface.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(changeControl.integrationSurface.continuityBundle, handoff.exports.continuityBundle);

  assert.equal(exportManifest.exports.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(exportManifest.githubOutputs.control_plane_packet_path, '.workflow/exports/control-plane-packet.json');
  assert.equal(exportManifest.githubOutputs.continuity_bundle_path, handoff.exports.continuityBundle);
  assert.ok(exportManifest.githubOutputs.explainability_path.endsWith('explainability.json'));
  assert.equal(exportManifest.context.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(exportManifest.context.continuityBundle, handoff.exports.continuityBundle);

  assert.equal(repoStatus.exports.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(repoStatus.trustDecisions.ship, changeControl.trustCenter.decisions.ship);
  assert.equal(repoStatus.explainability.tier, explainability.confidenceBreakdown.tier);
  assert.equal(repoStatus.continuity.bundle, handoff.exports.continuityBundle);

  assert.equal(controlPlanePacket.release.verdict, changeControl.verdict);
  assert.equal(controlPlanePacket.release.artifact, changeControl.artifacts.json);
  assert.equal(controlPlanePacket.trust.decisions.ship, changeControl.trustCenter.decisions.ship);
  assert.equal(controlPlanePacket.continuity.bundle, handoff.exports.continuityBundle);
  assert.equal(controlPlanePacket.explainability.tier, explainability.confidenceBreakdown.tier);
  assert.equal(controlPlanePacket.publish.exports.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(controlPlanePacket.linkedArtifacts.continuityBundle, handoff.exports.continuityBundle);

  assert.equal(ciGate.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(ciGate.trust.ship, changeControl.trustCenter.decisions.ship);
  assert.equal(ciGate.continuity.bundle, handoff.exports.continuityBundle);
  assert.equal(ciGate.explainability.tier, explainability.confidenceBreakdown.tier);

  assert.equal(handoff.decisionBasis.changeControl.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(handoff.decisionBasis.changeControl.continuityBundle, handoff.exports.continuityBundle);
  assert.equal(handoff.external.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(handoff.external.exportManifest, '.workflow/exports/export-manifest.json');
  assert.equal(handoff.external.repoStatus, '.workflow/exports/repo-status.json');
  assert.equal(handoff.controlPlanes.explainability.tier, explainability.confidenceBreakdown.tier);
  assert.equal(handoff.controlPlanes.changeControl.verdict, changeControl.verdict);

  assert.equal(continuityBundle.external.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(continuityBundle.decisionBasis.changeControl.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(continuityBundle.controlPlanes.changeControl.verdict, changeControl.verdict);
  assert.equal(continuityBundle.linkedArtifacts.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.equal(continuityBundle.linkedArtifacts.exportManifest, '.workflow/exports/export-manifest.json');
  assert.equal(continuityBundle.linkedArtifacts.repoStatus, '.workflow/exports/repo-status.json');

  assert.equal(measurement.metrics.controlPlane.packetPresent, true);
  assert.equal(measurement.metrics.controlPlane.explainabilityTier, explainability.confidenceBreakdown.tier);
  assert.equal(measurement.artifacts.controlPlanePacket, '.workflow/exports/control-plane-packet.json');
  assert.ok(measurement.artifacts.explainability.endsWith('explainability.json'));
});
