const path = require('node:path');
const {
  parseArgs,
  resolveWorkflowRoot,
  tryExtractSection,
} = require('./common');
const { readTextIfExists: readIfExists } = require('./io/files');
const {
  buildAccessibilityAudit,
  buildFrontendProfile,
  buildJourneyAudit,
  buildMissingStateAudit,
  buildPrimitiveContractAudit,
  buildPrimitiveOpportunityAudit,
  buildResponsiveMatrix,
  buildSemanticAudit,
  buildTokenDriftAudit,
  collectComponentInventory,
  latestBrowserArtifacts,
  relativePath,
  writeDoc,
} = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');
const { buildUiDirection } = require('./design_intelligence');
const { buildDesignDnaDoc, buildStateAtlasDoc } = require('./design_contracts');
const { buildDesignMdDoc, buildPageBlueprintDoc } = require('./frontend_briefs');
const { buildComponentStrategyDoc, buildDesignBenchmarkDoc } = require('./frontend_strategy');

function printHelp() {
  console.log(`
ui_spec

Usage:
  node scripts/workflow/ui_spec.js

Options:
  --goal <text>  Optional product/UI goal to steer the brief
  --taste <id>   Optional explicit taste profile override
  --page <id>    Optional explicit page type override for downstream briefs
  --root <path>  Workflow root. Defaults to active workstream root
  --json         Print machine-readable output
  `);
}

function buildUiSpec(cwd, rootDir, options = {}) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const direction = buildUiDirection(cwd, rootDir, options);
  const inventory = collectComponentInventory(cwd);
  const matrix = buildResponsiveMatrix(profile, inventory);
  const missingStateAudit = buildMissingStateAudit(cwd, inventory);
  const tokenDriftAudit = buildTokenDriftAudit(cwd, inventory);
  const semanticAudit = buildSemanticAudit(cwd, inventory);
  const browserArtifacts = latestBrowserArtifacts(cwd);
  const accessibilityAudit = buildAccessibilityAudit(profile, browserArtifacts);
  const journeyAudit = buildJourneyAudit(profile, browserArtifacts, inventory);
  const primitiveContractAudit = buildPrimitiveContractAudit(cwd, profile, inventory);
  const primitiveOpportunities = buildPrimitiveOpportunityAudit(cwd, profile, inventory);
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  const userIntent = tryExtractSection(contextDoc, 'User Intent', '').trim() || 'No explicit UI intent note was recorded.';
  const touchedFiles = tryExtractSection(contextDoc, 'Touched Files', '').trim();
  const designDna = buildDesignDnaDoc(cwd, rootDir, direction, options);
  const stateAtlas = buildStateAtlasDoc(cwd, rootDir, direction, designDna, options);
  const pageBlueprint = buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, options);
  const designMd = buildDesignMdDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options);
  const componentStrategy = buildComponentStrategyDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint);
  const designBenchmark = buildDesignBenchmarkDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy);

  const body = `
- Workflow root: \`${relativePath(cwd, rootDir)}\`
- Framework: \`${profile.framework.primary}\`
- UI system: \`${profile.uiSystem.primary}\`
- Frontend mode: \`${profile.frontendMode.status}\`
- UI direction: \`${direction.file}\`
- Design DNA: \`${designDna.file}\`
- State atlas: \`${stateAtlas.file}\`
- Page blueprint: \`${pageBlueprint.file}\`
- DESIGN.md export: \`${designMd.file}\`
- Component strategy: \`${componentStrategy.file}\`
- Design benchmark: \`${designBenchmark.file}\`
- Taste profile: \`${direction.taste.profile.label}\`
- Taste signature: \`${direction.taste.tagline}\`

## Information Architecture

- \`Product archetype: ${direction.archetype.label}\`
- \`Primary UI surface depends on ${profile.framework.primary} with ${profile.uiSystem.primary} as the main UI system.\`
- \`Touched files context: ${touchedFiles || 'No touched files recorded yet.'}\`

## Design Direction

- \`${direction.archetype.summary}\`
- \`Visual tone: ${direction.taste.visualTone}\`
- \`Hierarchy: ${direction.taste.hierarchy}\`
- \`Motion: ${direction.taste.motion}\`
- \`Taste profile source: ${direction.taste.profile.source}\`
- \`Codex should respect the UI direction document before improvising new aesthetics.\`

## External Design DNA

- \`Product category: ${designDna.productCategory.label}\`
- \`Reference blend: ${designDna.blend.summary}\`
- \`North star: ${designDna.northStar.promise}\`
${designDna.references.map((item) => `- \`${item.label}\` -> ${item.signature}`).join('\n')}
${designDna.codexRules.map((item) => `- \`Rule: ${item}\``).join('\n')}
${designDna.antiPatterns.slice(0, 6).map((item) => `- \`Ban: ${item}\``).join('\n')}

