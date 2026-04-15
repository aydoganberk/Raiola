const fs = require('node:fs');
const path = require('node:path');

const NETWORK_COMMAND_PATTERN = /\b(curl|wget|git\s+(push|pull|fetch|clone|ls-remote)|npm\s+(install|publish)|pnpm\s+(add|install|publish)|yarn\s+(add|install|publish)|pip\s+install|python\s+-m\s+pip\s+install|cargo\s+(add|install|publish)|go\s+get|go\s+install|uv\s+add|poetry\s+add|docker\s+pull|docker\s+push)\b/i;
const RELEASE_COMMAND_PATTERN = /\b(npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|changeset\s+publish|gh\s+release|git\s+push\s+--tags|semantic-release|release-it|cargo\s+publish|twine\s+upload|docker\s+push|npm\s+version)\b/i;
const CI_COMMAND_PATTERN = /(^|\s)(\.github\/workflows\/|gh\s+workflow|act\b|workflow_dispatch\b)/i;
const REPO_WIDE_COMMAND_PATTERN = /\b(git\s+add\s+-A|git\s+add\s+\.\b|git\s+clean\b|git\s+checkout\s+--\s+\.\b|git\s+restore\s+--source\s+HEAD\s+--\s+\.\b|prettier\b[^\n]*\s-w\b|eslint\b[^\n]*--fix\b|sed\s+-i\b[^\n]*\s\.\b|find\s+\.\b[^\n]*-exec\b|codemod\b|rename\s+everywhere\b)\b/i;
const WRITE_COMMAND_PATTERN = /(^|\s)(rm\b|mv\b|cp\b|touch\b|mkdir\b|tee\b|truncate\b|install\b|sed\s+-i\b|perl\s+-pi\b|git\s+add\b|git\s+rm\b|git\s+mv\b|prettier\b[^\n]*\s-w\b|eslint\b[^\n]*--fix\b)\b/i;
const REDIRECT_WRITE_PATTERN = /(^|[;&|])\s*(echo|printf|cat)\b[^\n>]*>\s*[^\s]+/i;
const SCRIPT_LAUNCH_PATTERN = /\b(npm\s+run|pnpm\s+run|yarn\s+run|cargo\s+(test|check|run|publish)|go\s+(test|vet|build)|python\s+-m\s+pytest|pytest\b|mvn\b|gradle\b|bazel\b|nx\b|turbo\b)\b/i;
const PATH_TOKEN_PATTERN = /(?:^|[\s'"=])(\.?\.?\/[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+|README\.md|CHANGELOG\.md|package\.json|AGENTS\.md|docs|scripts|app|src|components|pages|public|\.github|\.workflow)(?=$|[\s'":])/g;
const SHELL_WRAPPER_PATTERN = /\b(bash|sh|zsh)\s+-[lc]+\s+(["'`])([\s\S]*)\2/i;
const NODE_INLINE_PATTERN = /\bnode\s+(?:--input-type=\w+\s+)?-e\s+(["'`])([\s\S]*)\1/i;
const PYTHON_INLINE_PATTERN = /\bpython(?:3)?\s+-c\s+(["'`])([\s\S]*)\1/i;
const INLINE_FILE_WRITE_SIGNAL_PATTERN = /\b(?:writeFileSync|appendFileSync|createWriteStream|truncateSync|renameSync|rmSync|unlinkSync|mkdirSync|copyFileSync|cpSync|fs\.promises\.(?:writeFile|appendFile|rm|mkdir|copyFile|rename))\s*\(/i;
const INLINE_FILE_WRITE_PATH_PATTERN = /\b(?:writeFileSync|appendFileSync|createWriteStream|truncateSync|renameSync|rmSync|unlinkSync|mkdirSync|copyFileSync|cpSync|fs\.promises\.(?:writeFile|appendFile|rm|mkdir|copyFile|rename))\s*\(\s*(["'`])([^"'`]+)\1/g;
const INLINE_NETWORK_SIGNAL_PATTERN = /\b(?:fetch|axios(?:\.\w+)?|got|request|https?\.(?:request|get)|net\.connect|tls\.connect)\s*\(/i;

function readStdin(handler) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      finish({}, handler);
      return;
    }
    try {
      finish(JSON.parse(raw), handler);
    } catch {
      finish({ raw }, handler);
    }
  });
  if (process.stdin.isTTY) {
    finish({}, handler);
  }
}

let finished = false;
function finish(payload, handler) {
  if (finished) {
    return;
  }
  finished = true;
  const targetHandler = typeof handler === 'function' ? handler : module.exports.__handler;
  if (targetHandler) {
    Promise.resolve(targetHandler(payload)).catch((error) => {
      process.stderr.write(String(error && error.message ? error.message : error));
      process.exitCode = 1;
    });
  }
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(current, '.codex')) || fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir || process.cwd());
    }
    current = parent;
  }
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadPolicy(rootDir) {
  return readJsonIfExists(path.join(rootDir, '.codex', 'raiola-policy.json'), {
    selectedProfile: 'raiola-balanced',
    approvalPolicy: 'on-request',
    sandboxMode: 'workspace-write',
    networkAccess: false,
    locked: false,
    strict: false,
    repoSignals: { frontend: false, monorepo: false, ecosystems: [] },
    taskSignals: { changedPackages: [], impactedPackages: [] },
    repoConfig: { trustLevel: 'standard' },
    verificationGaps: 0,
    pendingApprovals: 0,
    missingEvidence: 0,
    selectionRationale: [],
    profileBehavior: { writeScopeMode: 'task-root', verifyMode: 'targeted' },
    writeBoundary: {
      mode: 'task-root',
      roots: ['.'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 3,
    },
    verifyContract: {
      mode: 'targeted',
      requiredCommands: [],
      packageFirst: false,
      browserProofPreferred: false,
      explicitDegradeOnFallback: true,
      verificationDebt: { verificationGaps: 0, planReadinessGaps: 0, missingEvidence: 0 },
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      repoWideChangeThreshold: 3,
      releaseScriptFamilies: ['release', 'publish', 'deploy', 'workflow', 'changeset'],
      explicitWriteBoundaryRequired: false,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
      capabilityDegradeMustBeExplicit: true,
      ciWorkflowRiskEscalation: true,
      waveWriteRootThreshold: 2,
      commandDenylist: [],
      commandAllowlist: [],
    },
  });
}

function runtimeDir(rootDir) {
  return path.join(rootDir, '.workflow', 'runtime', 'codex-control');
}

function telemetryDir(rootDir) {
  return path.join(runtimeDir(rootDir), 'telemetry');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function truncateText(value, max = 220) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function loadLatestOperator(rootDir) {
  return readJsonIfExists(path.join(runtimeDir(rootDir), 'cockpit', 'manifest.json'))
    || readJsonIfExists(path.join(runtimeDir(rootDir), 'operator.json'))
    || null;
}

function findClosestAgents(startDir, rootDir) {
  let current = path.resolve(startDir || process.cwd());
  const stopDir = path.resolve(rootDir || findRepoRoot(current));
  while (current.startsWith(stopDir)) {
    const candidate = path.join(current, 'AGENTS.md');
    if (fs.existsSync(candidate)) {
      return path.relative(stopDir, candidate).replace(/\\/g, '/');
    }
    if (current === stopDir) {
      break;
    }
    current = path.dirname(current);
  }
  const repoRootCandidate = path.join(stopDir, 'AGENTS.md');
  return fs.existsSync(repoRootCandidate) ? 'AGENTS.md' : null;
}

function printJson(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function dangerousCommand(command) {
  const text = String(command || '');
  return /(rm\s+-rf\s+\/|rm\s+-rf\s+\.|git\s+reset\s+--hard|git\s+clean\s+-fd|:\s*>\s*\/dev\/sda|mkfs\.|dd\s+if=|shutdown\s+-h|reboot\b|sudo\s+|chmod\s+-R\s+777|chown\s+-R)/.test(text);
}

function normalizeRepoRelative(rootDir, value) {
  const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw || /^-/.test(raw) || /^https?:/i.test(raw)) {
    return null;
  }
  const absolute = path.resolve(rootDir, raw);
  const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');
  if (!relative || relative.startsWith('..')) {
    return null;
  }
  return relative;
}

function extractRepoPaths(command, rootDir) {
  const paths = [];
  const push = (value) => {
    if (value && !paths.includes(value)) {
      paths.push(value);
    }
  };
  const text = String(command || '');
  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const normalized = normalizeRepoRelative(rootDir, match[1]);
    if (normalized) {
      push(normalized);
    }
  }
  return paths;
}

function extractInlineRepoPaths(program, rootDir) {
  const paths = [];
  const text = String(program || '');
  for (const match of text.matchAll(INLINE_FILE_WRITE_PATH_PATTERN)) {
    const normalized = normalizeRepoRelative(rootDir, match[2]);
    if (normalized && !paths.includes(normalized)) {
      paths.push(normalized);
    }
  }
  for (const normalized of extractRepoPaths(text, rootDir)) {
    if (!paths.includes(normalized)) {
      paths.push(normalized);
    }
  }
  return paths;
}

function pathWithinBoundary(relativePath, roots = ['.']) {
  const normalizedPath = String(relativePath || '').replace(/^\.\//, '').replace(/\\/g, '/');
  return roots.some((root) => {
    const normalizedRoot = String(root || '.').replace(/^\.\//, '').replace(/\\/g, '/');
    if (normalizedRoot === '.' || normalizedRoot === '') {
      return true;
    }
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
  });
}

function commandWritesToRepo(command) {
  const text = String(command || '');
  return WRITE_COMMAND_PATTERN.test(text) || REDIRECT_WRITE_PATTERN.test(text);
}

function classifyShellCommand(command) {
  const text = String(command || '');
  return {
    dangerous: dangerousCommand(text),
    network: NETWORK_COMMAND_PATTERN.test(text),
    release: RELEASE_COMMAND_PATTERN.test(text),
    ciWorkflow: CI_COMMAND_PATTERN.test(text),
    repoWide: REPO_WIDE_COMMAND_PATTERN.test(text),
    writes: commandWritesToRepo(text),
    scriptLaunch: SCRIPT_LAUNCH_PATTERN.test(text),
  };
}

function classifyInlineProgram(program) {
  const text = String(program || '');
  return {
    dangerous: dangerousCommand(text),
    network: INLINE_NETWORK_SIGNAL_PATTERN.test(text) || NETWORK_COMMAND_PATTERN.test(text),
    release: RELEASE_COMMAND_PATTERN.test(text),
    ciWorkflow: CI_COMMAND_PATTERN.test(text),
    repoWide: REPO_WIDE_COMMAND_PATTERN.test(text),
    writes: INLINE_FILE_WRITE_SIGNAL_PATTERN.test(text) || commandWritesToRepo(text),
    scriptLaunch: SCRIPT_LAUNCH_PATTERN.test(text),
  };
}

function inspectWrappedCommand(command, rootDir) {
  const text = String(command || '').trim();
  const shellMatch = text.match(SHELL_WRAPPER_PATTERN);
  if (shellMatch) {
    return {
      type: 'shell-wrapper',
      wrapper: `${shellMatch[1]} -lc`,
      body: shellMatch[3],
      classification: classifyShellCommand(shellMatch[3]),
      touchedPaths: extractRepoPaths(shellMatch[3], rootDir),
    };
  }
  const nodeMatch = text.match(NODE_INLINE_PATTERN);
  if (nodeMatch) {
    return {
      type: 'node-inline',
      wrapper: 'node -e',
      body: nodeMatch[2],
      classification: classifyInlineProgram(nodeMatch[2]),
      touchedPaths: extractInlineRepoPaths(nodeMatch[2], rootDir),
    };
  }
  const pythonMatch = text.match(PYTHON_INLINE_PATTERN);
  if (pythonMatch) {
    return {
      type: 'python-inline',
      wrapper: 'python -c',
      body: pythonMatch[2],
      classification: classifyInlineProgram(pythonMatch[2]),
      touchedPaths: extractInlineRepoPaths(pythonMatch[2], rootDir),
    };
  }
  return null;
}

function readPackageScripts(rootDir, packageDir = '.') {
  const relativeDir = normalizeRepoRelative(rootDir, packageDir) || (packageDir === '.' ? '.' : null);
  const baseDir = relativeDir && relativeDir !== '.' ? path.join(rootDir, relativeDir) : rootDir;
  const manifestPath = path.join(baseDir, 'package.json');
  const manifest = readJsonIfExists(manifestPath, null);
  return {
    packageDir: relativeDir || '.',
    manifestPath,
    scripts: manifest && typeof manifest === 'object' ? (manifest.scripts || {}) : {},
    manifest,
  };
}

function parseScriptLaunch(command) {
  const text = String(command || '').trim();
  let manager = '';
  let packageDir = '.';
  let scriptName = '';

  let match = text.match(/\bnpm\s+(?:--prefix\s+([^\s]+)\s+)?run\s+([A-Za-z0-9:_-]+)/i);
  if (match) {
    manager = 'npm';
    packageDir = match[1] || '.';
    scriptName = match[2] || '';
  }
  if (!scriptName) {
    match = text.match(/\bpnpm\s+(?:(?:-C|--dir)\s+([^\s]+)\s+)?(?:--filter\s+[^\s]+\s+)*run\s+([A-Za-z0-9:_-]+)/i);
    if (match) {
      manager = 'pnpm';
      packageDir = match[1] || '.';
      scriptName = match[2] || '';
    }
  }
  if (!scriptName) {
    match = text.match(/\byarn\s+(?:--cwd\s+([^\s]+)\s+)?run\s+([A-Za-z0-9:_-]+)/i);
    if (match) {
      manager = 'yarn';
      packageDir = match[1] || '.';
      scriptName = match[2] || '';
    }
  }

  return scriptName ? {
    manager,
    packageDir,
    scriptName,
  } : null;
}

function mergeClassifications(items = []) {
  const seeded = {
    dangerous: false,
    network: false,
    release: false,
    ciWorkflow: false,
    repoWide: false,
    writes: false,
    scriptLaunch: false,
  };
  for (const item of items.filter(Boolean)) {
    for (const key of Object.keys(seeded)) {
      seeded[key] = seeded[key] || Boolean(item[key]);
    }
  }
  return seeded;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function inspectScriptLaunch(command, rootDir, options = {}) {
  const launch = parseScriptLaunch(command);
  if (!launch) {
    return null;
  }

  const maxDepth = Math.max(0, Number(options.maxDepth ?? 3));
  const depth = Math.max(0, Number(options.depth || 0));
  const seen = options.seen instanceof Set ? options.seen : new Set();
  const packageInfo = readPackageScripts(rootDir, launch.packageDir);
  const body = packageInfo.scripts?.[launch.scriptName] || '';
  const visitKey = `${packageInfo.manifestPath}:${launch.scriptName}`;
  if (!body || seen.has(visitKey)) {
    return {
      manager: launch.manager,
      packageDir: packageInfo.packageDir,
      scriptName: launch.scriptName,
      found: Boolean(body),
      packageJsonPath: packageInfo.manifestPath,
      body,
      classification: body ? classifyShellCommand(body) : null,
      touchedPaths: body ? extractRepoPaths(body, rootDir) : [],
      nested: [],
      depth,
    };
  }

  seen.add(visitKey);
  const directClassification = classifyShellCommand(body);
  const touchedPaths = body ? extractRepoPaths(body, rootDir) : [];
  const nested = [];
  if (depth < maxDepth) {
    const nestedLaunch = parseScriptLaunch(body);
    if (nestedLaunch) {
      const nestedDetails = inspectScriptLaunch(body, rootDir, {
        maxDepth,
        depth: depth + 1,
        seen,
      });
      if (nestedDetails) {
        nested.push(nestedDetails);
      }
    }
  }

  const classification = mergeClassifications([
    directClassification,
    ...nested.map((entry) => entry.classification),
  ]);
  const nestedTouchedPaths = nested.flatMap((entry) => entry.touchedPaths || []);
  return {
    manager: launch.manager,
    packageDir: packageInfo.packageDir,
    scriptName: launch.scriptName,
    found: true,
    packageJsonPath: packageInfo.manifestPath,
    body,
    classification,
    touchedPaths: uniqueStrings([...touchedPaths, ...nestedTouchedPaths]),
    nested,
    depth,
  };
}

function commandMatchesPolicyList(command, patterns = []) {
  const text = String(command || '').toLowerCase();
  return (patterns || []).some((pattern) => {
    const normalized = String(pattern || '').trim().toLowerCase();
    return normalized && text.includes(normalized);
  });
}

function recordHookEvent(rootDir, eventName, details = {}) {
  const operator = loadLatestOperator(rootDir);
  const policy = loadPolicy(rootDir);
  const dir = telemetryDir(rootDir);
  ensureDir(dir);
  const at = new Date().toISOString();
  const row = {
    at,
    eventName,
    nativeProfile: policy.selectedProfile || operator?.nativeProfile || 'unknown',
    sessionGenomeId: operator?.sessionGenome?.id || operator?.sessionGenomeId || null,
    goal: operator?.goal || policy.taskSignals?.goalText || null,
    ...details,
  };
  if (typeof row.command === 'string') {
    row.command = truncateText(row.command, 240);
  }
  if (typeof row.prompt === 'string') {
    row.prompt = truncateText(row.prompt, 240);
  }
  if (typeof row.reason === 'string') {
    row.reason = truncateText(row.reason, 240);
  }
  if (Array.isArray(row.notes)) {
    row.notes = row.notes.map((note) => truncateText(note, 240));
  }
  const eventsFile = path.join(dir, 'events.jsonl');
  fs.appendFileSync(eventsFile, `${JSON.stringify(row)}\n`);
  fs.writeFileSync(path.join(dir, 'latest-session.json'), `${JSON.stringify({ lastUpdatedAt: at, latestEvent: row, sessionGenomeId: row.sessionGenomeId, nativeProfile: row.nativeProfile }, null, 2)}\n`);
  return row;
}

module.exports = {
  readStdin,
  findRepoRoot,
  readJsonIfExists,
  loadPolicy,
  findClosestAgents,
  printJson,
  dangerousCommand,
  truncateText,
  recordHookEvent,
  normalizeRepoRelative,
  extractRepoPaths,
  pathWithinBoundary,
  commandWritesToRepo,
  classifyShellCommand,
  classifyInlineProgram,
  inspectScriptLaunch,
  inspectWrappedCommand,
  commandMatchesPolicyList,
};
