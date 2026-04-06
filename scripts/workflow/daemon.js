const path = require('node:path');
const { parseArgs } = require('./common');
const { listIndexedRepoFiles } = require('./fs_index');
const { buildPackageGraph } = require('./package_graph');
const { buildSymbolGraph } = require('./symbol_graph');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

function daemonPath(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'daemon.json');
}

function loadDaemon(cwd) {
  return readJsonFile(daemonPath(cwd), {
    generatedAt: new Date().toISOString(),
    running: false,
    heartbeatAt: null,
    mode: 'optional',
    freshness: 'cold',
    caches: {},
  });
}

function buildDaemonCaches(cwd) {
  const fsIndex = listIndexedRepoFiles(cwd, { refreshMode: 'incremental' });
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const symbolGraph = buildSymbolGraph(cwd, { writeFiles: true, refreshMode: 'incremental' });
  return {
    fsIndex: {
      fileCount: fsIndex.fileCount,
      changedFiles: (fsIndex.changedFiles || []).slice(0, 20),
      refreshStatus: fsIndex.refreshStatus,
      indexPath: relativePath(cwd, fsIndex.indexPath),
    },
    packageGraph: {
      repoShape: packageGraph.repoShape,
      packageCount: packageGraph.packageCount,
      changedPackages: packageGraph.changedPackages,
      impactedPackages: packageGraph.impactedPackages,
      impactedTests: (packageGraph.impactedTests || []).slice(0, 20),
      graphPath: relativePath(cwd, packageGraph.graphPath),
    },
    symbolGraph: {
      parsedFileCount: symbolGraph.parsedFileCount,
      symbolCount: symbolGraph.symbolCount,
      importEdgeCount: symbolGraph.importEdgeCount,
      refreshStatus: symbolGraph.refreshStatus,
      refreshedFiles: symbolGraph.refreshedFiles.slice(0, 20),
      graphPath: relativePath(cwd, symbolGraph.graphPath),
    },
  };
}

function freshnessFor(heartbeatAt) {
  if (!heartbeatAt) {
    return 'cold';
  }
  const ageMs = Date.now() - new Date(heartbeatAt).getTime();
  if (ageMs < 5 * 60 * 1000) {
    return 'fresh';
  }
  if (ageMs < 30 * 60 * 1000) {
    return 'warm';
  }
  return 'stale';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/daemon.js status|restart|refresh|stop [--json]');
    return;
  }
  const cwd = process.cwd();
  const daemon = loadDaemon(cwd);
  if (action === 'restart' || action === 'refresh') {
    daemon.running = true;
    daemon.heartbeatAt = new Date().toISOString();
    daemon.generatedAt = daemon.generatedAt || daemon.heartbeatAt;
    daemon.freshness = freshnessFor(daemon.heartbeatAt);
    daemon.caches = buildDaemonCaches(cwd);
    writeJsonFile(daemonPath(cwd), daemon);
  }
  if (action === 'stop') {
    daemon.running = false;
    daemon.heartbeatAt = new Date().toISOString();
    daemon.freshness = freshnessFor(daemon.heartbeatAt);
    writeJsonFile(daemonPath(cwd), daemon);
  }
  if (action === 'status') {
    daemon.freshness = freshnessFor(daemon.heartbeatAt);
  }
  const payload = {
    action,
    file: relativePath(cwd, daemonPath(cwd)),
    daemon,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# DAEMON\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Running: \`${daemon.running ? 'yes' : 'no'}\``);
  console.log(`- Heartbeat: \`${daemon.heartbeatAt || 'never'}\``);
  console.log(`- Freshness: \`${daemon.freshness || 'cold'}\``);
  if (daemon.caches?.symbolGraph) {
    console.log(`- Symbol graph: \`${daemon.caches.symbolGraph.symbolCount} symbols / ${daemon.caches.symbolGraph.importEdgeCount} edges\``);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
