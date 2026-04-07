const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { ensureDir, safeArtifactToken } = require('./common');
const { appendJsonl, relativePath, writeJsonFile } = require('./roadmap_os');
const { runReviewEngine } = require('./review_engine');

const INTERNAL_WORKSPACE_FILES = new Set([
  '.workflow-task-result.md',
  '.workflow-task-meta.json',
  'TASK_PACKET.md',
]);

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'runtime');
}

function patchDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'patches');
}

function mergeQueuePath(cwd) {
  return path.join(runtimeDir(cwd), 'merge-queue.json');
}

function conflictsPath(cwd) {
  return path.join(runtimeDir(cwd), 'conflicts.json');
}

function qualityPath(cwd) {
  return path.join(runtimeDir(cwd), 'quality.json');
}

function supervisorPath(cwd) {
  return path.join(runtimeDir(cwd), 'supervisor.json');
}

function prFeedbackPath(cwd) {
  return path.join(runtimeDir(cwd), 'pr-feedback.json');
}

function prFeedbackFollowupsPath(cwd) {
  return path.join(runtimeDir(cwd), 'pr-feedback-followups.md');
}

function reviewLoopPath(cwd) {
  return path.join(runtimeDir(cwd), 'review-loop.json');
}

function reviewLoopMarkdownPath(cwd) {
  return path.join(runtimeDir(cwd), 'review-loop.md');
}

function combinedPatchPath(cwd) {
  return path.join(runtimeDir(cwd), 'combined.patch');
}

function run(command, args, cwd) {
  return childProcess.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function listWorkspaceFiles(workspacePath) {
  const output = [];
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relative = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
      if (relative.startsWith('.git/') || relative === '.git') {
        continue;
      }
      if (INTERNAL_WORKSPACE_FILES.has(relative)) {
        continue;
      }
      if (/^\.workflow-task-/.test(entry.name)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        output.push(relative);
      }
    }
  }

  if (fs.existsSync(workspacePath)) {
    walk(workspacePath);
  }
  return output.sort();
}

function parseGitStatusLine(line) {
  const trimmed = String(line || '').trimEnd();
  if (!trimmed) {
    return null;
  }
  const status = trimmed.slice(0, 2).trim() || '??';
  const rawPath = trimmed.slice(3).trim();
  const targetPath = rawPath.includes(' -> ')
    ? rawPath.split(' -> ').at(-1)
    : rawPath;
  return {
    status,
    path: targetPath.replace(/\\/g, '/'),
  };
}

function detectChangedFilesForWorkspace(cwd, workspace, task = null) {
  if (!workspace || !workspace.path || !fs.existsSync(workspace.path)) {
    return [];
  }

  if (workspace.mode === 'git-worktree') {
    const status = run('git', ['status', '--porcelain'], workspace.path);
    if (status.status !== 0) {
      return [];
    }
    return status.stdout
      .split('\n')
      .map(parseGitStatusLine)
      .filter(Boolean)
      .map((entry) => entry.path)
      .filter((entry) => !INTERNAL_WORKSPACE_FILES.has(entry) && !/^\.workflow-task-/.test(path.basename(entry)))
      .sort();
  }

  const candidateFiles = new Set([
    ...(task?.writeScope || []),
    ...listWorkspaceFiles(workspace.path),
  ]);
  return [...candidateFiles]
    .filter(Boolean)
    .map((entry) => String(entry).replace(/\\/g, '/'))
    .filter((entry) => !INTERNAL_WORKSPACE_FILES.has(entry))
    .filter((entry) => !/^\.workflow-task-/.test(path.basename(entry)))
    .filter((entry) => {
      const repoFile = path.join(cwd, entry);
      const workspaceFile = path.join(workspace.path, entry);
      const repoExists = fs.existsSync(repoFile);
      const workspaceExists = fs.existsSync(workspaceFile);
      if (repoExists !== workspaceExists) {
        return true;
      }
      if (!repoExists && !workspaceExists) {
        return false;
      }
      return fs.readFileSync(repoFile, 'utf8') !== fs.readFileSync(workspaceFile, 'utf8');
    })
    .sort();
}

