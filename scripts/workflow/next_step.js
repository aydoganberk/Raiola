const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractSection,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  read,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
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
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
  } = state;

  const recommendation = {
    title: '',
    command: '',
    checklist: [],
    note: '',
  };
  const teamLiteHint = preferences.teamLiteDelegation === 'off'
    ? null
    : 'If the user explicitly asks for parallel/subagent/delegate/team mode, route it with workflow:delegation-plan -- --activation-text "<user request>"';

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

  if (windowStatus.decision !== 'continue' && milestone !== 'NONE') {
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
    recommendation.command = 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."';
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
      ? `Open seeds: ${seeds.length} | profile=${preferences.workflowProfile}`
      : `There is no active milestone | profile=${preferences.workflowProfile}`;
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
          'Scan the relevant core files and write scope assumptions',
          'Clarify goal, non-goals, and success signal',
          'Fill in canonical refs and the assumptions table in CONTEXT.md',
        ],
        standard: [
          'Scan 5-15 relevant files and fill in the evidence-backed assumptions table',
          'Clarify goal, non-goals, and success signal',
          'Fill Claim Ledger, Unknowns, and Canonical Refs',
          'Write seed intake and active recall context into CONTEXT.md',
        ],
        full: [
          'Scan 5-15 relevant files and fill in the evidence-backed assumptions table',
          'Clarify goal, non-goals, and success signal',
          'Fill Claim Ledger, Unknowns, and Canonical Refs',
          'Write seed intake, active recall, and failure/falsifier notes',
          'Note which finding could invalidate scope before research finishes',
        ],
      })
      : checklistForProfile(preferences.workflowProfile, {
        lite: [
          'Clarify goal, non-goals, and success signal',
          'Ask only high-impact questions',
          'Fill the initial packet snapshot fields in CONTEXT.md',
        ],
        standard: [
          'Clarify goal, non-goals, and success signal',
          'Ask only high-impact questions',
          'Write unresolved uncertainty into the assumptions table',
          'Fill the initial packet snapshot fields in CONTEXT.md',
        ],
        full: [
          'Clarify goal, non-goals, and success signal',
          'Ask only high-impact questions',
          'Write unresolved uncertainty into the assumptions table',
          'Fill canonical refs, unknowns, and falsifier fields',
          'Note early if handoff/closeout is likely',
        ],
      });
    recommendation.note = activeRecall.length > 0
      ? `This milestone has ${activeRecall.length} active recall note(s) | profile=${preferences.workflowProfile}`
      : `After discuss, CONTEXT.md is not yet plan-ready | profile=${preferences.workflowProfile}`;
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
        'Narrow the VALIDATION.md contract table to milestone scope',
      ],
      standard: [
        'Run workflow:map-codebase to refresh stack, architecture, quality, and risk lanes',
        'Write touched files, dependency map, and risks into CONTEXT.md',
        'Update verification surface and research target files',
        'Narrow the VALIDATION.md contract table to milestone scope',
        'Update plan readiness only if it is truly ready',
      ],
      full: [
        'Run workflow:map-codebase to refresh stack, architecture, quality, and risk lanes',
        'Write touched files, dependency map, and risks into CONTEXT.md',
        'Update verification surface, research targets, and falsifier fields',
        'Narrow the VALIDATION.md contract table to milestone scope',
        'Update plan readiness only if it is truly ready',
        'Capture a RETRO note if recurring process friction appeared',
      ],
    });
    if (teamLiteHint) {
      recommendation.checklist.push(teamLiteHint);
    }
    recommendation.note = contextReadiness === 'plan_ready'
      ? `Context is ready; the plan step can start | profile=${preferences.workflowProfile}`
      : `Move to the plan step once research findings are complete | profile=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'plan') {
    recommendation.title = 'Write the Plan of Record';
    recommendation.command = 'EXECPLAN.md > Plan of Record';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Write the plan so it fits into 1-2 run chunks',
        'Fill the estimated packet / execution / verify overhead fields',
      ],
      standard: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Use workflow:delegation-plan only if the user explicitly wants a parallel route',
        'Write the plan so it fits into 1-2 run chunks and fill chunk cursor fields',
        'Fill estimated packet tokens / execution overhead / verify overhead',
        'Clarify out-of-scope guardrails and the audit plan',
      ],
      full: [
        'Read CARRYFORWARD.md and the relevant seeds',
        'Use workflow:delegation-plan only if the user explicitly wants a parallel route',
        'Write the plan so it fits into 1-2 run chunks and fill chunk cursor fields',
        'Fill estimated packet tokens / execution overhead / verify overhead',
        'Clarify out-of-scope guardrails, audit plan, and resume anchor',
        'Only continue if the new chunk leaves minimum next-step budget; otherwise split it',
      ],
    });
    recommendation.note = `The source of truth is the Plan of Record section in EXECPLAN.md | profile=${preferences.workflowProfile}`;
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
    recommendation.note = `If execution drifts beyond plan, update docs first | profile=${preferences.workflowProfile}`;
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
    recommendation.note = `Do not complete the milestone before audit closes | profile=${preferences.workflowProfile}`;
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
  recommendation.note = `Planning for the next milestone starts after complete | profile=${preferences.workflowProfile}`;
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
  const handoffStatus = String(getFieldValue(handoff, 'Handoff status') || 'idle').trim();
  const handoffNext = extractSection(handoff, 'Immediate Next Action');
  const activeRecall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === milestone);
  const seeds = parseSeedEntries(extractSection(seedsDoc, 'Open Seeds'), 'No open seeds yet');
  const windowStatus = computeWindowStatus(paths);

  const recommendation = deriveRecommendation({
    preferences,
    milestone,
    step,
    contextReadiness,
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
  });

  const payload = {
    rootDir: path.relative(cwd, rootDir),
    milestone,
    step,
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
  }, { updatedBy: 'next' });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# NEXT\n`);
  console.log(`- Root: \`${payload.rootDir}\``);
  console.log(`- Milestone: \`${milestone}\``);
  console.log(`- Step: \`${step}\``);
  console.log(`- Workflow profile: \`${preferences.workflowProfile}\``);
  console.log(`- Discuss mode: \`${preferences.discussMode}\``);
  console.log(`- Git isolation: \`${preferences.gitIsolation}\``);
  console.log(`- Team Lite delegation: \`${preferences.teamLiteDelegation}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Estimated tokens: \`${payload.estimatedTokens}\``);
  console.log(`- Budget status: \`${payload.budgetStatus}\``);
  console.log(`- Remaining budget: \`${payload.windowStatus.remainingBudget}\``);
  console.log(`- Can start next step: \`${payload.windowStatus.canStartNextStep ? 'yes' : 'no'}\``);
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
