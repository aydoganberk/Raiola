const { findWorkflowBundle, listWorkflowBundles } = require('./workflow_bundle_catalog');
const { classifyFrontendIntent } = require('./workflow_frontend_start');

const START_PROFILES = Object.freeze([
  {
    id: 'speed',
    label: 'Speed',
    summary: 'Keep the lane lean and move through the minimum proving spine.',
    aliases: ['fast', 'lean', 'quick'],
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary: 'Default productized flow that keeps routing, shaping, and proving aligned.',
    aliases: ['default', 'normal', 'standard'],
  },
  {
    id: 'deep',
    label: 'Deep',
    summary: 'Expand complementary commands, evidence, docs, and closeout surfaces for harder work.',
    aliases: ['full', 'comprehensive', 'thorough'],
  },
]);

const START_ADDONS = Object.freeze([
  {
    id: 'trust',
    label: 'Trust layer',
    summary: 'Add secure scanning, evidence graphing, and validation visibility.',
    aliases: ['evidence', 'guardrails', 'risk'],
  },
  {
    id: 'docs',
    label: 'Docs + packet',
    summary: 'Add packet compilation and discussion-ready documentation outputs.',
    aliases: ['packet', 'documentation', 'writeup'],
  },
  {
    id: 'handoff',
    label: 'Handoff + reporting',
    summary: 'Add PR brief, release notes, session report, and continuity surfaces.',
    aliases: ['closeout', 'reporting', 'report', 'handover'],
  },
  {
    id: 'parallel',
    label: 'Parallel planning',
    summary: 'Add orchestration and delegation surfaces for larger scopes.',
    aliases: ['team', 'delegation', 'subagents'],
  },
  {
    id: 'browser',
    label: 'Browser proof',
    summary: 'Add preview and browser-verification surfaces for visual/product work.',
    aliases: ['preview', 'visual', 'ui-proof'],
  },
  {
    id: 'surface',
    label: 'Surface inventory',
    summary: 'Add page blueprints, frontend briefing, and component inventory for broader UI surfaces.',
    aliases: ['inventory', 'blueprint', 'screens', 'surface-map'],
  },
  {
    id: 'design-system',
    label: 'Design-system alignment',
    summary: 'Add design-DNA, component-map, and design-debt surfaces to align primitives and consistency.',
    aliases: ['tokens', 'ui-system', 'consistency', 'alignment'],
  },
  {
    id: 'state',
    label: 'State coverage',
    summary: 'Add state-atlas, responsive matrix, and review checks for empty/loading/error/success flows.',
    aliases: ['journeys', 'ux-states', 'loading'],
  },
  {
    id: 'ownership',
    label: 'Ownership + hotspots',
    summary: 'Add package ownership, hotspot responsibility, and ranked area context to repo-scale review lanes.',
    aliases: ['owners', 'codeowners', 'hotspots'],
  },
  {
    id: 'regression',
    label: 'Regression + verify matrix',
    summary: 'Add test impact, validation mapping, and targeted verification queues to correction-heavy work.',
    aliases: ['verify-matrix', 'test-impact', 'coverage'],
  },
  {
    id: 'shard',
    label: 'Shard planning',
    summary: 'Add ranked shard selection, next-subsystem sequencing, and wave planning for large repos.',
    aliases: ['subsystem', 'packages', 'wave-plan'],
  },
  {
    id: 'repair',
    label: 'Repair planner',
    summary: 'Add patchability, fix-confidence, and bounded write planning to review/correction flows.',
    aliases: ['patchability', 'fix-plan', 'repair-wave'],
  },
]);

const PROFILE_INDEX = new Map();
for (const profile of START_PROFILES) {
  PROFILE_INDEX.set(profile.id, profile);
  for (const alias of profile.aliases || []) {
    PROFILE_INDEX.set(alias, profile);
  }
}

const ADDON_INDEX = new Map();
for (const addOn of START_ADDONS) {
  ADDON_INDEX.set(addOn.id, addOn);
  for (const alias of addOn.aliases || []) {
    ADDON_INDEX.set(alias, addOn);
  }
}

function quoteGoal(goal) {
  return JSON.stringify(String(goal || '').trim());
}

