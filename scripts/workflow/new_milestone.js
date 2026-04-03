const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  controlPaths,
  ensureUniqueMilestoneId,
  extractSection,
  getFieldValue,
  getOpenCarryforwardItems,
  loadPreferences,
  normalizeAutomationMode,
  normalizeWorkflowProfile,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseSeedEntries,
  parseWorkstreamTable,
  profileDefaultsFor,
  read,
  renderMarkdownTable,
  renderMilestoneTable,
  renderRefTable,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  resolveWorkflowRoot,
  setActiveMilestoneCard,
  syncPacketHash,
  syncWindowDocument,
  today,
  warnAgentsSize,
  workflowPaths,
  write,
} = require('./common');

function printHelp() {
  console.log(`
new_milestone

Usage:
  node scripts/workflow/new_milestone.js --id M3 --name "Seed Yahoo stream" --goal "Prepare yahoo-sync workstream"

Options:
  --root <path>            Workflow root. Default: active workstream root
  --id <milestone-id>      Required. Example: M3
  --name <display-name>    Required. Milestone title
  --goal <goal>            Required. Milestone goal
  --phase <phase>          Optional. Default: current phase from STATUS/EXECPLAN or Phase 1
  --profile <mode>         Optional milestone profile override: lite|standard|full
  --automation <mode>      Optional automation mode: manual|phase|full
  --success <text>         Optional success signal
  --non-goals <text>       Optional non-goal summary
  --dry-run                Print AGENTS size check and planned changes without writing
  `);
}

function renderAssumptionsTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Confidence', 'Evidence refs', 'Failure mode'],
    [[
      'To be filled during discuss',
      'Unclear',
      contextRef,
      'Milestone scope may be framed incorrectly',
    ]],
  );
}

function renderClaimLedgerTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Type', 'Evidence refs', 'Confidence', 'Failure if wrong'],
    [[
      'Initial milestone packet only seeds the frame',
      'inference',
      contextRef,
      'Likely',
      'Planning may begin before research is ready',
    ]],
  );
}

function renderConstraintsTable() {
  return renderMarkdownTable(
    ['Constraint', 'Type', 'Source', 'Impact'],
    [[
      'No explicit constraints captured yet',
      'scope',
      'user',
      'Fill during constraint extraction before planning starts',
    ]],
  );
}

function renderAlternativesTable() {
  return renderMarkdownTable(
    ['Option', 'Status', 'Why'],
    [[
      'Keep the seeded milestone framing and refine it after codebase scan',
      'open',
      'Fill real alternatives during execution shaping',
    ]],
  );
}

function renderHighLeverageQuestionsTable(milestoneGoal) {
  return renderMarkdownTable(
    ['Question', 'Impact', 'Owner', 'Status'],
    [[
      `What is the smallest user-visible slice that proves "${milestoneGoal}" is done?`,
      'This decides how the plan should be sliced',
      'owner',
      'open',
    ]],
  );
}

function renderSuccessRubricTable(successSignal) {
  return renderMarkdownTable(
    ['Outcome', 'Observable signal', 'Why it matters'],
    [[
      'Milestone success',
      successSignal,
      'Execution should not start before success is observable',
    ]],
  );
}

function renderRequirementListTable(milestoneGoal) {
  return renderMarkdownTable(
    ['Requirement ID', 'Requirement', 'Type', 'Source', 'Notes'],
    [[
      'R1',
      milestoneGoal,
      'functional',
      'user',
      'Seeded from the milestone goal; refine or split during discuss',
    ]],
  );
}

function renderDependencyBlockersTable() {
  return renderMarkdownTable(
    ['Blocker', 'Type', 'Owner', 'Status', 'Unblock signal'],
    [[
      'No blockers identified yet',
      'none',
      'n/a',
      'clear',
      'Replace this row only if a real dependency blocker appears',
    ]],
  );
}

function renderWaveStructureTable() {
  return renderMarkdownTable(
    ['Wave', 'Chunks', 'Goal', 'Depends on'],
    [[
      '1',
      'chunk-1',
      'Fill once the chosen strategy and capability slices are explicit',
      'none',
    ]],
  );
}

function renderCoverageMatrixTable(milestoneLabel) {
  return renderMarkdownTable(
    ['Requirement ID', 'Milestone', 'Capability slice', 'Plan chunk', 'Validation ID', 'Notes'],
    [[
      'R1',
      milestoneLabel,
      'Fill during planning',
      'chunk-1',
      'AC1',
      'Every active requirement must map exactly once before execute',
    ]],
  );
}

