const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const setupScript = path.join(repoRoot, 'scripts', 'workflow', 'setup.js');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');
const cwfBin = path.join(repoRoot, 'bin', 'rai.js');
const helpGolden = path.join(repoRoot, 'tests', 'golden', 'workflow', 'rai-help.txt');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase12-'));
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

function normalizeText(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8');
}

function writeFile(targetRepo, relativePath, content) {
  fs.writeFileSync(path.join(targetRepo, relativePath), content);
}

test('rai help and setup expose the product shell while uninstall keeps canonical docs safe', () => {
  const targetRepo = makeTempRepo();
  const helpOutput = run('node', [cwfBin, 'help'], repoRoot);
  const lifecycleHelp = run('node', [cwfBin, 'help', 'lifecycle'], repoRoot);
  const reviewHelp = run('node', [cwfBin, 'help', 'review'], repoRoot);
  const categoriesHelp = run('node', [cwfBin, 'help', 'categories'], repoRoot);
  const fullHelp = run('node', [cwfBin, 'help', 'all'], repoRoot);
  const expectedHelp = fs.readFileSync(helpGolden, 'utf8');

  assert.equal(normalizeText(helpOutput).trim(), normalizeText(expectedHelp).trim());
  assert.match(lifecycleHelp, /raiola Lifecycle/);
  assert.match(lifecycleHelp, /rai simplify/);
  assert.match(reviewHelp, /raiola Deep Review/);
  assert.match(reviewHelp, /rai review --heatmap/);
  assert.match(categoriesHelp, /solo/);
  assert.match(categoriesHelp, /runtime/);
  assert.match(fullHelp, /raiola Full Command Reference/);
  assert.match(fullHelp, /rai milestone/);
  assert.match(fullHelp, /## Lifecycle/);

  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  const manifest = JSON.parse(readFile(targetRepo, '.workflow/product-manifest.json'));
  const gitignore = readFile(targetRepo, '.gitignore');
  assert.equal(manifest.scriptProfile, 'pilot');
  assert.equal(manifest.runtimeSurfaceProfile, 'pilot');
  assert.ok(manifest.skillPackPaths.includes('.agents/skills/using-raiola/SKILL.md'));
  assert.equal(packageJson.scripts['raiola:quick'], 'node scripts/workflow/quick.js');
  assert.equal(packageJson.scripts['raiola:review'], 'node scripts/workflow/review.js');
  assert.equal(packageJson.scripts['raiola:setup'], 'node scripts/workflow/setup.js');
  assert.equal(packageJson.scripts['raiola:spec'], 'node scripts/workflow/spec.js');
  assert.equal(packageJson.scripts['raiola:plan'], 'node scripts/workflow/plan.js');
  assert.equal(packageJson.scripts['raiola:build'], 'node scripts/workflow/build.js');
  assert.equal(packageJson.scripts['raiola:test'], 'node scripts/workflow/test.js');
  assert.equal(packageJson.scripts['raiola:simplify'], 'node scripts/workflow/simplify.js');
  assert.equal(packageJson.scripts['raiola:update'], 'node scripts/workflow/update.js');
  assert.equal(packageJson.scripts['raiola:uninstall'], 'node scripts/workflow/uninstall.js');
  assert.equal(packageJson.scripts['raiola:notify'], undefined);
  assert.equal(packageJson.scripts['raiola:assumptions'], undefined);
  assert.equal(packageJson.scripts.rai, 'node bin/rai.js');
  assert.equal(packageJson.scripts['raiola-on'], 'node bin/raiola-on.js');
  assert.match(gitignore, /\.workflow\//);
  assert.match(gitignore, /\.agents\//);
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'quick.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'setup.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'spec.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'notify.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'ui_direction.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'cli', 'rai.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'bin', 'rai.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, 'bin', 'raiola-on.js')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'VERSION.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.agents', 'skills', 'using-raiola', 'SKILL.md')));
  const onboardingPayload = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'raiola-on.js'), 'next', '--json'], targetRepo));
  assert.equal(onboardingPayload.status, 'ready_for_milestone');
  assert.match(onboardingPayload.command, /rai milestone --id M1/);
  const pilotHelp = run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'help'], targetRepo);
  assert.match(pilotHelp, /Focused install/i);
  assert.match(pilotHelp, /pilot/);
  assert.match(pilotHelp, /rai help lifecycle/);
  assert.match(pilotHelp, /simplify\s+Simplify code without changing behavior/);
  assert.doesNotMatch(pilotHelp, /rai help review/);
  const filteredHelp = run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'help', 'all'], targetRepo);
  assert.match(filteredHelp, /rai milestone/);
  assert.match(filteredHelp, /## Lifecycle/);
  assert.doesNotMatch(filteredHelp, /notify/);
  assert.doesNotMatch(filteredHelp, /Frontend/);

  const specPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'spec', '--goal', 'ship safer slices', '--json'],
    targetRepo,
  ));
  assert.equal(specPayload.command, 'spec');
  assert.equal(specPayload.reportPath, '.workflow/reports/spec-guide.md');
  assert.ok(specPayload.skills.includes('using-raiola'));

  const unavailable = childProcess.spawnSync(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'notify'],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /not installed in this repo's current shell/i);
  assert.match(unavailable.stderr, /rai update --script-profile core/);

  const uninstallPayload = JSON.parse(run('node', [cwfBin, 'uninstall', '--target', targetRepo, '--json'], repoRoot));
  assert.ok(fs.existsSync(path.join(targetRepo, 'docs', 'workflow', 'STATUS.md')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'quick.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'setup.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'cli', 'rai.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'bin', 'rai.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, 'bin', 'raiola-on.js')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflow', 'product-manifest.json')));
  assert.ok(!fs.existsSync(path.join(targetRepo, '.workflow', 'VERSION.md')));
  assert.ok(uninstallPayload.removed.some((item) => normalizePath(item).endsWith('scripts/workflow/quick.js')));

  const packageJsonAfter = JSON.parse(readFile(targetRepo, 'package.json'));
  assert.equal(packageJsonAfter.scripts['raiola:quick'], undefined);
  assert.equal(packageJsonAfter.scripts['raiola:setup'], undefined);
  assert.equal(packageJsonAfter.scripts['raiola:spec'], undefined);

  run('node', [cwfBin, 'uninstall', '--target', targetRepo], repoRoot);
});