function listStartProfiles() {
  return START_PROFILES.map((entry) => ({ ...entry }));
}

function listStartAddOns() {
  return START_ADDONS.map((entry) => ({ ...entry }));
}

function findStartProfile(value) {
  return PROFILE_INDEX.get(String(value || '').trim().toLowerCase()) || null;
}

function findStartAddOn(value) {
  return ADDON_INDEX.get(String(value || '').trim().toLowerCase()) || null;
}

function isGoalMatch(goal, pattern) {
  return pattern.test(String(goal || ''));
}

function wantsFrontendProductWork(goal) {
  return /\b(frontend|ui|ux|design|surface|screen|dashboard|page|layout|component|taste|landing|hero|mobile|web app|journey|flow|form|table|modal|drawer|settings|onboarding)\b/i.test(String(goal || ''));
}

function isRepoWideGoal(goal) {
  return /\b(repo|codebase|full repo|whole repo|entire repo|oneshot|one-shot|monorepo|workspace|package|packages|subsystem)\b/i.test(String(goal || ''));
}

function wantsCorrectionGoal(goal) {
  return /\b(fix|correct|patch|repair|remediate|address findings|close blockers|cleanup findings|hardening|stabilize|follow-up fixes?)\b/i.test(String(goal || ''));
}

function inferGoalRisk(goal) {
  const text = String(goal || '');
  if (/\b(ship|release|prod|production|migration|security|auth|credentials?|payments?|checkout|billing|rollback)\b/i.test(text)) {
    return 'high';
  }
  if (/\b(audit|review|verify|closeout|handoff|dashboard|frontend|ui|design|repo|codebase|package|monorepo)\b/i.test(text)) {
    return 'medium';
  }
  return 'low';
}

function buildStartEntryCommand(bundleId, goal, options = {}) {
  const bundle = findWorkflowBundle(bundleId);
  if (!bundle) {
    return '';
  }
  const args = ['rai', 'start', bundle.shorthand || bundle.id, '--goal', quoteGoal(goal)];
  const profileId = String(options.profileId || '').trim();
  const addOnIds = (options.addOnIds || []).map((entry) => String(entry || '').trim()).filter(Boolean);
  if (profileId && profileId !== 'balanced') {
    args.push('--profile', profileId);
  }
  if (addOnIds.length > 0) {
    args.push('--with', addOnIds.join('|'));
  }
  return args.join(' ');
}

