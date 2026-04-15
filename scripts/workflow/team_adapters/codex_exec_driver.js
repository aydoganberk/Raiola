const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { ensureDir, readIfExists } = require('../common');

function supportsCodexExec(runtimeState) {
  return runtimeState?.runner?.type === 'codex-exec';
}

function resultFilePath(workspacePath) {
  return path.join(workspacePath, '.workflow-task-result.md');
}

function logFilePath(workspacePath) {
  return path.join(workspacePath, '.workflow-task-live.log');
}

function codexSpawnOptions() {
  if (process.platform !== 'win32') {
    return {};
  }
  return {
    shell: true,
    windowsHide: true,
  };
}

function detectCodexBinary(command) {
  try {
    const result = childProcess.spawnSync(command, ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      ...codexSpawnOptions(),
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function pidIsRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailFile(filePath, maxLines = 80) {
  const content = readIfExists(filePath);
  if (!content) {
    return '';
  }
  return content
    .split('\n')
    .slice(-maxLines)
    .join('\n')
    .trim();
}

function workspaceExecCwd(state, workspace) {
  return workspace.execCwd || workspace.path || state.repoRoot;
}

function writeScopeList(task) {
  const scope = Array.isArray(task?.writeScope) ? task.writeScope.filter(Boolean) : [];
  return scope.length > 0 ? scope.join(', ') : 'read-only task';
}

function buildWorkerPrompt(state, task, workspace, runtimeState, options = {}) {
  const packetContent = task?.packetFile && fs.existsSync(task.packetFile)
    ? fs.readFileSync(task.packetFile, 'utf8').trim()
    : 'No task packet was generated.';
  const readOnly = Boolean(options.readOnly);
  const declaredSandbox = runtimeState?.runner?.sandbox || (readOnly ? 'read-only' : 'workspace-write');

  return `You are ${task.id}, a Codex worker running inside raiola Team runtime.

Follow the task packet and keep ownership tight.

Worker contract:
- Milestone: ${state.milestone}
- Wave: ${task.wave}
- Role: ${task.role}
- Mode: ${task.mode || 'owner'}
- Declared write scope: ${writeScopeList(task)}
- Execution cwd: ${workspaceExecCwd(state, workspace)}
- Sandbox: ${declaredSandbox}

Rules:
- ${readOnly ? 'Do not modify repository files. This is a read-only worker.' : 'Only edit files inside the declared write scope. Do not spill into unrelated paths.'}
- Keep changes minimal, task-shaped, and verification-aware.
- If you run commands, keep them bounded to the task.
- Your final response must be only the markdown template below.

# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Short outcome summary\`
- Evidence: \`tests | screenshots | manual notes\`

## Details

- \`What changed and why\`

## Next

- \`Optional follow-up\`

## TASK PACKET

${packetContent}
`;
}

function buildCodexArgs(state, task, workspace, runtimeState, options = {}) {
  const runner = runtimeState.runner || {};
  const readOnly = Boolean(options.readOnly);
  const args = ['exec', '--skip-git-repo-check', '--color', 'never'];

  if (runner.model) {
    args.push('-m', String(runner.model));
  }
  if (runner.profile) {
    args.push('-p', String(runner.profile));
  }

  args.push('-s', String(runner.sandbox || (readOnly ? 'read-only' : 'workspace-write')));
  args.push('-a', String(runner.approvalPolicy || 'never'));
  args.push('-o', resultFilePath(workspace.path));
  args.push(buildWorkerPrompt(state, task, workspace, runtimeState, { readOnly }));
  return args;
}

function launchCodexWorker(state, task, workspace, runtimeState, options = {}) {
  if (!supportsCodexExec(runtimeState)) {
    return null;
  }

  ensureDir(workspace.path);
  fs.rmSync(resultFilePath(workspace.path), { force: true });
  fs.rmSync(logFilePath(workspace.path), { force: true });

  const command = String(runtimeState.runner.command || 'codex');
  const logFd = fs.openSync(logFilePath(workspace.path), 'a');
  const child = childProcess.spawn(command, buildCodexArgs(state, task, workspace, runtimeState, options), {
    cwd: workspaceExecCwd(state, workspace),
    detached: true,
    stdio: ['ignore', logFd, logFd],
    ...codexSpawnOptions(),
  });
  child.unref();

  return {
    driver: 'codex-exec',
    command,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    execCwd: workspaceExecCwd(state, workspace),
    resultFile: resultFilePath(workspace.path),
    logFile: logFilePath(workspace.path),
    readOnly: Boolean(options.readOnly),
  };
}

function inspectCodexWorker(workspace) {
  const live = workspace?.live;
  if (!live || live.driver !== 'codex-exec') {
    return null;
  }

  const hasResultFile = fs.existsSync(live.resultFile);
  const running = hasResultFile ? false : pidIsRunning(live.pid);
  return {
    ...live,
    running,
    finishedAt: running ? null : (live.finishedAt || new Date().toISOString()),
    hasResultFile,
    hasLogFile: fs.existsSync(live.logFile),
  };
}

function buildFailureResult(workspace, taskId) {
  const live = workspace?.live || {};
  const tail = tailFile(live.logFile, 80);
  const evidence = [];
  if (live.logFile) {
    evidence.push(path.basename(live.logFile));
  }
  return {
    status: 'failed',
    summary: `Codex worker ${taskId} exited without a structured result`,
    evidence,
    details: tail || 'No worker log was captured.',
    next: 'Inspect the worker log, tighten the task packet, and dispatch again if needed.',
  };
}

module.exports = {
  buildFailureResult,
  detectCodexBinary,
  inspectCodexWorker,
  launchCodexWorker,
  supportsCodexExec,
};
