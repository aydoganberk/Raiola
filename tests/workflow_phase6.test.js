const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase6-'));
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

function runExpectError(command, args, cwd) {
  try {
    run(command, args, cwd);
    return null;
  } catch (error) {
    return error;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceField(content, label, value) {
  const pattern = new RegExp(`^- ${escapeRegex(label)}: \`.*?\`$`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing field: ${label}`);
  }
  return content.replace(pattern, `- ${label}: \`${value}\``);
}

function replaceSection(content, heading, body) {
  const pattern = new RegExp(`(^## ${escapeRegex(heading)}\\n)([\\s\\S]*?)(?=^## [^\\n]+\\n|(?![\\s\\S]))`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing section: ${heading}`);
  }
  return content.replace(pattern, `$1${body.trimEnd()}\n\n`);
}

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8');
}

function writeFile(targetRepo, relativePath, content) {
  fs.writeFileSync(path.join(targetRepo, relativePath), content);
}

function initGitRepo(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['checkout', '-b', 'main'], targetRepo);
  run('git', ['config', 'user.name', 'Codex Tester'], targetRepo);
  run('git', ['config', 'user.email', 'codex@example.com'], targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'init'], targetRepo);
}

test('workflow:workstreams progress shows stale and budget-out streams in one command', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const workstreamsScript = path.join(targetRepo, 'scripts', 'workflow', 'workstreams.js');
  const packetScript = path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js');

  run('node', [workstreamsScript, 'create', '--name', 'alpha'], targetRepo);
  run('node', [workstreamsScript, 'create', '--name', 'beta'], targetRepo);

  let alphaExecplan = readFile(targetRepo, 'docs/alpha/EXECPLAN.md');
  alphaExecplan = replaceSection(alphaExecplan, 'Delivery Core', `
- Promised scope: \`Open the first milestone if workflow is explicitly requested\`
- Finished since last checkpoint: \`None\`
- Remaining scope: \`Open the first milestone if needed\`
- Drift from plan: \`alpha drift was introduced without syncing the packet\`
- Next one action: \`Open the first milestone if workflow is explicitly requested\`
- Current run chunk: \`NONE\`
- Completed items: \`None\`
- Touched files: \`None\`
- Verify command: \`node scripts/workflow/doctor.js --strict\`
- Active risks: \`Alpha stream packet drift is intentionally unsynced for the test\`
`);
  writeFile(targetRepo, 'docs/alpha/EXECPLAN.md', alphaExecplan);

  let betaExecplan = readFile(targetRepo, 'docs/beta/EXECPLAN.md');
  betaExecplan = replaceField(betaExecplan, 'Target input tokens', '10');
  writeFile(targetRepo, 'docs/beta/EXECPLAN.md', betaExecplan);
  run('node', [packetScript, '--root', 'docs/beta', '--all', '--sync'], targetRepo);

  const progress = run('node', [workstreamsScript, 'progress'], targetRepo);
  const status = JSON.parse(run('node', [workstreamsScript, 'status', '--json'], targetRepo));

  assert.match(progress, /beta:warn|beta:critical/);
  assert.match(progress, /Stale: `alpha:/);
  assert.ok(status.budgetOut.some((row) => row.name === 'beta'));
  assert.ok(status.stale.some((row) => row.name === 'alpha'));
  assert.ok(!status.stale.some((row) => row.name === 'beta'));
  assert.equal(status.active.name, 'workflow');
});

test('workstream name rejects traversal and unsafe characters', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const workstreamsScript = path.join(targetRepo, 'scripts', 'workflow', 'workstreams.js');

  assert.throws(() => {
    run('node', [workstreamsScript, 'create', '--name', '../escape-here'], targetRepo);
  }, /Invalid workstream name/);

  assert.throws(() => {
    run('node', [workstreamsScript, 'create', '--name', 'with/slash'], targetRepo);
  }, /Invalid workstream name/);

  assert.throws(() => {
    run('node', [workstreamsScript, 'create', '--name', 'bad$name'], targetRepo);
  }, /Invalid workstream name/);
});

test('team mode makes health strict by default and resume output reflects that', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  initGitRepo(targetRepo);

  const workstreamsScript = path.join(targetRepo, 'scripts', 'workflow', 'workstreams.js');
  const healthScript = path.join(targetRepo, 'scripts', 'workflow', 'health.js');

  let prefs = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  prefs = replaceField(prefs, 'Workflow mode', 'team');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', prefs);

  run('node', [workstreamsScript, 'create', '--name', 'team-stream'], targetRepo);
  run('node', [workstreamsScript, 'switch', '--name', 'team-stream'], targetRepo);

  let statusDoc = readFile(targetRepo, 'docs/team-stream/STATUS.md');
  statusDoc = replaceField(statusDoc, 'Current milestone', 'M9');
  writeFile(targetRepo, 'docs/team-stream/STATUS.md', statusDoc);

  let execplanDoc = readFile(targetRepo, 'docs/team-stream/EXECPLAN.md');
  execplanDoc = replaceField(execplanDoc, 'Active milestone', 'M0');
  writeFile(targetRepo, 'docs/team-stream/EXECPLAN.md', execplanDoc);

  const healthFailure = runExpectError('node', [healthScript, '--root', 'docs/team-stream'], targetRepo);
  assert.ok(healthFailure);
  assert.equal(healthFailure.status, 1);

  const planCheckFailure = runExpectError('node', [path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js'), '--root', 'docs/team-stream', '--json'], targetRepo);
  assert.ok(planCheckFailure);
  assert.equal(planCheckFailure.status, 1);

  const resumeOutput = run('node', [workstreamsScript, 'resume', '--name', 'team-stream'], targetRepo);
  assert.ok(resumeOutput.includes('workflow:health -- --strict --root docs/team-stream'));

  const completeOutput = run('node', [workstreamsScript, 'complete', '--name', 'team-stream'], targetRepo);
  assert.ok(completeOutput.includes('workflow:health -- --strict'));
});

test('team mode enforces unique milestone ids and branch isolation during workstream switch', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  initGitRepo(targetRepo);

  const workstreamsScript = path.join(targetRepo, 'scripts', 'workflow', 'workstreams.js');
  const newMilestoneScript = path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js');

  let defaultPrefs = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  defaultPrefs = replaceField(defaultPrefs, 'Workflow mode', 'team');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', defaultPrefs);

  run('node', [workstreamsScript, 'create', '--name', 'team-stream'], targetRepo);

  let streamPrefs = readFile(targetRepo, 'docs/team-stream/PREFERENCES.md');
  streamPrefs = replaceField(streamPrefs, 'Workflow mode', 'team');
  streamPrefs = replaceField(streamPrefs, 'Auto push', 'true');
  streamPrefs = replaceField(streamPrefs, 'Git isolation', 'none');
  streamPrefs = replaceField(streamPrefs, 'Unique milestone ids', 'false');
  streamPrefs = replaceField(streamPrefs, 'Health strict required', 'false');
  writeFile(targetRepo, 'docs/team-stream/PREFERENCES.md', streamPrefs);

  const switchPayload = JSON.parse(run('node', [workstreamsScript, 'switch', '--name', 'team-stream', '--json'], targetRepo));
  const branchName = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], targetRepo).trim();

  assert.equal(switchPayload.isolation.mode, 'branch');
  assert.equal(branchName, 'codex/team-stream');

  run(
    'node',
    [newMilestoneScript, '--root', 'docs/team-stream', '--id', 'M6', '--name', 'Team stream', '--goal', 'Verify enforced team preset'],
    targetRepo,
  );

  const statusDoc = readFile(targetRepo, 'docs/team-stream/STATUS.md');
  assert.match(statusDoc, /^- Current milestone: `M6-[a-z0-9]{6} - Team stream`$/m);
});

test('workflow:ensure-isolation provisions a real worktree checkout', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  initGitRepo(targetRepo);

  const isolationScript = path.join(targetRepo, 'scripts', 'workflow', 'ensure_isolation.js');
  const payload = JSON.parse(run('node', [isolationScript, '--mode', 'worktree', '--json'], targetRepo));

  assert.equal(payload.status, 'pass');
  assert.equal(payload.mode, 'worktree');
  assert.ok(fs.existsSync(payload.worktreePath));
  assert.ok(fs.existsSync(path.join(payload.worktreePath, 'docs', 'workflow', 'WORKSTREAMS.md')));
  assert.equal(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], payload.worktreePath).trim(), payload.branchName);
});

test('plan and health gates require falsification pass and valid reasoning profiles', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const newMilestoneScript = path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js');
  const planCheckScript = path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js');
  const healthScript = path.join(targetRepo, 'scripts', 'workflow', 'health.js');
  const packetScript = path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js');

  run(
    'node',
    [newMilestoneScript, '--id', 'M6', '--name', 'Phase 6', '--goal', 'Enforce packet-quality additions'],
    targetRepo,
  );

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceField(execplanDoc, 'Reasoning profile', 'turbo');
  execplanDoc = replaceSection(execplanDoc, 'What Would Falsify This Plan?', '');
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  let validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  validationDoc = replaceSection(validationDoc, 'What Would Falsify This Plan?', '');
  writeFile(targetRepo, 'docs/workflow/VALIDATION.md', validationDoc);

  const packet = JSON.parse(run('node', [packetScript, '--step', 'plan', '--json'], targetRepo));
  const planReport = JSON.parse(run('node', [planCheckScript, '--json'], targetRepo));
  const healthReport = JSON.parse(run('node', [healthScript, '--json'], targetRepo));

  assert.equal(packet.reasoningProfileRaw, 'turbo');
  assert.equal(packet.reasoningProfile, 'deep');
  assert.equal(planReport.gates.falsification, 'fail');
  assert.ok(healthReport.checks.some((check) => check.message.includes('execplan reasoning profile')));
  assert.ok(healthReport.checks.some((check) => check.message.includes('execplan must name what would falsify the current plan')));
  assert.ok(healthReport.checks.some((check) => check.message.includes('validation must name what would falsify the current plan')));
});
