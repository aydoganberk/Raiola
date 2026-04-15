const FRONTEND_SURFACE_PATTERN = /\b(frontend|ui|ux|design|surface|screen|dashboard|page|layout|component|landing|hero|mobile|web app|journey|flow|form|table|modal|drawer|settings|onboarding|workspace)\b/i;
const FRONTEND_REVIEW_PATTERN = /\b(ui review|frontend review|frontend audit|responsive|responsiveness|accessibility|a11y|design debt|visual review|browser verify|browser verification|keyboard|focus order|contrast|quality review|bug bash|bugbash|qa pass)\b/i;
const FRONTEND_REFACTOR_PATTERN = /\b(refactor|restructure|extract|normalize|componentize|componentise|modularize|modularise|split up|split the components|consolidate|dedupe|de-duplicate|cleanup|clean up|migrate|modernize|modernise|shared primitives|reuse better|reorganize|reorganise)\b/i;
const FRONTEND_POLISH_PATTERN = /\b(polish|polishing|align|alignment|consistency|consistent|smooth|refine|refinement|spacing|typography|design system|tokens?|hover state|focus state|empty state|loading state|error state|success state|skeleton|microcopy|premium look|premium feel|visual polish|fit and finish|pixel perfect)\b/i;
const FRONTEND_STATE_PATTERN = /\b(empty state|loading state|error state|success state|skeleton|form state|validation state|journey|journeys|state coverage|states?)\b/i;
const FRONTEND_SHIP_PATTERN = /\b(release|release candidate|readiness|go live|launch|preflight|signoff|smoke test|smoke|production|before release|browser proof|closeout)\b/i;
const FRONTEND_DELIVERY_PATTERN = /\b(build|implement|create|add|design|ship|launch|deliver|craft|redesign|new screen|new page|new flow|new component|premium)\b/i;
const FRONTEND_DESIGN_SYSTEM_PATTERN = /\b(design system|tokens?|spacing|typography|palette|primitives?|button variants?|input states?|cards?|modals?|drawers?|consistency|component library|theme|themes)\b/i;

function unique(items) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function surfaceMetrics(frontendProfile = null) {
  return {
    routeCount: Number(frontendProfile?.surfaceInventory?.routeCount || 0),
    routeFamilyCount: Number(frontendProfile?.surfaceInventory?.routeFamilyCount || 0),
    sharedComponentCount: Number(frontendProfile?.surfaceInventory?.sharedComponentCount || 0),
    localComponentCount: Number(frontendProfile?.surfaceInventory?.localComponentCount || 0),
    pageCount: Number(frontendProfile?.surfaceInventory?.pageCount || 0),
    screenCount: Number(frontendProfile?.surfaceInventory?.screenCount || 0),
  };
}

function frontendSignals(frontendProfile = null) {
  const metrics = surfaceMetrics(frontendProfile);
  const productSurfaceId = frontendProfile?.productSurface?.id || '';
  const uiSystemPrimary = frontendProfile?.uiSystem?.primary || 'unknown';
  const uiSystemDetected = frontendProfile?.uiSystem?.detected || [];
  const commandPackId = frontendProfile?.recommendedCommandPack?.id || frontendProfile?.commandPack || '';
  const storybook = Boolean(frontendProfile?.stack?.presence?.storybook || frontendProfile?.fileSignals?.storybook);
  const playwright = Boolean(frontendProfile?.stack?.presence?.playwright || frontendProfile?.fileSignals?.playwright);
  const forms = frontendProfile?.stack?.forms || [];
  const data = frontendProfile?.stack?.data || [];
  const motion = frontendProfile?.stack?.motion || [];
  const mobileSurface = Boolean(frontendProfile?.planningSignals?.mobileSurface || productSurfaceId === 'mobile-app' || frontendProfile?.framework?.primary === 'Flutter');
  const denseSurface = ['dashboard', 'web-app', 'studio-workspace', 'developer-tool', 'saas-app'].includes(productSurfaceId);
  const settingsSurface = productSurfaceId === 'settings-surface';
  const landingSurface = productSurfaceId === 'landing-page';
  const multiRoute = metrics.routeCount >= 4 || metrics.routeFamilyCount >= 3;
  const componentHeavy = (metrics.sharedComponentCount + metrics.localComponentCount) >= 6;
  const designSystemWeak = uiSystemPrimary === 'custom' || uiSystemDetected.includes('shadcn');
  const stateHeavy = Boolean(frontendProfile?.planningSignals?.needsStateAtlas || denseSurface || settingsSurface || mobileSurface || forms.length > 0 || metrics.routeCount >= 2);
  const browserProofNeeded = Boolean(frontendProfile?.planningSignals?.previewRequested || storybook || playwright);
  const fullBriefSurface = ['frontend-full-brief', 'mobile-surface-pack'].includes(commandPackId) || metrics.routeCount >= 4 || componentHeavy;
  return {
    metrics,
    productSurfaceId,
    uiSystemPrimary,
    uiSystemDetected,
    commandPackId,
    storybook,
    playwright,
    forms,
    data,
    motion,
    mobileSurface,
    denseSurface,
    settingsSurface,
    landingSurface,
    multiRoute,
    componentHeavy,
    designSystemWeak,
    stateHeavy,
    browserProofNeeded,
    fullBriefSurface,
    figmaPresent: Boolean(frontendProfile?.figma?.present),
  };
}