function buildNoIndexDiff(cwd, workspacePath, relativeFile) {
  const repoFile = path.join(cwd, relativeFile);
  const workspaceFile = path.join(workspacePath, relativeFile);
  const repoExists = fs.existsSync(repoFile);
  const workspaceExists = fs.existsSync(workspaceFile);

  if (!repoExists && !workspaceExists) {
    return '';
  }

  if (!repoExists) {
    ensureDir(path.dirname(repoFile));
    fs.writeFileSync(repoFile, '');
  }
  if (!workspaceExists) {
    ensureDir(path.dirname(workspaceFile));
    fs.writeFileSync(workspaceFile, '');
  }

  const diff = run('git', ['diff', '--no-index', '--', repoFile, workspaceFile], cwd);
  let output = diff.stdout || '';
  if (!output.trim() && diff.stderr) {
    output = diff.stderr;
  }

  if (!repoExists) {
    fs.rmSync(repoFile, { force: true });
  }
  if (!workspaceExists) {
    fs.rmSync(workspaceFile, { force: true });
  }

  return String(output || '')
    .replace(new RegExp(repoFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `a/${relativeFile}`)
    .replace(new RegExp(workspaceFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `b/${relativeFile}`)
    .replace(new RegExp(`--- a/${relativeFile}\\n\\+\\+\\+ b/${relativeFile}`, 'g'), `--- a/${relativeFile}\n+++ b/${relativeFile}`)
    .replace(/diff --git a\/.+? b\/.+?\n/g, `diff --git a/${relativeFile} b/${relativeFile}\n`);
}

function createPatchBundle(cwd, workspace, task, options = {}) {
  ensureDir(patchDir(cwd));
  const taskId = typeof task === 'string' ? task : task?.id;
  const taskObject = typeof task === 'string' ? null : task;
  const changedFiles = options.changedFiles || detectChangedFilesForWorkspace(cwd, workspace, taskObject);
  const patchPath = path.join(
    patchDir(cwd),
    `${safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' })}.patch`,
  );
  let patchText = '';

  if (workspace?.mode === 'git-worktree' && fs.existsSync(workspace.path)) {
    const result = run('git', ['diff', '--relative'], workspace.path);
    patchText = result.stdout || '';
  } else {
    patchText = changedFiles
      .map((relativeFile) => buildNoIndexDiff(cwd, workspace.path, relativeFile))
      .filter((chunk) => String(chunk || '').trim())
      .join('\n');
  }

  if (!String(patchText || '').trim()) {
    patchText = `# PATCH BUNDLE PLACEHOLDER\n# task=${taskId}\n# mode=${workspace?.mode || 'unknown'}\n# changed_files=${changedFiles.length}\n`;
  }

  fs.writeFileSync(patchPath, `${String(patchText).trimEnd()}\n`);
  return {
    taskId,
    changedFiles,
    patchPath,
    patchFile: relativePath(cwd, patchPath),
    patchSize: Buffer.byteLength(String(patchText || ''), 'utf8'),
    placeholder: /^# PATCH BUNDLE PLACEHOLDER/m.test(patchText),
  };
}

function scopeAllowsFile(writeScope, relativeFile) {
  if (!Array.isArray(writeScope) || writeScope.length === 0) {
    return false;
  }
  return writeScope.some((scopePath) => {
    const normalizedScope = String(scopePath || '').replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedFile = String(relativeFile || '').replace(/\\/g, '/');
    return normalizedFile === normalizedScope || normalizedFile.startsWith(`${normalizedScope}/`);
  });
}

function normalizeFeedbackComment(comment, index) {
  const id = String(comment.id || comment.commentId || comment.threadId || `comment-${index + 1}`);
  const file = comment.file || comment.path || comment.filename || null;
  const line = comment.line || comment.position || comment.startLine || null;
  const body = comment.body || comment.comment || comment.text || comment.message || '';
  const status = comment.status || (comment.resolved ? 'resolved' : 'open');
  return {
    id,
    file: file ? String(file).replace(/\\/g, '/') : null,
    line,
    body: String(body || '').trim(),
    status,
    author: comment.author || comment.user || null,
    createdAt: comment.createdAt || comment.updatedAt || null,
  };
}

function parseFeedbackMarkdown(content) {
  const comments = [];
  for (const rawLine of String(content || '').split('\n')) {
    const line = rawLine.trim();
    if (!/^[-*]\s+/.test(line)) {
      continue;
    }
    const payload = line.replace(/^[-*]\s+/, '');
    const fileMatch = payload.match(/`([^`]+)`/);
    comments.push({
      file: fileMatch?.[1] || null,
      body: payload.replace(/`[^`]+`\s*:??\s*/, '').trim(),
    });
  }
  return comments;
}

