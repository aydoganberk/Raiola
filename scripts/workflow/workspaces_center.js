const {
  controlPaths,
  getFieldValue,
  parseArgs,
  parseWorkstreamTable,
} = require('./common');
const { readText: read } = require('./io/files');
const { buildPackageGraph } = require('./package_graph');

function printHelp() {
  console.log(`
workspaces_center

Usage:
  node scripts/workflow/workspaces_center.js

Options:
  --json            Print machine-readable output
  `);
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function overlayByIdentity(rows = []) {
  const byRoot = new Map();
  const byName = new Map();
  for (const row of rows) {
    if (row.root) {
      byRoot.set(normalizePath(row.root), row);
    }
    if (row.name) {
      byName.set(String(row.name).trim().toLowerCase(), row);
    }
  }
  return {
    byRoot,
    byName,
  };
}

function buildTruthRows(graph) {
  const truthWorkspaces = graph.workspaceDiscovery?.workspaces || [];
  if (truthWorkspaces.length > 0) {
    return truthWorkspaces.map((workspace) => ({
      name: workspace.name,
      root: workspace.root,
      ecosystem: workspace.ecosystem,
      manifest: workspace.manifest,
      owners: workspace.owners || [],
      sources: workspace.sources || [],
      evidence: workspace.evidence || [],
    }));
  }

  return (graph.packages || [])
    .filter((pkg) => pkg.id !== '.')
    .map((pkg) => ({
      name: pkg.name,
      root: pkg.path,
      ecosystem: pkg.ecosystem || 'node',
      manifest: pkg.manifest || 'package.json',
      owners: pkg.owners || [],
      sources: pkg.truthSources || [],
      evidence: [],
    }));
}

function buildWorkspacePayload(cwd) {
  const workstreamsDoc = read(controlPaths(cwd).workstreams);
  const table = parseWorkstreamTable(workstreamsDoc);
  const overlayIndex = overlayByIdentity(table.rows);
  const graph = buildPackageGraph(cwd, { writeFiles: false });
  const truthRows = buildTruthRows(graph);
  const seenOverlayKeys = new Set();

  const merged = truthRows.map((truth) => {
    const overlay = overlayIndex.byRoot.get(normalizePath(truth.root))
      || overlayIndex.byName.get(String(truth.name || '').trim().toLowerCase())
      || null;
    if (overlay) {
      seenOverlayKeys.add(`${overlay.name}::${overlay.root}`);
    }
    return {
      name: truth.name,
      root: truth.root,
      status: overlay?.status || 'observed',
      currentMilestone: overlay?.currentMilestone || 'NONE',
      step: overlay?.step || 'mapped',
      packetHash: overlay?.packetHash || '',
      budgetStatus: overlay?.budgetStatus || 'n/a',
      health: overlay?.health || 'unknown',
      ecosystem: truth.ecosystem,
      manifest: truth.manifest,
      owners: truth.owners,
      sourceOfTruth: 'repo-truth',
      overlayApplied: Boolean(overlay),
      truthSources: truth.sources,
      evidence: truth.evidence,
    };
  });

  for (const overlay of table.rows) {
    const key = `${overlay.name}::${overlay.root}`;
    if (seenOverlayKeys.has(key)) {
      continue;
    }
    merged.push({
      name: overlay.name,
      root: overlay.root,
      status: overlay.status,
      currentMilestone: overlay.currentMilestone,
      step: overlay.step,
      packetHash: overlay.packetHash,
      budgetStatus: overlay.budgetStatus,
      health: overlay.health,
      ecosystem: 'unknown',
      manifest: null,
      owners: [],
      sourceOfTruth: 'overlay-only',
      overlayApplied: true,
      truthSources: [],
      evidence: [],
    });
  }

  const activeRoot = String(getFieldValue(workstreamsDoc, 'Active workstream root') || merged[0]?.root || 'docs/workflow').trim();
  const activeName = String(getFieldValue(workstreamsDoc, 'Active workstream name') || merged[0]?.name || 'workflow').trim();

  return {
    generatedAt: new Date().toISOString(),
    activeRoot,
    activeName,
    registrySource: 'repo-truth+overlay',
    workspaceSources: graph.workspaceDiscovery?.sources || [],
    ownershipSource: graph.workspaceDiscovery?.ownershipSource || null,
    ecosystems: graph.workspaceDiscovery?.ecosystems || [],
    overlay: {
      file: 'docs/workflow/WORKSTREAMS.md',
      role: 'coordination-overlay',
      rowCount: table.rows.length,
    },
    workspaces: merged.sort((left, right) => String(left.root).localeCompare(String(right.root))),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const payload = buildWorkspacePayload(cwd);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# WORKSPACES\n');
  console.log(`- Active: \`${payload.activeName}\` -> \`${payload.activeRoot}\``);
  console.log(`- Registry: \`${payload.registrySource}\``);
  if (payload.workspaceSources.length > 0) {
    console.log(`- Sources: \`${payload.workspaceSources.join(', ')}\``);
  }
  console.log('\n## Registry\n');
  for (const workspace of payload.workspaces) {
    console.log(`- \`${workspace.name}\` -> root=\`${workspace.root}\`, ecosystem=\`${workspace.ecosystem}\`, status=\`${workspace.status}\`, owners=\`${(workspace.owners || []).join(', ') || 'unowned'}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildWorkspacePayload,
};
