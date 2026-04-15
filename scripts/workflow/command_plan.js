const { bundleStarterCommand, findWorkflowBundle } = require('./workflow_bundle_catalog');

function quoteGoal(goal) {
  return JSON.stringify(String(goal || '').trim());
}

function wantsRepoAudit(goal) {
  return /\b(full repo|whole repo|entire repo|repo[- ]wide|full codebase|whole codebase|oneshot|one-shot|repo audit|audit the repo|audit this repo|full repo audit|codebase audit)\b/i.test(String(goal || ''));
}

function wantsFix(goal) {
  return /\b(fix|correct|patch|repair|remediate|address|cleanup|stabilize)\b/i.test(String(goal || ''));
}

function wantsVerify(goal) {
  return /\b(verify|validate|ship|release|readiness|ready|check)\b/i.test(String(goal || ''));
}

function wantsFrontendReview(goal) {
  return /\b(ui review|frontend review|frontend audit|accessibility|responsive|design debt|visual review|browser verify|browser verification|a11y)\b/i.test(String(goal || ''));
}

function wantsCorrectionWave(goal) {
  return /\b(fix|correct|patch|repair|remediate|address findings|close blockers|cleanup findings|hardening|stabilize|re-review)\b/i.test(String(goal || ''));
}

function facadeCommand(goal) {
  const qGoal = quoteGoal(goal);
  if (wantsVerify(goal)) {
    return `rai verify --goal ${qGoal}`;
  }
  if (wantsFix(goal)) {
    return `rai fix --goal ${qGoal}`;
  }
  return `rai audit --goal ${qGoal}`;
}

function buildFamilies(...groups) {
  return groups.filter(Boolean).map((group) => ({
    id: group.id,
    label: group.label,
    commands: group.commands,
    objective: group.objective,
  }));
}

function buildPhases(...phases) {
  return phases.filter(Boolean).map((phase) => ({
    id: phase.id,
    label: phase.label,
    objective: phase.objective,
    commands: phase.commands,
  }));
}

function flowEnvelope(flow, bundleId, goal) {
  const bundle = findWorkflowBundle(bundleId) || {
    id: bundleId,
    label: bundleId,
    relatedBundles: [],
  };
  return {
    bundleId: bundle.id,
    bundleLabel: bundle.label,
    relatedBundles: bundle.relatedBundles || [],
    recommendedStartCommand: bundleStarterCommand(bundle.id, goal),
    ...flow,
  };
}

function repoAuditFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  const monorepo = Boolean(options.monorepo);
  if (monorepo) {
    return flowEnvelope({
      primaryCommand: facadeCommand(goal),
      resolvedPrimaryCommand: `rai monorepo-mode --goal ${qGoal}`,
      secondaryCommands: [
        `rai audit-repo --mode oneshot --goal ${qGoal}`,
        `rai review-orchestrate --goal ${qGoal} --json`,
        `rai review-mode --goal ${qGoal}`,
        'rai review-tasks --json',
        'rai monorepo --json',
        `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
      ],
      commandFamilies: buildFamilies(
        {
          id: 'inspect',
          label: 'Inspect + rank',
          objective: 'Map the monorepo, rank risk, and split review waves before any broad patching.',
          commands: [
            `rai monorepo-mode --goal ${qGoal}`,
            `rai audit-repo --mode oneshot --goal ${qGoal}`,
            `rai review-orchestrate --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Shape package-local fixes',
          objective: 'Turn repo-wide findings into subsystem-local tasks and correction waves.',
          commands: [
            `rai review-mode --goal ${qGoal}`,
            'rai review-tasks --json',
            `rai fix --goal ${qGoal}`,
          ],
        },
        {
          id: 'prove',
          label: 'Prove + close',
          objective: 'Verify the current subsystem wave before opening the next one.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      ),
      phases: buildPhases(
        {
          id: 'inspect',
          label: 'Map and rank the large repo',
          objective: 'Keep repo map, critical areas, review scope, and prompt packs aligned from one structured entry.',
          commands: [
            `rai monorepo-mode --goal ${qGoal}`,
            `rai audit-repo --mode oneshot --goal ${qGoal}`,
            `rai review-orchestrate --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Open the first package wave',
          objective: 'Use review-mode and review-tasks to narrow the first bounded correction lane.',
          commands: [
            `rai review-mode --goal ${qGoal}`,
            'rai review-tasks --json',
            `rai fix --goal ${qGoal}`,
          ],
        },
        {
          id: 'prove',
          label: 'Verify the selected subsystem',
          objective: 'Finish the current package wave with explicit trust gates and residual-risk visibility.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      ),
      cliFlow: [
        'Start with monorepo-mode so the repo-native audit scout, repo map, critical areas, and patch plan stay in one workflow.',
        'Use review-orchestrate plus review-mode after the map isolates the first subsystem and narrows the read scope.',
        'Stay package-local during correction waves and only widen scope after targeted verification passes.',
      ],
      codexAppFlow: [
        'Pin repo-audit.md, REPO_MAP.md, REVIEW_SCOPE.md, PATCH_PLAN.md, and the review orchestration files together; they are one combined large-repo audit surface now.',
        'Use monorepo-mode as the durable workflow shell and treat audit-repo plus review-orchestrate as the scout and planning layers that feed it.',
        'Keep verified findings, probable findings, and heuristic observations separated while the workflow advances through waves.',
      ],
      parallelFlow: [
        'Launch read-only scouts over the top audit heatmap areas first.',
        'Keep write work bounded to one package or subsystem at a time.',
        'Finish each correction wave with targeted verification before the next subsystem opens.',
      ],
      specialtyFlows: {
        codeReview: [
          'Large-repo audit should start repo-health first, then narrow into subsystem review and correction waves.',
          'Heuristic observations should not enter the blocker lane until code confirms them.',
        ],
      },
    }, 'monorepo-audit-wave', goal);
  }
  return flowEnvelope({
    primaryCommand: facadeCommand(goal),
    resolvedPrimaryCommand: `rai audit-repo --mode oneshot --goal ${qGoal}`,
    secondaryCommands: [
      `rai review-orchestrate --goal ${qGoal} --json`,
      `rai review-mode --goal ${qGoal}`,
      'rai review-tasks --json',
      'rai review --heatmap',
      `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
    ],
    commandFamilies: buildFamilies(
      {
        id: 'inspect',
        label: 'Inspect + rank',
        objective: 'Use graph-native repo audit artifacts to choose the first safe correction wave.',
        commands: [
          `rai audit-repo --mode oneshot --goal ${qGoal}`,
          `rai review-orchestrate --goal ${qGoal} --json`,
        ],
      },
      {
        id: 'shape',
        label: 'Shape review waves',
        objective: 'Convert the audit into a blocker-first task graph and the first bounded fix lane.',
        commands: [
          `rai review-mode --goal ${qGoal}`,
          'rai review-tasks --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Prove + close',
        objective: 'Verify the first correction wave and keep ship blockers visible.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai ship-readiness',
        ],
      },
    ),
    phases: buildPhases(
      {
        id: 'inspect',
        label: 'Audit the whole repo',
        objective: 'Start repo-wide and graph-native instead of forcing a fake diff-only review surface.',
        commands: [
          `rai audit-repo --mode oneshot --goal ${qGoal}`,
          `rai review-orchestrate --goal ${qGoal} --json`,
        ],
      },
      {
        id: 'shape',
        label: 'Narrow into the first fix wave',
        objective: 'Use review-mode and review-tasks after the audit isolates the highest-risk area.',
        commands: [
          `rai review-mode --goal ${qGoal}`,
          'rai review-tasks --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close',
        objective: 'Finish the first correction wave before widening the patch surface.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai ship-readiness',
        ],
      },
    ),
    cliFlow: [
      'Start with audit-repo so the first pass is graph-native and repo-wide instead of forcing a fake snapshot diff.',
      'Use review-orchestrate to group the same-risk areas together before opening deep review or code changes.',
      'Switch into review-mode only after the repo audit isolates the highest-risk area and the first fix plan is explicit.',
    ],
    codexAppFlow: [
      'Pin repo-audit.md, repo-audit-findings.json, repo-audit-heatmap.json, repo-audit-prompts.md, and the review orchestration outputs before opening a large correction pass.',
      'Use the one-shot prompt only for planning and the first bounded correction wave; do not collapse the whole repo into one giant patch.',
      'Keep verified findings separate from probable findings and heuristic observations while patches are being landed.',
    ],
    parallelFlow: [
      'Read-only review lanes can inspect the top subsystems in parallel.',
      'Keep write work inside one subsystem until the verified findings there are reduced.',
    ],
    specialtyFlows: {
      codeReview: [
        'Full repo audit should be repo-health first, diff-review second.',
        'Heuristic observations should not enter the blocker lane until code confirms them.',
      ],
    },
  }, 'repo-audit-wave', goal);
}

function correctionFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  const monorepo = Boolean(options.monorepo);
  return flowEnvelope({
    primaryCommand: `rai fix --goal ${qGoal}`,
    resolvedPrimaryCommand: `rai fix --goal ${qGoal}`,
    secondaryCommands: monorepo
      ? [
        `rai monorepo-mode --goal ${qGoal}`,
        `rai fix --goal ${qGoal}`,
        'rai review-tasks --json',
        'rai patch-review --json',
        `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
        'rai re-review',
        'rai ship-readiness',
      ]
      : [
        `rai fix --goal ${qGoal}`,
        'rai review-tasks --json',
        'rai patch-review --json',
        `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
        'rai re-review',
        'rai ship-readiness',
      ],
    commandFamilies: buildFamilies(
      {
        id: 'inspect',
        label: 'Triage + route correction',
        objective: 'Open the review-correction control plane, inspect the findings registry, and isolate the next safe wave.',
        commands: [
          `rai fix --goal ${qGoal}`,
          'rai dashboard --json',
          monorepo ? `rai monorepo-mode --goal ${qGoal}` : `rai audit --goal ${qGoal}`,
        ].filter(Boolean),
      },
      {
        id: 'shape',
        label: 'Shape the correction wave',
        objective: 'Separate surgical patches from bounded refactors before widening the write surface.',
        commands: [
          'rai review-tasks --json',
          'rai patch-review --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Verify + close the wave',
        objective: 'Run the verify queue, replay the review lane, and expose any remaining blockers.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai re-review',
          'rai ship-readiness',
        ],
      },
    ),
    phases: buildPhases(
      {
        id: 'inspect',
        label: 'Triage the findings registry',
        objective: 'Open the control-plane first so the next correction wave is chosen from real findings instead of guesswork.',
        commands: [
          `rai fix --goal ${qGoal}`,
          'rai dashboard --json',
          monorepo ? `rai monorepo-mode --goal ${qGoal}` : `rai audit --goal ${qGoal}`,
        ].filter(Boolean),
      },
      {
        id: 'shape',
        label: 'Open the next correction wave',
        objective: 'Refresh the task graph, inspect generated patches, and keep fixes bounded.',
        commands: [
          'rai review-tasks --json',
          'rai patch-review --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-review closure',
        objective: 'Finish with targeted verification and a replay of the original review surface before closing blockers.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai re-review',
          'rai ship-readiness',
        ],
      },
    ),
    cliFlow: [
      'Use fix as the front door only when the goal is explicitly correction-heavy; it should open the same review-native control plane, not skip analysis.',
      'Refresh the task graph and patch review before widening the write surface so safe patches and risky refactors stay separated.',
      'Treat verify plus re-review as the actual closure gate for the correction wave.',
    ],
    codexAppFlow: [
      'Pin the findings registry, correction-control report, latest review or repo-audit artifact, and the dashboard together; they form one operational surface now.',
      'Keep high-confidence fixes and risky refactors in separate task threads so reviewers can reason about the wave clearly.',
      'Use the correction bundle whenever findings already exist and the operator mainly needs the fastest safe path to closure.',
    ],
    parallelFlow: [
      'Keep read-only triage and ownership checks parallelizable, but keep write work bounded to one correction wave at a time.',
      'Finish the verify queue for the current wave before opening the next shard or patch group.',
    ],
    specialtyFlows: {
      codeReview: [
        'A correction wave should close actual findings, not open a new unbounded rewrite lane.',
        'Escalate safe patches first, route bounded refactors separately, and require verify plus re-review before closure.',
      ],
    },
  }, 'correction-wave', goal);
}

function reviewFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  if (options.monorepo) {
    return flowEnvelope({
      primaryCommand: facadeCommand(goal),
      resolvedPrimaryCommand: `rai monorepo-mode --goal ${qGoal}`,
      secondaryCommands: [
        `rai review-orchestrate --goal ${qGoal} --json`,
        `rai review-mode --goal ${qGoal}`,
        'rai review-tasks --json',
        `rai codex contextpack --goal ${qGoal}`,
        'rai monorepo --json',
        `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
      ],
      commandFamilies: buildFamilies(
        {
          id: 'inspect',
          label: 'Inspect + isolate',
          objective: 'Map the repo and isolate the first subsystem before deep review.',
          commands: [
            `rai monorepo-mode --goal ${qGoal}`,
            `rai review-orchestrate --goal ${qGoal} --json`,
            `rai review-mode --goal ${qGoal}`,
          ],
        },
        {
          id: 'shape',
          label: 'Shape package fixes',
          objective: 'Translate findings into bounded subsystem tasks and correction waves.',
          commands: [
            'rai review-tasks --json',
            `rai fix --goal ${qGoal}`,
          ],
        },
        {
          id: 'prove',
          label: 'Verify + close',
          objective: 'Re-check the widened surface only after package-local verification completes.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      ),
      phases: buildPhases(
        {
          id: 'inspect',
          label: 'Map and review the subsystem',
          objective: 'Use monorepo-mode, review-orchestrate, and review-mode as one staged review shell.',
          commands: [
            `rai monorepo-mode --goal ${qGoal}`,
            `rai review-orchestrate --goal ${qGoal} --json`,
            `rai review-mode --goal ${qGoal}`,
          ],
        },
        {
          id: 'shape',
          label: 'Open the bounded correction wave',
          objective: 'Build the task graph and land the first subsystem-local fixes.',
          commands: [
            'rai review-tasks --json',
            `rai fix --goal ${qGoal}`,
          ],
        },
        {
          id: 'prove',
          label: 'Verify and re-open wider visibility',
          objective: 'Finish with targeted verification and ship gating before broadening scope.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      ),
      cliFlow: [
        'Start with monorepo-mode so the repo map, top risk areas, review scope, and patch plan are explicit before deep review.',
        'Use review-orchestrate plus review-mode after monorepo-mode isolates the first subsystem and narrows the read scope.',
        'Verify package-local changes first, then re-review the wider surface before calling the work safe.',
      ],
      codexAppFlow: [
        'Pin MONOREPO.md, REPO_MAP.md, REVIEW_SCOPE.md, PATCH_PLAN.md, the orchestration output, and the context pack before broad repo work starts.',
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
    }, 'monorepo-audit-wave', goal);
  }
  return flowEnvelope({
    primaryCommand: facadeCommand(goal),
    resolvedPrimaryCommand: `rai review-mode --goal ${qGoal}`,
    secondaryCommands: [
      `rai review-orchestrate --goal ${qGoal} --json`,
      'rai review-tasks --json',
      `rai codex contextpack --goal ${qGoal}`,
      `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
    ],
    commandFamilies: buildFamilies(
      {
        id: 'inspect',
        label: 'Inspect + isolate',
        objective: 'Run review-mode first so blockers and lenses exist before fixes start.',
        commands: [
          `rai review-mode --goal ${qGoal}`,
          `rai review-orchestrate --goal ${qGoal} --json`,
        ],
      },
      {
        id: 'shape',
        label: 'Shape fixes',
        objective: 'Translate findings into a blocker-first task graph and bounded correction pass.',
        commands: [
          'rai review-tasks --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Prove + close',
        objective: 'Verify the correction wave, then expose any remaining ship blockers.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai re-review',
          'rai ship-readiness',
        ],
      },
    ),
    phases: buildPhases(
      {
        id: 'inspect',
        label: 'Run the review wave',
        objective: 'Use review-mode and review-orchestrate together so findings and review coverage stay aligned.',
        commands: [
          `rai review-mode --goal ${qGoal}`,
          `rai review-orchestrate --goal ${qGoal} --json`,
        ],
      },
      {
        id: 'shape',
        label: 'Open the fix wave',
        objective: 'Convert verified findings into a task graph and the first bounded fix pass.',
        commands: [
          'rai review-tasks --json',
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Verify + re-review',
        objective: 'Finish with targeted verification and a replay of the original review findings.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai re-review',
          'rai ship-readiness',
        ],
      },
    ),
    cliFlow: [
      'Run the advanced review-mode pass first to establish blockers, lenses, and execution spine.',
      'Open the review task graph and fix blockers wave by wave instead of scanning the whole repo repeatedly.',
      'Use targeted verification per package before re-reviewing the full surface.',
    ],
    codexAppFlow: [
      'Start in a review-focused worktree or task tab so the diff stays isolated.',
      'Pin the review report, task graph, orchestration file, and context pack as the first attachments.',
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
  }, 'review-wave', goal);
}

function frontendFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  const reviewBundle = Boolean(options.frontendReview);
  return flowEnvelope({
    primaryCommand: facadeCommand(goal),
    resolvedPrimaryCommand: `rai map-frontend --json`,
    secondaryCommands: reviewBundle
      ? [
        `rai ui-review --goal ${qGoal} --json`,
        'rai responsive-matrix --json',
        'rai design-debt --json',
        `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
        'rai ship-readiness',
      ]
      : [
        `rai ui-direction --goal ${qGoal} --json`,
        `rai ui-spec --goal ${qGoal} --json`,
        `rai state-atlas --goal ${qGoal} --json`,
        `rai component-strategy --goal ${qGoal} --json`,
        `rai ui-plan --goal ${qGoal} --json`,
        `rai ui-recipe --goal ${qGoal} --json`,
        `rai ui-review --goal ${qGoal} --json`,
      ],
    commandFamilies: reviewBundle
      ? buildFamilies(
        {
          id: 'inspect',
          label: 'Inspect + review',
          objective: 'Identify the actual surface before choosing accessibility or responsive fixes.',
          commands: [
            'rai map-frontend --json',
            `rai ui-review --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Expand the quality stack',
          objective: 'Group responsive, design-debt, and review evidence under one operator flow.',
          commands: [
            'rai responsive-matrix --json',
            'rai design-debt --json',
          ],
        },
        {
          id: 'prove',
          label: 'Verify + close',
          objective: 'Connect frontend review evidence to trust and ship gating.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      )
      : buildFamilies(
        {
          id: 'inspect',
          label: 'Identify + direct',
          objective: 'Map the frontend surface and lock the initial direction before patching.',
          commands: [
            'rai map-frontend --json',
            `rai ui-direction --goal ${qGoal} --json`,
            `rai ui-spec --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Shape states + components',
          objective: 'Combine state, component, plan, and recipe work into one structured frontend lane.',
          commands: [
            `rai state-atlas --goal ${qGoal} --json`,
            `rai component-strategy --goal ${qGoal} --json`,
            `rai ui-plan --goal ${qGoal} --json`,
            `rai ui-recipe --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'prove',
          label: 'Review + verify',
          objective: 'Finish with UI review and trust checks so the visual lane proves itself.',
          commands: [
            `rai ui-review --goal ${qGoal} --json`,
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          ],
        },
      ),
    phases: reviewBundle
      ? buildPhases(
        {
          id: 'identify',
          label: 'Identify the reviewed surface',
          objective: 'Confirm framework, routing, design system, and the correct frontend review lane.',
          commands: [
            'rai map-frontend --json',
            `rai ui-review --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Expand the debt view',
          objective: 'Run responsive and design-debt outputs as one productized quality stack.',
          commands: [
            'rai responsive-matrix --json',
            'rai design-debt --json',
          ],
        },
        {
          id: 'prove',
          label: 'Verify + close',
          objective: 'Convert the frontend review into trust gates and ship blockers.',
          commands: [
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
            'rai ship-readiness',
          ],
        },
      )
      : buildPhases(
        {
          id: 'identify',
          label: 'Identify the surface',
          objective: 'Start with map-frontend so the harness knows what kind of product surface it is serving.',
          commands: [
            'rai map-frontend --json',
            `rai ui-direction --goal ${qGoal} --json`,
            `rai ui-spec --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'shape',
          label: 'Shape the implementation lane',
          objective: 'Use state, component, plan, and recipe commands together instead of as isolated frontend tools.',
          commands: [
            `rai state-atlas --goal ${qGoal} --json`,
            `rai component-strategy --goal ${qGoal} --json`,
            `rai ui-plan --goal ${qGoal} --json`,
            `rai ui-recipe --goal ${qGoal} --json`,
          ],
        },
        {
          id: 'prove',
          label: 'Review + verify',
          objective: 'Capture visual evidence and trust checks before calling the UI slice done.',
          commands: [
            `rai ui-review --goal ${qGoal} --json`,
            `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          ],
        },
      ),
    cliFlow: [
      'Start with map-frontend so the product surface is explicit before the lane assumes web, dashboard, landing-page, or mobile structure.',
      'Use ui-direction plus ui-spec as the first lean pack; widen into state-atlas, component-strategy, ui-plan, and ui-recipe as one structured frontend lane instead of separate guesses.',
      reviewBundle
        ? 'Use responsive-matrix and design-debt as complementary outputs from the same review bundle, not disconnected follow-up commands.'
        : 'Use component-strategy to decide reuse/extract/build sequencing before page-local JSX starts multiplying.',
      'Capture visual verification at the end of each UI slice.',
    ],
    codexAppFlow: [
      'Pin FRONTEND_PROFILE, UI-DIRECTION, UI-SPEC, and the latest verification artifact first; add the rest only when the task grows.',
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
  }, reviewBundle ? 'frontend-review' : 'frontend-delivery', goal);
}

function shipFlow(goal) {
  const qGoal = quoteGoal(goal);
  return flowEnvelope({
    primaryCommand: facadeCommand(goal),
    resolvedPrimaryCommand: `rai verify --goal ${qGoal} --ship`,
    secondaryCommands: [
      `rai verify --goal ${qGoal} --ship`,
      'rai verify-work --json',
      'rai ship-readiness',
      'rai review --json',
      'rai ship --json',
      'rai release-notes --json',
      'rai session-report --json',
    ],
    commandFamilies: buildFamilies(
      {
        id: 'prove',
        label: 'Prove release safety',
        objective: 'Run verification in ship mode and expose remaining trust gaps.',
        commands: [
          `rai verify --goal ${qGoal} --ship`,
          'rai verify-work --json',
          'rai ship-readiness',
        ],
      },
      {
        id: 'closeout',
        label: 'Package closeout artifacts',
        objective: 'Turn the verified release state into reusable delivery documents.',
        commands: [
          'rai review --json',
          'rai ship --json',
          'rai release-notes --json',
          'rai session-report --json',
        ],
      },
    ),
    phases: buildPhases(
      {
        id: 'prove',
        label: 'Verify in release mode',
        objective: 'Do not assume readiness; force the ship-facing trust gate first.',
        commands: [
          `rai verify --goal ${qGoal} --ship`,
          'rai verify-work --json',
          'rai ship-readiness',
        ],
      },
      {
        id: 'closeout',
        label: 'Publish closeout artifacts',
        objective: 'Generate the package that explains what is shipping and what remains.',
        commands: [
          'rai review --json',
          'rai ship --json',
          'rai release-notes --json',
          'rai session-report --json',
        ],
      },
    ),
    cliFlow: [
      'Start with verify in ship mode so the trust layer decides whether release packaging should continue.',
      'Use verify-work and ship-readiness together: one explains the remaining gaps, the other expresses them as ship blockers.',
      'Generate closeout artifacts only after the trust gate has a coherent verdict.',
    ],
    codexAppFlow: [
      'Pin the latest verify-work, ship-readiness, review, and ship package outputs together for release conversations.',
    ],
    parallelFlow: [],
    specialtyFlows: {},
  }, 'ship-closeout', goal);
}

function defaultFlow(goal, options = {}) {
  const qGoal = quoteGoal(goal);
  const monorepo = Boolean(options.monorepo);
  return flowEnvelope({
    primaryCommand: facadeCommand(goal),
    resolvedPrimaryCommand: `rai do --goal ${qGoal}`,
    secondaryCommands: [
      `rai audit --goal ${qGoal}`,
      `rai plan --goal ${qGoal}`,
      `rai fix --goal ${qGoal}`,
      `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
      'rai ship-readiness',
      `rai codex promptpack --goal ${qGoal}`,
      `rai codex contextpack --goal ${qGoal}`,
    ],
    commandFamilies: buildFamilies(
      {
        id: 'inspect',
        label: 'Inspect + route',
        objective: 'Use one front door to route the goal and reveal the first bounded lane.',
        commands: [
          `rai do --goal ${qGoal}`,
          `rai audit --goal ${qGoal}`,
          monorepo ? 'rai monorepo --json' : null,
        ].filter(Boolean),
      },
      {
        id: 'shape',
        label: 'Shape + plan',
        objective: 'Turn the routed work into an executable plan and bounded fix lane.',
        commands: [
          `rai plan --goal ${qGoal}`,
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Prove + close',
        objective: 'Verify the current slice and expose any remaining ship blockers.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai ship-readiness',
        ],
      },
    ),
    phases: buildPhases(
      {
        id: 'inspect',
        label: 'Route the slice',
        objective: 'Use the intent router and first audit pass to avoid manual command hunting.',
        commands: [
          `rai do --goal ${qGoal}`,
          `rai audit --goal ${qGoal}`,
          monorepo ? 'rai monorepo --json' : null,
        ].filter(Boolean),
      },
      {
        id: 'shape',
        label: 'Shape the execution wave',
        objective: 'Promote the slice into an explicit plan and the next safe correction wave.',
        commands: [
          `rai plan --goal ${qGoal}`,
          `rai fix --goal ${qGoal}`,
        ],
      },
      {
        id: 'prove',
        label: 'Verify and close',
        objective: 'Finish with trust checks and a ship-facing summary.',
        commands: [
          `rai verify --goal ${quoteGoal(`verify ${goal}`)}`,
          'rai ship-readiness',
        ],
      },
    ),
    cliFlow: [
      'Use rai do to pick the right lane, then follow the suggested commands in order.',
      'Use rai start when you want the same lane packaged as a structured bundle instead of separate commands.',
    ],
    codexAppFlow: [
      'Pin the generated context pack and the active workflow docs before large edits.',
      'Treat the start bundle as the operator-facing version of the same route and artifact set.',
    ],
    parallelFlow: [],
    specialtyFlows: {},
  }, 'slice-delivery', goal);
}

function buildCommandPlan(payload = {}) {
  const goal = payload.goal || '';
  const lane = payload.lane || 'execute';
  const monorepo = payload.repoSignals?.monorepo || Boolean(payload.monorepo);
  const review = lane === 'review' || payload.capability?.includes('review');
  const frontend = lane === 'frontend' || payload.capability?.includes('ui_');
  const reviewFirstMonorepo = monorepo
    && review
    && !wantsRepoAudit(goal)
    && /\b(review|subsystem|package|shard|track|area|hotspot)\b/i.test(goal);
  const correction = !reviewFirstMonorepo
    && wantsCorrectionWave(goal)
    && (review || wantsRepoAudit(goal) || monorepo || /fix|patch|repair|execute\.quick_patch/.test(payload.capability || ''));
  const repoAudit = review && wantsRepoAudit(goal) && !correction;
  const frontendReview = frontend && wantsFrontendReview(goal);
  const ship = lane === 'ship' || payload.capability?.includes('ship') || (wantsVerify(goal) && /\b(ship|release|readiness|launch|go live)\b/i.test(goal));

  let flow = defaultFlow(goal, { monorepo });
  if (ship) {
    flow = shipFlow(goal);
  } else if (correction) {
    flow = correctionFlow(goal, { monorepo });
  } else if (repoAudit) {
    flow = repoAuditFlow(goal, { monorepo });
  } else if (review) {
    flow = reviewFlow(goal, { monorepo });
  } else if (frontend) {
    flow = frontendFlow(goal, { frontendReview });
  }

  const executionMode = monorepo || payload.trust?.verifyNeeded ? 'scoped-multi-step' : 'single-lane';
  const codexPreset = payload.profile?.id || payload.recommendedPreset || 'balanced';

  return {
    executionMode,
    codexPreset,
    bundleId: flow.bundleId,
    bundleLabel: flow.bundleLabel,
    relatedBundles: flow.relatedBundles,
    recommendedStartCommand: flow.recommendedStartCommand,
    primaryCommand: flow.primaryCommand,
    resolvedPrimaryCommand: flow.resolvedPrimaryCommand || flow.primaryCommand,
    secondaryCommands: flow.secondaryCommands,
    commandFamilies: flow.commandFamilies,
    phases: flow.phases,
    cliFlow: flow.cliFlow,
    codexAppFlow: flow.codexAppFlow,
    parallelFlow: flow.parallelFlow,
    specialtyFlows: flow.specialtyFlows,
  };
}

module.exports = {
  buildCommandPlan,
};
