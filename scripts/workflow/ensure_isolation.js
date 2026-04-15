const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  currentBranch,
  getFieldValue,
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  safeExec,
  slugify,
  workflowPaths,
} = require('./common');
const {
  ensureDir,
  readTextIfExists: readIfExists,
} = require('./io/files');

function printHelp() {
  console.log(`
ensure_isolation

Usage:
  node scripts/workflow/ensure_isolation.js --mode branch

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --mode <mode>         none|branch|worktree. Defaults to PREFERENCES.md
  --name <slug>         Optional workstream name override
  --milestone <name>    Optional milestone label used for branch/worktree naming
  --branch <name>       Optional explicit branch name
  --worktree <path>     Optional explicit worktree path
  --link-node-modules   Symlink repo root node_modules into the worktree when present
  --dry-run             Preview without mutating git state
  --json                Print machine-readable output
  `);
}

function gitRootFor(cwd) {
  const result = safeExec('git', ['rev-parse', '--show-toplevel'], { cwd });
  return result.ok ? path.resolve(cwd, result.stdout) : null;
}

function runGit(cwd, args) {
  try {
    const stdout = childProcess.execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || '').trim(),
    };
  }
}

function branchExists(cwd, branchName) {
  return safeExec('git', ['show-ref', '--verify', `refs/heads/${branchName}`], { cwd }).ok;
}

function uniqueBranchName(cwd, baseName) {
  const current = currentBranch(cwd);
  if (current !== baseName || !branchExists(cwd, baseName)) {
    return baseName;
  }

  let index = 1;
  while (branchExists(cwd, `${baseName}-${index}`)) {
    index += 1;
  }
  return `${baseName}-${index}`;
}

function parseWorktreeList(cwd) {
  const result = safeExec('git', ['worktree', 'list', '--porcelain'], { cwd });
  if (!result.ok) {
    return [];
  }

  const items = [];
  let current = null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        items.push(current);
      }
      current = { path: line.slice('worktree '.length).trim() };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
    }
  }

  if (current) {
    items.push(current);
  }

  return items;
}