function recommendStartProfile(bundle, context = {}) {
  const explicit = findStartProfile(context.explicitProfileId);
  if (explicit) {
    return {
      ...explicit,
      explicit: true,
      recommended: explicit.id,
      reason: 'explicit_profile',
    };
  }

  const goal = context.goal || '';
  const route = context.route || {};
  const packageGraph = context.packageGraph || {};
  const frontendProfile = context.frontendProfile || null;
  const frontendIntent = classifyFrontendIntent(goal, frontendProfile);
  const repoShape = packageGraph.repoShape || route.repoSignals?.repoShape || 'standard';
  const packageCount = Number(packageGraph.packageCount || route.repoSignals?.packageCount || 0);
  const risk = inferGoalRisk(goal);
  const commandPackId = frontendProfile?.recommendedCommandPack?.id || frontendProfile?.commandPack || '';
  const routeCount = Number(frontendIntent.signals?.metrics?.routeCount || 0);
  const componentCount = Number(frontendIntent.signals?.metrics?.sharedComponentCount || 0) + Number(frontendIntent.signals?.metrics?.localComponentCount || 0);

  let selected = findStartProfile(context.defaultProfileId) || findStartProfile('balanced');
  let reason = selected.id === 'balanced' ? 'balanced_default' : 'repo_config_default_profile';

  if (bundle?.id === 'ship-closeout' || bundle?.id === 'frontend-ship-readiness') {
    selected = findStartProfile('deep');
    reason = bundle?.id === 'frontend-ship-readiness' ? 'frontend_ship_lane' : 'ship_closeout_prefers_evidence';
  } else if (bundle?.id === 'monorepo-audit-wave' || repoShape === 'monorepo' || packageCount >= 6) {
    selected = findStartProfile('deep');
    reason = 'large_repo_scope';
  } else if (bundle?.id === 'frontend-refactor' && (frontendIntent.signals?.fullBriefSurface || componentCount >= 8 || routeCount >= 4)) {
    selected = findStartProfile('deep');
    reason = 'frontend_refactor_surface_complexity';
  } else if (bundle?.id === 'frontend-polish' && (frontendIntent.signals?.stateHeavy || frontendIntent.signals?.designSystemWeak || /\b(premium|polish|consistency|design system|states?)\b/i.test(goal))) {
    selected = findStartProfile('deep');
    reason = 'frontend_polish_quality_scope';
  } else if (bundle?.id === 'frontend-review' && (frontendIntent.signals?.browserProofNeeded || frontendIntent.signals?.stateHeavy || routeCount >= 2)) {
    selected = findStartProfile('deep');
    reason = 'frontend_review_broad_surface';
  } else if (bundle?.id === 'frontend-delivery' && ['frontend-full-brief', 'mobile-surface-pack'].includes(commandPackId)) {
    selected = findStartProfile('deep');
    reason = 'frontend_full_brief_surface';
  } else if (bundle?.id === 'frontend-delivery' && isGoalMatch(goal, /\b(redesign|premium|dashboard|journey|surface|conversion|polish|taste)\b/i)) {
    selected = findStartProfile('deep');
    reason = 'frontend_product_surface';
  } else if (bundle?.id === 'correction-wave' && (repoShape === 'monorepo' || packageCount >= 6)) {
    selected = findStartProfile('deep');
    reason = 'large_repo_correction';
  } else if (bundle?.id === 'correction-wave' && (risk === 'high' || /\b(blocker|highest-risk|findings|verify|re-review|hardening)\b/i.test(goal))) {
    selected = findStartProfile('deep');
    reason = 'high_risk_correction';
  } else if (risk === 'high' && ['review-wave', 'repo-audit-wave', 'correction-wave'].includes(bundle?.id)) {
    selected = findStartProfile('deep');
    reason = 'high_risk_review';
  } else if (bundle?.id === 'correction-wave' && packageCount <= 1 && route.confidence >= 0.85 && risk === 'low') {
    selected = findStartProfile('speed');
    reason = 'narrow_correction_scope';
  } else if (bundle?.id === 'slice-delivery' && packageCount <= 1 && route.confidence >= 0.85 && risk === 'low') {
    selected = findStartProfile('speed');
    reason = 'high_confidence_small_scope';
  } else if (bundle?.id === 'frontend-refactor' && routeCount <= 1 && componentCount <= 3 && risk === 'low') {
    selected = findStartProfile('speed');
    reason = 'narrow_frontend_refactor';
  } else if (bundle?.id === 'frontend-polish' && routeCount <= 1 && componentCount <= 3 && !frontendIntent.signals?.stateHeavy) {
    selected = findStartProfile('speed');
    reason = 'narrow_frontend_polish';
  } else if (bundle?.id?.startsWith('frontend') && routeCount <= 1 && componentCount <= 3 && route.confidence >= 0.85 && risk === 'low') {
    selected = findStartProfile('speed');
    reason = 'small_frontend_surface';
  }

  return {
    ...selected,
    explicit: false,
    recommended: selected.id,
    reason,
  };
}