test('raiola:update can contract a full install down to the pilot surface', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo, '--script-profile', 'full', '--skip-verify'], repoRoot);

  const fullManifest = JSON.parse(readFile(targetRepo, '.workflow/product-manifest.json'));
  assert.ok(fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'notify.js')));
  assert.equal(fullManifest.scriptProfile, 'full');
  assert.equal(typeof fullManifest.installerSourceRoot, 'string');

  run(
    'node',
    [path.join(targetRepo, 'bin', 'rai.js'), 'update', '--script-profile', 'pilot', '--skip-verify'],
    targetRepo,
  );

  const pilotManifest = JSON.parse(readFile(targetRepo, '.workflow/product-manifest.json'));
  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  assert.equal(pilotManifest.scriptProfile, 'pilot');
  assert.equal(pilotManifest.runtimeSurfaceProfile, 'pilot');
  assert.ok(pilotManifest.runtimeFiles.length < fullManifest.runtimeFiles.length);
  assert.ok(!fs.existsSync(path.join(targetRepo, 'scripts', 'workflow', 'notify.js')));
  assert.equal(packageJson.scripts['raiola:notify'], undefined);
  assert.equal(packageJson.scripts['raiola:quick'], 'node scripts/workflow/quick.js');
});

test('rai milestone opens a full-workflow milestone without npm script indirection', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  run(
    'node',
    [cwfBin, 'milestone', '--id', 'M14', '--name', 'CLI milestone', '--goal', 'Open milestone from the product shell'],
    targetRepo,
  );

  const milestonesDoc = readFile(targetRepo, 'docs/workflow/MILESTONES.md');
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');

  assert.match(milestonesDoc, /\| M14 \| CLI milestone \|/);
  assert.match(statusDoc, /- Current milestone: `M14 - CLI milestone`/);
});

