const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase22-'));
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

function readFile(targetRepo, relativeFile) {
  return fs.readFileSync(path.join(targetRepo, relativeFile), 'utf8');
}

function writeResultFile(workspacePath, taskId, summary) {
  fs.writeFileSync(
    path.join(workspacePath, '.workflow-task-result.md'),
    `# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`${summary}\`
- Evidence: \`manual smoke | verify refs\`

## Details

- \`Completed ${taskId} in supervisor flow\`

## Next

- \`Return to manager\`
`,
  );
}

test('team supervisor, merge queue, and PR feedback runtime stay merge-aware', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M22',
      '--name', 'Supervisor runtime',
      '--goal', 'Exercise the concurrent supervisor surfaces',
    ],
    targetRepo,
  );

  const statusPath = path.join(targetRepo, 'docs', 'workflow', 'STATUS.md');
  fs.writeFileSync(
    statusPath,
    readFile(targetRepo, 'docs/workflow/STATUS.md').replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`'),
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'ready for supervisor runtime'], targetRepo);

  JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'rai.js'),
      'team',
      'run',
      '--adapter',
      'worktree',
      '--activation-text',
      'parallel yap',
      '--write-scope',
      'docs/workflow/STATUS.md;docs/workflow/CONTEXT.md',
      '--json',
    ],
    targetRepo,
  ));
  const dispatched = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'dispatch', '--json'],
    targetRepo,
  ));

  const worker1 = Object.entries(dispatched.workspaces).find(([taskId]) => taskId.includes('worker-1'));
  const worker2 = Object.entries(dispatched.workspaces).find(([taskId]) => taskId.includes('worker-2'));
  assert.ok(worker1, 'worker-1 workspace should exist');
  assert.ok(worker2, 'worker-2 workspace should exist');

  const [worker1TaskId, worker1Workspace] = worker1;
  const [worker2TaskId, worker2Workspace] = worker2;
  const worker1Path = path.resolve(targetRepo, worker1Workspace.path);
  const worker2Path = path.resolve(targetRepo, worker2Workspace.path);

  fs.appendFileSync(path.join(worker1Path, 'docs', 'workflow', 'STATUS.md'), '\n- Supervisor patch marker: worker-1\n');
  fs.appendFileSync(path.join(worker2Path, 'docs', 'workflow', 'CONTEXT.md'), '\n- Supervisor patch marker: worker-2\n');
  writeResultFile(worker1Path, worker1TaskId, 'Finished worker-1 scope');
  writeResultFile(worker2Path, worker2TaskId, 'Finished worker-2 scope');

  const supervisor = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'supervise', '--cycles', '1', '--json'],
    targetRepo,
  ));
  assert.ok(supervisor.cycleCount >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'supervisor.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'merge-queue.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'conflicts.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'quality.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'review-loop.json')));

  const feedbackFile = path.join(targetRepo, 'review-comments.json');
  fs.writeFileSync(feedbackFile, JSON.stringify([
    {
      id: 'comment-1',
      path: 'docs/workflow/STATUS.md',
      body: 'Tighten the status wording before merge.',
    },
  ], null, 2));

  const importedFeedback = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'pr-feedback', 'import', '--file', 'review-comments.json', '--json'],
    targetRepo,
  ));
  assert.equal(importedFeedback.openCount, 1);
  assert.ok(fs.existsSync(path.join(targetRepo, importedFeedback.followupsFile)));

  const mergeQueueBlocked = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'merge-queue', '--json'],
    targetRepo,
  ));
  assert.ok((mergeQueueBlocked.counts.blocked_feedback || 0) >= 1);

  const quality = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'quality', '--json'],
    targetRepo,
  ));
  assert.ok(quality.averageScore >= 0);
  assert.ok(quality.tasks.length >= 2);

  const resolvedFeedback = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'pr-feedback', 'resolve', '--id', 'comment-1', '--json'],
    targetRepo,
  ));
  assert.equal(resolvedFeedback.openCount, 0);

  const mergeQueueApplied = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'team', 'merge-queue', '--apply-next', '--json'],
    targetRepo,
  ));
  assert.ok((mergeQueueApplied.lastApply?.applied || []).length >= 1);
  assert.match(readFile(targetRepo, 'docs/workflow/STATUS.md'), /Supervisor patch marker: worker-1/);
});
