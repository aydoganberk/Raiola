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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase31-'));
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
  };
  packageJson.devDependencies = {
    tailwindcss: '4.0.0',
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
  writeFile(targetRepo, 'components/MetricCard.tsx', 'export function MetricCard() { return <section>Metric</section>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');
}

test('rai start recommend chooses frontend delivery with deep profile for frontend product goals', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'recommend', '--goal', 'ship the premium dashboard surface', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-delivery');
  assert.equal(payload.profile.id, 'deep');
  assert.equal(payload.frontend.routing, 'next-app-router');
  assert.match(payload.recommendedStarterCommand, /rai start frontend --goal/);
  assert.match(payload.recommendedStarterCommand, /--profile deep/);
  assert.match(payload.recommendedStarterCommand, /--with /);
  assert.ok(payload.recommendedStarterCommand.includes('browser'));
  assert.ok(payload.recommendedStarterCommand.includes('trust'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'browser'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'design-system'));
  assert.ok(payload.recommendedAddOns.some((entry) => entry.id === 'state'));
  assert.ok(payload.candidateBundles.some((entry) => entry.id === 'ship-closeout'));
});

test('rai start ship expands recommended add-ons into trust and handoff overlays', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'ship', '--goal', 'close the release safely', '--with', 'recommended', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'ship-closeout');
  assert.equal(payload.profile.id, 'deep');
  assert.deepEqual(payload.addOns.map((entry) => entry.id), ['trust', 'handoff', 'regression']);
  assert.ok(payload.phases.some((phase) => phase.id === 'trust'));
  assert.ok(payload.phases.some((phase) => phase.id === 'handoff'));
  assert.ok(payload.phases.some((phase) => phase.id === 'regression'));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai secure'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai checkpoint'))));
});

test('rai start frontend deep profile plus add-ons appends trust, browser, and docs phases', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'frontend', '--goal', 'ship the premium dashboard surface', '--profile', 'deep', '--with', 'trust|browser|docs', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-delivery');
  assert.equal(payload.profile.id, 'deep');
  assert.deepEqual(payload.addOns.map((entry) => entry.id), ['trust', 'browser', 'docs']);
  assert.ok(payload.phases.some((phase) => phase.id === 'trust'));
  assert.ok(payload.phases.some((phase) => phase.id === 'browser'));
  assert.ok(payload.phases.some((phase) => phase.id === 'docs'));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai design-dna'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai preview'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai discuss'))));
});

test('dashboard surfaces start profile, add-ons, candidate bundles, and CLI-friendly phase labels', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run(
    'node',
    [targetBin, 'start', 'frontend', '--goal', 'ship the premium dashboard surface', '--profile', 'deep', '--with', 'trust|browser', '--json'],
    targetRepo,
  );

  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const html = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');

  assert.match(html, /bundle profile/i);
  assert.match(html, /candidate bundles/i);
  assert.match(html, /trust, browser/i);
  assert.match(html, /rai map-frontend --json/);
});
