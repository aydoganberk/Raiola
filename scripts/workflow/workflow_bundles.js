const childProcess = require('node:child_process');
const path = require('node:path');
const { buildDoPayload } = require('./do');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildFrontendProfile } = require('./map_frontend');
const { buildPackageGraph } = require('./package_graph');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const { findWorkflowBundle, bundleStarterCommand, listWorkflowBundles } = require('./workflow_bundle_catalog');
const { buildFrontendStartSummary, classifyFrontendIntent } = require('./workflow_frontend_start');
const {
  buildBundleCandidates,
  buildStartEntryCommand,
  buildStartRecommendation,
  listStartAddOns,
  listStartProfiles,
  recommendStartAddOns,
  recommendStartProfile,
  resolveStartAddOns,
} = require('./workflow_start_intelligence');

function quoteGoal(goal) {
  return JSON.stringify(String(goal || '').trim());
}

function rel(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function wantsFrontendReview(goal) {
  return /\b(ui review|frontend review|frontend audit|responsive|accessibility|design debt|visual review|browser verify|browser verification|a11y)\b/i.test(String(goal || ''));
}

function wantsFrontendProductWork(goal) {
  return /\b(frontend|ui|ux|design|surface|screen|dashboard|page|layout|component|taste|landing|hero|mobile|web app|journey)\b/i.test(String(goal || ''));
}

function wantsCorrectionGoal(goal) {
  return /\b(fix|correct|patch|repair|remediate|address findings|close blockers|cleanup findings|hardening|stabilize|re-review)\b/i.test(String(goal || ''));
}

function selectBundleId(options = {}) {
  if (options.bundleId) {
    const explicit = findWorkflowBundle(options.bundleId);
    return explicit?.id || 'slice-delivery';
  }

  const route = options.route || {};
  const goal = options.goal || '';
  const repoWideGoal = /\b(repo|codebase|full repo|whole repo|entire repo|oneshot|one-shot|monorepo|workspace|package|packages|subsystem)\b/i.test(goal);
  const frontendIntent = classifyFrontendIntent(goal, options.frontendProfile || null);
  const frontendGoal = frontendIntent.frontend || wantsFrontendProductWork(goal) || wantsFrontendReview(goal);

  if (frontendGoal && !repoWideGoal) {
    if (frontendIntent.lane === 'ship-readiness') {
      return 'frontend-ship-readiness';
    }
    if (frontendIntent.lane === 'review') {
      return 'frontend-review';
    }
    if (frontendIntent.lane === 'refactor') {
      return 'frontend-refactor';
    }
    if (frontendIntent.lane === 'polish') {
      return 'frontend-polish';
    }
    if (route.commandPlan?.bundleId && route.commandPlan.bundleId.startsWith('frontend')) {
      return route.commandPlan.bundleId;
    }
    return 'frontend-delivery';
  }
  if (route.commandPlan?.bundleId) {
    return route.commandPlan.bundleId;
  }
  if (wantsCorrectionGoal(goal) && (route.lane === 'review' || /review|fix/.test(route.capability || '') || repoWideGoal)) {
    return 'correction-wave';
  }
  if (route.capability?.includes('ship') || route.capability?.includes('verify') || /\b(ship|release|readiness|go live|launch)\b/i.test(goal)) {
    return 'ship-closeout';
  }
  if (route.lane === 'review' || route.capability?.includes('review')) {
    return route.repoSignals?.monorepo ? 'monorepo-audit-wave' : repoWideGoal
      ? (route.repoSignals?.monorepo ? 'monorepo-audit-wave' : 'repo-audit-wave')
      : 'review-wave';
  }
  if (route.repoSignals?.monorepo && /\b(repo|codebase|audit|workspace|package|packages|subsystem)\b/i.test(goal)) {
    return 'monorepo-audit-wave';
  }
  return 'slice-delivery';
}

function makeStep(command, options = {}) {
  const args = Array.isArray(options.args) ? options.args : [];
  return {
    id: options.id || String(command).replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase(),
    label: options.label || command,
    command,
    args,
    cli: [command, ...args].join(' '),
    reason: options.reason || '',
    family: options.family || 'inspect',
    autoRunnable: options.autoRunnable !== false,
    optional: Boolean(options.optional),
  };
}

function buildBundlePhases(bundleId, goal, context = {}) {
  const qGoal = quoteGoal(goal);
  const routeCommand = context.route?.commandPlan?.resolvedPrimaryCommand || `rai do --goal ${qGoal}`;
  const monorepo = Boolean(context.route?.repoSignals?.monorepo || context.packageGraph?.repoShape === 'monorepo');

  const phases = {
    'slice-delivery': [
      {
        id: 'inspect',
        label: 'Inspect + route',
        objective: 'Capture the user intent, select the lane, and open the first bounded artifact set.',
        commands: [
          makeStep('rai do', { args: ['--goal', String(goal), '--json'], label: 'Route the goal', reason: 'Pick the safest lane before deep work.', family: 'inspect' }),
          makeStep(monorepo ? 'rai monorepo' : 'rai audit', { args: monorepo ? ['--json'] : ['--goal', String(goal), '--json'], label: monorepo ? 'Map package scope' : 'Run a first audit', reason: 'Surface repo structure and the first risk line.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Shape + plan',
        objective: 'Turn the routed work into a plan the harness can start without extra command hunting.',
        commands: [
          makeStep('rai plan', { args: ['--goal', String(goal), '--json'], label: 'Plan the slice', reason: 'Split the slice into explicit steps.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Generate the first correction wave', reason: 'Convert the plan or audit into a bounded fix lane.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Prove + close',
        objective: 'Verify the bounded wave, then surface closeout readiness and next actions.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify the slice', reason: 'Check trust gates before closeout.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Translate verification into a ship-facing view.', family: 'closeout' }),
        ],
      },
    ],
    'review-wave': [
      {
        id: 'inspect',
        label: 'Inspect + isolate',
        objective: 'Start with a diff-aware review artifact instead of a vague scan.',
        commands: [
          makeStep('rai audit', { args: ['--goal', String(goal), '--json'], label: 'Route into audit facade', reason: 'Choose review-mode or repo-native audit using the same operator entry.', family: 'inspect' }),
          makeStep('rai review-mode', { args: ['--goal', String(goal), '--json'], label: 'Run review-mode', reason: 'Build the blocker-first review spine.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Shape fixes',
        objective: 'Turn findings into an executable graph and prepare a correction wave.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Build review task graph', reason: 'Group findings into triage/fix/verify waves.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Open the bounded fix lane', reason: 'Turn the highest-confidence findings into action.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Re-check + close',
        objective: 'Verify corrections, replay the review, and expose ship blockers.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify the review wave', reason: 'Run trust checks for the correction wave.', family: 'prove' }),
          makeStep('rai re-review', { args: ['--json'], label: 'Replay findings', reason: 'Confirm the original findings are actually addressed.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Convert residual review risk into release language.', family: 'closeout' }),
        ],
      },
    ],
    'repo-audit-wave': [
      {
        id: 'inspect',
        label: 'Audit the whole repo',
        objective: 'Start graph-native and repo-wide before drilling into one subsystem.',
        commands: [
          makeStep('rai audit-repo', { args: ['--mode', 'oneshot', '--goal', String(goal), '--json'], label: 'Run repo audit', reason: 'Create the repo health and heatmap baseline.', family: 'inspect' }),
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Split review waves', reason: 'Organize package/persona review shards from the audit.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Narrow into the first fix lane',
        objective: 'Turn repo-wide risk into an ordered correction queue instead of one giant patch.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Build blocker-first task graph', reason: 'Translate findings into waves.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Start the first correction wave', reason: 'Open the first bounded fix pass after the audit.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close',
        objective: 'Check the first correction wave and keep release visibility explicit.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify the wave', reason: 'Confirm the first repo-wide correction pass.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Surface remaining risk and gate status.', family: 'closeout' }),
        ],
      },
    ],
    'monorepo-audit-wave': [
      {
        id: 'inspect',
        label: 'Map + rank the monorepo',
        objective: 'Treat a large repo as staged tracks, not one undifferentiated blob.',
        commands: [
          makeStep('rai monorepo-mode', { args: ['--goal', String(goal), '--json'], label: 'Run monorepo-mode', reason: 'Build repo map, critical areas, review scope, and patch plan together.', family: 'inspect' }),
          makeStep('rai monorepo', { args: ['--json'], label: 'Refresh monorepo intelligence', reason: 'Keep package graph and write scopes visible.', family: 'inspect' }),
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Split review waves', reason: 'Organize persona/package review coverage on top of the map.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Open the first package wave',
        objective: 'Convert large-repo findings into package-local correction work.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Build task graph', reason: 'Expose triage/fix/verify waves.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Start the bounded fix wave', reason: 'Keep write work local to the chosen subsystem.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-rank',
        objective: 'Finish the current subsystem wave before the next package opens.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify current package wave', reason: 'Run package-aware trust checks.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Show residual risk after the current wave.', family: 'closeout' }),
        ],
      },
    ],
    'correction-wave': [
      {
        id: 'triage',
        label: 'Triage the findings registry',
        objective: 'Open the review-correction control plane, inspect the board, and isolate the next safe wave before patching.',
        commands: [
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Open correction control plane', reason: 'Route the correction lane through the same review/repo/monorepo facade.', family: 'inspect' }),
          makeStep('rai dashboard', { args: ['--json'], label: 'Refresh review control room', reason: 'Keep the findings registry, correction board, and large-repo board visible while triaging.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Open the next correction wave',
        objective: 'Separate surgical fixes from bounded refactors before widening the write surface.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Refresh correction task graph', reason: 'Keep deduped findings grouped into executable waves.', family: 'shape' }),
          makeStep('rai patch-review', { args: ['--json'], label: 'Inspect generated patches', reason: 'Review the bounded patch set before verifying the wave.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Re-open bounded fix lane', reason: 'Promote the highest-confidence fixes into the current correction wave.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-review closure',
        objective: 'Finish with targeted verification, then replay the original review lane before closing findings.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify the correction wave', reason: 'Run the verify queue for the current patch wave.', family: 'prove' }),
          makeStep('rai re-review', { args: ['--json'], label: 'Replay the review lane', reason: 'Confirm the original blockers and findings are actually closed.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score residual risk', reason: 'Surface anything that still blocks closure after the wave lands.', family: 'closeout' }),
        ],
      },
    ],
    'frontend-delivery': [
      {
        id: 'identify',
        label: 'Identify the surface',
        objective: 'Lock the actual frontend shape before widening direction or implementation artifacts.',
        commands: [
          makeStep('rai map-frontend', { args: ['--json'], label: 'Map the frontend surface', reason: 'Detect framework, routing, design system, and command pack.', family: 'inspect' }),
          makeStep('rai ui-direction', { args: ['--goal', String(goal), '--json'], label: 'Generate UI direction', reason: 'Set the product taste and signature moments.', family: 'inspect' }),
          makeStep('rai ui-spec', { args: ['--goal', String(goal), '--json'], label: 'Generate the canonical spec', reason: 'Freeze the initial UI contract before patching.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Shape the implementation lane',
        objective: 'Combine state, component, and execution planning into one package instead of separate operator guesses.',
        commands: [
          makeStep('rai state-atlas', { args: ['--goal', String(goal), '--json'], label: 'Build the state atlas', reason: 'Own empty/loading/error/success states early.', family: 'shape' }),
          makeStep('rai component-strategy', { args: ['--goal', String(goal), '--json'], label: 'Build component strategy', reason: 'Choose reuse/extract/build intentionally.', family: 'shape' }),
          makeStep('rai ui-plan', { args: ['--goal', String(goal), '--json'], label: 'Build the UI execution plan', reason: 'Sequence the implementation into a tractable wave.', family: 'shape' }),
          makeStep('rai ui-recipe', { args: ['--goal', String(goal), '--json'], label: 'Generate a scaffold recipe', reason: 'Translate the plan into a native-first implementation scaffold.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Review + verify',
        objective: 'Finish with a visual and trust-aware proving pass.',
        commands: [
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run UI review', reason: 'Check responsive, accessibility, state, and design debt together.', family: 'prove' }),
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Run trust checks', reason: 'Connect UI evidence to ship-facing verification.', family: 'prove' }),
        ],
      },
    ],
    'frontend-review': [
      {
        id: 'identify',
        label: 'Identify the reviewed surface',
        objective: 'Map the frontend and open the right review lanes before fixing symptoms.',
        commands: [
          makeStep('rai map-frontend', { args: ['--json'], label: 'Map the frontend surface', reason: 'Confirm the actual route, design system, and pack.', family: 'inspect' }),
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run full UI review', reason: 'Collect the main scorecard and evidence.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Surface the quality debt',
        objective: 'Expand overlap-heavy frontend checks into one packaged review stack.',
        commands: [
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Build responsive matrix', reason: 'Make viewport expectations explicit.', family: 'shape' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Build design debt ledger', reason: 'Expose repeated quality issues that should be fixed together.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close',
        objective: 'Translate frontend evidence into release-facing trust checks.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Run trust checks', reason: 'Connect the review evidence to verification.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Show whether the reviewed frontend is safe to ship.', family: 'closeout' }),
        ],
      },
    ],
    'frontend-refactor': [
      {
        id: 'identify',
        label: 'Map the shared surface',
        objective: 'Inventory routes, screens, and reusable components before moving JSX around.',
        commands: [
          makeStep('rai map-frontend', { args: ['--json'], label: 'Map the frontend surface', reason: 'Confirm framework, routing, surface type, and command pack.', family: 'inspect' }),
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Expose the reuse graph that refactors should respect.', family: 'inspect' }),
          makeStep('rai page-blueprint', { args: ['--goal', String(goal), '--json'], label: 'Generate page blueprint', reason: 'Reveal page families and repeated layout pressure before extraction.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Design the refactor wave',
        objective: 'Choose extraction boundaries, shared ownership, and state responsibilities in one plan.',
        commands: [
          makeStep('rai component-strategy', { args: ['--goal', String(goal), '--json'], label: 'Build component strategy', reason: 'Decide what to reuse, extract, or consolidate.', family: 'shape' }),
          makeStep('rai state-atlas', { args: ['--goal', String(goal), '--json'], label: 'Build the state atlas', reason: 'Keep UX states attached to the new component boundaries.', family: 'shape' }),
          makeStep('rai ui-plan', { args: ['--goal', String(goal), '--json'], label: 'Build the refactor plan', reason: 'Sequence the UI refactor into safe, reviewable waves.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Review the rebuilt surface',
        objective: 'Prove that the refactor improved structure without introducing visual or state drift.',
        commands: [
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run UI review', reason: 'Check the refactored surface for responsive, a11y, and state regressions.', family: 'prove' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Refresh design debt ledger', reason: 'Catch consistency regressions introduced during restructuring.', family: 'prove' }),
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Run trust checks', reason: 'Keep the refactor connected to release-facing verification.', family: 'prove' }),
        ],
      },
    ],
    'frontend-polish': [
      {
        id: 'identify',
        label: 'Audit the visual surface',
        objective: 'Start from the real UI debt instead of polishing blindly.',
        commands: [
          makeStep('rai map-frontend', { args: ['--json'], label: 'Map the frontend surface', reason: 'Confirm the surface type, routing, and UI system before polishing.', family: 'inspect' }),
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run UI review', reason: 'Collect the main quality scorecard for the touched surface.', family: 'inspect' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Build design debt ledger', reason: 'Expose repeated visual or system-level issues that should be fixed together.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Align the system and states',
        objective: 'Tighten tokens, primitives, and UX states as one consistency wave.',
        commands: [
          makeStep('rai design-dna', { args: ['--goal', String(goal), '--json'], label: 'Blend design references', reason: 'Clarify the intended visual standard before polishing starts.', family: 'shape' }),
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Expose where shared primitives should absorb repeated fixes.', family: 'shape' }),
          makeStep('rai state-atlas', { args: ['--goal', String(goal), '--json'], label: 'Build the state atlas', reason: 'Keep empty/loading/error/success states in the same polish wave.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Check responsive fit-and-finish',
        objective: 'Finish with visual proof, responsive checks, and trust-facing verification.',
        commands: [
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Make viewport expectations explicit before signoff.', family: 'prove' }),
          makeStep('rai preview', { args: ['--json'], label: 'Refresh preview gallery', reason: 'Keep current visual evidence visible while polishing.', family: 'prove' }),
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Run trust checks', reason: 'Connect the polished surface to the trust lane.', family: 'prove' }),
        ],
      },
    ],
    'frontend-ship-readiness': [
      {
        id: 'identify',
        label: 'Collect UI release evidence',
        objective: 'Map the surface and gather the latest review evidence before asking for signoff.',
        commands: [
          makeStep('rai map-frontend', { args: ['--json'], label: 'Map the frontend surface', reason: 'Confirm which surface and command pack are actually being released.', family: 'inspect' }),
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run UI review', reason: 'Collect the main frontend quality verdict before the release gate opens.', family: 'inspect' }),
          makeStep('rai preview', { args: ['--json'], label: 'Refresh preview gallery', reason: 'Keep the latest screenshots or visual artifacts attached to the lane.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Prove coverage before launch',
        objective: 'Check responsive and state coverage before running the release-facing gate.',
        commands: [
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Expose viewport expectations for the released surface.', family: 'shape' }),
          makeStep('rai state-atlas', { args: ['--goal', String(goal), '--json'], label: 'Build the state atlas', reason: 'Confirm UX-state ownership before the release gate.', family: 'shape' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Refresh design debt ledger', reason: 'Keep remaining UI debt visible during release triage.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Run the ship gate',
        objective: 'Translate frontend evidence into browser proof and ship-readiness status.',
        commands: [
          makeStep('rai verify-browser', { args: ['--url', 'http://localhost:3000', '--json'], label: 'Run browser verify', reason: 'Replace the placeholder preview URL before executing this final browser pass.', family: 'prove', autoRunnable: false, optional: true }),
          makeStep('rai verify', { args: ['--goal', String(goal), '--ship', '--json'], label: 'Run ship-facing verification', reason: 'Open the release gate in ship mode with frontend evidence attached.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Convert the UI proof into blockers and next actions.', family: 'closeout' }),
        ],
      },
      {
        id: 'closeout',
        label: 'Package the UI closeout',
        objective: 'Keep the review-facing release package attached to the same frontend lane.',
        commands: [
          makeStep('rai review', { args: ['--json'], label: 'Generate review package', reason: 'Preserve the UI review narrative with the release gate.', family: 'closeout' }),
        ],
      },
    ],
    'ship-closeout': [
      {
        id: 'prove',
        label: 'Verify the current state',
        objective: 'Start with trust checks instead of assuming the current work is ready.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(goal), '--ship', '--json'], label: 'Run ship-facing verification', reason: 'Open the trust gate in release mode.', family: 'prove' }),
          makeStep('rai verify-work', { args: ['--json'], label: 'Inspect fix plan', reason: 'Expose the remaining trust gaps that block release.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Convert the trust view into blockers and next actions.', family: 'closeout' }),
        ],
      },
      {
        id: 'closeout',
        label: 'Package the closeout',
        objective: 'Turn the verified release state into human-readable delivery artifacts.',
        commands: [
          makeStep('rai review', { args: ['--json'], label: 'Generate review package', reason: 'Keep review-facing evidence attached to the release.', family: 'closeout' }),
          makeStep('rai ship', { args: ['--json'], label: 'Generate ship package', reason: 'Create the closeout package.', family: 'closeout' }),
          makeStep('rai release-notes', { args: ['--json'], label: 'Draft release notes', reason: 'Surface the outward-facing delivery narrative.', family: 'closeout' }),
          makeStep('rai session-report', { args: ['--json'], label: 'Generate session report', reason: 'Keep operator continuity intact after the release pass.', family: 'closeout' }),
        ],
      },
    ],
  };

  return phases[bundleId] || phases['slice-delivery'];
}

const PHASE_ORDER = ['identify', 'inspect', 'shape', 'surface', 'design-system', 'state', 'prove', 'trust', 'browser', 'docs', 'parallel', 'closeout', 'handoff'];

function clonePhases(phases = []) {
  return phases.map((phase) => ({
    ...phase,
    commands: (phase.commands || []).map((command) => ({
      ...command,
      args: Array.isArray(command.args) ? [...command.args] : [],
    })),
  }));
}

function phaseOrderIndex(phaseId) {
  const index = PHASE_ORDER.indexOf(String(phaseId || ''));
  return index >= 0 ? index : PHASE_ORDER.length + 1;
}

function ensurePhase(phases, template) {
  const existing = phases.find((phase) => phase.id === template.id);
  if (existing) {
    if (!existing.label && template.label) {
      existing.label = template.label;
    }
    if (!existing.objective && template.objective) {
      existing.objective = template.objective;
    }
    return existing;
  }
  const created = {
    id: template.id,
    label: template.label,
    objective: template.objective,
    commands: [],
  };
  phases.push(created);
  return created;
}

function mergePhaseCollections(basePhases = [], extraPhases = []) {
  const phases = clonePhases(basePhases);
  for (const extraPhase of extraPhases) {
    const target = ensurePhase(phases, extraPhase);
    const seen = new Set((target.commands || []).map((command) => command.cli));
    for (const command of extraPhase.commands || []) {
      if (seen.has(command.cli)) {
        continue;
      }
      target.commands.push({
        ...command,
        args: Array.isArray(command.args) ? [...command.args] : [],
      });
      seen.add(command.cli);
    }
  }
  return phases
    .filter((phase) => Array.isArray(phase.commands) && phase.commands.length > 0)
    .sort((left, right) => phaseOrderIndex(left.id) - phaseOrderIndex(right.id));
}

function profileLimitForPhase(bundleId, phaseId) {
  if (['frontend-delivery', 'frontend-refactor', 'frontend-polish'].includes(bundleId) && phaseId === 'shape') {
    return 3;
  }
  if (bundleId === 'frontend-ship-readiness' && phaseId === 'prove') {
    return 2;
  }
  if (bundleId === 'ship-closeout' && phaseId === 'closeout') {
    return 2;
  }
  return 2;
}

function applySpeedProfile(bundleId, phases = []) {
  return clonePhases(phases).map((phase) => ({
    ...phase,
    commands: phase.commands
      .filter((command) => !command.optional)
      .slice(0, profileLimitForPhase(bundleId, phase.id)),
  })).filter((phase) => phase.commands.length > 0);
}

function deepProfilePhases(bundleId, goal, context = {}) {
  const frontendPackId = context.frontendProfile?.commandPack || context.frontendProfile?.recommendedCommandPack?.id || '';
  const phases = {
    'slice-delivery': [
      {
        id: 'inspect',
        label: 'Inspect + route',
        objective: 'Keep scope, routing, and repo context aligned from the first pass.',
        commands: [
          makeStep('rai spec', { args: ['--goal', String(goal), '--json'], label: 'Lock scope brief', reason: 'Freeze scope and success criteria before patching.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Shape + plan',
        objective: 'Carry the slice through the lifecycle facade instead of leaving the plan half-connected.',
        commands: [
          makeStep('rai build', { args: ['--goal', String(goal), '--json'], label: 'Translate plan into build slice', reason: 'Keep execution attached to the plan.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Prove + close',
        objective: 'Attach lifecycle test and closeout signals to the same slice.',
        commands: [
          makeStep('rai test', { args: ['--goal', String(goal), '--json'], label: 'Generate lifecycle test brief', reason: 'Keep test-facing proof visible next to verify.', family: 'prove' }),
        ],
      },
    ],
    'review-wave': [
      {
        id: 'inspect',
        label: 'Inspect + isolate',
        objective: 'Make the review lane packet-aware before fixes start.',
        commands: [
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Refresh review orchestration', reason: 'Keep review waves and personas explicit.', family: 'inspect' }),
          makeStep('rai packet', { args: ['compile', '--step', 'audit', '--json'], label: 'Compile audit packet', reason: 'Keep the audit context pack warm for the next pass.', family: 'inspect' }),
        ],
      },
      {
        id: 'prove',
        label: 'Re-check + close',
        objective: 'Attach evidence and validation visibility to the review wave.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Make review and verify artifacts queryable.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Keep proof requirements explicit while re-review closes out.', family: 'prove' }),
        ],
      },
    ],
    'repo-audit-wave': [
      {
        id: 'shape',
        label: 'Narrow into the first fix lane',
        objective: 'Use review-mode once the repo heatmap has narrowed the current lane.',
        commands: [
          makeStep('rai review-mode', { args: ['--goal', String(goal), '--json'], label: 'Deepen the selected review lane', reason: 'Open the next deep review pass from the repo audit.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close',
        objective: 'Carry evidence and validation alongside the first correction wave.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep repo-wide findings and verify outputs linked.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Expose the remaining proof obligations after the first wave.', family: 'prove' }),
        ],
      },
    ],
    'monorepo-audit-wave': [
      {
        id: 'inspect',
        label: 'Map + rank the monorepo',
        objective: 'Keep the audit packet warm while the repo map is being refreshed.',
        commands: [
          makeStep('rai packet', { args: ['compile', '--step', 'audit', '--json'], label: 'Compile audit packet', reason: 'Persist the current large-repo context in one reusable artifact.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Open the first package wave',
        objective: 'Let one deeper review pass refine the first package-local fix wave.',
        commands: [
          makeStep('rai review-mode', { args: ['--goal', String(goal), '--json'], label: 'Deepen the chosen package review', reason: 'Keep the first package wave evidence-rich before patching.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-rank',
        objective: 'Attach evidence and validation visibility to the current subsystem wave.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep the package-local correction wave grounded.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Keep package verification obligations explicit.', family: 'prove' }),
        ],
      },
    ],
    'correction-wave': [
      {
        id: 'triage',
        label: 'Triage the findings registry',
        objective: 'Open the review-correction control plane, inspect the board, and isolate the next safe wave before patching.',
        commands: [
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Open correction control plane', reason: 'Route the correction lane through the same review/repo/monorepo facade.', family: 'inspect' }),
          makeStep('rai dashboard', { args: ['--json'], label: 'Refresh review control room', reason: 'Keep the findings registry, correction board, and large-repo board visible while triaging.', family: 'inspect' }),
        ],
      },
      {
        id: 'shape',
        label: 'Open the next correction wave',
        objective: 'Separate surgical fixes from bounded refactors before widening the write surface.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Refresh correction task graph', reason: 'Keep deduped findings grouped into executable waves.', family: 'shape' }),
          makeStep('rai patch-review', { args: ['--json'], label: 'Inspect generated patches', reason: 'Review the bounded patch set before verifying the wave.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Re-open bounded fix lane', reason: 'Promote the highest-confidence fixes into the current correction wave.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-review closure',
        objective: 'Finish with targeted verification, then replay the original review lane before closing findings.',
        commands: [
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Verify the correction wave', reason: 'Run the verify queue for the current patch wave.', family: 'prove' }),
          makeStep('rai re-review', { args: ['--json'], label: 'Replay the review lane', reason: 'Confirm the original blockers and findings are actually closed.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score residual risk', reason: 'Surface anything that still blocks closure after the wave lands.', family: 'closeout' }),
        ],
      },
    ],
    'frontend-delivery': [
      {
        id: 'identify',
        label: 'Identify the surface',
        objective: 'Widen the product context only when the detected surface needs it.',
        commands: [
          makeStep('rai design-dna', { args: ['--goal', String(goal), '--json'], label: 'Blend design references', reason: 'Keep the surface differentiated before execution.', family: 'inspect' }),
          ...(frontendPackId === 'frontend-full-brief' || frontendPackId === 'mobile-surface-pack'
            ? [
              makeStep('rai frontend-brief', { args: ['--goal', String(goal), '--json'], label: 'Build full frontend brief', reason: 'Expand the bundle when the surface is complex enough to need it.', family: 'inspect' }),
              makeStep('rai page-blueprint', { args: ['--goal', String(goal), '--json'], label: 'Generate page blueprint', reason: 'Expose section-level UX structure before implementation.', family: 'inspect' }),
            ]
            : []),
        ],
      },
      {
        id: 'shape',
        label: 'Shape the implementation lane',
        objective: 'Add inventory-level guidance when the bundle should cover a wider frontend surface.',
        commands: [
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Expose the reuse surface that the plan should respect.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Review + verify',
        objective: 'Attach responsive and design-debt checks to the same UI lane.',
        commands: [
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Make viewport expectations explicit before signoff.', family: 'prove' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Refresh design debt ledger', reason: 'Keep repeated quality issues grouped together.', family: 'prove' }),
        ],
      },
    ],
    'frontend-review': [
      {
        id: 'shape',
        label: 'Surface the quality debt',
        objective: 'Add the component inventory so findings group around real reuse surfaces.',
        commands: [
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Connect frontend review findings to the actual component graph.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close',
        objective: 'Attach preview and evidence visibility to the quality pass.',
        commands: [
          makeStep('rai preview', { args: ['--json'], label: 'Refresh preview gallery', reason: 'Keep the current visual evidence visible in one file.', family: 'prove' }),
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep frontend review proof linked to broader verification.', family: 'prove' }),
        ],
      },
    ],
    'frontend-refactor': [
      {
        id: 'identify',
        label: 'Map the shared surface',
        objective: 'Widen the context only when route and component complexity justify it.',
        commands: [
          makeStep('rai design-dna', { args: ['--goal', String(goal), '--json'], label: 'Blend design references', reason: 'Keep the refactor aligned to the intended product taste.', family: 'inspect' }),
          ...(frontendPackId === 'frontend-full-brief' || frontendPackId === 'mobile-surface-pack'
            ? [
              makeStep('rai frontend-brief', { args: ['--goal', String(goal), '--json'], label: 'Build full frontend brief', reason: 'Expand the refactor lane when many routes or screens are involved.', family: 'inspect' }),
            ]
            : []),
        ],
      },
      {
        id: 'shape',
        label: 'Design the refactor wave',
        objective: 'Lock a shared refactor contract before the extraction work starts multiplying.',
        commands: [
          makeStep('rai ui-spec', { args: ['--goal', String(goal), '--json'], label: 'Generate the refactor contract', reason: 'Freeze the updated UI contract before moving large surfaces.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Review the rebuilt surface',
        objective: 'Add responsive and evidence visibility to the refactor pass.',
        commands: [
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Expose viewport expectations during the structural cleanup.', family: 'prove' }),
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep refactor proof queryable next to review findings.', family: 'prove' }),
        ],
      },
    ],
    'frontend-polish': [
      {
        id: 'identify',
        label: 'Audit the visual surface',
        objective: 'Expand the polish lane when the surface needs stronger page-level context.',
        commands: [
          ...(frontendPackId === 'frontend-full-brief' || frontendPackId === 'mobile-surface-pack'
            ? [
              makeStep('rai frontend-brief', { args: ['--goal', String(goal), '--json'], label: 'Build full frontend brief', reason: 'Keep broad polish work attached to the surface inventory.', family: 'inspect' }),
              makeStep('rai page-blueprint', { args: ['--goal', String(goal), '--json'], label: 'Generate page blueprint', reason: 'Reveal where consistency issues repeat across the surface.', family: 'inspect' }),
            ]
            : []),
        ],
      },
      {
        id: 'shape',
        label: 'Align the system and states',
        objective: 'Add component strategy when polish should consolidate repeated fixes.',
        commands: [
          makeStep('rai component-strategy', { args: ['--goal', String(goal), '--json'], label: 'Build component strategy', reason: 'Group repeated polish fixes around shared primitives.', family: 'shape' }),
        ],
      },
      {
        id: 'prove',
        label: 'Check responsive fit-and-finish',
        objective: 'Carry evidence and readiness visibility into the final polish pass.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep visual proof and quality findings connected.', family: 'prove' }),
          makeStep('rai ship-readiness', { args: ['--json'], label: 'Score readiness', reason: 'Show whether the polished surface is actually release-ready.', family: 'closeout' }),
        ],
      },
    ],
    'frontend-ship-readiness': [
      {
        id: 'identify',
        label: 'Collect UI release evidence',
        objective: 'Bring shared-surface context into the release lane before the final gate runs.',
        commands: [
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Show which shared primitives the release depends on.', family: 'inspect' }),
        ],
      },
      {
        id: 'prove',
        label: 'Run the ship gate',
        objective: 'Attach evidence and validation visibility to the frontend release gate.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep browser and UI review proof connected to the ship gate.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Keep release obligations explicit while the UI ship lane closes.', family: 'prove' }),
        ],
      },
      {
        id: 'closeout',
        label: 'Package the UI closeout',
        objective: 'Expand the release package for reviewer-facing frontend handoff.',
        commands: [
          makeStep('rai pr-brief', { args: ['--json'], label: 'Generate PR brief', reason: 'Keep reviewer-facing release context attached to the UI ship lane.', family: 'closeout' }),
        ],
      },
    ],
    'ship-closeout': [
      {
        id: 'prove',
        label: 'Verify the current state',
        objective: 'Strengthen closeout with explicit evidence and validation surfaces.',
        commands: [
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Keep release proof queryable and current.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Make remaining ship obligations explicit before closing out.', family: 'prove' }),
        ],
      },
      {
        id: 'closeout',
        label: 'Package the closeout',
        objective: 'Expand closeout artifacts for handoff-heavy releases.',
        commands: [
          makeStep('rai pr-brief', { args: ['--json'], label: 'Generate PR brief', reason: 'Keep reviewer-facing delivery context attached to the release.', family: 'closeout' }),
        ],
      },
    ],
  };

  return phases[bundleId] || [];
}

function addOnPhases(bundle, goal, addOnIds = []) {
  const packetStep = bundle?.id === 'ship-closeout'
    ? 'complete'
    : /review|audit/.test(bundle?.id || '')
      ? 'audit'
      : 'plan';
  const phaseMap = {
    trust: [
      {
        id: 'trust',
        label: 'Trust + evidence',
        objective: 'Keep secure scanning, evidence, and validation attached to the bundle.',
        commands: [
          makeStep('rai secure', { args: ['--json'], label: 'Run secure phase', reason: 'Catch risky patterns before the lane widens.', family: 'prove' }),
          makeStep('rai evidence', { args: ['--json'], label: 'Refresh evidence graph', reason: 'Expose the latest proof graph for this lane.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Keep acceptance obligations visible while the lane evolves.', family: 'prove' }),
        ],
      },
    ],
    docs: [
      {
        id: 'docs',
        label: 'Docs + packet',
        objective: 'Generate the reusable packet and discussion surfaces while context is fresh.',
        commands: [
          makeStep('rai packet', { args: ['compile', '--step', packetStep, '--json'], label: 'Compile packet', reason: 'Write a reusable context pack for this lane.', family: 'shape' }),
          makeStep('rai discuss', { args: ['--json'], label: 'Refresh discuss brief', reason: 'Keep the human-readable rationale close to the technical plan.', family: 'shape' }),
        ],
      },
    ],
    surface: [
      {
        id: 'surface',
        label: 'Surface inventory + blueprint',
        objective: 'Attach page inventory, blueprints, and component inventory to broader frontend work.',
        commands: [
          makeStep('rai frontend-brief', { args: ['--goal', String(goal), '--json'], label: 'Build frontend brief', reason: 'Capture route families, product surface, and execution context in one artifact.', family: 'shape' }),
          makeStep('rai page-blueprint', { args: ['--goal', String(goal), '--json'], label: 'Generate page blueprint', reason: 'Expose section-level structure for larger screen families.', family: 'shape' }),
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Keep the inventory of shared primitives visible while the lane expands.', family: 'shape' }),
        ],
      },
    ],
    'design-system': [
      {
        id: 'design-system',
        label: 'Design-system alignment',
        objective: 'Attach system-level primitives, tokens, and consistency checks to the chosen lane.',
        commands: [
          makeStep('rai design-dna', { args: ['--goal', String(goal), '--json'], label: 'Blend design references', reason: 'Clarify the intended design system before aligning repeated fixes.', family: 'shape' }),
          makeStep('rai component-map', { args: ['--json'], label: 'Refresh component map', reason: 'Surface the primitives and shared components that should absorb the alignment work.', family: 'shape' }),
          makeStep('rai design-debt', { args: ['--json'], label: 'Refresh design debt ledger', reason: 'Keep repeated consistency issues grouped in one system-facing ledger.', family: 'prove' }),
        ],
      },
    ],
    state: [
      {
        id: 'state',
        label: 'State coverage + journeys',
        objective: 'Attach UX-state ownership, responsive coverage, and review checks to the same lane.',
        commands: [
          makeStep('rai state-atlas', { args: ['--goal', String(goal), '--json'], label: 'Build the state atlas', reason: 'Own empty/loading/error/success states explicitly.', family: 'shape' }),
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Check how the key states behave across viewports.', family: 'prove' }),
          makeStep('rai ui-review', { args: ['--goal', String(goal), '--json'], label: 'Run UI review', reason: 'Verify that state coverage and interaction quality still hold.', family: 'prove' }),
        ],
      },
    ],
    ownership: [
      {
        id: 'ownership',
        label: 'Ownership + hotspot context',
        objective: 'Attach package ownership, hotspot ranking, and responsibility clues to repo-scale review and correction work.',
        commands: [
          makeStep('rai monorepo', { args: ['--json'], label: 'Refresh package ownership map', reason: 'Expose package-local ownership and write scopes for the active findings.', family: 'inspect' }),
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Refresh hotspot ownership waves', reason: 'Keep the ranked areas and likely owners grouped into one operational view.', family: 'shape' }),
          makeStep('rai team', { args: ['status'], label: 'Check team status', reason: 'Keep responsibility and handoff state visible when the lane spans several hotspots.', family: 'closeout' }),
        ],
      },
    ],
    regression: [
      {
        id: 'regression',
        label: 'Regression + verify matrix',
        objective: 'Attach targeted test impact, validation mapping, and replayable verification to the current lane.',
        commands: [
          makeStep('rai verify-work', { args: ['--json'], label: 'Refresh verify-work matrix', reason: 'Keep the concrete verification obligations visible while fixes land.', family: 'prove' }),
          makeStep('rai validation-map', { label: 'Refresh validation map', reason: 'Expose missing coverage and expected proof by surface.', family: 'prove' }),
          makeStep('rai verify', { args: ['--goal', String(`verify ${goal}`), '--json'], label: 'Run targeted verification', reason: 'Replay the actual regression queue, not just a generic trust sweep.', family: 'prove' }),
        ],
      },
    ],
    shard: [
      {
        id: 'shard',
        label: 'Shard planning + next-wave routing',
        objective: 'Attach ranked package shards and next-area sequencing to large-repo work.',
        commands: [
          makeStep('rai monorepo-mode', { args: ['--goal', String(goal), '--json'], label: 'Refresh ranked shards', reason: 'Rebuild critical areas, review scope, and the next subsystem queue together.', family: 'inspect' }),
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Refresh shard waves', reason: 'Translate ranked areas into executable review and correction waves.', family: 'shape' }),
          makeStep('rai dashboard', { args: ['--json'], label: 'Inspect large-repo board', reason: 'Keep the current shard, next shard, and wave progress visible to the operator.', family: 'prove' }),
        ],
      },
    ],
    repair: [
      {
        id: 'repair',
        label: 'Repair planner + patchability',
        objective: 'Attach fix-confidence, bounded write planning, and patch inspection to review-native correction work.',
        commands: [
          makeStep('rai review-tasks', { args: ['--json'], label: 'Refresh repair task graph', reason: 'Group deduped findings into safe patches versus bounded refactors.', family: 'shape' }),
          makeStep('rai fix', { args: ['--goal', String(goal), '--json'], label: 'Open repair wave', reason: 'Promote the highest-confidence corrections into a bounded write lane.', family: 'shape' }),
          makeStep('rai patch-review', { args: ['--json'], label: 'Review patch set', reason: 'Inspect the generated patches before verification or handoff.', family: 'prove' }),
        ],
      },
    ],
    handoff: [
      {
        id: 'handoff',
        label: 'Handoff + reporting',
        objective: 'Generate handoff artifacts without leaving the selected workflow bundle.',
        commands: [
          makeStep('rai pr-brief', { args: ['--json'], label: 'Generate PR brief', reason: 'Prepare reviewer-facing context while the lane is still warm.', family: 'closeout' }),
          makeStep('rai release-notes', { args: ['--json'], label: 'Draft release notes', reason: 'Keep outward-facing delivery notes attached to the lane.', family: 'closeout' }),
          makeStep('rai session-report', { args: ['--json'], label: 'Generate session report', reason: 'Capture operator continuity and next-session context.', family: 'closeout' }),
          makeStep('rai checkpoint', { args: ['--next', `Resume from ${goal}`, '--json'], label: 'Write continuity checkpoint', reason: 'Make the next safe resume point explicit.', family: 'closeout' }),
        ],
      },
    ],
    parallel: [
      {
        id: 'parallel',
        label: 'Parallel + delegation',
        objective: 'Expose orchestration and delegation surfaces next to the chosen bundle.',
        commands: [
          makeStep('rai review-orchestrate', { args: ['--goal', String(goal), '--json'], label: 'Refresh orchestration waves', reason: 'Split the work into bounded waves before parallelizing it.', family: 'shape' }),
          makeStep('rai team', { args: ['status'], label: 'Check team status', reason: 'Keep the current delegation state visible.', family: 'shape' }),
          makeStep('rai subagents', { args: ['plan', '--goal', String(goal)], label: 'Draft subagent plan', reason: 'Generate delegation suggestions from the same goal.', family: 'shape', autoRunnable: false, optional: true }),
        ],
      },
    ],
    browser: [
      {
        id: 'browser',
        label: 'Browser + preview',
        objective: 'Attach preview and browser proof to visually sensitive work.',
        commands: [
          makeStep('rai preview', { args: ['--json'], label: 'Refresh preview gallery', reason: 'Surface the latest browser artifacts or preview evidence.', family: 'prove' }),
          makeStep('rai responsive-matrix', { args: ['--json'], label: 'Refresh responsive matrix', reason: 'Make viewport expectations explicit before signoff.', family: 'prove' }),
          makeStep('rai verify-browser', { args: ['--url', 'http://localhost:3000', '--json'], label: 'Run browser verify', reason: 'Replace the placeholder URL with the active preview before executing this step.', family: 'prove', autoRunnable: false, optional: true }),
        ],
      },
    ],
  };

  return addOnIds.flatMap((id) => phaseMap[id] || []);
}

function applyBundlePackaging(bundle, goal, phases, context = {}, options = {}) {
  const profile = options.profile || { id: 'balanced' };
  const addOnIds = (options.addOnIds || []).map((entry) => String(entry || '').trim()).filter(Boolean);
  let packaged = clonePhases(phases);

  if (profile.id === 'speed') {
    packaged = applySpeedProfile(bundle.id, packaged);
  }
  if (profile.id === 'deep') {
    packaged = mergePhaseCollections(packaged, deepProfilePhases(bundle.id, goal, context));
  }
  if (addOnIds.length > 0) {
    packaged = mergePhaseCollections(packaged, addOnPhases(bundle, goal, addOnIds));
  }
  return mergePhaseCollections([], packaged);
}

function buildOperatorTips(bundle, plan) {
  const tips = [];
  if (plan.profile?.id === 'speed') {
    tips.push('Speed profile trims each phase to the minimum proving spine so operators can move quickly without losing verification.');
  }
  if (plan.profile?.id === 'deep') {
    tips.push('Deep profile widens the bundle with complementary commands so planning, evidence, and closeout stay in one operator lane.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'browser')) {
    tips.push('Browser add-on keeps preview and browser proof next to the main UI lane; replace the placeholder preview URL before running browser verify.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'parallel')) {
    tips.push('Parallel add-on exposes orchestration and delegation without forcing the operator to leave the selected bundle.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'surface')) {
    tips.push('Surface add-on keeps page blueprints, route families, and component inventory visible for broader frontend surfaces.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'design-system')) {
    tips.push('Design-system add-on groups design DNA, component inventory, and debt tracking so token and primitive fixes move together.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'state')) {
    tips.push('State add-on keeps empty/loading/error/success ownership attached to responsive and review checks instead of treating them as follow-up chores.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'ownership')) {
    tips.push('Ownership add-on keeps package responsibility and hotspot ranking attached to repo-scale review and correction decisions.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'regression')) {
    tips.push('Regression add-on turns verification into a visible matrix so fixes, test impact, and re-review stay connected.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'shard')) {
    tips.push('Shard add-on keeps large-repo work package-aware by surfacing the current shard, next shard, and ranked wave plan.');
  }
  if ((plan.addOns || []).some((entry) => entry.id === 'repair')) {
    tips.push('Repair add-on keeps patchability, bounded write planning, and patch review visible before verification begins.');
  }
  if ((plan.recommendedAddOns || []).length > 0 && (plan.addOns || []).length === 0) {
    tips.push('Recommended add-ons are available when you want this same bundle to widen into trust, docs, handoff, browser proof, or frontend-specific overlays without choosing separate commands.');
  }
  if (bundle?.id?.startsWith('frontend') && plan.frontend?.commandPack) {
    tips.push(`Frontend identification selected the \`${plan.frontend.commandPack}\` command pack, so the bundle can scale from lean delivery to a fuller product-design lane.`);
  }
  if (plan.frontend?.workflowIntent?.lane) {
    tips.push(`Frontend start intelligence classified this work as \`${plan.frontend.workflowIntent.lane}\`, which is why the bundle and add-on recommendations are leaning toward the current UI lane.`);
  }
  if ((plan.frontend?.focusAreas || []).length > 0) {
    tips.push(`Frontend focus areas: ${(plan.frontend.focusAreas || []).slice(0, 3).join(', ')}.`);
  }
  return tips;
}

function flattenCommands(phases = []) {
  return phases.flatMap((phase) => phase.commands.map((command) => ({ ...command, phaseId: phase.id, phaseLabel: phase.label })));
}

function buildCommandFamilies(phases = []) {
  const familyMap = new Map();
  for (const phase of phases) {
    for (const command of phase.commands) {
      const existing = familyMap.get(command.family) || {
        id: command.family,
        label: command.family === 'inspect'
          ? 'Inspect + identify'
          : command.family === 'shape'
            ? 'Shape + plan'
            : command.family === 'prove'
              ? 'Prove + verify'
              : 'Closeout',
        commands: [],
      };
      existing.commands.push(command.cli);
      familyMap.set(command.family, existing);
    }
  }
  return [...familyMap.values()];
}

function summarizeFrontendProfile(profile, frontendIntent = null) {
  return buildFrontendStartSummary(profile, frontendIntent);
}

function renderPlanMarkdown(plan) {
  const lines = [
    '# START PLAN',
    '',
    `- Generated at: \`${new Date(plan.generatedAt).toISOString().slice(0, 10)}\``,
    `- Goal: \`${plan.goal}\``,
    `- Selected bundle: \`${plan.bundle.label}\``,
    `- Starter command: \`${plan.entryCommand}\``,
    `- Selection reason: \`${plan.selectionReason}\``,
    `- Route lane: \`${plan.route.lane}\``,
    `- Route capability: \`${plan.route.capability}\``,
    `- Repo shape: \`${plan.repoContext.repoShape}\``,
    `- Package count: \`${plan.repoContext.packageCount}\``,
    `- Profile: \`${plan.profile.label}\` (${plan.profile.reason})`,
    `- Applied add-ons: \`${plan.addOns.length > 0 ? plan.addOns.map((entry) => entry.id).join(', ') : 'none'}\``,
    `- Recommended add-ons: \`${plan.recommendedAddOns.length > 0 ? plan.recommendedAddOns.map((entry) => entry.id).join(', ') : 'none'}\``,
    '',
    '## Command Families',
    '',
  ];

  for (const family of plan.commandFamilies) {
    lines.push(`- \`${family.label}\` -> ${family.commands.join(', ')}`);
  }

  if (plan.frontend) {
    lines.push(
      '',
      '## Frontend Summary',
      '',
      `- Framework: \`${plan.frontend.framework}\``,
      `- Routing: \`${plan.frontend.routing}\``,
      `- Product surface: \`${plan.frontend.productSurface}\``,
      `- Interaction model: \`${plan.frontend.interactionModel || 'unknown'}\``,
      `- UI system: \`${plan.frontend.uiSystem || 'unknown'}\``,
      `- Command pack: \`${plan.frontend.commandPack}\``,
      `- Route count: \`${plan.frontend.routeCount}\``,
      `- Shared components: \`${plan.frontend.sharedComponentCount}\``,
      `- Local components: \`${plan.frontend.localComponentCount}\``,
      `- Workflow intent: \`${plan.frontend.workflowIntent?.lane || 'n/a'}\``,
      `- Suggested frontend add-ons: \`${(plan.frontend.suggestedAddOns || []).join(', ') || 'none'}\``,
      `- Focus areas: \`${(plan.frontend.focusAreas || []).join(', ') || 'none'}\``,
    );
  }

  if (plan.addOns.length > 0 || plan.recommendedAddOns.length > 0 || plan.ignoredAddOns.length > 0) {
    lines.push('', '## Bundle Expansion', '');
    if (plan.addOns.length > 0) {
      for (const addOn of plan.addOns) {
        lines.push(`- Applied \`${addOn.id}\` -> ${addOn.summary} (${addOn.reason})`);
      }
    }
    if (plan.recommendedAddOns.length > 0) {
      for (const addOn of plan.recommendedAddOns) {
        lines.push(`- Recommended \`${addOn.id}\` -> ${addOn.summary} (${addOn.reason})`);
      }
    }
    if (plan.ignoredAddOns.length > 0) {
      for (const addOn of plan.ignoredAddOns) {
        lines.push(`- Ignored \`${addOn.id}\` -> ${addOn.reason}`);
      }
    }
  }

  lines.push('', '## Structured Phases', '');
  for (const phase of plan.phases) {
    lines.push(`### ${phase.label}`, '', `- Objective: ${phase.objective}`);
    for (const command of phase.commands) {
      lines.push(`- \`${command.cli}\`${command.reason ? ` -> ${command.reason}` : ''}`);
    }
    lines.push('');
  }

  if (plan.operatorTips.length > 0) {
    lines.push('## Operator Tips', '');
    for (const tip of plan.operatorTips) {
      lines.push(`- ${tip}`);
    }
    lines.push('');
  }

  if (plan.candidateBundles.length > 0) {
    lines.push('## Candidate Bundles', '');
    for (const candidate of plan.candidateBundles.slice(0, 5)) {
      lines.push(`- \`${candidate.label}\` score=\`${candidate.score}\` -> \`${candidate.starterCommand}\`${candidate.reasons.length > 0 ? ` (${candidate.reasons.join(', ')})` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Related Bundles', '');
  for (const related of plan.relatedBundles) {
    lines.push(`- \`${related.label}\` -> \`rai start ${related.shorthand || related.id} --goal ${quoteGoal(plan.goal)}\``);
  }

  if (plan.execution?.runs?.length) {
    lines.push('', '## Execution Results', '');
    for (const run of plan.execution.runs) {
      lines.push(`- \`${run.cli}\` -> status \`${run.status}\`${run.error ? ` (${run.error})` : ''}`);
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function executePlan(cwd, phases, options = {}) {
  const runs = [];
  const commands = flattenCommands(phases);
  const executeAll = Boolean(options.forceAll);

  for (const command of commands) {
    if (!command.autoRunnable && !executeAll) {
      continue;
    }
    const binary = path.join(cwd, 'bin', 'rai.js');
    const localBinary = require('node:fs').existsSync(binary) ? binary : path.join(__dirname, '..', '..', 'bin', 'rai.js');
    const result = childProcess.spawnSync(process.execPath, [localBinary, command.command.replace(/^rai\s+/, ''), ...command.args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    runs.push({
      id: command.id,
      cli: command.cli,
      status: typeof result.status === 'number' && result.status === 0 ? 'ok' : 'failed',
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.status === 0 ? '' : (result.stderr || result.stdout || `exit ${result.status}`),
    });
    if (result.status !== 0 && !options.continueOnError) {
      break;
    }
  }

  return {
    mode: executeAll ? 'force-all' : 'safe-auto-run',
    runs,
    failures: runs.filter((item) => item.status !== 'ok').length,
  };
}

function buildStartPlan(cwd, rootDir, options = {}) {
  const goal = String(options.goal || '').trim();
  if (!goal) {
    throw new Error('Provide a goal via --goal or free-form text.');
  }

  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const route = buildDoPayload(cwd, rootDir, goal);
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const shouldProbeFrontend = route.lane === 'frontend' || wantsFrontendReview(goal) || wantsFrontendProductWork(goal);
  let rawFrontendProfile = shouldProbeFrontend ? buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' }) : null;
  const routeBundleId = selectBundleId({ ...options, goal, route, packageGraph, frontendProfile: rawFrontendProfile });
  const preferredBundle = !options.bundleId && Array.isArray(repoConfigPayload.activeConfig?.preferredBundles)
    ? repoConfigPayload.activeConfig.preferredBundles.find((entry) => findWorkflowBundle(entry))
    : null;
  const repoConfigBundle = routeBundleId === 'slice-delivery' ? preferredBundle : null;
  const bundleId = selectBundleId({ ...options, bundleId: options.bundleId || repoConfigBundle || null, goal, route, packageGraph, frontendProfile: rawFrontendProfile });
  const bundle = findWorkflowBundle(bundleId) || findWorkflowBundle('slice');
  if (!rawFrontendProfile && bundle.id.startsWith('frontend')) {
    rawFrontendProfile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  }
  const frontendIntent = classifyFrontendIntent(goal, rawFrontendProfile);
  const relatedBundles = (bundle.relatedBundles || []).map((id) => findWorkflowBundle(id)).filter(Boolean);
  const effectiveProfileId = options.profileId || repoConfigPayload.activeConfig?.defaultProfile || null;
  const profile = recommendStartProfile(bundle, {
    goal,
    route,
    packageGraph,
    frontendProfile: rawFrontendProfile,
    explicitProfileId: effectiveProfileId,
  });
  const recommendedAddOns = recommendStartAddOns(bundle, {
    goal,
    route,
    packageGraph,
    frontendProfile: rawFrontendProfile,
  });
  const repoConfigAddOns = Array.isArray(repoConfigPayload.activeConfig?.preferredAddOns) && repoConfigPayload.activeConfig.preferredAddOns.length > 0
    ? repoConfigPayload.activeConfig.preferredAddOns
    : null;
  const resolvedAddOns = resolveStartAddOns(bundle, options.addOns && options.addOns.length > 0 ? options.addOns : repoConfigAddOns, recommendedAddOns);
  if (resolvedAddOns.unknown.length > 0) {
    throw new Error(`Unknown start add-ons: ${resolvedAddOns.unknown.join(', ')}`);
  }

  const basePhases = buildBundlePhases(bundle.id, goal, { route, packageGraph, frontendProfile: rawFrontendProfile });
  const phases = applyBundlePackaging(bundle, goal, basePhases, {
    route,
    packageGraph,
    frontendProfile: rawFrontendProfile,
  }, {
    profile,
    addOnIds: resolvedAddOns.applied.map((entry) => entry.id),
  });
  const commandFamilies = buildCommandFamilies(phases);
  const selectionReason = options.bundleId
    ? 'explicit_bundle'
    : frontendIntent.frontend && bundle.id === 'frontend-ship-readiness'
      ? 'frontend_ship_lane'
      : frontendIntent.frontend && bundle.id === 'frontend-polish'
        ? 'frontend_polish_lane'
        : frontendIntent.frontend && bundle.id === 'frontend-refactor'
          ? 'frontend_refactor_lane'
          : frontendIntent.frontend && bundle.id === 'frontend-review'
            ? 'frontend_review_lane'
            : bundle.id === 'correction-wave' && wantsCorrectionGoal(goal)
              ? 'correction_lane'
              : repoConfigBundle && bundle.id === repoConfigBundle && routeBundleId === 'slice-delivery'
                ? 'repo_config_default'
                : route.commandPlan?.bundleId === bundle.id
                  ? 'route_command_plan'
              : route.lane === 'frontend'
                ? 'frontend_lane'
                : packageGraph.repoShape === 'monorepo' && bundle.id === 'monorepo-audit-wave'
                  ? 'large_repo_shape'
                  : route.lane === 'review'
                    ? 'review_lane'
                    : 'default_slice';
  const recommendation = buildStartRecommendation(bundle, {
    goal,
    route,
    packageGraph,
    frontendProfile: rawFrontendProfile,
    explicitProfileId: options.profileId,
  });

  const plan = {
    generatedAt: new Date().toISOString(),
    goal,
    rootDir: rel(cwd, rootDir),
    bundle: {
      id: bundle.id,
      label: bundle.label,
      summary: bundle.summary,
      shorthand: bundle.shorthand,
      aliases: bundle.aliases,
      supportedProfiles: bundle.supportedProfiles || [],
      supportedAddOns: bundle.supportedAddOns || [],
      useWhen: bundle.useWhen || [],
      outcomes: bundle.outcomes || [],
    },
    selectionReason,
    entryCommand: buildStartEntryCommand(bundle.id, goal, {
      profileId: profile.id,
      addOnIds: resolvedAddOns.applied.map((entry) => entry.id),
    }),
    recommendedStarterCommand: recommendation.starterCommand,
    relatedBundles: relatedBundles.map((entry) => ({
      id: entry.id,
      label: entry.label,
      shorthand: entry.shorthand,
      summary: entry.summary,
    })),
    candidateBundles: recommendation.candidates,
    route: {
      lane: route.lane,
      capability: route.capability,
      confidence: route.confidence,
      packet: route.packet,
      commandPlan: route.commandPlan,
    },
    repoContext: {
      repoShape: packageGraph.repoShape,
      packageCount: packageGraph.packageCount,
      workspaceSources: packageGraph.workspaceDiscovery?.sources || [],
      monorepo: packageGraph.repoShape === 'monorepo',
    },
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    profile: {
      id: profile.id,
      label: profile.label,
      summary: profile.summary,
      explicit: profile.explicit,
      reason: profile.reason,
    },
    frontend: summarizeFrontendProfile(rawFrontendProfile, frontendIntent),
    addOns: resolvedAddOns.applied,
    recommendedAddOns,
    ignoredAddOns: resolvedAddOns.ignored,
    commandFamilies,
    phases,
    execution: null,
    operatorTips: [],
  };
  plan.operatorTips = buildOperatorTips(bundle, plan);

  if (options.run) {
    plan.execution = executePlan(cwd, phases, {
      forceAll: Boolean(options.forceAll),
      continueOnError: Boolean(options.continueOnError),
    });
  }

  return plan;
}

function writeStartPlanArtifacts(cwd, plan) {
  const jsonPath = writeRuntimeJson(cwd, 'start-plan.json', plan);
  const markdownPath = writeRuntimeMarkdown(cwd, 'start-plan.md', renderPlanMarkdown(plan));
  return {
    jsonPath,
    markdownPath,
  };
}

module.exports = {
  buildStartPlan,
  buildBundlePhases,
  buildCommandFamilies,
  listWorkflowBundles,
  renderPlanMarkdown,
  selectBundleId,
  writeStartPlanArtifacts,
};
