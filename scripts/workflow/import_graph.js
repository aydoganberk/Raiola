const fs = require('node:fs');
const path = require('node:path');
const { ensureDir } = require('./io/files');
const { readJsonIfExists, writeJsonIfChanged } = require('./io/json');
const { listIndexedRepoFiles } = require('./fs_index');
const { detectRepoTruth } = require('./repo_truth');

const CODE_FILE_RE = /\.(cjs|mjs|js|jsx|ts|tsx|py|go|rs|java)$/i;
const TS_CONFIG_RE = /(^|\/)(tsconfig(?:\.[^.\/]+)?\.json)$/i;
const JS_IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'\";]+?\s+from\s+)?[\"']([^\"']+)[\"']|import\(\s*(?:\/\*[\s\S]*?\*\/\s*)*[\"']([^\"']+)[\"']\s*\)|require\(\s*[\"']([^\"']+)[\"']\s*\)/g;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java'];
const INDEX_BASENAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs', '__init__.py', 'mod.rs'];
const IMPORT_GRAPH_METHOD = 'regex-literal-import-scan';
const IMPORT_GRAPH_LIMITATIONS = Object.freeze([
  'Computed dynamic imports and computed requires are not resolved.',
  'Path aliases are only resolved when they map to workspace package names; tsconfig/compiler path aliases are not expanded.',
  'Barrel files and alias-heavy re-exports are tracked at file level only, not as symbol-to-symbol edges.',
  'The graph intentionally prefers fast literal matching over full AST parsing, so uncommon syntax can be missed.',
  'Python, Go, Rust, and Java imports are scanned with lightweight heuristics; cross-language aliasing and generated sources remain best-effort.',
]);

function importGraphPath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'import-graph.json');
}

function normalize(relativeFile) {
  return String(relativeFile || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isCodeFile(filePath) {
  return CODE_FILE_RE.test(filePath);
}

function isTsConfigFile(filePath) {
  return TS_CONFIG_RE.test(filePath);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function extensionOf(filePath) {
  return path.posix.extname(String(filePath || '').toLowerCase());
}

function parseJsImports(content) {
  const imports = [];
  for (const match of String(content || '').matchAll(JS_IMPORT_RE)) {
    const specifier = match[1] || match[2] || match[3] || '';
    if (specifier) {
      imports.push(specifier);
    }
  }
  return imports;
}

function parsePythonImports(content) {
  const imports = [];
  for (const match of String(content || '').matchAll(/^\s*from\s+([.a-zA-Z_][\w.]*)\s+import\s+/gm)) {
    imports.push(match[1]);
  }
  for (const match of String(content || '').matchAll(/^\s*import\s+([a-zA-Z_][\w.]*)/gm)) {
    imports.push(match[1]);
  }
  return imports;
}

function parseGoImports(content) {
  const imports = [];
  for (const match of String(content || '').matchAll(/^\s*import\s+"([^"]+)"/gm)) {
    imports.push(match[1]);
  }
  const blocks = [...String(content || '').matchAll(/import\s*\(([\s\S]*?)\)/gm)];
  for (const block of blocks) {
    for (const quoted of String(block[1] || '').matchAll(/"([^"]+)"/g)) {
      imports.push(quoted[1]);
    }
  }
  return imports;
}

function parseRustImports(content) {
  const imports = [];
  for (const match of String(content || '').matchAll(/^\s*use\s+([a-zA-Z_][\w:]*)/gm)) {
    imports.push(match[1]);
  }
  for (const match of String(content || '').matchAll(/^\s*mod\s+([a-zA-Z_][\w]*)\s*;/gm)) {
    imports.push(`./${match[1]}`);
  }
  return imports;
}

function parseJavaImports(content) {
  return [...String(content || '').matchAll(/^\s*import\s+([a-zA-Z_][\w.]*)\s*;/gm)].map((match) => match[1]);
}

function parseImports(filePathOrContent, maybeContent) {
  const filePath = maybeContent === undefined ? 'index.ts' : filePathOrContent;
  const content = maybeContent === undefined ? filePathOrContent : maybeContent;
  const extension = extensionOf(filePath);
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(extension)) {
    return uniqueSorted(parseJsImports(content));
  }
  if (extension === '.py') {
    return uniqueSorted(parsePythonImports(content));
  }
  if (extension === '.go') {
    return uniqueSorted(parseGoImports(content));
  }
  if (extension === '.rs') {
    return uniqueSorted(parseRustImports(content));
  }
  if (extension === '.java') {
    return uniqueSorted(parseJavaImports(content));
  }
  return [];
}

