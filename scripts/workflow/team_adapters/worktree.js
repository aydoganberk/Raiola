const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { ensureDir, safeArtifactToken, slugify } = require('../common');
const {
  buildFailureResult,
  inspectCodexWorker,
  launchCodexWorker,
  supportsCodexExec,
} = require('./codex_exec_driver');

function run(command, args, cwd) {
  return childProcess.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function repoSlug(cwd) {
  return slugify(path.basename(cwd) || 'repo');
}

function workspacePathFor(cwd, taskId) {
  return path.join(
    os.tmpdir(),
    'rai-worktrees',
    repoSlug(cwd),
    safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' }),
  );
}

function canUseGitWorktree(cwd) {
  const result = run('git', ['rev-parse', '--verify', 'HEAD'], cwd);
  return result.status === 0;
}

function ensureGitWorkspace(cwd, workspacePath) {
  ensureDir(path.dirname(workspacePath));
  if (fs.existsSync(workspacePath)) {
    return {
      mode: 'git-worktree',
      reused: true,
    };
  }

  const result = run('git', ['worktree', 'add', '--detach', workspacePath], cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git worktree add failed for ${workspacePath}`);
  }

  return {
    mode: 'git-worktree',
    reused: false,
  };
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureSnapshotWorkspace(cwd, task, workspacePath) {
  ensureDir(workspacePath);
  for (const relativeFile of task.writeScope || []) {
    copyFileIfExists(path.join(cwd, relativeFile), path.join(workspacePath, relativeFile));
  }
  return {
    mode: 'snapshot',
    reused: true,
  };
}

function writeWorkspaceTaskFiles(state, task, workspacePath) {
  const packetSource = task.packetFile;
  if (packetSource && fs.existsSync(packetSource)) {
    copyFileIfExists(packetSource, path.join(workspacePath, 'TASK_PACKET.md'));
  }
  fs.writeFileSync(
    path.join(workspacePath, '.workflow-task-result.md'),
    `# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Describe what was finished\`
- Evidence: \`tests | screenshots | manual notes\`

## Details

- \`Replace this with the real result details\`

## Next

- \`Optional next action\`
`,
  );
  fs.writeFileSync(
    path.join(workspacePath, '.workflow-task-meta.json'),
    `${JSON.stringify({
      taskId: task.id,
      role: task.role,
      milestone: state.milestone,
      wave: task.wave,
      writeScope: task.writeScope,
    }, null, 2)}\n`,
  );
}

function parseResultFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!/- Status: `/.test(content)) {
    const summary = content.split('\n').map((line) => line.trim()).find(Boolean) || 'No summary recorded';
    return {
      status: 'completed',
      summary: summary.slice(0, 160),
      evidence: [],
      details: content.trim(),
      next: '',
    };
  }
  const status = content.match(/- Status: `([^`]*)`/)?.[1] || 'completed';
  const summary = content.match(/- Summary: `([^`]*)`/)?.[1] || 'No summary recorded';
  const evidence = content.match(/- Evidence: `([^`]*)`/)?.[1]
    ?.split('|')
    .map((item) => item.trim())
    .filter(Boolean) || [];
  const detailsSection = content.match(/## Details\n\n([\s\S]*?)(?:\n## |\s*$)/)?.[1]?.trim() || '';
  const nextSection = content.match(/## Next\n\n([\s\S]*?)\s*$/)?.[1]?.trim() || '';
  return {
    status,
    summary,
    evidence,
    details: detailsSection,
    next: nextSection.replace(/^- /gm, '').trim(),
  };
}

function prepare(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'prepared',
    workspaces: runtimeState.workspaces || {},
    engine: canUseGitWorktree(state.repoRoot) ? 'git-worktree' : 'snapshot',
  };
}

function dispatch(state, runtimeState) {
  const nextState = {
    ...runtimeState,
    status: 'dispatched',
    workspaces: { ...(runtimeState.workspaces || {}) },
    dispatchedTasks: [...new Set(runtimeState.dispatchedTasks || [])],
  };

  for (const task of state.tasks.filter((item) => item.wave === state.activeWave && ['ready', 'in_progress'].includes(item.status))) {
    if (nextState.dispatchedTasks.includes(task.id)) {
      continue;
    }
    const workspacePath = workspacePathFor(state.repoRoot, task.id);
    const provisioning = canUseGitWorktree(state.repoRoot)
      ? ensureGitWorkspace(state.repoRoot, workspacePath)
      : ensureSnapshotWorkspace(state.repoRoot, task, workspacePath);
    writeWorkspaceTaskFiles(state, task, workspacePath);
    const workspace = {
      path: workspacePath,
      mode: provisioning.mode,
      reused: provisioning.reused,
      dispatchedAt: new Date().toISOString(),
    };
    if (supportsCodexExec(nextState)) {
      workspace.execCwd = workspacePath;
      workspace.live = launchCodexWorker(state, task, workspace, nextState, {
        readOnly: false,
      });
    }
    nextState.workspaces[task.id] = workspace;
    nextState.dispatchedTasks.push(task.id);
  }

  return nextState;
}

function poll(state, runtimeState) {
  const workspaces = {};
  for (const [taskId, workspace] of Object.entries(runtimeState.workspaces || {})) {
    const exists = fs.existsSync(workspace.path);
    const resultFile = path.join(workspace.path, '.workflow-task-result.md');
    const dirty = workspace.mode === 'git-worktree'
      ? run('git', ['status', '--short'], workspace.path).stdout.trim()
      : '';
    const live = inspectCodexWorker(workspace);
    workspaces[taskId] = {
      ...workspace,
      exists,
      hasResult: exists && fs.existsSync(resultFile),
      dirty,
      live,
    };
  }

  return {
    ...runtimeState,
    status: runtimeState.status || 'prepared',
    workspaces,
  };
}

function collect(state, runtimeState) {
  const collectedTasks = [...(runtimeState.collectedTasks || [])];
  const collectedResults = { ...(runtimeState.collectedResults || {}) };

  for (const [taskId, workspace] of Object.entries(runtimeState.workspaces || {})) {
    const resultFile = path.join(workspace.path, '.workflow-task-result.md');
    const live = inspectCodexWorker(workspace);
    if (!fs.existsSync(resultFile)) {
      if (live && !live.running) {
        collectedResults[taskId] = buildFailureResult(workspace, taskId);
        if (!collectedTasks.includes(taskId)) {
          collectedTasks.push(taskId);
        }
      }
      continue;
    }
    collectedResults[taskId] = parseResultFile(resultFile);
    if (!collectedTasks.includes(taskId)) {
      collectedTasks.push(taskId);
    }
  }

  return {
    ...runtimeState,
    status: runtimeState.status || 'prepared',
    collectedTasks,
    collectedResults,
  };
}

function stop(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'paused',
  };
}

module.exports = {
  collect,
  dispatch,
  poll,
  prepare,
  stop,
};
