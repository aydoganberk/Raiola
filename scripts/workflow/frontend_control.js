const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const {
  buildAccessibilityAudit,
  buildDesignDebt,
  buildJourneyAudit,
  buildMissingStateAudit,
  buildPrimitiveContractAudit,
  buildPrimitiveOpportunityAudit,
  buildResponsiveMatrix,
  buildScorecard,
  buildSemanticAudit,
  buildTokenDriftAudit,
  collectComponentInventory,
  latestBrowserArtifacts,
} = require('./frontend_os');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { compactList, writePlaneArtifacts } = require('./control_planes_common');
const { contractPayload } = require('./contract_versions');

function buildFrontendSummary(profile, inventory = []) {
  const routeCount = Number(profile?.surfaceInventory?.routeCount || 0);
  const routeFamilies = Number(profile?.surfaceInventory?.routeFamilyCount || 0);
  const sharedComponents = Number(profile?.surfaceInventory?.sharedComponentCount || 0);
  const localComponents = Number(profile?.surfaceInventory?.localComponentCount || 0);
  const componentCount = sharedComponents + localComponents || inventory.length;
  const detected = Boolean(
    profile?.frontendMode?.active
      || routeCount > 0
      || componentCount > 0
      || (profile?.framework?.primary && profile.framework.primary !== 'Custom')
      || (profile?.uiSystem?.primary && profile.uiSystem.primary !== 'custom')
      || profile?.fileSignals?.componentsJson
  );
  return {
    detected,
    active: Boolean(profile?.frontendMode?.active),
    framework: profile?.framework?.primary || 'unknown',
    routing: profile?.routing?.label || profile?.routing?.primary || 'unknown',
    uiSystem: profile?.uiSystem?.primary || 'unknown',
    styling: (profile?.styling?.detected || []).slice(0, 6),
    productSurface: profile?.productSurface?.label || profile?.productSurface?.id || 'unknown',
    interactionModel: profile?.interactionModel?.label || profile?.interactionModel?.primary || 'unknown',
    routeCount,
    routeFamilies,
    sharedComponents,
    localComponents,
    componentCount,
    sampleRoutes: (profile?.surfaceInventory?.sampleRoutes || []).slice(0, 8),
    sampleSharedComponents: (profile?.surfaceInventory?.sampleSharedComponents || []).slice(0, 8),
    figmaPresent: Boolean(profile?.figma?.present),
    storybook: Boolean(profile?.stack?.presence?.storybook),
    playwright: Boolean(profile?.stack?.presence?.playwright),
    fileSignals: profile?.fileSignals || {},
  };
}

function debtSummary(items = []) {
  return {
    total: items.length,
    high: items.filter((item) => item.severity === 'high').length,
    medium: items.filter((item) => item.severity === 'medium').length,
    low: items.filter((item) => item.severity === 'low').length,
    items: items.slice(0, 12),
  };
}

function browserSummary(browserArtifacts = []) {
  return {
    artifactCount: browserArtifacts.length,
    latest: browserArtifacts.slice(0, 6).map((entry) => ({
      path: entry.path,
      visualVerdict: entry.meta?.visualVerdict || 'unknown',
      summary: entry.meta?.summary || null,
      accessibilityVerdict: entry.meta?.accessibility?.verdict || null,
      journeySignals: entry.meta?.journey?.signals || {},
    })),
  };
}

function buildVerdict(frontend, audits, debt, browserArtifacts) {
  if (!frontend.detected) {
    return 'frontend-not-detected';
  }
  if (
    audits.semanticAudit.verdict === 'fail'
    || audits.accessibilityAudit.verdict === 'fail'
    || audits.journeyAudit.coverage === 'incomplete'
    || debt.high > 0
    || browserArtifacts.length === 0
  ) {
    return 'attention-required';
  }
  if (
    audits.semanticAudit.verdict !== 'pass'
    || audits.accessibilityAudit.verdict === 'warn'
    || audits.journeyAudit.coverage === 'warn'
    || audits.missingStateAudit.missing.length > 0
    || debt.total > 0
  ) {
    return 'guided';
  }
  return 'ready';
}

function buildTopSignals(audits, debt) {
  return compactList([
    audits.accessibilityAudit.verdict !== 'pass' ? audits.accessibilityAudit.guidance : null,
    audits.journeyAudit.coverage !== 'pass' ? audits.journeyAudit.guidance : null,
    audits.semanticAudit.verdict !== 'pass' ? audits.semanticAudit.guidance : null,
    audits.missingStateAudit.missing.length > 0 ? `Missing states: ${audits.missingStateAudit.missing.join(', ')}` : null,
    debt.items[0]?.detail || null,
  ], 8);
}

