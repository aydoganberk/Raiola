const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const cwfBin = path.join(repoRoot, 'bin', 'cwf.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase16-'));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readJson(targetRepo, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(targetRepo, relativePath), 'utf8'));
}

test('intent engine, route replay/eval, and codex bootstrap surfaces are scriptable', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const goal = 'review the frontend diff and capture browser evidence';
  const route = JSON.parse(run('node', [targetBin, 'route', '--goal', goal, '--json'], targetRepo));
  const replay = JSON.parse(run('node', [targetBin, 'route', 'replay', '--json'], targetRepo));
  const evaluation = JSON.parse(run('node', [targetBin, 'route', 'eval', '--goal', goal, '--json'], targetRepo));
  const profile = JSON.parse(run('node', [targetBin, 'codex', 'profile', 'suggest', '--goal', goal, '--json'], targetRepo));
  const bootstrap = JSON.parse(run('node', [targetBin, 'codex', 'bootstrap', '--goal', goal, '--json'], targetRepo));
  const resumeCard = JSON.parse(run('node', [targetBin, 'codex', 'resume-card', '--json'], targetRepo));
  const planSubagents = JSON.parse(run('node', [targetBin, 'codex', 'plan-subagents', '--goal', goal, '--json'], targetRepo));

  assert.equal(route.recommendedCapability, 'review.deep_review');
  assert.ok(route.confidence >= 0.55);
  assert.ok(route.why.secondaryCapability);
  assert.notEqual(route.why.secondaryCapability, route.recommendedCapability);
  assert.ok(route.why.rejectedAlternatives.length >= 1);
  assert.ok(typeof route.why.ambiguityClass === 'string');
  assert.ok(replay.entries.length >= 1);
  assert.ok(['pass', 'warn'].includes(evaluation.evaluation.verdict));
  assert.equal(profile.profile.id, 'review-deep');
  assert.equal(bootstrap.profile.id, 'review-deep');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'codex-control', 'bootstrap.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, resumeCard.file)));
  assert.ok(planSubagents.suggestedPlan.length >= 1);
});

test('review engine and frontend OS artifacts generate canonical outputs', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  fs.mkdirSync(path.join(targetRepo, 'app'), { recursive: true });
  fs.mkdirSync(path.join(targetRepo, 'components'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, 'components.json'), '{ "style": "default" }\n');
  fs.writeFileSync(path.join(targetRepo, 'app', 'layout.tsx'), 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'components', 'Button.tsx'), 'export function Button({ children }) { return <button type="button">{children}</button>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'app', 'page.tsx'), 'export default function Page() { return <main><h1>Before</h1></main>; }\n');

  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M40',
      '--name', 'Frontend review',
      '--goal', 'Exercise UI OS and review OS',
    ],
    targetRepo,
  );
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline frontend fixture'], targetRepo);

  fs.writeFileSync(
    path.join(targetRepo, 'app', 'page.tsx'),
    'export default function Page() { console.log("debug"); return <main><h1>After</h1><p>TODO: tighten copy</p></main>; }\n',
  );
  fs.writeFileSync(
    path.join(targetRepo, 'preview.html'),
    '<!doctype html><html><head><title>Preview</title></head><body><main><h1>Preview</h1><button>Ship</button></main></body></html>\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const uiSpec = JSON.parse(run('node', [targetBin, 'ui-spec', '--json'], targetRepo));
  const uiPlan = JSON.parse(run('node', [targetBin, 'ui-plan', '--json'], targetRepo));
  const componentMap = JSON.parse(run('node', [targetBin, 'component-map', '--json'], targetRepo));
  const responsiveMatrix = JSON.parse(run('node', [targetBin, 'responsive-matrix', '--json'], targetRepo));
  const designDebt = JSON.parse(run('node', [targetBin, 'design-debt', '--json'], targetRepo));
  const uiReview = JSON.parse(run('node', [targetBin, 'ui-review', '--url', './preview.html', '--json'], targetRepo));
  const review = JSON.parse(run('node', [targetBin, 'review', '--json'], targetRepo));
  const packetExplain = JSON.parse(run('node', [targetBin, 'packet', 'explain', '--step', 'plan', '--json'], targetRepo));
  const dashboard = JSON.parse(run('node', [targetBin, 'dashboard', '--json'], targetRepo));

  assert.ok(fs.existsSync(path.join(targetRepo, uiSpec.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, uiPlan.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, componentMap.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, responsiveMatrix.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, designDebt.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, uiReview.file)));
  assert.ok(uiReview.browserArtifacts.length >= 1);
  assert.ok(['pass', 'warn', 'fail', 'inconclusive'].includes(uiReview.accessibilityAudit.verdict));
  assert.ok(['pass', 'warn', 'incomplete', 'inconclusive'].includes(uiReview.journeyAudit.coverage));
  assert.ok(review.findings.length >= 1);
  assert.ok(review.packageHeatmap.length >= 1);
  assert.ok(review.personas.length >= 1);
  assert.ok(review.traceability.validationRows.length >= 1);
  assert.ok(review.followUpTickets.length >= 1);
  assert.ok(Array.isArray(review.packageGraph.impactedTests));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.findings)));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.heatmap)));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.packageHeatmap)));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.personas)));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.traceability)));
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.blockers)));
  assert.ok(review.uiReview);
  assert.ok(packetExplain.compilerSummary);
  assert.ok(Array.isArray(packetExplain.compilerSummary.scope.impactedPackages));
  assert.ok(fs.existsSync(path.join(targetRepo, packetExplain.contextArtifact)));
  assert.ok(fs.existsSync(path.join(targetRepo, dashboard.file)));
  const dashboardHtml = fs.readFileSync(path.join(targetRepo, dashboard.file), 'utf8');
  assert.match(dashboardHtml, /workflow dashboard/i);
  assert.match(dashboardHtml, /command palette/i);
  assert.match(dashboardHtml, /context compiler/i);
  const dashboardState = readJson(targetRepo, dashboard.stateFile);
  assert.ok(dashboardState.packetContext);
  assert.ok(dashboard.summary.quickActions >= 1);
});

test('benchmark fixtures support medium and large monorepo runs', () => {
  const benchmarkScript = path.join(repoRoot, 'scripts', 'workflow', 'benchmark.js');
  const medium = JSON.parse(run(
    'node',
    [benchmarkScript, '--fixture', 'medium', '--commands', 'hud,map-codebase', '--runs', '1', '--json'],
    repoRoot,
  ));
  const large = JSON.parse(run(
    'node',
    [benchmarkScript, '--fixture', 'large', '--commands', 'hud', '--runs', '1', '--json'],
    repoRoot,
  ));

  assert.equal(medium.fixture, 'medium');
  assert.equal(large.fixture, 'large');
  assert.equal(medium.results.length, 2);
  assert.equal(large.results.length, 1);
  assert.ok(medium.results.every((item) => typeof item.warmMedianMs === 'number'));
});