function stripTrailingSegments(specifier) {
  return String(specifier || '').replace(/[#?].*$/, '');
}

function candidateFileMatches(baseTarget, fileSet) {
  const candidates = new Set([baseTarget]);
  for (const extension of EXTENSIONS) {
    candidates.add(`${baseTarget}${extension}`);
  }
  for (const indexName of INDEX_BASENAMES) {
    candidates.add(`${baseTarget}/${indexName}`);
  }
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolvePythonRelativeImport(fromFile, specifier, fileSet) {
  const normalizedSpecifier = stripTrailingSegments(specifier);
  if (!normalizedSpecifier.startsWith('.')) {
    return null;
  }
  const dots = normalizedSpecifier.match(/^\.+/)?.[0].length || 0;
  const rest = normalizedSpecifier.slice(dots).replace(/\./g, '/');
  let baseDir = path.posix.dirname(normalize(fromFile));
  for (let index = 1; index < dots; index += 1) {
    baseDir = path.posix.dirname(baseDir);
  }
  const baseTarget = rest
    ? normalize(path.posix.join(baseDir, rest))
    : normalize(path.posix.join(baseDir, '__init__'));
  return candidateFileMatches(baseTarget, fileSet) || (rest ? candidateFileMatches(`${baseTarget}/__init__`, fileSet) : null);
}

function resolveRelativeImport(fromFile, specifier, fileSet) {
  const normalizedSpecifier = stripTrailingSegments(specifier);
  if (!normalizedSpecifier.startsWith('.')) {
    return null;
  }

  if (extensionOf(fromFile) === '.py') {
    return resolvePythonRelativeImport(fromFile, normalizedSpecifier, fileSet);
  }

  const baseDir = path.posix.dirname(normalize(fromFile));
  const baseTarget = normalize(path.posix.normalize(path.posix.join(baseDir, normalizedSpecifier)));
  return candidateFileMatches(baseTarget, fileSet);
}

function resolveModulePathImport(specifier, files, fileSet) {
  const normalizedSpecifier = stripTrailingSegments(specifier).replace(/^package:/, '');
  if (!normalizedSpecifier || normalizedSpecifier.startsWith('.')) {
    return null;
  }
  const normalizedTarget = normalizedSpecifier.replace(/::/g, '/').replace(/\./g, '/');
  const direct = candidateFileMatches(normalizedTarget, fileSet)
    || candidateFileMatches(`${normalizedTarget}/__init__`, fileSet)
    || candidateFileMatches(`${normalizedTarget}/mod`, fileSet);
  if (direct) {
    return direct;
  }
  const nested = files
    .filter((file) => file.startsWith(`${normalizedTarget}/`) && isCodeFile(file))
    .sort((left, right) => left.localeCompare(right));
  return nested[0] || null;
}

function parseTsConfigReferences(relativeFile, content, fileSet) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    return [];
  }

  const references = Array.isArray(payload?.references) ? payload.references : [];
  const currentDir = path.posix.dirname(normalize(relativeFile));
  const resolved = [];

  for (const reference of references) {
    const rawPath = String(reference?.path || '').trim();
    if (!rawPath) {
      continue;
    }

    const refPath = normalize(path.posix.join(currentDir, rawPath));
    const candidates = [
      `${refPath}/tsconfig.json`,
      `${refPath}.json`,
      refPath,
    ];
    const match = candidates.find((candidate) => fileSet.has(candidate));
    if (match) {
      resolved.push(match);
    }
  }

  return uniqueSorted(resolved);
}

function representativeEntryForRoot(root, files) {
  const normalizedRoot = normalize(root);
  const entryCandidates = [
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/index.jsx',
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    '__init__.py',
    'main.py',
    'main.go',
    'lib.rs',
    'mod.rs',
  ].map((entry) => normalize(path.posix.join(normalizedRoot, entry)));
  const direct = entryCandidates.find((entry) => files.includes(entry));
  if (direct) {
    return direct;
  }
  return files
    .filter((entry) => normalizedRoot === '.' ? isCodeFile(entry) : entry.startsWith(`${normalizedRoot}/`))
    .filter((entry) => isCodeFile(entry))
    .sort((left, right) => left.localeCompare(right))[0] || null;
}

function readPackageNameMap(cwd, files) {
  const map = new Map();

  for (const file of files) {
    if (!/(^|\/)package\.json$/.test(file)) {
      continue;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));
      const packageDir = path.posix.dirname(file);
      const entryCandidates = [
        pkg.source,
        pkg.module,
        pkg.main,
        pkg.types,
        'src/index.ts',
        'src/index.tsx',
        'index.ts',
        'index.js',
      ]
        .filter(Boolean)
        .map((entry) => normalize(path.posix.join(packageDir, String(entry))));
      let resolvedEntry = entryCandidates.find((entry) => files.includes(entry));
      if (!resolvedEntry) {
        resolvedEntry = representativeEntryForRoot(packageDir, files);
      }
      if (pkg.name && resolvedEntry) {
        map.set(pkg.name, resolvedEntry);
      }
    } catch {
      // Ignore malformed package metadata while keeping the graph build fast.
    }
  }

  const repoTruth = detectRepoTruth(cwd, { maxDepth: 6 });
  for (const workspace of repoTruth.workspaces || []) {
    if (!workspace.name || map.has(workspace.name)) {
      continue;
    }
    const entry = representativeEntryForRoot(workspace.root, files);
    if (entry) {
      map.set(workspace.name, entry);
    }
  }

  return map;
}

