const path = require('node:path');
const { renderMarkdownTable, today } = require('./common');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function renderEvidenceList(items, fallback = 'none') {
  return Array.isArray(items) && items.length > 0 ? items.join(', ') : fallback;
}

function buildVisualVerdict(profile) {
  const required = profile.frontendMode.active;
  const requiredLabel = required ? 'required' : 'optional';
  const mobileSurface = profile.productSurface?.id === 'mobile-app' || profile.framework.primary === 'Flutter';

  if (mobileSurface) {
    return {
      required,
      status: requiredLabel,
      protocol: 'mobile',
      areas: [
        {
          area: 'screen flow',
          expectation: 'Primary task flow reads clearly from entry screen to completion without forcing desktop-style detours.',
          howToObserve: 'Walk the main path plus one recovery path across the touched screens and note where orientation could break.',
          evidenceExpectation: 'Screen-by-screen note, simulator capture, or explicit flow walkthrough.',
        },
        {
          area: 'gesture fidelity',
          expectation: 'Swipe, drag, sheet, and tap targets feel intentional for the platform and do not conflict with scroll or navigation.',
          howToObserve: 'Exercise gestures on the changed surface and watch for accidental triggers, dead zones, or blocked scroll.',
          evidenceExpectation: 'Interaction note or simulator trace covering the changed gesture path.',
        },
        {
          area: 'device fit',
          expectation: 'Phone-first layouts respect safe areas, keyboard presence, and narrow-width hierarchy before wider devices are considered.',
          howToObserve: 'Check at least one compact phone viewport and one larger device class or documented size class.',
          evidenceExpectation: 'Screenshot pair, simulator capture, or device-class note.',
        },
        {
          area: 'state coverage',
          expectation: 'Loading, empty, error, success, offline, and permission-sensitive states feel native to the screen flow instead of bolted on.',
          howToObserve: 'Review the active screen family against the required state atlas and confirm each critical state has an owned surface.',
          evidenceExpectation: 'State checklist note, targeted tests, or simulator proof.',
        },
        {
          area: 'accessibility smoke',
          expectation: 'Touch targets, labels, focus order, and dynamic type risks are checked at smoke-test level.',
          howToObserve: 'Review obvious labeling, target size, and readability issues on the touched screens.',
          evidenceExpectation: 'Manual smoke note or platform accessibility output.',
        },
        {
          area: 'screenshot evidence',
          expectation: 'At least one screenshot or equivalent visual artifact backs up the changed mobile surface when frontend mode is active.',
          howToObserve: 'Capture the changed screen or explicitly note why a capture was not practical.',
          evidenceExpectation: 'Screenshot path, simulator artifact, or explicit exception note.',
        },
      ],
    };
  }

  return {
    required,
    status: requiredLabel,
    protocol: 'web',
    areas: [
      {
        area: 'responsive',
        expectation: 'Desktop and mobile layouts preserve hierarchy without overflow or broken spacing.',
        howToObserve: 'Check at least one narrow and one wide viewport or documented responsive breakpoint.',
        evidenceExpectation: 'Screenshot pair or browser-verify note.',
      },
      {
        area: 'interaction',
        expectation: 'Primary interactions, states, and form behavior feel complete and predictable.',
        howToObserve: 'Exercise key clicks, navigation, hover/focus, and any milestone-specific UI state changes.',
        evidenceExpectation: 'Manual check note, test output, or browser-verify trace.',
      },
      {
        area: 'visual consistency',
        expectation: 'Typography, spacing, color, and motion stay coherent with the chosen UI system.',
        howToObserve: 'Review changed screens/components against the active design direction or design system.',
        evidenceExpectation: 'Review note plus screenshot evidence when relevant.',
      },
      {
        area: 'component reuse',
        expectation: 'UI changes reuse the existing design system or shared component surfaces instead of fragmenting them.',
        howToObserve: 'Inspect changed components and note whether shared primitives/components were used.',
        evidenceExpectation: 'Diff review note referencing reused component surfaces.',
      },
      {
        area: 'accessibility smoke',
        expectation: 'Basic semantic structure, focusability, labels, and contrast concerns are checked at smoke-test level.',
        howToObserve: 'Review obvious keyboard/label/semantic issues or run lightweight a11y checks when available.',
        evidenceExpectation: 'Manual smoke note or tool output.',
      },
      {
        area: 'screenshot evidence',
        expectation: 'At least one screenshot or equivalent visual artifact backs up the UI verdict when frontend mode is active.',
        howToObserve: 'Capture or reference a screenshot artifact for the changed view when practical.',
        evidenceExpectation: 'Screenshot path, URL, or explicit note explaining why none was needed.',
      },
    ],
  };
}

