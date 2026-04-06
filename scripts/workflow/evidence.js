const fs = require('node:fs');
const path = require('node:path');
const { listGitChanges, parseArgs } = require('./common');
const { checkClaims } = require('./claims');
const { readApprovals } = require('./policy');
const { latestReviewData, latestVerifyWork, readAssumptions } = require('./trust_os');
const { listLatestEntries } = require('./runtime_helpers');
const { relativePath, readTableDocument, writeJsonFile } = require('./roadmap_os');

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

function readQuestions(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: ['Id', 'Question', 'Status', 'Opened At', 'Resolution'],
  });
  return table.rows.map((row) => ({
    id: row[0],
    question: row[1],
    status: row[2],
    openedAt: row[3],
    resolution: row[4],
  })).filter((row) => row.question);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function tokenize(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4),
  );
}

function hasOverlap(left, right) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      return true;
    }
  }
  return false;
}

function buildEvidenceGraph(cwd) {
  const claims = checkClaims(cwd);
  const verifyRuns = [
    ...latestVerifyArtifacts(cwd, 'shell'),
    ...latestVerifyArtifacts(cwd, 'browser'),
  ];
  const questions = readQuestions(cwd);
  const assumptions = readAssumptions(cwd);
  const review = latestReviewData(cwd);
  const approvals = readApprovals(cwd).grants;
  const verifyWork = latestVerifyWork(cwd);
  const shipReadiness = readJson(path.join(cwd, '.workflow', 'reports', 'ship-readiness.json'), null);
  const changedFiles = listGitChanges(cwd).map((file) => ({
    id: `file:${file}`,
    kind: 'file',
    path: file,
  }));
  const diffNode = {
    id: 'diff:current',
    kind: 'diff',
    label: 'Current repo diff',
  };
  const nodes = [
    ...questions.map((row) => ({
      id: row.id,
      kind: 'question',
      label: row.question,
      status: row.status || 'open',
    })),
    ...assumptions.map((row) => ({
      id: row.id || `assumption:${row.assumption}`,
      kind: 'assumption',
      label: row.assumption,
      status: row.status || 'open',
      impact: row.impact,
    })),
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
    ...review.findings.map((finding, index) => ({
      id: `review:${index}:${finding.file}:${finding.title}`,
      kind: 'review_finding',
      label: `${finding.file}: ${finding.title}`,
      category: finding.category,
      severity: finding.severity,
    })),
    ...approvals.map((grant, index) => ({
      id: `approval:${index}:${grant.target}`,
      kind: 'approval',
      label: grant.target,
      reason: grant.reason,
      grantedAt: grant.grantedAt,
    })),
    diffNode,
    ...changedFiles,
  ];
  if (verifyWork) {
    nodes.push({
      id: 'verify-work:latest',
      kind: 'verify_work',
      label: 'Latest verify-work run',
      verdict: verifyWork.verdict,
    });
  }
  if (shipReadiness) {
    nodes.push({
      id: 'ship:latest',
      kind: 'ship_readiness',
      label: 'Latest ship-readiness run',
      verdict: shipReadiness.verdict,
      score: shipReadiness.score,
    });
  }
  const edges = [];
  for (const question of questions) {
    for (const assumption of assumptions) {
      if (hasOverlap(question.question, assumption.assumption)) {
        edges.push({
          from: question.id,
          to: assumption.id || `assumption:${assumption.assumption}`,
          relation: 'frames',
        });
      }
    }
  }
  for (const assumption of assumptions) {
    const assumptionId = assumption.id || `assumption:${assumption.assumption}`;
    for (const claim of claims.rows) {
      if (hasOverlap(assumption.assumption, claim.claim)) {
        edges.push({
          from: assumptionId,
          to: claim.id,
          relation: 'supports',
        });
      }
    }
  }
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
    edges.push({
      from: claim.id,
      to: diffNode.id,
      relation: 'tested_against',
    });
  }
  for (const file of changedFiles) {
    edges.push({
      from: file.id,
      to: diffNode.id,
      relation: 'included_in',
    });
    for (const claim of claims.rows) {
      edges.push({
        from: claim.id,
        to: file.id,
        relation: 'touches',
      });
    }
    for (const finding of review.findings) {
      if (finding.file === file.path) {
        edges.push({
          from: file.id,
          to: `review:${review.findings.indexOf(finding)}:${finding.file}:${finding.title}`,
          relation: 'reviewed_as',
        });
      }
    }
  }
  for (const finding of review.findings) {
    const findingId = `review:${review.findings.indexOf(finding)}:${finding.file}:${finding.title}`;
    for (const run of verifyRuns) {
      const relation = run.kind === 'browser' && finding.category === 'frontend ux/a11y'
        ? 'validated_by'
        : run.kind === 'shell'
          ? 'regression_checked_by'
          : null;
      if (relation) {
        edges.push({
          from: findingId,
          to: run.id,
          relation,
        });
      }
    }
    for (const grant of approvals) {
      if (
        finding.category === 'security' && /secret|security/i.test(grant.target)
        || finding.category === 'data/migration' && /migrat/i.test(grant.target)
      ) {
        edges.push({
          from: findingId,
          to: `approval:${approvals.indexOf(grant)}:${grant.target}`,
          relation: 'needs_ack',
        });
      }
    }
    if (verifyWork) {
      edges.push({
        from: findingId,
        to: 'verify-work:latest',
        relation: 'summarized_in',
      });
    }
    if (shipReadiness) {
      edges.push({
        from: findingId,
        to: 'ship:latest',
        relation: 'informs',
      });
    }
  }
  if (verifyWork && shipReadiness) {
    edges.push({
      from: 'verify-work:latest',
      to: 'ship:latest',
      relation: 'gates',
    });
  }
  for (const grant of approvals) {
    if (shipReadiness) {
      edges.push({
        from: `approval:${approvals.indexOf(grant)}:${grant.target}`,
        to: 'ship:latest',
        relation: 'unblocks',
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
