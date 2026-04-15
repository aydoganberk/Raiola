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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase30-'));
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
}

function seedMonorepoSignals(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.private = true;
  packageJson.workspaces = ['apps/*', 'packages/*'];
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(targetRepo, 'apps/web/package.json', `${JSON.stringify({ name: '@apps/web', private: true, version: '0.0.0' }, null, 2)}\n`);
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>Web</main>; }\n');
  writeFile(targetRepo, 'apps/admin/package.json', `${JSON.stringify({ name: '@apps/admin', private: true, version: '0.0.0' }, null, 2)}\n`);
  writeFile(targetRepo, 'apps/admin/app/page.tsx', 'export default function Page() { return <main>Admin</main>; }\n');
  writeFile(targetRepo, 'packages/auth/package.json', `${JSON.stringify({ name: '@pkg/auth', private: true, version: '0.0.0' }, null, 2)}\n`);
  writeFile(targetRepo, 'packages/auth/src/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'packages/auth/src/permission.ts', 'export const permission = "admin";\n');
  writeFile(targetRepo, 'packages/data/package.json', `${JSON.stringify({ name: '@pkg/data', private: true, version: '0.0.0' }, null, 2)}\n`);
  writeFile(targetRepo, 'packages/data/src/schema.ts', 'export const schema = { users: true };\n');
  writeFile(targetRepo, 'packages/ui/package.json', `${JSON.stringify({ name: '@pkg/ui', private: true, version: '0.0.0' }, null, 2)}\n`);
  writeFile(targetRepo, 'packages/ui/src/button.ts', 'export const button = "primary";\n');
}

test('rai start writes a frontend start plan with bundled phases and artifacts', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'frontend', '--goal', 'ship the premium dashboard surface', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'frontend-delivery');
  assert.equal(payload.frontend.routing, 'next-app-router');
  assert.ok(payload.commandFamilies.length >= 3);
  assert.ok(payload.phases.some((phase) => phase.id === 'identify'));
  assert.ok(payload.phases.some((phase) => phase.id === 'shape'));
  assert.ok(payload.phases.some((phase) => phase.id === 'prove'));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai map-frontend'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai ui-review'))));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.markdown)));
});

test('rai start monorepo selects the large-repo bundle and emits package-aware phases', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedMonorepoSignals(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'start', 'monorepo', '--goal', 'review and patch the top-risk monorepo subsystem', '--json'],
    targetRepo,
  ));

  assert.equal(payload.bundle.id, 'monorepo-audit-wave');
  assert.equal(payload.repoContext.repoShape, 'monorepo');
  assert.ok(payload.commandFamilies.length >= 3);
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai monorepo-mode'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai review-orchestrate'))));
  assert.ok(payload.phases.some((phase) => phase.commands.some((command) => command.cli.includes('rai verify'))));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.markdown)));
});
