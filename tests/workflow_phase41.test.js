const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const {
  applyMergeQueue,
  buildConflictAnalysis,
  createPatchBundle,
} = require('../scripts/workflow/team_runtime_artifacts');

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function spawn(command, args, cwd) {
  return childProcess.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function makeGitRepo(prefix = 'raiola-phase41-') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(repo, 'docs', 'workflow'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'workflow', 'STATUS.md'), '# STATUS\n\n- baseline\n');
  fs.writeFileSync(path.join(repo, 'docs', 'workflow', 'OLD.md'), '# OLD\n');
  run('git', ['init'], repo);
  run('git', ['config', 'user.email', 'test@example.com'], repo);
  run('git', ['config', 'user.name', 'Test User'], repo);
  run('git', ['add', '.'], repo);
  run('git', ['commit', '-m', 'initial state'], repo);
  return repo;
}

function currentHead(repo) {
  return run('git', ['rev-parse', 'HEAD'], repo).trim();
}

function createDetachedWorktree(repo, prefix = 'raiola-phase41-worktree-') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspacePath = path.join(parent, 'repo');
  run('git', ['worktree', 'add', '--detach', workspacePath], repo);
  return {
    path: workspacePath,
    cleanup() {
      spawn('git', ['worktree', 'remove', '--force', workspacePath], repo);
      fs.rmSync(parent, { recursive: true, force: true });
    },
  };
}

function buildQueuedPayload(bundle, taskId = 'task-1') {
  return {
    queue: [
      {
        taskId,
        patchFile: bundle.patchFile,
        manifestFile: bundle.manifestFile,
        changedFiles: bundle.changedFiles,
        patchStrategy: bundle.patchStrategy,
        status: 'queued',
      },
    ],
    counts: { queued: 1 },
    nextTaskId: taskId,
  };
}

test('validated materialization handoff preserves new files from a worktree patch bundle', () => {
  const repo = makeGitRepo('raiola-phase41-newfile-');
  const worktree = createDetachedWorktree(repo, 'raiola-phase41-newfile-wt-');

  try {
    const baseCommit = currentHead(repo);
    fs.appendFileSync(path.join(worktree.path, 'docs', 'workflow', 'STATUS.md'), '- worker edit\n');
    fs.writeFileSync(path.join(worktree.path, 'docs', 'workflow', 'NEWFILE.md'), '# NEW\nhello\n');

    const bundle = createPatchBundle(
      repo,
      { mode: 'git-worktree', path: worktree.path, baseCommit },
      { id: 'task-newfile', writeScope: ['docs/workflow'] },
    );

    assert.equal(bundle.placeholder, false);
    assert.deepEqual(bundle.changedFiles, ['docs/workflow/NEWFILE.md', 'docs/workflow/STATUS.md']);
    assert.ok(fs.existsSync(path.join(repo, bundle.manifestFile)));
    assert.match(fs.readFileSync(path.join(repo, bundle.patchFile), 'utf8'), /NEWFILE\.md/);

    const payload = applyMergeQueue(repo, buildQueuedPayload(bundle, 'task-newfile'));

    assert.equal(payload.queue[0].status, 'applied');
    assert.equal(payload.lastApply.strategy, 'validated-materialization-handoff');
    assert.equal(fs.readFileSync(path.join(repo, 'docs', 'workflow', 'NEWFILE.md'), 'utf8'), '# NEW\nhello\n');
    assert.match(fs.readFileSync(path.join(repo, 'docs', 'workflow', 'STATUS.md'), 'utf8'), /worker edit/);
  } finally {
    worktree.cleanup();
  }
});

test('validated materialization handoff preserves renames by carrying both old and new paths', () => {
  const repo = makeGitRepo('raiola-phase41-rename-');
  const worktree = createDetachedWorktree(repo, 'raiola-phase41-rename-wt-');

  try {
    const baseCommit = currentHead(repo);
    fs.renameSync(
      path.join(worktree.path, 'docs', 'workflow', 'OLD.md'),
      path.join(worktree.path, 'docs', 'workflow', 'RENAMED.md'),
    );

    const bundle = createPatchBundle(
      repo,
      { mode: 'git-worktree', path: worktree.path, baseCommit },
      { id: 'task-rename', writeScope: ['docs/workflow'] },
    );

    assert.equal(bundle.placeholder, false);
    assert.ok(bundle.changedFiles.includes('docs/workflow/OLD.md'));
    assert.ok(bundle.changedFiles.includes('docs/workflow/RENAMED.md'));

    const payload = applyMergeQueue(repo, buildQueuedPayload(bundle, 'task-rename'));

    assert.equal(payload.queue[0].status, 'applied');
    assert.ok(!fs.existsSync(path.join(repo, 'docs', 'workflow', 'OLD.md')));
    assert.equal(fs.readFileSync(path.join(repo, 'docs', 'workflow', 'RENAMED.md'), 'utf8'), '# OLD\n');
  } finally {
    worktree.cleanup();
  }
});

test('merge queue blocks validated handoff when the target repo is already dirty', () => {
  const repo = makeGitRepo('raiola-phase41-dirty-');
  const worktree = createDetachedWorktree(repo, 'raiola-phase41-dirty-wt-');

  try {
    const baseCommit = currentHead(repo);
    fs.appendFileSync(path.join(worktree.path, 'docs', 'workflow', 'STATUS.md'), '- worker edit\n');
    fs.writeFileSync(path.join(worktree.path, 'docs', 'workflow', 'NEWFILE.md'), '# NEW\nhello\n');

    const bundle = createPatchBundle(
      repo,
      { mode: 'git-worktree', path: worktree.path, baseCommit },
      { id: 'task-dirty', writeScope: ['docs/workflow'] },
    );

    fs.appendFileSync(path.join(repo, 'docs', 'workflow', 'STATUS.md'), '- local dirty overlap\n');
    const payload = applyMergeQueue(repo, buildQueuedPayload(bundle, 'task-dirty'));

    assert.match(payload.lastApply.blockedReason, /overlap queued paths/i);
    assert.ok(!fs.existsSync(path.join(repo, 'docs', 'workflow', 'NEWFILE.md')));
  } finally {
    worktree.cleanup();
  }
});

test('conflict analysis blocks stale-base overlap when upstream commits touch the same file', () => {
  const repo = makeGitRepo('raiola-phase41-stale-');
  const worktree = createDetachedWorktree(repo, 'raiola-phase41-stale-wt-');

  try {
    const baseCommit = currentHead(repo);
    fs.writeFileSync(path.join(repo, 'docs', 'workflow', 'STATUS.md'), '# STATUS\n\n- upstream commit\n');
    run('git', ['add', '.'], repo);
    run('git', ['commit', '-m', 'upstream change'], repo);

    fs.writeFileSync(path.join(worktree.path, 'docs', 'workflow', 'STATUS.md'), '# STATUS\n\n- worker change\n');

    const payload = buildConflictAnalysis(
      repo,
      {
        tasks: [
          {
            id: 'task-stale-overlap',
            role: 'worker',
            writeScope: ['docs/workflow/STATUS.md'],
          },
        ],
      },
      {
        workspaces: {
          'task-stale-overlap': {
            path: worktree.path,
            mode: 'git-worktree',
            baseCommit,
          },
        },
        mergeQueue: { queue: [] },
      },
    );

    assert.ok(payload.conflicts.some((entry) => entry.kind === 'upstream_overlap' && entry.taskId === 'task-stale-overlap'));
  } finally {
    worktree.cleanup();
  }
});
