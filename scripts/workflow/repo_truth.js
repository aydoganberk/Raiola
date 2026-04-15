const fs = require('node:fs');
const path = require('node:path');
const { readTextIfExists } = require('./io/fs');
const { readJsonIfExists } = require('./io/json');

const WALK_IGNORES = new Set([
  '.git',
  '.workflow',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.yarn',
  '.pnpm-store',
]);

const MANIFEST_ECOSYSTEM = Object.freeze({
  'package.json': 'node',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
  'pyproject.toml': 'python',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  'project.json': 'nx',
  'BUILD': 'bazel',
  'BUILD.bazel': 'bazel',
});

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}


function workspacePatternToRegex(pattern) {
  const normalized = normalizePath(pattern).trim();
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
    if (char === '?') {
      regexSource += '[^/]';
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

function collectCandidateDirs(cwd, options = {}) {
  const maxDepth = Number(options.maxDepth || 6);
  const results = [];

  function visit(currentDir, depth) {
    if (depth > maxDepth) {
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    results.push(currentDir);
    for (const entry of entries) {
      if (!entry.isDirectory() || WALK_IGNORES.has(entry.name)) {
        continue;
      }
      visit(path.join(currentDir, entry.name), depth + 1);
    }
  }

  visit(cwd, 0);
  return results.sort((left, right) => left.localeCompare(right));
}

function collectManifestCandidates(cwd, options = {}) {
  const maxDepth = Number(options.maxDepth || 6);
  const manifests = [];

  function visit(currentDir, depth) {
    if (depth > maxDepth) {
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    for (const manifest of Object.keys(MANIFEST_ECOSYSTEM)) {
      if (fileNames.has(manifest)) {
        manifests.push({
          dir: currentDir,
          root: relativePath(cwd, currentDir) || '.',
          manifest,
          ecosystem: MANIFEST_ECOSYSTEM[manifest],
        });
      }
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || WALK_IGNORES.has(entry.name)) {
        continue;
      }
      visit(path.join(currentDir, entry.name), depth + 1);
    }
  }

  visit(cwd, 0);
  return manifests.sort((left, right) => left.root.localeCompare(right.root));
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
    if (match) {
      patterns.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  return uniqueSorted(patterns);
}

function readLernaWorkspaceGlobs(cwd) {
  const lerna = readJsonIfExists(path.join(cwd, 'lerna.json'), {});
  return Array.isArray(lerna?.packages) ? uniqueSorted(lerna.packages) : [];
}

function readRushProjects(cwd) {
  const rush = readJsonIfExists(path.join(cwd, 'rush.json'), null);
  if (!rush || !Array.isArray(rush.projects)) {
    return [];
  }
  return uniqueSorted(rush.projects.map((project) => normalizePath(project?.projectFolder)).filter(Boolean));
}

function parseTomlArray(block, key) {
  const match = String(block || '').match(new RegExp(`\\b${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  if (!match) {
    return [];
  }
  return uniqueSorted([...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]));
}

function readCargoWorkspaceMembers(cwd) {
  const content = readTextIfExists(path.join(cwd, 'Cargo.toml'));
  if (!content) {
    return [];
  }
  const workspaceBlock = content.match(/\[workspace\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/m)?.[1] || '';
  return parseTomlArray(workspaceBlock, 'members');
}

function readPyprojectWorkspaceMembers(cwd) {
  const content = readTextIfExists(path.join(cwd, 'pyproject.toml'));
  if (!content) {
    return [];
  }
  const blocks = [
    content.match(/\[tool\.uv\.workspace\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/m)?.[1] || '',
    content.match(/\[tool\.pdm\.workspace\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/m)?.[1] || '',
  ];
  return uniqueSorted(blocks.flatMap((block) => parseTomlArray(block, 'members')));
}

function readGoWorkUsePaths(cwd) {
  const content = readTextIfExists(path.join(cwd, 'go.work'));
  if (!content) {
    return [];
  }
  const paths = [];
  let inUseBlock = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.replace(/\/\/.*$/, '').trim();
    if (!trimmed) {
      continue;
    }
    if (/^use\s*\($/.test(trimmed)) {
      inUseBlock = true;
      continue;
    }
    if (inUseBlock && trimmed === ')') {
      inUseBlock = false;
      continue;
    }
    if (inUseBlock) {
      paths.push(trimmed.replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const match = trimmed.match(/^use\s+(.+)$/);
    if (match) {
      paths.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  return uniqueSorted(paths.map((item) => normalizePath(item)));
}

function readMavenModules(cwd) {
  const content = readTextIfExists(path.join(cwd, 'pom.xml'));
  if (!content) {
    return [];
  }
  return uniqueSorted([...content.matchAll(/<module>\s*([^<\s][^<]*)\s*<\/module>/g)].map((item) => normalizePath(item[1])));
}

function gradlePath(value) {
  const normalized = String(value || '').trim().replace(/^:/, '').replace(/:/g, '/');
  return normalizePath(normalized);
}

function readGradleIncludes(cwd) {
  const files = ['settings.gradle', 'settings.gradle.kts'];
  const includes = [];
  for (const fileName of files) {
    const content = readTextIfExists(path.join(cwd, fileName));
    if (!content) {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!/\binclude\b/.test(line)) {
        continue;
      }
      for (const match of line.matchAll(/["'](:[^"']+)["']/g)) {
        includes.push(gradlePath(match[1]));
      }
    }
  }
  return uniqueSorted(includes);
}

function readWorkspaceJsonProjects(cwd) {
  const workspaceJson = readJsonIfExists(path.join(cwd, 'workspace.json'), null)
    || readJsonIfExists(path.join(cwd, 'angular.json'), null);
  if (!workspaceJson || typeof workspaceJson !== 'object') {
    return [];
  }
  const projects = workspaceJson.projects || {};
  return uniqueSorted(Object.values(projects).map((entry) => (
    typeof entry === 'string'
      ? normalizePath(entry)
      : normalizePath(entry?.root)
  )).filter(Boolean));
}

function readProjectJsonDirs(cwd, manifestCandidates) {
  return uniqueSorted(manifestCandidates
    .filter((entry) => entry.manifest === 'project.json')
    .map((entry) => entry.root)
    .filter((root) => root !== '.'));
}

function detectBazelPackages(cwd, manifestCandidates) {
  const hasRootMarker = ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel']
    .some((fileName) => fs.existsSync(path.join(cwd, fileName)));
  if (!hasRootMarker) {
    return [];
  }
  return uniqueSorted(manifestCandidates
    .filter((entry) => entry.manifest === 'BUILD' || entry.manifest === 'BUILD.bazel')
    .map((entry) => entry.root)
    .filter((root) => root !== '.'));
}

function expandPatternsAgainstCandidates(patterns, candidates) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return [];
  }
  const regexes = patterns.map((pattern) => workspacePatternToRegex(pattern));
  return uniqueSorted(candidates
    .filter((entry) => regexes.some((regex) => regex.test(entry.root)))
    .map((entry) => entry.root)
    .filter((root) => root !== '.'));
}

function codeownersPath(cwd) {
  for (const relativeFile of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    const absoluteFile = path.join(cwd, relativeFile);
    if (fs.existsSync(absoluteFile)) {
      return absoluteFile;
    }
  }
  return null;
}

function codeownersPatternToRegex(pattern) {
  const raw = normalizePath(pattern).replace(/^!/, '');
  if (!raw) {
    return /^$/;
  }
  const anchored = raw.startsWith('/');
  const normalized = raw.replace(/^\//, '');
  let source = anchored ? '^' : '(^|.*/)';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if ('\\^$+?.()|{}[]'.includes(char)) {
      source += `\\${char}`;
      continue;
    }
    source += char;
  }
  if (normalized.endsWith('/')) {
    source += '.*';
  } else {
    source += '(?:$|/.*$)';
  }
  return new RegExp(source);
}

function parseCodeowners(cwd) {
  const filePath = codeownersPath(cwd);
  if (!filePath) {
    return {
      file: null,
      entries: [],
    };
  }
  const entries = [];
  for (const rawLine of readTextIfExists(filePath).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) {
      continue;
    }
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }
    const [pattern, ...owners] = parts;
    entries.push({
      pattern,
      owners,
      regex: codeownersPatternToRegex(pattern),
    });
  }
  return {
    file: relativePath(cwd, filePath),
    entries,
  };
}

function ownersForPath(targetPath, codeowners) {
  if (!codeowners?.entries?.length) {
    return [];
  }
  const normalizedTarget = normalizePath(targetPath);
  const matches = codeowners.entries.filter((entry) => entry.regex.test(normalizedTarget));
  if (matches.length === 0) {
    return [];
  }
  const best = matches.sort((left, right) => String(right.pattern).length - String(left.pattern).length)[0];
  return uniqueSorted(best.owners || []);
}

function manifestNameFromPackageJson(filePath) {
  const payload = readJsonIfExists(filePath, null);
  return payload?.name ? String(payload.name) : '';
}

function manifestNameFromProjectJson(filePath) {
  const payload = readJsonIfExists(filePath, null);
  return payload?.name ? String(payload.name) : '';
}

function manifestNameFromCargo(filePath) {
  const content = readTextIfExists(filePath);
  const block = content.match(/\[package\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/m)?.[1] || content;
  return block.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1] || '';
}

function manifestNameFromGoMod(filePath) {
  const content = readTextIfExists(filePath);
  return content.match(/^module\s+(\S+)/m)?.[1] || '';
}

function manifestNameFromPyproject(filePath) {
  const content = readTextIfExists(filePath);
  return content.match(/\[project\][\s\S]*?\bname\s*=\s*["']([^"']+)["']/m)?.[1]
    || content.match(/\[tool\.poetry\][\s\S]*?\bname\s*=\s*["']([^"']+)["']/m)?.[1]
    || '';
}

function manifestNameFromPom(filePath) {
  const content = readTextIfExists(filePath);
  return content.match(/<artifactId>\s*([^<\s][^<]*)\s*<\/artifactId>/)?.[1] || '';
}

function workspaceNameForManifest(cwd, root, manifest) {
  const filePath = path.join(cwd, root === '.' ? '' : root, manifest);
  let name = '';
  switch (manifest) {
    case 'package.json':
      name = manifestNameFromPackageJson(filePath);
      break;
    case 'project.json':
      name = manifestNameFromProjectJson(filePath);
      break;
    case 'Cargo.toml':
      name = manifestNameFromCargo(filePath);
      break;
    case 'go.mod':
      name = manifestNameFromGoMod(filePath);
      break;
    case 'pyproject.toml':
      name = manifestNameFromPyproject(filePath);
      break;
    case 'pom.xml':
      name = manifestNameFromPom(filePath);
      break;
    default:
      name = '';
  }
  if (name) {
    return name;
  }
  if (root === '.') {
    return 'root';
  }
  const base = path.posix.basename(root);
  return base || root;
}

function detectRepoTruth(cwd, options = {}) {
  const maxDepth = Number(options.maxDepth || 6);
  const manifestCandidates = collectManifestCandidates(cwd, { maxDepth });
  const candidateDirs = collectCandidateDirs(cwd, { maxDepth });
  const candidateEntries = candidateDirs.map((dir) => ({
    dir,
    root: relativePath(cwd, dir) || '.',
  }));
  const codeowners = parseCodeowners(cwd);
  const rootPkg = readJsonIfExists(path.join(cwd, 'package.json'), {});
  const workspaces = new Map();
  const sourceOrder = [];

  function addWorkspace(root, source, ecosystemHint = '', manifestHint = '', evidence = '') {
    const normalizedRoot = normalizePath(root || '.');
    if (!normalizedRoot || normalizedRoot === '.') {
      return;
    }
    const manifestCandidate = manifestCandidates.find((entry) => entry.root === normalizedRoot);
    const manifest = manifestHint || manifestCandidate?.manifest || '';
    const ecosystem = ecosystemHint || manifestCandidate?.ecosystem || MANIFEST_ECOSYSTEM[manifest] || 'generic';
    const key = normalizedRoot;
    if (!workspaces.has(key)) {
      workspaces.set(key, {
        root: key,
        name: workspaceNameForManifest(cwd, key, manifest || manifestCandidate?.manifest || 'package.json'),
        ecosystem,
        manifest: manifest || manifestCandidate?.manifest || null,
        sources: [],
        evidence: [],
        owners: ownersForPath(key, codeowners),
      });
    }
    const current = workspaces.get(key);
    current.ecosystem = current.ecosystem || ecosystem;
    current.manifest = current.manifest || manifest || manifestCandidate?.manifest || null;
    current.name = current.name || workspaceNameForManifest(cwd, key, current.manifest || manifest || manifestCandidate?.manifest || 'package.json');
    if (source && !current.sources.includes(source)) {
      current.sources.push(source);
    }
    if (evidence && !current.evidence.includes(evidence)) {
      current.evidence.push(evidence);
    }
    if (source && !sourceOrder.includes(source)) {
      sourceOrder.push(source);
    }
  }

  for (const pattern of normalizeWorkspaceGlobs(rootPkg)) {
    for (const root of expandPatternsAgainstCandidates([pattern], manifestCandidates)) {
      addWorkspace(root, 'package.json', 'node', 'package.json', pattern);
    }
  }

  for (const pattern of readPnpmWorkspaceGlobs(cwd)) {
    for (const root of expandPatternsAgainstCandidates([pattern], manifestCandidates)) {
      addWorkspace(root, 'pnpm-workspace.yaml', 'node', 'package.json', pattern);
    }
  }

  for (const pattern of readLernaWorkspaceGlobs(cwd)) {
    for (const root of expandPatternsAgainstCandidates([pattern], manifestCandidates)) {
      addWorkspace(root, 'lerna.json', 'node', 'package.json', pattern);
    }
  }

  for (const root of readRushProjects(cwd)) {
    addWorkspace(root, 'rush.json', 'node', 'package.json', root);
  }

  for (const pattern of readCargoWorkspaceMembers(cwd)) {
    for (const root of expandPatternsAgainstCandidates([pattern], manifestCandidates.filter((entry) => entry.manifest === 'Cargo.toml'))) {
      addWorkspace(root, 'Cargo.toml[workspace]', 'rust', 'Cargo.toml', pattern);
    }
  }

  for (const pattern of readPyprojectWorkspaceMembers(cwd)) {
    for (const root of expandPatternsAgainstCandidates([pattern], manifestCandidates.filter((entry) => entry.manifest === 'pyproject.toml'))) {
      addWorkspace(root, 'pyproject.toml[workspace]', 'python', 'pyproject.toml', pattern);
    }
  }

  for (const root of readGoWorkUsePaths(cwd)) {
    addWorkspace(root, 'go.work', 'go', 'go.mod', root);
  }

  for (const root of readMavenModules(cwd)) {
    addWorkspace(root, 'pom.xml', 'java', 'pom.xml', root);
  }

  for (const root of readGradleIncludes(cwd)) {
    addWorkspace(root, 'settings.gradle', 'java', 'build.gradle', root);
  }

  for (const root of readWorkspaceJsonProjects(cwd)) {
    addWorkspace(root, 'workspace.json', 'nx', 'project.json', root);
  }

  for (const root of readProjectJsonDirs(cwd, manifestCandidates)) {
    addWorkspace(root, 'project.json', 'nx', 'project.json', root);
  }

  for (const root of detectBazelPackages(cwd, manifestCandidates)) {
    addWorkspace(root, 'bazel', 'bazel', 'BUILD.bazel', root);
  }

  for (const entry of manifestCandidates) {
    if (entry.root === '.' || workspaces.has(entry.root)) {
      continue;
    }
    if (!['go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'BUILD', 'BUILD.bazel'].includes(entry.manifest)) {
      continue;
    }
    addWorkspace(entry.root, 'manifest-scan', entry.ecosystem, entry.manifest, entry.manifest);
  }

  if (workspaces.size === 0) {
    const fallbackManifests = manifestCandidates.filter((entry) => entry.root !== '.');
    for (const entry of fallbackManifests) {
      if (!['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'project.json'].includes(entry.manifest)) {
        continue;
      }
      addWorkspace(entry.root, 'manifest-scan', entry.ecosystem, entry.manifest, entry.manifest);
    }
  }

  const workspaceList = [...workspaces.values()]
    .map((entry) => ({
      ...entry,
      sources: uniqueSorted(entry.sources),
      evidence: uniqueSorted(entry.evidence),
      owners: uniqueSorted(entry.owners),
    }))
    .sort((left, right) => left.root.localeCompare(right.root));

  const ecosystems = uniqueSorted(workspaceList.map((entry) => entry.ecosystem));
  const markers = {
    turbo: fs.existsSync(path.join(cwd, 'turbo.json')),
    nx: fs.existsSync(path.join(cwd, 'nx.json')) || fs.existsSync(path.join(cwd, 'workspace.json')),
    rush: fs.existsSync(path.join(cwd, 'rush.json')),
    bazel: ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'].some((fileName) => fs.existsSync(path.join(cwd, fileName))),
    go: fs.existsSync(path.join(cwd, 'go.work')) || fs.existsSync(path.join(cwd, 'go.mod')),
    rust: fs.existsSync(path.join(cwd, 'Cargo.toml')),
    python: fs.existsSync(path.join(cwd, 'pyproject.toml')),
    java: fs.existsSync(path.join(cwd, 'pom.xml')) || fs.existsSync(path.join(cwd, 'settings.gradle')) || fs.existsSync(path.join(cwd, 'settings.gradle.kts')),
  };

  return {
    generatedAt: new Date().toISOString(),
    workspaces: workspaceList,
    directories: workspaceList.map((entry) => entry.root),
    sources: uniqueSorted(sourceOrder),
    ecosystems,
    markers,
    ownership: {
      source: codeowners.file,
      entryCount: codeowners.entries.length,
    },
  };
}

module.exports = {
  detectRepoTruth,
  ownersForPath,
  parseCodeowners,
  relativePath,
  workspacePatternToRegex,
};