function renderPlanChunkTable() {
  return renderMarkdownTable(
    ['Chunk ID', 'Capability slice', 'Deliverable', 'Depends on', 'Wave', 'Status'],
    [[
      'chunk-1',
      'Fill during planning',
      'Describe the first vertical capability slice',
      'none',
      '1',
      'pending',
    ]],
  );
}

function renderUnknownsTable() {
  return renderMarkdownTable(
    ['Unknown', 'Impact', 'Owner', 'Status'],
    [[
      'Milestone-specific unknowns will be clarified during discuss',
      'Affects plan quality',
      'owner',
      'open',
    ]],
  );
}

function renderValidationContract(milestoneName, goldenRef, statusRef) {
  return renderMarkdownTable(
    ['Deliverable', 'Verify command', 'Expected signal', 'Manual check', 'Golden', 'Audit owner', 'Status', 'Evidence', 'Packet hash'],
    [[
      `${milestoneName} scope`,
      'Fill after research',
      'Scope and packet become clear',
      'Review discuss/research notes',
      goldenRef,
      'audit',
      'pending',
      statusRef,
      'pending_sync',
    ]],
  );
}

function renderAcceptanceCriteriaTable(successSignal) {
  return renderMarkdownTable(
    ['Acceptance ID', 'Criterion', 'How to observe', 'Status'],
    [[
      'AC1',
      'The active milestone delivers the intended capability',
      successSignal,
      'pending',
    ]],
  );
}

function renderUserVisibleOutcomesTable(successSignal) {
  return renderMarkdownTable(
    ['Outcome', 'How to observe', 'Status'],
    [[
      'User-visible outcome seeded from milestone success signal',
      successSignal,
      'pending',
    ]],
  );
}

function renderRegressionFocusTable() {
  return renderMarkdownTable(
    ['Area', 'Risk', 'Check'],
    [[
      'Existing behavior adjacent to this milestone',
      'Regression focus is still unknown until research completes',
      'Fill after touched files and dependencies are known',
    ]],
  );
}

function renderMinimumDoneChecklist(profile) {
  const variants = {
    lite: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        'User intent, explicit constraints, success rubric, and requirement list were filled in',
        'Relevant core files were scanned and the scope was framed with evidence',
      ],
      research: [
        'Touched files were documented',
        'Risks and verification surface were written down',
        'VALIDATION.md acceptance criteria and contract were narrowed to milestone scope',
      ],
      plan: [
        'Chosen strategy, rollback/fallback, blockers, and wave structure were written',
        'Coverage matrix had no orphan or duplicate requirements',
        'workflow:plan-check passed before execute started',
      ],
      execute: [
        'Only the active chunk was executed',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md summary fields were refreshed',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'The milestone did not move to complete before audit closed',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Git closeout scope was made explicit',
      ],
    },
    standard: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        '5-15 relevant files were scanned',
        'User intent, explicit constraints, unanswered questions, and requirement list were filled in',
        'Seed intake and active recall intake were recorded',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks and verification surface were written down',
        'VALIDATION.md acceptance criteria, user-visible outcomes, and contract were narrowed to milestone scope',
      ],
      plan: [
        'Chosen strategy and rejected strategies were written',
        'Carryforward and seed intake were reviewed',
        'Coverage matrix and plan chunk table were written as vertical capability slices',
        'workflow:plan-check passed before execute started',
      ],
      execute: [
        'Only the active chunk was executed',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md Verified/Inferred/Unknown were updated',
        'Active recall notes were saved when needed',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'Evidence / packet hash fields were updated',
        'Strict health was confirmed clean before complete',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Active recall cleanup was checked',
        'AGENTS.md / git closeout needs were reviewed',
      ],
    },
    full: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        '5-15 relevant files were scanned',
        'User intent, explicit constraints, unanswered questions, success rubric, and falsifiers were written',
        'Seed intake and active recall intake were recorded',
        'Possible handoff/closeout needs were noted',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks, verification surface, and research targets were written down',
        'VALIDATION.md acceptance criteria, user-visible outcomes, regression focus, and contract were narrowed to milestone scope',
        'A RETRO note was captured if process friction appeared',
      ],
      plan: [
        'Chosen strategy, rejected strategies, rollback/fallback, and blockers were written',
        'Carryforward and seed intake were reviewed',
        'Coverage matrix and plan chunk table were written as vertical capability slices',
        'workflow:plan-check passed before execute started',
        'Resume anchor and out-of-scope guardrails were clarified',
      ],
      execute: [
        'Only the active chunk was executed',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md Verified/Inferred/Unknown were updated',
        'Active recall notes were saved when needed',
        'A RETRO note was kept if a process gap appeared',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'Evidence / packet hash fields were updated',
        'Strict health was confirmed clean before complete',
        'A RETRO entry was prepared if a process gap appeared',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Active recall cleanup was checked',
        'AGENTS.md and RETRO.md update needs were reviewed',
        'Git closeout scope was made explicit intentionally',
      ],
    },
  };
  const selected = variants[profile] || variants.standard;

  return `
- Minimum done (\`${profile}\`):
  - Discuss:
    - \`${selected.discuss.join('`\n    - `')}\`
  - Research:
    - \`${selected.research.join('`\n    - `')}\`
  - Plan:
    - \`${selected.plan.join('`\n    - `')}\`
  - Execute:
    - \`${selected.execute.join('`\n    - `')}\`
  - Audit:
    - \`${selected.audit.join('`\n    - `')}\`
  - Complete:
    - \`${selected.complete.join('`\n    - `')}\`
`;
}

