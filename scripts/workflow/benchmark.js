const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs } = require('./common');
const { generatePolyglotFixture } = require('./perf/polyglot_fixture');

const NODE_BINARY = process.execPath;

const COMMANDS = {
  launch: [NODE_BINARY, ['scripts/workflow/launch.js', '--json']],
  start: [NODE_BINARY, ['scripts/workflow/start.js', '--goal', 'land the next safe slice', '--json']],
  hud: [NODE_BINARY, ['scripts/workflow/hud.js', '--compact']],
  manager: [NODE_BINARY, ['scripts/workflow/manager.js', '--json']],
  next: [NODE_BINARY, ['scripts/workflow/next_step.js', '--json']],
  'next-prompt': [NODE_BINARY, ['scripts/workflow/next_prompt.js', '--mode', 'minimal', '--json']],
  doctor: [NODE_BINARY, ['scripts/workflow/doctor.js', '--strict']],
  health: [NODE_BINARY, ['scripts/workflow/health.js', '--strict']],
  'map-codebase': [NODE_BINARY, ['scripts/workflow/map_codebase.js', '--compact']],
  'map-frontend': [NODE_BINARY, ['scripts/workflow/map_frontend.js', '--compact']],
  'package-graph': [NODE_BINARY, ['scripts/workflow/package_graph.js', '--json']],
  'workspace-impact': [NODE_BINARY, ['scripts/workflow/workspace_impact.js', '--json']],
  'codex-operator': [NODE_BINARY, ['scripts/workflow/codex_control.js', 'operator', '--goal', 'stabilize polyglot monorepo workflow in Codex', '--json']],
  'hook-policy': [NODE_BINARY, ['-e', "const cp=require('node:child_process'); const payload=JSON.stringify({cwd:process.cwd(), tool_input:{command:'npm run test'}}); const result=cp.spawnSync(process.execPath,['.codex/hooks/pre_tool_use_policy.js'],{cwd:process.cwd(),input:payload,encoding:'utf8',stdio:['pipe','pipe','pipe']}); if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr); process.exit(result.status ?? 0);"]],
  'codex-contextpack': [NODE_BINARY, ['scripts/workflow/codex_control.js', 'contextpack', '--goal', 'review the current diff', '--json']],
  'codex-promptpack': [NODE_BINARY, ['scripts/workflow/codex_control.js', 'promptpack', '--goal', 'review the current diff', '--json']],
};
const DEFAULT_SLO_MS = Object.freeze({
  launch: 800,
  start: 2600,
  hud: 400,
  manager: 400,
  next: 500,
  'next-prompt': 400,
  doctor: 1000,
  health: 1000,
  'map-codebase': 2000,
  'map-frontend': 2000,
  'package-graph': 1200,
  'workspace-impact': 1500,
  'codex-operator': 1800,
  'hook-policy': 250,
  'codex-contextpack': 1500,
  'codex-promptpack': 1800,
});;

function printHelp() {
  console.log(`
benchmark

Usage:
  node scripts/workflow/benchmark.js [--target /path/to/repo]

Options:
  --target <path>        Benchmark target. Defaults to current working directory
  --fixture <name>       small|medium|large|polyglot|polyglot-large benchmark fixture
  --commands <a,b,c>     Commands to benchmark. Defaults to launch,start,hud,manager,next,next-prompt,doctor,health,map-codebase,map-frontend,package-graph,workspace-impact,codex-operator,hook-policy,codex-contextpack,codex-promptpack
  --shared-package-count Number of shared packages when using a generated polyglot fixture
  --runs <n>             Warm run count. Defaults to 3
  --assert-slo           Exit non-zero if any selected command misses its SLO threshold
  --thresholds <spec>    Override SLOs, e.g. hud=300,next=500,doctor=1000
  --json                 Print machine-readable output
  `);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function readPerfMetrics(targetRepo) {
  const latest = path.join(targetRepo, '.workflow', 'cache', 'perf-metrics', 'latest.json');
  if (!fs.existsSync(latest)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(latest, 'utf8'));
  } catch {
    return null;
  }
}

