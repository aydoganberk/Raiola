const fs = require('node:fs');
const path = require('node:path');
const { listGitChangesCached, safeExecCached } = require('./perf/runtime_cache');
const { ensureDir, writeTextIfChanged } = require('./io/files');
const { readWorkflowIgnore, shouldIgnoreFile } = require('./fs_index');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function packageGraphPath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'package-graph.json');
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function listRepoFiles(cwd) {
  const workflowIgnore = readWorkflowIgnore(cwd);
  const git = safeExecCached('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd });
  if (git.ok && git.stdout) {
    return git.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !shouldIgnoreFile(cwd, filePath, workflowIgnore))
      .sort();
  }

  const result = safeExecCached('rg', [
    '--files',
    '--hidden',
    '-g', '!.git',
    '-g', '!.workflow',
    '-g', '!node_modules',
  ], { cwd });
  if (result.ok && result.stdout) {
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !shouldIgnoreFile(cwd, filePath, workflowIgnore))
      .sort();
  }

  const files = [];
  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (['.git', '.workflow', 'node_modules'].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        const filePath = relativePath(cwd, fullPath);
        if (!shouldIgnoreFile(cwd, filePath, workflowIgnore)) {
          files.push(filePath);
        }
      }
    }
  }
  visit(cwd);
  return files.sort();
}

function normalizeWorkspaceGlobs(pkg) {
  if (Array.isArray(pkg?.workspaces)) {
    return pkg.workspaces;
  }
  if (Array.isArray(pkg?.workspaces?.packages)) {
    return pkg.workspaces.packages;
  }
  return [];
}

function workspaceRoots(cwd, rootPkg) {
  const globs = normalizeWorkspaceGlobs(rootPkg);
  if (!globs.length) {
    return [];
  }

  const roots = [];
  for (const pattern of globs) {
    const normalized = String(pattern).replace(/\/\*+$/, '');
    const absolute = path.join(cwd, normalized);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const packageDir = path.join(absolute, entry.name);
      if (fs.existsSync(path.join(packageDir, 'package.json'))) {
        roots.push(packageDir);
      }
    }
  }
  return roots.sort();
}

function dependencyNames(pkg) {
  return Object.keys({
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
    ...(pkg?.peerDependencies || {}),
    ...(pkg?.optionalDependencies || {}),
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function ownerForFile(filePath, packages) {
  return packages
    .filter((item) => item.path === '.' || filePath === item.path || filePath.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

function expandImpactedPackages(changedPackageIds, packages, packageNameMap) {
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const dependentsById = new Map(packages.map((item) => [item.id, []]));
  for (const item of packages) {
    for (const dependencyName of item.internalDependencies) {
      const dependencyId = packageNameMap.get(dependencyName);
      if (!dependencyId) {
        continue;
      }
      dependentsById.get(dependencyId).push(item.id);
    }
  }

  const queue = [...changedPackageIds];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependentId of dependentsById.get(current) || []) {
      if (seen.has(dependentId) || !packageById.has(dependentId)) {
        continue;
      }
      seen.add(dependentId);
      queue.push(dependentId);
    }
  }
  return [...seen].sort();
}

function buildPackageGraph(cwd, options = {}) {
  const rootPkg = readJson(path.join(cwd, 'package.json'), {});
  const workspaceDirs = workspaceRoots(cwd, rootPkg);
  const packageDirs = [cwd, ...workspaceDirs];
  const packages = packageDirs.map((packageDir) => {
    const pkg = readJson(path.join(packageDir, 'package.json'), {}) || {};
    return {
      id: relativePath(cwd, packageDir) || '.',
      name: pkg.name || relativePath(cwd, packageDir) || 'root',
      path: relativePath(cwd, packageDir) || '.',
      private: Boolean(pkg.private),
      dependencies: dependencyNames(pkg),
      internalDependencies: [],
      dependents: [],
      fileCount: 0,
    };
  });

  const packageNameMap = new Map(packages.map((item) => [item.name, item.id]));
  for (const item of packages) {
    item.internalDependencies = item.dependencies.filter((name) => packageNameMap.has(name)).sort();
  }
  for (const item of packages) {
    for (const dependency of item.internalDependencies) {
      const target = packages.find((entry) => entry.name === dependency);
      if (target && !target.dependents.includes(item.name)) {
        target.dependents.push(item.name);
      }
    }
    item.dependents.sort();
  }

  const files = listRepoFiles(cwd);
  const ownership = {};
  for (const filePath of files) {
    const owner = ownerForFile(filePath, packages);
    if (!owner) {
      continue;
    }
    ownership[filePath] = owner.id;
    owner.fileCount += 1;
  }

  const changedFiles = uniqueSorted((options.changedFiles || listGitChangesCached(cwd))
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean)
    .filter((filePath) => !shouldIgnoreFile(cwd, filePath)));
  const changedPackages = uniqueSorted(changedFiles
    .map((filePath) => ownerForFile(filePath, packages)?.id)
    .filter(Boolean));
  const impactedPackages = expandImpactedPackages(changedPackages, packages, packageNameMap);

  const payload = {
    generatedAt: new Date().toISOString(),
    repoShape: workspaceDirs.length > 0 ? 'monorepo' : 'single-package',
    packageCount: packages.length,
    packages,
    ownership,
    changedFiles,
    changedPackages,
    impactedPackages,
  };

  if (options.writeFiles !== false) {
    ensureDir(path.dirname(packageGraphPath(cwd)));
    writeTextIfChanged(packageGraphPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
  }

  return {
    ...payload,
    graphPath: packageGraphPath(cwd),
  };
}

module.exports = {
  buildPackageGraph,
  packageGraphPath,
};
