const fs = require('node:fs');
const path = require('node:path');
const { markCache, recordCounter } = require('../perf/metrics');

const textCache = new Map();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cacheKey(filePath) {
  const stat = fs.statSync(filePath);
  return `${filePath}:${stat.size}:${Math.round(stat.mtimeMs)}`;
}

function readText(filePath) {
  const key = cacheKey(filePath);
  recordCounter('file_read_requests', 1);
  if (textCache.has(key)) {
    markCache('file_read_cache', true);
    return textCache.get(key);
  }

  markCache('file_read_cache', false);
  const content = fs.readFileSync(filePath, 'utf8');
  textCache.set(key, content);
  return content;
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? readText(filePath) : null;
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  try {
    textCache.set(cacheKey(filePath), String(content));
  } catch {
    // Ignore cache refresh failures for just-written files.
  }
}

module.exports = {
  ensureDir,
  readText,
  readTextIfExists,
  writeText,
};
