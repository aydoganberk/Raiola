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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase15-'));
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

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8');
}

test('roadmap daily-intent and trust surfaces work end-to-end', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const codex = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'codex', 'setup', '--repo', '--json'], targetRepo));
  const intent = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'do', 'investigate audit drift', '--json'], targetRepo));
  const note = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'note', 'Remember this task', '--promote', 'backlog', '--json'], targetRepo));
  const thread = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'thread', 'open', 'audit-loop', '--json'], targetRepo));
  const question = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'questions', 'add', 'Why is the plan gate stale?', '--json'], targetRepo));
  const shellVerify = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'cwf.js'), 'verify-shell', '--cmd', 'node -e "console.log(\'ok\')"', '--json'],
    targetRepo,
  ));
  const claim = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'cwf.js'),
      'claims',
      'add',
      'Shell verify passes',
      '--evidence',
      shellVerify.artifacts.meta,
      '--json',
    ],
    targetRepo,
  ));
  const secure = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'secure', '--json'], targetRepo));
  const packetLock = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'packet', 'lock', '--step', 'plan', '--json'], targetRepo));
  const packetVerify = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'packet', 'verify', '--step', 'plan', '--json'], targetRepo));
  const evidence = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'evidence', '--json'], targetRepo));

  assert.match(codex.configFile, /codex-control\/repo-codex\/config\.toml$/);
  assert.ok(codex.roles.length >= 2);
  assert.equal(intent.previewFirst, true);
  assert.ok(intent.suggestedCommands.includes('cwf packet compile'));
  assert.ok(fs.existsSync(path.join(targetRepo, note.inbox)));
  assert.ok(fs.existsSync(path.join(targetRepo, note.promotedTo)));
  assert.match(thread.file, /THREADS\/audit-loop\.md$/);
  assert.equal(question.action, 'add');
  assert.equal(claim.action, 'add');
  assert.equal(secure.verdict, 'pass');
  assert.equal(packetLock.action, 'lock');
  assert.equal(packetVerify.verdict, 'pass');
  assert.ok(evidence.coverage.claimCount >= 1);
});

test('codex control-plane lifecycle stays rollback-safe and scriptable', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const diff = JSON.parse(run('node', [targetBin, 'codex', 'diff-config', '--repo', '--json'], targetRepo));
  const doctor = JSON.parse(run('node', [targetBin, 'codex', 'doctor', '--repo', '--json'], targetRepo));
  const roles = JSON.parse(run('node', [targetBin, 'codex', 'roles', '--json'], targetRepo));
  const prompts = JSON.parse(run('node', [targetBin, 'codex', 'prompts', '--json'], targetRepo));
  const scaffold = JSON.parse(run('node', [targetBin, 'codex', 'scaffold-role', '--from', 'repo-profile', '--json'], targetRepo));
  const installSkill = JSON.parse(run('node', [targetBin, 'codex', 'install-skill', '--role', 'reviewer', '--json'], targetRepo));

  assert.equal(setup.action, 'setup');
  assert.equal(diff.changed, false);
  assert.equal(doctor.verdict, 'pass');
  assert.ok(roles.roles.length >= 2);
  assert.ok(prompts.prompts.length >= 3);
  assert.ok(scaffold.roles.length >= roles.roles.length);
  assert.ok(fs.existsSync(path.join(targetRepo, installSkill.file)));

  fs.writeFileSync(path.join(targetRepo, setup.configFile), 'workflow = { broken');
  const brokenDoctor = JSON.parse(run('node', [targetBin, 'codex', 'doctor', '--repo', '--json'], targetRepo));
  const repair = JSON.parse(run('node', [targetBin, 'codex', 'repair', '--repo', '--json'], targetRepo));
  const removeSkill = JSON.parse(run('node', [targetBin, 'codex', 'remove-skill', '--role', 'reviewer', '--json'], targetRepo));
  const uninstall = JSON.parse(run('node', [targetBin, 'codex', 'uninstall', '--repo', '--json'], targetRepo));
  const rollback = JSON.parse(run('node', [targetBin, 'codex', 'rollback', '--repo', '--json'], targetRepo));
  const finalDoctor = JSON.parse(run('node', [targetBin, 'codex', 'doctor', '--repo', '--json'], targetRepo));

  assert.ok(['warn', 'fail'].includes(brokenDoctor.verdict));
  assert.equal(repair.repaired, true);
  assert.equal(repair.sync.action, 'sync');
  assert.equal(removeSkill.removed, true);
  assert.equal(uninstall.removed, true);
  assert.equal(rollback.restored, true);
  assert.equal(finalDoctor.verdict, 'pass');
});

