const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const { safeArtifactToken } = require('../scripts/workflow/common');
const { createPatchBundle } = require('../scripts/workflow/team_runtime_artifacts');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');
const setupScript = path.join(repoRoot, 'scripts', 'workflow', 'setup.js');

function makeTempRepo(prefix = 'codex-workflow-kit-phase23-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function spawn(command, args, cwd) {
  return childProcess.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readFile(targetRepo, relativeFile) {
  return fs.readFileSync(path.join(targetRepo, relativeFile), 'utf8');
}

function writeFile(targetRepo, relativeFile, content) {
  fs.writeFileSync(path.join(targetRepo, relativeFile), content);
}

function setExecuteStep(targetRepo) {
  const statusPath = path.join(targetRepo, 'docs', 'workflow', 'STATUS.md');
  fs.writeFileSync(
    statusPath,
    readFile(targetRepo, 'docs/workflow/STATUS.md').replace('- Current milestone step: `discuss`', '- Current milestone step: `execute`'),
  );
}

function createFakeCodex(targetRepo) {
  const fakeCodexPath = path.join(targetRepo, 'fake-codex');
  fs.writeFileSync(
    fakeCodexPath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "fake-codex 1.0.0"
  exit 0
fi

out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    out="$1"
  fi
  shift
done

cat > "$out" <<'EOF'
# TASK RESULT TEMPLATE

- Status: \`completed\`
- Summary: \`Fake Codex worker completed\`
- Evidence: \`fake-codex smoke\`

## Details

- \`Structured result written by the fake Codex binary\`

## Next

- \`No follow-up\`
EOF
`,
  );
  fs.chmodSync(fakeCodexPath, 0o755);
  return fakeCodexPath;
}

test('task artifact ids are sanitized before patch bundles are written', () => {
  const targetRepo = makeTempRepo('codex-workflow-kit-phase23-artifacts-');
  const unsafeTaskId = '../../../../escape/../../task';
  const safeTaskId = safeArtifactToken(unsafeTaskId, { label: 'Task id', prefix: 'task' });
  const bundle = createPatchBundle(
    targetRepo,
    { mode: 'snapshot', path: targetRepo },
    unsafeTaskId,
    { changedFiles: [] },
  );

  assert.match(safeTaskId, /^[a-z0-9-]+$/);
  assert.ok(!safeTaskId.includes('..'));
  assert.equal(path.basename(bundle.patchFile, '.patch'), safeTaskId);
  assert.ok(bundle.patchFile.startsWith('.workflow/orchestration/patches/'));
  assert.ok(!bundle.patchFile.includes('..'));
  assert.ok(fs.existsSync(path.join(targetRepo, bundle.patchFile)));
});

test('patch apply keeps task ids inside the patch directory', () => {
  const targetRepo = makeTempRepo('codex-workflow-kit-phase23-patch-');
  const patchDir = path.join(targetRepo, '.workflow', 'orchestration', 'patches');
  fs.mkdirSync(patchDir, { recursive: true });

  const outsidePatch = path.join(path.dirname(targetRepo), 'outside-apply.patch');
  fs.writeFileSync(outsidePatch, '# malicious patch outside workflow patch dir\n');

  try {
    const traversalTaskId = path.relative(
      patchDir,
      outsidePatch.replace(/\.patch$/, ''),
    ).replace(/\\/g, '/');
    const payload = JSON.parse(run(
      'node',
      [path.join(repoRoot, 'scripts', 'workflow', 'patch_apply.js'), '--task', traversalTaskId, '--json'],
      targetRepo,
    ));

    assert.equal(payload.applied, false);
    assert.equal(
      path.basename(payload.file, '.patch'),
      safeArtifactToken(traversalTaskId, { label: 'Task id', prefix: 'task' }),
    );
    assert.ok(payload.file.startsWith('.workflow/orchestration/patches/'));
    assert.ok(!payload.file.includes('..'));
  } finally {
    fs.rmSync(outsidePatch, { force: true });
  }
});

test('doctor fails on source-repo product version drift between package, marker, and manifest', () => {
  const targetRepo = makeTempRepo('codex-workflow-kit-phase23-drift-');
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = 'codex-workflow-kit';
  packageJson.version = '0.3.1';
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, '.workflow/VERSION.md', `# WORKFLOW PRODUCT VERSION

- Installed version: \`0.2.0\`
- Previous version: \`none\`
- Install mode: \`init\`
- Last refreshed at: \`2026-04-04T14:20:32.078Z\`
- Source package: \`codex-workflow-kit@0.2.0\`
`);

  const manifestPath = path.join(targetRepo, '.workflow', 'product-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.installedVersion = '0.2.0';
  manifest.sourcePackageVersion = '0.2.0';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = spawn(
    'node',
    [path.join(targetRepo, 'bin', 'cwf.js'), 'doctor', '--strict', '--json'],
    targetRepo,
  );

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.failCount >= 2);
  assert.ok(
    payload.checks.some(
      (check) => check.status === 'fail'
        && check.message.includes('Product version marker -> marker=0.2.0, expected=0.3.1'),
    ),
  );
  assert.ok(
    payload.checks.some(
      (check) => check.status === 'fail'
        && check.message.includes('Product manifest version -> manifest=0.2.0, expected=0.3.1'),
    ),
  );
});

