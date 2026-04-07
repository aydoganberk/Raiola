function quoteGoal(goal) {
  return JSON.stringify(String(goal || '').trim());
}

function reviewFlow(goal) {
  const qGoal = quoteGoal(goal);
  return {
    primaryCommand: `cwf review-mode --goal ${qGoal}`,
    secondaryCommands: [
      'cwf review-tasks --json',
      `cwf codex contextpack --goal ${qGoal}`,
      'cwf monorepo --json',
    ],
    cliFlow: [
      'Run the advanced review-mode pass first to establish blockers, lenses, and execution spine.',
      'Open the review task graph and fix blockers wave by wave instead of scanning the whole repo repeatedly.',
      'Use targeted verification per package before re-reviewing the full surface.',
    ],
    codexAppFlow: [
      'Start in a review-focused worktree or task tab so the diff stays isolated.',
      'Pin the review report, task graph, and context pack as the first attachments.',
      'Route any write-capable follow-up through bounded package scopes from the agent plan.',
    ],
    parallelFlow: [
      'Launch read-only scout agents over the top hotspots first.',
      'Keep write agents bounded to package-local scopes.',
      'Finish with targeted verify lanes and one final re-review pass.',
    ],
    specialtyFlows: {
      codeReview: [
        'Use blocker-first sequencing: triage -> fix -> verify -> re-review.',
        'Escalate must-fix findings immediately; defer style-only nits unless they affect safety or clarity.',
      ],
    },
  };
}

function frontendFlow(goal) {
  const qGoal = quoteGoal(goal);
  return {
    primaryCommand: `cwf ui-plan --goal ${qGoal}`,
    secondaryCommands: [
      `cwf ui-direction --goal ${qGoal} --json`,
      `cwf ui-spec --goal ${qGoal} --json`,
      `cwf ui-recipe --goal ${qGoal} --json`,
      'cwf ui-review',
    ],
    cliFlow: [
      'Generate UI direction first so the shell, tokens, and taste profile are explicit.',
      'Convert the direction into a UI plan/spec and recipe scaffold before patching screens.',
      'Capture visual verification at the end of each UI slice.',
    ],
    codexAppFlow: [
      'Pin UI-DIRECTION, UI-SPEC, UI-RECIPE, and the latest browser artifacts in the Codex app.',
      'Keep one task thread per screen family to avoid mixing unrelated visual decisions.',
      'Use design-system actions as the tie-breaker when several implementations look acceptable.',
    ],
    parallelFlow: [
      'Read-only agents can inspect responsiveness, state coverage, and accessibility in parallel.',
      'A single write lane should own the token/system pass before multiple UI patches land.',
    ],
    specialtyFlows: {
      frontend: [
        'Land signature moments intentionally instead of sprinkling decoration everywhere.',
        'Patch empty/loading/error/success states in the same component boundary when possible.',
        'Prototype the chosen recipe scaffold before widening the surface into page-local variations.',
      ],
    },
  };
}

function defaultFlow(goal) {
  const qGoal = quoteGoal(goal);
  return {
    primaryCommand: `cwf do --goal ${qGoal}`,
    secondaryCommands: [
      `cwf codex promptpack --goal ${qGoal}`,
      `cwf codex contextpack --goal ${qGoal}`,
    ],
    cliFlow: [
      'Use cwf do to pick the right lane, then follow the suggested commands in order.',
    ],
    codexAppFlow: [
      'Pin the generated context pack and the active workflow docs before large edits.',
    ],
    parallelFlow: [],
    specialtyFlows: {},
  };
}

function buildCommandPlan(payload = {}) {
  const goal = payload.goal || '';
  const lane = payload.lane || 'execute';
  const monorepo = payload.repoSignals?.monorepo || Boolean(payload.monorepo);
  const review = lane === 'review' || payload.capability?.includes('review');
  const frontend = lane === 'frontend' || payload.capability?.includes('ui_');

  let flow = defaultFlow(goal);
  if (review) {
    flow = reviewFlow(goal);
  } else if (frontend) {
    flow = frontendFlow(goal);
  }

  const executionMode = monorepo || payload.trust?.verifyNeeded ? 'scoped-multi-step' : 'single-lane';
  const codexPreset = payload.profile?.id || payload.recommendedPreset || 'balanced';

  return {
    executionMode,
    codexPreset,
    primaryCommand: flow.primaryCommand,
    secondaryCommands: flow.secondaryCommands,
    cliFlow: flow.cliFlow,
    codexAppFlow: flow.codexAppFlow,
    parallelFlow: flow.parallelFlow,
    specialtyFlows: flow.specialtyFlows,
  };
}

module.exports = {
  buildCommandPlan,
};
