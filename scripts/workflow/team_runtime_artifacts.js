const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { readJsonIfExists } = require('./io/json');
const { safeArtifactToken } = require('./common_identity');
const { ensureDir } = require('./io/files');
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

function materializationDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'materialized');
}

function materializationManifestPath(cwd, taskId) {
  return path.join(
    materializationDir(cwd),
    `${safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' })}.manifest.json`,
  );
}

function materializationSnapshotDir(cwd, taskId) {
  return path.join(
    materializationDir(cwd),
    safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' }),
  );
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

function isGitRepository(cwd) {
  const result = run('git', ['rev-parse', '--is-inside-work-tree'], cwd);
  return result.status === 0 && String(result.stdout || '').trim() === 'true';
}

function gitHead(cwd) {
  const result = run('git', ['rev-parse', 'HEAD'], cwd);
  return result.status === 0 ? String(result.stdout || '').trim() : null;
}

function gitChangedFilesBetween(cwd, fromRef, toRef, files = []) {
  if (!fromRef || !toRef || fromRef === toRef) {
    return [];
  }
  const args = ['diff', '--name-only', fromRef, toRef];
  if (Array.isArray(files) && files.length > 0) {
    args.push('--', ...files);
  }
  const result = run('git', args, cwd);
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout || '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, '/'))
    .sort();
}

function isInternalWorkspacePath(relativeFile) {
  const normalized = String(relativeFile || '').replace(/\\/g, '/');
  return INTERNAL_WORKSPACE_FILES.has(normalized) || /^\.workflow-task-/.test(path.basename(normalized));
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
      if (isInternalWorkspacePath(relative)) {
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
  if (rawPath.includes(' -> ')) {
    const [sourcePath, targetPath] = rawPath.split(' -> ');
    return {
      status,
      sourcePath: sourcePath.replace(/\\/g, '/'),
      path: targetPath.replace(/\\/g, '/'),
    };
  }
  return {
    status,
    sourcePath: null,
    path: rawPath.replace(/\\/g, '/'),
  };
}

function listGitStatusEntries(rootPath) {
  const status = run('git', ['status', '--porcelain'], rootPath);
  if (status.status !== 0) {
    return [];
  }
  return String(status.stdout || '')
    .split('\n')
    .map(parseGitStatusLine)
    .filter(Boolean);
}

function flattenGitStatusPaths(entries = []) {
  const files = new Set();
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    if (entry.sourcePath && /^R/.test(entry.status)) {
      files.add(entry.sourcePath);
    }
    if (entry.path) {
      files.add(entry.path);
    }
  }
  return [...files]
    .filter(Boolean)
    .map((entry) => String(entry).replace(/\\/g, '/'))
    .filter((entry) => !isInternalWorkspacePath(entry))
    .sort();
}

function isInternalRuntimeArtifactPath(relativeFile) {
  const normalized = String(relativeFile || '').replace(/\\/g, '/');
  return normalized.startsWith('.workflow/');
}

function listExternalDirtyPaths(rootPath) {
  return flattenGitStatusPaths(listGitStatusEntries(rootPath))
    .filter((entry) => !isInternalRuntimeArtifactPath(entry));
}

function detectChangedFilesForWorkspace(cwd, workspace, task = null) {
  if (!workspace || !workspace.path || !fs.existsSync(workspace.path)) {
    return [];
  }

  if (workspace.mode === 'git-worktree') {
    return flattenGitStatusPaths(listGitStatusEntries(workspace.path));
  }

  const candidateFiles = new Set([
    ...(task?.writeScope || []),
    ...listWorkspaceFiles(workspace.path),
  ]);
  return [...candidateFiles]
    .filter(Boolean)
    .map((entry) => String(entry).replace(/\\/g, '/'))
    .filter((entry) => !isInternalWorkspacePath(entry))
    .filter((entry) => {
      const repoFile = path.join(cwd, entry);
      const workspaceFile = path.join(workspace.path, entry);
      const repoExists = fs.existsSync(repoFile);
      const workspaceExists = fs.existsSync(workspaceFile);
      if (repoExists != workspaceExists) {
        return true;
      }
      if (!repoExists && !workspaceExists) {
        return false;
      }
      return fs.readFileSync(repoFile, 'utf8') != fs.readFileSync(workspaceFile, 'utf8');
    })
    .sort();
}

function rewriteNoIndexDiff(output, relativeFile, mode) {
  let patchText = String(output || '');
  patchText = patchText.replace(/^diff --git a\/.* b\/.*$/m, `diff --git a/${relativeFile} b/${relativeFile}`);
  if (mode === 'added') {
    patchText = patchText.replace(/^--- \/dev\/null$/m, '--- /dev/null');
    patchText = patchText.replace(/^\+\+\+ b\/.*$/m, `+++ b/${relativeFile}`);
  } else if (mode === 'deleted') {
    patchText = patchText.replace(/^--- a\/.*$/m, `--- a/${relativeFile}`);
    patchText = patchText.replace(/^\+\+\+ \/dev\/null$/m, '+++ /dev/null');
  } else {
    patchText = patchText.replace(/^--- a\/.*$/m, `--- a/${relativeFile}`);
    patchText = patchText.replace(/^\+\+\+ b\/.*$/m, `+++ b/${relativeFile}`);
  }
  return patchText;
}

function buildNoIndexDiff(cwd, workspacePath, relativeFile) {
  const repoFile = path.join(cwd, relativeFile);
  const workspaceFile = path.join(workspacePath, relativeFile);
  const repoExists = fs.existsSync(repoFile);
  const workspaceExists = fs.existsSync(workspaceFile);

  if (!repoExists && !workspaceExists) {
    return '';
  }

  let diff;
  let mode = 'modified';
  if (!repoExists && workspaceExists) {
    diff = run('git', ['diff', '--no-index', '--', '/dev/null', workspaceFile], cwd);
    mode = 'added';
  } else if (repoExists && !workspaceExists) {
    diff = run('git', ['diff', '--no-index', '--', repoFile, '/dev/null'], cwd);
    mode = 'deleted';
  } else {
    diff = run('git', ['diff', '--no-index', '--', repoFile, workspaceFile], cwd);
  }

  const output = diff.stdout || diff.stderr || '';
  return rewriteNoIndexDiff(output, relativeFile, mode);
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copyFileWithMode(sourcePath, targetPath, permissions = null) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  if (typeof permissions === 'number') {
    fs.chmodSync(targetPath, permissions);
    return;
  }
  const stat = safeStat(sourcePath);
  if (stat) {
    fs.chmodSync(targetPath, stat.mode & 0o777);
  }
}

function materializeWorkspaceState(cwd, workspace, taskId, changedFiles = []) {
  ensureDir(materializationDir(cwd));
  const snapshotDir = materializationSnapshotDir(cwd, taskId);
  const manifestPath = materializationManifestPath(cwd, taskId);
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  ensureDir(snapshotDir);

  const entries = changedFiles.map((relativeFile) => {
    const normalizedFile = String(relativeFile || '').replace(/\\/g, '/');
    const workspaceFile = path.join(workspace.path, normalizedFile);
    const exists = fs.existsSync(workspaceFile);
    const entry = {
      path: normalizedFile,
      exists,
      sha256: null,
      size: 0,
      permissions: null,
      snapshotFile: null,
    };

    if (exists) {
      const snapshotPath = path.join(snapshotDir, normalizedFile);
      copyFileWithMode(workspaceFile, snapshotPath);
      const stat = safeStat(workspaceFile);
      entry.sha256 = hashFile(workspaceFile);
      entry.size = stat?.size || 0;
      entry.permissions = stat ? (stat.mode & 0o777) : null;
      entry.snapshotFile = relativePath(cwd, snapshotPath);
    }

    return entry;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    taskId,
    workspaceMode: workspace?.mode || 'unknown',
    baseCommit: workspace?.baseCommit || null,
    changedFiles: [...changedFiles],
    entryCount: entries.length,
    snapshotDir: relativePath(cwd, snapshotDir),
    entries,
  };
  writeJsonFile(manifestPath, manifest);
  return {
    manifestPath,
    snapshotDir,
    manifest,
  };
}

function loadMaterializationManifest(cwd, relativeFile) {
  if (!relativeFile) {
    return null;
  }
  return readJsonIfExists(path.join(cwd, relativeFile), null);
}

function syncPathsBetweenTrees(sourceRoot, targetRoot, changedFiles = []) {
  for (const relativeFile of changedFiles) {
    const normalizedFile = String(relativeFile || '').replace(/\\/g, '/');
    const sourcePath = path.join(sourceRoot, normalizedFile);
    const targetPath = path.join(targetRoot, normalizedFile);
    if (fs.existsSync(sourcePath)) {
      copyFileWithMode(sourcePath, targetPath);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function syncManifestToTarget(cwd, manifest, targetRoot) {
  for (const entry of manifest.entries || []) {
    const targetPath = path.join(targetRoot, entry.path);
    if (entry.exists && entry.snapshotFile) {
      const snapshotPath = path.join(cwd, entry.snapshotFile);
      copyFileWithMode(snapshotPath, targetPath, entry.permissions);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function verifyManifestAgainstTarget(cwd, manifest, targetRoot) {
  const mismatches = [];
  for (const entry of manifest.entries || []) {
    const targetPath = path.join(targetRoot, entry.path);
    const exists = fs.existsSync(targetPath);
    if (exists !== Boolean(entry.exists)) {
      mismatches.push({
        path: entry.path,
        expected: entry.exists ? 'present' : 'absent',
        actual: exists ? 'present' : 'absent',
      });
      continue;
    }
    if (!exists) {
      continue;
    }
    const digest = hashFile(targetPath);
    if (digest !== entry.sha256) {
      mismatches.push({
        path: entry.path,
        expected: entry.sha256,
        actual: digest,
      });
    }
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

function describeMismatches(mismatches = [], limit = 5) {
  return mismatches
    .slice(0, limit)
    .map((entry) => `${entry.path} (expected=${entry.expected || 'hash'} actual=${entry.actual || 'hash'})`)
    .join('; ');
}

function createTemporaryGitWorktree(cwd, prefix = 'raiola-runtime-') {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const worktreePath = path.join(parentDir, 'repo');
  const result = run('git', ['worktree', 'add', '--detach', worktreePath], cwd);
  if (result.status !== 0) {
    fs.rmSync(parentDir, { recursive: true, force: true });
    throw new Error(result.stderr || result.stdout || `git worktree add failed for ${worktreePath}`);
  }
  return {
    path: worktreePath,
    cleanup() {
      run('git', ['worktree', 'remove', '--force', worktreePath], cwd);
      fs.rmSync(parentDir, { recursive: true, force: true });
    },
  };
}

function renderPatchFromManifest(cwd, manifest) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  if (entries.length === 0) {
    return '';
  }

  if (!isGitRepository(cwd)) {
    const snapshotRoot = path.join(cwd, manifest.snapshotDir || '');
    return entries
      .map((entry) => buildNoIndexDiff(cwd, snapshotRoot, entry.path))
      .filter((chunk) => String(chunk || '').trim())
      .join('\n');
  }

  const tempWorktree = createTemporaryGitWorktree(cwd, 'raiola-patch-stage-');
  try {
    syncManifestToTarget(cwd, manifest, tempWorktree.path);
    const paths = entries.map((entry) => entry.path);
    const addResult = run('git', ['add', '-A', '--', ...paths], tempWorktree.path);
    if (addResult.status !== 0) {
      throw new Error(addResult.stderr || addResult.stdout || 'git add failed while materializing a patch bundle');
    }
    const diffResult = run('git', ['diff', '--cached', '--binary', '--find-renames', '--relative', '--', ...paths], tempWorktree.path);
        return diffResult.stdout || '';
  } finally {
    tempWorktree.cleanup();
  }
}

function renderPatchText(cwd, manifest, workspace) {
  if (isGitRepository(cwd)) {
    return renderPatchFromManifest(cwd, manifest);
  }
  const snapshotRoot = path.join(cwd, manifest.snapshotDir || workspace.path || '');
  return (manifest.entries || [])
    .map((entry) => buildNoIndexDiff(cwd, snapshotRoot, entry.path))
    .filter((chunk) => String(chunk || '').trim())
    .join('\n');
}

function createPatchBundle(cwd, workspace, task, options = {}) {
  ensureDir(patchDir(cwd));
  ensureDir(materializationDir(cwd));
  const taskId = typeof task === 'string' ? task : task?.id;
  const taskObject = typeof task === 'string' ? null : task;
  const changedFiles = options.changedFiles || detectChangedFilesForWorkspace(cwd, workspace, taskObject);
  const patchPath = path.join(
    patchDir(cwd),
    `${safeArtifactToken(taskId, { label: 'Task id', prefix: 'task' })}.patch`,
  );
  const materialized = materializeWorkspaceState(cwd, workspace, taskId, changedFiles);
  let patchText = '';
  let generationError = null;

  try {
    patchText = renderPatchText(cwd, materialized.manifest, workspace);
  } catch (error) {
    generationError = error instanceof Error ? error.message : String(error || 'unknown patch render failure');
  }

  if (!String(patchText || '').trim()) {
    patchText = [
      '# PATCH BUNDLE PLACEHOLDER',
      `# task=${taskId}`,
      `# mode=${workspace?.mode || 'unknown'}`,
      `# changed_files=${changedFiles.length}`,
      generationError ? `# generation_error=${generationError}` : null,
    ].filter(Boolean).join('\n');
  }

  fs.writeFileSync(patchPath, `${String(patchText).trimEnd()}\n`);
  return {
    taskId,
    changedFiles,
    patchPath,
    patchFile: relativePath(cwd, patchPath),
    patchSize: Buffer.byteLength(String(patchText || ''), 'utf8'),
    placeholder: /^# PATCH BUNDLE PLACEHOLDER/m.test(patchText),
    generationError,
    manifestFile: relativePath(cwd, materialized.manifestPath),
    materializedDir: relativePath(cwd, materialized.snapshotDir),
    entryCount: materialized.manifest.entryCount,
    baseCommit: materialized.manifest.baseCommit,
    patchStrategy: isGitRepository(cwd) ? 'validated-materialization-handoff' : 'no-index-materialization',
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
  const currentHead = isGitRepository(cwd) ? gitHead(cwd) : null;

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

    const previousItem = runtimeState.mergeQueue?.queue?.find((entry) => entry.taskId === task.id) || null;
    if (workspace.mode === 'git-worktree' && workspace.baseCommit && currentHead && previousItem?.status !== 'applied') {
      if (workspace.baseCommit !== currentHead) {
        const upstreamOverlap = gitChangedFilesBetween(cwd, workspace.baseCommit, currentHead, changedFiles);
        if (upstreamOverlap.length > 0) {
          conflicts.push({
            kind: 'upstream_overlap',
            severity: 'blocker',
            taskId: task.id,
            baseCommit: workspace.baseCommit,
            head: currentHead,
            files: upstreamOverlap,
            detail: 'Repository HEAD moved after the task worktree was created and upstream touched the same files.',
          });
        } else {
          conflicts.push({
            kind: 'stale_base',
            severity: 'warn',
            taskId: task.id,
            baseCommit: workspace.baseCommit,
            head: currentHead,
            files: changedFiles,
            detail: 'Repository HEAD moved after task dispatch. Raiola will validate this task against the current working tree before materializing it.',
          });
        }
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
    if (patchBundle.placeholder || patchBundle.generationError) {
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
      manifestFile: patchBundle.manifestFile || null,
      materializedDir: patchBundle.materializedDir || null,
      patchStrategy: patchBundle.patchStrategy || null,
      changedFiles: patchBundle.changedFiles,
      placeholder: patchBundle.placeholder,
      generationError: patchBundle.generationError || null,
      entryCount: patchBundle.entryCount || 0,
      baseCommit: patchBundle.baseCommit || null,
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
  const gitRepo = isGitRepository(cwd);
  const initialHead = gitRepo ? gitHead(cwd) : null;
  let blockedReason = null;

  for (const item of queue) {
    if (attempted >= maxCount) {
      break;
    }
    if (item.status !== 'queued') {
      continue;
    }
    attempted += 1;
    const manifest = loadMaterializationManifest(cwd, item.manifestFile);
    if (!manifest) {
      item.status = 'conflict';
      item.applyError = 'Materialization manifest is missing for this patch bundle.';
      applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
      continue;
    }

    if (gitRepo) {
      const dirtyPaths = listExternalDirtyPaths(cwd);
      const overlappingDirtyPaths = dirtyPaths.filter((entry) => (item.changedFiles || []).includes(entry));
      if (overlappingDirtyPaths.length > 0) {
        blockedReason = `Target repository has pending local changes that overlap queued paths: ${overlappingDirtyPaths.join(', ')}`;
        item.applyError = blockedReason;
        applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'blocked', error: item.applyError });
        continue;
      }
    }

    if (gitRepo && initialHead && manifest.baseCommit && manifest.baseCommit !== initialHead) {
      const upstreamOverlap = gitChangedFilesBetween(cwd, manifest.baseCommit, initialHead, item.changedFiles || []);
      if (upstreamOverlap.length > 0) {
        item.status = 'conflict';
        item.applyError = `Repository HEAD moved since task dispatch and upstream touched the same files: ${upstreamOverlap.join(', ')}`;
        applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
        continue;
      }
    }

    if (gitRepo) {
      const validation = createTemporaryGitWorktree(cwd, 'raiola-merge-validate-');
      try {
        const currentWorkingTreeDelta = listExternalDirtyPaths(cwd);
        if (currentWorkingTreeDelta.length > 0) {
          syncPathsBetweenTrees(cwd, validation.path, currentWorkingTreeDelta);
        }
        const absolutePatch = path.join(cwd, item.patchFile);
        const validationResult = run('git', ['apply', '--3way', '--whitespace=nowarn', absolutePatch], validation.path);
        if (validationResult.status !== 0) {
          item.status = 'conflict';
          item.applyError = (validationResult.stderr || validationResult.stdout || 'git apply failed during validation').trim();
          applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
          continue;
        }
        const verified = verifyManifestAgainstTarget(cwd, manifest, validation.path);
        if (!verified.ok) {
          item.status = 'conflict';
          item.applyError = `Patch validation succeeded but materialization diverged: ${describeMismatches(verified.mismatches)}`;
          applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
          continue;
        }
      } finally {
        validation.cleanup();
      }
    }

    syncManifestToTarget(cwd, manifest, cwd);
    const targetVerification = verifyManifestAgainstTarget(cwd, manifest, cwd);
    if (!targetVerification.ok) {
      item.status = 'conflict';
      item.applyError = `Validated handoff could not be materialized into the target repository: ${describeMismatches(targetVerification.mismatches)}`;
      applied.push({ taskId: item.taskId, patchFile: item.patchFile, status: 'conflict', error: item.applyError });
      continue;
    }

    item.status = 'applied';
    item.appliedAt = new Date().toISOString();
    applied.push({
      taskId: item.taskId,
      patchFile: item.patchFile,
      manifestFile: item.manifestFile || null,
      status: 'applied',
      strategy: item.patchStrategy || 'validated-materialization-handoff',
    });
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
      blockedReason,
      strategy: gitRepo ? 'validated-materialization-handoff' : 'materialization-copy',
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
