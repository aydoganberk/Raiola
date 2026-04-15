const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase26-'));
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

function writeFile(targetRepo, relativePath, content) {
  const fullPath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('proposal_first discuss mode blocks on approval and records the selected option', () => {
  const targetRepo = makeTempRepo();
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');

  writeFile(targetRepo, 'pubspec.yaml', 'name: conflip_consumer\n');
  writeFile(targetRepo, 'lib/main.dart', 'void main() {}\n');
  fs.writeFileSync(
    path.join(targetRepo, 'docs', 'workflow', 'PREFERENCES.md'),
    readFile(targetRepo, 'docs/workflow/PREFERENCES.md').replace('- Discuss mode: `assumptions`', '- Discuss mode: `proposal_first`'),
  );

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M70',
      '--name', 'Flutter discuss gate',
      '--goal', 'Clarify the Flutter consumer app slice',
    ],
    targetRepo,
  );

  const discuss = JSON.parse(run(
    'node',
    [targetBin, 'discuss', '--goal', 'Clarify the Flutter consumer app slice', '--json'],
    targetRepo,
  ));
  const pendingNext = JSON.parse(run('node', [targetBin, 'next', '--json'], targetRepo));

  assert.equal(discuss.discussMode, 'proposal_first');
  assert.equal(discuss.approvalRequired, true);
  assert.equal(discuss.approval.status, 'pending_approval');
  assert.equal(discuss.options.length, 3);
  assert.ok(discuss.options[0].recommended);
  assert.ok(discuss.options[0].nextArtifacts.includes('map-frontend'));
  assert.match(pendingNext.recommendation.title, /Approve one discuss proposal/);
  assert.match(pendingNext.recommendation.checklist.join('\n'), /rai discuss --approve proposal-1\|proposal-2\|proposal-3/);

  const approved = JSON.parse(run(
    'node',
    [targetBin, 'discuss', '--goal', 'Clarify the Flutter consumer app slice', '--approve', 'proposal-1', '--json'],
    targetRepo,
  ));
  const approvedNext = JSON.parse(run('node', [targetBin, 'next', '--json'], targetRepo));
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');

  assert.equal(approved.approval.status, 'approved');
  assert.equal(approved.approval.selectedOption, 'proposal-1');
  assert.equal(approved.selectedOption.id, 'proposal-1');
  assert.match(contextDoc, /## Discuss Proposal/);
  assert.match(contextDoc, /- Status: `approved`/);
  assert.match(contextDoc, /- Selected option: `proposal-1`/);
  assert.match(approvedNext.recommendation.title, /approved proposal/);
  assert.match(approvedNext.recommendation.note, /proposal-1/);
});

test('milestone-edit reshapes the active milestone across canonical workflow docs', () => {
  const targetRepo = makeTempRepo();
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M71',
      '--name', 'Original slice',
      '--goal', 'Frame the original scope',
    ],
    targetRepo,
  );

  const edit = JSON.parse(run(
    'node',
    [
      targetBin,
      'milestone-edit',
      '--id', 'M71B',
      '--name', 'Reshaped slice',
      '--goal', 'Frame the corrected scope',
      '--phase', 'Phase 1B - Discuss Refresh',
      '--success', 'Corrected scope is explicit and reviewable',
      '--non-goals', 'Shipping unrelated workflow surfaces',
      '--json',
    ],
    targetRepo,
  ));
  const doctor = JSON.parse(run('node', [targetBin, 'doctor', '--json'], targetRepo));
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const milestonesDoc = readFile(targetRepo, 'docs/workflow/MILESTONES.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');
  const workstreamsDoc = readFile(targetRepo, 'docs/workflow/WORKSTREAMS.md');

  assert.equal(edit.changed, true);
  assert.equal(edit.nextLabel, 'M71B - Reshaped slice');
  assert.equal(doctor.failCount, 0);
  assert.equal(doctor.risk.level, 'low');
  assert.match(statusDoc, /- Current phase: `Phase 1B - Discuss Refresh`/);
  assert.match(statusDoc, /- Current milestone: `M71B - Reshaped slice`/);
  assert.match(milestonesDoc, /\| M71B \| Reshaped slice \| Phase 1B - Discuss Refresh \| active \| discuss \| Frame the corrected scope \|/);
  assert.match(milestonesDoc, /- Milestone: `M71B - Reshaped slice`/);
  assert.match(milestonesDoc, /- Goal:\n  - `Frame the corrected scope`/);
  assert.match(milestonesDoc, /- Success signal:\n  - `Corrected scope is explicit and reviewable`/);
  assert.match(milestonesDoc, /- Non-goals:\n  - `Shipping unrelated workflow surfaces`/);
  assert.match(execplanDoc, /- Active milestone: `M71B - Reshaped slice`/);
  assert.match(execplanDoc, /- Current phase: `Phase 1B - Discuss Refresh`/);
  assert.match(execplanDoc, /`Frame the corrected scope`/);
  assert.match(contextDoc, /- Milestone: `M71B - Reshaped slice`/);
  assert.match(contextDoc, /- Goal:\n  - `Frame the corrected scope`/);
  assert.match(contextDoc, /- Success signal:\n  - `Corrected scope is explicit and reviewable`/);
  assert.match(contextDoc, /- Non-goals:\n  - `Shipping unrelated workflow surfaces`/);
  assert.match(validationDoc, /- Active milestone: `M71B - Reshaped slice`/);
  assert.match(validationDoc, /- `Frame the corrected scope`/);
  assert.match(handoffDoc, /- Milestone: `M71B - Reshaped slice`/);
  assert.match(workstreamsDoc, /\| workflow \| docs\/workflow \| active \| M71B - Reshaped slice \| discuss \|/);
});
