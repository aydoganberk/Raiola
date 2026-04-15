const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) { const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); fs.cpSync(fixture, tempDir, { recursive: true }); return tempDir; }
function run(command, args, cwd) { return childProcess.execFileSync(command, args, { cwd, env: process.env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
function gitInit(targetRepo) { run('git', ['init'], targetRepo); run('git', ['config', 'user.email', 'test@example.com'], targetRepo); run('git', ['config', 'user.name', 'Test User'], targetRepo); }
function bootstrapRepo(targetRepo) { run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot); gitInit(targetRepo); run('git', ['add', '.'], targetRepo); run('git', ['commit', '-m', 'initial state'], targetRepo); return path.join(targetRepo, 'bin', 'rai.js'); }

test('routing telemetry, browser control loop, and stdio MCP wrapper are productized', () => {
  const targetRepo = makeTempRepo('raiola-phase50-');
  const targetBin = bootstrapRepo(targetRepo);
  const routeOne = JSON.parse(run('node', [targetBin, 'do', '--goal', 'audit the flaky repo review lane', '--json'], targetRepo));
  assert.ok(routeOne.capability);
  run('node', [targetBin, 'telemetry', 'route-feedback', '--phase', routeOne.currentStep || 'plan', '--goal', routeOne.goal, '--recommended-capability', routeOne.capability, '--final-capability', 'review-mode', '--recommended-preset', routeOne.recommendedPreset, '--final-preset', 'balanced', '--outcome', 'override'], targetRepo);
  const telemetry = JSON.parse(run('node', [targetBin, 'telemetry', 'routing', '--json'], targetRepo));
  assert.ok(telemetry.summary.totalEntries >= 2);
  assert.ok(telemetry.summary.logFile.endsWith('routing-log.jsonl'));

  const htmlPath = path.join(targetRepo, 'tmp-control-loop.html');
  fs.writeFileSync(htmlPath, '<!doctype html><html lang="en"><head><title>Loop</title></head><body><main><h1>Loop</h1><button>Ship</button></main></body></html>');
  const browser = JSON.parse(run('node', [targetBin, 'verify-browser', '--url', htmlPath, '--watch', '--iterations', '2', '--json'], targetRepo));
  assert.equal(browser.mode, 'watch');
  assert.equal(browser.iterations, 2);
  assert.ok(browser.artifacts.log.endsWith('browser-control/latest.json'));
  assert.ok(fs.existsSync(path.join(targetRepo, browser.artifacts.log)));

  const mcp = JSON.parse(run('node', [targetBin, 'mcp', 'install', '--json'], targetRepo));
  assert.ok(mcp.manifest.servers.every((entry) => entry.transport === 'stdio'));
  const sourcePackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(sourcePackageJson.bin['raiola-mcp'], 'bin/raiola-mcp.js');
  assert.ok(fs.existsSync(path.join(targetRepo, 'bin', 'raiola-mcp.js')));
});
