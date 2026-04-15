const path = require('node:path');
const { parseArgs, parseBoolean } = require('./common');
const { detectRepoTruth } = require('./repo_truth');
const { buildApiSurface } = require('./api_surface');
const { buildFrontendProfile, writeFrontendProfileArtifacts } = require('./map_frontend');
const { runRepoAudit } = require('./repo_audit_engine');
const { resolveWorkflowRoot } = require('./common_workflow_paths');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const {
  buildRecommendedNextLanes,
  buildRepoProofVerdict,
  determineCoverage,
  relativePath,
  renderConsoleSummary,
  renderMarkdown,
  renderSummaryMarkdown,
  summarizeApiSurface,
  summarizeAudit,
  summarizeFrontend,
  summarizeRepoTruth,
} = require('./repo_proof_report');
const { contractPayload } = require('./contract_versions');

function printHelp() {
  console.log(`
repo_proof

Usage:
  node scripts/workflow/repo_proof.js

Options:
  --repo <path>       Inspect a local repo snapshot without changing directories
  --goal <text>       Goal text for the audit lane. Defaults to a proof-pack goal
  --stack <name>      Optional stack override such as flutter-firebase
  --refresh <mode>    incremental|full file index refresh. Defaults to incremental
  --write <bool>      Persist proof artifacts. Defaults to false for external snapshots and true for the current repo
  --json              Print machine-readable output
  --markdown          Print the short markdown summary instead of the console summary
  `);
}

function resolveTargetRepo(cwd, requestedRepo) {
  if (!requestedRepo) {
    return cwd;
  }
  return path.resolve(cwd, String(requestedRepo));
}

function buildRepoProof(cwd, options = {}) {
  const targetRepo = resolveTargetRepo(cwd, options.repo);
  const isExternalSnapshot = path.resolve(targetRepo) !== path.resolve(cwd);
  const writeArtifacts = options.write == null
    ? !isExternalSnapshot
    : parseBoolean(options.write, !isExternalSnapshot);
  const refresh = String(options.refresh || 'incremental').trim().toLowerCase() === 'full'
    ? 'full'
    : 'incremental';
  const goal = String(options.goal || 'produce a local proof pack for this repository snapshot').trim();
  const rootDir = resolveWorkflowRoot(targetRepo, options.root);

  const repoTruth = detectRepoTruth(targetRepo);
  const apiSurface = buildApiSurface(targetRepo, {
    refresh,
    writeFiles: writeArtifacts,
  });
  const frontendProfile = buildFrontendProfile(targetRepo, rootDir, {
    scope: 'repo',
    refresh,
    allowMissingWorkflow: true,
  });
  const frontendArtifacts = writeArtifacts
    ? writeFrontendProfileArtifacts(targetRepo, rootDir, frontendProfile, {
        syncValidation: false,
        allowMissingWorkflow: true,
      })
    : null;
  const auditPayload = runRepoAudit(targetRepo, {
    goal,
    stack: options.stack,
    mode: options.mode,
    refresh,
    writeArtifacts,
  });

  const payload = {
    ...contractPayload('repoProof'),
    generatedAt: new Date().toISOString(),
    proofType: 'repo-proof',
    repoRoot: targetRepo,
    repoRelative: relativePath(cwd, targetRepo) || '.',
    invokedFrom: cwd,
    invokedFromRelative: '.',
    externalSnapshot: isExternalSnapshot,
    writeArtifacts,
    coverage: [],
    repoTruth: summarizeRepoTruth(repoTruth),
    apiSurface: summarizeApiSurface(apiSurface),
    frontend: summarizeFrontend(targetRepo, rootDir, frontendProfile, frontendArtifacts),
    audit: summarizeAudit(auditPayload),
    verdict: null,
    artifacts: null,
  };

  payload.coverage = determineCoverage(apiSurface, frontendProfile, auditPayload, repoTruth);
  payload.recommendedNextLanes = buildRecommendedNextLanes(payload.repoRelative, payload);
  payload.verdict = buildRepoProofVerdict(payload);

  if (writeArtifacts) {
    const reportJsonPath = path.join(targetRepo, '.workflow', 'runtime', 'repo-proof', 'latest.json');
    const reportMarkdownPath = path.join(targetRepo, '.workflow', 'runtime', 'repo-proof', 'latest.md');
    const summaryMarkdownPath = path.join(targetRepo, '.workflow', 'runtime', 'repo-proof', 'summary.md');
    payload.artifacts = {
      reportJson: relativePath(targetRepo, reportJsonPath),
      reportMarkdown: relativePath(targetRepo, reportMarkdownPath),
      summaryMarkdown: relativePath(targetRepo, summaryMarkdownPath),
    };
    writeRuntimeJson(targetRepo, 'repo-proof/latest.json', payload);
    writeRuntimeMarkdown(targetRepo, 'repo-proof/latest.md', renderMarkdown(payload));
    writeRuntimeMarkdown(targetRepo, 'repo-proof/summary.md', renderSummaryMarkdown(payload));
  }

  return payload;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const payload = buildRepoProof(process.cwd(), {
    repo: args.repo,
    goal: args.goal,
    stack: args.stack,
    mode: args.mode,
    refresh: args.refresh,
    root: args.root,
    write: args.write,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (args.markdown) {
    console.log(renderSummaryMarkdown(payload));
    return;
  }

  process.stdout.write(renderConsoleSummary(payload));
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
  buildRepoProof,
  main,
  renderMarkdown,
  renderSummaryMarkdown,
  resolveTargetRepo,
};
