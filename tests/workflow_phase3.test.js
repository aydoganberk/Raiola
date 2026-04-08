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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase3-'));
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

function replaceSection(content, heading, body) {
  const pattern = new RegExp(`(^## ${escapeRegex(heading)}\\n)([\\s\\S]*?)(?=^## [^\\n]+\\n|(?![\\s\\S]))`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing section: ${heading}`);
  }
  return content.replace(pattern, `$1${body.trimEnd()}\n\n`);
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

function currentMilestoneLabel(targetRepo) {
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const match = statusDoc.match(/^- Current milestone: `(.*?)`$/m);
  return match ? match[1] : 'NONE';
}

function seedPlanReadyDocs(targetRepo, options = {}) {
  const milestoneLabel = currentMilestoneLabel(targetRepo);
  const horizontal = Boolean(options.horizontal);

  let contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  contextDoc = replaceSection(contextDoc, 'User Intent', `
- Primary request:
  - \`Make the planning packet explicit before execute starts\`
- Why this matters now:
  - \`The user wants Phase 3 to define scope, constraints, and validation quality up front\`
- In-scope outcome:
  - \`The workflow can explain what we are building, why it matters, and how we will validate it before execute\`
`);
  contextDoc = replaceSection(contextDoc, 'Explicit Constraints', `
| Constraint | Type | Source | Impact |
| --- | --- | --- | --- |
| \`Keep the workflow markdown-first and auditable\` | \`product\` | \`ROADMAP.md\` | \`The gate must write back into canonical docs rather than hidden state\` |
| \`Treat horizontal UI/API/model slicing as an anti-pattern\` | \`planning\` | \`user\` | \`Chunk design and coverage mapping must stay capability-oriented\` |
`);
  contextDoc = replaceSection(contextDoc, 'Alternatives Considered', `
| Option | Status | Why |
| --- | --- | --- |
| \`Gate readiness only with a free-form checklist\` | \`rejected\` | \`It would not catch orphan requirements or horizontal slicing\` |
| \`Use a coverage matrix plus explicit acceptance criteria\` | \`chosen\` | \`It keeps requirement, chunk, and validation mapping observable\` |
`);
  contextDoc = replaceSection(contextDoc, 'Unanswered High-Leverage Questions', `
| Question | Impact | Owner | Status |
| --- | --- | --- | --- |
| \`Which minimum slice proves the milestone is ready for execute?\` | \`This decides chunk boundaries and acceptance mapping\` | \`planner\` | \`answered\` |
`);
  contextDoc = replaceSection(contextDoc, 'Success Rubric', `
| Outcome | Observable signal | Why it matters |
| --- | --- | --- |
| \`Planning packet is complete before execute\` | \`workflow:plan-check returns planReady=true and writes Plan readiness: yes\` | \`Execute should only start after the quality gate passes\` |
| \`Validation intent is explicit\` | \`VALIDATION.md names acceptance criteria, user-visible outcomes, regression focus, and concrete verification rows\` | \`Audit should already know what it will prove\` |
`);
  contextDoc = replaceSection(contextDoc, 'Requirement List', `
| Requirement ID | Requirement | Type | Source | Notes |
| --- | --- | --- | --- | --- |
| \`R1\` | \`Discuss must capture user intent, constraints, alternatives, success rubric, and requirements\` | \`functional\` | \`user\` | \`This makes the scope explicit before planning\` |
| \`R2\` | \`Plan must map every requirement to one milestone slice, one chunk, and one validation target\` | \`functional\` | \`user\` | \`This prevents orphan and duplicate coverage\` |
`);
  writeFile(targetRepo, 'docs/workflow/CONTEXT.md', contextDoc);

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceSection(execplanDoc, 'Chosen Strategy', `
- \`Use one vertical slice for discuss coverage and one vertical slice for the execute gate so the user sees complete capability progress rather than layer-by-layer plumbing\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Rejected Strategies', `
- \`Do not split the work into UI, API, or model milestones because that would hide user-visible progress and break the vertical slice rule\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Rollback / Fallback', `
- \`If the new gate proves too heavy, keep the template fields but block only on orphan requirements and missing acceptance criteria until the stricter matrix is tuned\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Dependency Blockers', `
| Blocker | Type | Owner | Status | Unblock signal |
| --- | --- | --- | --- | --- |
| \`None currently\` | \`none\` | \`n/a\` | \`clear\` | \`No external blocker is holding the plan gate\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Wave Structure', horizontal
    ? `
| Wave | Chunks | Goal | Depends on |
| --- | --- | --- | --- |
| \`1\` | \`chunk-ui\` | \`Refactor the UI layer first\` | \`none\` |
| \`2\` | \`chunk-api\` | \`Refactor the API layer second\` | \`chunk-ui\` |
`
    : `
| Wave | Chunks | Goal | Depends on |
| --- | --- | --- | --- |
| \`1\` | \`chunk-discuss-packet\` | \`Complete the discuss packet so intent, constraints, and success criteria are explicit in one pass\` | \`none\` |
| \`2\` | \`chunk-plan-gate\` | \`Run one gate that proves coverage, observability, and execute readiness\` | \`chunk-discuss-packet\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Coverage Matrix', horizontal
    ? `
| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| \`R1\` | \`${milestoneLabel}\` | \`UI layer\` | \`chunk-ui\` | \`AC1\` | \`Horizontal slice for discuss fields\` |
| \`R2\` | \`${milestoneLabel}\` | \`API layer\` | \`chunk-api\` | \`AC2\` | \`Horizontal slice for the execute gate\` |
`
    : `
| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| \`R1\` | \`${milestoneLabel}\` | \`Capture intent, constraints, and success signals in one planning packet\` | \`chunk-discuss-packet\` | \`AC1\` | \`This requirement is satisfied by a complete discuss packet\` |
| \`R2\` | \`${milestoneLabel}\` | \`Block execute until coverage and validation mapping are observable in one gate\` | \`chunk-plan-gate\` | \`AC2\` | \`This requirement is satisfied by the plan gate command\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Plan Chunk Table', horizontal
    ? `
| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Status |
| --- | --- | --- | --- | --- | --- |
| \`chunk-ui\` | \`UI layer\` | \`Refactor the UI layer\` | \`none\` | \`1\` | \`planned\` |
| \`chunk-api\` | \`API layer\` | \`Refactor the API layer\` | \`chunk-ui\` | \`2\` | \`planned\` |
`
    : `
| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Status |
| --- | --- | --- | --- | --- | --- |
| \`chunk-discuss-packet\` | \`Complete the discuss packet in one capability slice\` | \`The user can inspect intent, constraints, and success criteria without stitching multiple layers together\` | \`none\` | \`1\` | \`planned\` |
| \`chunk-plan-gate\` | \`Gate execute with coverage and observability in one capability slice\` | \`The user can run one command and see coverage, anti-horizontal slicing, and validation readiness\` | \`chunk-discuss-packet\` | \`2\` | \`planned\` |
`);
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  let validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  validationDoc = replaceSection(validationDoc, 'Acceptance Criteria', `
| Acceptance ID | Criterion | How to observe | Status |
| --- | --- | --- | --- |
| \`AC1\` | \`The discuss packet names intent, constraints, alternatives, success rubric, and requirements\` | \`Open CONTEXT.md and see each section filled with milestone-specific content\` | \`planned\` |
| \`AC2\` | \`The plan gate blocks execute until coverage and validation mapping are explicit\` | \`Run workflow:plan-check and verify that planReady becomes true only for the complete vertical-slice plan\` | \`planned\` |
`);
  validationDoc = replaceSection(validationDoc, 'User-visible Outcomes', `
| Outcome | How to observe | Status |
| --- | --- | --- |
| \`Planner sees one coherent packet before execute\` | \`CONTEXT.md, EXECPLAN.md, and VALIDATION.md answer what, why, and how we will validate it\` | \`planned\` |
| \`Execute is blocked until the gate passes\` | \`Context readiness becomes plan_ready only after workflow:plan-check succeeds\` | \`planned\` |
`);
  validationDoc = replaceSection(validationDoc, 'Regression Focus', `
| Area | Risk | Check |
| --- | --- | --- |
| \`Existing workflow commands\` | \`New sections could break milestone seeding or closeout\` | \`Run workflow:new-milestone and workflow:plan-check on a fresh fixture repo\` |
| \`Planning ergonomics\` | \`The gate could accept horizontal slicing or orphan requirements\` | \`Use a negative fixture that maps requirements into UI/API layers and expect a fail\` |
`);
  validationDoc = replaceSection(validationDoc, 'Validation Contract', `
| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| \`Phase 3 plan gate\` | \`node scripts/workflow/plan_check.js --json\` | \`JSON report returns planReady=true only for the complete vertical-slice plan\` | \`Read the gate summary and confirm coverage / observability / anti-horizontal slicing all pass\` | \`tests/golden/workflow/README.md\` | \`audit\` | \`planned\` | \`docs/workflow/EXECPLAN.md\` | \`pending_sync\` |
| \`Workflow runtime sanity\` | \`node scripts/workflow/next_step.js --json\` | \`The recommendation respects the plan-ready gate before execute\` | \`Read STATUS.md and confirm Context readiness matches the gate result\` | \`tests/golden/workflow/README.md\` | \`audit\` | \`planned\` | \`docs/workflow/STATUS.md\` | \`pending_sync\` |
`);
  writeFile(targetRepo, 'docs/workflow/VALIDATION.md', validationDoc);
}

