const fs = require('node:fs');
const path = require('node:path');

const { ensureDir } = require('./files');
const { normalizeSafeRelativePath, resolveSafePath } = require('./path_guard');

function normalizeInventory(inventory = []) {
  return new Set(
    (inventory || [])
      .filter(Boolean)
      .map((entry) => normalizeSafeRelativePath(entry, { label: 'Managed inventory path' })),
  );
}

function blockedEntry(relativePath, reason) {
  return {
    path: relativePath == null ? null : String(relativePath),
    reason: String(reason || 'blocked'),
  };
}

function resolveManagedPath(rootPath, relativeTarget, options = {}) {
  const label = options.label || 'Managed path';
  const inventory = normalizeInventory(options.inventory || []);
  let normalized = null;
  try {
    normalized = normalizeSafeRelativePath(relativeTarget, { label });
    if (inventory.size > 0 && !inventory.has(normalized)) {
      return {
        safe: false,
        blocked: [blockedEntry(normalized, 'path is not part of the trusted managed inventory')],
      };
    }
    const resolved = resolveSafePath(rootPath, normalized, {
      label,
      mustExist: Boolean(options.mustExist),
    });
    return {
      safe: true,
      blocked: [],
      relativePath: resolved.relativePath,
      absolutePath: resolved.absolutePath,
    };
  } catch (error) {
    return {
      safe: false,
      blocked: [blockedEntry(normalized || relativeTarget, error.message)],
    };
  }
}

function sanitizeManagedPathList(rawPaths, inventory, options = {}) {
  const safe = [];
  const blocked = [];
  for (const rawPath of rawPaths || []) {
    const resolved = resolveManagedPath(options.rootPath, rawPath, {
      ...options,
      inventory,
    });
    if (resolved.safe) {
      safe.push(resolved.relativePath);
    } else {
      blocked.push(...resolved.blocked);
    }
  }
  return {
    safe: [...new Set(safe)].sort(),
    blocked,
  };
}

function preflightManagedPaths(rootPath, relativePaths, options = {}) {
  const result = sanitizeManagedPathList(relativePaths, options.inventory || [], {
    ...options,
    rootPath,
  });
  return {
    ok: result.blocked.length === 0,
    safe: result.safe,
    blocked: result.blocked,
  };
}

function copyManagedFile(rootPath, sourcePath, relativeTarget, options = {}) {
  const resolution = resolveManagedPath(rootPath, relativeTarget, options);
  if (!resolution.safe) {
    return {
      ok: false,
      blocked: resolution.blocked,
      status: 'blocked',
    };
  }
  if (!fs.existsSync(sourcePath)) {
    return {
      ok: false,
      blocked: [blockedEntry(relativeTarget, `Managed source file is missing: ${sourcePath}`)],
      status: 'blocked',
    };
  }
  const exists = fs.existsSync(resolution.absolutePath);
  if (exists && !options.overwrite) {
    return {
      ok: true,
      blocked: [],
      status: 'skipped',
      relativePath: resolution.relativePath,
      absolutePath: resolution.absolutePath,
    };
  }
  ensureDir(path.dirname(resolution.absolutePath));
  fs.copyFileSync(sourcePath, resolution.absolutePath);
  return {
    ok: true,
    blocked: [],
    status: exists ? 'updated' : 'created',
    relativePath: resolution.relativePath,
    absolutePath: resolution.absolutePath,
  };
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function copyManagedTree(rootPath, sourceDir, relativeTargetDir, options = {}) {
  const files = walkFiles(sourceDir);
  const relativeTargets = files.map((sourcePath) => path.posix.join(
    normalizeSafeRelativePath(relativeTargetDir, { label: options.label || 'Managed directory' }),
    path.relative(sourceDir, sourcePath).replace(/\\/g, '/'),
  ));
  const preflight = preflightManagedPaths(rootPath, relativeTargets, options);
  if (!preflight.ok) {
    return {
      ok: false,
      blocked: preflight.blocked,
      results: [],
    };
  }
  const results = [];
  for (const sourcePath of files) {
    const relativeTarget = path.posix.join(
      normalizeSafeRelativePath(relativeTargetDir, { label: options.label || 'Managed directory' }),
      path.relative(sourceDir, sourcePath).replace(/\\/g, '/'),
    );
    results.push(copyManagedFile(rootPath, sourcePath, relativeTarget, options));
  }
  return {
    ok: true,
    blocked: [],
    results,
  };
}

function removeManagedPath(rootPath, relativeTarget, options = {}) {
  const resolution = resolveManagedPath(rootPath, relativeTarget, options);
  if (!resolution.safe) {
    return {
      ok: false,
      blocked: resolution.blocked,
      status: 'blocked',
    };
  }
  if (!fs.existsSync(resolution.absolutePath)) {
    return {
      ok: true,
      blocked: [],
      status: 'skipped',
      relativePath: resolution.relativePath,
      absolutePath: resolution.absolutePath,
    };
  }
  fs.rmSync(resolution.absolutePath, { recursive: true, force: true });
  return {
    ok: true,
    blocked: [],
    status: 'removed',
    relativePath: resolution.relativePath,
    absolutePath: resolution.absolutePath,
  };
}

function cleanupEmptyManagedParents(rootPath, relativeTarget) {
  const resolved = resolveManagedPath(rootPath, relativeTarget, {
    label: 'Managed cleanup path',
  });
  if (!resolved.safe) {
    return;
  }
  const rootReal = path.resolve(rootPath);
  let current = path.dirname(resolved.absolutePath);
  while (current.startsWith(rootReal) && current !== rootReal) {
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      current = path.dirname(current);
      continue;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      break;
    }
    if (fs.readdirSync(current).length > 0) {
      break;
    }
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function writeManagedText(rootPath, relativeTarget, content, options = {}) {
  const resolution = resolveManagedPath(rootPath, relativeTarget, options);
  if (!resolution.safe) {
    return {
      ok: false,
      blocked: resolution.blocked,
      status: 'blocked',
    };
  }
  ensureDir(path.dirname(resolution.absolutePath));
  fs.writeFileSync(resolution.absolutePath, String(content));
  return {
    ok: true,
    blocked: [],
    status: 'written',
    relativePath: resolution.relativePath,
    absolutePath: resolution.absolutePath,
  };
}

module.exports = {
  cleanupEmptyManagedParents,
  copyManagedFile,
  copyManagedTree,
  preflightManagedPaths,
  removeManagedPath,
  resolveManagedPath,
  sanitizeManagedPathList,
  writeManagedText,
};
