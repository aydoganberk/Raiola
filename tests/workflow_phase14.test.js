const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const { buildDoctorReport } = require('../scripts/workflow/doctor');
const { buildRepairPlan } = require('../scripts/workflow/repair');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const setupScript = path.join(repoRoot, 'scripts', 'workflow', 'setup.js');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase14-'));
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
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const launch = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'launch', '--json'], targetRepo));
  const hud = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'hud', '--json'], targetRepo));
  const manager = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'manager', '--json'], targetRepo));
  const nextPrompt = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'next-prompt', '--json'], targetRepo));
  const explore = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'explore', '--changed', '--json'], targetRepo));
  const route = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'route', '--json'], targetRepo));
  const profile = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'profile', '--json'], targetRepo));
  const workspaces = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'rai.js'), 'workspaces', '--json'], targetRepo));

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

test('explore and daemon use persistent symbol and scale caches', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  fs.mkdirSync(path.join(targetRepo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetRepo, 'tests'), { recursive: true });
  writeFile(targetRepo, 'src/service.ts', 'export async function fetchData(id) { return { id }; }\n');
  writeFile(targetRepo, 'src/api.ts', 'import { fetchData } from "./service"; export async function loadRoute(id) { return fetchData(id); }\n');
  writeFile(targetRepo, 'tests/service.test.js', 'const { test } = require("node:test"); test("service", () => {});\n');

  const bin = path.join(targetRepo, 'bin', 'rai.js');
  const symbol = JSON.parse(run('node', [bin, 'explore', '--symbol', 'fetchData', '--json'], targetRepo));
  const callers = JSON.parse(run('node', [bin, 'explore', '--callers', 'fetchData', '--json'], targetRepo));
  const impact = JSON.parse(run('node', [bin, 'explore', '--impact', 'src/service.ts', '--json'], targetRepo));
  const daemon = JSON.parse(run('node', [bin, 'daemon', 'restart', '--json'], targetRepo));

  assert.ok(symbol.symbol.definitions.includes('src/service.ts'));
  assert.ok(symbol.symbol.references.includes('src/api.ts'));
  assert.ok(callers.callers.callers.includes('src/api.ts'));
  assert.ok(impact.impact.callers.includes('src/api.ts'));
  assert.ok(impact.impact.impactedTests.includes('tests/service.test.js'));
  assert.equal(daemon.daemon.running, true);
  assert.ok(daemon.daemon.caches.symbolGraph.symbolCount >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'cache', 'symbol-graph.json')));
});

test('verify-shell and verify-browser store normalized evidence artifacts', async () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

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
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  delete packageJson.scripts['workflow:launch'];
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.writeFileSync(path.join(targetRepo, '.gitignore'), '# intentionally incomplete\n');
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
  assert.match(readFile(targetRepo, '.gitignore'), /\.workflow\//);
  assert.match(readFile(targetRepo, '.gitignore'), /\.agents\//);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'VERSION.md')));
  assert.ok(healthRepair.repair.safeActionCount >= 1);
  assert.doesNotThrow(() => JSON.parse(readFile(targetRepo, '.workflow/fs-index.json')));
});

test('doctor repair reports invalid package.json instead of crashing', () => {
  const targetRepo = makeTempRepo();
  run('node', [setupScript, '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  fs.writeFileSync(path.join(targetRepo, 'package.json'), '{broken');

  const rootDir = path.join(targetRepo, 'docs', 'workflow');
  const report = buildDoctorReport(targetRepo, rootDir);
  const repair = buildRepairPlan(targetRepo, rootDir, { kind: 'doctor' });

  assert.ok(
    report.checks.some(
      (check) => check.status === 'fail'
        && check.message.includes('package.json is invalid JSON'),
    ),
  );
  assert.ok(
    repair.manualIssues.some(
      (issue) => issue.type === 'invalid_package_json',
    ),
  );
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

test('team runtime prunes stale task references from persisted runtime state', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M21',
      '--name', 'Runtime guardrails',
      '--goal', 'Exercise stale runtime pruning',
    ],
    targetRepo,
  );

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = statusDoc.replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'ready for runtime guardrails'], targetRepo);

  run(
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
  );

  const runtimeStatePath = path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'state.json');
  const runtimeState = JSON.parse(fs.readFileSync(runtimeStatePath, 'utf8'));
  runtimeState.dispatchedTasks = [...(runtimeState.dispatchedTasks || []), 'ghost-task'];
  runtimeState.collectedTasks = [...(runtimeState.collectedTasks || []), 'ghost-task'];
  runtimeState.workspaces = {
    ...(runtimeState.workspaces || {}),
    'ghost-task': {
      path: path.join(targetRepo, 'ghost-workspace'),
      mode: 'owner',
      exists: false,
      hasResult: false,
    },
  };
  runtimeState.patchBundles = {
    ...(runtimeState.patchBundles || {}),
    'ghost-task': {
      patchFile: '.workflow/orchestration/patches/ghost.patch',
      changedFiles: [],
      placeholder: true,
    },
  };
  runtimeState.collectedResults = {
    ...(runtimeState.collectedResults || {}),
    'ghost-task': {
      status: 'completed',
      summary: 'stale state',
    },
  };
  fs.writeFileSync(runtimeStatePath, `${JSON.stringify(runtimeState, null, 2)}\n`);

  const monitored = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js'), 'monitor', '--json'],
    targetRepo,
  ));

  assert.ok((monitored.guardrails?.lastPrunedCount || 0) >= 5);
  assert.ok(monitored.guardrails.affectedCollections.includes('workspaces'));
  assert.equal(monitored.workspaces['ghost-task'], undefined);
  assert.ok(!monitored.dispatchedTasks.includes('ghost-task'));
  assert.ok(!monitored.collectedTasks.includes('ghost-task'));
});
