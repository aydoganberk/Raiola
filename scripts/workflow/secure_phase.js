const fs = require('node:fs');
const path = require('node:path');
const { listGitChanges, parseArgs } = require('./common');
const { writeJsonFile } = require('./roadmap_os');

const DEFAULT_MAX_SCAN_FILES = 400;
const DEFAULT_MAX_BYTES = 512 * 1024;
const TEXT_FILE_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.yml', '.yaml', '.toml', '.ini', '.env', '.sh', '.bash', '.zsh',
  '.md', '.txt', '.html', '.css', '.scss', '.less', '.svg', '.dockerfile', '.tf', '.py', '.rb', '.go', '.rs', '.java',
  '.kt', '.swift', '.php', '.sql', '.xml', '.graphql', '.gql', '.lock', '.conf', '.config', '.sample', '.example', '.plist',
]);
const BINARY_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz', '.tar', '.jar', '.exe', '.dll', '.so',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.avi', '.mp3', '.wav', '.ogg', '.class', '.bin', '.pack',
]);
const SENSITIVE_FILENAME_PATTERN = /(^|\/)(\.env(\..*)?$|.*(?:secret|secrets|credential|credentials|token|private[-_.]?key|id_rsa|service-account|service_account|pem|p12|keychain).*)/i;
const SENSITIVE_DOMAIN_PATTERN = /(^|\/)(\.github\/workflows|infra|deploy|deployment|docker|migrations?|hooks?|\.codex\/hooks|terraform|helm|k8s|ops)(\/|$)/i;
const CANDIDATE_DIRS = ['.github/workflows', '.codex/hooks', 'hooks', 'bin', 'scripts', 'infra', 'deploy', 'docker'];
const PLACEHOLDER_SECRET_PATTERN = /^(?:your[-_ ]?(?:token|secret|password|key)|changeme|replace(?:[-_ ]?me)?|example|sample|placeholder|test|mock|dummy)$/i;

function printHelp() {
  console.log(`
secure_phase

Usage:
  node scripts/workflow/secure_phase.js

Options:
  --scope <changes|repo>  Scan changed files only or widen to repo-sensitive files
  --repo                  Alias for --scope repo
  --path <file>           Restrict the scan to one path
  --json                  Print machine-readable output
  `);
}

function normalizeRelativeFile(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized || null;
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isLikelyTextFile(relativeFile) {
  const normalized = normalizeRelativeFile(relativeFile) || '';
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName === 'dockerfile' || baseName === '.env' || baseName.startsWith('.env.')) {
    return true;
  }
  if (baseName === 'package.json' || baseName === 'pnpm-workspace.yaml' || baseName === 'pnpm-lock.yaml' || baseName === 'yarn.lock' || baseName === 'bun.lock' || baseName === 'bun.lockb') {
    return true;
  }
  const extension = path.extname(baseName);
  return TEXT_FILE_EXTENSIONS.has(extension);
}

function isLikelyBinary(relativeFile) {
  const extension = path.extname(String(relativeFile || '').toLowerCase());
  return BINARY_FILE_EXTENSIONS.has(extension);
}

function readTextFileSafe(filePath, options = {}) {
  const stat = fs.statSync(filePath);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
  if (stat.size > maxBytes) {
    return { ok: false, reason: 'too-large', size: stat.size };
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) {
    return { ok: false, reason: 'binary-null-byte', size: stat.size };
  }
  return { ok: true, size: stat.size, text: buffer.toString('utf8') };
}

function pushUniqueFile(fileSet, relativeFile) {
  const normalized = normalizeRelativeFile(relativeFile);
  if (!normalized) {
    return;
  }
  fileSet.add(normalized);
}

function addWalkedFiles(cwd, relativeDir, fileSet) {
  const fullDir = path.join(cwd, relativeDir);
  if (!fs.existsSync(fullDir)) {
    return;
  }
  for (const fullPath of walkFiles(fullDir)) {
    const relativeFile = path.relative(cwd, fullPath).replace(/\\/g, '/');
    if (isLikelyTextFile(relativeFile) || SENSITIVE_FILENAME_PATTERN.test(relativeFile) || SENSITIVE_DOMAIN_PATTERN.test(relativeFile)) {
      pushUniqueFile(fileSet, relativeFile);
    }
  }
}

