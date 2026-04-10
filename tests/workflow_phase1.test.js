const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');
const migrateScript = path.join(repoRoot, 'scripts', 'workflow', 'migrate.js');
const goldenCompactHud = path.join(repoRoot, 'tests', 'golden', 'workflow', 'hud-compact.txt');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-'));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function makeEmptyTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-empty-'));
}

function run(command, args, cwd, options = {}) {
  const resolvedCommand = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  return childProcess.execFileSync(resolvedCommand, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function normalizeCompactHud(value) {
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/remaining=`\d+`/g, 'remaining=`<remaining>`')
    .replace(
      /packets=`context:[a-f0-9]+\/ok execplan:[a-f0-9]+\/ok validation:[a-f0-9]+\/ok`/g,
      'packets=`<packet-hashes>``',
    )
    .replace('packets=`<packet-hashes>``', 'packets=`<packet-hashes>`');
}

test('raiola:init installs the runtime surface and HUD state', () => {
  const targetRepo = makeTempRepo();

  run('node', [initScript, '--target', targetRepo], repoRoot);

  assert.ok(fs.existsSync(path.join(targetRepo, 'docs', 'workflow', 'WORKSTREAMS.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'hud.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'init.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'spec.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'plan.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'cli', 'rai.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'bin', 'rai.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.agents', 'skills', 'raiola', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.agents', 'skills', 'using-raiola', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.agents', 'skills', 'raiola-milestone-lifecycle', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'state.json')));

  const packageJson = JSON.parse(fs.readFileSync(path.join(targetRepo, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['raiola:hud'], 'node scripts/workflow/hud.js');
  assert.equal(packageJson.scripts['raiola:doctor'], 'node scripts/workflow/doctor.js');
  assert.equal(packageJson.scripts['raiola:init'], 'node scripts/workflow/init.js');
  assert.equal(packageJson.scripts['raiola:spec'], 'node scripts/workflow/spec.js');
  assert.equal(packageJson.scripts['raiola:plan'], 'node scripts/workflow/plan.js');

  const compactHud = run('node', [path.join(targetRepo, 'scripts', 'workflow', 'hud.js'), '--compact'], targetRepo);
  const hudJson = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'hud.js'), '--json'], targetRepo));
  const expectedCompactHud = fs.readFileSync(goldenCompactHud, 'utf8');

  assert.equal(normalizeCompactHud(compactHud), normalizeCompactHud(expectedCompactHud));
  assert.equal(hudJson.workflowRootRelative, 'docs/workflow');
  assert.equal(hudJson.runtimeFileRelative, '.workflow/runtime/hud.json');
  assert.equal(hudJson.workflow.milestone, 'NONE');
  assert.equal(hudJson.workflow.step, 'complete');
  assert.equal(hudJson.health.status, 'pass');
  assert.equal(hudJson.counts.carryforward, 0);
  assert.equal(hudJson.counts.seeds, 0);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'hud.json')));

  run('npm', ['run', 'raiola:doctor', '--', '--strict'], targetRepo);
  run('npm', ['run', 'raiola:health', '--', '--strict'], targetRepo);
  run('npm', ['run', 'raiola:next'], targetRepo);
  run('npm', ['run', 'raiola:hud', '--', '--compact'], targetRepo);
});

test('raiola:migrate refreshes runtime files without overwriting workflow docs by default', () => {
  const targetRepo = makeTempRepo();

  run('node', [initScript, '--target', targetRepo], repoRoot);

  const statusPath = path.join(targetRepo, 'docs', 'workflow', 'STATUS.md');
  const hudPath = path.join(targetRepo, 'scripts', 'workflow', 'hud.js');
  fs.appendFileSync(statusPath, '\n- `custom status marker`\n');
  fs.rmSync(hudPath);

  run('node', [migrateScript, '--target', targetRepo], repoRoot);

  const statusAfter = fs.readFileSync(statusPath, 'utf8');
  const hudJson = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'hud.js'), '--json'], targetRepo));

  assert.ok(statusAfter.includes('custom status marker'));
  assert.ok(fs.existsSync(hudPath));
  assert.equal(hudJson.workflowRootRelative, 'docs/workflow');
  assert.equal(hudJson.runtimeFileRelative, '.workflow/runtime/hud.json');
  assert.equal(hudJson.health.status, 'pass');
});

test('raiola:doctor and raiola:next both refresh .workflow/state.json', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const statePath = path.join(targetRepo, '.workflow', 'state.json');
  fs.rmSync(statePath);

  run('npm', ['run', 'raiola:doctor', '--', '--strict'], targetRepo);
  let state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.updatedBy, 'doctor');
  assert.ok(state.doctor);
  assert.equal(state.workflowRootRelative, 'docs/workflow');

  run('npm', ['run', 'raiola:next'], targetRepo);
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.updatedBy, 'next');
  assert.ok(state.next);
  assert.ok(state.window);
  assert.equal(state.workflow.step, 'complete');
});

test('raiola:init bootstraps a minimal package.json for an empty repo', () => {
  const targetRepo = makeEmptyTempRepo();

  run('node', [initScript, '--target', targetRepo], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  assert.ok(fs.existsSync(packageJsonPath));

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts['raiola:hud'], 'node scripts/workflow/hud.js');
  assert.equal(packageJson.scripts['raiola:doctor'], 'node scripts/workflow/doctor.js');

  run('npm', ['run', 'raiola:hud', '--', '--compact'], targetRepo);
  run('npm', ['run', 'raiola:doctor', '--', '--strict'], targetRepo);
  run('npm', ['run', 'raiola:next'], targetRepo);
});

test('raiola:init tolerates package templates that are missing a seeded status section', () => {
  const targetRepo = makeTempRepo();
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-source-'));
  fs.cpSync(repoRoot, sourceRoot, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`),
  });

  const statusTemplatePath = path.join(sourceRoot, 'templates', 'workflow', 'STATUS.md');
  const statusTemplate = fs.readFileSync(statusTemplatePath, 'utf8');
  const trimmedTemplate = statusTemplate.replace(/\n## At-Risk Requirements[\s\S]*?\n## Broken Tests\n/, '\n## Broken Tests\n');
  fs.writeFileSync(statusTemplatePath, trimmedTemplate);

  run('node', [initScript, '--target', targetRepo], repoRoot, {
    env: {
      ...process.env,
      RAIOLA_SOURCE_ROOT: sourceRoot,
    },
  });

  const statusDoc = fs.readFileSync(path.join(targetRepo, 'docs', 'workflow', 'STATUS.md'), 'utf8');
  assert.match(statusDoc, /## At-Risk Requirements/);
  assert.match(statusDoc, /No active requirements are at risk while there is no active milestone/);
});
