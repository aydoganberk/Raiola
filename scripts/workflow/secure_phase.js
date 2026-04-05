const fs = require('node:fs');
const path = require('node:path');
const { listGitChanges, parseArgs } = require('./common');
const { relativePath, writeJsonFile } = require('./roadmap_os');

function printHelp() {
  console.log(`
secure_phase

Usage:
  node scripts/workflow/secure_phase.js

Options:
  --path <file>      Restrict the scan to one path
  --json             Print machine-readable output
  `);
}

function scanContent(relativeFile, content) {
  const findings = [];
  if (/(rm -rf|git reset --hard|curl\s+[^|]+\|\s*sh|chmod\s+777)/i.test(content)) {
    findings.push({
      verdict: 'fail',
      file: relativeFile,
      reason: 'Potentially destructive shell command detected.',
    });
  }
  if (/(TOKEN|SECRET|PASSWORD|API_KEY)\s*[:=]/.test(content)) {
    findings.push({
      verdict: 'warn',
      file: relativeFile,
      reason: 'Possible inline secret-like token detected.',
    });
  }
  if (/\.\.\//.test(content)) {
    findings.push({
      verdict: 'warn',
      file: relativeFile,
      reason: 'Potential path traversal pattern detected.',
    });
  }
  return findings;
}

function runSecurePhase(cwd, options = {}) {
  const changedFiles = options.path
    ? [String(options.path)]
    : listGitChanges(cwd).length > 0
      ? listGitChanges(cwd)
      : ['package.json', 'README.md'];
  const findings = [];
  for (const relativeFile of changedFiles) {
    const fullPath = path.join(cwd, relativeFile);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    findings.push(...scanContent(relativeFile, content));
    if (/(\.env|secrets?|credentials?|migrations?)/i.test(relativeFile)) {
      findings.push({
        verdict: 'warn',
        file: relativeFile,
        reason: 'Sensitive or high-risk file domain touched.',
      });
    }
  }

  const verdict = findings.some((item) => item.verdict === 'fail')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass';
  const payload = {
    generatedAt: new Date().toISOString(),
    verdict,
    findings,
    scannedFiles: changedFiles,
  };
  writeJsonFile(path.join(cwd, '.workflow', 'runtime', 'secure-phase.json'), payload);
  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = runSecurePhase(cwd, {
    path: args.path,
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# SECURE\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  for (const finding of payload.findings) {
    console.log(`- \`${finding.verdict}\` ${finding.file} -> ${finding.reason}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  runSecurePhase,
};