function addMonorepoPackageManifests(cwd, fileSet) {
  for (const fullPath of walkFiles(cwd)) {
    const relativeFile = path.relative(cwd, fullPath).replace(/\\/g, '/');
    if (/^node_modules\//.test(relativeFile) || /^\.git\//.test(relativeFile) || /^\.workflow\//.test(relativeFile)) {
      continue;
    }
    if (path.basename(relativeFile) === 'package.json') {
      pushUniqueFile(fileSet, relativeFile);
    }
  }
}

function resolveScanFiles(cwd, options = {}) {
  if (options.path) {
    return {
      mode: 'path',
      files: [normalizeRelativeFile(options.path)].filter(Boolean),
    };
  }

  const changedFiles = listGitChanges(cwd)
    .map((item) => normalizeRelativeFile(item))
    .filter(Boolean);
  const scope = options.scope === 'repo' || options.repo ? 'repo' : 'changes';

  if (scope === 'changes') {
    const files = changedFiles.length > 0
      ? changedFiles.filter((item) => isLikelyTextFile(item) || SENSITIVE_FILENAME_PATTERN.test(item) || SENSITIVE_DOMAIN_PATTERN.test(item))
      : ['package.json'];
    return {
      mode: 'changes',
      files: files.slice(0, DEFAULT_MAX_SCAN_FILES),
    };
  }

  const fileSet = new Set();
  for (const changedFile of changedFiles) {
    if (isLikelyTextFile(changedFile) || SENSITIVE_FILENAME_PATTERN.test(changedFile) || SENSITIVE_DOMAIN_PATTERN.test(changedFile)) {
      pushUniqueFile(fileSet, changedFile);
    }
  }

  for (const relativeFile of [
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-workspace.yml',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
  ]) {
    if (fs.existsSync(path.join(cwd, relativeFile))) {
      pushUniqueFile(fileSet, relativeFile);
    }
  }

  for (const relativeDir of CANDIDATE_DIRS) {
    addWalkedFiles(cwd, relativeDir, fileSet);
  }
  addMonorepoPackageManifests(cwd, fileSet);

  for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.startsWith('.env') || SENSITIVE_FILENAME_PATTERN.test(entry.name)) {
      pushUniqueFile(fileSet, entry.name);
    }
  }

  return {
    mode: 'repo',
    files: [...fileSet].sort().slice(0, DEFAULT_MAX_SCAN_FILES),
  };
}

function findingKey(finding) {
  return `${finding.file}::${finding.category}::${finding.reason}`;
}

function pushFinding(findings, dedupe, finding) {
  const key = findingKey(finding);
  if (dedupe.has(key)) {
    return;
  }
  dedupe.add(key);
  findings.push(finding);
}

function sampleMatch(pattern, content, fallback = '') {
  const match = content.match(pattern);
  const raw = match ? (match[0] || match[1] || '') : fallback;
  return String(raw || '').trim().slice(0, 140);
}

function scanPackageManifest(relativeFile, content, findings, dedupe) {
  let manifest = null;
  try {
    manifest = JSON.parse(content);
  } catch {
    pushFinding(findings, dedupe, {
      verdict: 'warn',
      category: 'manifest-invalid-json',
      file: relativeFile,
      reason: 'package.json is invalid JSON and may break install, review, or automation surfaces.',
      snippet: '',
    });
    return;
  }

  const scripts = manifest.scripts || {};
  for (const [scriptName, scriptValue] of Object.entries(scripts)) {
    const scriptText = String(scriptValue || '');
    if (!scriptText.trim()) {
      continue;
    }
    if (/\b(preinstall|install|postinstall|prepare)\b/i.test(scriptName) && /(curl\s+[^\n|]+\|\s*(?:sh|bash)|wget\s+[^\n|]+\|\s*(?:sh|bash)|Invoke-WebRequest[^\n|]+\|\s*iex)/i.test(scriptText)) {
      pushFinding(findings, dedupe, {
        verdict: 'fail',
        category: 'network-pipe-exec',
        file: relativeFile,
        reason: `Lifecycle script \`${scriptName}\` pipes a network download directly into a shell.`,
        snippet: scriptText.slice(0, 140),
      });
    }
    if (/\bchmod\s+-?R?\s*777\b/i.test(scriptText)) {
      pushFinding(findings, dedupe, {
        verdict: 'fail',
        category: 'broad-permissions',
        file: relativeFile,
        reason: `Script \`${scriptName}\` widens filesystem permissions to 777.`,
        snippet: scriptText.slice(0, 140),
      });
    }
    if (/\b(npm|pnpm|yarn|bun)\s+(publish|login)\b/i.test(scriptText)) {
      pushFinding(findings, dedupe, {
        verdict: 'warn',
        category: 'release-side-effect',
        file: relativeFile,
        reason: `Script \`${scriptName}\` performs a publish/login side effect and should stay explicitly gated.`,
        snippet: scriptText.slice(0, 140),
      });
    }
  }
}

