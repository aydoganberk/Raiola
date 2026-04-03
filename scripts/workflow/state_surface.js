const path = require('node:path');
const {
  buildPacketSnapshot,
  controlPaths,
  ensureDir,
  extractSection,
  getFieldValue,
  getOpenCarryforwardItems,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  parseWorkstreamTable,
  read,
  readIfExists,
  workflowPaths,
  write,
} = require('./common');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function safeExtract(content, heading, fallback = '') {
  try {
    return extractSection(content, heading);
  } catch {
    return fallback;
  }
}

function stateFilePath(cwd) {
  return path.join(cwd, '.workflow', 'state.json');
}

function buildBaseState(cwd, rootDir) {
  const paths = workflowPaths(rootDir);
  const statusDoc = read(paths.status);
  const handoffDoc = read(paths.handoff);
  const memoryDoc = read(paths.memory);
  const seedsDoc = read(paths.seeds);
  const carryforwardDoc = read(paths.carryforward);
  const controlDoc = read(controlPaths(cwd).workstreams);
  const workstreamTable = parseWorkstreamTable(controlDoc);
  const rootRelative = relativePath(cwd, rootDir);
  const packets = {
    context: buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    execplan: buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    validation: buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  };
  const activeRow = workstreamTable.rows.find((row) => path.resolve(cwd, row.root) === rootDir)
    || workstreamTable.rows.find((row) => row.status === 'active')
    || null;
  const carryforwardCount = getOpenCarryforwardItems(carryforwardDoc).length;
  const seedCount = parseSeedEntries(safeExtract(seedsDoc, 'Open Seeds'), 'No open seeds yet').length;
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const activeRecallCount = parseMemoryEntries(
    safeExtract(memoryDoc, 'Active Recall Items'),
    'No active recall notes yet',
  )
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === milestone)
    .length;
  const packetList = Object.entries(packets).map(([name, packet]) => ({
    name,
    hash: packet.inputHash,
    drift: packet.hashDrift,
    budgetStatus: packet.budgetStatus,
    estimatedTokens: packet.estimatedTotalTokens,
    primaryDoc: packet.primary.key,
  }));
  const driftedPackets = packetList.filter((packet) => packet.drift).map((packet) => packet.name);
  const stateFile = stateFilePath(cwd);

  return {
    repoRoot: cwd,
    workflowRoot: rootDir,
    workflowRootRelative: rootRelative,
    activeWorkstream: {
      name: activeRow ? activeRow.name : String(getFieldValue(controlDoc, 'Active workstream name') || 'workflow').trim(),
      status: activeRow ? activeRow.status : 'active',
      registryRoot: activeRow ? activeRow.root : rootRelative,
    },
    workflow: {
      phase: String(getFieldValue(statusDoc, 'Current phase') || 'unknown').trim(),
      milestone,
      step: String(getFieldValue(statusDoc, 'Current milestone step') || 'unknown').trim(),
      readiness: String(getFieldValue(statusDoc, 'Context readiness') || 'unknown').trim(),
    },
    packets: packetList,
    drift: {
      count: driftedPackets.length,
      packets: driftedPackets,
    },
    handoff: {
      status: String(getFieldValue(handoffDoc, 'Handoff status') || 'idle').trim(),
      resumeAnchor: String(getFieldValue(handoffDoc, 'Resume anchor') || 'start').trim(),
      expectedFirstCommand: String(getFieldValue(handoffDoc, 'Expected first command') || 'npm run workflow:health -- --strict').trim(),
      nextAction: safeExtract(handoffDoc, 'Immediate Next Action', '- `No immediate handoff action recorded`'),
    },
    counts: {
      carryforward: carryforwardCount,
      seeds: seedCount,
      activeRecall: activeRecallCount,
    },
    stateFile,
    stateFileRelative: relativePath(cwd, stateFile),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function readExistingState(cwd) {
  const filePath = stateFilePath(cwd);
  const content = readIfExists(filePath);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeStateSurface(cwd, rootDir, patch = {}, options = {}) {
  const base = buildBaseState(cwd, rootDir);
  const existing = options.preserveExisting === false ? null : readExistingState(cwd);
  const merged = deepMerge(existing || {}, base);
  const state = deepMerge(merged, patch);
  state.generatedAt = existing?.generatedAt || new Date().toISOString();
  state.updatedAt = new Date().toISOString();
  if (options.updatedBy) {
    state.updatedBy = options.updatedBy;
  }

  ensureDir(path.dirname(base.stateFile));
  write(base.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

module.exports = {
  buildBaseState,
  deepMerge,
  stateFilePath,
  writeStateSurface,
};
