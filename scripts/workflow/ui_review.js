const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { runVerifyBrowser } = require('./verify_browser');
const {
  buildDesignDebt,
  buildFrontendProfile,
  buildMissingStateAudit,
  buildResponsiveMatrix,
  buildScorecard,
  buildTokenDriftAudit,
  collectComponentInventory,
  latestBrowserArtifacts,
  relativePath,
  writeDoc,
} = require('./frontend_os');

async function buildUiReview(cwd, rootDir, args = {}) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const responsiveMatrix = buildResponsiveMatrix(profile, inventory);

  if (args.url) {
    await runVerifyBrowser(cwd, {
      url: String(args.url).trim(),
      adapter: args.adapter,
      assert: args.assert,
      screenshotOnly: false,
    });
  }

  const browserArtifacts = latestBrowserArtifacts(cwd);
  const missingStateAudit = buildMissingStateAudit(cwd, inventory);
  const tokenDriftAudit = buildTokenDriftAudit(cwd, inventory);
  const debt = buildDesignDebt(profile, inventory, browserArtifacts, {
    missingStateAudit,
    tokenDriftAudit,
  });
  const scorecard = buildScorecard(profile, inventory, debt, browserArtifacts);
  const body = `
- Frontend mode: \`${profile.frontendMode.status}\`
- Browser artifacts: \`${browserArtifacts.length}\`
- Overall score: \`${scorecard.overall}/5\`

## Scorecard

- \`visual consistency\` ${scorecard.visualConsistency}/5
- \`interaction clarity\` ${scorecard.interactionClarity}/5
- \`responsive correctness\` ${scorecard.responsiveCorrectness}/5
- \`accessibility\` ${scorecard.accessibility}/5
- \`component hygiene\` ${scorecard.componentHygiene}/5
- \`copy consistency\` ${scorecard.copyConsistency}/5

## Responsive Audit

${responsiveMatrix.map((row) => `- \`${row.viewport} ${row.width}\` -> ${row.expectation}`).join('\n')}

## Component Reuse

${inventory.length > 0 ? inventory.slice(0, 12).map((item) => `- \`${item.name}\` -> ${item.shared ? 'shared' : 'local'}`).join('\n') : '- `No component inventory detected.`'}

## Design Debt

${debt.length > 0 ? debt.map((item) => `- [${item.severity}] \`${item.area}\` ${item.detail}`).join('\n') : '- `No material design debt signals were detected.`'}

## Missing States

${missingStateAudit.missing.length > 0
    ? `- Missing coverage: \`${missingStateAudit.missing.join(', ')}\``
    : '- `Core loading/empty/error/success/disabled/interaction states were detected in the UI surface.`'}

## Token Drift

${tokenDriftAudit.totalIssues > 0
    ? tokenDriftAudit.issues.slice(0, 8).map((issue) => `- [${issue.severity}] \`${issue.kind}\` ${issue.file} -> ${issue.detail}`).join('\n')
    : '- `No obvious token drift signals were detected in the scanned UI files.`'}

## Browser Evidence

${browserArtifacts.length > 0
    ? browserArtifacts.slice(0, 6).map((entry) => `- \`${entry.path}\` -> ${entry.meta?.visualVerdict || 'unknown'} (${entry.meta?.summary || 'no summary'})`).join('\n')
    : '- `No browser artifact captured yet.`'}
`;

  const filePath = writeDoc(path.join(rootDir, 'UI-REVIEW.md'), 'UI REVIEW', body);
  const payload = {
    file: relativePath(cwd, filePath),
    scorecard,
    browserArtifacts,
    debt,
    missingStateAudit,
    tokenDriftAudit,
  };
  return payload;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = await buildUiReview(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# UI REVIEW\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Overall score: \`${payload.scorecard.overall}/5\``);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildUiReview,
};