function updateWorkstreamRegistry(registryPath, rootDir, milestoneLabel, packetHash, budgetStatus) {
  let workstreams = read(registryPath);
  const table = parseWorkstreamTable(workstreams);
  const relativeRoot = path.relative(process.cwd(), rootDir).replace(/\\/g, '/');
  table.rows.forEach((row) => {
    if (row.root === relativeRoot) {
      row.status = 'active';
      row.currentMilestone = milestoneLabel;
      row.step = 'discuss';
      row.packetHash = packetHash;
      row.budgetStatus = budgetStatus;
      row.health = 'pending';
    }
  });
  workstreams = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(table.headerLines, table.rows));
  write(registryPath, workstreams);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const rootDir = resolveWorkflowRoot(process.cwd(), args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const rawMilestoneId = String(args.id || '').trim();
  const milestoneName = String(args.name || '').trim();
  const milestoneGoal = String(args.goal || '').trim();
  const dryRun = Boolean(args['dry-run']);
  const profileOverrideRaw = String(args.profile || '').trim();
  const automationModeRaw = String(args.automation || '').trim();

  if (!rawMilestoneId || !milestoneName || !milestoneGoal) {
    throw new Error('--id, --name, and --goal are required');
  }

  let execplan = read(paths.execplan);
  let status = read(paths.status);
  let milestones = read(paths.milestones);
  let context = read(paths.context);
  const carryforward = read(paths.carryforward);
  let validation = read(paths.validation);
  let handoff = read(paths.handoff);
  let window = read(paths.window);
  const memory = read(paths.memory);
  const seeds = read(paths.seeds);
  const preferences = loadPreferences(paths);
  const profileOverride = profileOverrideRaw
    ? normalizeWorkflowProfile(profileOverrideRaw, '')
    : '';
  const automationMode = automationModeRaw
    ? normalizeAutomationMode(automationModeRaw, '')
    : preferences.repoAutomationMode;

  if (profileOverrideRaw && !profileOverride) {
    throw new Error('--profile must be one of: lite, standard, full');
  }

  if (automationModeRaw && !automationMode) {
    throw new Error('--automation must be one of: manual, phase, full');
  }

  const effectiveProfile = profileOverride || preferences.repoWorkflowProfile;
  const milestoneProfileOverride = profileOverride || 'none';
  const automationStatus = automationMode === 'manual' ? 'idle' : 'active';
  const profileDefaults = profileDefaultsFor(effectiveProfile);
  const effectivePreferences = profileOverride
    ? {
      ...preferences,
      workflowProfile: effectiveProfile,
      budgetProfile: profileDefaults.budgetProfile,
      tokenReserve: profileDefaults.tokenReserve,
      discussBudget: profileDefaults.discussBudget,
      planBudget: profileDefaults.planBudget,
      auditBudget: profileDefaults.auditBudget,
      compactionThreshold: profileDefaults.compactionThreshold,
      maxCanonicalRefsPerStep: profileDefaults.maxCanonicalRefsPerStep,
      windowBudgetMode: profileDefaults.windowBudgetMode,
      windowSizeTokens: profileDefaults.windowSizeTokens,
      reserveFloorTokens: profileDefaults.reserveFloorTokens,
      stopStartingNewWorkThreshold: profileDefaults.stopStartingNewWorkThreshold,
      mustHandoffThreshold: profileDefaults.mustHandoffThreshold,
      minimumNextStepBudget: profileDefaults.minimumNextStepBudget,
      compactionTarget: profileDefaults.compactionTarget,
      healthStrictRequired: profileDefaults.healthStrictRequired,
    }
    : preferences;
  const currentWorkstream = String(getFieldValue(status, 'Current workstream') || path.relative(process.cwd(), rootDir)).trim();
  const previousMilestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const milestoneId = ensureUniqueMilestoneId(rawMilestoneId, preferences);
  const milestoneLabel = `${milestoneId} - ${milestoneName}`;
  const contextRef = path.relative(process.cwd(), paths.context).replace(/\\/g, '/');
  const statusRef = path.relative(process.cwd(), paths.status).replace(/\\/g, '/');
  const workstreamsRef = path.relative(process.cwd(), controlPaths(process.cwd()).workstreams).replace(/\\/g, '/');
  const goldenRef = path.join('tests', 'golden', path.basename(rootDir), 'README.md').replace(/\\/g, '/');
  const activeRecall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === previousMilestone);
  const openSeeds = parseSeedEntries(extractSection(seeds, 'Open Seeds'), 'No open seeds yet');

  const milestoneTable = parseMilestoneTable(milestones);
  if (milestoneTable.rows.some((row) => row.status === 'active')) {
    throw new Error('An active milestone already exists. Complete it before opening a new one.');
  }

  const currentPhaseMatch = status.match(/^- Current phase: `(.*?)`$/m);
  const phase = String(args.phase || currentPhaseMatch?.[1] || 'Phase 1 - Discuss').trim();
  const successSignal = String(args.success || `Scope, context, and research targets are clear for milestone ${milestoneId}`).trim();
  const nonGoals = String(args['non-goals'] || 'Feature/refactor work outside this milestone').trim();
  const carryforwardItems = getOpenCarryforwardItems(carryforward);

  milestoneTable.rows.push({
    milestone: milestoneId,
    goal: milestoneName,
    phase,
    status: 'active',
    step: 'discuss',
    exitCriteria: milestoneGoal,
    evidence: '`Packet seeded`',
  });

  milestones = replaceSection(
    milestones,
    'Milestone Table',
    renderMilestoneTable(milestoneTable.headerLines, milestoneTable.rows),
  );

  milestones = setActiveMilestoneCard(milestones, `
- Milestone: \`${milestoneLabel}\`
- Phase: \`${phase}\`
- Status: \`active\`
- Step: \`discuss\`
- Goal:
  - \`${milestoneGoal}\`
- Success signal:
  - \`${successSignal}\`
- Non-goals:
  - \`${nonGoals}\`
- Workflow profile:
  - \`${effectiveProfile}\`
- Milestone profile override:
  - \`${milestoneProfileOverride}\`
- Automation mode:
  - \`${automationMode}\`
- Automation status:
  - \`${automationStatus}\`
- Discuss mode:
  - \`${preferences.discussMode}\`
- Discuss breakdown:
  - \`intent capture -> user intent + requirement list\`
  - \`constraint extraction -> explicit constraints + unanswered high-leverage questions\`
  - \`execution shaping -> alternatives considered + success rubric\`
- Clarifying questions / assumptions:
  - \`Write these into the assumptions table in CONTEXT.md\`
- Seed intake:
  - \`${openSeeds.length === 0 ? 'No open seeds yet' : `${openSeeds.length} open seed(s)`}\`
- Active recall intake:
  - \`${activeRecall.length === 0 ? 'No active recall notes for this milestone yet' : `${activeRecall.length} active recall note(s)`}\`
- Research target files:
  - \`Fill after discuss\`
- Plan checklist:
  - \`Do not move to planning until CONTEXT.md is current after research\`
  - \`Fill chosen strategy, coverage matrix, wave structure, and plan chunks in EXECPLAN.md\`
  - \`Run workflow:plan-check -- --sync --strict before execute begins\`
- Execute notes:
  - \`None yet\`
- Audit checklist:
  - \`Fill acceptance criteria, user-visible outcomes, regression focus, and the VALIDATION.md contract table\`
- Completion note:
  - \`None yet\`
${renderMinimumDoneChecklist(effectiveProfile)}
`);

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', phase);
  status = replaceField(status, 'Current milestone', milestoneLabel);
  status = replaceField(status, 'Current milestone step', 'discuss');
  status = replaceField(status, 'Effective workflow profile', effectiveProfile);
  status = replaceField(status, 'Automation mode', automationMode);
  status = replaceField(status, 'Automation status', automationStatus);
  status = replaceField(status, 'Context readiness', 'not_ready');
  status = replaceSection(status, 'In Progress', `- \`${milestoneLabel} is in the discuss step\``);
  status = replaceSection(status, 'Verified', [
    '- `Milestone opened and packet seeded`',
    '- `Validation / handoff / window surfaces were reset for milestone scope`',
  ].join('\n'));
  status = replaceSection(status, 'Inferred', '- `Run chunk planning will become clear after research`');
  status = replaceSection(status, 'Unknown', '- `Full file scope is not known until discuss completes`');
  status = replaceSection(status, 'Next', [
    '- `Start intent capture, then move through constraint extraction and execution shaping`',
    '- `Use workflow:packet and workflow:next to inspect packet/budget state`',
    automationMode === 'manual'
      ? '- `Move phase boundaries only when the user asks for the next workflow step`'
      : `- \`Automation mode is ${automationMode}; Codex may continue until the next boundary or blocker\``,
  ].join('\n'));
  status = replaceSection(status, 'Risks', '- `Do not move to planning before discuss and research are complete`');
  status = replaceSection(status, 'Tests Run', '- `Milestone seeded; verify commands will be narrowed after research`');
  status = replaceSection(status, 'Suggested Next Step', '- `Fill User Intent and Requirement List first, then capture constraints and success rubric in CONTEXT.md`');

  execplan = replaceOrAppendField(execplan, 'Last updated', today());
  execplan = replaceField(execplan, 'Input hash', 'pending_sync');
  execplan = replaceField(execplan, 'Active milestone', milestoneLabel);
  execplan = replaceField(execplan, 'Active milestone step', 'discuss');
  execplan = replaceField(execplan, 'Current phase', phase);
  execplan = replaceSection(execplan, 'Plan of Record', `
- Milestone: \`${milestoneLabel}\`
- Step owner: \`plan\`
- Plan status: \`waiting_for_research\`
- Plan-ready gate: \`pending\`
- Carryforward considered: \`${carryforwardItems.length === 0 ? 'None yet' : carryforwardItems.join('; ')}\`
- Run chunk id: \`NONE\`
- Run chunk hash: \`pending\`
- Chunk cursor: \`0/0\`
- Completed items: \`None\`
- Remaining items: \`Discuss -> research -> packet refresh\`
- Resume from item: \`Discuss start\`
- Estimated packet tokens: \`0\`
- Estimated execution overhead: \`2000\`
- Estimated verify overhead: \`1000\`
- Minimum reserve: \`${effectivePreferences.reserveFloorTokens}\`
- Safe in current window: \`yes\`
- Automation mode: \`${automationMode}\`
- Current run chunk:
  - \`None\`
- Next run chunk:
  - \`The first chunk will be written after research completes\`
- Implementation checklist:
  - \`Fill chosen strategy, coverage matrix, and vertical chunks after research completes\`
- Audit plan:
  - \`Acceptance criteria and validation rows will be narrowed after research\`
- Out-of-scope guardrails:
  - \`No work outside the active milestone\`
`);
  execplan = replaceSection(execplan, 'Chosen Strategy', '- `Fill during execution shaping and planning`');
  execplan = replaceSection(execplan, 'Rejected Strategies', '- `Document the alternatives that were considered but not chosen`');
  execplan = replaceSection(execplan, 'Rollback / Fallback', '- `Describe the fallback path before execute begins`');
  execplan = replaceSection(execplan, 'Dependency Blockers', renderDependencyBlockersTable());
  execplan = replaceSection(execplan, 'Wave Structure', renderWaveStructureTable());
  execplan = replaceSection(execplan, 'Coverage Matrix', renderCoverageMatrixTable(milestoneLabel));
  execplan = replaceSection(execplan, 'Plan Chunk Table', renderPlanChunkTable());
  execplan = replaceSection(execplan, 'Unknowns', renderUnknownsTable());
  execplan = replaceSection(execplan, 'What Would Falsify This Plan?', [
    "- `If research findings conflict with the intended scope, the chunk plan must be rewritten`",
    '- `If window budget is insufficient, do not start a new step`',
  ].join('\n'));

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Workstream', currentWorkstream);
  context = replaceField(context, 'Milestone', milestoneLabel);
  context = replaceField(context, 'Milestone profile override', milestoneProfileOverride);
  context = replaceField(context, 'Step source', 'discuss');
  context = replaceField(context, 'Context status', 'initial_from_discuss');
  context = replaceField(context, 'Discuss subphase', 'intent_capture');
  context = replaceField(context, 'Automation mode', automationMode);
  context = replaceField(context, 'Automation status', automationStatus);
  context = replaceField(context, 'Plan readiness', 'not_ready');
  context = replaceField(context, 'Input hash', 'pending_sync');
  context = replaceField(context, 'Budget profile', effectivePreferences.budgetProfile);
  context = replaceField(context, 'Target input tokens', String(effectivePreferences.discussBudget));
  context = replaceField(context, 'Hard cap tokens', String(effectivePreferences.discussBudget + effectivePreferences.tokenReserve));
  context = replaceField(context, 'Reasoning profile', 'balanced');
  context = replaceField(context, 'Confidence summary', 'initial_discuss_unknowns');
  context = replaceField(context, 'Discuss mode', preferences.discussMode);
  context = replaceSection(context, 'Canonical Refs', renderRefTable([
    { class: 'source_of_truth', ref: 'AGENTS.md', why: 'Root workflow protocol' },
    { class: 'source_of_truth', ref: path.relative(process.cwd(), paths.preferences).replace(/\\/g, '/'), why: 'Discuss and budget defaults' },
    { class: 'source_of_truth', ref: workstreamsRef, why: 'Active root registry' },
  ]));
  context = replaceSection(context, 'Upstream Refs', renderRefTable([
    { class: 'supporting', ref: path.relative(process.cwd(), paths.execplan).replace(/\\/g, '/'), why: 'Plan of Record relationship' },
    { class: 'supporting', ref: path.relative(process.cwd(), paths.validation).replace(/\\/g, '/'), why: 'Validation dependency' },
    { class: 'supporting', ref: path.relative(process.cwd(), paths.handoff).replace(/\\/g, '/'), why: 'Resume surface dependency' },
  ]));
  context = replaceSection(context, 'Problem Frame', `
- Goal:
  - \`${milestoneGoal}\`
- Success signal:
  - \`${successSignal}\`
- Non-goals:
  - \`${nonGoals}\`
`);
  context = replaceSection(context, 'Discuss Breakdown', [
    '- `Intent capture -> turn the user request into concrete intent and requirements`',
    '- `Constraint extraction -> capture explicit constraints and unanswered high-leverage questions`',
    '- `Execution shaping -> compare approaches and define an observable success rubric`',
  ].join('\n'));
  context = replaceSection(context, 'User Intent', `
- Primary request:
  - \`${milestoneGoal}\`
- Why this matters now:
  - \`Milestone opened from an explicit workflow request\`
- In-scope outcome:
  - \`${successSignal}\`
`);
  context = replaceSection(context, 'Explicit Constraints', renderConstraintsTable());
  context = replaceSection(context, 'Alternatives Considered', renderAlternativesTable());
  context = replaceSection(context, 'Unanswered High-Leverage Questions', renderHighLeverageQuestionsTable(milestoneGoal));
  context = replaceSection(context, 'Success Rubric', renderSuccessRubricTable(successSignal));
  context = replaceSection(context, 'Requirement List', renderRequirementListTable(milestoneGoal));
  context = replaceSection(context, 'Codebase Scan Summary', '- `To be filled during discuss`');
  context = replaceSection(context, 'Clarifying Questions / Assumptions', renderAssumptionsTable(contextRef));
  context = replaceSection(context, 'Claim Ledger', renderClaimLedgerTable(contextRef));
  context = replaceSection(context, 'Unknowns', renderUnknownsTable());
  context = replaceSection(context, 'Research Targets', '- `Fill after discuss`');
  context = replaceSection(context, 'Carryforward Intake', carryforwardItems.length === 0
    ? '- `No carryforward items yet`'
    : carryforwardItems.map((item) => `- \`${item}\``).join('\n'));
  context = replaceSection(context, 'Seed Intake', openSeeds.length === 0
    ? '- `No open seeds yet`'
    : openSeeds.map((entry) => `- \`${entry.title}\` -> \`Trigger: ${entry.fields.Trigger || 'None'}\``).join('\n'));
  context = replaceSection(context, 'Active Recall Intake', activeRecall.length === 0
    ? '- `No active recall notes for this milestone yet`'
    : activeRecall.map((entry) => `- \`${entry.title}\``).join('\n'));
  context = replaceSection(context, 'Touched Files', '- `Still unclear until discuss completes`');
  context = replaceSection(context, 'Dependency Map', [
    `- \`${path.relative(process.cwd(), paths.execplan)} -> Plan of Record\``,
    `- \`${path.relative(process.cwd(), paths.validation)} -> Validation contract\``,
    `- \`${path.relative(process.cwd(), paths.window)} -> Budget state\``,
  ].join('\n'));
  context = replaceSection(context, 'Risks', '- `Fill after discuss`');
  context = replaceSection(context, 'Verification Surface', [
    '- `node scripts/workflow/build_packet.js --step discuss --json`',
    '- `node scripts/workflow/next_step.js --json`',
    '- `node scripts/workflow/health.js --strict`',
  ].join('\n'));
  context = replaceSection(context, 'What Would Falsify This Plan?', [
    '- `If discuss findings conflict with the milestone goal, rewrite the context`',
    '- `If canonical refs do not reflect milestone needs, treat the packet as invalid`',
  ].join('\n'));
  context = replaceSection(context, 'Ready For Plan', '- `No`');

  validation = replaceField(validation, 'Last updated', today());
  validation = replaceField(validation, 'Active milestone', milestoneLabel);
  validation = replaceField(validation, 'Validation status', 'pending_research');
  validation = replaceField(validation, 'Audit readiness', 'not_ready');
  validation = replaceField(validation, 'Input hash', 'pending_sync');
  validation = replaceField(validation, 'Target input tokens', String(effectivePreferences.auditBudget));
  validation = replaceField(validation, 'Hard cap tokens', String(effectivePreferences.auditBudget + effectivePreferences.tokenReserve));
  validation = replaceSection(validation, 'Success Contract', `- \`${milestoneGoal}\``);
  validation = replaceSection(validation, 'Acceptance Criteria', renderAcceptanceCriteriaTable(successSignal));
  validation = replaceSection(validation, 'User-visible Outcomes', renderUserVisibleOutcomesTable(successSignal));
  validation = replaceSection(validation, 'Regression Focus', renderRegressionFocusTable());
  validation = replaceSection(validation, 'Verification Attachments', '- `Add VERIFICATION_BRIEF.md or TEST_SPEC.md only if the milestone needs deeper validation planning`');
  validation = replaceSection(validation, 'Validation Contract', renderValidationContract(milestoneName, goldenRef, statusRef));
  validation = replaceSection(validation, 'Unknowns', renderUnknownsTable());
  validation = replaceSection(validation, 'What Would Falsify This Plan?', [
    '- `If the validation contract keeps empty verify/manual/evidence columns, the audit is invalid`',
    '- `If the packet hash stays stale, audit cannot close against the old plan`',
  ].join('\n'));
  validation = replaceSection(validation, 'Audit Notes', '- `Milestone opened; the validation contract is waiting for research`');
  validation = replaceSection(validation, 'Completion Gate', '- `Do not complete the milestone before audit closes`');

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Handoff status', 'idle');
  handoff = replaceField(handoff, 'Workstream', String(getFieldValue(status, 'Current workstream') || currentWorkstream));
  handoff = replaceField(handoff, 'Milestone', milestoneLabel);
  handoff = replaceField(handoff, 'Step', 'discuss');
  handoff = replaceField(handoff, 'Automation mode', automationMode);
  handoff = replaceField(handoff, 'Automation status', automationStatus);
  handoff = replaceField(handoff, 'Resume anchor', 'Discuss start');
  handoff = replaceField(handoff, 'Packet hash', 'pending_sync');
  handoff = replaceField(handoff, 'Current chunk cursor', '0/0');
  handoff = replaceField(handoff, 'Expected first command', 'npm run workflow:health -- --strict');
  handoff = replaceSection(handoff, 'Snapshot', '- `Milestone opened; ready to begin the discuss step`');
  handoff = replaceSection(handoff, 'Immediate Next Action', `
- \`${preferences.discussMode === 'assumptions' ? 'Start the codebase-first assumptions discuss flow' : 'Start the discuss questions'}\`
`);
  handoff = replaceSection(handoff, 'Execution Cursor', `
- \`Completed checklist items: None\`
- \`Remaining items: Discuss -> research -> packet refresh\`
- \`Next unread canonical refs: ${path.relative(process.cwd(), paths.context)}; ${path.relative(process.cwd(), paths.execplan)}; ${path.relative(process.cwd(), paths.validation)}\`
`);
  handoff = replaceSection(handoff, 'Packet Snapshot', `
- \`Packet hash: pending_sync\`
- \`Current run chunk: NONE\`
- \`Chunk cursor: 0/0\`
`);
  handoff = replaceSection(handoff, 'Suggested Resume Commands', `
- \`npm run workflow:resume-work -- --root ${path.relative(process.cwd(), rootDir)}\`
- \`npm run workflow:health -- --strict --root ${path.relative(process.cwd(), rootDir)}\`
- \`npm run workflow:next -- --root ${path.relative(process.cwd(), rootDir)}\`
`);
  handoff = replaceSection(handoff, 'Files To Reopen', `
- \`${path.relative(process.cwd(), paths.context)}\`
- \`${path.relative(process.cwd(), paths.execplan)}\`
- \`${path.relative(process.cwd(), paths.validation)}\`
- \`${path.relative(process.cwd(), paths.window)}\`
`);
  handoff = replaceSection(handoff, 'Risks', `
- \`Do not move to planning before discuss and research are complete\`
`);

  window = replaceField(window, 'Last updated', today());
  window = replaceField(window, 'Session id', 'pending_sync');
  window = replaceField(window, 'Current packet hash', 'pending_sync');
  window = replaceField(window, 'Window mode', effectivePreferences.windowBudgetMode);
  window = replaceField(window, 'Window size tokens', String(effectivePreferences.windowSizeTokens));
  window = replaceField(window, 'Estimated used tokens', '0');
  window = replaceField(window, 'Estimated remaining tokens', String(effectivePreferences.windowSizeTokens));
  window = replaceField(window, 'Reserve floor', String(effectivePreferences.reserveFloorTokens));
  window = replaceField(window, 'Current step', 'discuss');
  window = replaceField(window, 'Current run chunk', 'NONE');
  window = replaceField(window, 'Can finish current chunk', 'yes');
  window = replaceField(window, 'Can start next chunk', 'yes');
  window = replaceField(window, 'Recommended action', 'continue');
  window = replaceField(window, 'Automation recommendation', automationMode === 'manual' ? 'continue_in_current_window' : 'prefer_handoff_or_new_window');
  window = replaceField(window, 'Resume anchor', 'Discuss start');
  window = replaceField(window, 'Last safe checkpoint', 'pending_sync');
  window = replaceField(window, 'Budget status', 'ok');
  window = replaceSection(window, 'Current Packet Summary', `
- \`Primary doc: context\`
- \`Packet hash: pending_sync\`
- \`Estimated packet tokens: 0\`
- \`Packet budget status: ok\`
`);
  window = replaceSection(window, 'Read Set Estimate', `
- \`${path.relative(process.cwd(), paths.context)}\`
- \`${path.relative(process.cwd(), paths.execplan)}\`
- \`${path.relative(process.cwd(), paths.validation)}\`
`);
  window = replaceSection(window, 'Artifact Estimate', `
- \`Workflow artifact tokens: 0\`
- \`Execution overhead: 2000\`
- \`Verify overhead: 1000\`
`);
  window = replaceSection(window, 'Recent Context Growth', `
- \`Delta since last window snapshot: 0\`
- \`Budget ratio: 0.00\`
`);

  const warning = warnAgentsSize(process.cwd());
  console.log(warning);

  if (dryRun) {
    console.log(`DRY RUN: would open ${milestoneId} at ${rootDir}`);
    return;
  }

  write(paths.milestones, milestones);
  write(paths.status, status);
  write(paths.execplan, execplan);
  write(paths.context, context);
  write(paths.validation, validation);
  write(paths.handoff, handoff);
  write(paths.window, window);

  const contextPacket = syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  const windowStatus = syncWindowDocument(paths, computeWindowStatus(paths, { step: 'discuss', doc: 'context' }));

  let nextHandoff = read(paths.handoff);
  nextHandoff = replaceField(nextHandoff, 'Packet hash', contextPacket.inputHash);
  write(paths.handoff, nextHandoff);

  updateWorkstreamRegistry(controlPaths(process.cwd()).workstreams, rootDir, milestoneLabel, contextPacket.inputHash, windowStatus.budgetStatus);
  console.log(`Opened milestone ${milestoneLabel}`);
}

main();
