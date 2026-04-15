const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(blankFixture, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd, extra = {}) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readJson(targetRepo, relativeFile) {
  return JSON.parse(fs.readFileSync(path.join(targetRepo, relativeFile), 'utf8'));
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('control-plane-publish applies GitHub env files and autopilot becomes PR-aware', () => {
  const targetRepo = makeTempRepo('raiola-phase36-publish-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase36-publish',
    scripts: {
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'src/index.ts', 'export function score(a, b) { return a + b; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'src/index.ts', 'export function score(a, b) { const secret = process.env.API_TOKEN; return secret ? a - b : a + b; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'release-control', '--json'], targetRepo);
  run('node', [targetBin, 'handoff', '--json'], targetRepo);
  run('node', [targetBin, 'team-control', '--json'], targetRepo);
  run('node', [targetBin, 'measure', '--json'], targetRepo);
  run('node', [targetBin, 'lifecycle', '--json'], targetRepo);

  const githubStepSummary = path.join(targetRepo, 'gh-step-summary.txt');
  const githubOutput = path.join(targetRepo, 'gh-output.txt');
  const githubEnv = path.join(targetRepo, 'gh-env.txt');
  const automationEnv = {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_HEAD_REF: 'feature/control-planes',
    GITHUB_REF_NAME: 'feature/control-planes',
    GITHUB_ACTOR: 'workflow-bot',
    GITHUB_RUN_ID: '42',
    GITHUB_WORKFLOW: 'CI',
    GITHUB_STEP_SUMMARY: githubStepSummary,
    GITHUB_OUTPUT: githubOutput,
    GITHUB_ENV: githubEnv,
  };

  const autopilot = JSON.parse(run('node', [targetBin, 'autopilot', '--json'], targetRepo, { env: automationEnv }));
  const publish = JSON.parse(run('node', [targetBin, 'control-plane-publish', '--apply-github-env', '--json'], targetRepo, { env: automationEnv }));

  assert.equal(autopilot.eventContext.eventName, 'pull_request');
  assert.ok(autopilot.routines.some((item) => String(item.command || '').includes('control_plane_publish.js --apply-github-env --json')));
  assert.ok(autopilot.publishSurface.coverageRatio >= 0);
  assert.ok(autopilot.teamActivity.mailboxEntries >= 0);

  assert.equal(publish.publishPlan.github.ready, true);
  assert.equal(publish.publishPlan.ci.ready, true);
  assert.equal(publish.applied.stepSummaryApplied, true);
  assert.equal(publish.applied.outputApplied, true);
  assert.equal(publish.applied.envApplied, true);
  assert.ok(fs.existsSync(path.join(targetRepo, publish.externalExports.githubPrComment)));
  assert.ok(fs.existsSync(path.join(targetRepo, publish.externalExports.githubPrCommentJson)));
  assert.ok(fs.existsSync(path.join(targetRepo, publish.externalExports.githubActionsOutputJson)));
  assert.ok(fs.existsSync(path.join(targetRepo, publish.externalExports.exportManifest)));

  const stepSummary = fs.readFileSync(githubStepSummary, 'utf8');
  const outputFile = fs.readFileSync(githubOutput, 'utf8');
  const envFile = fs.readFileSync(githubEnv, 'utf8');
  const exportManifest = readJson(targetRepo, publish.externalExports.exportManifest);

  assert.match(stepSummary, /Engineering Control Plane Summary/);
  assert.match(stepSummary, /Release verdict/i);
  assert.match(outputFile, /release_verdict=/);
  assert.match(outputFile, /release_ci_gate_path=/);
  assert.match(envFile, /RAIOLA_RELEASE_VERDICT=/);
  assert.match(envFile, /RAIOLA_RELEASE_PR_COMMENT_PATH=/);
  assert.ok(exportManifest.publishPlan.exportCoverage.coverageRatio >= 80);
  assert.equal(exportManifest.publishPlan.github.ready, true);
});

test('explainability coverage and lifecycle drift surface config and export gaps', () => {
  const targetRepo = makeTempRepo('raiola-phase36-drift-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase36-drift',
    scripts: {
      test: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
    dependencies: {
      next: '14.2.0',
      react: '18.2.0',
      'react-dom': '18.2.0',
    },
  }, null, 2)}\n`);
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>Dashboard</main>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'repo-config', '--write', '--json'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { const flag = process.env.UI_FLAG; return <main>{flag ? "ship" : "preview"}</main>; }\n');

  run('node', [targetBin, 'review', '--json'], targetRepo);
  run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo);
  run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo);
  run('node', [targetBin, 'release-control', '--json'], targetRepo);
  const handoff = JSON.parse(run('node', [targetBin, 'handoff', '--json'], targetRepo));
  run('node', [targetBin, 'team-control', '--json'], targetRepo);
  run('node', [targetBin, 'measure', '--json'], targetRepo);
  const explain = JSON.parse(run('node', [targetBin, 'explain', '--json'], targetRepo));

  assert.ok(explain.surfaceCoverage.expected >= explain.surfaceCoverage.surveyed);
  assert.ok(explain.surfaceCoverage.ratio >= 0);
  assert.ok(['high', 'medium', 'low', 'unknown'].includes(explain.confidenceBreakdown.tier));
  assert.ok(Object.keys(explain.signalBuckets).length >= 1);
  assert.ok(Array.isArray(explain.nextSteps));
  assert.ok(fs.existsSync(path.join(targetRepo, handoff.exports.continuityBundle)));

  const repoConfigPath = path.join(targetRepo, '.workflow', 'repo-config.json');
  const repoConfig = JSON.parse(fs.readFileSync(repoConfigPath, 'utf8'));
  repoConfig.generatedDefaults.defaultProfile = repoConfig.generatedDefaults.defaultProfile === 'deep' ? 'balanced' : 'deep';
  fs.writeFileSync(repoConfigPath, `${JSON.stringify(repoConfig, null, 2)}\n`);

  const prCommentPath = path.join(targetRepo, '.workflow', 'exports', 'github-pr-comment.md');
  fs.unlinkSync(prCommentPath);

  const lifecycle = JSON.parse(run('node', [targetBin, 'lifecycle', '--json'], targetRepo));
  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));
  const dashboardState = readJson(targetRepo, dashboard.stateFile);

  assert.notEqual(lifecycle.verdict, 'healthy');
  assert.equal(lifecycle.drift.config.present, true);
  assert.ok(lifecycle.drift.config.changedKeys.includes('defaultProfile'));
  assert.equal(lifecycle.drift.exports.present, true);
  assert.ok(lifecycle.drift.exports.missingFiles.includes('githubPrComment'));
  assert.ok(lifecycle.selfHealing.actions.some((item) => item.command === 'rai repo-config --refresh --json'));
  assert.ok(lifecycle.selfHealing.actions.some((item) => item.command === 'node scripts/workflow/control_plane_publish.js --json'));

  assert.ok(dashboardState.explainability.surfaceCoverage.ratio >= 0);
  assert.equal(dashboardState.lifecycleCenter.drift.config.present, true);
  assert.equal(dashboardState.lifecycleCenter.drift.exports.present, true);
});