function scanContent(relativeFile, content) {
  const findings = [];
  const dedupe = new Set();
  const push = (verdict, category, reason, snippet = '') => pushFinding(findings, dedupe, {
    verdict,
    category,
    file: relativeFile,
    reason,
    snippet: snippet ? String(snippet).slice(0, 140) : '',
  });

  const destructiveCommandPattern = /(rm\s+-rf\s+\/|git\s+reset\s+--hard|git\s+clean\s+-fdx|mkfs\.[a-z0-9]+|dd\s+if=\/dev\/zero|shutdown\s+-h|reboot\b|poweroff\b|curl\s+[^\n|]+\|\s*(?:sh|bash)|wget\s+[^\n|]+\|\s*(?:sh|bash)|Invoke-WebRequest[^\n|]+\|\s*iex)/i;
  if (destructiveCommandPattern.test(content)) {
    push('fail', 'destructive-command', 'Potentially destructive or unreviewable shell command detected.', sampleMatch(destructiveCommandPattern, content));
  }

  const broadPermissionPattern = /(chmod\s+-?R?\s*777\b|icacls\s+[^\n]+\s+\/grant\s+Everyone:F)/i;
  if (broadPermissionPattern.test(content)) {
    push('fail', 'broad-permissions', 'World-writable permission pattern detected.', sampleMatch(broadPermissionPattern, content));
  }

  const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;
  if (privateKeyPattern.test(content)) {
    push('fail', 'embedded-private-key', 'Private key material appears to be committed inline.', sampleMatch(privateKeyPattern, content, 'BEGIN PRIVATE KEY'));
  }

  const hardSecretPattern = /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{35}|Bearer\s+eyJ[A-Za-z0-9._-]+)/;
  if (hardSecretPattern.test(content)) {
    push('fail', 'embedded-token', 'High-confidence secret or access token pattern detected.', sampleMatch(hardSecretPattern, content));
  }

  const secretAssignPattern = /(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-\/=+:.]{8,})/i;
  const secretAssignment = content.match(secretAssignPattern);
  if (secretAssignment && !PLACEHOLDER_SECRET_PATTERN.test(secretAssignment[1] || '')) {
    push('warn', 'secret-like-assignment', 'Possible inline secret-like assignment detected.', sampleMatch(secretAssignPattern, content));
  }

  const floatingActionPattern = /uses:\s*[^\s@]+@(main|master|latest|head)\b/i;
  if (relativeFile.startsWith('.github/workflows/') && floatingActionPattern.test(content)) {
    push('warn', 'floating-workflow-action', 'GitHub Actions workflow references a floating branch/tag instead of a pinned commit.', sampleMatch(floatingActionPattern, content));
  }

  const majorActionPattern = /uses:\s*[^\s@]+@v\d+\b/i;
  if (relativeFile.startsWith('.github/workflows/') && majorActionPattern.test(content)) {
    push('warn', 'floating-major-action', 'GitHub Actions workflow uses a floating major tag and may drift silently.', sampleMatch(majorActionPattern, content));
  }

  const workflowPermissionPattern = /permissions:\s*write-all/i;
  if (relativeFile.startsWith('.github/workflows/') && workflowPermissionPattern.test(content)) {
    push('warn', 'workflow-write-all', 'GitHub Actions workflow grants write-all permissions.', sampleMatch(workflowPermissionPattern, content));
  }

  const floatingImagePattern = /(?:^FROM\s+\S+:latest\b|^\s*image:\s*\S+:latest\b)/im;
  if (floatingImagePattern.test(content)) {
    push('warn', 'floating-image-tag', 'Container image uses :latest and may drift between runs.', sampleMatch(floatingImagePattern, content));
  }

  const dynamicCodePattern = /(\beval\s*\(|\bnew Function\s*\()/;
  if (dynamicCodePattern.test(content)) {
    push('warn', 'dynamic-code', 'Dynamic code execution primitive detected.', sampleMatch(dynamicCodePattern, content));
  }

  const shellExecPattern = /(\bexecSync\s*\(|\bexecFileSync\s*\(|\bspawnSync\s*\(|\bchild_process\.exec\s*\()/;
  if (shellExecPattern.test(content)) {
    push('warn', 'shell-exec', 'Shell execution primitive detected; confirm user input is sanitized and scope is bounded.', sampleMatch(shellExecPattern, content));
  }

  const unsafeHtmlPattern = /dangerouslySetInnerHTML/;
  if (unsafeHtmlPattern.test(content)) {
    push('warn', 'unsafe-html', 'dangerouslySetInnerHTML is present and should be explicitly reviewed.', 'dangerouslySetInnerHTML');
  }

  const traversalPattern = /(path\.(?:join|resolve)|sendFile|download|fs\.[A-Za-z]+)[\s\S]{0,120}\.\.(?:\/|\\)/;
  if (traversalPattern.test(content)) {
    push('warn', 'path-traversal', 'Filesystem or response path logic includes ../ segments and may need input sanitization.', sampleMatch(traversalPattern, content));
  }

  if (SENSITIVE_FILENAME_PATTERN.test(relativeFile)) {
    push('warn', 'sensitive-file-domain', 'Sensitive filename or secret-like file surface touched.', path.basename(relativeFile));
  }
  if (SENSITIVE_DOMAIN_PATTERN.test(relativeFile)) {
    push('warn', 'sensitive-domain', 'Security-sensitive workflow, infra, migration, or deploy surface touched.', relativeFile);
  }

  if (path.basename(relativeFile) === 'package.json') {
    scanPackageManifest(relativeFile, content, findings, dedupe);
  }

  return findings;
}

function summarizeFindings(findings = []) {
  const countsByVerdict = findings.reduce((accumulator, finding) => {
    accumulator[finding.verdict] = (accumulator[finding.verdict] || 0) + 1;
    return accumulator;
  }, {});
  const countsByCategory = findings.reduce((accumulator, finding) => {
    accumulator[finding.category] = (accumulator[finding.category] || 0) + 1;
    return accumulator;
  }, {});
  const topRisks = findings
    .slice()
    .sort((left, right) => {
      const leftScore = left.verdict === 'fail' ? 2 : 1;
      const rightScore = right.verdict === 'fail' ? 2 : 1;
      return rightScore - leftScore || left.file.localeCompare(right.file);
    })
    .slice(0, 10);
  return {
    countsByVerdict,
    countsByCategory,
    topRisks,
  };
}

function suggestedCommands(findings = []) {
  const commands = new Set();
  if (findings.some((item) => item.verdict === 'fail')) {
    commands.add('rai trust --json');
  }
  if (findings.some((item) => ['floating-workflow-action', 'workflow-write-all', 'floating-major-action'].includes(item.category))) {
    commands.add('rai policy --json');
  }
  if (findings.some((item) => ['destructive-command', 'embedded-token', 'embedded-private-key', 'network-pipe-exec'].includes(item.category))) {
    commands.add('rai safety-control --json');
  }
  if (findings.some((item) => item.category === 'sensitive-domain')) {
    commands.add('rai review --json');
  }
  return [...commands];
}

function runSecurePhase(cwd, options = {}) {
  const selection = resolveScanFiles(cwd, options);
  const findings = [];
  const skippedFiles = [];
  const scannedFiles = [];

  for (const relativeFile of selection.files) {
    const fullPath = path.join(cwd, relativeFile);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      continue;
    }

    scannedFiles.push(relativeFile);
    if (isLikelyBinary(relativeFile)) {
      skippedFiles.push({ file: relativeFile, reason: 'binary-extension', size: stat.size });
      continue;
    }
    const readResult = readTextFileSafe(fullPath, { maxBytes: options.maxBytes });
    if (!readResult.ok) {
      skippedFiles.push({ file: relativeFile, reason: readResult.reason, size: readResult.size });
      continue;
    }
    findings.push(...scanContent(relativeFile, readResult.text));
  }

  const verdict = findings.some((item) => item.verdict === 'fail')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass';
  const summary = summarizeFindings(findings);
  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'secure-phase',
    verdict,
    scanScope: selection.mode,
    findings,
    scannedFiles,
    skippedFiles,
    countsByVerdict: summary.countsByVerdict,
    countsByCategory: summary.countsByCategory,
    topRisks: summary.topRisks,
    suggestedCommands: suggestedCommands(findings),
  };
  writeJsonFile(path.join(cwd, '.workflow', 'runtime', 'secure-phase.json'), payload);
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = runSecurePhase(cwd, {
    scope: args.scope,
    repo: args.repo,
    path: args.path,
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# SECURE\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Scope: \`${payload.scanScope}\``);
  console.log(`- Findings: \`${payload.findings.length}\``);
  for (const finding of payload.topRisks) {
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
  resolveScanFiles,
  runSecurePhase,
  scanContent,
};
