const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const { listIndexedRepoFiles } = require('./fs_index');
const { buildPackageGraph } = require('./package_graph');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const { runApiSurfaceRuntimeEvidence } = require('./api_surface_runtime');
const { contractPayload } = require('./contract_versions');

const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const ROUTE_DIR_PATTERN = /(^|\/)(api|routes?)\//i;
const API_PATH_SEGMENT_PATTERN = /(^|\/)(api|routes?|controllers?|handlers?)\//i;
const API_FILE_PATTERN = /(^|\/)(server|middleware|router|routes?|route|controllers?|handlers?|endpoint)\.[^.]+$/i;
const IGNORE_DIRS = new Set(['.git', '.workflow', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo']);
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ALL'];
const HTTP_METHOD_SET = new Set(HTTP_METHODS.map((entry) => entry.toLowerCase()));
const CALL_METHOD_SET = new Set([...HTTP_METHODS.map((entry) => entry.toLowerCase()), 'use', 'route', 'register']);

function printHelp() {
  console.log(`
api_surface

Usage:
  node scripts/workflow/api_surface.js

Options:
  --repo <path>                  Inspect a local repo snapshot without changing directories
  --refresh <incremental|full>   Refresh policy. Defaults to incremental
  --base-url <http://...>        Probe detected endpoints against a live local service
  --probe-limit <n>              Max runtime endpoint probes. Defaults to 6
  --allow-unsafe-methods         Use declared methods instead of OPTIONS fallbacks for non-GET probes
  --json                         Print machine-readable JSON
  `);
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function uniqueSorted(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function resolveTargetRepo(cwd, requestedRepo) {
  if (!requestedRepo) {
    return cwd;
  }
  return path.resolve(cwd, String(requestedRepo));
}

function manualWalk(cwd, currentDir = cwd, files = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      manualWalk(cwd, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath(cwd, fullPath));
    }
  }
  return files;
}

function listRepoFiles(cwd, refreshMode = 'incremental') {
  try {
    return listIndexedRepoFiles(cwd, { refreshMode }).files || [];
  } catch {
    return manualWalk(cwd).sort((left, right) => left.localeCompare(right));
  }
}

function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 256_000) {
      return '';
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function ownerForFile(filePath, packages = []) {
  const normalized = normalizePath(filePath);
  return packages
    .filter((pkg) => pkg.path === '.' || normalized === pkg.path || normalized.startsWith(`${pkg.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0] || null;
}

function packageDisplayName(pkg) {
  if (!pkg) {
    return 'root';
  }
  return pkg.name || pkg.id || 'root';
}

function parseImportSignals(content) {
  const signals = new Set();
  const text = String(content || '');
  if (/from\s+['"]hono['"]|require\(['"]hono['"]\)/.test(text)) {
    signals.add('hono');
  }
  if (/from\s+['"]express['"]|require\(['"]express['"]\)/.test(text)) {
    signals.add('express');
  }
  if (/from\s+['"]fastify['"]|require\(['"]fastify['"]\)/.test(text)) {
    signals.add('fastify');
  }
  if (/from\s+['"]koa['"]|require\(['"]koa['"]\)|from\s+['"]@koa\/router['"]|require\(['"]@koa\/router['"]\)/.test(text)) {
    signals.add('koa');
  }
  if (/firebase-admin\/firestore|firebase\/firestore|@google-cloud\/firestore/.test(text)) {
    signals.add('firestore');
  }
  if (/@upstash\/(redis|ratelimit)|\bioredis\b|\bfrom\s+['"]redis['"]/.test(text)) {
    signals.add('redis');
  }
  if (/jsonwebtoken|jwtVerify|SignJWT|verifyJwt|bearer\s+/i.test(text)) {
    signals.add('jwt');
  }
  if (/\brepositor(?:y|ies)\b|[A-Za-z]+Repository/.test(text)) {
    signals.add('repository-pattern');
  }
  return [...signals];
}

function nextAppApiPath(filePath) {
  const normalized = normalizePath(filePath);
  const match = normalized.match(/(^|\/)(?:app\/api)\/(.+)\/route\.[^.]+$/);
  if (!match) {
    return '';
  }
  return `/${match[2].replace(/\/index$/, '').replace(/\/route$/, '').replace(/\/+/, '/')}`.replace(/\/$/, '') || '/';
}

function nextPagesApiPath(filePath) {
  const normalized = normalizePath(filePath);
  const match = normalized.match(/(^|\/)(?:pages\/api)\/(.+)\.[^.]+$/);
  if (!match) {
    return '';
  }
  return `/${match[2].replace(/\/index$/, '').replace(/\/+/, '/')}`.replace(/\/$/, '') || '/';
}

function collectFileRouteEndpoints(filePath, content) {
  const endpoints = [];
  const appApiPath = nextAppApiPath(filePath);
  const pagesApiPath = nextPagesApiPath(filePath);
  const add = (framework, method, routePath, sourceType) => {
    if (!routePath) {
      return;
    }
    endpoints.push({
      method,
      path: routePath,
      framework,
      file: normalizePath(filePath),
      sourceType,
    });
  };

  if (appApiPath) {
    const exportMethods = [...new Set([...content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map((match) => match[1]))];
    const constMethods = [...new Set([...content.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map((match) => match[1]))];
    const methods = uniqueSorted([...exportMethods, ...constMethods]);
    for (const method of methods.length > 0 ? methods : ['ALL']) {
      add('next-api', method, appApiPath, 'next-app-route');
    }
  }

  if (pagesApiPath) {
    add('next-api', 'ALL', pagesApiPath, 'next-pages-api');
  }

  return endpoints;
}

function shouldScanApiFile(filePath) {
  const normalized = normalizePath(filePath);
  return ROUTE_DIR_PATTERN.test(normalized)
    || API_PATH_SEGMENT_PATTERN.test(normalized)
    || API_FILE_PATTERN.test(normalized);
}

function parseStringConstants(content) {
  const constants = new Map();
  for (const match of String(content || '').matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:\\.|(?!\2).)*)\2\s*;?/g)) {
    const value = String(match[3] || '');
    if (!/\$\{/.test(value)) {
      constants.set(match[1], value);
    }
  }
  return constants;
}

function extractBalancedSegment(source, openIndex) {
  const text = String(source || '');
  if (text[openIndex] !== '(') {
    return null;
  }

  let depth = 0;
  let quote = '';
  let escape = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return {
          text: text.slice(openIndex + 1, index),
          endIndex: index,
        };
      }
    }
  }

  return null;
}

function splitTopLevelArgs(source) {
  const text = String(source || '');
  const parts = [];
  let current = '';
  let quote = '';
  let escape = false;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') {
      depthParen += 1;
      current += char;
      continue;
    }
    if (char === ')') {
      depthParen -= 1;
      current += char;
      continue;
    }
    if (char === '{') {
      depthBrace += 1;
      current += char;
      continue;
    }
    if (char === '}') {
      depthBrace -= 1;
      current += char;
      continue;
    }
    if (char === '[') {
      depthBracket += 1;
      current += char;
      continue;
    }
    if (char === ']') {
      depthBracket -= 1;
      current += char;
      continue;
    }
    if (char === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      const token = current.trim();
      if (token) {
        parts.push(token);
      }
      current = '';
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

function stripQuotedLiteral(value) {
  const normalized = String(value || '').trim();
  const isQuoted = (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
    || (normalized.startsWith('`') && normalized.endsWith('`') && !/\$\{/.test(normalized));
  if (isQuoted) {
    return normalized.slice(1, -1);
  }
  return '';
}

function resolveRouteToken(token, constants) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    return '';
  }
  const literal = stripQuotedLiteral(normalized);
  if (literal) {
    return literal;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(normalized) && constants.has(normalized)) {
    return constants.get(normalized) || '';
  }
  return '';
}

function resolveRegisterPrefix(token, constants) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    return '';
  }
  const match = normalized.match(/\bprefix\s*:\s*([A-Za-z_$][\w$]*|["'`][^"'`]+["'`])/);
  if (!match) {
    return '';
  }
  return resolveRouteToken(match[1], constants);
}

function resolveAliasReference(token) {
  const normalized = String(token || '').trim();
  return /^[A-Za-z_$][\w$]*$/.test(normalized) ? normalized : '';
}

function extractFirstParameterName(token) {
  const normalized = String(token || '').trim();
  let match = normalized.match(/^(?:async\s+)?function\b[^()]*\(\s*([A-Za-z_$][\w$]*)/);
  if (match) {
    return match[1];
  }
  match = normalized.match(/^(?:async\s+)?\(\s*([A-Za-z_$][\w$]*)/);
  if (match) {
    return match[1];
  }
  match = normalized.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/);
  if (match) {
    return match[1];
  }
  return '';
}

function isLikelyRoutePath(value) {
  const normalized = String(value || '').trim();
  return normalized === '*' || normalized.startsWith('/');
}

function joinRoutePath(prefix, routePath) {
  const normalizedPrefix = String(prefix || '').trim();
  const normalizedRoute = String(routePath || '').trim();

  if (!normalizedPrefix) {
    return normalizedRoute || '/';
  }
  if (!normalizedRoute) {
    return normalizedPrefix || '/';
  }
  if (normalizedRoute === '*') {
    const base = normalizedPrefix === '/' ? '' : normalizedPrefix.replace(/\/$/, '');
    return `${base || ''}/*` || '/*';
  }

  const merged = `${normalizedPrefix.replace(/\/$/, '')}/${normalizedRoute.replace(/^\//, '')}`
    .replace(/\/{2,}/g, '/');
  return merged || '/';
}

function extractCallExpressions(content) {
  const calls = [];
  const text = String(content || '');
  const callPattern = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|options|head|all|use|route|register)\s*\(/g;
  for (const match of text.matchAll(callPattern)) {
    const alias = match[1];
    const method = String(match[2] || '').toLowerCase();
    if (!CALL_METHOD_SET.has(method)) {
      continue;
    }
    const openIndex = (match.index || 0) + match[0].length - 1;
    const segment = extractBalancedSegment(text, openIndex);
    if (!segment) {
      continue;
    }
    calls.push({
      alias,
      method,
      argsSource: segment.text,
      index: match.index,
    });
  }
  return calls;
}

function frameworkFromSignals(signals = []) {
  if (signals.includes('hono')) {
    return 'hono';
  }
  if (signals.includes('express')) {
    return 'express';
  }
  if (signals.includes('fastify')) {
    return 'fastify';
  }
  if (signals.includes('koa')) {
    return 'koa';
  }
  return 'router';
}

function buildAliasPrefixes(routeCalls, mountEdges) {
  const aliases = new Set();
  const incomingChildren = new Set();
  for (const call of routeCalls) {
    aliases.add(call.alias);
  }
  for (const edge of mountEdges) {
    aliases.add(edge.parent);
    aliases.add(edge.child);
    incomingChildren.add(edge.child);
  }

  const prefixes = new Map();
  for (const alias of aliases) {
    if (!incomingChildren.has(alias)) {
      prefixes.set(alias, new Set(['']));
    }
  }
  for (const alias of aliases) {
    if (!prefixes.has(alias)) {
      prefixes.set(alias, new Set());
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of mountEdges) {
      const parentPrefixes = prefixes.get(edge.parent) || new Set(['']);
      const childPrefixes = prefixes.get(edge.child) || new Set();
      for (const parentPrefix of parentPrefixes) {
        const nextPrefix = joinRoutePath(parentPrefix, edge.prefix || '');
        if (!childPrefixes.has(nextPrefix)) {
          childPrefixes.add(nextPrefix);
          changed = true;
        }
      }
      prefixes.set(edge.child, childPrefixes);
    }
  }

  for (const alias of aliases) {
    const current = prefixes.get(alias) || new Set();
    if (current.size === 0) {
      current.add('');
    }
    prefixes.set(alias, current);
  }

  return prefixes;
}

function collectHeuristicRouteEndpoints(filePath, content, frameworks = []) {
  const signals = new Set(frameworks || []);
  const constants = parseStringConstants(content);
  const calls = extractCallExpressions(content);
  const routeCalls = [];
  const mountEdges = [];
  let middlewareCount = 0;
  let mountCount = 0;
  let middlewareUseMax = 0;
  let routeHandlerMax = 0;

  for (const call of calls) {
    const args = splitTopLevelArgs(call.argsSource);
    if (HTTP_METHOD_SET.has(call.method)) {
      const routePath = resolveRouteToken(args[0], constants);
      if (!isLikelyRoutePath(routePath)) {
        continue;
      }
      const handlerDepth = Math.max(0, args.length - 1);
      routeHandlerMax = Math.max(routeHandlerMax, handlerDepth);
      routeCalls.push({
        alias: call.alias,
        method: call.method.toUpperCase(),
        path: routePath,
      });
      continue;
    }

    if (call.method === 'use') {
      const prefix = resolveRouteToken(args[0], constants);
      const hasPrefix = isLikelyRoutePath(prefix);
      const consumers = args.slice(hasPrefix ? 1 : 0);
      const middlewareDepth = consumers.length > 0 ? consumers.length : args.length;
      middlewareCount += 1;
      middlewareUseMax = Math.max(middlewareUseMax, middlewareDepth);
      if (hasPrefix) {
        let mountedAliasSeen = false;
        for (const token of consumers) {
          const childAlias = resolveAliasReference(token);
          if (childAlias) {
            mountEdges.push({
              parent: call.alias,
              child: childAlias,
              prefix,
            });
            mountedAliasSeen = true;
          }
        }
        if (mountedAliasSeen) {
          mountCount += 1;
        }
      }
      continue;
    }

    if (call.method === 'route') {
      const prefix = resolveRouteToken(args[0], constants);
      const childAlias = resolveAliasReference(args[1]);
      if (isLikelyRoutePath(prefix) && childAlias) {
        mountEdges.push({
          parent: call.alias,
          child: childAlias,
          prefix,
        });
        mountCount += 1;
      }
      continue;
    }

    if (call.method === 'register') {
      const childAlias = resolveAliasReference(args[0]) || extractFirstParameterName(args[0]);
      const prefix = resolveRegisterPrefix(args[1], constants);
      if (childAlias && isLikelyRoutePath(prefix)) {
        mountEdges.push({
          parent: call.alias,
          child: childAlias,
          prefix,
        });
        mountCount += 1;
      }
    }
  }

  if (routeCalls.length === 0) {
    return {
      endpoints: [],
      mountCount,
      middlewareCount,
      middlewareUseMax,
      routeHandlerMax,
    };
  }

  const aliasPrefixes = buildAliasPrefixes(routeCalls, mountEdges);
  const framework = frameworkFromSignals(frameworks);
  const endpoints = [];
  for (const routeCall of routeCalls) {
    const prefixes = [...(aliasPrefixes.get(routeCall.alias) || new Set(['']))];
    for (const prefix of prefixes) {
      const routePath = joinRoutePath(prefix, routeCall.path);
      endpoints.push({
        method: routeCall.method,
        path: routePath,
        framework,
        file: normalizePath(filePath),
        sourceType: prefix ? 'mounted-router-call' : 'router-call',
      });
    }
  }

  return {
    endpoints,
    mountCount,
    middlewareCount,
    middlewareUseMax,
    routeHandlerMax,
  };
}

function buildPackageSummaries(endpoints, packages, packageGraph) {
  const byPackage = new Map();
  const packageById = new Map((packageGraph.packages || []).map((entry) => [entry.id, entry]));
  const pushEndpoint = (endpoint) => {
    const pkg = packageById.get(endpoint.packageId) || { id: endpoint.packageId, name: endpoint.packageId, owners: [] };
    if (!byPackage.has(endpoint.packageId)) {
      byPackage.set(endpoint.packageId, {
        packageId: endpoint.packageId,
        packageName: packageDisplayName(pkg),
        packagePath: pkg.path || endpoint.packageId,
        owners: pkg.owners || [],
        endpointCount: 0,
        frameworks: new Set(),
        methods: new Set(),
        samplePaths: [],
      });
    }
    const current = byPackage.get(endpoint.packageId);
    current.endpointCount += 1;
    current.frameworks.add(endpoint.framework);
    current.methods.add(endpoint.method);
    if (!current.samplePaths.includes(endpoint.path) && current.samplePaths.length < 8) {
      current.samplePaths.push(endpoint.path);
    }
  };

  for (const endpoint of endpoints) {
    pushEndpoint(endpoint);
  }

  return [...byPackage.values()]
    .map((entry) => ({
      ...entry,
      frameworks: [...entry.frameworks].sort((left, right) => left.localeCompare(right)),
      methods: [...entry.methods].sort((left, right) => left.localeCompare(right)),
      owners: uniqueSorted(entry.owners),
    }))
    .sort((left, right) => right.endpointCount - left.endpointCount || left.packageName.localeCompare(right.packageName));
}

function recommendedVerifications(packageGraph, frameworks, dataStores, authSignals) {
  const commands = [];
  const push = (command) => {
    if (command && !commands.includes(command)) {
      commands.push(command);
    }
  };

  push('rai api-surface --json');
  push('rai verify-work --json');
  if (frameworks.includes('hono') || frameworks.includes('express') || frameworks.includes('fastify') || frameworks.includes('koa')) {
    push('npm test');
  }
  if (frameworks.includes('next-api')) {
    push('rai verify-browser --url http://localhost:3000 --json');
  }
  if (dataStores.includes('firestore') || dataStores.includes('redis') || authSignals.includes('jwt')) {
    push('rai trust --json');
  }
  if (packageGraph.repoShape === 'monorepo') {
    push('rai audit-repo --mode oneshot --json');
  }
  return commands;
}

function buildApiSurface(cwd, options = {}) {
  const refreshMode = String(options.refresh || options.refreshMode || 'incremental').trim().toLowerCase() === 'full'
    ? 'full'
    : 'incremental';
  const files = listRepoFiles(cwd, refreshMode);
  const packageGraph = options.packageGraph || buildPackageGraph(cwd, { writeFiles: false });
  const packages = packageGraph.packages || [];
  const codeFiles = files.filter((filePath) => CODE_FILE_PATTERN.test(filePath));
  const endpoints = [];
  const frameworkSignals = new Set();
  const dataStores = new Set();
  const authSignals = new Set();
  const middlewareFiles = [];
  const repositoryFiles = [];
  let middlewareCount = 0;
  let mountCount = 0;
  let middlewareUseMax = 0;
  let routeHandlerMax = 0;

  for (const filePath of codeFiles) {
    if (!shouldScanApiFile(filePath)) {
      continue;
    }

    const fullPath = path.join(cwd, filePath);
    const content = readFileSafe(fullPath);
    if (!content) {
      continue;
    }

    const signals = parseImportSignals(content);
    for (const signal of signals) {
      if (['hono', 'express', 'fastify', 'koa', 'next-api'].includes(signal)) {
        frameworkSignals.add(signal);
      }
      if (signal === 'firestore' || signal === 'redis') {
        dataStores.add(signal);
      }
      if (signal === 'jwt') {
        authSignals.add(signal);
      }
      if (signal === 'repository-pattern' && repositoryFiles.length < 12) {
        repositoryFiles.push(filePath);
      }
    }

    const fileRouteEndpoints = collectFileRouteEndpoints(filePath, content);
    for (const endpoint of fileRouteEndpoints) {
      frameworkSignals.add(endpoint.framework);
      const owner = ownerForFile(filePath, packages);
      endpoints.push({
        ...endpoint,
        packageId: owner?.id || '.',
        packageName: packageDisplayName(owner),
        owners: owner?.owners || [],
      });
    }

    const routerHeuristics = collectHeuristicRouteEndpoints(filePath, content, signals);
    mountCount += routerHeuristics.mountCount;
    middlewareCount += routerHeuristics.middlewareCount;
    middlewareUseMax = Math.max(middlewareUseMax, routerHeuristics.middlewareUseMax);
    routeHandlerMax = Math.max(routeHandlerMax, routerHeuristics.routeHandlerMax);
    if (routerHeuristics.middlewareCount > 0 || routerHeuristics.routeHandlerMax > 0) {
      middlewareFiles.push({
        file: filePath,
        count: routerHeuristics.middlewareCount,
        mountCount: routerHeuristics.mountCount,
        maxDepth: Math.max(routerHeuristics.middlewareUseMax, routerHeuristics.routeHandlerMax),
        routeHandlerMax: routerHeuristics.routeHandlerMax,
      });
    }
    for (const endpoint of routerHeuristics.endpoints) {
      frameworkSignals.add(endpoint.framework);
      const owner = ownerForFile(filePath, packages);
      endpoints.push({
        ...endpoint,
        packageId: owner?.id || '.',
        packageName: packageDisplayName(owner),
        owners: owner?.owners || [],
      });
    }
  }

  const dedupedEndpoints = [];
  const seen = new Set();
  for (const endpoint of endpoints) {
    const key = `${endpoint.packageId}::${endpoint.file}::${endpoint.method}::${endpoint.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedEndpoints.push(endpoint);
  }

  const frameworks = uniqueSorted([...frameworkSignals]);
  const payload = {
    ...contractPayload('apiSurface'),
    generatedAt: new Date().toISOString(),
    refreshMode,
    repoShape: packageGraph.repoShape,
    endpointCount: dedupedEndpoints.length,
    middlewareCount,
    mountCount,
    frameworks,
    packages: buildPackageSummaries(dedupedEndpoints, packages, packageGraph),
    endpoints: dedupedEndpoints.slice(0, 120),
    authSignals: uniqueSorted([...authSignals]),
    dataStores: uniqueSorted([...dataStores]),
    repositoryPatternFiles: uniqueSorted(repositoryFiles).slice(0, 24),
    middlewareFiles: middlewareFiles
      .sort((left, right) => right.maxDepth - left.maxDepth || right.count - left.count || left.file.localeCompare(right.file))
      .slice(0, 24),
    middlewareDepth: {
      useMax: middlewareUseMax,
      routeHandlerMax,
    },
    recommendedVerifications: recommendedVerifications(packageGraph, frameworks, [...dataStores], [...authSignals]),
    analysis: {
      method: 'regex-call-graph-and-import-scan',
      limitations: [
        'Runtime-generated routes, deep DI containers, and reflective middleware registration can still be under-counted.',
        'Mounted callback routers are traced heuristically from source text, so alias-heavy metaprogramming should be treated as advisory evidence.',
        'Semantic auth/data-flow analysis remains heuristic and should be treated as a routing aid rather than formal proof.',
      ],
    },
    runtimeVerification: null,
  };

  if (options.writeFiles !== false) {
    const runtimeJson = writeRuntimeJson(cwd, 'api-surface.json', payload);
    const runtimeMarkdown = writeRuntimeMarkdown(cwd, 'api-surface.md', renderApiSurfaceMarkdown(payload));
    payload.artifacts = {
      runtimeJson: relativePath(cwd, runtimeJson),
      runtimeMarkdown: relativePath(cwd, runtimeMarkdown),
    };
  }

  return payload;
}

async function buildApiSurfaceCommandPayload(cwd, options = {}) {
  const payload = buildApiSurface(cwd, {
    ...options,
    writeFiles: false,
  });

  if (options.baseUrl) {
    payload.runtimeVerification = await runApiSurfaceRuntimeEvidence(cwd, payload, {
      baseUrl: options.baseUrl,
      probeLimit: options.probeLimit,
      allowUnsafeMethods: Boolean(options.allowUnsafeMethods),
      writeArtifacts: options.writeFiles !== false,
    });
    payload.analysis = {
      ...(payload.analysis || {}),
      method: 'static-plus-runtime-http-probe',
    };
  }

  if (options.writeFiles !== false) {
    const runtimeJson = writeRuntimeJson(cwd, 'api-surface.json', payload);
    const runtimeMarkdown = writeRuntimeMarkdown(cwd, 'api-surface.md', renderApiSurfaceMarkdown(payload));
    payload.artifacts = {
      runtimeJson: relativePath(cwd, runtimeJson),
      runtimeMarkdown: relativePath(cwd, runtimeMarkdown),
    };
  }

  return payload;
}

function renderApiSurfaceMarkdown(payload) {
  const packages = (payload.packages || []).slice(0, 8)
    .map((entry) => `- \`${entry.packageName}\` -> endpoints=${entry.endpointCount}, frameworks=${entry.frameworks.join(', ') || 'unknown'}, owners=${entry.owners.join(', ') || 'unowned'}`)
    .join('\n') || '- `No API-owning packages detected.`';
  const endpoints = (payload.endpoints || []).slice(0, 12)
    .map((entry) => `- \`${entry.method}\` \`${entry.path}\` -> ${entry.file}`)
    .join('\n') || '- `No endpoints detected.`';
  return `
# API SURFACE

- Repo shape: \`${payload.repoShape}\`
- Endpoint count: \`${payload.endpointCount}\`
- Middleware count: \`${payload.middlewareCount}\`
- Mount count: \`${payload.mountCount}\`
- Middleware depth: \`use=${payload.middlewareDepth?.useMax || 0}, route=${payload.middlewareDepth?.routeHandlerMax || 0}\`
- Frameworks: \`${payload.frameworks.join(', ') || 'none'}\`
- Auth signals: \`${payload.authSignals.join(', ') || 'none'}\`
- Data stores: \`${payload.dataStores.join(', ') || 'none'}\`

## Packages

${packages}

## Sample endpoints

${endpoints}

## Verification

${(payload.recommendedVerifications || []).map((command) => `- \`${command}\``).join('\n') || '- `No recommended verification commands.`'}

## Runtime evidence

${payload.runtimeVerification
    ? `- Proof status: \`${payload.runtimeVerification.proofStatus}\`\n- Attempted probes: \`${payload.runtimeVerification.attemptedCount}\`\n- Verified: \`${payload.runtimeVerification.verifiedCount}\`\n- Reachable: \`${payload.runtimeVerification.reachableCount}\`\n- Warnings: \`${payload.runtimeVerification.warnCount}\`\n- Failures: \`${payload.runtimeVerification.failCount}\``
    : '- `No runtime HTTP proof attached to this API surface.`'}

## Limitations

${(payload.analysis?.limitations || []).map((entry) => `- ${entry}`).join('\n')}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const repoRoot = resolveTargetRepo(process.cwd(), args.repo);
  const payload = await buildApiSurfaceCommandPayload(repoRoot, {
    refresh: args.refresh,
    writeFiles: args.write !== false,
    baseUrl: args['base-url'],
    probeLimit: args['probe-limit'],
    allowUnsafeMethods: Boolean(args['allow-unsafe-methods']),
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# API SURFACE');
  console.log(`- Repo: ${repoRoot}`);
  console.log(`- Endpoints: ${payload.endpointCount}`);
  console.log(`- Middleware: ${payload.middlewareCount} (useMax=${payload.middlewareDepth?.useMax || 0}, routeMax=${payload.middlewareDepth?.routeHandlerMax || 0})`);
  console.log(`- Frameworks: ${payload.frameworks.join(', ') || 'none'}`);
  console.log(`- Auth: ${payload.authSignals.join(', ') || 'none'}`);
  console.log(`- Data stores: ${payload.dataStores.join(', ') || 'none'}`);
  if (payload.runtimeVerification) {
    console.log(`- Runtime evidence: ${payload.runtimeVerification.proofStatus} (attempted=${payload.runtimeVerification.attemptedCount}, verified=${payload.runtimeVerification.verifiedCount}, reachable=${payload.runtimeVerification.reachableCount}, failed=${payload.runtimeVerification.failCount})`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildApiSurface,
  buildApiSurfaceCommandPayload,
  collectHeuristicRouteEndpoints,
  renderApiSurfaceMarkdown,
  resolveTargetRepo,
};
