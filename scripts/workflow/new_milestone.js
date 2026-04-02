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
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseSeedEntries,
  parseWorkstreamTable,
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

function renderMinimumDoneChecklist(profile) {
  const variants = {
    lite: {
      discuss: [
        'Goal, non-goals, and success signal are clear',
        'Relevant core files were scanned',
        'CONTEXT.md assumptions and canonical refs were filled in',
      ],
      research: [
        'Touched files were documented',
        'Risks and verification surface were written down',
        'VALIDATION.md was narrowed to milestone scope',
      ],
      plan: [
        'Work continued only when context was plan-ready',
        '1-2 run chunks were written',
        'Packet / execution / verify overhead fields were filled in',
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
        'Goal, non-goals, and success signal are clear',
        '5-15 relevant files were scanned',
        'Canonical refs, assumptions, and unknowns were filled in',
        'Seed intake and active recall intake were recorded',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks and verification surface were written down',
        'VALIDATION.md was narrowed to milestone scope',
      ],
      plan: [
        'Work continued only when context was plan-ready',
        'Carryforward and seed intake were reviewed',
        '1-2 run chunks were written',
        'Packet / execution / verify overhead and the audit plan were written',
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
        'Goal, non-goals, and success signal are clear',
        '5-15 relevant files were scanned',
        'Canonical refs, assumptions, unknowns, and falsifiers were written',
        'Seed intake and active recall intake were recorded',
        'Possible handoff/closeout needs were noted',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks, verification surface, and research targets were written down',
        'VALIDATION.md was narrowed to milestone scope',
        'A RETRO note was captured if process friction appeared',
      ],
      plan: [
        'Work continued only when context was plan-ready',
        'Carryforward and seed intake were reviewed',
        '1-2 run chunks were written',
        'Packet / execution / verify overhead and the audit plan were written',
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
  - \`${preferences.workflowProfile}\`
- Discuss mode:
  - \`${preferences.discussMode}\`
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
  - \`Fill the Plan of Record section in EXECPLAN.md\`
  - \`Split the plan into 1-2 run chunks that fit the context window\`
- Execute notes:
  - \`None yet\`
- Audit checklist:
  - \`Fill the VALIDATION.md contract table\`
- Completion note:
  - \`None yet\`
${renderMinimumDoneChecklist(preferences.workflowProfile)}
`);

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', phase);
  status = replaceField(status, 'Current milestone', milestoneLabel);
  status = replaceField(status, 'Current milestone step', 'discuss');
  status = replaceField(status, 'Context readiness', 'not_ready');
  status = replaceSection(status, 'In Progress', `- \`${milestoneLabel} is in the discuss step\``);
  status = replaceSection(status, 'Verified', [
    '- `Milestone opened and packet seeded`',
    '- `Validation / handoff / window surfaces were reset for milestone scope`',
  ].join('\n'));
  status = replaceSection(status, 'Inferred', '- `Run chunk planning will become clear after research`');
  status = replaceSection(status, 'Unknown', '- `Full file scope is not known until discuss completes`');
  status = replaceSection(status, 'Next', [
    '- `Start the codebase-first discuss flow`',
    '- `Use workflow:packet and workflow:next to inspect packet/budget state`',
  ].join('\n'));
  status = replaceSection(status, 'Risks', '- `Do not move to planning before discuss and research are complete`');
  status = replaceSection(status, 'Tests Run', '- `Milestone seeded; verify commands will be narrowed after research`');
  status = replaceSection(status, 'Suggested Next Step', '- `Fill assumptions, claim ledger, and canonical refs in CONTEXT.md`');

  execplan = replaceOrAppendField(execplan, 'Last updated', today());
  execplan = replaceField(execplan, 'Input hash', 'pending_sync');
  execplan = replaceField(execplan, 'Active milestone', milestoneLabel);
  execplan = replaceField(execplan, 'Active milestone step', 'discuss');
  execplan = replaceField(execplan, 'Current phase', phase);
  execplan = replaceSection(execplan, 'Plan of Record', `
- Milestone: \`${milestoneLabel}\`
- Step owner: \`plan\`
- Plan status: \`waiting_for_research\`
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
- Minimum reserve: \`${preferences.reserveFloorTokens}\`
- Safe in current window: \`yes\`
- Current run chunk:
  - \`None\`
- Next run chunk:
  - \`The first chunk will be written after research completes\`
- Implementation checklist:
  - \`Fill this after research completes\`
- Audit plan:
  - \`The validation contract will be narrowed after research\`
- Out-of-scope guardrails:
  - \`No work outside the active milestone\`
`);
  execplan = replaceSection(execplan, 'Unknowns', renderUnknownsTable());
  execplan = replaceSection(execplan, 'What Would Falsify This Plan?', [
    "- `If research findings conflict with the intended scope, the chunk plan must be rewritten`",
    '- `If window budget is insufficient, do not start a new step`',
  ].join('\n'));

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Workstream', currentWorkstream);
  context = replaceField(context, 'Milestone', milestoneLabel);
  context = replaceField(context, 'Step source', 'discuss');
  context = replaceField(context, 'Context status', 'initial_from_discuss');
  context = replaceField(context, 'Plan readiness', 'not_ready');
  context = replaceField(context, 'Input hash', 'pending_sync');
  context = replaceField(context, 'Budget profile', preferences.budgetProfile);
  context = replaceField(context, 'Target input tokens', String(preferences.discussBudget));
  context = replaceField(context, 'Hard cap tokens', String(preferences.discussBudget + preferences.tokenReserve));
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
  validation = replaceField(validation, 'Target input tokens', String(preferences.auditBudget));
  validation = replaceField(validation, 'Hard cap tokens', String(preferences.auditBudget + preferences.tokenReserve));
  validation = replaceSection(validation, 'Success Contract', `- \`${milestoneGoal}\``);
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
  window = replaceField(window, 'Window mode', preferences.windowBudgetMode);
  window = replaceField(window, 'Window size tokens', String(preferences.windowSizeTokens));
  window = replaceField(window, 'Estimated used tokens', '0');
  window = replaceField(window, 'Estimated remaining tokens', String(preferences.windowSizeTokens));
  window = replaceField(window, 'Reserve floor', String(preferences.reserveFloorTokens));
  window = replaceField(window, 'Current step', 'discuss');
  window = replaceField(window, 'Current run chunk', 'NONE');
  window = replaceField(window, 'Can finish current chunk', 'yes');
  window = replaceField(window, 'Can start next chunk', 'yes');
  window = replaceField(window, 'Recommended action', 'continue');
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
