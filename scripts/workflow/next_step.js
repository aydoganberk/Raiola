const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractSection,
  formatWorkflowControlCommand,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  read,
  readPlanGateStatus,
  resolveWorkflowRoot,
  workflowControlExamplesForFamily,
  workflowPaths,
} = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const { writeStateSurface } = require('./state_surface');

function printHelp() {
  console.log(`
next_step

Usage:
  node scripts/workflow/next_step.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --json            Print machine-readable JSON
  `);
}

function checklistForProfile(profile, variants) {
  return variants[profile] || variants.standard;
}

function deriveRecommendation(state) {
  const {
    preferences,
    milestone,
    step,
    contextReadiness,
    planGate,
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
    frontendProfile,
  } = state;

  const recommendation = {
    title: '',
    command: '',
    checklist: [],
    note: '',
  };
  const controlCommand = formatWorkflowControlCommand('<user request>');
  const parallelExamples = workflowControlExamplesForFamily('parallel_control', 4);
  const teamLiteHint = `If the user explicitly asks for parallel/subagent/delegate/team mode${parallelExamples.length > 0 ? ` (${parallelExamples.join(', ')})` : ''}, normalize it with ${controlCommand} and then route it with workflow:delegation-plan -- --activation-text "<user request>"`;
  const frontendHint = frontendProfile.frontendMode.active
    ? `Frontend mode is active; adapter route=${frontendProfile.adapters.selected.join(', ') || 'none'}`
    : frontendProfile.signals.hits.length > 0
      ? 'Frontend signals are present; run workflow:map-frontend to refresh adapter routing and visual verdict expectations'
      : null;

  if (handoffStatus === 'ready_to_resume' && handoffNext) {
    recommendation.title = 'Resume from handoff';
    recommendation.command = 'npm run workflow:resume-work';
    recommendation.checklist = [
      'Read the Execution Cursor and Packet Snapshot sections in HANDOFF.md',
      'Run workflow:health -- --strict after resuming',
      'If health is clean, run workflow:next for a fresh step check',
    ];
    recommendation.note = handoffNext;
    return recommendation;
  }

  if (windowStatus.decision !== 'continue' && milestone !== 'NONE' && ['execute', 'audit', 'complete'].includes(step)) {
    recommendation.title = 'Do not start the next step in this window';
    recommendation.command = 'npm run workflow:pause-work -- --summary "Window budget threshold reached"';
    recommendation.checklist = [
      `WINDOW decision -> ${windowStatus.decision}`,
      'Compact the current window or capture a handoff snapshot',
      'In the next window follow workflow:resume-work -> workflow:health -- --strict -> workflow:next',
    ];
    recommendation.note = `Remaining budget: ${windowStatus.estimatedRemainingTokens}`;
    return recommendation;
  }

  if (milestone === 'NONE') {
    recommendation.title = 'Open or switch a milestone';
    recommendation.command = 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..." --profile standard --automation manual';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'If needed, check the active root first with workflow:workstreams status',
        'Choose the lite|standard|full profile based on task size',
        'Start with the discuss step when the new milestone opens',
      ],
      standard: [
        'If needed, check the active root first with workflow:workstreams status',
        'Pull in any open seeds that match the new milestone scope',
        'Choose the lite|standard|full profile based on task size',
        'Start with the discuss step when the new milestone opens',
      ],
      full: [
        'If needed, check the active root first with workflow:workstreams status',
        'Pull open seeds and carryforward items into milestone scope when relevant',
        'Choose the full profile if handoff/closeout is likely',
        'Start with the discuss step when the new milestone opens',
        'Quickly scan RETRO.md for any one-time process gaps',
      ],
    });
    recommendation.note = seeds.length > 0
      ? `Open seeds: ${seeds.length} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`
      : `There is no active milestone | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (step === 'discuss') {
    recommendation.title = preferences.discussMode === 'assumptions'
      ? 'Run discuss in assumptions mode'
      : 'Run discuss in interview mode';
    recommendation.command = 'Refresh the initial packet snapshot in CONTEXT.md when discuss is done';
    recommendation.checklist = preferences.discussMode === 'assumptions'
      ? checklistForProfile(preferences.workflowProfile, {
        lite: [
          'Complete intent capture first: write User Intent and the first Requirement List rows',
          'Move into constraint extraction: capture Explicit Constraints and high-leverage questions',
          'Finish execution shaping: add Alternatives Considered and an observable Success Rubric',
        ],
        standard: [
          'Scan 5-15 relevant files while filling User Intent and Requirement List with evidence-backed scope',
          'Capture Explicit Constraints, unanswered questions, and the assumptions table',
          'Finish execution shaping with Alternatives Considered and an observable Success Rubric',
          'Fill Claim Ledger, Unknowns, and Canonical Refs',
          'Write seed intake and active recall context into CONTEXT.md',
        ],
        full: [
          'Scan 5-15 relevant files while filling User Intent and Requirement List with evidence-backed scope',
          'Capture Explicit Constraints, unanswered questions, and the assumptions table',
          'Finish execution shaping with Alternatives Considered and an observable Success Rubric',
          'Fill Claim Ledger, Unknowns, and Canonical Refs',
          'Write seed intake, active recall, and failure/falsifier notes',
          'Note which finding could invalidate scope before research finishes',
        ],
      })
      : checklistForProfile(preferences.workflowProfile, {
        lite: [
          'Clarify the user intent first and draft the initial Requirement List',
          'Ask only high-impact questions that affect constraints or slice choice',
          'Write Explicit Constraints, Alternatives Considered, and Success Rubric in CONTEXT.md',
        ],
        standard: [
          'Clarify the user intent first and draft the initial Requirement List',
          'Ask only high-impact questions that affect constraints or slice choice',
          'Write Explicit Constraints, Alternatives Considered, and unresolved uncertainty into CONTEXT.md',
          'Fill the initial packet snapshot fields in CONTEXT.md',
        ],
        full: [
          'Clarify the user intent first and draft the initial Requirement List',
          'Ask only high-impact questions that affect constraints or slice choice',
          'Write Explicit Constraints, Alternatives Considered, and unresolved uncertainty into CONTEXT.md',
          'Fill canonical refs, unknowns, and falsifier fields',
          'Note early if handoff/closeout is likely',
        ],
    });
    if (preferences.automationMode !== 'manual') {
      recommendation.checklist.push(
        preferences.automationMode === 'phase'
          ? 'Automation mode is phase, so Codex may finish discuss and the current phase before pausing at the next boundary'
          : 'Automation mode is full, so Codex may keep moving through phase boundaries until blocked, complete, or window-managed',
      );
    }
    recommendation.note = activeRecall.length > 0
      ? `This milestone has ${activeRecall.length} active recall note(s) | plan=${planGate} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`
      : `After discuss, the plan gate is still ${planGate} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (step === 'research') {
    recommendation.title = 'Consolidate research and validation inputs';
    recommendation.command = 'Update CONTEXT.md and VALIDATION.md when research is complete';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Run workflow:map-codebase if stack or repo-shape assumptions are still fuzzy',
        'Fill the touched files section',
        'Write the risks and verification surface sections',
        'Narrow Acceptance Criteria, User-visible Outcomes, and the VALIDATION.md contract table to milestone scope',
      ],
      standard: [
        'Run workflow:map-codebase to refresh stack, architecture, quality, and risk lanes',
        'Write touched files, dependency map, and risks into CONTEXT.md',
        'Update verification surface and research target files',
        'Narrow Acceptance Criteria, User-visible Outcomes, Regression Focus, and the VALIDATION.md contract table to milestone scope',
        'Update plan readiness only if it is truly ready',
      ],
      full: [
        'Run workflow:map-codebase to refresh stack, architecture, quality, and risk lanes',
        'Write touched files, dependency map, and risks into CONTEXT.md',
        'Update verification surface, research targets, and falsifier fields',
        'Narrow Acceptance Criteria, User-visible Outcomes, Regression Focus, and the VALIDATION.md contract table to milestone scope',
        'Update plan readiness only if it is truly ready',
        'Capture a RETRO note if recurring process friction appeared',
      ],
    });
    if (teamLiteHint) {
      recommendation.checklist.push(teamLiteHint);
    }
    if (frontendHint) {
      recommendation.checklist.push(frontendHint);
    }
    if (frontendProfile.frontendMode.active || frontendProfile.signals.hits.length > 0) {
      recommendation.checklist.push('Run workflow:map-frontend to fingerprint the stack and sync frontend audit fields in VALIDATION.md');
      recommendation.checklist.push('If frontend mode is active, narrow Validation around responsive, interaction, visual consistency, component reuse, accessibility smoke, and screenshot evidence');
    }
    recommendation.note = planGate === 'pass'
      ? `Context is ready; the plan step can start cleanly | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`
      : `Move to the plan step once research findings are complete; current gate=${planGate} | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (step === 'plan') {
    recommendation.title = 'Write the Plan of Record';
    recommendation.command = 'EXECPLAN.md > Plan of Record';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Write Chosen Strategy, Rollback / Fallback, Wave Structure, Coverage Matrix, and Plan Chunk Table',
        'Run workflow:plan-check -- --sync --strict before execute starts',
      ],
      standard: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Use workflow:delegation-plan only if the user explicitly wants a parallel route',
        'Write Chosen Strategy, Rejected Strategies, Rollback / Fallback, Dependency Blockers, Wave Structure, Coverage Matrix, and Plan Chunk Table',
        'Keep chunk slices vertical and capability-oriented rather than UI/API/model splits',
        'Run workflow:plan-check -- --sync --strict before execute starts',
      ],
      full: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Use workflow:delegation-plan only if the user explicitly wants a parallel route',
        'Write Chosen Strategy, Rejected Strategies, Rollback / Fallback, Dependency Blockers, Wave Structure, Coverage Matrix, and Plan Chunk Table',
        'Keep chunk slices vertical and capability-oriented rather than UI/API/model splits',
        'Run workflow:plan-check -- --sync --strict before execute starts',
        'Only continue if the new chunk leaves minimum next-step budget; otherwise split it',
      ],
    });
    if (frontendProfile.frontendMode.active) {
      recommendation.checklist.push('Run workflow:map-frontend if the current profile is stale before locking the plan');
      recommendation.checklist.push(`Choose the frontend adapter route explicitly -> ${frontendProfile.adapters.selected.join(', ') || 'none'}`);
      recommendation.checklist.push('Make design-system-aware execution and visual verdict requirements explicit in VALIDATION.md');
    }
    recommendation.note = planGate === 'pass'
      ? `Plan gate is clean; execute can start within the checked plan | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`
      : `The source of truth is the Plan of Record section in EXECPLAN.md, but execute must wait for workflow:plan-check | gate=${planGate} | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (['execute', 'audit'].includes(step) && planGate !== 'pass') {
    recommendation.title = 'Do not advance until plan-check passes';
    recommendation.command = 'npm run workflow:plan-check -- --sync --strict';
    recommendation.checklist = [
      'Fill any remaining placeholders in CONTEXT.md, EXECPLAN.md, and VALIDATION.md',
      'Ensure every requirement maps exactly once into the coverage matrix',
      'Keep plan chunks capability-oriented rather than UI/API/model slices',
      'Only continue once the plan gate becomes pass and plan-ready becomes yes',
    ];
    recommendation.note = `Current gate -> ${planGate} | readiness=${contextReadiness || 'unknown'} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (step === 'execute') {
    recommendation.title = 'Execute the current run chunk';
    recommendation.command = 'Apply the Current run chunk checklist in EXECPLAN.md';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Stay strictly inside the active milestone scope',
        'If work drifts beyond plan, update docs first',
        'Refresh summary fields in STATUS.md after meaningful changes',
      ],
      standard: [
        'Stay strictly inside the active milestone scope',
        'Only use workflow:delegation-plan -- --start after write ownership is explicit and disjoint',
        'If work drifts beyond plan, update docs first',
        'Refresh STATUS.md Verified/Inferred/Unknown after meaningful changes',
        'Save intermediate reminders as Active Recall Items when needed',
      ],
      full: [
        'Stay strictly inside the active milestone scope',
        'Only use workflow:delegation-plan -- --start after write ownership is explicit and disjoint',
        'If work drifts beyond plan, update docs first',
        'Refresh STATUS.md Verified/Inferred/Unknown after meaningful changes',
        'Save intermediate reminders as Active Recall Items when needed',
        'If process friction happened, keep a short note for RETRO.md after closeout',
      ],
    });
    if (frontendProfile.frontendMode.active) {
      recommendation.checklist.push(`Keep the selected adapter route active -> ${frontendProfile.adapters.selected.join(', ') || 'none'}`);
      recommendation.checklist.push('Stay design-system-aware and avoid ad hoc UI primitives when the repo already exposes shared surfaces');
      recommendation.checklist.push('Prepare audit evidence for the visual verdict protocol while implementing, not after the fact');
    }
    recommendation.note = `If execution drifts beyond plan, update docs first | plan=${planGate} | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  if (step === 'audit') {
    recommendation.title = 'Run validation and audit';
    recommendation.command = 'Close the audit using VALIDATION.md and STATUS.md';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Run the verify command rows in the VALIDATION.md contract table',
        'Write manual checks and remaining risks into STATUS.md',
        'Do not complete the milestone before audit closes',
      ],
      standard: [
        'Run the verify command rows in the VALIDATION.md contract table',
        'If audit work needs parallel read-only help, route it with workflow:delegation-plan -- --start',
        'Write manual checks and remaining risks into STATUS.md',
        'Update evidence and packet hash columns',
        'Confirm workflow:health -- --strict is clean before complete',
      ],
      full: [
        'Run the verify command rows in the VALIDATION.md contract table',
        'If audit work needs parallel read-only help, route it with workflow:delegation-plan -- --start',
        'Write manual checks and remaining risks into STATUS.md',
        'Update evidence and packet hash columns',
        'Confirm workflow:health -- --strict is clean before complete',
        'If a process gap appeared, capture a one-line RETRO note',
      ],
    });
    if (frontendProfile.frontendMode.active) {
      recommendation.checklist.push('Treat visual verdict as part of the audit contract, not optional polish');
      recommendation.checklist.push('Close responsive, interaction, visual consistency, component reuse, accessibility smoke, and screenshot evidence rows');
      recommendation.checklist.push('Use browser/preview verification when the adapter route or validation surface expects it');
    }
    recommendation.note = `Do not complete the milestone before audit closes | plan=${planGate} | frontend=${frontendProfile.frontendMode.status} | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
    return recommendation;
  }

  recommendation.title = 'Close out the milestone';
  recommendation.command = 'npm run workflow:complete-milestone -- --agents-review unchanged --summary "..." --stage-paths <paths>';
  recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
    lite: [
      'Select carryforward items',
      'The validation contract and packet snapshot will move into the archive',
      'Pass --stage-paths if the git scope is not obvious',
    ],
    standard: [
      'Select carryforward items',
      'The validation contract and packet snapshot will move into the archive',
      'Check whether AGENTS.md needs an update',
      'Pass --stage-paths if git scope is not obvious, or use --allow-workflow-only for docs-only closeout',
    ],
    full: [
      'Select carryforward items',
      'The validation contract and packet snapshot will move into the archive',
      'Confirm Active Recall cleanup matches the milestone',
      'Check whether AGENTS.md and RETRO.md need process updates',
      'Pass --stage-paths if git scope is not obvious, or use --allow-workflow-only for docs-only closeout',
    ],
  });
  recommendation.note = `Planning for the next milestone starts after complete | profile=${preferences.workflowProfile} | automation=${preferences.automationMode}`;
  return recommendation;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const status = read(paths.status);
  const handoff = read(paths.handoff);
  const memory = read(paths.memory);
  const seedsDoc = read(paths.seeds);
  const preferences = loadPreferences(paths);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(status, 'Current milestone step') || 'unknown').trim();
  const contextReadiness = String(getFieldValue(status, 'Context readiness') || 'unknown').trim();
  const planGate = readPlanGateStatus(paths);
  const handoffStatus = String(getFieldValue(handoff, 'Handoff status') || 'idle').trim();
  const handoffNext = extractSection(handoff, 'Immediate Next Action');
  const activeRecall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === milestone);
  const seeds = parseSeedEntries(extractSection(seedsDoc, 'Open Seeds'), 'No open seeds yet');
  const windowStatus = computeWindowStatus(paths);
  const frontendProfile = buildFrontendProfile(cwd, rootDir);

  const recommendation = deriveRecommendation({
    preferences,
    milestone,
    step,
    contextReadiness,
    planGate,
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
    frontendProfile,
  });

  const payload = {
    rootDir: path.relative(cwd, rootDir),
    milestone,
    step,
    planGate,
    contextReadiness,
    preferences,
    packetHash: windowStatus.packet.inputHash,
    estimatedTokens: windowStatus.packet.estimatedTotalTokens,
    budgetStatus: windowStatus.packet.budgetStatus,
    recommendedReadSet: windowStatus.packet.recommendedReadSet,
    windowStatus: {
      decision: windowStatus.decision,
      remainingBudget: windowStatus.estimatedRemainingTokens,
      canStartNextStep: windowStatus.canStartNextChunk,
      canFinishCurrentChunk: windowStatus.canFinishCurrentChunk,
      automationRecommendation: windowStatus.automationRecommendation,
    },
    automation: {
      mode: preferences.automationMode,
      status: preferences.automationStatus,
      windowPolicy: preferences.automationWindowPolicy,
    },
    frontend: {
      active: frontendProfile.frontendMode.active,
      status: frontendProfile.frontendMode.status,
      framework: frontendProfile.framework.primary,
      uiSystem: frontendProfile.uiSystem.primary,
      adapters: frontendProfile.adapters.selected,
      visualVerdictRequired: frontendProfile.visualVerdict.required,
      signals: frontendProfile.signals.hits.map((item) => item.label),
      refreshStatus: frontendProfile.fingerprint.refreshStatus,
    },
    recommendation,
  };

  writeStateSurface(cwd, rootDir, {
    window: {
      decision: payload.windowStatus.decision,
      remainingBudget: payload.windowStatus.remainingBudget,
      canStartNextStep: payload.windowStatus.canStartNextStep,
      canFinishCurrentChunk: payload.windowStatus.canFinishCurrentChunk,
      packetHash: payload.packetHash,
      estimatedTokens: payload.estimatedTokens,
      budgetStatus: payload.budgetStatus,
    },
    next: {
      title: recommendation.title,
      command: recommendation.command,
      note: recommendation.note,
      checklist: recommendation.checklist,
    },
    frontend: payload.frontend,
  }, { updatedBy: 'next' });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# NEXT\n`);
  console.log(`- Root: \`${payload.rootDir}\``);
  console.log(`- Milestone: \`${milestone}\``);
  console.log(`- Step: \`${step}\``);
  console.log(`- Plan gate: \`${planGate}\``);
  console.log(`- Context readiness: \`${contextReadiness}\``);
  console.log(`- Workflow profile: \`${preferences.workflowProfile}\``);
  console.log(`- Automation mode: \`${preferences.automationMode}\``);
  console.log(`- Automation status: \`${preferences.automationStatus}\``);
  console.log(`- Discuss mode: \`${preferences.discussMode}\``);
  console.log(`- Git isolation: \`${preferences.gitIsolation}\``);
  console.log(`- Team Lite delegation: \`${preferences.teamLiteDelegation}\``);
  console.log(`- Frontend mode: \`${payload.frontend.status}\``);
  console.log(`- Frontend framework: \`${payload.frontend.framework}\``);
  console.log(`- Frontend adapters: \`${payload.frontend.adapters.join(', ') || 'none'}\``);
  console.log(`- Visual verdict required: \`${payload.frontend.visualVerdictRequired ? 'yes' : 'no'}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Estimated tokens: \`${payload.estimatedTokens}\``);
  console.log(`- Budget status: \`${payload.budgetStatus}\``);
  console.log(`- Remaining budget: \`${payload.windowStatus.remainingBudget}\``);
  console.log(`- Can start next step: \`${payload.windowStatus.canStartNextStep ? 'yes' : 'no'}\``);
  console.log(`- Automation recommendation: \`${payload.windowStatus.automationRecommendation}\``);
  console.log(`\n## Recommended Read Set\n`);
  if (payload.recommendedReadSet.length === 0) {
    console.log('- `No recommended read set yet`');
  } else {
    for (const item of payload.recommendedReadSet) {
      console.log(`- \`${item}\``);
    }
  }
  console.log(`\n## Recommendation\n`);
  console.log(`- Title: \`${recommendation.title}\``);
  console.log(`- Command: \`${recommendation.command}\``);
  console.log(`- Note: \`${recommendation.note}\``);
  console.log(`\n## Checklist\n`);
  for (const item of recommendation.checklist) {
    console.log(`- \`${item}\``);
  }
}

main();
