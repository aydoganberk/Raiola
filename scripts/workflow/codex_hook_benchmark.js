const childProcess = require('node:child_process');
const path = require('node:path');
const { parseArgs } = require('./common');

function printHelp() {
  console.log(`
codex_hook_benchmark

Usage:
  node scripts/workflow/codex_hook_benchmark.js --command "npm run test"

Options:
  --command <shell>   Command string to classify through the PreToolUse hook
  --cwd <path>        Repo root for hook execution. Defaults to current working directory
  --json              Print machine-readable output
  `);
}

function runCodexHookBenchmark(cwd, command) {
  const hookScript = path.join(cwd, '.codex', 'hooks', 'pre_tool_use_policy.js');
  const started = process.hrtime.bigint();
  const result = childProcess.spawnSync(process.execPath, [hookScript], {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input: JSON.stringify({
      cwd,
      tool_input: { command },
    }),
  });
  const ended = process.hrtime.bigint();
  const stdout = String(result.stdout || '').trim();
  let payload = null;
  if (stdout) {
    try {
      payload = JSON.parse(stdout);
    } catch {
      payload = { raw: stdout };
    }
  }
  return {
    durationMs: Number((ended - started) / BigInt(1e6)),
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stderr: String(result.stderr || ''),
    payload,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = path.resolve(process.cwd(), String(args.cwd || '.'));
  const command = String(args.command || 'npm run test');
  const payload = runCodexHookBenchmark(cwd, command);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# CODEX HOOK BENCHMARK\n');
  console.log(`- Duration: \`${payload.durationMs}ms\``);
  console.log(`- Exit code: \`${payload.exitCode}\``);
  if (payload.payload) {
    console.log(`- Decision: \`${payload.payload.hookSpecificOutput?.permissionDecision || 'allow'}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runCodexHookBenchmark,
};
