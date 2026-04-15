const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractBulletItems,
  extractSection,
  getFieldValue,
  getSectionField,
  normalizeWorkflowText,
  parseArgs,
  parseTableSectionObjects,
  renderMarkdownTable,
  replaceField,
  replaceOrAppendSection,
  replaceSection,
  resolveWorkflowRoot,
  syncWindowDocument,
  today,
  toList,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  writeText: write,
} = require('./io/files');


function checkpointsDir(paths) {
  return path.join(paths.cwd, '.workflow', 'runtime', 'checkpoints');
}

function latestCheckpointFile(paths) {
  return path.join(checkpointsDir(paths), 'latest.json');
}

function ensureCheckpointDirs(paths) {
  fs.mkdirSync(path.join(checkpointsDir(paths), 'deltas'), { recursive: true });
  fs.mkdirSync(path.join(checkpointsDir(paths), 'milestones'), { recursive: true });
}

function escapeJsonPointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function diffJson(left, right, basePath = '') {
  if (JSON.stringify(left) === JSON.stringify(right)) {
    return [];
  }
  const leftObject = left && typeof left === 'object' && !Array.isArray(left);
  const rightObject = right && typeof right === 'object' && !Array.isArray(right);
  if (!leftObject || !rightObject) {
    return [{ op: left === undefined ? 'add' : 'replace', path: basePath || '/', value: right }];
  }
  const ops = [];
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of [...keys].sort()) {
    const nextPath = `${basePath}/${escapeJsonPointer(key)}`;
    if (!(key in right)) {
      ops.push({ op: 'remove', path: nextPath });
      continue;
    }
    if (!(key in left)) {
      ops.push({ op: 'add', path: nextPath, value: right[key] });
      continue;
    }
    ops.push(...diffJson(left[key], right[key], nextPath));
  }
  return ops;
}

