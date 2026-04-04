const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readTextIfExists, writeText } = require('./io/files');
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
      files.push(relativePath(cwd, fullPath));
    }
  }
  return files;
}

function listRepoFilesRaw(cwd) {
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
    return rg.stdout.split('\n').map((line) => line.trim()).filter(Boolean).sort();
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
    generatedAt: new Date().toISOString(),
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

  ensureDir(path.dirname(indexPath(cwd)));
  writeText(indexPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ...payload,
    files,
    indexPath: indexPath(cwd),
  };
}

module.exports = {
  indexPath,
  listIndexedRepoFiles,
};