function renderFrontendProfileMarkdown(profile, cwd, rootDir) {
  const profileDocPath = path.join(rootDir, 'FRONTEND_PROFILE.md');
  const jsonPath = path.join(cwd, '.workflow', 'frontend-profile.json');
  const stylingRows = profile.styling.detected.map((item) => [
    item,
    renderEvidenceList(profile.styling.evidence[item] || []),
  ]);
  const uiRows = profile.uiSystem.detected.map((item) => [
    item,
    renderEvidenceList(profile.uiSystem.evidence[item] || []),
  ]);
  const signalRows = profile.signals.hits.map((item) => [
    item.label,
    renderEvidenceList(item.evidence),
    item.why,
  ]);
  const adapterRows = profile.adapters.registry.map((item) => [
    item.label,
    item.status,
    item.reason,
    item.trigger ? 'yes' : 'no',
  ]);
  const verdictRows = profile.visualVerdict.areas.map((item) => [
    item.area,
    item.expectation,
    item.howToObserve,
    item.evidenceExpectation,
    profile.visualVerdict.required ? 'required' : 'optional',
  ]);
  const componentFamilyRows = Object.entries(profile.componentIntelligence?.familyCounts || {})
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([family, count]) => [family, String(count)]);
  const reusableRows = (profile.componentIntelligence?.topReusableComponents || []).map((item) => [
    item.name,
    item.family,
    item.shared ? 'shared' : 'local',
    String(item.consumerCount),
    item.file,
  ]);

  return `# FRONTEND_PROFILE

- Last updated: \`${today()}\`
- Generator version: \`${profile.generatorVersion}\`
- Workflow root: \`${profile.workflowRootRelative}\`
- Scope: \`${profile.scope.mode}\`
- Refresh policy: \`${profile.scope.refresh}\`
- Refresh status: \`${profile.fingerprint.refreshStatus}\`
- Workflow active: \`${profile.workflow.active ? 'yes' : 'no'}\`
- Frontend mode: \`${profile.frontendMode.status}\`
- Frontend reason: \`${profile.frontendMode.reason}\`
- Product surface: \`${profile.productSurface.label}\`
- Product surface reason: \`${profile.productSurface.reason}\`
- Interaction model: \`${profile.interactionModel.label}\`
- Routing: \`${profile.routing.label}\`
- Recommended command pack: \`${profile.recommendedCommandPack.id}\`
- Selected adapters: \`${profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none'}\`
- Visual verdict required: \`${profile.visualVerdict.required ? 'yes' : 'no'}\`
- Profile JSON: \`${relativePath(cwd, jsonPath)}\`
- Profile markdown: \`${relativePath(cwd, profileDocPath)}\`

## Stack Fingerprint

- Primary framework: \`${profile.framework.primary}\`
- Frameworks detected: \`${profile.framework.detected.join(', ')}\`
- Styling detected: \`${profile.styling.detected.join(', ')}\`
- UI system: \`${profile.uiSystem.primary}\`
- TSX/JSX files: \`${profile.fileCounts.tsxJsx}\`
- Dart files: \`${profile.fileCounts.dart}\`
- CSS-like files: \`${profile.fileCounts.cssLike}\`
- Forms stack: \`${profile.stack.forms.length > 0 ? profile.stack.forms.join(', ') : 'none detected'}\`
- Data stack: \`${profile.stack.data.length > 0 ? profile.stack.data.join(', ') : 'none detected'}\`
- Motion stack: \`${profile.stack.motion.length > 0 ? profile.stack.motion.join(', ') : 'none detected'}\`
- Test stack: \`${profile.stack.tests.length > 0 ? profile.stack.tests.join(', ') : 'none detected'}\`
- Storybook: \`${profile.stack.presence.storybook ? 'yes' : 'no'}\`
- Playwright: \`${profile.stack.presence.playwright ? 'yes' : 'no'}\`
- Figma links: \`${profile.figma.present ? profile.figma.links.length : 0}\`

## Routing

- Primary routing: \`${profile.routing.primary}\`
- Routing label: \`${profile.routing.label}\`
- Routing signals: \`${profile.routing.detected.join(', ')}\`

## Surface Inventory

- Routes/pages: \`${profile.surfaceInventory.routeCount}\`
- Route families: \`${profile.surfaceInventory.routeFamilyCount}\`
- Shared components: \`${profile.surfaceInventory.sharedComponentCount}\`
- Local components: \`${profile.surfaceInventory.localComponentCount}\`
- Mobile screens: \`${profile.surfaceInventory.screenCount}\`

## Component Intelligence

- Total components: \`${profile.componentIntelligence.totalComponents}\`
- Shared vs local: \`${profile.componentIntelligence.sharedCount}\` / \`${profile.componentIntelligence.localCount}\`
- Prop contracts: \`${profile.componentIntelligence.propContractCount}\`
- Reuse verdict: \`${profile.componentIntelligence.reuse.verdict}\`
- Reuse reason: \`${profile.componentIntelligence.reuse.reason}\`
- Dominant families: \`${profile.componentIntelligence.dominantFamilies.length > 0 ? profile.componentIntelligence.dominantFamilies.join(', ') : 'none'}\`
- Route-to-component ratio: \`${profile.componentIntelligence.routeToComponentRatio}\`
- State coverage present: \`${profile.componentIntelligence.stateCoverage.present.length > 0 ? profile.componentIntelligence.stateCoverage.present.join(', ') : 'none'}\`
- State coverage missing: \`${profile.componentIntelligence.stateCoverage.missing.length > 0 ? profile.componentIntelligence.stateCoverage.missing.join(', ') : 'none'}\`

${renderMarkdownTable(
    ['Family', 'Count'],
    componentFamilyRows.length > 0 ? componentFamilyRows : [['general', '0']],
  )}

${renderMarkdownTable(
    ['Component', 'Family', 'Scope', 'Consumers', 'File'],
    reusableRows.length > 0 ? reusableRows : [['No reusable hotspots yet', 'n/a', 'n/a', '0', 'n/a']],
  )}

## Browser Readiness

- Protocol: \`${profile.browserReadiness.protocol}\`
- Preview requested: \`${profile.browserReadiness.previewRequested ? 'yes' : 'no'}\`
- Has preview harness: \`${profile.browserReadiness.hasPreviewHarness ? 'yes' : 'no'}\`
- Has proof harness: \`${profile.browserReadiness.hasProofHarness ? 'yes' : 'no'}\`
- Evidence gap: \`${profile.browserReadiness.evidenceGap ? 'yes' : 'no'}\`
- Recommended lane: \`${profile.browserReadiness.recommendedLane}\`
- Recommendation: \`${profile.browserReadiness.reason}\`
- Observation targets: \`${profile.browserReadiness.observationTargets.length > 0 ? profile.browserReadiness.observationTargets.join(', ') : 'none'}\`

## Planning Signals

- Needs state atlas: \`${profile.planningSignals.needsStateAtlas ? 'yes' : 'no'}\`
- Needs component strategy: \`${profile.planningSignals.needsComponentStrategy ? 'yes' : 'no'}\`
- Needs responsive matrix: \`${profile.planningSignals.needsResponsiveMatrix ? 'yes' : 'no'}\`
- Needs UI review: \`${profile.planningSignals.needsUiReview ? 'yes' : 'no'}\`
- Needs full brief: \`${profile.planningSignals.needsFullBrief ? 'yes' : 'no'}\`
- Suggested workflow bundle: \`${profile.planningSignals.bundleId}\`

## Recommended Command Pack

- Pack: \`${profile.recommendedCommandPack.label}\`
- Reason: \`${profile.recommendedCommandPack.reason}\`

${profile.recommendedCommandPack.commands.map((command) => `- \`${command}\``).join('\n')}

