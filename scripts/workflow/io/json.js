const { readTextIfExists, writeTextIfChanged } = require('./fs');

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonIfExists(filePath, fallback = null) {
  const content = readTextIfExists(filePath);
  if (!content) {
    return fallback;
  }
  return parseJson(content, fallback);
}

function writeJsonIfChanged(filePath, payload) {
  return writeTextIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  parseJson,
  readJsonIfExists,
  writeJsonIfChanged,
};
