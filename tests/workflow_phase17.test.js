const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const { buildReviewDiffCorpus } = require('./corpus/review_diff.corpus');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const cwfBin = path.join(repoRoot, 'bin', 'cwf.js');
const { buildPackageGraph } = require(path.join(repoRoot, 'scripts', 'workflow', 'package_graph.js'));

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase17-'));
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

test('roadmap audit corpus clears the roadmap quality thresholds', () => {
  const payload = JSON.parse(run(
    'node',
    [path.join(repoRoot, 'scripts', 'workflow', 'roadmap_audit.js'), '--json', '--assert'],
    repoRoot,
  ));

  assert.equal(payload.passed, true);
  assert.ok(payload.corpora.intent.total >= 200);
  assert.ok(payload.corpora.review.total >= 25);
  assert.ok(payload.corpora.frontend.total >= 12);
  assert.ok(payload.intent.top1Accuracy >= 0.95);
  assert.ok(payload.intent.top3Coverage >= 0.99);
  assert.ok(payload.review.passRate >= 0.9);
  assert.ok(payload.frontend.passRate >= 0.9);
  assert.equal(payload.intent.failures.length, 0);
  assert.equal(payload.review.failures.length, 0);
  assert.equal(payload.frontend.failures.length, 0);
});

test('doctor and health expose risk scores that react to workflow drift', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M41',
      '--name', 'Risk audit',
      '--goal', 'Exercise doctor and health risk scores',
    ],
    targetRepo,
  );

  const healthyDoctor = JSON.parse(run('node', [targetBin, 'doctor', '--json'], targetRepo));
  const healthyHealth = JSON.parse(run('node', [targetBin, 'health', '--json'], targetRepo));

  fs.rmSync(path.join(targetRepo, '.workflow', 'VERSION.md'), { force: true });
  const statusPath = path.join(targetRepo, 'docs', 'workflow', 'STATUS.md');
  const brokenStatus = fs
    .readFileSync(statusPath, 'utf8')
    .replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`');
  fs.writeFileSync(statusPath, brokenStatus);

  const degradedDoctor = JSON.parse(run('node', [targetBin, 'doctor', '--json'], targetRepo));
  const degradedHealth = JSON.parse(run('node', [targetBin, 'health', '--json'], targetRepo));

  assert.equal(healthyDoctor.risk.level, 'low');
  assert.equal(healthyHealth.risk.level, 'low');
  assert.ok(degradedDoctor.risk.score < healthyDoctor.risk.score);
  assert.ok(degradedHealth.risk.score < healthyHealth.risk.score);
  assert.ok(degradedHealth.failCount > healthyHealth.failCount);
});

test('ui review exposes missing-state and token-drift audits', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M42',
      '--name', 'Frontend audit',
      '--goal', 'Frontend audit scenario',
    ],
    targetRepo,
  );

  fs.mkdirSync(path.join(targetRepo, 'app'), { recursive: true });
  fs.mkdirSync(path.join(targetRepo, 'components'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, 'components.json'), '{ "style": "default" }\n');
  fs.writeFileSync(path.join(targetRepo, 'app', 'layout.tsx'), 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'components', 'Card.tsx'), 'export function Card() { return <div onClick={() => {}} style={{ color: "#ff00aa", borderRadius: "18px" }}><input /></div>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'components', 'Modal.tsx'), 'export function Modal() { return <div className="modal-shell"><button>Close</button></div>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'app', 'page.tsx'), 'export default function Page() { return <main><h1>Audit</h1></main>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'preview.html'), '<!doctype html><html><body><main><h1>Preview</h1><button>Ship</button></main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const uiReview = JSON.parse(run('node', [targetBin, 'ui-review', '--url', './preview.html', '--json'], targetRepo));
  const uiSpec = JSON.parse(run('node', [targetBin, 'ui-spec', '--json'], targetRepo));

  assert.ok(uiReview.missingStateAudit.missing.includes('loading'));
  assert.ok(uiReview.tokenDriftAudit.totalIssues >= 1);
  assert.ok(uiReview.debt.some((item) => item.area === 'token drift'));
  assert.ok(['pass', 'warn', 'fail', 'inconclusive'].includes(uiReview.accessibilityAudit.verdict));
  assert.ok(['pass', 'warn', 'incomplete', 'inconclusive'].includes(uiReview.journeyAudit.coverage));
  assert.ok(uiReview.semanticAudit.issueCount >= 1);
  assert.ok(uiReview.primitiveOpportunities.opportunityCount >= 1);
  assert.ok(['pass', 'warn', 'fail'].includes(uiReview.designContractAudit.verdict));
  assert.ok(uiReview.designContractAudit.missingRequiredStates.some((item) => item.id === 'loading'));
  assert.ok(uiSpec.missingStateAudit.missing.includes('loading'));
  assert.ok(uiSpec.accessibilityAudit);
  assert.ok(uiSpec.journeyAudit);
  assert.ok(uiSpec.semanticAudit.issueCount >= 1);
  assert.ok(uiSpec.primitiveOpportunities.opportunityCount >= 1);
  assert.ok(uiSpec.stateAtlas.requiredStates.includes('loading'));
});

test('review engine detects API drift and data migration risks in diff mode', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M43',
      '--name', 'Review audit',
      '--goal', 'Review audit scenario',
    ],
    targetRepo,
  );

  const scenario = buildReviewDiffCorpus().find((item) => item.id === 'migration-and-api');
  const diffPath = path.join(targetRepo, 'audit.diff');
  fs.writeFileSync(diffPath, scenario.diffText);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const review = JSON.parse(run('node', [targetBin, 'review', '--diff-file', diffPath, '--json'], targetRepo));
  const categories = review.findings.map((finding) => finding.category);

  assert.ok(categories.includes('API drift'));
  assert.ok(categories.includes('data/migration'));
});

test('review engine semantic pass catches auth regressions and frontend accessibility drift', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M44',
      '--name', 'Semantic review audit',
      '--goal', 'Exercise semantic review signals',
    ],
    targetRepo,
  );

  const diffPath = path.join(targetRepo, 'semantic.diff');
  fs.writeFileSync(diffPath, [
    'diff --git a/src/auth.ts b/src/auth.ts',
    '--- a/src/auth.ts',
    '+++ b/src/auth.ts',
    '@@',
    '-export async function getSecret(session) { if (!session) throw new Error("auth"); return db.secret; }',
    '+export async function getSecret() { return db.secret; }',
    '',
    'diff --git a/components/Card.tsx b/components/Card.tsx',
    '--- a/components/Card.tsx',
    '+++ b/components/Card.tsx',
    '@@',
    '-export function Card() { return <button aria-label="close"></button>; }',
    '+export function Card() { return <button></button>; }',
    '',
  ].join('\n'));

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const review = JSON.parse(run('node', [targetBin, 'review', '--diff-file', diffPath, '--json'], targetRepo));
  const categories = review.findings.map((finding) => finding.category);

  assert.ok(categories.includes('security'));
  assert.ok(categories.includes('correctness'));
  assert.ok(categories.includes('frontend ux/a11y'));
  assert.ok(review.semanticSignals.length >= 2);
  assert.ok(fs.existsSync(path.join(targetRepo, review.artifacts.semantic)));
});

test('package graph exposes changed and impacted packages for monorepo deltas', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase17-graph-'));
  const fixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
  fs.cpSync(fixture, tempDir, { recursive: true });

  run('git', ['init'], tempDir);
  run('git', ['config', 'user.email', 'graph@example.com'], tempDir);
  run('git', ['config', 'user.name', 'Graph Runner'], tempDir);
  run('git', ['add', '.'], tempDir);
  run('git', ['commit', '-m', 'baseline graph fixture'], tempDir);

  fs.writeFileSync(path.join(tempDir, 'packages', 'data', 'src', 'client.ts'), 'export const client = "updated";\n');

  const graph = buildPackageGraph(tempDir, { writeFiles: false });

  assert.ok(graph.changedPackages.includes('packages/data'));
  assert.ok(graph.impactedPackages.includes('packages/auth'));
  assert.ok(graph.impactedPackages.includes('apps/admin'));
  assert.equal(graph.testOwnership['tests/smoke.test.js'], '.');
  assert.ok(graph.impactedTests.includes('tests/smoke.test.js'));
});