## Fingerprint Inputs

${profile.fingerprint.inputs.length > 0
    ? profile.fingerprint.inputs.map((item) => `- \`${item}\``).join('\n')
    : '- `No fingerprint inputs were recorded`'}

## Styling

${renderMarkdownTable(
    ['Layer', 'Evidence'],
    stylingRows.length > 0 ? stylingRows : [['custom', 'none detected']],
  )}

## UI System

${renderMarkdownTable(
    ['System', 'Evidence'],
    uiRows.length > 0 ? uiRows : [['custom', 'none detected']],
  )}

## Activation Signals

${renderMarkdownTable(
    ['Signal', 'Evidence', 'Why it matters'],
    signalRows.length > 0 ? signalRows : [['No active frontend signal', 'none', 'Frontend auto mode stays inactive']],
  )}

## Adapter Registry

${renderMarkdownTable(
    ['Adapter', 'Status', 'Reason', 'Triggered'],
    adapterRows,
  )}

## Visual Verdict Protocol

${renderMarkdownTable(
    ['Verdict area', 'Expectation', 'How to observe', 'Evidence expectation', 'Required'],
    verdictRows,
  )}
`;
}

function renderFrontendAuditModeSection(profile) {
  return [
    `- \`Frontend mode: ${profile.frontendMode.status}\``,
    `- \`Activation reason: ${profile.frontendMode.reason}\``,
    `- \`Product surface: ${profile.productSurface.label}\``,
    `- \`Interaction model: ${profile.interactionModel.label}\``,
    `- \`Routing: ${profile.routing.label}\``,
    `- \`Activation signals: ${profile.signals.hits.length > 0 ? profile.signals.hits.map((item) => item.label).join(', ') : 'none'}\``,
    `- \`Design-system aware execution: ${profile.frontendMode.designSystemAware ? 'yes' : 'no'}\``,
    `- \`Adapter route: ${profile.adapters.selected.length > 0 ? profile.adapters.selected.join(', ') : 'none'}\``,
    `- \`Recommended command pack: ${profile.recommendedCommandPack.id}\``,
    `- \`Preview/browser verification need: ${profile.signals.previewNeed ? 'yes' : 'no'}\``,
    `- \`Visual verdict required: ${profile.visualVerdict.required ? 'yes' : 'no'}\``,
    `- \`Reuse verdict: ${profile.componentIntelligence.reuse.verdict}\``,
    `- \`Browser lane: ${profile.browserReadiness.recommendedLane}\``,
  ].join('\n');
}

