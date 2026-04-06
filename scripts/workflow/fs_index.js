const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readTextIfExists, writeTextIfChanged } = require('./io/files');
const { safeExecCached } = require('./perf/runtime_cache');

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.workflow',
  'dist',
  'build',
  'coverage',
]);

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function indexPath(cwd) {
  return path.join(cwd, '.workflow', 'fs-index.json');
}

function workflowIgnorePath(cwd) {
  return path.join(cwd, '.workflowignore');
}

function readWorkflowIgnore(cwd) {
  const content = readTextIfExists(workflowIgnorePath(cwd)) || '';
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function ignoreMatcher(pattern) {
  const normalized = String(pattern || '').replace(/^\.?\//, '').replace(/\/+$/, '');
  if (!normalized) {
    return () => false;
  }
  if (!normalized.includes('*')) {
    return (filePath) => filePath === normalized || filePath.startsWith(`${normalized}/`);
  }
  const regex = new RegExp(`^${normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')}$`);
  return (filePath) => regex.test(filePath);
}

function shouldIgnoreFile(cwd, filePath, patterns = null) {
  const relativeFile = String(filePath || '').replace(/^\.?\//, '');
  const segments = relativeFile.split('/');
  if (segments.some((segment) => IGNORED_DIRS.has(segment))) {
    return true;
  }
  const rules = patterns || readWorkflowIgnore(cwd);
  return rules.some((pattern) => ignoreMatcher(pattern)(relativeFile));
}

function walkFiles(cwd, currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(cwd, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      const filePath = relativePath(cwd, fullPath);
      if (!shouldIgnoreFile(cwd, filePath)) {
        files.push(filePath);
      }
    }
  }
  return files;
}

function listRepoFilesRaw(cwd) {
  const workflowIgnore = readWorkflowIgnore(cwd);
  const rg = safeExecCached('rg', [
    '--files',
    '--hidden',
    '-g', '!.git',
    '-g', '!node_modules',
    '-g', '!.next',
    '-g', '!.turbo',
    '-g', '!.workflow',
    '-g', '!dist',
    '-g', '!build',
    '-g', '!coverage',
  ], { cwd });

  if (rg.ok && rg.stdout) {
    return rg.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !shouldIgnoreFile(cwd, filePath, workflowIgnore))
      .sort();
  }

  return walkFiles(cwd, cwd).sort();
}

function readIndex(cwd) {
  const content = readTextIfExists(indexPath(cwd));
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function buildEntries(cwd, files) {
  return Object.fromEntries(files.map((filePath) => {
    const absolutePath = path.join(cwd, filePath);
    const stat = fs.statSync(absolutePath);
    return [filePath, {
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    }];
  }));
}

function listIndexedRepoFiles(cwd, options = {}) {
  const refreshMode = String(options.refreshMode || 'incremental').trim().toLowerCase() === 'full'
    ? 'full'
    : 'incremental';
  const files = listRepoFilesRaw(cwd);
  const entries = buildEntries(cwd, files);
  const previous = refreshMode === 'incremental' ? readIndex(cwd) : null;
  const changedFiles = [];

  if (previous?.entries) {
    for (const filePath of files) {
      const previousEntry = previous.entries[filePath];
      const nextEntry = entries[filePath];
      if (!previousEntry || previousEntry.size !== nextEntry.size || previousEntry.mtimeMs !== nextEntry.mtimeMs) {
        changedFiles.push(filePath);
      }
    }
    for (const filePath of Object.keys(previous.entries)) {
      if (!entries[filePath]) {
        changedFiles.push(filePath);
      }
    }
  } else {
    changedFiles.push(...files);
  }

  const payload = {
    version: 1,
    generatedAt: previous?.generatedAt || new Date().toISOString(),
    refreshMode,
    refreshStatus: !previous
      ? 'new'
      : changedFiles.length === 0
        ? 'current'
        : 'changed',
    fileCount: files.length,
    changedFiles,
    entries,
  };

  if (previous) {
    const stablePrevious = {
      ...previous,
      generatedAt: payload.generatedAt,
      refreshMode,
      refreshStatus: payload.refreshStatus,
    };
    if (JSON.stringify(stablePrevious.entries || {}) === JSON.stringify(payload.entries)
      && JSON.stringify(stablePrevious.changedFiles || []) === JSON.stringify(payload.changedFiles)
      && stablePrevious.fileCount === payload.fileCount
      && stablePrevious.refreshStatus === payload.refreshStatus) {
      return {
        ...previous,
        refreshMode,
        refreshStatus: payload.refreshStatus,
        files,
        indexPath: indexPath(cwd),
      };
    }
  }

  ensureDir(path.dirname(indexPath(cwd)));
  writeTextIfChanged(indexPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ...payload,
    files,
    indexPath: indexPath(cwd),
  };
}

module.exports = {
  indexPath,
  listIndexedRepoFiles,
  readWorkflowIgnore,
  workflowIgnorePath,
};
