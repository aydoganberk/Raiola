const fs = require('node:fs');
const path = require('node:path');
const { ensureDir } = require('./io/files');
const { readJsonIfExists } = require('./io/json');

const RECENT_LIMITS = Object.freeze({
  mailbox: 20,
  timeline: 50,
});

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'orchestration', 'runtime');
}

function logFilePath(cwd, kind) {
  return path.join(runtimeDir(cwd), `${kind}.jsonl`);
}

function logIndexPath(cwd) {
  return path.join(runtimeDir(cwd), 'log-index.json');
}

function emptyLogIndex() {
  return {
    generatedAt: null,
    updatedAt: null,
    mailbox: {
      count: 0,
      recent: [],
      signature: null,
    },
    timeline: {
      count: 0,
      recent: [],
      signature: null,
    },
  };
}


function fileSignature(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const stat = fs.statSync(filePath);
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function sameSignature(left, right) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function scanJsonlFile(filePath, limit) {
  if (!fs.existsSync(filePath)) {
    return {
      count: 0,
      recent: [],
      signature: null,
    };
  }

  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean);
  const recent = lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    count: lines.length,
    recent,
    signature: fileSignature(filePath),
  };
}

function writeLogIndex(cwd, payload) {
  ensureDir(runtimeDir(cwd));
  fs.writeFileSync(logIndexPath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
}

function rebuildLogIndex(cwd) {
  const now = new Date().toISOString();
  const index = {
    generatedAt: now,
    updatedAt: now,
    mailbox: scanJsonlFile(logFilePath(cwd, 'mailbox'), RECENT_LIMITS.mailbox),
    timeline: scanJsonlFile(logFilePath(cwd, 'timeline'), RECENT_LIMITS.timeline),
  };
  writeLogIndex(cwd, index);
  return index;
}

function readLogIndex(cwd) {
  const current = readJsonIfExists(logIndexPath(cwd), null);
  if (!current) {
    return rebuildLogIndex(cwd);
  }

  for (const kind of Object.keys(RECENT_LIMITS)) {
    const expected = fileSignature(logFilePath(cwd, kind));
    const actual = current[kind]?.signature || null;
    if (!sameSignature(expected, actual)) {
      return rebuildLogIndex(cwd);
    }
  }

  return current;
}

function appendIndexedEvent(cwd, kind, payload) {
  const filePath = logFilePath(cwd, kind);
  const limit = RECENT_LIMITS[kind];
  if (!limit) {
    throw new Error(`Unsupported team runtime log kind: ${kind}`);
  }

  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);

  const previous = readJsonIfExists(logIndexPath(cwd), emptyLogIndex()) || emptyLogIndex();
  const current = previous[kind] || { count: 0, recent: [], signature: null };
  const next = {
    ...previous,
    updatedAt: new Date().toISOString(),
    [kind]: {
      count: Number(current.count || 0) + 1,
      recent: [...(current.recent || []), payload].slice(-limit),
      signature: fileSignature(filePath),
    },
  };
  if (!next.generatedAt) {
    next.generatedAt = next.updatedAt;
  }
  writeLogIndex(cwd, next);
  return next[kind];
}

function getLogSnapshot(cwd, kind) {
  const limit = RECENT_LIMITS[kind];
  if (!limit) {
    throw new Error(`Unsupported team runtime log kind: ${kind}`);
  }
  const index = readLogIndex(cwd);
  const section = index[kind] || { count: 0, recent: [], signature: null };
  return {
    count: Number(section.count || 0),
    recent: Array.isArray(section.recent) ? section.recent : [],
    signature: section.signature || null,
  };
}

module.exports = {
  appendIndexedEvent,
  getLogSnapshot,
  logFilePath,
  logIndexPath,
  readLogIndex,
  rebuildLogIndex,
  runtimeDir,
};