function parseThresholds(rawValue) {
  const thresholds = { ...DEFAULT_SLO_MS };
  if (!rawValue) {
    return thresholds;
  }

  for (const entry of String(rawValue).split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const [commandName, thresholdValue] = trimmed.split(/[:=]/).map((part) => part.trim());
    if (!commandName || !thresholdValue) {
      throw new Error(`Invalid threshold entry: ${trimmed}`);
    }
    if (!(commandName in COMMANDS)) {
      throw new Error(`Unknown threshold command: ${commandName}`);
    }
    const parsed = Number(thresholdValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid threshold for ${commandName}: ${thresholdValue}`);
    }
    thresholds[commandName] = Math.round(parsed);
  }

  return thresholds;
}

function runCommand(targetRepo, label, binary, args) {
  const started = process.hrtime.bigint();
  const result = childProcess.spawnSync(binary, args, {
    cwd: targetRepo,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      WORKFLOW_PERF_CAPTURE: '1',
      WORKFLOW_PERF_LABEL: label,
    },
  });
  const ended = process.hrtime.bigint();
  if (result.error) {
    throw result.error;
  }
  return {
    durationMs: Number((ended - started) / BigInt(1e6)),
    metrics: readPerfMetrics(targetRepo),
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    success: result.status === 0 && !result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function ensureWorkflowInstalled(targetRepo) {
  if (fs.existsSync(path.join(targetRepo, 'docs', 'workflow'))) {
    return;
  }
  childProcess.execFileSync(process.execPath, [path.join(__dirname, 'setup.js'), '--target', targetRepo, '--skip-verify'], {
    cwd: targetRepo,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function fixtureDirectory(fixtureName) {
  const normalized = String(fixtureName || '').trim().toLowerCase();
  const mapping = {
    small: path.join(__dirname, '..', '..', 'tests', 'fixtures', 'blank-repo'),
    medium: path.join(__dirname, '..', '..', 'tests', 'fixtures', 'medium-monorepo'),
    large: path.join(__dirname, '..', '..', 'tests', 'fixtures', 'large-monorepo'),
  };
  return mapping[normalized] || null;
}

function prepareFixtureRepo(fixtureName, options = {}) {
  const normalized = String(fixtureName || '').trim().toLowerCase();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `rai-benchmark-${normalized || 'fixture'}-`));
  const explicitSharedPackageCount = Number(options.sharedPackageCount || 0);
  if (normalized === 'polyglot' || normalized === 'polyglot-large') {
    const sharedPackageCount = explicitSharedPackageCount > 0
      ? explicitSharedPackageCount
      : normalized === 'polyglot-large'
        ? 160
        : 18;
    generatePolyglotFixture(tempDir, { sharedPackageCount });
    return tempDir;
  }
  const sourceDir = fixtureDirectory(normalized);
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error(`Unknown benchmark fixture: ${fixtureName}`);
  }
  fs.cpSync(sourceDir, tempDir, { recursive: true });
  return tempDir;
}

function writeBenchmarkReport(targetRepo, payload) {
  const dir = path.join(targetRepo, '.workflow', 'benchmarks');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'latest.json');
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = args.fixture
    ? prepareFixtureRepo(args.fixture, { sharedPackageCount: args['shared-package-count'] })
    : path.resolve(process.cwd(), String(args.target || '.'));
  const runs = Math.max(1, Number(args.runs || 3));
  const assertSlo = Boolean(args['assert-slo']);
  const thresholds = parseThresholds(args.thresholds);
  const selectedCommands = String(args.commands || 'launch,start,hud,manager,next,next-prompt,doctor,health,map-codebase,map-frontend,package-graph,workspace-impact,codex-operator,hook-policy,codex-contextpack,codex-promptpack')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  ensureWorkflowInstalled(targetRepo);

  const results = [];
  for (const commandName of selectedCommands) {
    const spec = COMMANDS[commandName];
    if (!spec) {
      throw new Error(`Unknown benchmark command: ${commandName}`);
    }

    const [binary, commandArgs] = spec;
    const cold = runCommand(targetRepo, `${commandName}-cold`, binary, commandArgs);
    const warmRuns = [];
    for (let index = 0; index < runs; index += 1) {
      warmRuns.push(runCommand(targetRepo, `${commandName}-warm-${index + 1}`, binary, commandArgs));
    }

    results.push({
      command: commandName,
      coldMs: cold.durationMs,
      warmMedianMs: median(warmRuns.map((item) => item.durationMs)),
      lastMetrics: warmRuns[warmRuns.length - 1]?.metrics || cold.metrics,
      exitCode: warmRuns[warmRuns.length - 1]?.exitCode ?? cold.exitCode,
      success: warmRuns.every((item) => item.success) && cold.success,
    });
  }

  const failures = results
    .map((result) => ({
      command: result.command,
      thresholdMs: thresholds[result.command],
      warmMedianMs: result.warmMedianMs,
      passed: result.warmMedianMs <= thresholds[result.command] && result.success !== false,
    }))
    .filter((item) => !item.passed);

  const payload = {
    generatedAt: new Date().toISOString(),
    targetRepo,
    fixture: args.fixture ? String(args.fixture) : null,
    fixtureOptions: args.fixture
      ? { sharedPackageCount: Number(args['shared-package-count'] || 0) || (String(args.fixture).toLowerCase() === 'polyglot-large' ? 160 : String(args.fixture).toLowerCase() === 'polyglot' ? 18 : null) }
      : null,
    runs,
    results,
    slo: {
      asserted: assertSlo,
      thresholds: Object.fromEntries(selectedCommands.map((commandName) => [commandName, thresholds[commandName]])),
      failures,
      passed: failures.length === 0,
    },
  };
  const reportPath = writeBenchmarkReport(targetRepo, payload);

  if (args.json) {
    if (assertSlo && failures.length > 0) {
      process.exitCode = 1;
    }
    console.log(JSON.stringify({
      ...payload,
      reportPath,
    }, null, 2));
    return;
  }

  console.log('# WORKFLOW BENCHMARK\n');
  console.log(`- Target: \`${targetRepo}\``);
  console.log(`- Warm runs per command: \`${runs}\``);
  console.log(`- Report: \`${reportPath}\``);
  console.log('\n## Results\n');
  for (const result of results) {
    const counters = result.lastMetrics?.counters || {};
    const hitCount = Object.entries(counters)
      .filter(([name]) => name.endsWith('_hits'))
      .reduce((sum, [, value]) => sum + Number(value || 0), 0);
    const missCount = Object.entries(counters)
      .filter(([name]) => name.endsWith('_misses'))
      .reduce((sum, [, value]) => sum + Number(value || 0), 0);
    console.log(`- \`${result.command}\` -> cold=\`${result.coldMs}ms\`, warm-median=\`${result.warmMedianMs}ms\`, cache-hits=\`${hitCount}\`, cache-misses=\`${missCount}\``);
  }

  if (assertSlo) {
    console.log('\n## SLO\n');
    if (failures.length === 0) {
      console.log('- `All selected commands met their SLO thresholds.`');
    } else {
      for (const failure of failures) {
        console.log(`- \`${failure.command}\` missed SLO: warm-median=\`${failure.warmMedianMs}ms\` threshold=\`${failure.thresholdMs}ms\``);
      }
      process.exitCode = 1;
    }
  }
}

main();