test('workflow:init installs workflow:plan-check and new_milestone seeds Phase 3 sections', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const packageJson = JSON.parse(readFile(targetRepo, 'package.json'));
  assert.equal(packageJson.scripts['workflow:plan-check'], 'node scripts/workflow/plan_check.js');

  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'), '--id', 'M3', '--name', 'Phase 3', '--goal', 'Implement coverage-driven planning'], targetRepo);

  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  const validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');

  assert.match(contextDoc, /## Discuss Breakdown/);
  assert.match(contextDoc, /## User Intent/);
  assert.match(contextDoc, /## Requirement List/);
  assert.match(execplanDoc, /## Coverage Matrix/);
  assert.match(execplanDoc, /## Plan Chunk Table/);
  assert.match(validationDoc, /## Acceptance Criteria/);
  assert.match(validationDoc, /## User-visible Outcomes/);
  assert.match(validationDoc, /## Regression Focus/);
});

test('workflow:plan-check keeps the seeded milestone pending until coverage and strategy are explicit', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'), '--id', 'M3', '--name', 'Phase 3', '--goal', 'Implement coverage-driven planning'], targetRepo);

  const report = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js'), '--json'], targetRepo));

  assert.equal(report.planReady, false);
  assert.equal(report.planGate, 'pending');
  assert.equal(report.gates.coverage, 'pending');
  assert.ok(report.summary.pendingCount > 0);

  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  assert.match(contextDoc, /- Plan readiness: `not_ready`/);
});

test('workflow:plan-check syncs plan-ready only after a vertical-slice plan passes', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'), '--id', 'M3', '--name', 'Phase 3', '--goal', 'Implement coverage-driven planning'], targetRepo);
  seedPlanReadyDocs(targetRepo);

  const report = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js'), '--json', '--sync', '--strict'], targetRepo));

  assert.equal(report.planReady, true);
  assert.equal(report.gates.coverage, 'pass');
  assert.equal(report.gates.antiHorizontalSlicing, 'pass');
  assert.equal(report.gates.observability, 'pass');

  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  const state = JSON.parse(readFile(targetRepo, '.workflow/state.json'));

  assert.match(contextDoc, /- Plan readiness: `yes`/);
  assert.match(contextDoc, /workflow:plan-check passed/);
  assert.match(statusDoc, /- Context readiness: `plan_ready`/);
  assert.match(execplanDoc, /- Plan-ready gate: `pass`/);
  assert.equal(state.planCheck.planReady, true);
});

test('workflow:plan-check fails anti-horizontal slicing for UI\/API chunk plans', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'), '--id', 'M3', '--name', 'Phase 3', '--goal', 'Implement coverage-driven planning'], targetRepo);
  seedPlanReadyDocs(targetRepo, { horizontal: true });

  const report = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js'), '--json'], targetRepo));

  assert.equal(report.planReady, false);
  assert.equal(report.gates.antiHorizontalSlicing, 'fail');
  assert.deepEqual(report.antiHorizontalSlicing.flaggedChunks, ['chunk-ui', 'chunk-api']);
});

test('workflow:new-milestone accepts milestone profile override and automation mode', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M4',
      '--name', 'Automation',
      '--goal', 'Seed automation-aware planning',
      '--profile', 'lite',
      '--automation', 'full',
    ],
    targetRepo,
  );

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');

  assert.match(statusDoc, /- Effective workflow profile: `lite`/);
  assert.match(statusDoc, /- Automation mode: `full`/);
  assert.match(statusDoc, /- Automation status: `active`/);
  assert.match(contextDoc, /- Milestone profile override: `lite`/);
  assert.match(contextDoc, /- Automation mode: `full`/);
  assert.match(handoffDoc, /- Automation mode: `full`/);
});

test('workflow:automation updates milestone-scoped automation state', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'), '--id', 'M5', '--name', 'Automation', '--goal', 'Toggle automation'], targetRepo);

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'automation.js'), '--mode', 'phase', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');

  assert.equal(payload.scope, 'milestone');
  assert.equal(payload.automation.mode, 'phase');
  assert.equal(payload.automation.status, 'active');
  assert.match(statusDoc, /- Automation mode: `phase`/);
  assert.match(contextDoc, /- Automation mode: `phase`/);
  assert.match(handoffDoc, /- Automation mode: `phase`/);
});

test('workflow:plan-check lite profile downgrades selected completeness gaps to warnings at plan time', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M6',
      '--name', 'Lite gate',
      '--goal', 'Verify lite severity map',
      '--profile', 'lite',
    ],
    targetRepo,
  );
  seedPlanReadyDocs(targetRepo);

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = replaceField(statusDoc, 'Current milestone step', 'plan');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  let contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  contextDoc = replaceSection(contextDoc, 'Alternatives Considered', `
| Option | Status | Why |
| --- | --- | --- |
| \`Fill when a milestone opens\` | \`open\` | \`Document the main alternatives before choosing a strategy\` |
`);
  writeFile(targetRepo, 'docs/workflow/CONTEXT.md', contextDoc);

  const report = JSON.parse(run('node', [path.join(targetRepo, 'scripts', 'workflow', 'plan_check.js'), '--json'], targetRepo));

  assert.equal(report.planGate, 'pass');
  assert.ok(report.summary.warnCount > 0);
  assert.equal(report.summary.failCount, 0);
});
