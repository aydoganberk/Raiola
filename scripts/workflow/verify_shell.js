const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  ensureDir,
  parseArgs,
} = require('./common');
const { makeArtifactId, writeRuntimeMarkdown } = require('./runtime_helpers');

function printHelp() {
  console.log(`
verify_shell

Usage:
  node scripts/workflow/verify_shell.js --cmd "npm test"

Options:
  --cmd <text>         Shell command to run
  --timeout <seconds>  Timeout in seconds. Defaults to 120
  --scope <path>       Optional scope label
  --cwd <path>         Optional execution cwd. Defaults to current working directory
  --json               Print machine-readable output
  `);
}

function normalizeVerdict(result) {
  if (result.timedOut) {
    return 'inconclusive';
  }
  return result.exitCode === 0 ? 'pass' : 'fail';
}

function artifactDirFor(cwd, artifactId) {
  return path.join(cwd, '.workflow', 'verifications', 'shell', artifactId);
}


function resolveShellBinary() {
  const unixCandidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/usr/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
    '/usr/bin/sh',
  ].filter(Boolean);

  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }

  for (const candidate of unixCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '/bin/sh';
}

function shellArgs(shell, command) {
  if (process.platform === 'win32' && /cmd(?:\.exe)?$/i.test(shell)) {
    return ['/d', '/s', '/c', command];
  }
  return ['-lc', command];
}

function runVerifyShell(cwd, options = {}) {
  const command = String(options.command || '').trim();
  if (!command) {
    throw new Error('--cmd is required');
  }

  const timeoutSeconds = Math.max(1, Math.min(300, Number(options.timeout || 120)));
  const execCwd = path.resolve(cwd, String(options.execCwd || '.'));
  const artifactId = makeArtifactId(command.slice(0, 48));
  const startedAt = new Date().toISOString();
  const startedHr = process.hrtime.bigint();
  let result;
  const shell = resolveShellBinary();

  try {
    result = childProcess.spawnSync(shell, shellArgs(shell, command), {
      cwd: execCwd,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: timeoutSeconds * 1000,
    });
  } catch (error) {
    result = {
      status: 1,
      signal: null,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
      error,
    };
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Number((process.hrtime.bigint() - startedHr) / BigInt(1e6));
  const timedOut = result.signal === 'SIGTERM' && durationMs >= timeoutSeconds * 1000;
  const verdict = normalizeVerdict({
    exitCode: typeof result.status === 'number' ? result.status : 1,
    timedOut,
  });
  const summary = timedOut
    ? `Command timed out after ${timeoutSeconds}s`
    : verdict === 'pass'
      ? 'Command completed successfully'
      : `Command exited with code ${typeof result.status === 'number' ? result.status : 1}`;

  const artifactDir = artifactDirFor(cwd, artifactId);
  ensureDir(artifactDir);
  fs.writeFileSync(path.join(artifactDir, 'stdout.log'), String(result.stdout || ''));
  fs.writeFileSync(path.join(artifactDir, 'stderr.log'), String(result.stderr || ''));
  const meta = {
    kind: 'shell',
    command,
    shell,
    cwd: execCwd,
    scope: String(options.scope || '').trim(),
    timeoutSeconds,
    startedAt,
    finishedAt,
    durationMs,
    exitCode: typeof result.status === 'number' ? result.status : 1,
    signal: result.signal || null,
    timedOut,
    verdict,
    summary,
    artifacts: {
      stdout: path.relative(cwd, path.join(artifactDir, 'stdout.log')).replace(/\\/g, '/'),
      stderr: path.relative(cwd, path.join(artifactDir, 'stderr.log')).replace(/\\/g, '/'),
      meta: path.relative(cwd, path.join(artifactDir, 'meta.json')).replace(/\\/g, '/'),
    },
  };
  fs.writeFileSync(path.join(artifactDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  writeRuntimeMarkdown(cwd, 'last-verify-shell.md', `
# LAST VERIFY SHELL

- Verdict: \`${meta.verdict}\`
- Command: \`${meta.command}\`
- Cwd: \`${meta.cwd}\`
- Duration: \`${meta.durationMs}ms\`
- Summary: \`${meta.summary}\`
- Artifact dir: \`${path.relative(cwd, artifactDir).replace(/\\/g, '/')}\`
`);

  return meta;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const payload = runVerifyShell(cwd, {
    command: args.cmd,
    timeout: args.timeout,
    scope: args.scope,
    execCwd: args.cwd,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# VERIFY SHELL\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Command: \`${payload.command}\``);
  console.log(`- Cwd: \`${payload.cwd}\``);
  console.log(`- Duration: \`${payload.durationMs}ms\``);
  console.log(`- Summary: \`${payload.summary}\``);
  console.log(`- Stdout: \`${payload.artifacts.stdout}\``);
  console.log(`- Stderr: \`${payload.artifacts.stderr}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  runVerifyShell,
};
