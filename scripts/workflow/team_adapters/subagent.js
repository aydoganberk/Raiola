const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, slugify } = require('../common');
const {
  buildFailureResult,
  inspectCodexWorker,
  launchCodexWorker,
  supportsCodexExec,
} = require('./codex_exec_driver');

function workspacePathFor(cwd, taskId) {
  return path.join(cwd, '.workflow', 'orchestration', 'subagents', `${slugify(taskId) || taskId}`);
}

function writeWorkspaceTaskFiles(state, task, workspacePath) {
  ensureDir(workspacePath);
  if (task.packetFile && fs.existsSync(task.packetFile)) {
    fs.copyFileSync(task.packetFile, path.join(workspacePath, 'TASK_PACKET.md'));
  }
  fs.writeFileSync(
    path.join(workspacePath, '.workflow-task-result.md'),
    `# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Describe what was finished\`
- Evidence: \`manual notes | verify refs\`

## Details

- \`Use this area for the subagent summary\`

## Next

- \`Optional follow-up\`
`,
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
  return {
    status: content.match(/- Status: `([^`]*)`/)?.[1] || 'completed',
    summary: content.match(/- Summary: `([^`]*)`/)?.[1] || 'No summary recorded',
    evidence: content.match(/- Evidence: `([^`]*)`/)?.[1]
      ?.split('|')
      .map((item) => item.trim())
      .filter(Boolean) || [],
    details: content.match(/## Details\n\n([\s\S]*?)(?:\n## |\s*$)/)?.[1]?.trim() || '',
    next: content.match(/## Next\n\n([\s\S]*?)\s*$/)?.[1]?.trim() || '',
  };
}

function prepare(state, runtimeState) {
  return {
    ...runtimeState,
    status: 'prepared',
    workspaces: runtimeState.workspaces || {},
    engine: 'subagent-packet',
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
    writeWorkspaceTaskFiles(state, task, workspacePath);
    const workspace = {
      path: workspacePath,
      mode: 'subagent',
      reused: false,
      exists: true,
      dispatchedAt: new Date().toISOString(),
    };
    if (supportsCodexExec(nextState)) {
      workspace.execCwd = state.repoRoot;
      workspace.live = launchCodexWorker(state, task, workspace, nextState, {
        readOnly: true,
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
    const live = inspectCodexWorker(workspace);
    workspaces[taskId] = {
      ...workspace,
      exists,
      hasResult: exists && fs.existsSync(path.join(workspace.path, '.workflow-task-result.md')),
      live,
    };
  }
  return {
    ...runtimeState,
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