function buildNextActions(payload) {
  const actions = [];
  const push = (priority, title, command, reason) => {
    if (!command || actions.some((item) => item.command === command)) {
      return;
    }
    actions.push({ priority, title, command, reason });
  };

  if (!payload.frontend.detected) {
    push(
      'medium',
      'Open repo control instead',
      'rai repo-control --json',
      'No clear frontend surface was detected, so the broader repo control room is the safer first operator surface.',
    );
    return actions;
  }

  if (payload.browserEvidence.artifactCount === 0) {
    push(
      'high',
      'Capture browser proof',
      'rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json',
      'Frontend control is strongest when visual, accessibility, and journey evidence comes from real browser artifacts.',
    );
  }
  if (payload.audits.missingStateAudit.missing.length > 0) {
    push(
      'high',
      'Map the missing UI states',
      'rai state-atlas --json',
      `State coverage is missing for: ${payload.audits.missingStateAudit.missing.join(', ')}.`,
    );
  }
  if (payload.audits.semanticAudit.verdict !== 'pass' || payload.audits.accessibilityAudit.verdict !== 'pass') {
    push(
      'high',
      'Run the frontend review pass',
      'rai ui-review --json',
      'Semantic or accessibility issues are present, so the frontend review scorecard should become the next bounded lane.',
    );
  }
  if (payload.designDebt.high > 0 || payload.frontend.sharedComponents < 3) {
    push(
      'medium',
      'Inspect component reuse and debt',
      'rai component-map --json',
      'Shared UI primitives are thin or debt-heavy, so the component inventory should be made explicit before more frontend polish.',
    );
  }
  if (payload.frontend.routeCount > 0) {
    push(
      'medium',
      'Refresh the responsive audit matrix',
      'rai responsive-matrix --json',
      'Route-bearing web surfaces should keep breakpoints and screenshot expectations visible.',
    );
  }
  if (payload.audits.primitiveOpportunities.opportunities.length > 0) {
    push(
      'medium',
      'Normalize repeated UI primitives',
      'rai design-debt --json',
      'Repeated primitive opportunities suggest the design debt ledger should be reviewed before page-local patterns spread.',
    );
  }
  push(
    'medium',
    'Generate the Codex frontend operator packet',
    `rai codex operator --goal ${JSON.stringify(`tighten the ${payload.frontend.productSurface} frontend with explicit evidence, state coverage, and reuse discipline`)} --json`,
    'Frontend control becomes much easier to execute when Codex starts from the design debt, state gaps, and browser evidence summary.',
  );
  push(
    'low',
    'Materialize a runnable Codex cockpit',
    `rai codex cockpit --goal ${JSON.stringify('stabilize the frontend-control follow-through for this repo')} --json`,
    'Use the cockpit when the frontend control session should be relaunchable across multiple review or polish passes.',
  );
  return actions.slice(0, 8);
}

function buildRemedies(payload) {
  const remedies = [];
  const push = (id, priority, title, command, successSignal, reason) => {
    if (!command || remedies.some((item) => item.id === id || item.command === command)) {
      return;
    }
    remedies.push({ id, priority, title, command, successSignal, reason });
  };

  if (!payload.frontend.detected) {
    push(
      'repo-control',
      'medium',
      'Fallback to repo control',
      'rai repo-control --json',
      'A repo-wide control payload is available with a non-frontend verdict.',
      'Frontend-specific remediation only makes sense once a product surface is positively detected.',
    );
    return remedies;
  }

  if (payload.browserEvidence.artifactCount === 0) {
    push(
      'browser-proof',
      'high',
      'Capture browser runtime proof',
      'rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json',
      'verify-browser reports proofStatus=verified and stores screenshot plus accessibility artifacts.',
      'The current control-room verdict is carrying UI assumptions without real browser evidence.',
    );
  }
  if (payload.audits.journeyAudit.coverage !== 'pass') {
    push(
      'journey-proof',
      'high',
      'Run a short browser control loop',
      'rai verify-browser --adapter auto --watch --iterations 3 --url http://localhost:3000 --json',
      'At least one browser-control iteration completes with stable or explicitly changed evidence.',
      'A control loop makes regressions and incomplete UI journeys visible instead of leaving the verdict at attention-required.',
    );
  }
  if (payload.audits.semanticAudit.verdict !== 'pass' || payload.audits.accessibilityAudit.verdict !== 'pass') {
    push(
      'ui-review',
      'high',
      'Open the UI review lane',
      'rai ui-review --json',
      'Semantic and accessibility issues are converted into a bounded review scoreboard.',
      'The remedy for semantic/a11y risk should be explicit, not just implied by a red verdict.',
    );
  }
  if (payload.audits.missingStateAudit.missing.length > 0) {
    push(
      'state-atlas',
      'high',
      'Map missing states before patching UI',
      'rai state-atlas --json',
      'The state-atlas output lists owned loading, empty, error, and success surfaces.',
      `Missing states remain open for: ${payload.audits.missingStateAudit.missing.join(', ')}.`,
    );
  }
  if (payload.designDebt.high > 0 || payload.audits.primitiveOpportunities.opportunities.length > 0) {
    push(
      'design-debt',
      'medium',
      'Normalize component debt and repeated primitives',
      'rai design-debt --json',
      'The design debt ledger names the repeated primitives and high-severity debt hotspots.',
      'Attention-required should point to a reusable primitive/debt lane when the surface is fragmenting.',
    );
  }
  if (payload.frontend.routeCount > 0) {
    push(
      'responsive-matrix',
      'medium',
      'Refresh the responsive matrix',
      'rai responsive-matrix --json',
      'Responsive expectations are materialized for the current route-bearing surface.',
      'Route-heavy surfaces need a concrete breakpoint audit lane, not only a generic frontend verdict.',
    );
  }

  return remedies.slice(0, 6);
}

