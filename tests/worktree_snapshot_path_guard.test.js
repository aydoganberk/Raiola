const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { dispatch } = require('../scripts/workflow/team_adapters/worktree');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-worktree-guard-'));
}

test('snapshot workspace rejects writeScope paths that escape the repository boundary', () => {
  const repo = makeTempRepo();
  const outsideFile = path.join(os.tmpdir(), `raiola-secret-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, 'secret');
  const escapingPath = path.relative(repo, outsideFile).replace(/\\/g, '/');

  const state = {
    repoRoot: repo,
    milestone: 'M1',
    activeWave: 'W1',
    tasks: [
      {
        id: 'T1',
        wave: 'W1',
        status: 'ready',
        role: 'implementer',
        writeScope: [escapingPath],
      },
    ],
  };

  assert.throws(
    () => dispatch(state, { workspaces: {}, dispatchedTasks: [] }),
    /repository boundary/i,
  );
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'secret');
});
