const { parseArgs, resolveWorkflowRoot } = require('./common');
const {
  buildShipReadinessPayload,
  buildVerifyWorkPayload,
  latestRepoAuditData,
  latestReviewData,
} = require('./trust_os');

function wantsShipGate(goal) {
  return /\b(ship|release|readiness|ready|go live|launch)\b/i.test(String(goal || ''));
}

function runVerifyFacade(cwd, rootDir, options = {}) {
  const goal = String(options.goal || 'verify the current work').trim();
  const repoAudit = latestRepoAuditData(cwd);
  const review = latestReviewData(cwd);
  const auditOnly = !review.findings.length && Boolean(repoAudit.audit);
  const route = wantsShipGate(goal) || options.ship ? 'ship-readiness' : 'verify-work';
  const baseArgs = {
    ...options,
    mode: auditOnly ? 'audit-only' : (options.mode || ''),
  };
  const result = route === 'ship-readiness'
    ? buildShipReadinessPayload(cwd, rootDir, baseArgs)
    : buildVerifyWorkPayload(cwd, rootDir, baseArgs);

  return {
    generatedAt: new Date().toISOString(),
    facade: 'verify',
    goal,
    route,
    trustMode: result.trustMode,
    nextCommand: route === 'ship-readiness' ? '' : `rai verify --goal ${JSON.stringify(`ship readiness for ${goal}`)} --ship`,
    result,
  };
}

function printHelp() {
  console.log(`
verify

Usage:
  node scripts/workflow/verify.js --goal "verify the current work"

Options:
  --goal <text>       Natural-language verification goal
  --checks <a;b;c>    Semicolon-separated manual checks
  --status <value>    auto|pass|warn|fail for manual override
  --mode <value>      auto|review|audit-only
  --ship              Force the facade into ship-readiness mode
  --json              Print machine-readable output
  `);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = runVerifyFacade(cwd, rootDir, {
    goal: String(args.goal || args._.join(' ') || 'verify the current work').trim(),
    checks: args.checks,
    status: args.status,
    mode: args.mode,
    ship: Boolean(args.ship),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# VERIFY\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Route: \`${payload.route}\``);
  console.log(`- Trust mode: \`${payload.trustMode}\``);
  console.log(`- Verdict: \`${payload.result.verdict}\``);
  if (payload.nextCommand) {
    console.log(`- Next command: \`${payload.nextCommand}\``);
  }
}

module.exports = {
  main,
  runVerifyFacade,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
