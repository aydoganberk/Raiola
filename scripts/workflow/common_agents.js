const fs = require('node:fs');
const path = require('node:path');

function listAgentsFiles(rootDir) {
  const results = [];
  const ignored = new Set(['.git', 'node_modules', '.next', '.turbo']);

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === 'AGENTS.md') {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

function warnAgentsSize(rootDir) {
  const files = listAgentsFiles(rootDir);
  const totalBytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);

  if (totalBytes > 32 * 1024) {
    return `WARNING: Combined AGENTS.md size is ${totalBytes} bytes (> 32768). Consider splitting docs or increasing the limit.`;
  }

  return `AGENTS.md combined size OK: ${totalBytes} bytes.`;
}

module.exports = {
  listAgentsFiles,
  warnAgentsSize,
};