function loadPrFeedback(cwd) {
  return readJsonIfExists(prFeedbackPath(cwd), {
    importedAt: null,
    source: null,
    comments: [],
    taskLinks: {},
    openCount: 0,
    resolvedCount: 0,
  });
}

function writePrFeedbackFollowups(cwd, payload) {
  const lines = [
    '# PR FEEDBACK FOLLOWUPS',
    '',
    `- Imported at: \`${payload.importedAt || 'unknown'}\``,
    `- Source: \`${payload.source || 'none'}\``,
    '',
  ];

  const linkedTasks = Object.keys(payload.taskLinks || {}).sort();
  if (linkedTasks.length === 0) {
    lines.push('- `No task mapping could be inferred from the imported review comments.`');
  } else {
    for (const taskId of linkedTasks) {
      lines.push(`## ${taskId}`);
      lines.push('');
      const linkedComments = (payload.comments || []).filter((comment) => (payload.taskLinks?.[taskId] || []).includes(comment.id));
      for (const comment of linkedComments) {
        const done = comment.status === 'resolved' ? 'x' : ' ';
        lines.push(`- [${done}] ${comment.file ? `\`${comment.file}\`` : '`general`'}${comment.line ? `:${comment.line}` : ''} — ${comment.body || 'Review follow-up required'}`);
      }
      lines.push('');
    }
  }
  fs.writeFileSync(prFeedbackFollowupsPath(cwd), `${lines.join('\n').trimEnd()}\n`);
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function importPrFeedback(cwd, runtimeState, sourceFile) {
  const absoluteSource = path.resolve(cwd, sourceFile);
  const content = fs.readFileSync(absoluteSource, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  let rawComments = [];
  if (Array.isArray(parsed)) {
    rawComments = parsed;
  } else if (parsed && typeof parsed === 'object') {
    rawComments = parsed.comments
      || parsed.reviewComments
      || parsed.threads
      || parsed.reviewThreads
      || [];
  } else {
    rawComments = parseFeedbackMarkdown(content);
  }

  const comments = rawComments.map(normalizeFeedbackComment);
  const tasks = Object.values(runtimeState.workspaces || {}).length > 0
    ? Object.keys(runtimeState.workspaces)
    : Object.keys(runtimeState.collectedResults || {});
  const taskLinks = {};

  for (const taskId of tasks) {
    const taskRecord = runtimeState.taskIndex?.[taskId] || runtimeState.tasks?.find?.((item) => item.id === taskId) || null;
    const writeScope = taskRecord?.writeScope || runtimeState.taskScopes?.[taskId] || [];
    const changedFiles = runtimeState.patchBundles?.[taskId]?.changedFiles || [];
    const fileCandidates = new Set([...(writeScope || []), ...(changedFiles || [])]);
    for (const comment of comments) {
      if (comment.status === 'resolved') {
        continue;
      }
      if (!comment.file) {
        continue;
      }
      const normalizedFile = comment.file.replace(/\\/g, '/');
      const matches = [...fileCandidates].some((candidate) => scopeAllowsFile([candidate], normalizedFile));
      if (!matches) {
        continue;
      }
      if (!taskLinks[taskId]) {
        taskLinks[taskId] = [];
      }
      taskLinks[taskId].push(comment.id);
    }
  }

  const payload = {
    importedAt: new Date().toISOString(),
    source: relativePath(cwd, absoluteSource),
    comments,
    taskLinks,
    openCount: comments.filter((comment) => comment.status !== 'resolved').length,
    resolvedCount: comments.filter((comment) => comment.status === 'resolved').length,
  };
  writeJsonFile(prFeedbackPath(cwd), payload);

  writePrFeedbackFollowups(cwd, payload);

  appendJsonl(path.join(runtimeDir(cwd), 'events.jsonl'), {
    generatedAt: new Date().toISOString(),
    event: 'pr_feedback_imported',
    source: payload.source,
    openCount: payload.openCount,
  });

  return payload;
}

function resolvePrFeedback(cwd, commentIds) {
  const current = loadPrFeedback(cwd);
  const resolvedIds = new Set((Array.isArray(commentIds) ? commentIds : [commentIds]).filter(Boolean).map((item) => String(item)));
  const comments = (current.comments || []).map((comment) => (
    resolvedIds.has(String(comment.id))
      ? { ...comment, status: 'resolved', resolvedAt: new Date().toISOString() }
      : comment
  ));
  const next = {
    ...current,
    comments,
    openCount: comments.filter((comment) => comment.status !== 'resolved').length,
    resolvedCount: comments.filter((comment) => comment.status === 'resolved').length,
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(prFeedbackPath(cwd), next);
  writePrFeedbackFollowups(cwd, next);
  return next;
}

function buildConflictAnalysis(cwd, orchestrationState, runtimeState) {
  const conflicts = [];
  const changedByFile = new Map();
  const prFeedback = loadPrFeedback(cwd);
  const tasks = orchestrationState.tasks || [];

  for (const task of tasks) {
    const workspace = runtimeState.workspaces?.[task.id];
    if (!workspace) {
      continue;
    }
    const changedFiles = detectChangedFilesForWorkspace(cwd, workspace, task);
    for (const relativeFile of changedFiles) {
      if (!changedByFile.has(relativeFile)) {
        changedByFile.set(relativeFile, []);
      }
      changedByFile.get(relativeFile).push(task.id);
    }

    if ((task.writeScope || []).length === 0 && changedFiles.length > 0) {
      conflicts.push({
        kind: 'scope_violation',
        severity: 'blocker',
        taskId: task.id,
        files: changedFiles,
        detail: 'Read-only task changed repository files.',
      });
    } else if ((task.writeScope || []).length > 0) {
      const outsideScope = changedFiles.filter((relativeFile) => !scopeAllowsFile(task.writeScope, relativeFile));
      if (outsideScope.length > 0) {
        conflicts.push({
          kind: 'scope_violation',
          severity: 'blocker',
          taskId: task.id,
          files: outsideScope,
          detail: 'Task changed files outside its declared write scope.',
        });
      }
    }

    const openFeedback = (prFeedback.taskLinks?.[task.id] || []).filter((commentId) => {
      const comment = (prFeedback.comments || []).find((entry) => String(entry.id) === String(commentId));
      return comment && comment.status !== 'resolved';
    });
    if (openFeedback.length > 0) {
      conflicts.push({
        kind: 'review_feedback',
        severity: 'warn',
        taskId: task.id,
        feedbackIds: openFeedback,
        detail: 'Imported PR feedback still has open comments mapped to this task.',
      });
    }
  }

  for (const [relativeFile, taskIds] of changedByFile.entries()) {
    if (taskIds.length <= 1) {
      continue;
    }
    conflicts.push({
      kind: 'file_overlap',
      severity: 'blocker',
      file: relativeFile,
      taskIds,
      detail: `Multiple tasks changed ${relativeFile}.`,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    blockerCount: conflicts.filter((entry) => entry.severity === 'blocker').length,
    warnCount: conflicts.filter((entry) => entry.severity !== 'blocker').length,
    conflicts,
  };
  writeJsonFile(conflictsPath(cwd), payload);
  return payload;
}

function qualityScoreForTask(task, runtimeState, conflictPayload, prFeedback) {
  const result = runtimeState.collectedResults?.[task.id] || {};
  const workspace = runtimeState.workspaces?.[task.id] || null;
  const patchBundle = runtimeState.patchBundles?.[task.id] || null;
  const taskConflicts = (conflictPayload.conflicts || []).filter((entry) => entry.taskId === task.id || (entry.taskIds || []).includes(task.id));
  let score = 50;
  if (result.summary) score += 10;
  if ((result.evidence || []).length > 0) score += 10;
  if (result.status === 'completed') score += 10;
  if (patchBundle && !patchBundle.placeholder) score += 10;
  if ((task.writeScope || []).length > 0) score += 5;
  if (workspace?.exists) score += 5;
  score -= taskConflicts.filter((entry) => entry.severity === 'blocker').length * 25;
  score -= taskConflicts.filter((entry) => entry.severity !== 'blocker').length * 10;
  const openFeedback = (prFeedback.taskLinks?.[task.id] || []).filter((commentId) => {
    const comment = (prFeedback.comments || []).find((entry) => String(entry.id) === String(commentId));
    return comment && comment.status !== 'resolved';
  });
  score -= openFeedback.length * 10;
  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 85 ? 'strong' : score >= 70 ? 'good' : score >= 50 ? 'needs-review' : 'retry';
  return {
    taskId: task.id,
    role: task.role,
    score,
    verdict,
    summary: result.summary || '',
    evidenceCount: (result.evidence || []).length,
    conflictCount: taskConflicts.length,
    hasPatch: Boolean(patchBundle),
    placeholderPatch: Boolean(patchBundle?.placeholder),
    openFeedbackCount: openFeedback.length,
  };
}

function buildQualityReport(cwd, orchestrationState, runtimeState, conflictPayload = null) {
  const conflicts = conflictPayload || readJsonIfExists(conflictsPath(cwd), { conflicts: [] });
  const prFeedback = loadPrFeedback(cwd);
  const tasks = (orchestrationState.tasks || []).map((task) => qualityScoreForTask(task, runtimeState, conflicts, prFeedback));
  const payload = {
    generatedAt: new Date().toISOString(),
    averageScore: tasks.length > 0 ? Number((tasks.reduce((sum, task) => sum + task.score, 0) / tasks.length).toFixed(1)) : 0,
    verdictCounts: tasks.reduce((counts, task) => {
      counts[task.verdict] = (counts[task.verdict] || 0) + 1;
      return counts;
    }, {}),
    tasks,
  };
  writeJsonFile(qualityPath(cwd), payload);
  return payload;
}

function buildMergeQueue(cwd, orchestrationState, runtimeState, conflictPayload = null, qualityPayload = null) {
  const conflicts = conflictPayload || readJsonIfExists(conflictsPath(cwd), { conflicts: [] });
  const quality = qualityPayload || readJsonIfExists(qualityPath(cwd), { tasks: [] });
  const prFeedback = loadPrFeedback(cwd);
  const queue = [];

  function modePriority(mode) {
    if (mode === 'owner') return 0;
    if (String(mode || '').includes('write')) return 1;
    if (mode === 'integration') return 2;
    return 3;
  }

  const sortedTasks = [...(orchestrationState.tasks || [])].sort((left, right) => (
    left.wave - right.wave || modePriority(left.mode) - modePriority(right.mode) || left.id.localeCompare(right.id)
  ));

  for (const task of sortedTasks) {
    const patchBundle = runtimeState.patchBundles?.[task.id];
    if (!patchBundle) {
      continue;
    }
    const taskConflicts = (conflicts.conflicts || []).filter((entry) => entry.taskId === task.id || (entry.taskIds || []).includes(task.id));
    const qualityEntry = (quality.tasks || []).find((entry) => entry.taskId === task.id) || null;
    const openFeedback = (prFeedback.taskLinks?.[task.id] || []).filter((commentId) => {
      const comment = (prFeedback.comments || []).find((entry) => String(entry.id) === String(commentId));
      return comment && comment.status !== 'resolved';
    });
    const previousItem = runtimeState.mergeQueue?.queue?.find((entry) => entry.taskId === task.id) || null;
    let status = previousItem?.status === 'applied' ? 'applied' : 'queued';
    if (patchBundle.placeholder) {
      status = previousItem?.status === 'applied' ? 'applied' : 'manual';
    }
    if (status !== 'applied') {
      if (taskConflicts.some((entry) => entry.severity === 'blocker')) {
        status = 'conflict';
      } else if (openFeedback.length > 0) {
        status = 'blocked_feedback';
      }
    }
    queue.push({
      taskId: task.id,
      wave: task.wave,
      role: task.role,
      mode: task.mode,
      patchFile: patchBundle.patchFile,
      changedFiles: patchBundle.changedFiles,
      placeholder: patchBundle.placeholder,
      quality: qualityEntry,
      conflictKinds: taskConflicts.map((entry) => entry.kind),
      openFeedbackIds: openFeedback,
      status,
      appliedAt: previousItem?.appliedAt || null,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    queue,
    counts: queue.reduce((counts, entry) => {
      counts[entry.status] = (counts[entry.status] || 0) + 1;
      return counts;
    }, {}),
    nextTaskId: queue.find((entry) => entry.status === 'queued')?.taskId || null,
  };
  writeJsonFile(mergeQueuePath(cwd), payload);
  return payload;
}

function applyMergeQueue(cwd, mergeQueue, options = {}) {
  const queue = Array.isArray(mergeQueue?.queue) ? [...mergeQueue.queue] : [];
  const applyAll = Boolean(options.applyAll);
  const maxCount = applyAll ? queue.length : 1;
  const applied = [];
  let attempted = 0;

  for (const item of queue) {
    if (attempted >= maxCount) {
      break;
    }
    if (item.status !== 'queued') {
      continue;
    }
    attempted += 1;
    const absolutePatch = path.join(cwd, item.patchFile);
    const result = run('git', ['apply', '--3way', '--whitespace=nowarn', absolutePatch], cwd);
    if (result.status === 0) {
      item.status = 'applied';
      item.appliedAt = new Date().toISOString();
      applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'applied' });
    } else {
      item.status = 'conflict';
      item.applyError = (result.stderr || result.stdout || 'git apply failed').trim();
      applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
    }
  }

  const payload = {
    ...mergeQueue,
    generatedAt: new Date().toISOString(),
    queue,
    counts: queue.reduce((counts, entry) => {
      counts[entry.status] = (counts[entry.status] || 0) + 1;
      return counts;
    }, {}),
    nextTaskId: queue.find((entry) => entry.status === 'queued')?.taskId || null,
    lastApply: {
      generatedAt: new Date().toISOString(),
      applyAll,
      attempted,
      applied,
    },
  };
  writeJsonFile(mergeQueuePath(cwd), payload);
  return payload;
}

async function buildReviewLoop(cwd, rootDir, runtimeState) {
  const bundleFiles = Object.values(runtimeState.patchBundles || {})
    .filter((entry) => entry && !entry.placeholder)
    .map((entry) => entry.patchFile)
    .filter(Boolean)
    .map((entry) => path.join(cwd, entry))
    .filter((entry) => fs.existsSync(entry));
  const combinedPatch = bundleFiles.map((filePath) => fs.readFileSync(filePath, 'utf8').trimEnd()).filter(Boolean).join('\n\n');
  fs.writeFileSync(combinedPatchPath(cwd), `${combinedPatch.trimEnd()}\n`);

  if (!combinedPatch.trim()) {
    const emptyPayload = {
      generatedAt: new Date().toISOString(),
      diffFile: relativePath(cwd, combinedPatchPath(cwd)),
      review: null,
      findingsCount: 0,
      verdict: 'noop',
    };
    writeJsonFile(reviewLoopPath(cwd), emptyPayload);
    fs.writeFileSync(reviewLoopMarkdownPath(cwd), '# REVIEW LOOP\n\n- `No collected patch bundle was available for review.`\n');
    return emptyPayload;
  }

  const review = await runReviewEngine(cwd, rootDir, {
    mode: 'pr-review',
    diffText: combinedPatch,
    recordHistory: false,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    diffFile: relativePath(cwd, combinedPatchPath(cwd)),
    review: {
      reportJson: review.artifacts?.findings || null,
      reportMarkdown: review.artifacts?.markdown || null,
      fileCount: review.files?.length || 0,
    },
    findingsCount: review.findings?.length || 0,
    blockerCount: review.blockers?.length || 0,
    verdict: (review.blockers?.length || 0) > 0 ? 'blocked' : 'ready',
  };
  writeJsonFile(reviewLoopPath(cwd), payload);

  const lines = [
    '# REVIEW LOOP',
    '',
    `- Combined diff: \`${payload.diffFile}\``,
    `- Verdict: \`${payload.verdict}\``,
    `- Findings: \`${payload.findingsCount}\``,
    `- Blockers: \`${payload.blockerCount}\``,
  ];
  if (payload.review?.reportMarkdown) {
    lines.push(`- Review markdown: \`${payload.review.reportMarkdown}\``);
  }
  fs.writeFileSync(reviewLoopMarkdownPath(cwd), `${lines.join('\n').trimEnd()}\n`);
  return payload;
}

function loadSupervisorState(cwd) {
  return readJsonIfExists(supervisorPath(cwd), {
    status: 'idle',
    pid: null,
    watch: false,
    cycleCount: 0,
    maxCycles: null,
    intervalMs: null,
    lastCycleAt: null,
    stopRequested: false,
    background: false,
    history: [],
  });
}

function writeSupervisorState(cwd, payload) {
  ensureDir(runtimeDir(cwd));
  fs.writeFileSync(supervisorPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

module.exports = {
  runtimeDir,
  patchDir,
  mergeQueuePath,
  conflictsPath,
  qualityPath,
  supervisorPath,
  prFeedbackPath,
  prFeedbackFollowupsPath,
  reviewLoopPath,
  reviewLoopMarkdownPath,
  combinedPatchPath,
  detectChangedFilesForWorkspace,
  createPatchBundle,
  buildConflictAnalysis,
  buildQualityReport,
  buildMergeQueue,
  applyMergeQueue,
  buildReviewLoop,
  importPrFeedback,
  loadPrFeedback,
  resolvePrFeedback,
  loadSupervisorState,
  writeSupervisorState,
};