function classifyFrontendIntent(goal, frontendProfile = null) {
  const text = String(goal || '').trim();
  const signals = frontendSignals(frontendProfile);
  const reviewScore =
    (FRONTEND_REVIEW_PATTERN.test(text) ? 7 : 0)
    + (signals.browserProofNeeded ? 2 : 0)
    + (/(audit|review|qa|bug)/i.test(text) ? 1 : 0);
  const refactorScore =
    (FRONTEND_REFACTOR_PATTERN.test(text) ? 7 : 0)
    + (signals.componentHeavy ? 2 : 0)
    + (signals.multiRoute ? 1 : 0)
    + (signals.designSystemWeak ? 1 : 0);
  const polishScore =
    (FRONTEND_POLISH_PATTERN.test(text) ? 7 : 0)
    + (FRONTEND_DESIGN_SYSTEM_PATTERN.test(text) ? 2 : 0)
    + (FRONTEND_STATE_PATTERN.test(text) ? 2 : 0)
    + (signals.designSystemWeak ? 2 : 0)
    + (signals.stateHeavy ? 1 : 0)
    + (signals.landingSurface || signals.denseSurface ? 1 : 0);
  const shipScore =
    (FRONTEND_SHIP_PATTERN.test(text) ? 7 : 0)
    + (signals.browserProofNeeded ? 2 : 0)
    + (signals.stateHeavy ? 1 : 0)
    + (signals.multiRoute ? 1 : 0);
  const deliveryScore =
    (FRONTEND_SURFACE_PATTERN.test(text) ? 3 : 0)
    + (FRONTEND_DELIVERY_PATTERN.test(text) ? 4 : 0)
    + (signals.fullBriefSurface ? 1 : 0)
    + (signals.metrics.routeCount >= 2 ? 1 : 0);

  const laneScores = [
    { lane: 'ship-readiness', score: shipScore },
    { lane: 'review', score: reviewScore },
    { lane: 'refactor', score: refactorScore },
    { lane: 'polish', score: polishScore },
    { lane: 'delivery', score: deliveryScore },
  ].sort((left, right) => right.score - left.score || left.lane.localeCompare(right.lane));

  const highest = laneScores[0] || { lane: 'delivery', score: 0 };
  let lane = highest.lane;
  if (highest.score <= 0) {
    lane = 'delivery';
  }

  const frontend = FRONTEND_SURFACE_PATTERN.test(text)
    || Boolean(frontendProfile?.frontendMode?.active)
    || Boolean(frontendProfile?.framework?.detected?.some((entry) => ['Next', 'Vite', 'Astro', 'Remix', 'Flutter'].includes(entry)));

  const reasonList = [];
  if (lane === 'ship-readiness') {
    reasonList.push('frontend_release_language');
  }
  if (lane === 'review') {
    reasonList.push('frontend_quality_language');
  }
  if (lane === 'refactor') {
    reasonList.push('frontend_refactor_language');
  }
  if (lane === 'polish') {
    reasonList.push('frontend_polish_language');
  }
  if (lane === 'delivery') {
    reasonList.push('frontend_surface_delivery');
  }
  if (signals.fullBriefSurface) {
    reasonList.push('surface_complexity_detected');
  }
  if (signals.browserProofNeeded) {
    reasonList.push('browser_proof_available');
  }
  if (signals.designSystemWeak) {
    reasonList.push('design_system_alignment_worthwhile');
  }
  if (signals.stateHeavy) {
    reasonList.push('state_coverage_worthwhile');
  }

  const bundleOrder = {
    delivery: ['frontend-delivery', 'frontend-refactor', 'frontend-polish', 'frontend-review'],
    review: ['frontend-review', 'frontend-polish', 'frontend-delivery'],
    refactor: ['frontend-refactor', 'frontend-delivery', 'frontend-polish', 'frontend-review'],
    polish: ['frontend-polish', 'frontend-review', 'frontend-delivery', 'frontend-refactor'],
    'ship-readiness': ['frontend-ship-readiness', 'frontend-review', 'frontend-polish', 'ship-closeout'],
  };

  const suggestedAddOns = [];
  const pushAddOn = (id) => {
    if (!suggestedAddOns.includes(id)) {
      suggestedAddOns.push(id);
    }
  };

  if (frontend) {
    pushAddOn('browser');
  }
  if (signals.fullBriefSurface || /\b(inventory|screen family|screen families|route family|routes|blueprint|surface map)\b/i.test(text)) {
    pushAddOn('surface');
  }
  if (signals.designSystemWeak || FRONTEND_DESIGN_SYSTEM_PATTERN.test(text) || lane === 'polish') {
    pushAddOn('design-system');
  }
  if (signals.stateHeavy || FRONTEND_STATE_PATTERN.test(text) || /\b(forms?|journey|validation|save state|danger zone|empty|loading|error|success)\b/i.test(text)) {
    pushAddOn('state');
  }
  if (signals.figmaPresent || signals.commandPackId === 'frontend-full-brief' || /\b(brief|docs?|documentation|spec|figma|handoff)\b/i.test(text)) {
    pushAddOn('docs');
  }
  if (lane === 'review' || lane === 'ship-readiness') {
    pushAddOn('trust');
  }
  if (lane === 'ship-readiness') {
    pushAddOn('handoff');
  }

  const focusAreas = [];
  const pushFocus = (value) => {
    if (!focusAreas.includes(value)) {
      focusAreas.push(value);
    }
  };
  if (signals.multiRoute) {
    pushFocus('page inventory and route families');
  }
  if (signals.componentHeavy) {
    pushFocus('shared component reuse and extraction boundaries');
  }
  if (signals.stateHeavy) {
    pushFocus('empty/loading/error/success state ownership');
  }
  if (signals.browserProofNeeded) {
    pushFocus('browser proof and screenshot evidence');
  }
  if (signals.designSystemWeak) {
    pushFocus('design-system consistency across primitives');
  }
  if (signals.forms.length > 0 || signals.settingsSurface) {
    pushFocus('form validation and save/danger-zone flows');
  }
  if (signals.denseSurface) {
    pushFocus('dashboard density, tables, filters, and scan-first hierarchy');
  }
  if (signals.landingSurface) {
    pushFocus('hero narrative, proof sections, and conversion rhythm');
  }
  if (signals.mobileSurface) {
    pushFocus('gesture fit, device classes, and compact-state UX');
  }

  const confidenceScore = highest.score;
  const confidence = confidenceScore >= 8 ? 'high' : confidenceScore >= 5 ? 'medium' : 'low';

  return {
    frontend,
    lane,
    confidence,
    primaryBundleId: bundleOrder[lane]?.[0] || 'frontend-delivery',
    candidateBundleIds: unique(bundleOrder[lane] || ['frontend-delivery']),
    reason: reasonList[0] || 'frontend_surface_delivery',
    reasons: unique(reasonList),
    suggestedAddOns,
    focusAreas,
    scores: Object.freeze({
      delivery: deliveryScore,
      review: reviewScore,
      refactor: refactorScore,
      polish: polishScore,
      shipReadiness: shipScore,
    }),
    signals,
  };
}

