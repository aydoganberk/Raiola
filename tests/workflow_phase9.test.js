const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase9-'));
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

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8');
}

test('workflow:init installs workflow:checkpoint and new milestone seeds continuity sections', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  assert.equal(packageJson.scripts['workflow:checkpoint'], 'node scripts/workflow/checkpoint.js');

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M12',
      '--name', 'Continuity',
      '--goal', 'Preserve continuity across compact and handoff',
    ],
    targetRepo,
  );

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  const validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.match(statusDoc, /## At-Risk Requirements/);
  assert.match(contextDoc, /## Intent Core/);
  assert.match(execplanDoc, /## Delivery Core/);
  assert.match(execplanDoc, /## Open Requirements/);
  assert.match(execplanDoc, /## Current Capability Slice/);
  assert.match(execplanDoc, /## Cold Archive Refs/);
  assert.match(validationDoc, /## Validation Core/);
  assert.match(handoffDoc, /## Continuity Checkpoint/);
  assert.match(windowDoc, /- Checkpoint freshness: `no`/);
  assert.match(windowDoc, /## Checkpoint Guard/);
});

test('workflow:checkpoint writes continuity checkpoint and refreshes window freshness', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M13',
      '--name', 'Checkpoint',
      '--goal', 'Capture continuity before compact',
    ],
    targetRepo,
  );

  const payload = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'checkpoint.js'),
      '--next', 'Resume with the discuss packet',
      '--files', 'docs/workflow/CONTEXT.md|docs/workflow/EXECPLAN.md',
      '--json',
    ],
    targetRepo,
  ));

  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.equal(payload.checkpointFreshness, 'yes');
  assert.equal(payload.nextOneAction, 'Resume with the discuss packet');
  assert.match(handoffDoc, /- Next one action: `Resume with the discuss packet`/);
  assert.match(handoffDoc, /- Open requirement IDs: `R1`/);
  assert.match(handoffDoc, /- Active validation IDs: `AC1`/);
  assert.match(windowDoc, /- Checkpoint freshness: `yes`/);
});

test('workflow:pause-work creates a checkpoint first and resume-work surfaces checkpoint plus open requirements', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M14',
      '--name', 'Pause resume',
      '--goal', 'Resume from checkpoint instead of rereading everything',
    ],
    targetRepo,
  );

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'pause_work.js'),
      '--summary', 'Stopping before research',
      '--next', 'Resume with the current discuss packet',
    ],
    targetRepo,
  );

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'resume_work.js'), '--json'],
    targetRepo,
  ));

  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.match(handoffDoc, /- Handoff status: `ready_to_resume`/);
  assert.match(handoffDoc, /## Continuity Checkpoint/);
  assert.equal(payload.currentChunk, 'NONE');
  assert.match(payload.continuityCheckpoint, /Promised scope:/);
  assert.match(payload.openRequirements, /R1/);
  assert.match(payload.currentCapabilitySlice, /current capability slice/i);
  assert.match(windowDoc, /- Checkpoint freshness: `yes`/);
});

test('workflow:window becomes checkpoint-aware and asks for a checkpoint before compacting when stale', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M15',
      '--name', 'Window guard',
      '--goal', 'Do not compact blindly without a checkpoint',
    ],
    targetRepo,
  );

  const firstPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'window_monitor.js'), '--json'],
    targetRepo,
  ));

  run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'checkpoint.js'), '--json'],
    targetRepo,
  );

  const secondPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'window_monitor.js'), '--json'],
    targetRepo,
  ));

  assert.equal(firstPayload.checkpointFreshness, 'no');
  if (firstPayload.decision !== 'continue') {
    assert.equal(firstPayload.recommendedAction, 'checkpoint_then_compact');
  }
  assert.equal(secondPayload.checkpointFreshness, 'yes');
});

test('automation-driven phase boundary creates a checkpoint before advancing phases', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M16',
      '--name', 'Automation boundary',
      '--goal', 'Checkpoint before automation crosses a phase boundary',
      '--automation', 'phase',
    ],
    targetRepo,
  );

  run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'execute', '--mode', 'explicit', '--json'],
    targetRepo,
  );

  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.match(handoffDoc, /## Continuity Checkpoint/);
  assert.match(handoffDoc, /Continue from execute after the automation phase boundary/);
  assert.match(windowDoc, /- Checkpoint freshness: `yes`/);
});

test('session protocol is checkpoint-first rather than full-doc-first', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');

  assert.match(execplanDoc, /Continuity Checkpoint/);
  assert.match(execplanDoc, /Open Requirements/);
  assert.match(execplanDoc, /Current Capability Slice/);
  assert.match(execplanDoc, /Only if the checkpoint is stale, missing, or obviously insufficient/);
});
