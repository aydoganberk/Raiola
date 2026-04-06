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
  fs.writeFileSync(path.join(targetRepo, 'components', 'Card.tsx'), 'export function Card() { return <div style={{ color: "#ff00aa", borderRadius: "18px" }}>Card</div>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'app', 'page.tsx'), 'export default function Page() { return <main><h1>Audit</h1></main>; }\n');
  fs.writeFileSync(path.join(targetRepo, 'preview.html'), '<!doctype html><html><body><main><h1>Preview</h1><button>Ship</button></main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const uiReview = JSON.parse(run('node', [targetBin, 'ui-review', '--url', './preview.html', '--json'], targetRepo));
  const uiSpec = JSON.parse(run('node', [targetBin, 'ui-spec', '--json'], targetRepo));

  assert.ok(uiReview.missingStateAudit.missing.includes('loading'));
  assert.ok(uiReview.tokenDriftAudit.totalIssues >= 1);
  assert.ok(uiReview.debt.some((item) => item.area === 'token drift'));
  assert.ok(uiSpec.missingStateAudit.missing.includes('loading'));
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
});