function renderVisualVerdictTable(profile) {
  return renderMarkdownTable(
    ['Verdict area', 'Expectation', 'How to observe', 'Evidence expectation', 'Status'],
    profile.visualVerdict.areas.map((item) => [
      item.area,
      item.expectation,
      item.howToObserve,
      item.evidenceExpectation,
      profile.visualVerdict.required ? 'required' : 'optional',
    ]),
  );
}

function summarizeProfile(profile) {
  return {
    framework: profile.framework.primary,
    productSurface: profile.productSurface.label,
    routing: profile.routing.label,
    styling: profile.styling.detected,
    uiSystem: profile.uiSystem.primary,
    frontendMode: profile.frontendMode.status,
    commandPack: profile.recommendedCommandPack.id,
    adapters: profile.adapters.selected,
    visualVerdictRequired: profile.visualVerdict.required,
    signalCount: profile.signals.hits.length,
    refreshStatus: profile.fingerprint.refreshStatus,
    reuseVerdict: profile.componentIntelligence?.reuse?.verdict || 'n/a',
    browserLane: profile.browserReadiness?.recommendedLane || 'n/a',
  };
}

module.exports = {
  buildVisualVerdict,
  renderEvidenceList,
  renderFrontendAuditModeSection,
  renderFrontendProfileMarkdown,
  renderVisualVerdictTable,
  summarizeProfile,
};