test('repo-local MCP install, status, and doctor expose real server descriptors and smoke results', async () => {
  const targetRepo = makeTempRepo('codex-workflow-kit-phase23-mcp-');
  run('node', [setupScript, '--target', targetRepo, '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const installed = JSON.parse(run('node', [targetBin, 'mcp', 'install', '--json'], targetRepo));
  const status = JSON.parse(run('node', [targetBin, 'mcp', 'status', '--json'], targetRepo));
  const doctor = JSON.parse(run('node', [targetBin, 'mcp', 'doctor', '--json'], targetRepo));

  assert.equal(installed.action, 'install');
  assert.equal(installed.manifest.enabled, true);
  assert.equal(installed.manifest.servers.length, 6);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'mcp', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'runtime', 'mcp', 'servers', 'workflow-state.json')));
  assert.equal(status.installed, true);
  assert.equal(status.servers.length, 6);
  assert.ok(status.servers.every((server) => server.toolCount >= 1));
  assert.equal(doctor.verdict, 'pass');
  assert.equal(doctor.smoke.length, 6);
  assert.ok(doctor.smoke.every((entry) => entry.status === 'pass' && entry.toolCount >= 1));
});

test('team runtime codex-exec driver launches live workers and keeps indexed mailbox/timeline counts', () => {
  const targetRepo = makeTempRepo('codex-workflow-kit-phase23-team-');
  run('node', [initScript, '--target', targetRepo, '--skip-verify'], repoRoot);
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M23',
      '--name', 'Live team runtime',
      '--goal', 'Exercise codex-exec worker lifecycle',
    ],
    targetRepo,
  );
  setExecuteStep(targetRepo);

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'ready for live team runtime'], targetRepo);

  const fakeCodex = createFakeCodex(targetRepo);
  const targetRuntime = path.join(targetRepo, 'scripts', 'workflow', 'team_runtime.js');

  JSON.parse(run(
    'node',
    [
      targetRuntime,
      'run',
      '--adapter', 'worktree',
      '--driver', 'codex-exec',
      '--codex-bin', fakeCodex,
      '--activation-text', 'parallel yap',
      '--write-scope', 'docs/workflow/STATUS.md;docs/workflow/CONTEXT.md',
      '--json',
    ],
    targetRepo,
  ));

  const dispatched = JSON.parse(run('node', [targetRuntime, 'dispatch', '--json'], targetRepo));
  const [taskId, workspace] = Object.entries(dispatched.workspaces)[0];
  assert.ok(taskId);
  assert.equal(workspace.live.driver, 'codex-exec');
  assert.equal(workspace.live.command, fakeCodex);

  run('node', ['-e', 'setTimeout(() => process.exit(0), 200)'], targetRepo);

  const monitored = JSON.parse(run('node', [targetRuntime, 'monitor', '--json'], targetRepo));
  assert.equal(monitored.workspaces[taskId].hasResult, true);
  assert.equal(monitored.workspaces[taskId].live.running, false);

  const collected = JSON.parse(run('node', [targetRuntime, 'collect', '--json'], targetRepo));
  assert.ok(collected.collectedTasks.includes(taskId));
  assert.equal(collected.workspaces[taskId].hasResult, true);

  const runtimeState = JSON.parse(readFile(targetRepo, '.workflow/orchestration/runtime/state.json'));
  assert.equal(runtimeState.collectedResults[taskId].summary, 'Fake Codex worker completed');

  const mailbox = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'mailbox', '--json'], targetRepo));
  const timeline = JSON.parse(run('node', [path.join(targetRepo, 'bin', 'cwf.js'), 'team', 'timeline', '--json'], targetRepo));
  assert.ok(mailbox.count >= 1);
  assert.ok(timeline.count >= 4);
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'runtime', 'log-index.json')));
});