function recommendStartAddOns(bundle, context = {}) {
  const recommendations = [];
  const goal = context.goal || '';
  const route = context.route || {};
  const packageGraph = context.packageGraph || {};
  const frontendProfile = context.frontendProfile || null;
  const frontendIntent = classifyFrontendIntent(goal, frontendProfile);
  const repoShape = packageGraph.repoShape || route.repoSignals?.repoShape || 'standard';
  const packageCount = Number(packageGraph.packageCount || route.repoSignals?.packageCount || 0);
  const commandPackId = frontendProfile?.recommendedCommandPack?.id || frontendProfile?.commandPack || '';

  const push = (id, reason) => {
    const addOn = findStartAddOn(id);
    if (!addOn) {
      return;
    }
    if (bundle?.supportedAddOns && !bundle.supportedAddOns.includes(id)) {
      return;
    }
    if (recommendations.some((entry) => entry.id === id)) {
      return;
    }
    recommendations.push({
      id: addOn.id,
      label: addOn.label,
      summary: addOn.summary,
      reason,
    });
  };

  if (bundle?.id?.startsWith('frontend') || frontendIntent.frontend) {
    const frontendReasons = {
      browser: 'frontend_surface',
      surface: 'surface_complexity_detected',
      'design-system': 'design_system_alignment_worthwhile',
      state: 'state_coverage_worthwhile',
      docs: 'frontend_brief_or_design_refs',
      trust: 'frontend_quality_or_release_goal',
      handoff: 'frontend_release_handoff',
    };
    for (const id of frontendIntent.suggestedAddOns) {
      push(id, frontendReasons[id] || `frontend_${frontendIntent.lane}`);
    }
  }

  if (bundle?.id === 'ship-closeout'
      || /\b(ship|release|readiness|closeout|handoff|launch)\b/i.test(goal)
      || ['review-wave', 'repo-audit-wave', 'monorepo-audit-wave'].includes(bundle?.id)) {
    push('trust', bundle?.id === 'ship-closeout' ? 'ship_bundle' : 'review_or_release_goal');
  }

  if (bundle?.id?.startsWith('frontend')
      || route.lane === 'frontend'
      || frontendProfile?.planningSignals?.previewRequested
      || /\b(browser|preview|responsive|visual|a11y|accessibility)\b/i.test(goal)) {
    push('browser', bundle?.id?.startsWith('frontend') ? 'frontend_surface' : 'visual_verification_goal');
  }

  if (repoShape === 'monorepo'
      || packageCount >= 5
      || bundle?.id === 'monorepo-audit-wave'
      || /\b(parallel|delegate|packages|workspace|fan out|wave)\b/i.test(goal)) {
    push('parallel', repoShape === 'monorepo' ? 'monorepo_scope' : 'parallel_scope_requested');
  }

  if (bundle?.id === 'ship-closeout'
      || bundle?.id === 'frontend-ship-readiness'
      || /\b(handoff|report|release notes|pr brief|summary|share with team|deliverable)\b/i.test(goal)) {
    push('handoff', bundle?.id === 'ship-closeout' || bundle?.id === 'frontend-ship-readiness' ? 'closeout_bundle' : 'handoff_language_detected');
  }

  if (['repo-audit-wave', 'monorepo-audit-wave'].includes(bundle?.id)
      || ['frontend-full-brief', 'mobile-surface-pack'].includes(commandPackId)
      || /\b(packet|docs?|documentation|spec|roadmap|brief|explain)\b/i.test(goal)) {
    push('docs', ['frontend-full-brief', 'mobile-surface-pack'].includes(commandPackId)
      ? 'frontend_pack_requires_docs'
      : bundle?.id?.includes('audit')
        ? 'audit_bundle_benefits_from_packet'
        : 'docs_language_detected');
  }

  if ((bundle?.id === 'frontend-delivery' || bundle?.id === 'frontend-refactor')
      && (frontendIntent.signals?.fullBriefSurface
        || (bundle?.id === 'frontend-refactor' && (frontendIntent.signals?.componentHeavy || frontendIntent.signals?.multiRoute))
        || /\b(routes?|screens?|pages?|inventory|blueprint)\b/i.test(goal))) {
    push('surface', 'frontend_surface_inventory');
  }

  if (bundle?.id?.startsWith('frontend')
      && (frontendIntent.signals?.designSystemWeak || /\b(design system|tokens?|spacing|typography|consistency)\b/i.test(goal))) {
    push('design-system', 'frontend_design_system_alignment');
  }

  if (['review-wave', 'repo-audit-wave', 'monorepo-audit-wave', 'correction-wave'].includes(bundle?.id)
      || (wantsCorrectionGoal(goal) && route.lane === 'review')) {
    push('repair', bundle?.id === 'correction-wave' ? 'correction_bundle' : 'review_to_correction_bridge');
  }

  if (['review-wave', 'repo-audit-wave', 'monorepo-audit-wave', 'correction-wave', 'ship-closeout'].includes(bundle?.id)
      || /\b(regression|verify|re-review|coverage|tests?|ship|closeout)\b/i.test(goal)) {
    push('regression', bundle?.id === 'ship-closeout' ? 'closeout_verify_surface' : 'verification_matrix_worthwhile');
  }

  if (['repo-audit-wave', 'monorepo-audit-wave', 'correction-wave'].includes(bundle?.id)
      && (repoShape === 'monorepo' || packageCount >= 5 || /\b(owner|ownership|hotspot|codeowners?)\b/i.test(goal))) {
    push('ownership', repoShape === 'monorepo' ? 'monorepo_hotspot_ownership' : 'repo_hotspot_ownership');
  }

  if (['monorepo-audit-wave', 'correction-wave'].includes(bundle?.id)
      && (repoShape === 'monorepo' || packageCount >= 5 || /\b(shard|subsystem|package wave|next area|next shard)\b/i.test(goal))) {
    push('shard', repoShape === 'monorepo' ? 'large_repo_shard_planning' : 'ranked_wave_planning');
  }

  return recommendations;
}

