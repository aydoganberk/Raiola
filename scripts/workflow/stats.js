const fs = require('node:fs');
const path = require('node:path');
const {
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { summarizeVerifications, summarizeOrchestration } = require('./runtime_collector');

function printHelp() {
  console.log(`
stats

Usage:
  node scripts/workflow/stats.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --cost            Legacy alias for --spend
  --perf            Focus performance data
  --runtime         Focus orchestration/runtime data
  --quality         Focus verification/evidence/claim quality data
  --spend           Include weighted spend estimates
  --json            Print machine-readable output
  `);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function buildStatsPayload(cwd, rootDir, options = {}) {
  const paths = workflowPaths(rootDir, cwd);
  const preferences = loadPreferences(paths);
  const benchmark = readJsonIfExists(path.join(cwd, '.workflow', 'benchmarks', 'latest.json'));
  const routing = readJsonIfExists(path.join(cwd, '.workflow', 'cache', 'model-routing.json'));
  const verifications = summarizeVerifications(cwd);
  const orchestration = summarizeOrchestration(cwd);
  const evidenceGraph = readJsonIfExists(path.join(cwd, '.workflow', 'evidence-graph', 'latest.json'));
  const mailboxEntries = fs.existsSync(path.join(cwd, '.workflow', 'orchestration', 'runtime', 'mailbox.jsonl'))
    ? fs.readFileSync(path.join(cwd, '.workflow', 'orchestration', 'runtime', 'mailbox.jsonl'), 'utf8').split('\n').filter(Boolean).length
    : 0;
  const timelineEntries = fs.existsSync(path.join(cwd, '.workflow', 'orchestration', 'runtime', 'timeline.jsonl'))
    ? fs.readFileSync(path.join(cwd, '.workflow', 'orchestration', 'runtime', 'timeline.jsonl'), 'utf8').split('\n').filter(Boolean).length
    : 0;
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    benchmark: benchmark ? {
      generatedAt: benchmark.generatedAt,
      results: benchmark.results,
      slo: benchmark.slo,
    } : null,
    routing: routing ? {
      lastRecommendation: routing.lastRecommendation || null,
      historyCount: (routing.history || []).length,
    } : null,
    verifications: {
      shell: {
        total: verifications.shell.total,
        latestVerdict: verifications.shell.latest?.verdict || 'none',
      },
      browser: {
        total: verifications.browser.total,
        latestVerdict: verifications.browser.latest?.verdict || 'none',
      },
    },
    orchestration: {
      active: orchestration.active,
      status: orchestration.status,
      activeWave: orchestration.activeWave,
      adapter: orchestration.adapter?.name || 'none',
      mailboxEntries,
      timelineEntries,
    },
    quality: {
      shellPasses: verifications.shell.verdictCounts.pass || 0,
      shellFails: verifications.shell.verdictCounts.fail || 0,
      browserPasses: verifications.browser.verdictCounts.pass || 0,
      browserFails: verifications.browser.verdictCounts.fail || 0,
      evidenceCoverage: evidenceGraph ? evidenceGraph.coverage : null,
    },
  };

  if (options.cost || options.spend) {
    const presetWeights = { fast: 1, balanced: 2, deep: 4 };
    const latestPreset = routing?.lastRecommendation?.recommendedPreset || 'balanced';
    payload.spend = {
      budgetProfile: preferences.budgetProfile,
      latestPreset,
      tokenBudgets: {
        discuss: preferences.discussBudget,
        plan: preferences.planBudget,
        audit: preferences.auditBudget,
      },
      weightedUnits: (
        preferences.discussBudget
        + preferences.planBudget
        + preferences.auditBudget
      ) * (presetWeights[latestPreset] || 2),
    };
  }

  if (options.perf) {
    payload.perf = payload.benchmark;
  }

  if (options.runtime) {
    payload.runtime = payload.orchestration;
  }

  if (options.quality) {
    payload.qualityFocus = payload.quality;
  }

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
  const payload = buildStatsPayload(cwd, rootDir, {
    cost: Boolean(args.cost),
    spend: Boolean(args.spend),
    perf: Boolean(args.perf),
    runtime: Boolean(args.runtime),
    quality: Boolean(args.quality),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# STATS\n');
  if (payload.benchmark) {
    console.log(`- Benchmark SLO: \`${payload.benchmark.slo.passed ? 'pass' : 'fail'}\``);
  } else {
    console.log('- Benchmark SLO: `no benchmark yet`');
  }
  console.log(`- Shell verify latest: \`${payload.verifications.shell.latestVerdict}\``);
  console.log(`- Browser verify latest: \`${payload.verifications.browser.latestVerdict}\``);
  console.log(`- Team runtime: \`${payload.orchestration.status}\``);
  if (payload.routing?.lastRecommendation) {
    console.log(`- Last route: \`${payload.routing.lastRecommendation.phase}\` -> \`${payload.routing.lastRecommendation.recommendedPreset}\``);
  }
  console.log(`- Evidence coverage: \`${payload.quality.evidenceCoverage ? `${payload.quality.evidenceCoverage.supportedClaims}/${payload.quality.evidenceCoverage.claimCount}` : 'none'}\``);
  console.log(`- Mailbox entries: \`${payload.orchestration.mailboxEntries}\``);
  if (payload.spend) {
    console.log(`- Weighted units: \`${payload.spend.weightedUnits}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildStatsPayload,
};
