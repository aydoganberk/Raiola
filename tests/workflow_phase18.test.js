const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const cwfBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase18-'));
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

test('phase 8 trust surfaces generate fix plans, approval plans, ship gates, and richer evidence graphs', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');

  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'trust@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Trust Runner'], targetRepo);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M50',
      '--name', 'Trust gap audit',
      '--goal', 'Exercise verify-work and ship-readiness surfaces',
    ],
    targetRepo,
  );

  fs.mkdirSync(path.join(targetRepo, 'migrations'), { recursive: true });
  fs.mkdirSync(path.join(targetRepo, 'app', 'api'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, 'app', 'api', 'route.ts'), 'export async function GET() { return Response.json({ ok: true }); }\n');
  fs.writeFileSync(path.join(targetRepo, 'migrations', '001_init.sql'), '-- baseline\n');
  fs.writeFileSync(path.join(targetRepo, 'preview.html'), '<!doctype html><html><body><main><h1>Preview</h1><button>Ship</button></main></body></html>\n');
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline trust fixture'], targetRepo);

  fs.writeFileSync(
    path.join(targetRepo, 'app', 'api', 'route.ts'),
    'export async function POST() { const token = "demo-token"; return Response.json({ ok: true }); }\n',
  );
  fs.writeFileSync(
    path.join(targetRepo, 'migrations', '001_init.sql'),
    'create table widgets (id integer primary key, name text);\n',
  );

  const verifyShell = JSON.parse(run('node', [targetBin, 'verify-shell', '--cmd', 'node -e "process.exit(0)"', '--json'], targetRepo));
  const verifyBrowser = JSON.parse(run('node', [targetBin, 'verify-browser', '--url', './preview.html', '--json'], targetRepo));
  run('node', [targetBin, 'claims', 'add', 'Preview smoke passes', '--evidence', verifyBrowser.artifacts.meta], targetRepo);
  run('node', [targetBin, 'questions', 'add', 'Do these risky changes need explicit approval?'], targetRepo);
  run('node', [targetBin, 'assumptions', 'add', 'Migration rollout can be manually approved for this slice', '--impact', 'high', '--exit-trigger', 'A human grant is recorded'], targetRepo);

  const review = JSON.parse(run('node', [targetBin, 'review', '--json'], targetRepo));
  const verifyWork = JSON.parse(run('node', [targetBin, 'verify-work', '--checks', 'Manual smoke review', '--status', 'warn', '--json'], targetRepo));
  const approvalPlan = JSON.parse(run('node', [targetBin, 'approval', 'plan', '--json'], targetRepo));
  run('node', [targetBin, 'approvals', 'grant', '--target', 'migrations', '--reason', 'Manual migration review completed'], targetRepo);
  const shipReadiness = JSON.parse(run('node', [targetBin, 'ship-readiness', '--json'], targetRepo));
  const evidence = JSON.parse(run('node', [targetBin, 'evidence', '--json'], targetRepo));

  assert.ok(review.blockers.length >= 1);
  assert.equal(verifyShell.verdict, 'pass');
  assert.equal(verifyBrowser.verdict, 'pass');
  assert.ok(fs.existsSync(path.join(targetRepo, verifyWork.artifacts.json)));
  assert.ok(verifyWork.fixPlan.length >= 1);
  assert.ok(approvalPlan.pending.some((item) => item.target === 'migrations'));
  assert.ok(fs.existsSync(path.join(targetRepo, shipReadiness.artifacts.json)));
  assert.equal(shipReadiness.verdict, 'blocked');
  assert.ok(evidence.nodes.some((node) => node.kind === 'question'));
  assert.ok(evidence.nodes.some((node) => node.kind === 'assumption'));
  assert.ok(evidence.nodes.some((node) => node.kind === 'review_finding'));
  assert.ok(evidence.nodes.some((node) => node.kind === 'verify_work'));
  assert.ok(evidence.nodes.some((node) => node.kind === 'ship_readiness'));
  assert.ok(evidence.nodes.some((node) => node.kind === 'approval'));
});

test('roadmap-compatible wrappers and aliases are scriptable', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M51',
      '--name', 'Wrapper audit',
      '--goal', 'Exercise roadmap wrapper commands',
    ],
    targetRepo,
  );

  const discuss = JSON.parse(run('node', [targetBin, 'discuss', '--goal', 'Clarify wrapper behavior', '--json'], targetRepo));
  run('node', [targetBin, 'assumptions', 'add', 'Wrapper aliases should stay stable', '--impact', 'medium', '--exit-trigger', 'Regression tests pass'], targetRepo);
  const backlog = JSON.parse(run('node', [targetBin, 'backlog', 'park', 'Defer dashboard polish until after trust parity', '--json'], targetRepo));
  const validationMap = JSON.parse(run('node', [targetBin, 'validation-map', '--json'], targetRepo));
  const subagents = JSON.parse(run('node', [targetBin, 'subagents', 'plan', '--goal', 'review the diff', '--json'], targetRepo));
  run('node', [targetBin, 'verify-work', '--status', 'fail', '--checks', 'Manual gate failed'], targetRepo);
  const nextFromGap = JSON.parse(run('node', [targetBin, 'next', '--from-gap', '--json'], targetRepo));
  const hud = run('node', [targetBin, 'hud', '--compact', '--intent', '--cost', '--risk'], targetRepo);
  const approval = JSON.parse(run('node', [targetBin, 'approval', 'plan', '--json'], targetRepo));

  assert.ok(fs.existsSync(path.join(targetRepo, discuss.artifacts.markdown)));
  assert.equal(backlog.action, 'park');
  assert.ok(Array.isArray(validationMap.checks));
  assert.ok(subagents.suggestedPlan.length >= 1);
  assert.equal(nextFromGap.recommendation.command, 'rai verify-work');
  assert.match(hud, /intent=|cost=|risk=/);
  assert.ok(['pass', 'warn'].includes(approval.verdict));
});
