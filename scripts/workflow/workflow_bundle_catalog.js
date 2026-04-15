const WORKFLOW_BUNDLES = Object.freeze([
  {
    id: 'slice-delivery',
    label: 'Slice Delivery',
    summary: 'Default implementation bundle for normal repos: route, shape the slice, fix safely, and verify before closeout.',
    aliases: ['slice', 'default', 'delivery', 'ship-slice'],
    shorthand: 'slice',
    starterCommand: 'rai start slice --goal "<goal>"',
    relatedBundles: ['review-wave', 'ship-closeout'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'parallel'],
    defaultProfile: 'balanced',
    useWhen: [
      'Normal repos where the operator mostly needs one clean implementation lane.',
      'Work that should feel like a product workflow instead of ad hoc audit + fix command hunting.',
    ],
    outcomes: [
      'Intent route, slice plan, bounded fix, verification, and ship-readiness stay connected.',
      'The user gets one reproducible starter command instead of multiple overlapping commands.',
    ],
  },
  {
    id: 'review-wave',
    label: 'Review Wave',
    summary: 'Blocker-first diff or scoped review bundle with review-mode, task graphing, bounded fixes, re-review, and trust checks.',
    aliases: ['review', 'diff-review', 'scoped-review'],
    shorthand: 'review',
    starterCommand: 'rai start review --goal "<goal>"',
    relatedBundles: ['correction-wave', 'repo-audit-wave', 'ship-closeout'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'parallel', 'ownership', 'regression', 'repair'],
    defaultProfile: 'balanced',
    useWhen: [
      'The main job is understanding blockers, regressions, or risk in a diff or bounded scope.',
      'You want findings, fix waves, and verification to stay in one review-native plan.',
    ],
    outcomes: [
      'Review artifacts, task graphing, fix waves, re-review, and trust checks stay in one chain.',
      'The operator does not have to choose manually between audit, review-mode, fix, and verify entrypoints.',
    ],
  },
  {
    id: 'repo-audit-wave',
    label: 'Repo Audit Wave',
    summary: 'Repo-wide audit bundle that starts graph-native, ranks risk, orchestrates review waves, and narrows the first fix lane.',
    aliases: ['repo', 'audit', 'codebase', 'full-repo'],
    shorthand: 'repo',
    starterCommand: 'rai start repo --goal "<goal>"',
    relatedBundles: ['correction-wave', 'review-wave', 'monorepo-audit-wave'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'parallel', 'ownership', 'regression', 'shard', 'repair'],
    defaultProfile: 'balanced',
    useWhen: [
      'The operator needs repo-wide risk ranking before opening code changes.',
      'A normal repo has grown large enough that review should start from a heatmap and audit spine.',
    ],
    outcomes: [
      'Repo health, review orchestration, first fix lane, and readiness scoring stay in one plan.',
      'Large-scope review work starts graph-native instead of pretending the work is only a diff.',
    ],
  },
  {
    id: 'monorepo-audit-wave',
    label: 'Monorepo Audit Wave',
    summary: 'Large-repo bundle that combines repo map, subsystem ranking, package-aware review orchestration, correction waves, and verification.',
    aliases: ['monorepo', 'large-repo', 'workspace', 'packages'],
    shorthand: 'monorepo',
    starterCommand: 'rai start monorepo --goal "<goal>"',
    relatedBundles: ['correction-wave', 'repo-audit-wave', 'review-wave'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'parallel', 'ownership', 'regression', 'shard', 'repair'],
    defaultProfile: 'balanced',
    useWhen: [
      'A monorepo or workspace repo needs staged audit, package ranking, and bounded correction waves.',
      'The user wants package-aware planning instead of one giant repo-wide patch pass.',
    ],
    outcomes: [
      'Repo map, review scope, task waves, and verify discipline stay package-aware.',
      'Parallel planning and bounded write scopes can be layered on top without losing the main lane.',
    ],
  },
  {
    id: 'correction-wave',
    label: 'Correction Wave',
    summary: 'Unified review-correction control-plane bundle that triages findings, opens surgical and bounded-refactor waves, then verifies and re-reviews closure.',
    aliases: ['correction', 'fix-wave', 'repair-wave', 'code-correction', 'patch-wave'],
    shorthand: 'correction',
    starterCommand: 'rai start correction --goal "<goal>"',
    relatedBundles: ['review-wave', 'repo-audit-wave', 'monorepo-audit-wave', 'ship-closeout'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'parallel', 'ownership', 'regression', 'shard', 'repair'],
    defaultProfile: 'balanced',
    useWhen: [
      'The operator already has findings and now needs a productized correction lane instead of ad hoc fix commands.',
      'You want surgical patches, bounded refactors, verification, and re-review to feel like one closing workflow.',
    ],
    outcomes: [
      'Findings registry, correction board, verify queue, and re-review closure stay connected.',
      'High-confidence patches and risky refactors are split into visible waves instead of one blob of fixes.',
    ],
  },
  {
    id: 'frontend-delivery',
    label: 'Frontend Delivery',
    summary: 'Frontend product bundle that identifies the surface first, then runs direction, spec, state, component, plan, recipe, and review lanes together.',
    aliases: ['frontend', 'ui', 'web', 'design', 'surface'],
    shorthand: 'frontend',
    starterCommand: 'rai start frontend --goal "<goal>"',
    relatedBundles: ['frontend-refactor', 'frontend-polish', 'frontend-review'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'browser', 'surface', 'design-system', 'state'],
    defaultProfile: 'balanced',
    useWhen: [
      'UI work should start from surface identification, not from arbitrary design or patch commands.',
      'The product surface has meaningful state, taste, layout, or component planning needs.',
    ],
    outcomes: [
      'Routing, direction, spec, state, component, execution plan, and review can be launched as one product lane.',
      'Frontend identification directly informs which complementary commands belong in the same start plan.',
    ],
  },
  {
    id: 'frontend-review',
    label: 'Frontend Review',
    summary: 'Frontend quality bundle focused on responsive, accessibility, state, design debt, and browser-backed review evidence.',
    aliases: ['ui-review', 'frontend-audit', 'design-review', 'responsive-review'],
    shorthand: 'frontend-review',
    starterCommand: 'rai start frontend-review --goal "<goal>"',
    relatedBundles: ['frontend-polish', 'frontend-delivery', 'frontend-ship-readiness'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'browser', 'surface', 'design-system', 'state'],
    defaultProfile: 'balanced',
    useWhen: [
      'The main job is validating UI quality, not planning a new interface from scratch.',
      'Responsive, accessibility, visual, or browser proof should be packaged together.',
    ],
    outcomes: [
      'UI review scorecards, responsive debt, design debt, and trust checks stay in one lane.',
      'The operator gets a quality stack instead of multiple disconnected frontend audit commands.',
    ],
  },
  {
    id: 'frontend-refactor',
    label: 'Frontend Refactor',
    summary: 'Surface-architecture bundle for component extraction, route cleanup, reuse planning, and safe UI refactors.',
    aliases: ['ui-refactor', 'component-refactor', 'frontend-restructure', 'componentize'],
    shorthand: 'frontend-refactor',
    starterCommand: 'rai start frontend-refactor --goal "<goal>"',
    relatedBundles: ['frontend-delivery', 'frontend-polish', 'frontend-review'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'browser', 'surface', 'design-system', 'state'],
    defaultProfile: 'balanced',
    useWhen: [
      'The user needs cleaner shared components, route boundaries, or better UI architecture instead of a net-new surface.',
      'You want page inventory, component mapping, and extraction strategy to stay in one refactor-native plan.',
    ],
    outcomes: [
      'Component inventory, page blueprinting, extraction strategy, and verification stay connected.',
      'Frontend cleanup work no longer collapses into a generic delivery or review lane.',
    ],
  },
  {
    id: 'frontend-polish',
    label: 'Frontend Polish',
    summary: 'Consistency-first bundle for design-system alignment, UX-state coverage, responsive polish, and visual fit-and-finish.',
    aliases: ['ui-polish', 'consistency', 'design-system-fix', 'ui-alignment'],
    shorthand: 'frontend-polish',
    starterCommand: 'rai start frontend-polish --goal "<goal>"',
    relatedBundles: ['frontend-review', 'frontend-refactor', 'frontend-ship-readiness'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'browser', 'surface', 'design-system', 'state'],
    defaultProfile: 'balanced',
    useWhen: [
      'The surface mostly exists, but consistency, tokens, spacing, states, or responsive quality need tightening.',
      'You want the harness to group overlapping polish commands instead of treating them as ad hoc one-offs.',
    ],
    outcomes: [
      'Design-system alignment, UX-state ownership, responsive proof, and browser evidence stay in one lane.',
      'Frontend polish becomes a repeatable product workflow instead of a grab bag of commands.',
    ],
  },
  {
    id: 'frontend-ship-readiness',
    label: 'Frontend Ship Readiness',
    summary: 'Browser-first closeout bundle for UI surfaces that need review evidence, state coverage, and release-facing trust checks before launch.',
    aliases: ['frontend-ship', 'ui-ship', 'visual-ship', 'frontend-closeout'],
    shorthand: 'frontend-ship',
    starterCommand: 'rai start frontend-ship --goal "<goal>"',
    relatedBundles: ['ship-closeout', 'frontend-review', 'frontend-polish'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'browser', 'state'],
    defaultProfile: 'balanced',
    useWhen: [
      'The main question is whether a UI surface is actually safe to release, demo, or hand off.',
      'You need browser proof, UI review evidence, responsive coverage, and ship-readiness in one flow.',
    ],
    outcomes: [
      'Frontend-specific proof stays visible all the way into release gating.',
      'Generic closeout work can be narrowed into a UI-native ship lane when the surface is visual or interaction-heavy.',
    ],
  },
  {
    id: 'ship-closeout',
    label: 'Ship Closeout',
    summary: 'Verification and release bundle that consolidates verify-work, ship-readiness, review packaging, and release closeout artifacts.',
    aliases: ['ship', 'closeout', 'release', 'verify-release'],
    shorthand: 'ship',
    starterCommand: 'rai start ship --goal "<goal>"',
    relatedBundles: ['correction-wave', 'review-wave', 'slice-delivery'],
    supportedProfiles: ['speed', 'balanced', 'deep'],
    supportedAddOns: ['trust', 'docs', 'handoff', 'regression'],
    defaultProfile: 'balanced',
    useWhen: [
      'The main question is whether the current state is safe to ship or hand off.',
      'You want verification, blocker scoring, and delivery artifacts in one closeout surface.',
    ],
    outcomes: [
      'Verify, review packaging, release notes, and reporting stay connected.',
      'Closeout work becomes a guided product flow instead of scattered finishing commands.',
    ],
  },
]);