function normalizeFsPath(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function syncWorkflowFilesToWorktree(gitRoot, worktreePath, workflowRoot) {
  const syncTargets = [
    path.join(gitRoot, 'docs', 'workflow', 'WORKSTREAMS.md'),
    workflowRoot,
  ];

  for (const sourcePath of syncTargets) {
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const relative = path.relative(gitRoot, sourcePath);
    const targetPath = path.join(worktreePath, relative);
    if (normalizeFsPath(sourcePath) === normalizeFsPath(targetPath)) {
      continue;
    }
    ensureDir(path.dirname(targetPath));

    if (fs.statSync(sourcePath).isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}


function linkSharedNodeModules(gitRoot, worktreePath) {
  const sourcePath = path.join(gitRoot, 'node_modules');
  const targetPath = path.join(worktreePath, 'node_modules');
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return { linked: false, reason: fs.existsSync(sourcePath) ? 'target exists' : 'source missing' };
  }
  try {
    fs.symlinkSync(sourcePath, targetPath, 'junction');
    return { linked: true, targetPath };
  } catch (error) {
    return { linked: false, reason: error.message };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir, cwd);
  const preferences = loadPreferences(paths);
  const statusDoc = readIfExists(paths.status);
  const gitRoot = gitRootFor(cwd);
  const requestedMode = String(args.mode || preferences.gitIsolation || 'none').trim();
  const mode = ['none', 'branch', 'worktree'].includes(requestedMode) ? requestedMode : 'none';
  const workstreamName = String(
    args.name
    || (statusDoc && getFieldValue(statusDoc, 'Current workstream'))
    || path.basename(rootDir)
    || 'workflow',
  ).trim();
  const milestone = String(args.milestone || (statusDoc && getFieldValue(statusDoc, 'Current milestone')) || 'NONE').trim();
  const branchSource = milestone !== 'NONE' ? `${workstreamName}-${milestone}` : workstreamName;
  const requestedBranchName = String(args.branch || `codex/${slugify(branchSource) || 'workflow'}`).trim();
  const branchName = mode === 'worktree'
    ? uniqueBranchName(gitRoot || cwd, requestedBranchName)
    : requestedBranchName;
  const worktreePath = path.resolve(
    cwd,
    String(args.worktree || path.join('..', `${path.basename(gitRoot || cwd)}-${slugify(branchSource) || 'workflow'}`)),
  );
  const dryRun = Boolean(args['dry-run']);
  const payload = {
    mode,
    status: 'pass',
    action: 'none',
    gitRoot: gitRoot || '',
    workflowRoot: rootDir,
    workstream: workstreamName,
    milestone,
    requestedBranchName,
    branchName,
    currentBranch: gitRoot ? currentBranch(gitRoot) : 'unknown',
    worktreePath,
    checkoutRoot: gitRoot || cwd,
    syncPerformed: false,
    nodeModulesLink: null,
  };

  if (!gitRoot) {
    payload.status = 'fail';
    payload.action = 'missing_git_repo';
  } else if (mode === 'none') {
    payload.action = 'stay_on_current_checkout';
  } else if (mode === 'branch') {
    if (payload.currentBranch === branchName) {
      payload.action = 'already_isolated';
    } else if (dryRun) {
      payload.status = 'warn';
      payload.action = `would_checkout_${branchName}`;
    } else {
      const existedBefore = branchExists(gitRoot, branchName);
      const checkoutResult = existedBefore
        ? runGit(gitRoot, ['checkout', branchName])
        : runGit(gitRoot, ['checkout', '-b', branchName]);

      if (!checkoutResult.ok) {
        payload.status = 'fail';
        payload.action = 'checkout_failed';
        payload.error = checkoutResult.stderr || checkoutResult.stdout || `git checkout ${branchName} failed`;
      } else {
        payload.action = existedBefore ? 'checked_out_existing_branch' : 'created_branch';
        payload.currentBranch = currentBranch(gitRoot);
      }
    }
  } else if (mode === 'worktree') {
    const existingWorktree = parseWorktreeList(gitRoot)
      .find((item) => path.resolve(item.path) === worktreePath);

    if (existingWorktree) {
      payload.action = 'existing_worktree_found';
      payload.checkoutRoot = worktreePath;
    } else if (dryRun) {
      payload.status = 'warn';
      payload.action = `would_add_worktree_${worktreePath}`;
      payload.checkoutRoot = worktreePath;
    } else {
      if (fs.existsSync(worktreePath) && fs.readdirSync(worktreePath).length > 0) {
        payload.status = 'fail';
        payload.action = 'worktree_path_not_empty';
      } else {
        const existedBefore = branchExists(gitRoot, branchName);
        const worktreeResult = existedBefore
          ? runGit(gitRoot, ['worktree', 'add', worktreePath, branchName])
          : runGit(gitRoot, ['worktree', 'add', '-b', branchName, worktreePath]);

        if (!worktreeResult.ok) {
          payload.status = 'fail';
          payload.action = 'worktree_add_failed';
          payload.error = worktreeResult.stderr || worktreeResult.stdout || `git worktree add ${worktreePath} failed`;
        } else {
          syncWorkflowFilesToWorktree(gitRoot, worktreePath, rootDir);
          payload.action = existedBefore
            ? 'attached_existing_branch_worktree'
            : 'created_worktree_branch';
          payload.checkoutRoot = worktreePath;
          payload.syncPerformed = true;
          if (args['link-node-modules'] || fs.existsSync(path.join(gitRoot, 'node_modules'))) {
            payload.nodeModulesLink = linkSharedNodeModules(gitRoot, worktreePath);
          }
        }
      }
    }
  } else {
    payload.status = 'fail';
    payload.action = 'invalid_mode';
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# ISOLATION\n');
  console.log(`- Mode: \`${payload.mode}\``);
  console.log(`- Status: \`${payload.status}\``);
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- Workstream: \`${payload.workstream}\``);
  console.log(`- Branch: \`${payload.branchName}\``);
  console.log(`- Current branch: \`${payload.currentBranch}\``);
  console.log(`- Checkout root: \`${payload.checkoutRoot}\``);
  if (payload.mode === 'worktree') {
    console.log(`- Worktree path: \`${payload.worktreePath}\``);
  }
  if (payload.nodeModulesLink) {
    console.log(`- node_modules link: \`${payload.nodeModulesLink.linked ? 'linked' : payload.nodeModulesLink.reason || 'skipped'}\``);
  }
  if (payload.error) {
    console.log(`- Error: \`${payload.error}\``);
  }

  if (payload.status === 'fail') {
    process.exitCode = 1;
  }
}

main();
