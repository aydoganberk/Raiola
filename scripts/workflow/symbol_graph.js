const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readTextIfExists, writeTextIfChanged } = require('./io/files');
const { listIndexedRepoFiles } = require('./fs_index');

const CODE_FILE_PATTERN = /\.(cjs|mjs|js|jsx|ts|tsx)$/i;
const IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const STOPWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'return',
  'export',
  'default',
  'import',
  'from',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'await',
  'async',
  'true',
  'false',
  'null',
  'undefined',
  'try',
  'catch',
  'finally',
  'throw',
  'extends',
  'implements',
  'type',
  'interface',
]);

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function symbolGraphPath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'symbol-graph.json');
}

function readJson(filePath, fallback = null) {
  const content = readTextIfExists(filePath);
  if (!content) {
    return fallback;
  }
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function shouldParseFile(filePath) {
  return CODE_FILE_PATTERN.test(String(filePath || ''));
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function collectMatches(content, pattern, limit = 40) {
  const matches = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let result;
  while ((result = regex.exec(content)) && matches.length < limit) {
    if (result[1]) {
      matches.push(result[1]);
    }
  }
  return uniqueSorted(matches);
}

function extractIdentifiers(content) {
  const identifiers = [];
  for (const match of String(content || '').matchAll(IDENTIFIER_PATTERN)) {
    const value = match[0];
    if (value.length < 3 || STOPWORDS.has(value)) {
      continue;
    }
    identifiers.push(value);
  }
  return uniqueSorted(identifiers).slice(0, 250);
}

function extractImportedModules(content) {
  const modules = [
    ...collectMatches(content, /import[\s\S]*?from\s+['"]([^'"]+)['"]/g, 80),
    ...collectMatches(content, /require\(\s*['"]([^'"]+)['"]\s*\)/g, 80),
    ...collectMatches(content, /export[\s\S]*?from\s+['"]([^'"]+)['"]/g, 80),
  ];
  return uniqueSorted(modules);
}

function extractExportedSymbols(content) {
  return uniqueSorted([
    ...collectMatches(content, /export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /export\s+default\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /export\s+(?:type|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /export\s+(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
  ]);
}

function extractDefinedSymbols(content) {
  return uniqueSorted([
    ...extractExportedSymbols(content),
    ...collectMatches(content, /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /(?:^|\n)\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ...collectMatches(content, /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g),
  ]);
}

function extractRouteHandlers(content) {
  return uniqueSorted(collectMatches(content, /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g));
}

function extractComponents(content) {
  const exported = extractExportedSymbols(content).filter((name) => /^[A-Z]/.test(name));
  const declared = collectMatches(content, /(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g);
  return uniqueSorted([...exported, ...declared]);
}

function resolveLocalImport(cwd, fromFile, specifier) {
  if (!specifier || !specifier.startsWith('.')) {
    return null;
  }
  const baseDir = path.dirname(path.join(cwd, fromFile));
  const rawTarget = path.resolve(baseDir, specifier);
  const candidates = [
    rawTarget,
    `${rawTarget}.ts`,
    `${rawTarget}.tsx`,
    `${rawTarget}.js`,
    `${rawTarget}.jsx`,
    path.join(rawTarget, 'index.ts'),
    path.join(rawTarget, 'index.tsx'),
    path.join(rawTarget, 'index.js'),
    path.join(rawTarget, 'index.jsx'),
  ];
  const hit = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return hit ? relativePath(cwd, hit) : null;
}

function summarizeSignals(content) {
  return {
    authSignals: (String(content || '').match(/\b(auth|session|permission|authorize|authenticated|middleware)\b/gi) || []).length,
    errorSignals: (String(content || '').match(/\b(catch|throw|error|retry|failed|exception)\b/gi) || []).length,
    cacheSignals: (String(content || '').match(/\b(cache|memo|revalidate|invalidate|queryClient|redis|ttl)\b/gi) || []).length,
    testSignals: (String(content || '').match(/\b(describe|it|test|expect)\b/gi) || []).length,
  };
}

function buildEntry(cwd, filePath, entryMeta = null) {
  const absolutePath = path.join(cwd, filePath);
  const content = readTextIfExists(absolutePath) || '';
  const importedModules = extractImportedModules(content);
  const localImports = uniqueSorted(importedModules
    .map((specifier) => resolveLocalImport(cwd, filePath, specifier))
    .filter(Boolean));
  return {
    file: filePath,
    size: entryMeta?.size || fs.statSync(absolutePath).size,
    mtimeMs: entryMeta?.mtimeMs || Math.round(fs.statSync(absolutePath).mtimeMs),
    importedModules,
    localImports,
    definedSymbols: extractDefinedSymbols(content),
    exportedSymbols: extractExportedSymbols(content),
    routeHandlers: extractRouteHandlers(content),
    components: extractComponents(content),
    identifiers: extractIdentifiers(content),
    signals: summarizeSignals(content),
  };
}

function buildSymbolGraph(cwd, options = {}) {
  const refreshMode = String(options.refreshMode || 'incremental').trim().toLowerCase() === 'full'
    ? 'full'
    : 'incremental';
  const repo = listIndexedRepoFiles(cwd, { refreshMode });
  const previous = refreshMode === 'incremental' ? readJson(symbolGraphPath(cwd), null) : null;
  const changedFileSet = new Set(repo.changedFiles || []);
  const entries = {};
  const refreshedFiles = [];
  const parseableFiles = repo.files.filter((filePath) => shouldParseFile(filePath));

  for (const filePath of parseableFiles) {
    const meta = repo.entries?.[filePath] || null;
    const previousEntry = previous?.entries?.[filePath];
    if (
      previousEntry
      && !changedFileSet.has(filePath)
      && previousEntry.size === meta?.size
      && previousEntry.mtimeMs === meta?.mtimeMs
    ) {
      entries[filePath] = previousEntry;
      continue;
    }
    entries[filePath] = buildEntry(cwd, filePath, meta);
    refreshedFiles.push(filePath);
  }

  const definitions = Object.create(null);
  const references = Object.create(null);
  const importEdges = [];

  for (const [filePath, entry] of Object.entries(entries)) {
    for (const symbol of entry.exportedSymbols || []) {
      definitions[symbol] = definitions[symbol] || [];
      definitions[symbol].push(filePath);
    }
    for (const symbol of entry.identifiers || []) {
      references[symbol] = references[symbol] || [];
      references[symbol].push(filePath);
    }
    for (const targetFile of entry.localImports || []) {
      importEdges.push({
        from: filePath,
        to: targetFile,
        type: 'local-import',
      });
    }
  }

  for (const key of Object.keys(definitions)) {
    definitions[key] = uniqueSorted(definitions[key]);
  }
  for (const key of Object.keys(references)) {
    references[key] = uniqueSorted(references[key]);
  }

  const payload = {
    version: 1,
    generatedAt: previous?.generatedAt || new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    refreshMode,
    refreshStatus: !previous
      ? 'new'
      : refreshedFiles.length === 0
        ? 'current'
        : 'changed',
    fileCount: repo.fileCount,
    parsedFileCount: parseableFiles.length,
    symbolCount: Object.keys(definitions).length,
    importEdgeCount: importEdges.length,
    changedFiles: repo.changedFiles || [],
    refreshedFiles,
    entries,
    definitions,
    references,
    importEdges,
  };

  if (options.writeFiles !== false) {
    ensureDir(path.dirname(symbolGraphPath(cwd)));
    writeTextIfChanged(symbolGraphPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
  }

  return {
    ...payload,
    graphPath: symbolGraphPath(cwd),
  };
}

function findSymbolMatches(graph, symbol) {
  const normalized = String(symbol || '').trim();
  if (!normalized) {
    return {
      symbol: normalized,
      definitions: [],
      references: [],
      importers: [],
    };
  }
  const definitions = graph.definitions?.[normalized] || [];
  const references = graph.references?.[normalized] || [];
  const importers = (graph.importEdges || [])
    .filter((edge) => definitions.includes(edge.to))
    .map((edge) => edge.from);
  return {
    symbol: normalized,
    definitions,
    references,
    importers: uniqueSorted(importers),
  };
}

module.exports = {
  buildSymbolGraph,
  findSymbolMatches,
  shouldParseFile,
  symbolGraphPath,
};
