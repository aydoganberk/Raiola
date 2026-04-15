const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase53-'));
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

test('map-frontend and verify-browser expose component intelligence and browser readiness artifacts', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, 'components.json', '{ "style": "default" }\n');
  writeFile(targetRepo, 'app/layout.tsx', 'export default function Layout({ children }) { return <html lang="en"><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'import { StatusBanner } from "../components/StatusBanner"; export default function Page() { return <main><h1>Dashboard</h1><StatusBanner /></main>; }\n');
  writeFile(targetRepo, 'components/StatusBanner.tsx', 'export function StatusBanner() { return <div aria-live="polite">loading success</div>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html lang="en"><head><title>Preview</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><main><h1>Preview</h1><button type="button">Open</button></main></body></html>\n');

  const frontendMap = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'map_frontend.js'), '--json'],
    targetRepo,
  ));
  const browserPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'verify_browser.js'), '--url', path.join(targetRepo, 'preview.html'), '--json'],
    targetRepo,
  ));

  assert.ok(frontendMap.componentIntelligence.totalComponents >= 1);
  assert.ok(frontendMap.browserReadiness.recommendedLane);
  assert.ok(fs.readFileSync(path.join(targetRepo, frontendMap.artifacts.markdown), 'utf8').includes('## Component Intelligence'));
  assert.ok(fs.readFileSync(path.join(targetRepo, frontendMap.artifacts.markdown), 'utf8').includes('## Browser Readiness'));
  assert.equal(browserPayload.metadata.title, 'Preview');
  assert.equal(browserPayload.uiContracts.landmarks.main, true);
  assert.ok(browserPayload.summary.includes('ui='));
});