function normalizeStartAddOns(requested) {
  const tokens = [];
  const pushValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }
    String(value || '')
      .split(/[|,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => tokens.push(entry));
  };
  pushValue(requested);
  return [...new Set(tokens.map((entry) => entry.toLowerCase()))];
}

function resolveStartAddOns(bundle, requested, recommended = []) {
  const explicitTokens = normalizeStartAddOns(requested);
  const resolved = [];
  const ignored = [];
  const unknown = [];
  const recommendedIds = recommended.map((entry) => entry.id);

  const pushResolved = (addOn, reason) => {
    if (bundle?.supportedAddOns && !bundle.supportedAddOns.includes(addOn.id)) {
      ignored.push({ id: addOn.id, reason: 'unsupported_for_bundle' });
      return;
    }
    if (resolved.some((entry) => entry.id === addOn.id)) {
      return;
    }
    resolved.push({
      id: addOn.id,
      label: addOn.label,
      summary: addOn.summary,
      reason,
    });
  };

  for (const token of explicitTokens) {
    if (token === 'recommended' || token === 'auto') {
      for (const addOnId of recommendedIds) {
        const addOn = findStartAddOn(addOnId);
        if (addOn) {
          pushResolved(addOn, 'recommended');
        }
      }
      continue;
    }
    const addOn = findStartAddOn(token);
    if (!addOn) {
      unknown.push(token);
      continue;
    }
    pushResolved(addOn, 'explicit');
  }

  return {
    requested: explicitTokens,
    applied: resolved,
    ignored,
    unknown,
  };
}

