const {
  assertWorkflowFiles,
  controlPaths,
  extractSection,
  getFieldValue,
  parseArgs,
  parseMilestoneTable,
  parseWorkstreamTable,
  renderMilestoneTable,
  renderWorkstreamTable,
  replaceField,
  replaceSection,
  resolveWorkflowRoot,
  setActiveMilestoneCard,
  syncStablePacketSet,
  today,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  writeText: write,
} = require('./io/files');

function printHelp() {
  console.log(`
milestone_edit

Usage:
  node scripts/workflow/milestone_edit.js --name "Corrected slice"
  node scripts/workflow/milestone_edit.js --id M4 --name "Corrected slice" --goal "Frame the corrected scope"

Options:
  --root <path>            Workflow root. Default: active workstream root
  --id <milestone-id>      Optional. Replace the active milestone id
  --name <display-name>    Optional. Replace the active milestone title
  --goal <goal>            Optional. Replace the active milestone goal / exit criteria
  --phase <phase>          Optional. Replace the active phase label
  --success <text>         Optional. Replace the success signal
  --non-goals <text>       Optional. Replace the non-goal summary
  --json                   Print machine-readable output
  `);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceBacktickedLiteral(content, previousValue, nextValue) {
  if (!previousValue || previousValue === nextValue) {
    return content;
  }

  return String(content).replace(
    new RegExp('`' + escapeRegex(previousValue) + '`', 'g'),
    `\`${nextValue}\``,
  );
}

function readProblemFrameValue(content, label) {
  const section = extractSection(content, 'Problem Frame');
  const match = section.match(new RegExp('- ' + escapeRegex(label) + ':\\s*\\n\\s*- `([^`]*)`', 'm'));
  return match ? match[1].trim() : '';
}

function readCardValue(content, label) {
  const section = extractSection(content, 'Active Milestone Card');
  const match = section.match(new RegExp('- ' + escapeRegex(label) + ':\\s*\\n\\s*- `([^`]*)`', 'm'));
  return match ? match[1].trim() : '';
}

function replaceCardSingleValue(cardBody, label, value) {
  return String(cardBody).replace(
    new RegExp('(^- ' + escapeRegex(label) + ': )`[^`]*`$', 'm'),
    `$1\`${value}\``,
  );
}

function replaceCardListValue(cardBody, label, value) {
  return String(cardBody).replace(
    new RegExp('(^- ' + escapeRegex(label) + ':\\s*\\n)\\s*- `[^`]*`', 'm'),
    `$1  - \`${value}\``,
  );
}

function updateWorkstreamRegistry(registryPath, rootDir, milestoneLabel, packetHash, budgetStatus) {
  let workstreams = read(registryPath);
  const table = parseWorkstreamTable(workstreams);
  const relativeRoot = require('node:path').relative(process.cwd(), rootDir).replace(/\\/g, '/');
  table.rows.forEach((row) => {
    if (row.root === relativeRoot) {
      row.currentMilestone = milestoneLabel;
      row.packetHash = packetHash;
      row.budgetStatus = budgetStatus;
    }
  });
  workstreams = replaceField(workstreams, 'Last updated', today());
  workstreams = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(table.headerLines, table.rows));
  write(registryPath, workstreams);
}

