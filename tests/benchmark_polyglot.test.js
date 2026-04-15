const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const benchmarkScript = path.join(repoRoot, 'scripts', 'workflow', 'benchmark.js');

function runJson(args) {
  const result = childProcess.spawnSync('node', [benchmarkScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'benchmark failed');
  }
  return JSON.parse(result.stdout);
}

test('benchmark supports polyglot fixture and package-aware monorepo commands', () => {
  const payload = runJson([
    '--fixture', 'polyglot',
    '--commands', 'package-graph,workspace-impact,hook-policy',
    '--runs', '1',
    '--json',
  ]);

  assert.equal(payload.fixture, 'polyglot');
  assert.deepEqual(payload.results.map((item) => item.command), ['package-graph', 'workspace-impact', 'hook-policy']);
  assert.ok(payload.results.every((item) => typeof item.warmMedianMs === 'number'));
  assert.ok(payload.results.every((item) => item.success));
});

test('benchmark supports codex-operator on the polyglot fixture', () => {
  const payload = runJson([
    '--fixture', 'polyglot',
    '--commands', 'codex-operator',
    '--runs', '1',
    '--json',
  ]);

  assert.equal(payload.fixture, 'polyglot');
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].command, 'codex-operator');
  assert.equal(typeof payload.results[0].warmMedianMs, 'number');
  assert.equal(payload.results[0].success, true);
});


test('benchmark supports a triple-digit polyglot workspace fixture for latency proof', () => {
  const payload = runJson([
    '--fixture', 'polyglot-large',
    '--commands', 'package-graph,workspace-impact',
    '--runs', '1',
    '--json',
  ]);

  assert.equal(payload.fixture, 'polyglot-large');
  assert.equal(payload.fixtureOptions.sharedPackageCount, 160);
  assert.deepEqual(payload.results.map((item) => item.command), ['package-graph', 'workspace-impact']);
  assert.ok(payload.results.every((item) => item.success));

  const packageGraphPath = path.join(payload.targetRepo, '.workflow', 'cache', 'package-graph.json');
  const packageGraph = JSON.parse(require('node:fs').readFileSync(packageGraphPath, 'utf8'));
  assert.ok(packageGraph.packageCount >= 100);
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('go'));
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('rust'));
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('python'));
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('java'));
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('bazel'));
  assert.ok(packageGraph.workspaceDiscovery.ecosystems.includes('node'));
});
