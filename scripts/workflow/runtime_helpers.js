const fs = require('node:fs');
const path = require('node:path');
const {
  ensureDir,
  readIfExists,
  slugify,
  writeIfChanged,
} = require('./common');

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'runtime');
}

function runtimePath(cwd, ...segments) {
  return path.join(runtimeDir(cwd), ...segments);
}

function readJsonIfExists(filePath) {
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

function writeRuntimeJson(cwd, fileName, payload) {
  const filePath = runtimePath(cwd, fileName);
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function writeRuntimeMarkdown(cwd, fileName, content) {
  const filePath = runtimePath(cwd, fileName);
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${String(content).trimEnd()}\n`);
  return filePath;
}

function listLatestEntries(baseDir, limit = 5) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(baseDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        fullPath,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name))
    .slice(0, limit);
}

function makeArtifactId(prefix = 'artifact') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${slugify(prefix) || 'artifact'}`;
}

module.exports = {
  listLatestEntries,
  makeArtifactId,
  readJsonIfExists,
  runtimeDir,
  runtimePath,
  writeRuntimeJson,
  writeRuntimeMarkdown,
};