function buildFrontendStartSummary(frontendProfile = null, frontendIntent = null) {
  if (!frontendProfile) {
    return null;
  }
  const signals = frontendIntent?.signals || frontendSignals(frontendProfile);
  return {
    framework: frontendProfile.framework?.primary || 'unknown',
    routing: frontendProfile.routing?.primary || frontendProfile.routing?.label || 'unknown',
    productSurface: frontendProfile.productSurface?.label || 'unknown',
    productSurfaceId: frontendProfile.productSurface?.id || 'unknown',
    interactionModel: frontendProfile.interactionModel?.label || frontendProfile.interactionModel?.primary || 'unknown',
    frontendMode: frontendProfile.frontendMode?.status || 'inactive',
    commandPack: frontendProfile.recommendedCommandPack?.id || frontendProfile.commandPack || 'none',
    uiSystem: frontendProfile.uiSystem?.primary || 'unknown',
    styling: frontendProfile.styling?.detected || [],
    adapters: frontendProfile.adapters?.selected || [],
    routeCount: signals.metrics.routeCount,
    routeFamilyCount: signals.metrics.routeFamilyCount,
    pageCount: signals.metrics.pageCount,
    screenCount: signals.metrics.screenCount,
    sharedComponentCount: signals.metrics.sharedComponentCount,
    localComponentCount: signals.metrics.localComponentCount,
    forms: signals.forms,
    data: signals.data,
    motion: signals.motion,
    storybook: signals.storybook,
    playwright: signals.playwright,
    figma: Boolean(frontendProfile.figma?.present),
    visualVerdictRequired: Boolean(frontendProfile.visualVerdict?.required),
    workflowIntent: frontendIntent
      ? {
        lane: frontendIntent.lane,
        confidence: frontendIntent.confidence,
        reason: frontendIntent.reason,
        reasons: frontendIntent.reasons,
        primaryBundleId: frontendIntent.primaryBundleId,
        candidateBundleIds: frontendIntent.candidateBundleIds,
      }
      : null,
    focusAreas: frontendIntent?.focusAreas || [],
    suggestedAddOns: frontendIntent?.suggestedAddOns || [],
  };
}

module.exports = {
  FRONTEND_DESIGN_SYSTEM_PATTERN,
  FRONTEND_DELIVERY_PATTERN,
  FRONTEND_POLISH_PATTERN,
  FRONTEND_REFACTOR_PATTERN,
  FRONTEND_REVIEW_PATTERN,
  FRONTEND_SHIP_PATTERN,
  FRONTEND_STATE_PATTERN,
  FRONTEND_SURFACE_PATTERN,
  buildFrontendStartSummary,
  classifyFrontendIntent,
};