## Experience Thesis

- \`${direction.experienceThesis.title}\`
- \`${direction.experienceThesis.thesis}\`
- \`${direction.experienceThesis.signature}\`

## Signature Moments

${direction.signatureMoments.map((item) => `- \`${item.title}: ${item.description}\``).join('\n')}

## Page Blueprint

- \`Page type: ${pageBlueprint.pageType.label}\`
- \`Primary outcome: ${pageBlueprint.primaryOutcome}\`
${pageBlueprint.sections.map((item) => `- \`${item.title}\` -> ${item.goal} | states: ${item.states.join(', ')}`).join('\n')}

## Component Strategy

${componentStrategy.reuseNow.length > 0
    ? componentStrategy.reuseNow.map((item) => `- \`Reuse ${item.title}\` -> ${item.reason}`).join('\n')
    : '- `No obvious shared reuse candidate was detected yet.`'}
${componentStrategy.buildNow.length > 0
    ? componentStrategy.buildNow.map((item) => `- \`${item.title}\` -> ${item.target}`).join('\n')
    : '- `Current inventory already covers the page blueprint well.`'}

## Design Benchmark

${designBenchmark.differentiationPlays.map((item) => `- \`${item.title}\` -> ${item.move}`).join('\n')}
${designBenchmark.commodityRisks.slice(0, 4).map((item) => `- \`Avoid: ${item}\``).join('\n')}

## Screen Blueprints

${direction.screenBlueprints.map((item) => `- \`${item.title}: ${item.recipe}\``).join('\n')}

## Native-First Decisions

${direction.nativeFirstRecommendations.map((item) => `- \`${item.title}\` -> ${item.native} -> ${item.stackTranslation}`).join('\n')}

## Recipe Pack

${direction.recipePack.map((item) => `- \`${item.title}\` -> ${item.structure} (${item.implementationBias})`).join('\n')}

## Prototype Mode

- \`Recommended: ${direction.prototypeMode.recommended ? 'yes' : 'no'}\`
- \`Mode: ${direction.prototypeMode.mode}\`
- \`Rationale: ${direction.prototypeMode.rationale}\`
- \`Entry strategy: ${direction.prototypeMode.entryStrategy}\`
${direction.prototypeMode.deliverables.map((item) => `- \`Prototype deliverable: ${item}\``).join('\n')}
${direction.prototypeMode.handoffSteps.map((item) => `- \`Handoff: ${item}\``).join('\n')}

## User Flows

- \`${userIntent}\`
- \`Primary flow should cover empty/loading/error/success states before ship.\`
- \`Journey coverage status: ${journeyAudit.coverage} (${journeyAudit.missing.length > 0 ? `missing ${journeyAudit.missing.join(', ')}` : 'core signals present'})\`

## Component Inventory

${inventory.length > 0 ? inventory.slice(0, 15).map((item) => `- \`${item.name}\` -> ${item.file}`).join('\n') : '- `No component inventory was detected.`'}

## State Map

- \`Detected missing states: ${missingStateAudit.missing.length > 0 ? missingStateAudit.missing.join(', ') : 'none'}\`
- \`loading\` should preserve layout stability
- \`error\` should expose recovery language
- \`success\` should confirm completion and next action

## State Atlas

- \`Required state families: ${stateAtlas.requiredStates.join(', ')}\`
${stateAtlas.states.map((item) => `- \`${item.label}\` -> ${item.guidance} | evidence: ${item.evidenceSignals.join(', ')}`).join('\n')}
${stateAtlas.screenCoverage.map((item) => `- \`Screen: ${item.screen}\` -> ${item.states.join(', ')}`).join('\n')}

