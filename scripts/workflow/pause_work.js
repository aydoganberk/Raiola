const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractSection,
  getFieldValue,
  getSectionField,
  parseArgs,
  read,
  replaceField,
  replaceSection,
  resolveWorkflowRoot,
  today,
  toList,
  workflowPaths,
  write,
} = require('./common');
const { applyContinuityCheckpoint, buildContinuityCheckpoint } = require('./checkpoint');

function printHelp() {
  console.log(`
pause_work

Usage:
  node scripts/workflow/pause_work.js --summary "Where we stopped"

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --summary <text>      Required. Snapshot summary
  --next <text>         Optional immediate next action
  --files <a|b|c>       Optional files to reopen
  --commands <a|b|c>    Optional resume commands
  --risks <a|b|c>       Optional risks
  --completed <a|b|c>   Optional completed checklist items
  --remaining <a|b|c>   Optional remaining checklist items
  --refs <a|b|c>        Optional unread canonical refs
  --resume-anchor <t>   Optional explicit resume anchor
  --expected <cmd>      Optional expected first command in next window
  --dry-run             Preview without writing
  `);
}

function renderList(items, emptyLabel) {
  if (items.length === 0) {
    return `- \`${emptyLabel}\``;
  }
  return items.map((item) => `- \`${item}\``).join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const summary = String(args.summary || '').trim();
  if (!summary) {
    throw new Error('--summary is required');
  }

  const rootDir = resolveWorkflowRoot(process.cwd(), args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const dryRun = Boolean(args['dry-run']);
  const status = read(paths.status);
  const execplan = read(paths.execplan);
  let handoff = read(paths.handoff);
  const windowStatus = computeWindowStatus(paths);
  const planSection = extractSection(execplan, 'Plan of Record');
  const nextAction = String(args.next || `Current step: ${getFieldValue(status, 'Current milestone step') || 'unknown'}`).trim();
  const files = toList(args.files);
  const commands = toList(args.commands);
  const risks = toList(args.risks);
  const completed = toList(args.completed);
  const remaining = toList(args.remaining);
  const refs = toList(args.refs);
  const resumeAnchor = String(args['resume-anchor'] || getSectionField(planSection, 'Resume from item') || windowStatus.resumeAnchor).trim();
  const expectedFirstCommand = String(args.expected || 'npm run workflow:health -- --strict').trim();
  const checkpoint = dryRun ? buildContinuityCheckpoint(paths, {
    nextOneAction: nextAction,
    files,
    finished: completed,
    remaining,
  }) : applyContinuityCheckpoint(paths, {
    nextOneAction: nextAction,
    files,
    finished: completed,
    remaining,
  });
  const refreshedWindowStatus = computeWindowStatus(paths);

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Handoff status', 'ready_to_resume');
  handoff = replaceField(handoff, 'Workstream', String(getFieldValue(status, 'Current workstream') || 'Unknown'));
  handoff = replaceField(handoff, 'Milestone', String(getFieldValue(status, 'Current milestone') || 'NONE'));
  handoff = replaceField(handoff, 'Step', String(getFieldValue(status, 'Current milestone step') || 'unknown'));
  handoff = replaceField(handoff, 'Resume anchor', resumeAnchor);
  handoff = replaceField(handoff, 'Packet hash', refreshedWindowStatus.packet.inputHash);
  handoff = replaceField(handoff, 'Current chunk cursor', String(getSectionField(planSection, 'Chunk cursor') || '0/0'));
  handoff = replaceField(handoff, 'Expected first command', expectedFirstCommand);
  handoff = replaceSection(handoff, 'Snapshot', `- \`${summary}\``);
  handoff = replaceSection(handoff, 'Immediate Next Action', `- \`${nextAction}\``);
  handoff = replaceSection(handoff, 'Execution Cursor', [
    `- \`Completed checklist items: ${(completed.length > 0 ? completed.join('; ') : getSectionField(planSection, 'Completed items') || 'None')}\``,
    `- \`Remaining items: ${(remaining.length > 0 ? remaining.join('; ') : getSectionField(planSection, 'Remaining items') || 'None')}\``,
    `- \`Next unread canonical refs: ${(refs.length > 0 ? refs.join('; ') : refreshedWindowStatus.packet.recommendedReadSet.join('; ') || 'None')}\``,
  ].join('\n'));
  handoff = replaceSection(handoff, 'Packet Snapshot', [
    `- \`Packet hash: ${refreshedWindowStatus.packet.inputHash}\``,
    `- \`Current run chunk: ${refreshedWindowStatus.currentRunChunk}\``,
    `- \`Chunk cursor: ${getSectionField(planSection, 'Chunk cursor') || '0/0'}\``,
  ].join('\n'));
  handoff = replaceSection(handoff, 'Continuity Checkpoint', checkpoint.body);
  handoff = replaceSection(handoff, 'Suggested Resume Commands', renderList(
    commands.length > 0 ? commands : ['npm run workflow:resume-work', 'npm run workflow:health -- --strict', 'npm run workflow:next'],
    'No resume commands provided',
  ));
  handoff = replaceSection(handoff, 'Files To Reopen', renderList(
    files.length > 0 ? files : [paths.context, paths.execplan, paths.validation, paths.window],
    'No open file notes',
  ));
  handoff = replaceSection(handoff, 'Risks', renderList(
    risks.length > 0 ? risks : [`Window decision: ${refreshedWindowStatus.decision}`],
    'No specified risks',
  ));

  if (dryRun) {
    console.log(`DRY RUN: would update ${paths.handoff}`);
    return;
  }

  write(paths.handoff, handoff);
  console.log(`Paused work into ${paths.handoff}`);
}

main();
