const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs } = require('./common');
const { analyzeIntent } = require('./intent_engine');
const { runReviewEngine } = require('./review_engine');
const {
  buildDesignDebt,
  buildFrontendProfile,
  buildMissingStateAudit,
  buildTokenDriftAudit,
  collectComponentInventory,
  latestBrowserArtifacts,
} = require('./frontend_os');
const { runVerifyBrowser } = require('./verify_browser');
const { buildIntentRoutingCorpus } = require('../../tests/corpus/intent_routing.corpus');
const { buildReviewDiffCorpus } = require('../../tests/corpus/review_diff.corpus');
const { buildFrontendUiCorpus } = require('../../tests/corpus/frontend_ui.corpus');

const REPO_ROOT = path.join(__dirname, '..', '..');
const BLANK_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'blank-repo');
const THRESHOLDS = Object.freeze({
  intentCorpusMin: 200,
  reviewCorpusMin: 25,
  frontendCorpusMin: 12,
  intentTop1: 0.95,
  intentTop3: 0.99,
  reviewPassRate: 0.9,
  frontendPassRate: 0.9,
});

function printHelp() {
  console.log(`
roadmap_audit

Usage:
  node scripts/workflow/roadmap_audit.js

Options:
  --assert   Exit non-zero when roadmap audit thresholds fail
  --json     Print machine-readable output
  `);
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  fs.cpSync(BLANK_FIXTURE, tempDir, { recursive: true });
  return tempDir;
}

function installWorkflow(targetRepo) {
  run(process.execPath, [path.join(REPO_ROOT, 'bin', 'rai.js'), 'setup', '--target', targetRepo, '--skip-verify'], REPO_ROOT);
}

function openMilestone(targetRepo, goal) {
  run(
    process.execPath,
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M40',
      '--name', 'Audit lane',
      '--goal', goal,
    ],
    targetRepo,
  );
}

function ensureGitIdentity(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'audit@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Audit Runner'], targetRepo);
}

function evaluateIntentCorpus() {
  const repo = makeTempRepo('rai-intent-audit');
  installWorkflow(repo);
  openMilestone(repo, 'Audit workflow routing coverage');
  const rootDir = path.join(repo, 'docs', 'workflow');
  const corpus = buildIntentRoutingCorpus();
  let top1Hits = 0;
  let top3Hits = 0;
  const byLanguage = {};
  const failures = [];

  for (const entry of corpus) {
    const result = analyzeIntent(repo, rootDir, entry.goal, {
      persistSteering: false,
    });
    const candidateIds = result.candidates.map((candidate) => candidate.id);
    const top1 = result.chosenCapability.id === entry.expectedCapability;
    const top3 = candidateIds.slice(0, 3).includes(entry.expectedCapability);
    if (top1) {
      top1Hits += 1;
    }
    if (top3) {
      top3Hits += 1;
    }
    byLanguage[entry.language] = byLanguage[entry.language] || {
      total: 0,
      top1Hits: 0,
      top3Hits: 0,
    };
    byLanguage[entry.language].total += 1;
    if (top1) {
      byLanguage[entry.language].top1Hits += 1;
    }
    if (top3) {
      byLanguage[entry.language].top3Hits += 1;
    }
    if (!top1 && failures.length < 12) {
      failures.push({
        id: entry.id,
        goal: entry.goal,
        expectedCapability: entry.expectedCapability,
        actualCapability: result.chosenCapability.id,
        confidence: result.confidence,
      });
    }
  }

  return {
    total: corpus.length,
    top1Accuracy: Number((top1Hits / corpus.length).toFixed(4)),
    top3Coverage: Number((top3Hits / corpus.length).toFixed(4)),
    byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([language, value]) => [
      language,
      {
        total: value.total,
        top1Accuracy: Number((value.top1Hits / value.total).toFixed(4)),
        top3Coverage: Number((value.top3Hits / value.total).toFixed(4)),
      },
    ])),
    failures,
  };
}

async function evaluateReviewCorpus() {
  const repo = makeTempRepo('rai-review-audit');
  installWorkflow(repo);
  openMilestone(repo, 'Review OS audit scenario');
  const rootDir = path.join(repo, 'docs', 'workflow');
  const corpus = buildReviewDiffCorpus();
  const failures = [];
  let passed = 0;

  for (const scenario of corpus) {
    const payload = await runReviewEngine(repo, rootDir, {
      mode: 'audit',
      diffText: scenario.diffText,
      writeArtifacts: false,
      recordHistory: false,
      includeUiReview: false,
    });
    const findings = payload.findings.map((finding) => finding.category);
    const missingCategories = scenario.expectedCategories.filter((category) => !findings.includes(category));
    const blockerCount = payload.blockers.length;
    const blockerOk = typeof scenario.minBlockers === 'number'
      ? blockerCount >= scenario.minBlockers
      : typeof scenario.maxBlockers === 'number'
        ? blockerCount <= scenario.maxBlockers
        : true;
    if (missingCategories.length === 0 && blockerOk) {
      passed += 1;
      continue;
    }
    if (failures.length < 12) {
      failures.push({
        id: scenario.id,
        missingCategories,
        blockerCount,
        expected: {
          minBlockers: scenario.minBlockers,
          maxBlockers: scenario.maxBlockers,
        },
      });
    }
  }

  return {
    total: corpus.length,
    passRate: Number((passed / corpus.length).toFixed(4)),
    failures,
  };
}

