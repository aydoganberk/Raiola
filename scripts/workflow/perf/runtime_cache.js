const childProcess = require('node:child_process');
const { markCache, recordCounter } = require('./metrics');

const execCache = new Map();
const gitChangesCache = new Map();
const tokenCache = new Map();

function safeExecCached(command, args, options = {}) {
  const key = JSON.stringify({
    command,
    args,
    cwd: options.cwd || process.cwd(),
  });
  if (execCache.has(key)) {
    markCache('exec_cache', true);
    return execCache.get(key);
  }

  markCache('exec_cache', false);
  try {
    const stdout = childProcess.execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = { ok: true, stdout: stdout.trim() };
    execCache.set(key, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || '').trim(),
    };
    execCache.set(key, result);
    return result;
  }
}

function listGitChangesCached(cwd) {
  if (gitChangesCache.has(cwd)) {
    markCache('git_changes_cache', true);
    return gitChangesCache.get(cwd);
  }

  markCache('git_changes_cache', false);
  const commands = [
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ];
  const files = new Set();
  for (const args of commands) {
    const result = safeExecCached('git', args, { cwd });
    if (!result.ok || !result.stdout) {
      continue;
    }
    for (const line of result.stdout.split('\n').map((item) => item.trim()).filter(Boolean)) {
      files.add(line);
    }
  }
  const output = [...files];
  gitChangesCache.set(cwd, output);
  return output;
}

function estimateTokensCached(value) {
  const normalized = String(value || '');
  if (tokenCache.has(normalized)) {
    markCache('token_estimate_cache', true);
    return tokenCache.get(normalized);
  }

  markCache('token_estimate_cache', false);
  const estimate = Math.ceil(normalized.length / 4);
  tokenCache.set(normalized, estimate);
  recordCounter('token_estimate_requests', 1);
  return estimate;
}

module.exports = {
  estimateTokensCached,
  listGitChangesCached,
  safeExecCached,
};
