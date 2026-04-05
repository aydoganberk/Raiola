const fs = require('node:fs');
const path = require('node:path');
const { listGitChanges, parseArgs } = require('./common');
const { checkClaims } = require('./claims');
const { listLatestEntries } = require('./runtime_helpers');
const { relativePath, writeJsonFile } = require('./roadmap_os');

function printHelp() {
  console.log(`
evidence

Usage:
  node scripts/workflow/evidence.js
  node scripts/workflow/evidence.js graph

Options:
  --json            Print machine-readable output
  `);
}

function latestVerifyArtifacts(cwd, kind) {
  const baseDir = path.join(cwd, '.workflow', 'verifications', kind);
  return listLatestEntries(baseDir, 5).map((entry) => ({
    id: `${kind}:${entry.name}`,
    kind,
    path: relativePath(cwd, entry.fullPath),
    metaFile: fs.existsSync(path.join(entry.fullPath, 'meta.json'))
      ? relativePath(cwd, path.join(entry.fullPath, 'meta.json'))
      : null,
  }));
}

function buildEvidenceGraph(cwd) {
  const claims = checkClaims(cwd);
  const verifyRuns = [
    ...latestVerifyArtifacts(cwd, 'shell'),
    ...latestVerifyArtifacts(cwd, 'browser'),
  ];
  const changedFiles = listGitChanges(cwd).map((file) => ({
    id: `file:${file}`,
    kind: 'file',
    path: file,
  }));
  const nodes = [
    ...claims.rows.map((row) => ({
      id: row.id,
      kind: 'claim',
      label: row.claim,
      status: row.status,
      evidence: row.evidence,
    })),
    ...verifyRuns.map((run) => ({
      id: run.id,
      kind: 'verify_run',
      label: run.path,
      metaFile: run.metaFile,
    })),
    ...changedFiles,
  ];
  const edges = [];
  for (const claim of claims.rows) {
    if (claim.evidence) {
      const verify = verifyRuns.find((run) => run.metaFile === claim.evidence || run.path === claim.evidence);
      if (verify) {
        edges.push({
          from: claim.id,
          to: verify.id,
          relation: 'supported_by',
        });
      }
    }
  }
  for (const file of changedFiles) {
    for (const claim of claims.rows) {
      edges.push({
        from: claim.id,
        to: file.id,
        relation: 'touches',
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    coverage: {
      claimCount: claims.rows.length,
      supportedClaims: claims.rows.filter((row) => row.status === 'supported').length,
      verifyRunCount: verifyRuns.length,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'graph';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const graph = buildEvidenceGraph(cwd);
  writeJsonFile(path.join(cwd, '.workflow', 'evidence-graph', 'latest.json'), graph);
  if (args.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }
  console.log('# EVIDENCE GRAPH\n');
  console.log(`- Nodes: \`${graph.nodes.length}\``);
  console.log(`- Edges: \`${graph.edges.length}\``);
  console.log(`- Supported claims: \`${graph.coverage.supportedClaims}/${graph.coverage.claimCount}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildEvidenceGraph,
};
