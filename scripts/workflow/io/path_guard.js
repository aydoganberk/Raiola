const fs = require('node:fs');
const path = require('node:path');

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeSafeRelativePath(value, options = {}) {
  const label = options.label || 'Path';
  const raw = String(value || '').trim();
  if (!raw) {
    if (options.allowEmpty) {
      return '';
    }
    throw new Error(`${label} is required`);
  }
  if (raw.includes('\0')) {
    throw new Error(`${label} contains an invalid null byte`);
  }
  const normalized = raw.replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalized) || path.isAbsolute(raw)) {
    throw new Error(`${label} must stay repo-relative`);
  }
  const collapsed = path.posix.normalize(normalized);
  if (!collapsed || collapsed === '.') {
    if (options.allowDot) {
      return collapsed || '.';
    }
    throw new Error(`${label} must resolve to a file path inside the repo`);
  }
  if (collapsed === '..' || collapsed.startsWith('../')) {
    throw new Error(`${label} escapes the repository boundary`);
  }
  return collapsed;
}

function repoRealPath(rootPath) {
  const resolvedRoot = path.resolve(String(rootPath || '.'));
  try {
    return fs.realpathSync(resolvedRoot);
  } catch {
    return resolvedRoot;
  }
}

function nearestExistingParent(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return current;
}

function resolveSafePath(rootPath, relativePath, options = {}) {
  const label = options.label || 'Path';
  const normalized = normalizeSafeRelativePath(relativePath, options);
  const rootReal = repoRealPath(rootPath);
  const absolutePath = path.resolve(rootReal, normalized);
  const anchorPath = nearestExistingParent(absolutePath) || rootReal;
  const anchorReal = repoRealPath(anchorPath);
  if (!isWithinRoot(rootReal, anchorReal)) {
    throw new Error(`${label} escapes the repository boundary`);
  }
  if (!isWithinRoot(rootReal, absolutePath)) {
    throw new Error(`${label} escapes the repository boundary`);
  }
  if (options.mustExist && !fs.existsSync(absolutePath)) {
    throw new Error(`${label} does not exist: ${normalized}`);
  }
  return {
    rootReal,
    relativePath: normalized,
    absolutePath,
  };
}

function resolveExistingPathWithinRoot(rootPath, candidatePath, options = {}) {
  const label = options.label || 'Path';
  const rootReal = repoRealPath(rootPath);
  const raw = String(candidatePath || '').trim();
  if (!raw) {
    throw new Error(`${label} is required`);
  }
  if (raw.includes('\0')) {
    throw new Error(`${label} contains an invalid null byte`);
  }
  const absolutePath = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(rootReal, raw);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} does not exist: ${raw}`);
  }
  const realPath = repoRealPath(absolutePath);
  if (!isWithinRoot(rootReal, realPath)) {
    throw new Error(`${label} escapes the repository boundary`);
  }
  return {
    rootReal,
    absolutePath,
    realPath,
    relativePath: path.relative(rootReal, realPath).replace(/\\/g, '/'),
  };
}

function hasRelativePrefix(relativePath, prefix) {
  const normalizedPath = normalizeSafeRelativePath(relativePath, { label: 'Path' });
  const normalizedPrefix = normalizeSafeRelativePath(prefix, { label: 'Prefix' });
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

module.exports = {
  hasRelativePrefix,
  isWithinRoot,
  normalizeSafeRelativePath,
  repoRealPath,
  resolveExistingPathWithinRoot,
  resolveSafePath,
};
