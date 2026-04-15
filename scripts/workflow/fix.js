const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { runRepoAudit } = require('./repo_audit_engine');
const { buildReviewMode } = require('./review_mode');
const { buildMonorepoMode } = require('./monorepo_mode');
const { latestRepoAuditData, latestReviewData } = require('./trust_os');
const { buildReviewCorrectionControlPlane } = require('./review_correction_control_plane');

function wantsDiffFix(goal) {
  return /\b(diff|patch|pull request|pr\b|staged|changed files|current changes)\b/i.test(String(goal || ''));
}

function wantsRepoFix(goal) {
  return /\b(full repo|whole repo|repo audit|codebase|monorepo|oneshot|one-shot)\b/i.test(String(goal || ''));
}

async function runFixFacade(cwd, rootDir, options = {}) {
  const goal = String(options.goal || 'fix the highest-risk issue').trim();
  const graph = buildPackageGraph(cwd, { writeFiles: true });
  const monorepo = graph.repoShape === 'monorepo' && graph.packageCount > 1;
  const latestAudit = latestRepoAuditData(cwd);
  const latestReview = latestReviewData(cwd);
  const diffScoped = wantsDiffFix(goal) || (latestReview.findings || []).length > 0;
  const repoWide = wantsRepoFix(goal) || (!diffScoped && Boolean(latestAudit.audit));

  let route = monorepo ? 'monorepo-mode' : repoWide ? 'audit-repo' : 'review-mode';
  if (diffScoped && !repoWide) {
    route = 'review-mode';
  }

  let result = null;
  if (route === 'review-mode') {
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
      mode: 'oneshot',
      stack: options.stack || '',
      refresh: options.refresh || 'incremental',
    });
  }

  const correctionPlan = route === 'review-mode'
    ? result.taskGraph?.waves || []
    : result.correctionPlan || result.patchPlan || [];

  const controlPlane = result?.controlPlane || buildReviewCorrectionControlPlane(cwd, {
    goal,
    review: route === 'review-mode' ? result.review || result : null,
    repoAudit: route === 'audit-repo' ? result : result?.repoAudit || null,
    monorepo: route === 'monorepo-mode' ? {
      ...(result.monorepo || {}),
      criticalAreas: result.criticalAreas || [],
    } : null,
    taskGraph: route === 'review-mode' ? result.taskGraph || null : null,
    packageGraph: graph,
    activeLane: route === 'review-mode' ? (monorepo ? 'large-repo-review' : 'diff-review') : route === 'monorepo-mode' ? 'large-repo-review' : 'correction-wave',
  }, {
    promotePlanned: true,
  });

  return {
    generatedAt: new Date().toISOString(),
    facade: 'fix',
    goal,
    route,
    repoShape: graph.repoShape,
    monorepo,
    correctionPlan,
    controlPlane,
    nextCommand: controlPlane?.correctionPlanner?.recommendedNextCommand || `rai verify --goal ${JSON.stringify(`verify ${goal}`)}`,
    result,
  };
}

function printHelp() {
  console.log(`
fix

Usage:
  node scripts/workflow/fix.js --goal "fix the highest-risk issue"

Options:
  --goal <text>         Natural-language correction goal
  --stack <name>        Optional stack override for repo-native audit lanes
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
  const payload = await runFixFacade(cwd, rootDir, {
    goal: String(args.goal || args._.join(' ') || 'fix the highest-risk issue').trim(),
    stack: args.stack ? String(args.stack).trim() : '',
    range: args.range ? String(args.range).trim() : '',
    diffFile: args['diff-file'] ? String(args['diff-file']).trim() : '',
    files: args.files ? String(args.files).split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [],
    staged: Boolean(args.staged),
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

  console.log('# FIX\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Route: \`${payload.route}\``);
  console.log(`- Repo shape: \`${payload.repoShape}\``);
  console.log(`- Next command: \`${payload.nextCommand}\``);
  console.log(`- Correction groups: \`${Array.isArray(payload.correctionPlan) ? payload.correctionPlan.length : 0}\``);
  if (payload.controlPlane?.artifacts?.correctionControlMarkdown) {
    console.log(`- Control plane: \`${payload.controlPlane.artifacts.correctionControlMarkdown}\``);
  }
}

module.exports = {
  main,
  runFixFacade,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
