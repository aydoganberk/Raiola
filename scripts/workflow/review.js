const { parseArgs, resolveWorkflowRoot } = require('./common');
const { runReviewEngine } = require('./review_engine');
const { buildReviewOrchestration } = require('./review_orchestration');

function printHelp() {
  console.log(`
review

Usage:
  node scripts/workflow/review.js [--mode review|review-mode|pr-review|re-review]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --mode <name>       review|review-mode|pr-review|re-review
  --files <a;b;c>     Limit the review diff to explicit files
  --range <revset>    Review a git range such as HEAD~1..HEAD
  --diff-file <path>  Review a saved diff file
  --staged            Review staged changes
  --heatmap           Print the risk heatmap path
  --blockers          Print the blockers path
  --patch-suggestions Print the patch suggestions path
  --orchestrate       Also generate package/persona/wave-based review orchestration
  --json              Print machine-readable output
  `);
}

function normalizeFileList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = await runReviewEngine(cwd, rootDir, {
    mode: String(args.mode || 'review').trim(),
    files: normalizeFileList(args.files),
    range: args.range ? String(args.range).trim() : '',
    diffFile: args['diff-file'] ? String(args['diff-file']).trim() : '',
    staged: Boolean(args.staged),
  });
  if (args.orchestrate) {
    payload.orchestration = buildReviewOrchestration(cwd, rootDir, payload);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# REVIEW\n');
  console.log(`- Mode: \`${payload.mode}\``);
  console.log(`- Ship readiness: \`${payload.outcome.shipReadiness}\``);
  console.log(`- Confidence: \`${payload.outcome.confidence}\``);
  console.log(`- Findings: \`${payload.findings.length}\``);
  console.log(`- Blockers: \`${payload.blockers.length}\``);
  if (payload.orchestration) {
    console.log(`- Orchestration: \`${payload.orchestration.markdownFile}\``);
  }
  console.log(`- Report: \`${payload.artifacts.markdown}\``);
  if (args.heatmap) {
    console.log(`- Heatmap: \`${payload.artifacts.heatmap}\``);
  }
  if (args.blockers) {
    console.log(`- Blockers file: \`${payload.artifacts.blockers}\``);
  }
  if (args['patch-suggestions']) {
    console.log(`- Patch suggestions: \`${payload.artifacts.patchSuggestions}\``);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