function writeCheckpointArtifacts(paths, checkpoint) {
  ensureCheckpointDirs(paths);
  const latestFile = latestCheckpointFile(paths);
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
  } catch {}
  const operations = diffJson(previous || {}, checkpoint, '');
  const milestoneBoundary = !previous || previous.milestone !== checkpoint.milestone || previous.step !== checkpoint.step;
  const checkpointId = new Date().toISOString().replace(/[:.]/g, '-');
  const deltaPayload = {
    checkpointId,
    generatedAt: new Date().toISOString(),
    baseMilestone: previous?.milestone || null,
    nextMilestone: checkpoint.milestone,
    baseStep: previous?.step || null,
    nextStep: checkpoint.step,
    operationCount: operations.length,
    operations,
  };
  const deltaFile = path.join(checkpointsDir(paths), 'deltas', `${checkpointId}.json`);
  fs.writeFileSync(deltaFile, `${JSON.stringify(deltaPayload, null, 2)}\n`);
  fs.writeFileSync(latestFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
  let snapshotFile = null;
  if (milestoneBoundary) {
    snapshotFile = path.join(checkpointsDir(paths), 'milestones', `${checkpointId}.json`);
    fs.writeFileSync(snapshotFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
  }
  return {
    deltaFile: path.relative(paths.cwd, deltaFile).replace(/\\/g, '/'),
    milestoneSnapshotFile: snapshotFile ? path.relative(paths.cwd, snapshotFile).replace(/\\/g, '/') : null,
    deltaOperationCount: operations.length,
    checkpointStrategy: milestoneBoundary ? 'milestone-snapshot+delta' : 'delta-only',
  };
}

function printHelp() {
  console.log(`
checkpoint

Usage:
  node scripts/workflow/checkpoint.js --next "Resume here"

Options:
  --root <path>                Workflow root. Defaults to active workstream root
  --promised-scope <text>      Optional promised scope override
  --finished <a|b|c>           Optional completed items override
  --remaining <a|b|c>          Optional remaining items override
  --drift <text>               Optional drift note override
  --next <text>                Optional next one action override
  --files <a|b|c>              Optional affected files override
  --requirements <a|b|c>       Optional open requirement IDs override
  --validations <a|b|c>        Optional active validation IDs override
  --dry-run                    Preview without writing
  --json                       Print machine-readable output
  `);
}

function joinOrFallback(items, fallback) {
  return items.length > 0 ? items.join('; ') : fallback;
}

function buildContinuityCheckpoint(paths, options = {}) {
  const status = read(paths.status);
  const execplan = read(paths.execplan);
  const validation = read(paths.validation);
  const handoff = read(paths.handoff);
  const windowStatus = computeWindowStatus(paths);
  const planSection = extractSection(execplan, 'Plan of Record');
  const scopeSection = extractSection(execplan, 'Scope');
  const deliveryCore = extractSection(execplan, 'Delivery Core');
  const openRequirements = parseTableSectionObjects(execplan, 'Open Requirements');
  const acceptanceCriteria = parseTableSectionObjects(validation, 'Acceptance Criteria');
  const filesToReopen = extractBulletItems(extractSection(handoff, 'Files To Reopen'));
  const handoffNextAction = extractBulletItems(extractSection(handoff, 'Immediate Next Action'));

  const promisedScope = String(
    options.promisedScope
    || getSectionField(deliveryCore, 'Promised scope')
    || getSectionField(scopeSection, 'Goal')
    || getFieldValue(status, 'Current milestone')
    || 'Unknown scope',
  ).trim();
  const finishedItems = options.finished?.length
    ? options.finished
    : toList(getSectionField(deliveryCore, 'Finished since last checkpoint') || getSectionField(planSection, 'Completed items'));
  const remainingItems = options.remaining?.length
    ? options.remaining
    : toList(getSectionField(deliveryCore, 'Remaining scope') || getSectionField(planSection, 'Remaining items'));
  const drift = String(options.drift || getSectionField(deliveryCore, 'Drift from plan') || 'none_noted').trim();
  const nextOneAction = String(
    options.nextOneAction
    || getSectionField(deliveryCore, 'Next one action')
    || handoffNextAction[0]
    || `Current step: ${getFieldValue(status, 'Current milestone step') || 'unknown'}`,
  ).trim();
  const affectedFiles = options.files?.length
    ? options.files
    : filesToReopen;
  const openRequirementIds = options.requirements?.length
    ? options.requirements
    : openRequirements
      .filter((row) => normalizeWorkflowText(row.status).toLowerCase() !== 'closed')
      .map((row) => normalizeWorkflowText(row.requirement_id))
      .filter(Boolean);
  const activeValidationIds = options.validations?.length
    ? options.validations
    : acceptanceCriteria
      .map((row) => String(row.acceptance_id || '').trim())
      .filter(Boolean);

  const body = [
    `- Promised scope: \`${promisedScope}\``,
    `- Finished since last checkpoint: \`${joinOrFallback(finishedItems, 'None')}\``,
    `- Remaining scope: \`${joinOrFallback(remainingItems, 'None')}\``,
    `- Drift from plan: \`${drift}\``,
    `- Next one action: \`${nextOneAction}\``,
    `- Affected files: \`${joinOrFallback(affectedFiles, 'None')}\``,
    `- Open requirement IDs: \`${joinOrFallback(openRequirementIds, 'None')}\``,
    `- Active validation IDs: \`${joinOrFallback(activeValidationIds, 'None')}\``,
  ].join('\n');

  return {
    milestone: String(getFieldValue(status, 'Current milestone') || 'NONE').trim(),
    step: String(getFieldValue(status, 'Current milestone step') || 'unknown').trim(),
    packetHash: windowStatus.packet.inputHash,
    chunkCursor: String(getSectionField(planSection, 'Chunk cursor') || '0/0').trim(),
    currentRunChunk: String(getSectionField(planSection, 'Run chunk id') || 'NONE').trim(),
    nextOneAction,
    promisedScope,
    finishedItems,
    remainingItems,
    drift,
    affectedFiles,
    openRequirementIds,
    activeValidationIds,
    body,
    windowStatus,
  };
}

function applyContinuityCheckpoint(paths, options = {}) {
  const checkpoint = buildContinuityCheckpoint(paths, options);
  let handoff = read(paths.handoff);

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Packet hash', checkpoint.packetHash);
  handoff = replaceField(handoff, 'Current chunk cursor', checkpoint.chunkCursor);
  handoff = replaceSection(handoff, 'Continuity Checkpoint', checkpoint.body);
  handoff = replaceSection(handoff, 'Packet Snapshot', [
    `- \`Packet hash: ${checkpoint.packetHash}\``,
    `- \`Current run chunk: ${checkpoint.currentRunChunk}\``,
    `- \`Chunk cursor: ${checkpoint.chunkCursor}\``,
  ].join('\n'));
  write(paths.handoff, handoff);

  const seededWindow = computeWindowStatus(paths);
  syncWindowDocument(paths, {
    ...seededWindow,
    lastSafeCheckpoint: seededWindow.checkpointBaseHash,
    checkpointFreshness: 'yes',
    checkpointReason: 'Continuity checkpoint matches the current continuity core',
  });
  const refreshedWindow = syncWindowDocument(paths, computeWindowStatus(paths));
  const deltaArtifacts = writeCheckpointArtifacts(paths, checkpoint);

  return {
    ...checkpoint,
    ...deltaArtifacts,
    checkpointFreshness: refreshedWindow.checkpointFreshness,
    recommendedAction: refreshedWindow.recommendedAction,
  };
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

  const options = {
    promisedScope: String(args['promised-scope'] || '').trim(),
    finished: toList(args.finished),
    remaining: toList(args.remaining),
    drift: String(args.drift || '').trim(),
    nextOneAction: String(args.next || '').trim(),
    files: toList(args.files),
    requirements: toList(args.requirements),
    validations: toList(args.validations),
  };

  const payload = Boolean(args['dry-run'])
    ? buildContinuityCheckpoint(paths, options)
    : applyContinuityCheckpoint(paths, options);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# CHECKPOINT\n');
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Step: \`${payload.step}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Current run chunk: \`${payload.currentRunChunk}\``);
  console.log(`- Next one action: \`${payload.nextOneAction}\``);
  if (payload.checkpointFreshness) {
    console.log(`- Checkpoint freshness: \`${payload.checkpointFreshness}\``);
  }
  console.log('\n## Continuity Checkpoint\n');
  console.log(payload.body);
}

module.exports = {
  applyContinuityCheckpoint,
  buildContinuityCheckpoint,
};

if (require.main === module) {
  main();
}
