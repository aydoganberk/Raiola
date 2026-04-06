const fs = require('node:fs');
const path = require('node:path');
const { safeExecCached } = require('./perf/runtime_cache');
const { ensureDir, writeTextIfChanged } = require('./io/files');

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
  const result = safeExecCached('rg', [
    '--files',
    '--hidden',
    '-g', '!.git',
    '-g', '!.workflow',
    '-g', '!node_modules',
  ], { cwd });
  if (result.ok && result.stdout) {
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean).sort();
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
        files.push(relativePath(cwd, fullPath));
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
    const owner = packages
      .filter((item) => item.path === '.' || filePath === item.path || filePath.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0];
    if (!owner) {
      continue;
    }
    ownership[filePath] = owner.id;
    owner.fileCount += 1;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    repoShape: workspaceDirs.length > 0 ? 'monorepo' : 'single-package',
    packageCount: packages.length,
    packages,
    ownership,
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
