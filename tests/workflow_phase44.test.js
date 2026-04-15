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

function seedMonorepoChanges(targetRepo) {
  fs.appendFileSync(path.join(targetRepo, 'packages', 'ui', 'src', 'Table.tsx'), '\nexport const round5TableColumns = 3;\n');
  fs.appendFileSync(path.join(targetRepo, 'apps', 'admin', 'src', 'dashboard.tsx'), '\nexport const round5AdminFlag = true;\n');
}

test('workspace-impact and monorepo-control materialize large-monorepo planes and wire into operate/help surfaces', () => {
  const targetRepo = makeTempRepo('raiola-phase44-monorepo-');
  const targetBin = bootstrapRepo(targetRepo);
  seedMonorepoChanges(targetRepo);

  const workspaceImpact = JSON.parse(run('node', [targetBin, 'workspace-impact', '--json'], targetRepo));
  const monorepoControl = JSON.parse(run('node', [targetBin, 'monorepo-control', '--json'], targetRepo));
  const operatingCenter = JSON.parse(run('node', [targetBin, 'operate', '--refresh', '--json'], targetRepo));
  const monorepoHelp = run('node', [targetBin, 'help', 'monorepo'], targetRepo);
  const planesHelp = run('node', [targetBin, 'help', 'planes'], targetRepo);

  assert.equal(workspaceImpact.action, 'workspace-impact');
  assert.equal(workspaceImpact.repoShape, 'monorepo');
  assert.ok(workspaceImpact.packageCount >= 7);
  assert.equal(workspaceImpact.changeSet.mode, 'working-tree');
  assert.ok(workspaceImpact.changeSet.changedFiles.includes('packages/ui/src/Table.tsx'));
  assert.ok(workspaceImpact.changeSet.changedFiles.includes('apps/admin/src/dashboard.tsx'));
  assert.ok(workspaceImpact.packageBoard.some((entry) => entry.packageName === '@fixture-large/ui' && entry.changed));
  assert.ok(workspaceImpact.packageBoard.some((entry) => entry.packageName === '@fixture-large/admin' && entry.changed));
  assert.ok(workspaceImpact.blastRadius.changedPackageCount >= 2);
  assert.ok(workspaceImpact.blastRadius.impactedPackageCount >= workspaceImpact.blastRadius.changedPackageCount);
  assert.ok(workspaceImpact.waves.length >= 1);
  assert.ok(['single-wave-first', 'bounded-parallel'].includes(workspaceImpact.parallelization.mode));
  assert.equal(workspaceImpact.commands.monorepoControl, 'rai monorepo-control --json');
  for (const relativeFile of [
    workspaceImpact.artifacts.json,
    workspaceImpact.artifacts.markdown,
    workspaceImpact.artifacts.runtimeJson,
    workspaceImpact.artifacts.runtimeMarkdown,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  assert.equal(monorepoControl.action, 'monorepo-control');
  assert.equal(monorepoControl.repoShape, 'monorepo');
  assert.ok(['single-package', 'guided', 'attention-required', 'ready'].includes(monorepoControl.verdict));
  assert.ok(monorepoControl.workspaceImpact.packageBoard.length >= 1);
  assert.ok(monorepoControl.campaign.waves.length >= 1);
  assert.ok(monorepoControl.topology.dependencyHubs.length >= 1);
  assert.ok(monorepoControl.coordination.mappedPackageCount >= monorepoControl.coordination.impactedWorkspaceCount);
  assert.ok(Array.isArray(monorepoControl.coordination.unmappedPackages));
  assert.equal(monorepoControl.commands.workspaceImpact, 'rai workspace-impact --json');
  assert.equal(monorepoControl.commands.monorepoMode, 'rai monorepo-mode --json');
  for (const relativeFile of [
    monorepoControl.artifacts.json,
    monorepoControl.artifacts.markdown,
    monorepoControl.artifacts.runtimeJson,
    monorepoControl.artifacts.runtimeMarkdown,
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  assert.equal(operatingCenter.action, 'operate');
  assert.ok(operatingCenter.planeBoard.some((plane) => plane.id === 'monorepo-control'));
  assert.ok(operatingCenter.planes.monorepoControl);

  assert.match(monorepoHelp, /workspace-impact/);
  assert.match(monorepoHelp, /monorepo-control/);
  assert.match(planesHelp, /monorepo-control/);
});

test('codex setup and operator packet ship monorepo control guides, commands, and plugin skills', () => {
  const targetRepo = makeTempRepo('raiola-phase44-operator-');
  const targetBin = bootstrapRepo(targetRepo);
  seedMonorepoChanges(targetRepo);

  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const operator = JSON.parse(run('node', [targetBin, 'codex', 'operator', '--goal', 'stabilize the current monorepo wave', '--json'], targetRepo));

  assert.ok(setup.operatorAssets.includes('.codex/operator/monorepo-control/README.md'));
  assert.ok(fs.existsSync(path.join(targetRepo, '.codex/operator/monorepo-control/README.md')));

  assert.equal(operator.commands.workspaceImpact, 'rai workspace-impact --json');
  assert.equal(operator.commands.monorepoControl, 'rai monorepo-control --json');
  assert.equal(operator.files.monorepoControlGuide, '.codex/operator/monorepo-control/README.md');
  assert.ok(['single-package', 'guided', 'attention-required', 'ready'].includes(operator.monorepoControl.verdict));
  assert.equal(operator.monorepoControl.command, 'rai monorepo-control --json');
  assert.ok(operator.skills.includes('raiola-monorepo-control-room'));
  assert.ok(operator.skills.includes('raiola-workspace-impact-planner'));

  const operatorMarkdown = fs.readFileSync(path.join(targetRepo, operator.markdownFile), 'utf8');
  assert.match(operatorMarkdown, /Monorepo control/);
  assert.match(operatorMarkdown, /Workspace impact/);

  const monorepoGuide = fs.readFileSync(path.join(targetRepo, '.codex/operator/monorepo-control/README.md'), 'utf8');
  assert.match(monorepoGuide, /monorepo-control/i);
  assert.match(monorepoGuide, /workspace-impact/i);

  const pluginDir = path.join(targetRepo, 'plugins', 'raiola-codex-optimizer');
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.skills.includes('skills/raiola-monorepo-control-room'));
  assert.ok(plugin.skills.includes('skills/raiola-workspace-impact-planner'));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-monorepo-control-room', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-workspace-impact-planner', 'SKILL.md')));
});