## Responsive Behavior

${matrix.map((item) => `- \`${item.viewport} ${item.width}\` -> ${item.expectation}`).join('\n')}

## Copy Tone

- \`${direction.copyVoice.tone}\`
${direction.copyVoice.dos.map((item) => `- \`Do: ${item}\``).join('\n')}
${direction.copyVoice.donts.map((item) => `- \`Avoid: ${item}\``).join('\n')}

## Accessibility Checklist

- \`Semantic landmarks remain intact.\`
- \`Interactive controls expose labels and focus states.\`
- \`Color/contrast issues are reviewed during UI review.\`
- \`Accessibility audit verdict: ${accessibilityAudit.verdict} (${accessibilityAudit.issueCount} issue signals)\`

## Semantic Quality

- \`Semantic audit verdict: ${semanticAudit.verdict} (${semanticAudit.issueCount} issue signals)\`
${semanticAudit.issueCount > 0
    ? semanticAudit.issues.slice(0, 8).map((issue) => `- \`${issue.rule}\` ${issue.file} -> ${issue.detail}`).join('\n')
    : '- `No semantic structure issues were detected in the scanned UI files.`'}

## Design Token Usage

- \`Styling layers: ${profile.styling.detected.join(', ')}\`
- \`Prefer shared tokens/components before page-local styling.\`
- \`Token drift issues detected: ${tokenDriftAudit.totalIssues}\`
- \`Taste token targets: ${Object.entries(direction.designTokens).map(([key, value]) => `${key}=${value}`).join(' | ')}\`
- \`Component cues: ${direction.componentCues.slice(0, 3).join(' | ')}\`
${direction.semanticGuardrails.map((item) => `- \`Semantic guardrail: ${item}\``).join('\n')}
${direction.designSystemActions.map((item) => `- \`${item}\``).join('\n')}
${direction.implementationPrompts.map((item) => `- \`Prompt: ${item}\``).join('\n')}

## Empty/Loading/Error/Success States

${missingStateAudit.missing.length > 0
    ? `- \`Missing state coverage for: ${missingStateAudit.missing.join(', ')}\``
    : '- `Core empty/loading/error/success states have code-level evidence.`'}

## Evidence Plan

${browserArtifacts.length > 0
    ? browserArtifacts.slice(0, 4).map((entry) => `- \`${entry.path}\``).join('\n')
    : '- `Capture at least one browser verification artifact before closeout.`'}

## Primitive Opportunities

${primitiveOpportunities.opportunities.length > 0
    ? primitiveOpportunities.opportunities.map((item) => `- \`${item.title}\` -> ${item.recommendation} (${item.stackTranslation})`).join('\n')
    : '- `No repeated primitive opportunities were detected yet.`'}

## Primitive Contracts

${primitiveContractAudit.issueCount > 0
    ? primitiveContractAudit.issues.map((item) => `- \`${item.primitive}\` ${item.file} -> ${item.detail}`).join('\n')
    : '- `No primitive contract gaps were detected in the scanned UI files.`'}
`;

  const filePath = writeDoc(path.join(rootDir, 'UI-SPEC.md'), 'UI SPEC', body);
  const payload = {
    profile,
    inventory,
    matrix,
    missingStateAudit,
    tokenDriftAudit,
    semanticAudit,
    accessibilityAudit,
    journeyAudit,
    primitiveContractAudit,
    primitiveOpportunities,
    direction,
    designDna,
    pageBlueprint,
    designMd,
    componentStrategy,
    designBenchmark,
    stateAtlas,
    file: relativePath(cwd, filePath),
  };
  writeRuntimeJson(cwd, 'frontend-spec.json', payload);
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildUiSpec(cwd, rootDir, {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# UI SPEC\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Framework: \`${payload.profile.framework.primary}\``);
  console.log(`- Inventory size: \`${payload.inventory.length}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildUiSpec,
  main,
};
