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
    input: extra.input,
    stdio: ['pipe', 'pipe', 'pipe'],
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

function bootstrapRepo(targetRepo) {
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);
  return path.join(targetRepo, 'bin', 'rai.js');
}

function seedFrontendMonorepo(targetRepo) {
  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase43-control-rooms',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { next: '14.2.0', react: '18.2.0', 'react-dom': '18.2.0' },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'pnpm-workspace.yaml', ['packages:', '  - apps/*', '  - packages/*', ''].join('\n'));
  writeFile(targetRepo, 'components.json', `${JSON.stringify({
    '$schema': 'https://ui.shadcn.com/schema.json',
    style: 'default',
    rsc: true,
    tsx: true,
    aliases: { components: '@/components', ui: '@/components/ui' },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'apps/web/package.json', `${JSON.stringify({
    name: 'web',
    private: true,
    dependencies: { next: '14.2.0' },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'apps/web/app/page.tsx', [
    'import { Button } from "@/components/ui/Button";',
    '',
    'export default function HomePage() {',
    '  return (',
    '    <main>',
    '      <nav aria-label="Primary">Home</nav>',
    '      <h1>Home</h1>',
    '      <Button>Open</Button>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'apps/web/app/dashboard/page.tsx', [
    'export default function DashboardPage() {',
    '  return (',
    '    <main>',
    '      <h1>Dashboard</h1>',
    '      <div onClick={() => {}}>Open panel</div>',
    '    </main>',
    '  );',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'apps/web/components/Hero.tsx', [
    'export function Hero() {',
    '  return <section><h2>Hero</h2></section>;',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'apps/web/components/ui/Button.tsx', [
    'export function Button({ children }) {',
    '  return <button>{children}</button>;',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'packages/ui/package.json', `${JSON.stringify({ name: '@phase43/ui', private: true }, null, 2)}\n`);
  writeFile(targetRepo, 'packages/ui/Card.tsx', [
    'export function Card({ children }) {',
    '  return <section>{children}</section>;',
    '}',
    '',
  ].join('\n'));
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');
  writeFile(targetRepo, '.workflow/workspaces/ui-foundation.json', `${JSON.stringify({
    name: 'ui-foundation',
    root: 'apps/web',
    status: 'active',
    currentMilestone: 'control-rooms',
    mission: 'Stabilize frontend control and repo guidance surfaces.',
  }, null, 2)}\n`);
  writeFile(targetRepo, '.workflow/verifications/browser/2026-04-13-dashboard/meta.json', `${JSON.stringify({
    visualVerdict: 'pass',
    summary: 'dashboard smoke',
    accessibility: {
      verdict: 'warn',
      issues: [
        {
          rule: 'contrast',
          severity: 'medium',
          detail: 'Button contrast needs review.',
        },
      ],
    },
    journey: {
      signals: {
        nav: true,
        main: true,
        heading: true,
        primaryAction: true,
        form: false,
        feedback: true,
      },
    },
  }, null, 2)}\n`);
}

test('repo-control and frontend-control materialize repo-native control rooms and wire into operate help surfaces', () => {
  const targetRepo = makeTempRepo('raiola-phase43-control-');
  const targetBin = bootstrapRepo(targetRepo);
  seedFrontendMonorepo(targetRepo);

  const repoControl = JSON.parse(run('node', [targetBin, 'repo-control', '--json'], targetRepo));
  const frontendControl = JSON.parse(run('node', [targetBin, 'frontend-control', '--json'], targetRepo));
  const operatingCenter = JSON.parse(run('node', [targetBin, 'operate', '--refresh', '--json'], targetRepo));
  const planesHelp = run('node', [targetBin, 'help', 'planes'], targetRepo);

  assert.equal(repoControl.action, 'repo-control');
  assert.ok(['clear', 'guided', 'attention-required'].includes(repoControl.verdict));
  assert.equal(repoControl.packageGraph.repoShape, 'monorepo');
  assert.ok(repoControl.packageGraph.packageCount >= 2);
  assert.equal(repoControl.frontend.detected, true);
  assert.ok(repoControl.workspaces.count >= 1);
  assert.ok(repoControl.hotspots.length >= 0);
  assert.equal(repoControl.commands.frontendControl, 'rai frontend-control --json');
  for (const relativeFile of [
    repoControl.artifacts.json,
    repoControl.artifacts.markdown,
    repoControl.artifacts.runtimeJson,
    repoControl.artifacts.runtimeMarkdown,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  assert.equal(frontendControl.action, 'frontend-control');
  assert.equal(frontendControl.frontend.detected, true);
  assert.equal(frontendControl.frontend.framework, 'Next');
  assert.ok(frontendControl.browserEvidence.artifactCount >= 1);
  assert.ok(frontendControl.designDebt.total >= 1);
  assert.ok(frontendControl.topSignals.length >= 1);
  assert.equal(frontendControl.commands.repoControl, 'rai repo-control --json');
  for (const relativeFile of [
    frontendControl.artifacts.json,
    frontendControl.artifacts.markdown,
    frontendControl.artifacts.runtimeJson,
    frontendControl.artifacts.runtimeMarkdown,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  assert.equal(operatingCenter.action, 'operate');
  assert.ok(operatingCenter.planeBoard.some((plane) => plane.id === 'repo-control'));
  assert.ok(operatingCenter.planeBoard.some((plane) => plane.id === 'frontend-control'));
  assert.ok(operatingCenter.planes.repoControl);
  assert.ok(operatingCenter.planes.frontendControl);

  assert.match(planesHelp, /repo-control/);
  assert.match(planesHelp, /frontend-control/);
});

test('codex setup and operator packet ship repo/frontend control guides, commands, and plugin skills', () => {
  const targetRepo = makeTempRepo('raiola-phase43-operator-');
  const targetBin = bootstrapRepo(targetRepo);
  seedFrontendMonorepo(targetRepo);

  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const operator = JSON.parse(run('node', [targetBin, 'codex', 'operator', '--goal', 'run repo and frontend control together', '--json'], targetRepo));

  assert.ok(setup.operatorAssets.includes('.codex/operator/repo-control/README.md'));
  assert.ok(setup.operatorAssets.includes('.codex/operator/frontend-control/README.md'));
  assert.ok(fs.existsSync(path.join(targetRepo, '.codex/operator/repo-control/README.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.codex/operator/frontend-control/README.md')));

  assert.equal(operator.commands.repoControl, 'rai repo-control --json');
  assert.equal(operator.commands.frontendControl, 'rai frontend-control --json');
  assert.equal(operator.files.repoControlGuide, '.codex/operator/repo-control/README.md');
  assert.equal(operator.files.frontendControlGuide, '.codex/operator/frontend-control/README.md');
  assert.ok(['clear', 'guided', 'attention-required'].includes(operator.repoControl.verdict));
  assert.ok(['frontend-not-detected', 'ready', 'guided', 'attention-required'].includes(operator.frontendControl.verdict));
  assert.ok(operator.skills.includes('raiola-repo-control-room'));
  assert.ok(operator.skills.includes('raiola-frontend-control-room'));

  const operatorMarkdown = fs.readFileSync(path.join(targetRepo, operator.markdownFile), 'utf8');
  assert.match(operatorMarkdown, /Repo-native control rooms/);
  assert.match(operatorMarkdown, /Repo control/);
  assert.match(operatorMarkdown, /Frontend control/);

  const repoControlGuide = fs.readFileSync(path.join(targetRepo, '.codex/operator/repo-control/README.md'), 'utf8');
  const frontendControlGuide = fs.readFileSync(path.join(targetRepo, '.codex/operator/frontend-control/README.md'), 'utf8');
  assert.match(repoControlGuide, /repo-control/i);
  assert.match(frontendControlGuide, /frontend-control/i);

  const pluginDir = path.join(targetRepo, 'plugins', 'raiola-codex-optimizer');
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.skills.includes('skills/raiola-repo-control-room'));
  assert.ok(plugin.skills.includes('skills/raiola-frontend-control-room'));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-repo-control-room', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-frontend-control-room', 'SKILL.md')));
});
