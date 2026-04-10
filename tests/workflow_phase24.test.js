const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const { buildCommandPlan } = require('../scripts/workflow/command_plan');

const repoRoot = path.resolve(__dirname, '..');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepoFromFixture(fixtureName) {
  const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', fixtureName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `raiola-${fixtureName}-`));
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

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

function seedMonorepoSignals(targetRepo) {
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>Web</main>; }\n');
  writeFile(targetRepo, 'apps/web/middleware.ts', 'export function middleware() { return null; }\n');
  writeFile(targetRepo, 'apps/admin/app/page.tsx', 'export default function Page() { return <main>Admin</main>; }\n');
  writeFile(targetRepo, 'packages/auth/src/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'packages/auth/src/permission.ts', 'export const permission = "admin";\n');
  writeFile(targetRepo, 'packages/data/src/schema.ts', 'export const schema = { users: true };\n');
  writeFile(targetRepo, 'packages/data/src/repository.ts', 'export function repository() { return schema; }\n');
  writeFile(targetRepo, 'packages/workflow/src/queue.ts', 'export const queue = ["job"];\n');
  writeFile(targetRepo, 'packages/ui/src/button.ts', 'export const button = "primary";\n');
}

test('monorepo-mode emits staged artifacts, prompts, and shell help for large repos', () => {
  const targetRepo = makeTempRepoFromFixture('large-monorepo');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedMonorepoSignals(targetRepo);
  writeFile(targetRepo, 'AGENTS.md', '# AGENTS\n\n- Team-specific rule stays intact.\n');
  gitInit(targetRepo);

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline monorepo mode fixture'], targetRepo);

  writeFile(targetRepo, 'packages/auth/src/session.ts', 'export function getSession() { return "changed-session"; }\n');
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>Changed Web</main>; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const help = run('node', [targetBin, 'help'], targetRepo);
  assert.match(help, /rai help monorepo/);

  const payload = JSON.parse(run(
    'node',
    [targetBin, 'monorepo-mode', '--goal', 'review and patch the top-risk monorepo subsystem', '--json'],
    targetRepo,
  ));

  assert.equal(payload.mode, 'monorepo-mode');
  assert.ok(payload.criticalAreas.length >= 3);
  assert.equal(payload.tracks.length, 7);
  assert.ok(payload.selectedSubsystem?.path);
  assert.ok(payload.promptLibrary.master.includes('Phase 1: Build a repo map'));
  assert.ok(payload.promptLibrary.deepReview.includes(payload.selectedSubsystem.path));
  assert.ok(payload.commandPlan.primaryCommand.includes('rai monorepo-mode'));
  assert.ok(payload.phasePlan.some((phase) => phase.id === 'patch-plan'));
  assert.equal(payload.files.agents, 'AGENTS.md');
  assert.ok(payload.agents);
  assert.equal(payload.agents.path, 'AGENTS.md');
  assert.equal(payload.agents.existed, true);
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.report)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.json)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.agents)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.repoMap)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.reviewScope)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.patchPlan)));

  const agents = fs.readFileSync(path.join(targetRepo, payload.files.agents), 'utf8');
  assert.match(agents, /Team-specific rule stays intact/);
  assert.match(agents, /## Large Monorepo Workflow Layer/);
  assert.match(agents, /Use rai monorepo-mode --goal/);
  assert.match(agents, /Track A: auth \/ session \/ permission \/ middleware/);
});

test('command plan promotes monorepo-mode for review work on monorepos', () => {
  const plan = buildCommandPlan({
    goal: 'deep review the monorepo auth boundary',
    lane: 'review',
    capability: 'review.deep_review',
    repoSignals: { monorepo: true },
    trust: { verifyNeeded: true },
    profile: { id: 'monorepo-delta' },
  });

  assert.match(plan.primaryCommand, /rai monorepo-mode/);
  assert.ok(plan.secondaryCommands.some((command) => command.includes('rai review-mode')));
  assert.ok(plan.secondaryCommands.some((command) => command.includes('rai monorepo --json')));
  assert.ok(plan.parallelFlow.some((entry) => entry.includes('read-only')));
});

test('monorepo-mode creates AGENTS.md when the repo does not have one yet', () => {
  const targetRepo = makeTempRepoFromFixture('large-monorepo');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedMonorepoSignals(targetRepo);

  const agentsPath = path.join(targetRepo, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    fs.rmSync(agentsPath);
  }

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'monorepo-mode', '--goal', 'bootstrap monorepo workflow docs', '--json'],
    targetRepo,
  ));

  assert.equal(payload.files.agents, 'AGENTS.md');
  assert.equal(payload.agents.existed, false);
  assert.ok(fs.existsSync(agentsPath));

  const agents = fs.readFileSync(agentsPath, 'utf8');
  assert.match(agents, /^# AGENTS/m);
  assert.match(agents, /Keep changes explicit and easy to review/);
  assert.match(agents, /## Large Monorepo Workflow Layer/);
});
