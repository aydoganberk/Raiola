const { readFileSync, readdirSync, statSync } = require('node:fs');
const { relative, resolve, sep } = require('node:path');
const { isDeepStrictEqual } = require('node:util');

function isDirectory(targetPath) {
  return statSync(targetPath).isDirectory();
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listFilesRecursively(rootDir) {
  const results = [];

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else {
        results.push(relative(rootDir, absolutePath));
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

function readComparableFile(targetPath) {
  const raw = readFileSync(targetPath, 'utf8');
  if (targetPath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return raw;
}

function pushDiff(
  diffs,
  kind,
  currentPath,
  before,
  after,
) {
  diffs.push({
    kind,
    path: currentPath || '(root)',
    before,
    after,
  });
}

function diffValues(before, after, currentPath, diffs) {
  if (isDeepStrictEqual(before, after)) {
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before.length, after.length);
    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = `${currentPath}[${index}]`;
      if (index >= before.length) {
        pushDiff(diffs, 'added', nextPath, undefined, after[index]);
        continue;
      }
      if (index >= after.length) {
        pushDiff(diffs, 'removed', nextPath, before[index], undefined);
        continue;
      }
      diffValues(before[index], after[index], nextPath, diffs);
    }
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      if (!(key in before)) {
        pushDiff(diffs, 'added', nextPath, undefined, after[key]);
        continue;
      }
      if (!(key in after)) {
        pushDiff(diffs, 'removed', nextPath, before[key], undefined);
        continue;
      }
      diffValues(before[key], after[key], nextPath, diffs);
    }
    return;
  }

  pushDiff(diffs, 'changed', currentPath, before, after);
}

function compareFiles(beforePath, afterPath, prefix = '') {
  const before = readComparableFile(beforePath);
  const after = readComparableFile(afterPath);
  const diffs = [];
  diffValues(before, after, prefix, diffs);
  return diffs;
}

function compareDirectories(beforeDir, afterDir) {
  const beforeFiles = new Set(listFilesRecursively(beforeDir));
  const afterFiles = new Set(listFilesRecursively(afterDir));
  const allFiles = [...new Set([...beforeFiles, ...afterFiles])].sort();
  const diffs = [];

  for (const file of allFiles) {
    const displayPath = file.split(sep).join('/');
    if (!beforeFiles.has(file)) {
      pushDiff(diffs, 'added', displayPath);
      continue;
    }
    if (!afterFiles.has(file)) {
      pushDiff(diffs, 'removed', displayPath);
      continue;
    }

    const beforePath = resolve(beforeDir, file);
    const afterPath = resolve(afterDir, file);
    diffs.push(...compareFiles(beforePath, afterPath, displayPath));
  }

  return diffs;
}

function printUsage() {
  console.log(`
compare_golden_snapshots

Usage:
  node scripts/compare_golden_snapshots.ts <baseline-file> <candidate-file>
  node scripts/compare_golden_snapshots.ts <baseline-dir> <candidate-dir>

Examples:
  node scripts/compare_golden_snapshots.ts tests/golden/workflow/baseline.json tests/golden/workflow/candidate.json
  node scripts/compare_golden_snapshots.ts tests/golden/providers/yahoo tests/golden/providers/yahoo-next
  `);
}

function printDiffs(diffs) {
  if (diffs.length === 0) {
    console.log('No differences found.');
    return;
  }

  console.log(`Found ${diffs.length} difference(s):`);
  for (const diff of diffs.slice(0, 100)) {
    console.log(`- [${diff.kind}] ${diff.path}`);
    if (diff.kind === 'changed') {
      console.log(`  before: ${JSON.stringify(diff.before)}`);
      console.log(`  after : ${JSON.stringify(diff.after)}`);
    }
  }

  if (diffs.length > 100) {
    console.log(`... ${diffs.length - 100} more difference(s) truncated`);
  }
}

function main() {
  const [baselineArg, candidateArg] = process.argv.slice(2);

  if (!baselineArg || !candidateArg || baselineArg === '--help' || baselineArg === '-h') {
    printUsage();
    process.exit(0);
  }

  const baselinePath = resolve(process.cwd(), baselineArg);
  const candidatePath = resolve(process.cwd(), candidateArg);

  const baselineIsDir = isDirectory(baselinePath);
  const candidateIsDir = isDirectory(candidatePath);

  if (baselineIsDir !== candidateIsDir) {
    console.error('Both inputs must be either files or directories.');
    process.exit(1);
  }

  const diffs = baselineIsDir
    ? compareDirectories(baselinePath, candidatePath)
    : compareFiles(baselinePath, candidatePath);

  printDiffs(diffs);
  process.exit(diffs.length === 0 ? 0 : 1);
}

main();