test('roadmap governance and operator-center surfaces stay scriptable', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const policy = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'cwf.js'),
      'policy',
      'check',
      '--files',
      'package.json;docs/workflow/STATUS.md',
      '--operation',
      'edit',
      '--actor',
      'worker',
      '--json',
    ],
    targetRepo,
  ));
  const approval = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'bin', 'cwf.js'), 'approvals', 'grant', '--target', 'config', '--reason', 'Allow package edits', '--json'],
    targetRepo,
  ));
  const hooks = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'hooks', 'init', '--json'], targetRepo));
  const mcp = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'mcp', 'status', '--json'], targetRepo));
  const notify = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'notify', 'test', '--json'], targetRepo));
  const daemon = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'daemon', 'restart', '--json'], targetRepo));
  const incident = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'cwf.js'),
      'incident',
      'open',
      '--title',
      'verify-regression',
      '--summary',
      'Need a repair recipe',
      '--command',
      'cwf verify-browser',
      '--json',
    ],
    targetRepo,
  ));
  const fleet = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'fleet', 'status', '--json'], targetRepo));
  const sessions = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'sessions', '--json'], targetRepo));
  const gc = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'gc', '--keep', '1', '--json'], targetRepo));

  assert.equal(policy.results.length, 2);
  assert.ok(['warn', 'fail', 'pass'].includes(policy.verdict));
  assert.match(policy.canonicalFile, /docs\/workflow\/POLICY\.md$/);
  assert.equal(approval.grant.target, 'config');
  assert.match(approval.file, /docs\/workflow\/POLICY\.md$/);
  assert.match(readFile(targetRepo, 'docs/workflow/POLICY.md'), /Allow package edits/);
  assert.equal(JSON.parse(readFile(targetRepo, '.workflow/runtime/approvals.json')).grants.length, 1);
  assert.equal(hooks.action, 'init');
  assert.equal(mcp.manifest.enabled, false);
  assert.equal(notify.event.event, 'test');
  assert.equal(daemon.daemon.running, true);
  assert.ok(daemon.daemon.caches.fsIndex.fileCount >= 1);
  assert.ok(daemon.daemon.caches.symbolGraph.symbolCount >= 0);
  assert.match(incident.file, /verify-regression\.md$/);
  assert.ok(fleet.workspaceCount >= 1);
  assert.equal(sessions.workflow.milestone, 'NONE');
  assert.ok(Array.isArray(gc.removed));
});

test('hybrid team runtime, browser adapter, and patch surfaces produce artifacts', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'init', '--target', targetRepo, '--skip-verify'], repoRoot);
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M30',
      '--name', 'Roadmap runtime',
      '--goal', 'Exercise the roadmap runtime surfaces',
    ],
    targetRepo,
  );

  const statusPath = path.join(targetRepo, 'docs', 'workflow', 'STATUS.md');
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md')
    .replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`');
  fs.writeFileSync(statusPath, statusDoc);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'ready for roadmap runtime'], targetRepo);

  const runtime = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'cwf.js'),
      'team',
      'run',
      '--adapter',
      'hybrid',
      '--policy',
      'strict',
      '--activation-text',
      'parallel yap',
      '--write-scope',
      'docs/workflow/STATUS.md;docs/workflow/CONTEXT.md',
      '--json',
    ],
    targetRepo,
  ));
  const dispatched = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'dispatch', '--json'], targetRepo));
  const workspaceEntry = Object.entries(dispatched.workspaces)[0];
  assert.ok(workspaceEntry);
  const [taskId, workspace] = workspaceEntry;
  const workspacePath = path.resolve(targetRepo, workspace.path);
  fs.writeFileSync(
    path.join(workspacePath, '.workflow-task-result.md'),
    `# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Finished ${taskId}\`
- Evidence: \`manual smoke\`

## Details

- \`Completed in adapter workspace\`

## Next

- \`Return to manager\`
`,
  );

  const collected = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'collect', '--json'], targetRepo));
  const mailbox = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'mailbox', '--json'], targetRepo));
  const timeline = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'timeline', '--json'], targetRepo));
  const patches = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'patch-review', '--json'], targetRepo));

  const previewPath = path.join(targetRepo, 'preview.html');
  fs.writeFileSync(previewPath, '<!doctype html><html><body><main id="root">ready</main></body></html>');
  const browser = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'bin', 'cwf.js'),
      'verify-browser',
      '--adapter',
      'playwright',
      '--url',
      previewPath,
      '--assert',
      'main',
      '--json',
    ],
    targetRepo,
  ));

  assert.equal(runtime.adapter, 'hybrid');
  assert.equal(runtime.policy, 'strict');
  assert.ok(collected.collectedTasks.includes(taskId));
  assert.ok(mailbox.entries.length >= 1);
  assert.ok(timeline.entries.length >= 2);
  assert.ok(patches.patches.length >= 1);
  assert.equal(browser.adapter, 'playwright');
  assert.equal(browser.selectorAssertion.matched, true);
});
