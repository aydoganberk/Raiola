const fs = require('node:fs');
const path = require('node:path');
const { listGitChangesCached, safeExecCached } = require('./perf/runtime_cache');
const { ensureDir, writeTextIfChanged } = require('./io/files');
const { readWorkflowIgnore, shouldIgnoreFile } = require('./fs_index');

const WALK_IGNORES = new Set([
  '.git',
  '.workflow',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

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
      if (WALK_IGNORES.has(entry.name)) {
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

function readPnpmWorkspaceGlobs(cwd) {
  const filePath = path.join(cwd, 'pnpm-workspace.yaml');
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const patterns = [];
  let inPackages = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (/^packages\s*:\s*$/.test(trimmed)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^[A-Za-z0-9_-]+\s*:/.test(trimmed) && !trimmed.startsWith('-')) {
      break;
    }
    if (!inPackages) {
      continue;
    }
    const match = trimmed.match(/^[-]\s*(.+)$/);
    if (!match) {
      continue;
    }
    patterns.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return patterns;
}

function readLernaWorkspaceGlobs(cwd) {
  const lerna = readJson(path.join(cwd, 'lerna.json'), {});
  if (Array.isArray(lerna?.packages)) {
    return lerna.packages;
  }
  return [];
}

function workspacePatternToRegex(pattern) {
  const normalized = String(pattern || '').replace(/^\.\//, '').replace(/\\/g, '/').trim();
  let regexSource = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      regexSource += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      regexSource += '[^/]+';
      continue;
    }
    if ('\\^$+?.()|{}[]'.includes(char)) {
      regexSource += `\\${char}`;
      continue;
    }
    regexSource += char;
  }
  regexSource += '$';
  return new RegExp(regexSource);
}

function collectCandidatePackageDirs(cwd, options = {}) {
  const maxDepth = Number(options.maxDepth || 6);
  const candidates = [];

  function visit(currentDir, depth) {
    if (depth > maxDepth) {
      return;
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const hasPackageJson = entries.some((entry) => entry.isFile() && entry.name === 'package.json');
    if (hasPackageJson && currentDir !== cwd) {
      candidates.push(currentDir);
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || WALK_IGNORES.has(entry.name)) {
        continue;
      }
      visit(path.join(currentDir, entry.name), depth + 1);
    }
  }

  visit(cwd, 0);
  return candidates.sort((left, right) => left.localeCompare(right));
}

function detectWorkspaceSources(cwd, rootPkg) {
  const sources = [];
  const patterns = [];

  const packageJsonPatterns = normalizeWorkspaceGlobs(rootPkg);
  if (packageJsonPatterns.length > 0) {
    sources.push('package.json');
    patterns.push(...packageJsonPatterns);
  }

  const pnpmPatterns = readPnpmWorkspaceGlobs(cwd);
  if (pnpmPatterns.length > 0) {
    sources.push('pnpm-workspace.yaml');
    patterns.push(...pnpmPatterns);
  }

  const lernaPatterns = readLernaWorkspaceGlobs(cwd);
  if (lernaPatterns.length > 0) {
    sources.push('lerna.json');
    patterns.push(...lernaPatterns);
  }

  return {
    patterns: [...new Set(patterns.map((item) => String(item).trim()).filter(Boolean))],
    sources,
  };
}

function workspaceRoots(cwd, rootPkg) {
  const workspaceInfo = detectWorkspaceSources(cwd, rootPkg);
  if (!workspaceInfo.patterns.length) {
    return workspaceInfo;
  }

  const candidates = collectCandidatePackageDirs(cwd, { maxDepth: 6 });
  const regexes = workspaceInfo.patterns.map((pattern) => ({
    pattern,
    regex: workspacePatternToRegex(pattern),
  }));

  const directories = candidates
    .filter((dir) => {
      const relativeDir = relativePath(cwd, dir);
      return regexes.some(({ regex }) => regex.test(relativeDir));
    })
    .sort((left, right) => left.localeCompare(right));

  return {
    ...workspaceInfo,
    directories,
  };
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

function isTestFile(filePath) {
  const normalized = String(filePath || '');
  if (/(^|\/)(fixtures|corpus)\//.test(normalized)) {
    return false;
  }
  return /\.(test|spec)\.[^.]+$/.test(normalized)
    || /(^|\/)(__tests__|test)\//.test(normalized);
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
  const workspaceInfo = workspaceRoots(cwd, rootPkg);
  const workspaceDirs = workspaceInfo.directories || [];
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
  const testOwnership = {};
  for (const filePath of files) {
    const owner = ownerForFile(filePath, packages);
    if (!owner) {
      continue;
    }
    ownership[filePath] = owner.id;
    owner.fileCount += 1;
    if (isTestFile(filePath)) {
      testOwnership[filePath] = owner.id;
    }
  }

  const changedFiles = uniqueSorted((options.changedFiles || listGitChangesCached(cwd))
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean)
    .filter((filePath) => !shouldIgnoreFile(cwd, filePath)));
  const changedPackages = uniqueSorted(changedFiles
    .map((filePath) => ownerForFile(filePath, packages)?.id)
    .filter(Boolean));
  const impactedPackages = expandImpactedPackages(changedPackages, packages, packageNameMap);
  const testsByPackage = packages.reduce((accumulator, pkg) => {
    accumulator[pkg.id] = [];
    return accumulator;
  }, {});
  testsByPackage['.'] = testsByPackage['.'] || [];
  for (const [filePath, packageId] of Object.entries(testOwnership)) {
    if (!testsByPackage[packageId]) {
      testsByPackage[packageId] = [];
    }
    testsByPackage[packageId].push(filePath);
  }
  for (const packageId of Object.keys(testsByPackage)) {
    testsByPackage[packageId] = testsByPackage[packageId].sort();
  }
  const impactedTests = uniqueSorted(Object.entries(testOwnership)
    .filter(([, packageId]) => (
      packageId === '.'
        ? changedPackages.length > 0
        : impactedPackages.includes(packageId)
    ))
    .map(([filePath]) => filePath));
  const edges = packages.flatMap((pkg) => pkg.internalDependencies.map((dependencyName) => ({
    from: pkg.id,
    to: packageNameMap.get(dependencyName),
    type: 'internal',
  }))).filter((edge) => edge.to);

  const payload = {
    generatedAt: new Date().toISOString(),
    repoShape: workspaceDirs.length > 0 ? 'monorepo' : 'single-package',
    packageCount: packages.length,
    packages,
    edges,
    ownership,
    testOwnership,
    testsByPackage,
    changedFiles,
    changedPackages,
    impactedPackages,
    impactedTests,
    workspaceDiscovery: {
      patterns: workspaceInfo.patterns || [],
      directories: workspaceDirs.map((dir) => relativePath(cwd, dir)),
      sources: workspaceInfo.sources || [],
    },
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