function scoreBundleCandidate(bundle, selectedBundle, context = {}) {
  const goal = context.goal || '';
  const route = context.route || {};
  const packageGraph = context.packageGraph || {};
  const frontendProfile = context.frontendProfile || null;
  const frontendIntent = classifyFrontendIntent(goal, frontendProfile);
  const scoreParts = [];
  let score = 0;

  const add = (points, reason) => {
    score += points;
    scoreParts.push(reason);
  };

  const repoShape = packageGraph.repoShape || route.repoSignals?.repoShape || 'standard';
  const commandPackId = frontendProfile?.recommendedCommandPack?.id || frontendProfile?.commandPack || '';

  if (bundle.id === selectedBundle?.id) {
    add(100, 'selected_bundle');
  }
  if (route.commandPlan?.bundleId === bundle.id) {
    add(20, 'route_command_plan');
  }
  if (bundle.id === 'correction-wave' && (route.commandPlan?.bundleId === 'correction-wave' || wantsCorrectionGoal(goal))) {
    add(14, 'correction_goal');
  }
  if ((selectedBundle?.relatedBundles || []).includes(bundle.id)) {
    add(8, 'related_bundle');
  }
  if (route.lane === 'frontend' && bundle.id.startsWith('frontend')) {
    add(12, 'frontend_lane');
  }
  if (frontendIntent.frontend && bundle.id === frontendIntent.primaryBundleId) {
    add(14, 'frontend_intent_lane');
  }
  if (frontendIntent.frontend && frontendIntent.candidateBundleIds.slice(1).includes(bundle.id)) {
    add(6, 'frontend_candidate_bundle');
  }
  if ((route.lane === 'review' || /review/i.test(route.capability || '')) && ['review-wave', 'repo-audit-wave', 'monorepo-audit-wave', 'correction-wave'].includes(bundle.id)) {
    add(10, 'review_lane');
  }
  if (repoShape === 'monorepo' && bundle.id === 'monorepo-audit-wave') {
    add(12, 'monorepo_repo_shape');
  }
  if (repoShape !== 'monorepo' && bundle.id === 'repo-audit-wave' && /\b(repo|codebase|whole repo|full repo|entire repo|audit)\b/i.test(goal)) {
    add(10, 'repo_wide_goal');
  }
  if (/\b(ship|release|readiness|closeout|launch)\b/i.test(goal) && bundle.id === 'ship-closeout') {
    add(12, 'ship_goal');
  }
  if (/\b(ui review|frontend audit|responsive|accessibility|browser verify|design debt|visual review|a11y)\b/i.test(goal) && bundle.id === 'frontend-review') {
    add(12, 'frontend_review_goal');
  }
  if (/\b(refactor|restructure|extract|componentize|cleanup|modernize|dedupe|shared primitives)\b/i.test(goal) && bundle.id === 'frontend-refactor') {
    add(12, 'frontend_refactor_goal');
  }
  if (/\b(polish|consistency|design system|tokens?|spacing|typography|fit and finish|empty state|loading state)\b/i.test(goal) && bundle.id === 'frontend-polish') {
    add(12, 'frontend_polish_goal');
  }
  if (/\b(ship|release|readiness|launch|signoff|smoke)\b/i.test(goal) && wantsFrontendProductWork(goal) && !isRepoWideGoal(goal) && bundle.id === 'frontend-ship-readiness') {
    add(12, 'frontend_ship_goal');
  }
  if (wantsFrontendProductWork(goal) && !isRepoWideGoal(goal) && bundle.id === 'frontend-delivery') {
    add(10, 'frontend_product_goal');
  }
  if (wantsFrontendProductWork(goal) && !isRepoWideGoal(goal) && bundle.id === 'frontend-review' && /\b(review|audit|responsive|accessibility|a11y|quality|debt)\b/i.test(goal)) {
    add(9, 'frontend_quality_goal');
  }
  if (bundle.id === 'frontend-delivery' && ['frontend-full-brief', 'mobile-surface-pack'].includes(commandPackId)) {
    add(8, 'frontend_pack');
  }
  if (bundle.id === 'correction-wave' && /\b(blocker|findings|patch wave|repair)\b/i.test(goal)) {
    add(10, 'findings_driven_correction');
  }
  if (bundle.id === 'slice-delivery' && score === 0) {
    add(3, 'safe_default');
  }

  return {
    id: bundle.id,
    label: bundle.label,
    shorthand: bundle.shorthand,
    summary: bundle.summary,
    score,
    reasons: scoreParts,
    starterCommand: buildStartEntryCommand(bundle.id, goal),
  };
}

function buildBundleCandidates(selectedBundle, context = {}) {
  return listWorkflowBundles()
    .map((bundle) => scoreBundleCandidate(bundle, selectedBundle, context))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.label.localeCompare(right.label);
    });
}

function buildStartRecommendation(bundle, context = {}) {
  const profile = recommendStartProfile(bundle, context);
  const recommendedAddOns = recommendStartAddOns(bundle, context);
  const candidates = buildBundleCandidates(bundle, context);
  return {
    profile,
    recommendedAddOns,
    candidates,
    starterCommand: buildStartEntryCommand(bundle?.id, context.goal, {
      profileId: profile.id,
      addOnIds: recommendedAddOns.map((entry) => entry.id),
    }),
  };
}

module.exports = {
  START_ADDONS,
  START_PROFILES,
  buildBundleCandidates,
  buildStartEntryCommand,
  buildStartRecommendation,
  findStartAddOn,
  findStartProfile,
  listStartAddOns,
  listStartProfiles,
  normalizeStartAddOns,
  recommendStartAddOns,
  recommendStartProfile,
  resolveStartAddOns,
};
