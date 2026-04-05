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

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase14-'));
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

function writeFile(targetRepo, relativePath, content) {
  fs.writeFileSync(path.join(targetRepo, relativePath), content);
}

test('launch, manager, next-prompt, explore, route, profile, and workspaces expose runtime companion surfaces', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const launch = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'launch', '--json'], targetRepo));
  const hud = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'hud', '--json'], targetRepo));
  const manager = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'manager', '--json'], targetRepo));
  const nextPrompt = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'next-prompt', '--json'], targetRepo));
  const explore = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'explore', '--changed', '--json'], targetRepo));
  const route = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'route', '--json'], targetRepo));
  const profile = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'profile', '--json'], targetRepo));
  const workspaces = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'workspaces', '--json'], targetRepo));

  assert.equal(launch.runtimeFile, '.workflow/runtime/launch.json');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'launch.json')));
  assert.equal(hud.runtimeFileRelative, '.workflow/runtime/hud.json');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'hud.json')));
  assert.equal(manager.runtimeFile, '.workflow/runtime/manager.json');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'manager.json')));
  assert.equal(nextPrompt.filePath, '.workflow/runtime/next-prompt.md');
  assert.match(nextPrompt.prompt, /# NEXT PROMPT/);
  assert.equal(explore.mode, 'changed');
  assert.ok(Array.isArray(explore.relatedFiles));
  assert.ok(['fast', 'balanced', 'deep'].includes(route.recommendedPreset));
  assert.equal(profile.workflowProfile, 'standard');
  assert.equal(workspaces.activeName, 'workflow');
});

test('verify-shell and verify-browser store normalized evidence artifacts', async () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const shellPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'verify_shell.js'), '--cmd', 'node -e "console.log(\'ok\')"', '--json'],
    targetRepo,
  ));

  assert.equal(shellPayload.verdict, 'pass');
  assert.ok(fs.existsSync(path.join(targetRepo, shellPayload.artifacts.stdout)));
  assert.ok(fs.existsSync(path.join(targetRepo, shellPayload.artifacts.stderr)));

  const previewPath = path.join(targetRepo, 'preview.html');
  fs.writeFileSync(previewPath, '<!doctype html><html><head><title>Smoke</title></head><body><main>ready</main></body></html>');
  const browserPayload = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'verify_browser.js'),
      '--url',
      previewPath,
      '--json',
    ],
    targetRepo,
  ));

  assert.equal(browserPayload.verdict, 'pass');
  assert.equal(browserPayload.visualVerdict, 'pass');
  assert.match(browserPayload.artifacts.screenshot, /\.png$|\.svg$/);
  assert.ok(fs.existsSync(path.join(targetRepo, browserPayload.artifacts.html)));
  assert.ok(fs.existsSync(path.join(targetRepo, browserPayload.artifacts.headers)));
  assert.ok(fs.existsSync(path.join(targetRepo, browserPayload.artifacts.screenshot)));
});

test('doctor and health repair flows detect and apply safe runtime fixes', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  delete packageJson.scripts['workflow:launch'];
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.rmSync(path.join(targetRepo, '.workflow', 'VERSION.md'));
  fs.writeFileSync(path.join(targetRepo, '.workflow', 'fs-index.json'), '{broken');

  const doctorRepair = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'doctor.js'), '--repair', '--apply', '--json'],
    targetRepo,
  ));
  fs.writeFileSync(path.join(targetRepo, '.workflow', 'fs-index.json'), '{broken-again');
  const healthRepair = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'health.js'), '--repair', '--apply', '--json'],
    targetRepo,
  ));

  assert.ok(doctorRepair.repair.safeActionCount >= 2);
  assert.equal(JSON.parse(readFile(targetRepo, 'package.json')).scripts['workflow:launch'], 'node scripts/workflow/launch.js');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'VERSION.md')));
  assert.ok(healthRepair.repair.safeActionCount >= 1);
  assert.doesNotThrow(() => JSON.parse(readFile(targetRepo, '.workflow/fs-index.json')));
});

test('team runtime can run, dispatch, monitor, and collect through the worktree adapter', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M20',
      '--name', 'Team runtime',
      '--goal', 'Exercise the adapter runtime',
    ],
    targetRepo,
  );

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = statusDoc.replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'ready for team runtime'], targetRepo);

  const started = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js'),
      'run',
      '--adapter', 'worktree',
      '--activation-text', 'parallel yap',
      '--write-scope', 'docs/workflow/STATUS.md;docs/workflow/CONTEXT.md',
      '--json',
    ],
    targetRepo,
  ));
  assert.equal(started.adapter, 'worktree');

  const dispatched = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js'), 'dispatch', '--json'],
    targetRepo,
  ));
  assert.ok(dispatched.dispatchedTasks.length > 0);

  const workspaceEntry = Object.entries(dispatched.workspaces)[0];
  assert.ok(workspaceEntry);
  const [taskId, workspace] = workspaceEntry;
  const workspacePath = path.resolve(targetRepo, workspace.path);
  const resultTemplatePath = path.join(workspacePath, '.workflow-task-result.md');
  assert.ok(fs.existsSync(resultTemplatePath));

  fs.writeFileSync(resultTemplatePath, `# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Finished ${taskId}\`
- Evidence: \`manual smoke\`

## Details

- \`Implemented in child workspace\`

## Next

- \`Return to manager\`
`);

  const monitored = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js'), 'monitor', '--json'],
    targetRepo,
  ));
  assert.equal(monitored.workspaces[taskId].exists, true);

  const collected = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js'), 'collect', '--json'],
    targetRepo,
  ));
  assert.ok(collected.collectedTasks.includes(taskId));
});
