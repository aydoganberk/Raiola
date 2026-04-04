const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readTextIfExists, writeText } = require('../io/files');
const { markCache } = require('../perf/metrics');

const memoryPacketSnapshots = new Map();

function packetRuntimeStatePath(cwd = process.cwd()) {
  return path.join(cwd, '.workflow', 'packet-state.json');
}

function snapshotCachePath(cwd = process.cwd()) {
  return path.join(cwd, '.workflow', 'cache', 'packet-snapshot-cache.json');
}

function readPacketRuntimeState(cwd = process.cwd()) {
  const content = readTextIfExists(packetRuntimeStatePath(cwd));
  if (!content) {
    return { version: 1, workflows: {} };
  }
  try {
    const parsed = JSON.parse(content);
    return {
      version: 1,
      workflows: parsed && typeof parsed === 'object' && parsed.workflows && typeof parsed.workflows === 'object'
        ? parsed.workflows
        : {},
    };
  } catch {
    return { version: 1, workflows: {} };
  }
}

function writePacketRuntimeState(cwd = process.cwd(), state = {}) {
  writeText(packetRuntimeStatePath(cwd), `${JSON.stringify(state, null, 2)}\n`);
  return packetRuntimeStatePath(cwd);
}

function packetRuntimeRootKey(cwd, rootDir) {
  return path.relative(cwd, rootDir).replace(/\\/g, '/') || '.';
}

function packetRuntimeEntryKey(primaryKey, hashStep) {
  return `${primaryKey}:${hashStep}`;
}

function readPacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep) {
  const state = readPacketRuntimeState(cwd);
  const rootKey = packetRuntimeRootKey(cwd, rootDir);
  const entryKey = packetRuntimeEntryKey(primaryKey, hashStep);
  return state.workflows?.[rootKey]?.packets?.[entryKey] || null;
}

function writePacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep, entry) {
  const state = readPacketRuntimeState(cwd);
  const rootKey = packetRuntimeRootKey(cwd, rootDir);
  const entryKey = packetRuntimeEntryKey(primaryKey, hashStep);
  const next = {
    version: 1,
    workflows: { ...state.workflows },
  };
  const workflowState = next.workflows[rootKey] || { packets: {} };
  next.workflows[rootKey] = {
    ...workflowState,
    packets: {
      ...(workflowState.packets || {}),
      [entryKey]: entry,
    },
  };
  writePacketRuntimeState(cwd, next);
}

function readSnapshotCache(cwd = process.cwd()) {
  const content = readTextIfExists(snapshotCachePath(cwd));
  if (!content) {
    return { version: 1, entries: {} };
  }
  try {
    const parsed = JSON.parse(content);
    return {
      version: 1,
      entries: parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
        ? parsed.entries
        : {},
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeSnapshotCache(cwd = process.cwd(), cache = {}) {
  ensureDir(path.dirname(snapshotCachePath(cwd)));
  writeText(snapshotCachePath(cwd), `${JSON.stringify(cache, null, 2)}\n`);
}

function getPacketSnapshotCache(cwd, key) {
  if (memoryPacketSnapshots.has(key)) {
    markCache('packet_snapshot_cache', true);
    return memoryPacketSnapshots.get(key);
  }
  markCache('packet_snapshot_cache', false);
  return null;
}

function compactSnapshot(value) {
  return {
    step: value.step,
    inputHash: value.inputHash,
    hashStep: value.hashStep,
    packetVersion: value.packetVersion,
    budgetStatus: value.budgetStatus,
    estimatedTotalTokens: value.estimatedTotalTokens,
    loadedPacketSizeTokens: value.loadedPacketSizeTokens,
    primary: value.primary
      ? {
        key: value.primary.key,
        filePath: value.primary.filePath,
      }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

function setPacketSnapshotCache(cwd, key, value) {
  memoryPacketSnapshots.set(key, value);
  const disk = readSnapshotCache(cwd);
  disk.entries[key] = compactSnapshot(value);
  const keys = Object.keys(disk.entries);
  if (keys.length > 10) {
    keys.slice(0, keys.length - 10).forEach((entryKey) => {
      delete disk.entries[entryKey];
    });
  }
  writeSnapshotCache(cwd, disk);
}

module.exports = {
  getPacketSnapshotCache,
  packetRuntimeEntryKey,
  packetRuntimeRootKey,
  packetRuntimeStatePath,
  readPacketRuntimeEntry,
  readPacketRuntimeState,
  setPacketSnapshotCache,
  snapshotCachePath,
  writePacketRuntimeEntry,
  writePacketRuntimeState,
};
