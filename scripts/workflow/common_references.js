const fs = require('node:fs');
const path = require('node:path');
const { toSemicolonList } = require('./common_args');
const runtimeCache = require('./perf/runtime_cache');

function parseReferenceList(value) {
  return toSemicolonList(String(value || '').replace(/`/g, ''));
}

function resolveReferencePath(cwd, normalizedPathPart, options = {}) {
  if (path.isAbsolute(normalizedPathPart)) {
    return normalizedPathPart;
  }

  const directPath = path.resolve(cwd, normalizedPathPart);
  if (fs.existsSync(directPath) || !options.rootDir) {
    return directPath;
  }

  const rootDir = path.resolve(cwd, options.rootDir);
  const rootRelative = path.relative(cwd, rootDir).replace(/\\/g, '/');
  const candidateSuffixes = [];

  if (normalizedPathPart === 'docs/workflow') {
    candidateSuffixes.push('');
  } else if (normalizedPathPart.startsWith('docs/workflow/')) {
    candidateSuffixes.push(normalizedPathPart.slice('docs/workflow/'.length));
  }

  if (rootRelative && normalizedPathPart === rootRelative) {
    candidateSuffixes.push('');
  } else if (rootRelative && normalizedPathPart.startsWith(`${rootRelative}/`)) {
    candidateSuffixes.push(normalizedPathPart.slice(rootRelative.length + 1));
  }

  for (const suffix of candidateSuffixes) {
    const candidatePath = path.resolve(rootDir, suffix);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return directPath;
}

function normalizeReference(cwd, rawRef, options = {}) {
  const cleaned = String(rawRef || '').trim().replace(/^`|`$/g, '');
  if (!cleaned) {
    return {
      raw: '',
      path: null,
      relativePath: '',
      pattern: '',
    };
  }

  const [pathPart, patternPart = ''] = cleaned.split('::');
  const normalizedPathPart = pathPart.split('#')[0].trim();
  const absolutePath = resolveReferencePath(cwd, normalizedPathPart, options);
  const relativePath = path.relative(cwd, absolutePath).replace(/\\/g, '/');

  return {
    raw: cleaned,
    path: absolutePath,
    relativePath,
    pattern: patternPart.trim(),
  };
}

function safeExec(command, args, options = {}) {
  return runtimeCache.safeExecCached(command, args, options);
}

function checkReference(cwd, rawRef, options = {}) {
  const normalized = normalizeReference(cwd, rawRef, options);
  if (!normalized.path) {
    return {
      raw: rawRef,
      relativePath: '',
      exists: false,
      patternFound: false,
      status: 'fail',
      message: 'Empty reference',
    };
  }

  const exists = fs.existsSync(normalized.path);
  if (!exists) {
    return {
      raw: rawRef,
      relativePath: normalized.relativePath,
      exists: false,
      patternFound: false,
      status: 'fail',
      message: 'Path missing',
    };
  }

  let patternFound = true;
  if (normalized.pattern) {
    const rgResult = safeExec('rg', ['-n', '--fixed-strings', normalized.pattern, normalized.path], { cwd });
    patternFound = rgResult.ok && Boolean(rgResult.stdout);
  }

  return {
    raw: rawRef,
    relativePath: normalized.relativePath,
    exists,
    patternFound,
    status: exists && patternFound ? 'pass' : 'fail',
    message: exists && patternFound ? 'Reference verified' : 'Pattern not found',
  };
}

module.exports = {
  checkReference,
  normalizeReference,
  parseReferenceList,
  resolveReferencePath,
  safeExec,
};
