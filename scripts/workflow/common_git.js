const childProcess = require('node:child_process');

function currentBranch(cwd) {
  return childProcess.execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

function runGit(cwd, args, dryRun) {
  if (dryRun) {
    return { code: 0, stdout: `DRY RUN git ${args.join(' ')}` };
  }

  const result = childProcess.spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }

  return { code: result.status, stdout: result.stdout };
}

module.exports = {
  currentBranch,
  runGit,
};