async function evaluateFrontendCorpus() {
  const corpus = buildFrontendUiCorpus();
  const failures = [];
  let passed = 0;

  for (const scenario of corpus) {
    const repo = makeTempRepo(`rai-frontend-${scenario.id}`);
    installWorkflow(repo);
    openMilestone(repo, `Frontend audit ${scenario.title}`);
    ensureGitIdentity(repo);
    scenario.setup(repo);
    const rootDir = path.join(repo, 'docs', 'workflow');
    if (scenario.expectations.browserArtifactsMin) {
      await runVerifyBrowser(repo, { url: './preview.html' });
    }
    const profile = buildFrontendProfile(repo, rootDir, { scope: 'workstream', refresh: 'incremental' });
    const inventory = collectComponentInventory(repo);
    const missingStateAudit = buildMissingStateAudit(repo, inventory);
    const tokenDriftAudit = buildTokenDriftAudit(repo, inventory);
    const browserArtifacts = latestBrowserArtifacts(repo);
    const debt = buildDesignDebt(profile, inventory, browserArtifacts, {
      missingStateAudit,
      tokenDriftAudit,
    });
    const debtAreas = debt.map((item) => item.area);
    const expectations = scenario.expectations;
    const checks = [
      typeof expectations.frontendActive === 'boolean'
        ? profile.frontendMode.active === expectations.frontendActive
        : true,
      expectations.inventoryMin ? inventory.length >= expectations.inventoryMin : true,
      expectations.browserArtifactsMin ? browserArtifacts.length >= expectations.browserArtifactsMin : true,
      expectations.tokenIssuesMin ? tokenDriftAudit.totalIssues >= expectations.tokenIssuesMin : true,
      typeof expectations.tokenIssuesMax === 'number' ? tokenDriftAudit.totalIssues <= expectations.tokenIssuesMax : true,
      (expectations.debtIncludes || []).every((area) => debtAreas.includes(area)),
      (expectations.debtExcludes || []).every((area) => !debtAreas.includes(area)),
      (expectations.missingIncludes || []).every((state) => missingStateAudit.missing.includes(state)),
      (expectations.missingExcludes || []).every((state) => !missingStateAudit.missing.includes(state)),
      (expectations.stylingIncludes || []).every((item) => profile.styling.detected.includes(item)),
      (expectations.uiSystemIncludes || []).every((item) => profile.uiSystem.detected.includes(item)),
    ];
    if (checks.every(Boolean)) {
      passed += 1;
      continue;
    }
    if (failures.length < 12) {
      failures.push({
        id: scenario.id,
        debtAreas,
        missingStates: missingStateAudit.missing,
        tokenIssues: tokenDriftAudit.totalIssues,
        inventory: inventory.length,
        browserArtifacts: browserArtifacts.length,
        styling: profile.styling.detected,
        uiSystem: profile.uiSystem.detected,
      });
    }
  }

  return {
    total: corpus.length,
    passRate: Number((passed / corpus.length).toFixed(4)),
    failures,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const intent = evaluateIntentCorpus();
  const review = await evaluateReviewCorpus();
  const frontend = await evaluateFrontendCorpus();
  const payload = {
    generatedAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    corpora: {
      intent: { total: intent.total },
      review: { total: review.total },
      frontend: { total: frontend.total },
    },
    intent,
    review,
    frontend,
  };
  payload.passed = (
    intent.total >= THRESHOLDS.intentCorpusMin
      && review.total >= THRESHOLDS.reviewCorpusMin
      && frontend.total >= THRESHOLDS.frontendCorpusMin
      && intent.top1Accuracy >= THRESHOLDS.intentTop1
      && intent.top3Coverage >= THRESHOLDS.intentTop3
      && review.passRate >= THRESHOLDS.reviewPassRate
      && frontend.passRate >= THRESHOLDS.frontendPassRate
  );

  const reportsDir = path.join(REPO_ROOT, '.workflow', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, 'roadmap-audit.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
  payload.reportPath = path.relative(REPO_ROOT, reportPath).replace(/\\/g, '/');

  if (args.json) {
    if (args.assert && !payload.passed) {
      process.exitCode = 1;
    }
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# ROADMAP AUDIT\n');
  console.log(`- Report: \`${payload.reportPath}\``);
  console.log(`- Intent corpus: \`${intent.total}\` top-1=\`${intent.top1Accuracy}\` top-3=\`${intent.top3Coverage}\``);
  console.log(`- Review corpus: \`${review.total}\` pass-rate=\`${review.passRate}\``);
  console.log(`- Frontend corpus: \`${frontend.total}\` pass-rate=\`${frontend.passRate}\``);
  console.log(`- Verdict: \`${payload.passed ? 'pass' : 'warn'}\``);

  if (args.assert && !payload.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
