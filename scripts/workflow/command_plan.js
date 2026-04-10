function quoteGoal(goal) {
  return JSON.stringify(String(goal || '').trim());
}

function reviewFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  if (options.monorepo) {
    return {
      primaryCommand: `rai monorepo-mode --goal ${qGoal}`,
      secondaryCommands: [
        `rai review-mode --goal ${qGoal}`,
        'rai review-tasks --json',
        `rai codex contextpack --goal ${qGoal}`,
        'rai monorepo --json',
      ],
      cliFlow: [
        'Start with monorepo-mode so the repo map, top risk areas, review scope, and patch plan are explicit before deep review.',
        'Use review-mode after monorepo-mode isolates the first subsystem and narrows the read scope.',
        'Verify package-local changes first, then re-review the wider surface before calling the work safe.',
      ],
      codexAppFlow: [
        'Pin MONOREPO.md, REPO_MAP.md, REVIEW_SCOPE.md, PATCH_PLAN.md, and the context pack before broad repo work starts.',
        'Keep write work bounded to the selected subsystem until contracts and dependents are enumerated.',
        'Use the staged monorepo prompts instead of one-shot mega prompts.',
      ],
      parallelFlow: [
        'Launch read-only scouts on the top tracks or hotspots first.',
        'Keep write agents package-local and align them to the selected subsystem or patch group.',
        'Finish with targeted verify lanes and one explicit residual-risk pass.',
      ],
      specialtyFlows: {
        codeReview: [
          'Treat the repo as phased analysis, not one undifferentiated review blob.',
          'Separate facts from inference and keep the top-risk subsystem isolated before broad execution.',
        ],
      },
    };
  }
  return {
    primaryCommand: `rai review-mode --goal ${qGoal}`,
    secondaryCommands: [
      'rai review-tasks --json',
      `rai codex contextpack --goal ${qGoal}`,
      'rai monorepo --json',
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
    primaryCommand: `rai ui-plan --goal ${qGoal}`,
    secondaryCommands: [
      `rai frontend-brief --goal ${qGoal} --json`,
      `rai ui-direction --goal ${qGoal} --json`,
      `rai design-dna --goal ${qGoal} --json`,
      `rai page-blueprint --goal ${qGoal} --json`,
      `rai design-md --goal ${qGoal} --json`,
      `rai component-strategy --goal ${qGoal} --json`,
      `rai design-benchmark --goal ${qGoal} --json`,
      `rai state-atlas --goal ${qGoal} --json`,
      `rai ui-spec --goal ${qGoal} --json`,
      `rai ui-recipe --goal ${qGoal} --json`,
      'rai ui-review',
    ],
    cliFlow: [
      'Use frontend-brief when you need the full external-site artifact pack in one pass.',
      'Generate UI direction first so the shell, tokens, and taste profile are explicit.',
      'Lock the external design blend and required state atlas before patching any screen family.',
      'Use component-strategy to decide reuse/extract/build sequencing before page-local JSX starts multiplying.',
      'Convert the direction into a UI plan/spec and recipe scaffold before patching screens.',
      'Capture visual verification at the end of each UI slice.',
    ],
    codexAppFlow: [
      'Pin UI-DIRECTION, DESIGN-DNA, STATE-ATLAS, UI-SPEC, UI-RECIPE, and the latest browser artifacts in the Codex app.',
      'Keep one task thread per screen family to avoid mixing unrelated visual decisions.',
      'Use design-system actions as the tie-breaker when several implementations look acceptable.',
    ],
    parallelFlow: [
      'Read-only agents can inspect responsiveness, state coverage, and design-reference drift in parallel.',
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
    primaryCommand: `rai do --goal ${qGoal}`,
    secondaryCommands: [
      `rai codex promptpack --goal ${qGoal}`,
      `rai codex contextpack --goal ${qGoal}`,
    ],
    cliFlow: [
      'Use rai do to pick the right lane, then follow the suggested commands in order.',
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
    flow = reviewFlow(goal, { monorepo });
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
