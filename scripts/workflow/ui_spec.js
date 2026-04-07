const path = require('node:path');
const { parseArgs, readIfExists, resolveWorkflowRoot, tryExtractSection } = require('./common');
const {
  buildAccessibilityAudit,
  buildFrontendProfile,
  buildJourneyAudit,
  buildMissingStateAudit,
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

function printHelp() {
  console.log(`
ui_spec

Usage:
  node scripts/workflow/ui_spec.js

Options:
  --goal <text>  Optional product/UI goal to steer the brief
  --taste <id>   Optional explicit taste profile override
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
  const primitiveOpportunities = buildPrimitiveOpportunityAudit(cwd, profile, inventory);
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  const userIntent = tryExtractSection(contextDoc, 'User Intent', '').trim() || 'No explicit UI intent note was recorded.';
  const touchedFiles = tryExtractSection(contextDoc, 'Touched Files', '').trim();

  const body = `
- Workflow root: \`${relativePath(cwd, rootDir)}\`
- Framework: \`${profile.framework.primary}\`
- UI system: \`${profile.uiSystem.primary}\`
- Frontend mode: \`${profile.frontendMode.status}\`
- UI direction: \`${direction.file}\`
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

## Experience Thesis

- \`${direction.experienceThesis.title}\`
- \`${direction.experienceThesis.thesis}\`
- \`${direction.experienceThesis.signature}\`

## Signature Moments

${direction.signatureMoments.map((item) => `- \`${item.title}: ${item.description}\``).join('\n')}

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
    primitiveOpportunities,
    direction,
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
