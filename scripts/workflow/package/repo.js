const fs = require('node:fs');
const path = require('node:path');

function detectPackageManager(cwdOrFiles) {
  const files = Array.isArray(cwdOrFiles)
    ? new Set(cwdOrFiles)
    : cwdOrFiles instanceof Set
      ? cwdOrFiles
      : null;
  const has = (fileName) => (
    files
      ? files.has(fileName)
      : fs.existsSync(path.join(cwdOrFiles, fileName))
  );

  if (has('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (has('yarn.lock')) {
    return 'yarn';
  }
  if (has('bun.lockb') || has('bun.lock')) {
    return 'bun';
  }
  return 'npm';
}

function quoteShell(value) {
  return /[\s"]/g.test(String(value)) ? JSON.stringify(String(value)) : String(value);
}

function commandFor(manager, packageId, scriptName) {
  const dir = packageId === '.' ? '.' : packageId;
  if (manager === 'pnpm') {
    return packageId === '.'
      ? `pnpm run ${scriptName}`
      : `pnpm --dir ${quoteShell(dir)} run ${scriptName}`;
  }
  if (manager === 'yarn') {
    return packageId === '.'
      ? `yarn ${scriptName}`
      : `yarn --cwd ${quoteShell(dir)} ${scriptName}`;
  }
  if (manager === 'bun') {
    return packageId === '.'
      ? `bun run ${scriptName}`
      : `bun --cwd ${quoteShell(dir)} run ${scriptName}`;
  }
  return packageId === '.'
    ? `npm run ${scriptName}`
    : `npm --prefix ${quoteShell(dir)} run ${scriptName}`;
}

module.exports = {
  commandFor,
  detectPackageManager,
  quoteShell,
};