function buildMilestoneEditPayload(cwd, rootDir, args = {}) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  let status = read(paths.status);
  let execplan = read(paths.execplan);
  let milestones = read(paths.milestones);
  let context = read(paths.context);
  let validation = read(paths.validation);
  let handoff = read(paths.handoff);
  let memory = read(paths.memory);
  const currentLabel = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const currentPhase = String(getFieldValue(status, 'Current phase') || 'unknown').trim();
  if (currentLabel === 'NONE') {
    throw new Error('No active milestone exists to edit.');
  }

  const milestoneTable = parseMilestoneTable(milestones);
  const activeRow = milestoneTable.rows.find((row) => row.status === 'active');
  if (!activeRow) {
    throw new Error('MILESTONES.md does not have an active row to edit.');
  }

  const currentGoal = readProblemFrameValue(context, 'Goal') || readCardValue(milestones, 'Goal') || activeRow.exitCriteria || '';
  const currentSuccess = readProblemFrameValue(context, 'Success signal') || readCardValue(milestones, 'Success signal') || '';
  const currentNonGoals = readProblemFrameValue(context, 'Non-goals') || readCardValue(milestones, 'Non-goals') || '';
  const nextId = String(args.id || activeRow.milestone).trim();
  const nextName = String(args.name || activeRow.goal).trim();
  const nextLabel = `${nextId} - ${nextName}`;
  const nextGoal = String(args.goal || currentGoal).trim();
  const nextPhase = String(args.phase || activeRow.phase || currentPhase).trim();
  const nextSuccess = String(args.success || currentSuccess).trim();
  const nextNonGoals = String(args['non-goals'] || currentNonGoals).trim();

  if (!nextId || !nextName) {
    throw new Error('The active milestone id and name must remain non-empty.');
  }

  const changed = [
    currentLabel !== nextLabel,
    currentGoal !== nextGoal,
    currentPhase !== nextPhase,
    currentSuccess !== nextSuccess,
    currentNonGoals !== nextNonGoals,
  ].some(Boolean);
  if (!changed) {
    return {
      changed: false,
      currentLabel,
      nextLabel,
      goal: nextGoal,
      phase: nextPhase,
      success: nextSuccess,
      nonGoals: nextNonGoals,
    };
  }

  activeRow.milestone = nextId;
  activeRow.goal = nextName;
  activeRow.phase = nextPhase;
  activeRow.exitCriteria = nextGoal;
  milestones = replaceSection(
    milestones,
    'Milestone Table',
    renderMilestoneTable(milestoneTable.headerLines, milestoneTable.rows),
  );

  let activeCard = extractSection(milestones, 'Active Milestone Card');
  activeCard = replaceCardSingleValue(activeCard, 'Milestone', nextLabel);
  activeCard = replaceCardSingleValue(activeCard, 'Phase', nextPhase);
  activeCard = replaceCardListValue(activeCard, 'Goal', nextGoal);
  activeCard = replaceCardListValue(activeCard, 'Success signal', nextSuccess);
  activeCard = replaceCardListValue(activeCard, 'Non-goals', nextNonGoals);
  milestones = setActiveMilestoneCard(milestones, activeCard);

  status = replaceBacktickedLiteral(status, currentLabel, nextLabel);
  execplan = replaceBacktickedLiteral(execplan, currentLabel, nextLabel);
  milestones = replaceBacktickedLiteral(milestones, currentLabel, nextLabel);
  context = replaceBacktickedLiteral(context, currentLabel, nextLabel);
  validation = replaceBacktickedLiteral(validation, currentLabel, nextLabel);
  handoff = replaceBacktickedLiteral(handoff, currentLabel, nextLabel);
  memory = replaceBacktickedLiteral(memory, currentLabel, nextLabel);

  if (currentGoal && nextGoal) {
    status = replaceBacktickedLiteral(status, currentGoal, nextGoal);
    execplan = replaceBacktickedLiteral(execplan, currentGoal, nextGoal);
    milestones = replaceBacktickedLiteral(milestones, currentGoal, nextGoal);
    context = replaceBacktickedLiteral(context, currentGoal, nextGoal);
    validation = replaceBacktickedLiteral(validation, currentGoal, nextGoal);
  }
  if (currentSuccess && nextSuccess) {
    status = replaceBacktickedLiteral(status, currentSuccess, nextSuccess);
    execplan = replaceBacktickedLiteral(execplan, currentSuccess, nextSuccess);
    milestones = replaceBacktickedLiteral(milestones, currentSuccess, nextSuccess);
    context = replaceBacktickedLiteral(context, currentSuccess, nextSuccess);
    validation = replaceBacktickedLiteral(validation, currentSuccess, nextSuccess);
  }
  if (currentNonGoals && nextNonGoals) {
    execplan = replaceBacktickedLiteral(execplan, currentNonGoals, nextNonGoals);
    milestones = replaceBacktickedLiteral(milestones, currentNonGoals, nextNonGoals);
    context = replaceBacktickedLiteral(context, currentNonGoals, nextNonGoals);
  }

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', nextPhase);
  status = replaceField(status, 'Current milestone', nextLabel);

  execplan = replaceField(execplan, 'Last updated', today());
  execplan = replaceField(execplan, 'Active milestone', nextLabel);
  execplan = replaceField(execplan, 'Current phase', nextPhase);

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Milestone', nextLabel);

  validation = replaceField(validation, 'Last updated', today());
  validation = replaceField(validation, 'Active milestone', nextLabel);

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Milestone', nextLabel);

  write(paths.status, status);
  write(paths.execplan, execplan);
  write(paths.milestones, milestones);
  write(paths.context, context);
  write(paths.validation, validation);
  write(paths.handoff, handoff);
  write(paths.memory, memory);

  const sync = syncStablePacketSet(paths);
  updateWorkstreamRegistry(
    controlPaths(cwd).workstreams,
    rootDir,
    nextLabel,
    sync.windowStatus.packet.inputHash,
    sync.windowStatus.packet.budgetStatus,
  );

  return {
    changed: true,
    currentLabel,
    nextLabel,
    goal: nextGoal,
    phase: nextPhase,
    success: nextSuccess,
    nonGoals: nextNonGoals,
    packetHash: sync.windowStatus.packet.inputHash,
    budgetStatus: sync.windowStatus.packet.budgetStatus,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  if (!args.id && !args.name && !args.goal && !args.phase && !args.success && !args['non-goals']) {
    throw new Error('Provide at least one field to edit: --id, --name, --goal, --phase, --success, or --non-goals');
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildMilestoneEditPayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!payload.changed) {
    console.log(`# MILESTONE-EDIT\n\n- Active milestone already matches the requested shape: \`${payload.nextLabel}\``);
    return;
  }

  console.log(`# MILESTONE-EDIT\n`);
  console.log(`- Updated: \`${payload.currentLabel}\` -> \`${payload.nextLabel}\``);
  console.log(`- Phase: \`${payload.phase}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMilestoneEditPayload,
};