test('raiola:doctor audits install-surface drift and suggests fix commands', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  delete packageJson.scripts['raiola:quick'];
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.writeFileSync(path.join(targetRepo, '.gitignore'), '# test-only gitignore\n');
  fs.rmSync(path.join(targetRepo, '.agents', 'skills', 'raiola', 'SKILL.md'));
  fs.rmSync(path.join(targetRepo, '.workflow', 'VERSION.md'));

  const result = childProcess.spawnSync(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'doctor.js'), '--strict'],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Package scripts -> missing=raiola:quick/);
  assert.match(result.stdout, /fix: `rai update --overwrite-scripts`/);
  assert.match(result.stdout, /Gitignore hygiene -> missing \.workflow\/, \.agents\//);
  assert.match(result.stdout, /Skill surface -> \.agents\/skills\/raiola\/SKILL\.md is missing/);
  assert.match(result.stdout, /Product version marker -> \.workflow\/VERSION\.md is missing/);
  assert.match(result.stdout, /fix: `rai update`/);
});

test('raiola:quick start and close keep markdown artifacts visible', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const startPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'quick.js'), 'start', '--goal', 'Fix a narrow issue', '--json'],
    targetRepo,
  ));

  assert.equal(startPayload.session.status, 'active');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'quick', 'context.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'quick', 'plan.md')));

  run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'quick.js'), 'close', '--summary', 'Quick task completed', '--verify', 'Manual smoke passed'],
    targetRepo,
  );

  const session = JSON.parse(readFile(targetRepo, '.workflow/quick/session.json'));
  const verifyDoc = readFile(targetRepo, '.workflow/quick/verify.md');
  const handoffDoc = readFile(targetRepo, '.workflow/quick/handoff.md');

  assert.equal(session.status, 'closed');
  assert.match(verifyDoc, /- Status: `pass`/);
  assert.match(handoffDoc, /- Status: `closed`/);
  assert.match(handoffDoc, /Quick task completed/);
});

test('raiola:quick escalation can open a full milestone and sync intake into canonical docs', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'quick.js'), 'start', '--goal', 'Grow this into a milestone'],
    targetRepo,
  );

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'quick.js'),
      'escalate',
      '--summary', 'This task now needs a real plan',
      '--open-full-workflow',
      '--milestone-id', 'Q12',
      '--milestone-name', 'Quick escalation',
      '--milestone-goal', 'Promote the quick task into full workflow',
    ],
    targetRepo,
  );

  const session = JSON.parse(readFile(targetRepo, '.workflow/quick/session.json'));
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const milestonesDoc = readFile(targetRepo, 'docs/workflow/MILESTONES.md');

  assert.equal(session.status, 'escalated');
  assert.match(contextDoc, /## Quick Escalation Intake/);
  assert.match(contextDoc, /This task now needs a real plan/);
  assert.match(milestonesDoc, /\| Q12 \|/);
});

