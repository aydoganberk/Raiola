const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');
const sourcePackage = require(path.join(repoRoot, 'package.json'));
const {
  loadTargetRuntimeScripts,
  patchPackageJsonScripts,
} = require(path.join(repoRoot, 'scripts', 'workflow', 'install_common'));

function makeTempRepo(prefix = 'raiola-phase54-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('source package stays compact while full runtime fallbacks remain materializable', () => {
  const scriptNames = Object.keys(sourcePackage.scripts || {});
  assert.ok(scriptNames.length <= 16);
  assert.ok(scriptNames.includes('rai'));
  assert.ok(scriptNames.includes('rai:repo-proof'));
  assert.equal(sourcePackage.scripts['raiola:audit'], undefined);

  const fullScripts = loadTargetRuntimeScripts('full');
  assert.ok(Object.keys(fullScripts).length >= 140);
  assert.equal(fullScripts['raiola:repo-proof'], 'node scripts/workflow/repo_proof.js');
  assert.equal(fullScripts['raiola:quick'], 'node scripts/workflow/quick.js');

  const targetRepo = makeTempRepo('raiola-phase54-materialize-');
  patchPackageJsonScripts(targetRepo, {
    overwriteConflicts: true,
    scriptProfile: 'full',
  });

  const targetPackage = JSON.parse(fs.readFileSync(path.join(targetRepo, 'package.json'), 'utf8'));
  assert.equal(targetPackage.scripts['raiola:repo-proof'], 'node scripts/workflow/repo_proof.js');
  assert.equal(targetPackage.scripts['raiola:quick'], 'node scripts/workflow/quick.js');
  assert.equal(targetPackage.scripts.rai, 'node bin/rai.js');
});

test('repo-proof composes external snapshot evidence and stays read-only by default', () => {
  const targetRepo = makeTempRepo();
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, 'app/layout.tsx', 'export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><h1>Dashboard</h1><button type="button">Open</button></main>; }\n');
  writeFile(targetRepo, 'app/api/users/route.ts', 'export async function GET() { return Response.json({ ok: true }); }\n');

  const payload = JSON.parse(run('node', [raiBin, 'repo-proof', '--repo', targetRepo, '--json'], repoRoot));
  assert.equal(payload.externalSnapshot, true);
  assert.equal(payload.writeArtifacts, false);
  assert.ok(payload.coverage.includes('api'));
  assert.ok(payload.coverage.includes('frontend'));
  assert.ok(payload.apiSurface.endpointCount >= 1);
  assert.equal(payload.frontend.active, true);
  assert.ok(payload.apiSurface.frameworks.includes('next-api'));
  assert.ok(payload.audit.healthVerdict);
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'repo-proof', 'latest.json')));

  const persisted = JSON.parse(run(
    'node',
    [raiBin, 'repo-proof', '--repo', targetRepo, '--write', 'true', '--json'],
    repoRoot,
  ));
  assert.equal(persisted.writeArtifacts, true);
  assert.ok(persisted.artifacts);
  assert.ok(fs.existsSync(path.join(targetRepo, persisted.artifacts.reportJson)));
  assert.ok(fs.existsSync(path.join(targetRepo, persisted.artifacts.reportMarkdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, persisted.apiSurface.artifacts.runtimeJson)));
  assert.ok(fs.existsSync(path.join(targetRepo, persisted.frontend.artifacts.markdown)));

  const savedPayload = JSON.parse(fs.readFileSync(path.join(targetRepo, persisted.artifacts.reportJson), 'utf8'));
  assert.equal(savedPayload.artifacts.reportJson, persisted.artifacts.reportJson);
  assert.ok(savedPayload.recommendedNextLanes.some((command) => command.includes('rai repo-proof')) === false);
  assert.ok(savedPayload.recommendedNextLanes.some((command) => command.includes('rai audit-repo')));
});
