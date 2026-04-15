const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { runRepoAudit } = require('./repo_audit_engine');
const { buildReviewMode } = require('./review_mode');
const { buildMonorepoMode } = require('./monorepo_mode');
const { buildUiReview } = require('./ui_review');

function wantsRepoWideAudit(goal) {
  return /\b(full repo|whole repo|entire repo|repo[- ]wide|full codebase|oneshot|one-shot|repo audit|audit the repo|audit this repo|codebase audit|monorepo)\b/i.test(String(goal || ''));
}

function wantsDiffReview(goal) {
  return /\b(diff|patch|pull request|pr\b|staged|changed files|current changes|review this change|review the diff)\b/i.test(String(goal || ''));
}

function wantsFrontendAudit(goal) {
  return /\b(frontend|ui|ux|screen|page|component|design|accessibility|responsive)\b/i.test(String(goal || ''));
}

async function runAuditFacade(cwd, rootDir, options = {}) {
  const goal = String(options.goal || 'audit this repo').trim();
  const graph = buildPackageGraph(cwd, { writeFiles: true });
  const monorepo = graph.repoShape === 'monorepo' && graph.packageCount > 1;
  const repoWide = wantsRepoWideAudit(goal);
  const frontend = wantsFrontendAudit(goal);
  const diffReview = wantsDiffReview(goal) && !repoWide;

  let route = 'audit-repo';
  if (frontend && !repoWide && !monorepo) {
    route = 'ui-review';
  } else if (diffReview) {
    route = 'review-mode';
  } else if (monorepo) {
    route = 'monorepo-mode';
  }

  let result = null;
  if (route === 'ui-review') {
    result = await buildUiReview(cwd, rootDir, {
      goal,
      url: options.url,
      taste: options.taste,
    });
  } else if (route === 'review-mode') {
    result = await buildReviewMode(cwd, rootDir, {
      goal,
      files: options.files || [],
      range: options.range || '',
      diffFile: options.diffFile || '',
      staged: Boolean(options.staged),
      maxWorkers: Number(options.maxWorkers || 4),
      taste: options.taste || '',
    });
  } else if (route === 'monorepo-mode') {
    result = buildMonorepoMode(cwd, rootDir, {
      goal,
      phase: 'full',
      subsystem: options.subsystem || '',
      stack: options.stack || '',
      'skip-audit-prepass': Boolean(options.skipAuditPrepass),
      maxWorkers: Number(options.maxWorkers || 4),
      skipAgents: Boolean(options.skipAgents),
    });
  } else {
    result = runRepoAudit(cwd, {
      goal,
      mode: options.mode || 'oneshot',
      stack: options.stack || '',
      refresh: options.refresh || 'incremental',
    });
  }

  const nextCommand = route === 'ui-review'
    ? `rai verify --goal ${JSON.stringify(`verify ${goal}`)}`
    : result?.controlPlane?.correctionBoard?.recommendedStarterCommand
      || result?.controlPlane?.correctionPlanner?.recommendedNextCommand
      || `rai fix --goal ${JSON.stringify(goal)}`;

  return {
    generatedAt: new Date().toISOString(),
    facade: 'audit',
    goal,
    route,
    repoShape: graph.repoShape,
    packageCount: graph.packageCount,
    monorepo,
    nextCommand,
    result,
  };
}

function printHelp() {
  console.log(`
audit

Usage:
  node scripts/workflow/audit.js --goal "audit this repo"

Options:
  --goal <text>         Natural-language audit goal
  --mode <name>         oneshot|focused for repo-native audit
  --stack <name>        Optional stack override such as next-react or flutter-firebase
  --range <revset>      Optional diff range when the facade resolves into review-mode
  --diff-file <path>    Optional diff file when the facade resolves into review-mode
  --files <a;b;c>       Optional explicit files when the facade resolves into review-mode
  --staged              Review staged changes when the facade resolves into review-mode
  --json                Print machine-readable output
  `);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = await runAuditFacade(cwd, rootDir, {
    goal: String(args.goal || args._.join(' ') || 'audit this repo').trim(),
    mode: args.mode ? String(args.mode).trim() : 'oneshot',
    stack: args.stack ? String(args.stack).trim() : '',
    range: args.range ? String(args.range).trim() : '',
    diffFile: args['diff-file'] ? String(args['diff-file']).trim() : '',
    files: args.files ? String(args.files).split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [],
    staged: Boolean(args.staged),
    url: args.url ? String(args.url).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
    subsystem: args.subsystem ? String(args.subsystem).trim() : '',
    skipAuditPrepass: Boolean(args['skip-audit-prepass']),
    maxWorkers: Number(args['max-workers'] || 4),
    skipAgents: Boolean(args['skip-agents']),
    refresh: args.refresh ? String(args.refresh).trim() : 'incremental',
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# AUDIT\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Route: \`${payload.route}\``);
  console.log(`- Repo shape: \`${payload.repoShape}\``);
  console.log(`- Next command: \`${payload.nextCommand}\``);
}

module.exports = {
  main,
  runAuditFacade,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
