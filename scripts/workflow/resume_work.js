const {
  extractBulletItems,
  assertWorkflowFiles,
  extractSection,
  getFieldValue,
  normalizeWorkflowText,
  getSectionField,
  parseArgs,
  parseTableSectionObjects,
  parseMemoryEntries,
  parseMemoryEntry,
  replaceField,
  resolveWorkflowRoot,
  today,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  writeText: write,
} = require('./io/files');

function printHelp() {
  console.log(`
resume_work

Usage:
  node scripts/workflow/resume_work.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --mark-open       Mark HANDOFF.md as resumed
  --json            Print machine-readable output
  `);
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

  const handoff = read(paths.handoff);
  const status = read(paths.status);
  const execplan = read(paths.execplan);
  const memory = read(paths.memory);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE');
  const planSection = extractSection(execplan, 'Plan of Record');
  const continuityCheckpoint = extractSection(handoff, 'Continuity Checkpoint');
  const immediateNextAction = extractSection(handoff, 'Immediate Next Action');
  const openRequirementRows = parseTableSectionObjects(execplan, 'Open Requirements')
    .filter((row) => normalizeWorkflowText(row.status).toLowerCase() !== 'closed');
  const recall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === milestone)
    .map((entry) => ({
      title: entry.title,
      note: entry.fields.Note || '',
      step: entry.fields.Step || 'unknown',
    }));

  const payload = {
    rootDir,
    milestone,
    step: String(getFieldValue(status, 'Current milestone step') || 'unknown'),
    resumeAnchor: String(getFieldValue(handoff, 'Resume anchor') || 'start'),
    packetHash: String(getFieldValue(handoff, 'Packet hash') || 'missing'),
    chunkCursor: String(getFieldValue(handoff, 'Current chunk cursor') || '0/0'),
    expectedFirstCommand: String(getFieldValue(handoff, 'Expected first command') || 'npm run raiola:health -- --strict'),
    snapshot: extractSection(handoff, 'Snapshot'),
    nextAction: immediateNextAction,
    nextOneAction: String(
      getSectionField(continuityCheckpoint, 'Next one action')
      || extractBulletItems(immediateNextAction)[0]
      || 'Current step is unknown',
    ).trim(),
    continuityCheckpoint,
    openRequirements: extractSection(execplan, 'Open Requirements'),
    openRequirementCount: openRequirementRows.length,
    currentCapabilitySlice: extractSection(execplan, 'Current Capability Slice'),
    currentChunk: String(getSectionField(planSection, 'Run chunk id') || 'NONE'),
    executionCursor: extractSection(handoff, 'Execution Cursor'),
    packetSnapshot: extractSection(handoff, 'Packet Snapshot'),
    filesToReopen: extractSection(handoff, 'Files To Reopen'),
    recall,
  };

  if (args['mark-open']) {
    let nextHandoff = handoff;
    nextHandoff = replaceField(nextHandoff, 'Last updated', today());
    nextHandoff = replaceField(nextHandoff, 'Handoff status', 'resumed');
    write(paths.handoff, nextHandoff);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# RESUME\n`);
  console.log(`- Root: \`${rootDir}\``);
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Step: \`${payload.step}\``);
  console.log(`- Resume anchor: \`${payload.resumeAnchor}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Chunk cursor: \`${payload.chunkCursor}\``);
  console.log(`- Next one action: \`${payload.nextOneAction}\``);
  console.log(`- Open requirement count: \`${payload.openRequirementCount}\``);
  console.log(`- First command: \`${payload.expectedFirstCommand}\``);
  console.log(`\n## Snapshot\n`);
  console.log(payload.snapshot);
  console.log(`\n## Immediate Next Action\n`);
  console.log(payload.nextAction);
  console.log(`\n## Continuity Checkpoint\n`);
  console.log(payload.continuityCheckpoint);
  console.log(`\n## Open Requirements\n`);
  console.log(payload.openRequirements);
  console.log(`\n## Current Capability Slice\n`);
  console.log(payload.currentCapabilitySlice);
  console.log(`\n## Current Chunk\n`);
  console.log(`- \`${payload.currentChunk}\``);
  console.log(`\n## Execution Cursor\n`);
  console.log(payload.executionCursor);
  console.log(`\n## Packet Snapshot\n`);
  console.log(payload.packetSnapshot);
  console.log(`\n## Files To Reopen\n`);
  console.log(payload.filesToReopen);
  console.log(`\n## Active Recall\n`);
  if (payload.recall.length === 0) {
    console.log('- `No active recall notes for this milestone`');
  } else {
    for (const item of payload.recall) {
      console.log(`- \`${item.title}\``);
      console.log(`  - \`${item.note}\``);
      console.log(`  - \`Step: ${item.step}\``);
    }
  }
}

main();