function renderFrontendControlMarkdown(payload) {
  return `# FRONTEND CONTROL ROOM

- Verdict: \`${payload.verdict}\`
- Frontend detected: \`${payload.frontend.detected ? 'yes' : 'no'}\`
- Framework: \`${payload.frontend.framework}\`
- Routing: \`${payload.frontend.routing}\`
- UI system: \`${payload.frontend.uiSystem}\`
- Product surface: \`${payload.frontend.productSurface}\`
- Routes: \`${payload.frontend.routeCount}\`
- Shared components: \`${payload.frontend.sharedComponents}\`
- Browser artifacts: \`${payload.browserEvidence.artifactCount}\`
- Overall score: \`${payload.scorecard.overall}/5\`

## Surface Inventory

- Sample routes: \`${payload.frontend.sampleRoutes.join(', ') || 'none'}\`
- Shared components: \`${payload.frontend.sampleSharedComponents.join(', ') || 'none'}\`
- Styling: \`${payload.frontend.styling.join(', ') || 'none'}\`
- Playwright: \`${payload.frontend.playwright ? 'yes' : 'no'}\`
- Storybook: \`${payload.frontend.storybook ? 'yes' : 'no'}\`

## Audits

- Semantic: \`${payload.audits.semanticAudit.verdict}\` (${payload.audits.semanticAudit.issueCount} issues)
- Accessibility: \`${payload.audits.accessibilityAudit.verdict}\` (${payload.audits.accessibilityAudit.issueCount} issues)
- Journey: \`${payload.audits.journeyAudit.coverage}\`
- Missing states: \`${payload.audits.missingStateAudit.missing.join(', ') || 'none'}\`
- Token drift: \`${payload.audits.tokenDriftAudit.totalIssues}\`
- Primitive contracts: \`${payload.audits.primitiveContractAudit.issueCount}\`

## Design Debt

${payload.designDebt.items.length > 0
    ? payload.designDebt.items.map((item) => `- [${item.severity}] \`${item.area}\` ${item.detail}`).join('\n')
    : '- `No material design debt signals were detected.`'}

## Browser Evidence

${payload.browserEvidence.latest.length > 0
    ? payload.browserEvidence.latest.map((entry) => `- \`${entry.path}\` -> visual=${entry.visualVerdict}${entry.accessibilityVerdict ? ` accessibility=${entry.accessibilityVerdict}` : ''}${entry.summary ? ` :: ${entry.summary}` : ''}`).join('\n')
    : '- `No browser artifact captured yet.`'}

## Top Signals

${payload.topSignals.length > 0
    ? payload.topSignals.map((item) => `- ${item}`).join('\n')
    : '- `No blocking frontend signal is open.`'}

## Remedy Lane

${payload.remedies.length > 0
    ? payload.remedies.map((item) => `- [${item.priority}] ${item.title} -> \`${item.command}\`\n  - success: ${item.successSignal}\n  - why: ${item.reason}`).join('\n')
    : '- `No remedy lane is queued.`'}

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')
    : '- `No follow-up action is queued.`'}

## Codex Native Layer

- Operator: \`${payload.codex.operatorCommand}\`
- Cockpit: \`${payload.codex.cockpitCommand}\`
- Skills: \`${payload.codex.skills.join(', ')}\`
`;
}

function buildFrontendControlPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, {
    refresh: Boolean(options.refresh),
    write: Boolean(options.refresh),
    writeIfMissing: true,
  });
  const profile = buildFrontendProfile(cwd, rootDir, {
    scope: 'repo',
    refresh: options.refresh ? 'full' : 'incremental',
  });
  const inventory = collectComponentInventory(cwd);
  const browserArtifacts = latestBrowserArtifacts(cwd);
  const frontend = buildFrontendSummary(profile, inventory);
  const responsiveMatrix = buildResponsiveMatrix(profile, inventory);
  const missingStateAudit = buildMissingStateAudit(cwd, inventory);
  const tokenDriftAudit = buildTokenDriftAudit(cwd, inventory);
  const semanticAudit = buildSemanticAudit(cwd, inventory);
  const accessibilityAudit = buildAccessibilityAudit(profile, browserArtifacts);
  const journeyAudit = buildJourneyAudit(profile, browserArtifacts, inventory);
  const primitiveContractAudit = buildPrimitiveContractAudit(cwd, profile, inventory);
  const primitiveOpportunities = buildPrimitiveOpportunityAudit(cwd, profile, inventory);
  const debtItems = frontend.detected
    ? buildDesignDebt(profile, inventory, browserArtifacts, {
      missingStateAudit,
      tokenDriftAudit,
      semanticAudit,
      accessibilityAudit,
      journeyAudit,
      primitiveContractAudit,
      primitiveOpportunities: primitiveOpportunities.opportunities,
    })
    : [];
  const designDebt = debtSummary(debtItems);
  const scorecard = frontend.detected
    ? buildScorecard(profile, inventory, debtItems, browserArtifacts, {
      semanticAudit,
      accessibilityAudit,
      journeyAudit,
    })
    : {
      visualConsistency: 0,
      interactionClarity: 0,
      responsiveCorrectness: 0,
      accessibility: 0,
      componentHygiene: 0,
      copyConsistency: 0,
      overall: 0,
    };

  const audits = {
    missingStateAudit,
    tokenDriftAudit,
    semanticAudit,
    accessibilityAudit,
    journeyAudit,
    primitiveContractAudit,
    primitiveOpportunities,
  };

  const payload = {
    ...contractPayload('frontendControl'),
    generatedAt: new Date().toISOString(),
    action: 'frontend-control',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    verdict: 'frontend-not-detected',
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    frontend,
    responsiveMatrix,
    inventory: {
      count: inventory.length,
      items: inventory.slice(0, 20),
    },
    browserEvidence: browserSummary(browserArtifacts),
    audits,
    designDebt,
    scorecard,
    topSignals: [],
    commands: {
      verifyBrowser: 'rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json',
      uiReview: 'rai ui-review --json',
      stateAtlas: 'rai state-atlas --json',
      componentMap: 'rai component-map --json',
      responsiveMatrix: 'rai responsive-matrix --json',
      repoControl: 'rai repo-control --json',
      codexOperator: 'rai codex operator --goal "tighten the frontend with explicit evidence and state coverage" --json',
      codexCockpit: 'rai codex cockpit --goal "stabilize the frontend-control follow-through" --json',
    },
    nextActions: [],
    remedies: [],
    remedySummary: null,
    codex: {
      suggestedGoal: `tighten the ${frontend.productSurface} frontend with explicit evidence, state coverage, and reuse discipline`,
      operatorCommand: `rai codex operator --goal ${JSON.stringify(`tighten the ${frontend.productSurface} frontend with explicit evidence, state coverage, and reuse discipline`)} --json`,
      cockpitCommand: `rai codex cockpit --goal ${JSON.stringify('stabilize the frontend-control follow-through for this repo')} --json`,
      telemetryCommand: 'rai codex telemetry --json',
      skills: ['raiola-frontend-control-room', 'raiola-native-operator', 'raiola-codex-cockpit'],
    },
    artifacts: null,
  };
  payload.verdict = buildVerdict(frontend, audits, designDebt, browserArtifacts);
  payload.topSignals = buildTopSignals(audits, designDebt);
  payload.nextActions = buildNextActions(payload);
  payload.remedies = buildRemedies(payload);
  payload.remedySummary = {
    attentionRequired: payload.verdict === 'attention-required',
    primary: payload.remedies[0] || null,
    count: payload.remedies.length,
  };
  payload.artifacts = writePlaneArtifacts(cwd, 'frontend-control-room', payload, renderFrontendControlMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
frontend_control

Usage:
  node scripts/workflow/frontend_control.js [--refresh] [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --refresh           Recompute the frontend summary and audits before rendering
  --json              Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildFrontendControlPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# FRONTEND CONTROL ROOM\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Framework: \`${payload.frontend.framework}\``);
  console.log(`- Routes: \`${payload.frontend.routeCount}\``);
  console.log(`- Browser artifacts: \`${payload.browserEvidence.artifactCount}\``);
  if (payload.remedySummary?.primary) {
    console.log(`- Primary remedy: \`${payload.remedySummary.primary.command}\``);
  }
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
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
  buildFrontendControlPayload,
};