test('raiola:team wrapper writes canonical orchestration files and supports pause/resume', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M12',
      '--name', 'Team wrapper',
      '--goal', 'Exercise team orchestration',
    ],
    targetRepo,
  );

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = statusDoc.replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'team.js'),
      'start',
      '--parallel',
      '--activation-text', 'parallel yap',
      '--write-scope', 'scripts/workflow/common.js;tests/workflow_phase1.test.js',
    ],
    targetRepo,
  );

  const orchestrationDir = path.join(targetRepo, '.workflow', 'orchestration');
  assert.ok(fs.existsSync(path.join(orchestrationDir, 'PLAN.md')));
  assert.ok(fs.existsSync(path.join(orchestrationDir, 'STATUS.md')));
  assert.ok(fs.existsSync(path.join(orchestrationDir, 'WAVES.md')));
  assert.ok(fs.existsSync(path.join(orchestrationDir, 'RESULTS.md')));

  const paused = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team.js'), 'stop', '--summary', 'Pause here', '--json'],
    targetRepo,
  ));
  assert.equal(paused.paused, true);

  const resumed = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team.js'), 'resume', '--json'],
    targetRepo,
  ));
  assert.equal(resumed.paused, false);
});

test('review, ship, pr brief, release notes, and session report emit report files', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M13',
      '--name', 'Lifecycle reports',
      '--goal', 'Generate closeout packages',
    ],
    targetRepo,
  );

  const commands = [
    ['review.js', 'review.md', '# REVIEW READY'],
    ['ship.js', 'ship.md', '# SHIP READY'],
    ['pr_brief.js', 'pr-brief.md', '# PR BRIEF'],
    ['release_notes.js', 'release-notes.md', '# RELEASE NOTES DRAFT'],
    ['session_report.js', 'session-report.md', '# SESSION REPORT'],
  ];

  for (const [scriptName, fileName, heading] of commands) {
    const payload = JSON.parse(run(
      'node',
      [path.join(targetRepo, 'scripts', 'workflow', scriptName), '--json'],
      targetRepo,
    ));
    const content = readFile(targetRepo, `.workflow/reports/${fileName}`);
    assert.ok(payload.outputPathRelative.endsWith(fileName));
    assert.match(content, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('raiola:benchmark reports timings and cache counters', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'benchmark.js'), '--commands', 'hud,doctor', '--runs', '1', '--json'],
    targetRepo,
  ));

  assert.equal(payload.results.length, 2);
  assert.equal(payload.results[0].command, 'hud');
  assert.ok(payload.results[0].lastMetrics.counters.file_read_requests >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'benchmarks', 'latest.json')));
});

test('raiola:benchmark can enforce SLO thresholds in machine-readable mode', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const passing = childProcess.spawnSync(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'benchmark.js'),
      '--commands', 'hud',
      '--runs', '1',
      '--assert-slo',
      '--thresholds', 'hud=5000',
      '--json',
    ],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.equal(passing.status, 0);
  assert.equal(JSON.parse(passing.stdout).slo.passed, true);

  const failing = childProcess.spawnSync(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'benchmark.js'),
      '--commands', 'hud',
      '--runs', '1',
      '--assert-slo',
      '--thresholds', 'hud=1',
      '--json',
    ],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.equal(failing.status, 1);
  const failingPayload = JSON.parse(failing.stdout);
  assert.equal(failingPayload.slo.passed, false);
  assert.equal(failingPayload.slo.failures[0].command, 'hud');
});

test('raiola:benchmark covers documented launch, manager, and next-prompt targets', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const payload = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'benchmark.js'),
      '--commands', 'launch,manager,next-prompt',
      '--runs', '1',
      '--json',
    ],
    targetRepo,
  ));

  assert.equal(payload.results.length, 3);
  assert.deepEqual(payload.results.map((item) => item.command), ['launch', 'manager', 'next-prompt']);
  assert.ok(payload.results.every((item) => typeof item.warmMedianMs === 'number'));
});

test('raiola:benchmark covers codex-specific contextpack and promptpack hot paths', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const payload = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'benchmark.js'),
      '--commands', 'codex-contextpack,codex-promptpack',
      '--runs', '1',
      '--json',
    ],
    targetRepo,
  ));

  assert.equal(payload.results.length, 2);
  assert.deepEqual(payload.results.map((item) => item.command), ['codex-contextpack', 'codex-promptpack']);
  assert.ok(payload.results.every((item) => typeof item.warmMedianMs === 'number'));
});
