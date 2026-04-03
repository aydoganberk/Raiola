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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase7-'));
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

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8');
}

function writeFile(targetRepo, relativePath, content) {
  fs.writeFileSync(path.join(targetRepo, relativePath), content);
}

test('workflow:init installs workflow:control and plan skip resolves to condensed plan intent', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  assert.equal(packageJson.scripts['workflow:control'], 'node scripts/workflow/control.js');

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    targetRepo,
  ));

  assert.equal(payload.intent.family, 'step_control');
  assert.equal(payload.intent.target, 'plan');
  assert.equal(payload.intent.mode, 'condensed');
  assert.equal(payload.intent.resolution, 'safe_fallback');
});

test('workflow:automation accepts natural-language automation control intents', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M7',
      '--name', 'Intent control',
      '--goal', 'Drive automation through natural language',
    ],
    targetRepo,
  );

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'automation.js'), '--utterance', 'buradan sonra sen akıt', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');

  assert.equal(payload.automation.mode, 'phase');
  assert.equal(payload.automation.status, 'active');
  assert.equal(payload.control.family, 'automation_control');
  assert.equal(payload.control.mode, 'phase');
  assert.match(statusDoc, /- Automation mode: `phase`/);
});

test('workflow:control keeps parallel phrasing available and workflow:next routes through the control plane hint', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M8',
      '--name', 'Parallel intent',
      '--goal', 'Keep parallel routing explicit',
    ],
    targetRepo,
  );

  const parallelPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'parallel yap', '--json'],
    targetRepo,
  ));

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = replaceField(statusDoc, 'Current milestone step', 'research');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  const nextPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'next_step.js'), '--json'],
    targetRepo,
  ));

  assert.equal(parallelPayload.intent.family, 'parallel_control');
  assert.equal(parallelPayload.intent.state, 'on');
  assert.ok(
    nextPayload.recommendation.checklist.some(
      (item) => item.includes('workflow:control -- --utterance "<user request>"')
        && item.includes('workflow:delegation-plan'),
    ),
  );
});