function resolveWorkspaceImport(specifier, packageNameMap) {
  const normalizedSpecifier = stripTrailingSegments(specifier);
  if (packageNameMap.has(normalizedSpecifier)) {
    return packageNameMap.get(normalizedSpecifier);
  }

  const candidates = [...packageNameMap.keys()].sort((left, right) => right.length - left.length);
  const matched = candidates.find((name) => (
    normalizedSpecifier === name || normalizedSpecifier.startsWith(`${name}/`)
  ));
  return matched ? packageNameMap.get(matched) : null;
}

function bfs(startNodes, reverseEdges) {
  const queue = [...startNodes];
  const seen = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependent of reverseEdges.get(current) || []) {
      if (seen.has(dependent)) {
        continue;
      }
      seen.add(dependent);
      queue.push(dependent);
    }
  }

  return [...seen].sort();
}

function graphAnalysisMetadata() {
  return {
    method: IMPORT_GRAPH_METHOD,
    resolution: 'relative-imports + workspace package names + tsconfig project references + lightweight polyglot path heuristics',
    limitations: [...IMPORT_GRAPH_LIMITATIONS],
  };
}

function buildImportGraph(cwd, options = {}) {
  const refreshMode = options.refreshMode || 'incremental';
  const repo = listIndexedRepoFiles(cwd, { refreshMode });
  const files = repo.files.map(normalize);
  const fileSet = new Set(files);
  const packageNameMap = readPackageNameMap(cwd, files);
  const previous = refreshMode === 'incremental'
    ? readJsonIfExists(importGraphPath(cwd), null)
    : null;
  const changedFiles = new Set((repo.changedFiles || []).map(normalize).filter(Boolean));
  const codeFiles = files.filter((file) => isCodeFile(file) || isTsConfigFile(file));
  const previousEntries = previous?.entries || {};
  const entries = {};

  for (const file of codeFiles) {
    if (previous && !changedFiles.has(file) && previousEntries[file]) {
      entries[file] = previousEntries[file];
      continue;
    }

    const absoluteFile = path.join(cwd, file);
    let content = '';
    try {
      content = fs.readFileSync(absoluteFile, 'utf8');
    } catch {
      entries[file] = { imports: [], references: [], externalImports: [] };
      continue;
    }

    const imports = parseImports(file, content);
    const resolvedImports = [];
    const externalImports = [];

    for (const specifier of imports) {
      const resolved = resolveRelativeImport(file, specifier, fileSet)
        || resolveWorkspaceImport(specifier, packageNameMap)
        || resolveModulePathImport(specifier, files, fileSet);
      if (resolved) {
        const values = Array.isArray(resolved) ? resolved : [resolved];
        resolvedImports.push(...values);
      } else if (!specifier.startsWith('.')) {
        externalImports.push(specifier);
      }
    }

    const references = isTsConfigFile(file)
      ? parseTsConfigReferences(file, content, fileSet)
      : [];

    entries[file] = {
      imports: uniqueSorted(resolvedImports),
      references,
      externalImports: uniqueSorted(externalImports),
    };
  }

  const edges = [];
  const reverseEdges = new Map();
  const forwardEdges = new Map();

  const addEdge = (from, to, kind) => {
    const normalizedFrom = normalize(from);
    const normalizedTo = normalize(to);
    edges.push({ from: normalizedFrom, to: normalizedTo, kind });

    if (!reverseEdges.has(normalizedTo)) {
      reverseEdges.set(normalizedTo, new Set());
    }
    reverseEdges.get(normalizedTo).add(normalizedFrom);

    if (!forwardEdges.has(normalizedFrom)) {
      forwardEdges.set(normalizedFrom, new Set());
    }
    forwardEdges.get(normalizedFrom).add(normalizedTo);
  };

  for (const [file, entry] of Object.entries(entries)) {
    for (const dependency of entry.imports || []) {
      addEdge(file, dependency, 'import');
    }
    for (const dependency of entry.references || []) {
      addEdge(file, dependency, 'ts-reference');
    }
  }

  const impactedFiles = bfs(
    [...changedFiles].filter((file) => reverseEdges.has(file) || forwardEdges.has(file)),
    reverseEdges,
  );
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    analysis: graphAnalysisMetadata(),
    entryCount: Object.keys(entries).length,
    edgeCount: edges.length,
    changedFiles: [...changedFiles].sort(),
    impactedFiles,
    entries,
    edges,
  };

  if (options.writeFiles !== false) {
    ensureDir(path.dirname(importGraphPath(cwd)));
    writeJsonIfChanged(importGraphPath(cwd), payload);
  }

  return {
    ...payload,
    reverseEdges: Object.fromEntries(
      [...reverseEdges.entries()].map(([key, value]) => [key, [...value].sort()]),
    ),
    forwardEdges: Object.fromEntries(
      [...forwardEdges.entries()].map(([key, value]) => [key, [...value].sort()]),
    ),
    graphPath: importGraphPath(cwd),
  };
}

module.exports = {
  buildImportGraph,
  importGraphPath,
  IMPORT_GRAPH_LIMITATIONS,
  IMPORT_GRAPH_METHOD,
  isCodeFile,
  parseImports,
  resolveRelativeImport,
};
