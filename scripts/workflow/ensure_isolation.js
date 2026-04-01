const path = require('node:path');
const {
  currentBranch,
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  safeExec,
  slugify,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
ensure_isolation

Usage:
  node scripts/workflow/ensure_isolation.js --mode branch

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --mode <mode>         none|branch|worktree. Defaults to PREFERENCES.md
  --milestone <name>    Optional milestone label used for branch/worktree naming
  --branch <name>       Optional explicit branch name
  --worktree <path>     Optional explicit worktree path
  --dry-run             Preview without mutating git state
  --json                Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  const preferences = loadPreferences(paths);
  const mode = String(args.mode || preferences.gitIsolation || 'none').trim();
  const dryRun = Boolean(args['dry-run']);
  const milestone = String(args.milestone || path.basename(rootDir) || 'workflow').trim();
  const branchName = String(args.branch || `codex/${slugify(milestone) || 'workflow'}`).trim();
  const worktreePath = path.resolve(cwd, String(args.worktree || path.join('..', `${path.basename(cwd)}-${slugify(milestone) || 'workflow'}`)));
  const payload = {
    mode,
    currentBranch: currentBranch(cwd),
    branchName,
    worktreePath,
    status: 'pass',
    action: 'none',
  };

  if (mode === 'none') {
    payload.action = 'stay_on_current_branch';
  } else if (mode === 'branch') {
    if (payload.currentBranch === branchName) {
      payload.action = 'already_isolated';
    } else if (dryRun) {
      payload.status = 'warn';
      payload.action = `would_checkout_${branchName}`;
    } else {
      const branchExists = safeExec('git', ['rev-parse', '--verify', branchName], { cwd }).ok;
      safeExec('git', branchExists ? ['checkout', branchName] : ['checkout', '-b', branchName], { cwd });
      payload.action = branchExists ? 'checked_out_existing_branch' : 'created_branch';
      payload.currentBranch = currentBranch(cwd);
    }
  } else if (mode === 'worktree') {
    const listResult = safeExec('git', ['worktree', 'list', '--porcelain'], { cwd });
    const hasWorktree = listResult.ok && listResult.stdout.includes(worktreePath);
    if (hasWorktree) {
      payload.action = 'existing_worktree_found';
    } else if (dryRun) {
      payload.status = 'warn';
      payload.action = `would_add_worktree_${worktreePath}`;
    } else {
      const branchExists = safeExec('git', ['rev-parse', '--verify', branchName], { cwd }).ok;
      safeExec(
        'git',
        branchExists
          ? ['worktree', 'add', worktreePath, branchName]
          : ['worktree', 'add', '-b', branchName, worktreePath],
        { cwd },
      );
      payload.action = branchExists ? 'attached_existing_branch_worktree' : 'created_worktree_branch';
    }
  } else {
    payload.status = 'fail';
    payload.action = 'invalid_mode';
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# ISOLATION\n`);
  console.log(`- Mode: \`${payload.mode}\``);
  console.log(`- Status: \`${payload.status}\``);
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- Current branch: \`${payload.currentBranch}\``);
  if (payload.mode === 'worktree') {
    console.log(`- Worktree path: \`${payload.worktreePath}\``);
  }

  if (payload.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