const BUNDLE_INDEX = new Map();
for (const bundle of WORKFLOW_BUNDLES) {
  BUNDLE_INDEX.set(bundle.id, bundle);
  for (const alias of bundle.aliases || []) {
    BUNDLE_INDEX.set(alias, bundle);
  }
  if (bundle.shorthand) {
    BUNDLE_INDEX.set(bundle.shorthand, bundle);
  }
}

function normalizeBundleToken(value) {
  return String(value || '').trim().toLowerCase();
}

function findWorkflowBundle(value) {
  const normalized = normalizeBundleToken(value);
  return normalized ? (BUNDLE_INDEX.get(normalized) || null) : null;
}

function listWorkflowBundles() {
  return WORKFLOW_BUNDLES.map((bundle) => ({ ...bundle }));
}

function bundleStarterCommand(bundleId, goal, options = {}) {
  const bundle = findWorkflowBundle(bundleId);
  if (!bundle) {
    return '';
  }
  const qGoal = JSON.stringify(String(goal || '').trim() || '<goal>');
  const args = ['rai', 'start', bundle.shorthand || bundle.id, '--goal', qGoal];
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

module.exports = {
  WORKFLOW_BUNDLES,
  bundleStarterCommand,
  findWorkflowBundle,
  listWorkflowBundles,
  normalizeBundleToken,
};
