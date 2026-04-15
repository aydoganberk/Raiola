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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase32-'));
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

function seedFrontendRepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
    '@tanstack/react-query': '5.0.0',
    'react-hook-form': '7.0.0',
  };
  packageJson.devDependencies = {
    tailwindcss: '4.0.0',
    '@playwright/test': '1.52.0',
  };
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
    build: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(targetRepo, 'components.json', '{ "style": "default" }\n');
  writeFile(targetRepo, 'app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><h1>Dashboard</h1></main>; }\n');
  writeFile(targetRepo, 'app/settings/page.tsx', 'export default function SettingsPage() { return <main>Settings</main>; }\n');
  writeFile(targetRepo, 'app/reports/page.tsx', 'export default function ReportsPage() { return <main>Reports</main>; }\n');
  writeFile(targetRepo, 'components/MetricCard.tsx', 'export function MetricCard() { return <section>Metric</section>; }\n');
  writeFile(targetRepo, 'components/TableShell.tsx', 'export function TableShell() { return <section>Table</section>; }\n');
  writeFile(targetRepo, 'components/SettingsForm.tsx', 'export function SettingsForm() { return <form>Settings</form>; }\n');
  writeFile(targetRepo, 'components/shared/DashboardHeader.tsx', 'export function DashboardHeader() { return <header>Header</header>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');
}

test('rai start recommend chooses frontend refactor for shared-component cleanup goals', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'recommend', '--goal', 'refactor the dashboard surface into cleaner shared components and extracted sections', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-refactor');
  assert.equal(payload.frontend.workflowIntent.lane, 'refactor');
  assert.match(payload.recommendedStarterCommand, /rai start frontend-refactor --goal/);
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'surface'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'state'));
});

test('rai start recommend chooses frontend polish and suggests design-system plus state overlays', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'recommend', '--goal', 'polish the dashboard design system, spacing, and loading states before demo', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-polish');
  assert.equal(payload.frontend.workflowIntent.lane, 'polish');
  assert.match(payload.recommendedStarterCommand, /rai start frontend-polish --goal/);
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'design-system'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'state'));
  assert.ok(payload.candidateBundles.some((entry) => entry.id === 'frontend-review'));
});

test('rai start recommend chooses frontend ship-readiness for browser-heavy release goals', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'recommend', '--goal', 'ship the dashboard release candidate safely before launch with final browser proof', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-ship-readiness');
  assert.equal(payload.frontend.workflowIntent.lane, 'ship-readiness');
  assert.match(payload.recommendedStarterCommand, /rai start frontend-ship --goal/);
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'browser'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'handoff'));
});

test('rai do and dashboard surface frontend control-room guidance for frontend polish work', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const doPayload = JSON.parse(run(
    'node',
    [targetBin, 'do', '--goal', 'polish the dashboard design system, spacing, and loading states before demo', '--json'],
    targetRepo,
  ));

  assert.equal(doPayload.commandPlan.startBundleId, 'frontend-polish');
  assert.equal(doPayload.frontendStart.workflowIntent.lane, 'polish');
  assert.ok(doPayload.commandPlan.startAddOns.some((entry) => entry.id === 'design-system'));
  assert.ok(doPayload.commandPlan.startAddOns.some((entry) => entry.id === 'state'));

  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const html = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');

  assert.match(html, /Frontend Control Room/i);
  assert.match(html, /frontend-polish|Frontend Polish/i);
  assert.match(html, /suggested add-ons/i);
  assert.match(html, /design-system, state/i);
});

test('rai start list exposes the new frontend bundles and add-ons', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run('node', [targetBin, 'start', 'list', '--json'], targetRepo));

  assert.ok(payload.bundles.some((entry) => entry.id === 'frontend-refactor'));
  assert.ok(payload.bundles.some((entry) => entry.id === 'frontend-polish'));
  assert.ok(payload.bundles.some((entry) => entry.id === 'frontend-ship-readiness'));
  assert.ok(payload.addOns.some((entry) => entry.id === 'surface'));
  assert.ok(payload.addOns.some((entry) => entry.id === 'design-system'));
  assert.ok(payload.addOns.some((entry) => entry.id === 'state'));
});
