const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SCAN_ROOT = path.join(__dirname);
const JS_FILE_RE = /\.js$/i;
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.workflow',
]);

const HELPER_FAMILIES = Object.freeze({
  readJsonIfExists: {
    canonicalFiles: new Set([
      'scripts/workflow/io/json.js',
    ]),
  },
  readTextIfExists: {
    canonicalFiles: new Set([
      'scripts/workflow/io/files.js',
      'scripts/workflow/io/fs.js',
    ]),
  },
  detectPackageManager: {
    canonicalFiles: new Set([
      'scripts/workflow/package/repo.js',
      'scripts/workflow/io/package_manager.js',
    ]),
  },
  quoteShell: {
    canonicalFiles: new Set([
      'scripts/workflow/package/repo.js',
      'scripts/workflow/io/package_manager.js',
    ]),
  },
  commandFor: {
    canonicalFiles: new Set([
      'scripts/workflow/package/repo.js',
      'scripts/workflow/io/package_manager.js',
    ]),
  },
});

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function listJavaScriptFiles(currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      listJavaScriptFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && JS_FILE_RE.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function detectLocalDeclarations(content, helperName) {
  const patterns = [
    new RegExp(`(^|\\n)\\s*(?:async\\s+)?function\\s+${helperName}\\s*\\(`, 'g'),
    new RegExp(`(^|\\n)\\s*(?:const|let|var)\\s+${helperName}\\s*=\\s*(?:async\\s*)?function\\b`, 'g'),
    new RegExp(`(^|\\n)\\s*(?:const|let|var)\\s+${helperName}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`, 'g'),
  ];
  const lines = [];
  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      const index = match.index + (match[1] ? match[1].length : 0);
      const line = content.slice(0, index).split('\n').length;
      lines.push(line);
      match = pattern.exec(content);
    }
  }
  return [...new Set(lines)].sort((left, right) => left - right);
}

function scanLocalInfraHelpers(repoRoot, options = {}) {
  const scanRoot = path.resolve(repoRoot, options.scanRoot || DEFAULT_SCAN_ROOT);
  const files = listJavaScriptFiles(scanRoot);
  const helpers = Object.keys(HELPER_FAMILIES);
  const results = [];

  for (const filePath of files) {
    const relativeFile = relativePath(repoRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const helperName of helpers) {
      const family = HELPER_FAMILIES[helperName];
      if (family.canonicalFiles.has(relativeFile)) {
        continue;
      }
      const lines = detectLocalDeclarations(content, helperName);
      if (lines.length === 0) {
        continue;
      }
      results.push({
        helper: helperName,
        file: relativeFile,
        lines,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scanRoot: relativePath(repoRoot, scanRoot) || '.',
    helperFamilies: Object.keys(HELPER_FAMILIES),
    duplicates: results.sort((left, right) => {
      const helperCompare = left.helper.localeCompare(right.helper);
      if (helperCompare !== 0) {
        return helperCompare;
      }
      return left.file.localeCompare(right.file);
    }),
    totals: Object.fromEntries(Object.keys(HELPER_FAMILIES).map((helperName) => [
      helperName,
      results.filter((entry) => entry.helper === helperName).length,
    ])),
  };
}

function printReport(report) {
  console.log('# LOCAL INFRA HELPER DUPLICATE REPORT\n');
  console.log(`- Scan root: \`${report.scanRoot}\``);
  for (const helperName of report.helperFamilies) {
    console.log(`- ${helperName}: \`${report.totals[helperName] || 0}\``);
  }
  if (report.duplicates.length === 0) {
    console.log('\n- No local duplicate helper declarations detected.');
    return;
  }
  console.log('\n## Offenders\n');
  for (const entry of report.duplicates) {
    console.log(`- \`${entry.helper}\` -> \`${entry.file}\` @ lines ${entry.lines.join(', ')}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const report = scanLocalInfraHelpers(repoRoot);
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report);
}

if (require.main === module) {
  main();
}

module.exports = {
  HELPER_FAMILIES,
  detectLocalDeclarations,
  scanLocalInfraHelpers,
};
