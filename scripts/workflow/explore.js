const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  listGitChanges,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { readText: read } = require('./io/files');
const { listIndexedRepoFiles } = require('./fs_index');
const { buildCodebaseMap } = require('./map_codebase');
const { buildFrontendProfile } = require('./map_frontend');
const { buildPackageGraph } = require('./package_graph');
const { buildSymbolGraph, findSymbolMatches } = require('./symbol_graph');

function printHelp() {
  console.log(`
explore

Usage:
  node scripts/workflow/explore.js "auth flow"

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --changed           Focus changed files
  --workflow          Focus canonical workflow docs
  --frontend          Focus frontend signals
  --repo              Focus repo structure
  --symbol <name>     Search for a symbol definition and references
  --callers <name>    Search likely callers/usages for a symbol
  --impact <target>   Search likely impact surface for a file or symbol
  --json              Print machine-readable output
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function scoreMatch(filePath, queryTerms) {
  const lower = filePath.toLowerCase();
  return queryTerms.reduce((score, term) => {
    if (!term) {
      return score;
    }
    if (lower.includes(term)) {
      return score + 5;
    }
    return score;
  }, 0);
}

function searchFiles(cwd, query) {
  const repo = listIndexedRepoFiles(cwd, { refreshMode: 'incremental' });
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const matches = repo.files
    .map((filePath) => ({
      filePath,
      score: scoreMatch(filePath, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
    .slice(0, 12);

  return {
    refreshStatus: repo.refreshStatus,
    changedFiles: repo.changedFiles.slice(0, 12),
    matches,
  };
}

function runRg(cwd, pattern) {
  const result = childProcess.spawnSync('rg', ['-n', pattern, '.'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.error) {
    return runBuiltInSearch(cwd, pattern);
  }
  if (result.status !== 0 && !result.stdout) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function runBuiltInSearch(cwd, pattern) {
  const query = String(pattern || '').trim().toLowerCase();
  if (!query) {
    return [];
  }

  const repo = listIndexedRepoFiles(cwd, { refreshMode: 'incremental' });
  const matches = [];
  for (const filePath of repo.files) {
    if (matches.length >= 40) {
      break;
    }

    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile() || stats.size > 262144) {
        continue;
      }
      const lines = read(filePath).split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.toLowerCase().includes(query)) {
          continue;
        }
        matches.push(`${relativePath(cwd, filePath)}:${index + 1}:${line.trim()}`.slice(0, 240));
        if (matches.length >= 40) {
          break;
        }
      }
    } catch {
      // Ignore unreadable and binary-looking files in the fallback path.
    }
  }
  return matches;
}

function impactedPackagesFor(packageGraph, ownerPackages) {
  const packageByName = new Map((packageGraph.packages || []).map((item) => [item.name, item.id]));
  const dependentsById = new Map((packageGraph.packages || []).map((item) => [item.id, []]));
  for (const item of packageGraph.packages || []) {
    for (const dependencyName of item.internalDependencies || []) {
      const dependencyId = packageByName.get(dependencyName);
      if (!dependencyId) {
        continue;
      }
      dependentsById.get(dependencyId).push(item.id);
    }
  }
  const queue = [...ownerPackages];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dependentId of dependentsById.get(current) || []) {
      if (seen.has(dependentId)) {
        continue;
      }
      seen.add(dependentId);
      queue.push(dependentId);
    }
  }
  return [...seen].sort();
}

function testsForPackages(packageGraph, packageIds = []) {
  return uniqueSorted(packageIds.flatMap((packageId) => packageGraph.testsByPackage?.[packageId] || [])).slice(0, 12);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function symbolSearch(cwd, symbol, symbolGraph) {
  const graphMatches = findSymbolMatches(symbolGraph, symbol);
  const grepMatches = runRg(cwd, `\\b${symbol}\\b`);
  return {
    symbol,
    definitions: graphMatches.definitions,
    references: graphMatches.references,
    importers: graphMatches.importers,
    matches: grepMatches,
  };
}

function callerSearch(cwd, symbol, symbolGraph) {
  const graphMatches = findSymbolMatches(symbolGraph, symbol);
  const callers = graphMatches.references.filter((filePath) => !graphMatches.definitions.includes(filePath));
  return {
    symbol,
    callers,
    matches: runRg(cwd, `${symbol}\\(`),
  };
}

function impactSearch(cwd, target, packageGraph, symbolGraph) {
  const normalized = String(target || '').trim();
  if (!normalized) {
    return {
      target: normalized,
      matches: [],
      ownerPackages: [],
      impactedPackages: [],
      impactedTests: [],
      callers: [],
    };
  }
  const isFileTarget = normalized.includes('/');
  const graphMatch = !isFileTarget ? findSymbolMatches(symbolGraph, normalized) : null;
  const matches = normalized.includes('/')
    ? runRg(cwd, normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : runRg(cwd, `\\b${normalized}\\b`);
  const matchedFiles = uniqueSorted([
    ...matches.map((line) => line.split(':').slice(0, 1)[0]).filter(Boolean),
    ...(graphMatch?.definitions || []),
    ...(graphMatch?.references || []),
    ...(isFileTarget
      ? (symbolGraph.importEdges || []).filter((edge) => edge.to === normalized).map((edge) => edge.from)
      : []),
  ]);
  const ownerPackages = [...new Set(matchedFiles
    .map((filePath) => packageGraph.ownership?.[filePath])
    .filter(Boolean))].sort();
  const impactedPackages = impactedPackagesFor(packageGraph, ownerPackages);
  return {
    target: normalized,
    matches,
    ownerPackages,
    impactedPackages,
    impactedTests: testsForPackages(packageGraph, impactedPackages),
    callers: isFileTarget
      ? uniqueSorted((symbolGraph.importEdges || []).filter((edge) => edge.to === normalized).map((edge) => edge.from))
      : graphMatch?.importers || [],
    definitions: graphMatch?.definitions || [],
  };
}

function exploreWorkflow(cwd, rootDir) {
  const paths = workflowPaths(rootDir, cwd);
  return {
    files: [
      paths.status,
      paths.context,
      paths.execplan,
      paths.validation,
      paths.handoff,
      paths.window,
    ].map((filePath) => relativePath(cwd, filePath)),
    milestone: read(paths.status).match(/- Current milestone: `([^`]*)`/)?.[1] || 'NONE',
  };
}

function buildExplorePayload(cwd, rootDir, args) {
  const query = args._.join(' ').trim();
  const changed = Boolean(args.changed);
  const workflow = Boolean(args.workflow);
  const frontend = Boolean(args.frontend);
  const symbol = args.symbol ? String(args.symbol).trim() : '';
  const callers = args.callers ? String(args.callers).trim() : '';
  const impact = args.impact ? String(args.impact).trim() : '';
  const repoLens = Boolean(args.repo) || (!changed && !workflow && !frontend && !query && !symbol && !callers && !impact);
  const packageGraph = buildPackageGraph(cwd, { writeFiles: false });
  const symbolGraph = buildSymbolGraph(cwd, { writeFiles: true, refreshMode: 'incremental' });
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: relativePath(cwd, rootDir),
    mode: symbol ? 'symbol' : callers ? 'callers' : impact ? 'impact' : changed ? 'changed' : workflow ? 'workflow' : frontend ? 'frontend' : repoLens ? 'repo' : 'search',
    query,
    changedFiles: changed ? listGitChanges(cwd) : [],
    raiola: workflow ? exploreWorkflow(cwd, rootDir) : null,
    frontend: frontend ? buildFrontendProfile(cwd, rootDir) : null,
    repo: repoLens ? buildCodebaseMap(cwd, rootDir, {
      refreshMode: 'incremental',
      scopeKind: 'workstream',
      writeFiles: false,
    }) : null,
    packageGraph: repoLens ? {
      repoShape: packageGraph.repoShape,
      packageCount: packageGraph.packageCount,
      changedPackages: packageGraph.changedPackages,
      impactedPackages: packageGraph.impactedPackages,
      impactedTests: packageGraph.impactedTests,
    } : null,
    symbolGraph: repoLens || symbol || callers || impact ? {
      parsedFileCount: symbolGraph.parsedFileCount,
      symbolCount: symbolGraph.symbolCount,
      importEdgeCount: symbolGraph.importEdgeCount,
      refreshStatus: symbolGraph.refreshStatus,
      refreshedFiles: symbolGraph.refreshedFiles.slice(0, 12),
    } : null,
    search: query ? searchFiles(cwd, query) : null,
    symbol: symbol ? symbolSearch(cwd, symbol, symbolGraph) : null,
    callers: callers ? callerSearch(cwd, callers, symbolGraph) : null,
    impact: impact ? impactSearch(cwd, impact, packageGraph, symbolGraph) : null,
  };

  const topFiles = [];
  if (payload.changedFiles.length > 0) {
    topFiles.push(...payload.changedFiles.slice(0, 6));
  }
  if (payload.search?.matches?.length > 0) {
    topFiles.push(...payload.search.matches.slice(0, 6).map((item) => item.filePath));
  }
  if (payload.workflow?.files?.length > 0) {
    topFiles.push(...payload.workflow.files.slice(0, 6));
  }
  if (payload.symbol?.matches?.length > 0) {
    topFiles.push(...payload.symbol.matches.map((line) => line.split(':').slice(0, 1)[0]).slice(0, 6));
  }
  if (payload.callers?.matches?.length > 0) {
    topFiles.push(...payload.callers.matches.map((line) => line.split(':').slice(0, 1)[0]).slice(0, 6));
  }
  if (payload.callers?.callers?.length > 0) {
    topFiles.push(...payload.callers.callers.slice(0, 6));
  }
  if (payload.impact?.matches?.length > 0) {
    topFiles.push(...payload.impact.matches.map((line) => line.split(':').slice(0, 1)[0]).slice(0, 6));
  }
  if (payload.impact?.callers?.length > 0) {
    topFiles.push(...payload.impact.callers.slice(0, 6));
  }
  payload.relatedFiles = [...new Set(topFiles)].slice(0, 10);
  payload.recommendedNextCommand = frontend
    ? 'rai verify-browser --smoke'
    : payload.impact?.impactedTests?.length > 0
      ? 'rai verify-shell --cmd "npm test"'
      : payload.impact?.impactedPackages?.length > 1
      ? 'rai review --heatmap'
    : changed
      ? 'rai verify-shell --cmd "npm test"'
      : workflow
        ? 'rai manager'
        : 'rai next';
  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildExplorePayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# EXPLORE\n');
  console.log(`- Mode: \`${payload.mode}\``);
  if (payload.query) {
    console.log(`- Query: \`${payload.query}\``);
  }
  console.log(`- Next: \`${payload.recommendedNextCommand}\``);
  console.log('\n## Related Files\n');
  if (payload.relatedFiles.length === 0) {
    console.log('- `No strong matches yet`');
  } else {
    for (const item of payload.relatedFiles) {
      console.log(`- \`${item}\``);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildExplorePayload,
};
