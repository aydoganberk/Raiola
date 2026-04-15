const files = require('./files');

function readTextIfExists(filePath, fallback = null) {
  try {
    const value = files.readTextIfExists(filePath);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

module.exports = {
  ensureDir: files.ensureDir,
  readText: files.readText,
  readTextIfExists,
  writeText: files.writeText,
  writeTextIfChanged: files.writeTextIfChanged,
};
