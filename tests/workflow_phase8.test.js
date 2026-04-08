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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase8-'));
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
  - \`The user wants the workflow to preserve a minimum planning spine even in condensed mode\`
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

test('workflow control covers the remaining phase 1 natural-language examples', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const tempoPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'detaya girmeyelim hızlı geç', '--json'],
    targetRepo,
  ));
  const workflowOffPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'şimdilik workflow istemiyorum', '--json'],
    targetRepo,
  ));
  const pausePayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'burada duralım', '--json'],
    targetRepo,
  ));
  const planPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    targetRepo,
  ));

  assert.equal(tempoPayload.intent.family, 'tempo_control');
  assert.equal(tempoPayload.intent.mode, 'lite');
  assert.equal(workflowOffPayload.intent.family, 'workflow_activation');
  assert.equal(workflowOffPayload.intent.state, 'off');
  assert.equal(pausePayload.intent.family, 'pause_resume_control');
  assert.equal(pausePayload.intent.state, 'pause');
  assert.match(planPayload.suggestedCommand, /workflow:step-fulfillment/);
});

test('workflow:new-milestone seeds step fulfillment fields across status surfaces', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M8',
      '--name', 'Fulfillment fields',
      '--goal', 'Seed step fulfillment metadata',
    ],
    targetRepo,
  );

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');

  assert.match(statusDoc, /- Current step mode: `explicit`/);
  assert.match(statusDoc, /- Step fulfillment state: `pending_explicit`/);
  assert.match(statusDoc, /- Last control intent: `none`/);
  assert.match(contextDoc, /- Current step mode: `explicit`/);
  assert.match(contextDoc, /- Step fulfillment state: `pending_explicit`/);
  assert.match(contextDoc, /- Last control intent: `none`/);
  assert.match(execplanDoc, /- Current step mode: `explicit`/);
  assert.match(execplanDoc, /- Step fulfillment state: `pending_explicit`/);
  assert.match(execplanDoc, /- Last control intent: `none`/);
});

test('workflow:step-fulfillment supports condensed, smoke, and fast closeout modes and blocks execute skip', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M9',
      '--name', 'Mode matrix',
      '--goal', 'Exercise fulfillment modes',
    ],
    targetRepo,
  );

  const discussPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'discuss', '--mode', 'condensed', '--json'],
    targetRepo,
  ));
  const researchPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'research', '--mode', 'condensed', '--json'],
    targetRepo,
  ));
  const auditPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'audit', '--mode', 'smoke', '--json'],
    targetRepo,
  ));
  const completePayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'complete', '--mode', 'fast_closeout', '--json'],
    targetRepo,
  ));
  const executePayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'execute', '--mode', 'condensed', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');

  assert.equal(discussPayload.state, 'fulfilled_condensed');
  assert.equal(researchPayload.state, 'fulfilled_condensed');
  assert.equal(auditPayload.state, 'fulfilled_smoke');
  assert.equal(completePayload.state, 'fulfilled_fast_closeout');
  assert.equal(executePayload.fulfilled, false);
  assert.equal(executePayload.appliedMode, 'explicit');
  assert.match(executePayload.message, /Execute step cannot be skipped/);
  assert.match(statusDoc, /- Current step mode: `fast_closeout`/);
  assert.match(statusDoc, /- Step fulfillment state: `fulfilled_fast_closeout`/);
});

test('workflow:step-fulfillment turns plan skip into a checked condensed plan when the packet is ready', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M10',
      '--name', 'Condensed plan',
      '--goal', 'Convert skip language into a checked minimum plan',
    ],
    targetRepo,
  );
  seedPlanReadyDocs(targetRepo);

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');

  assert.equal(payload.target, 'plan');
  assert.equal(payload.appliedMode, 'condensed');
  assert.equal(payload.state, 'fulfilled_condensed');
  assert.equal(payload.fulfilled, true);
  assert.equal(payload.gate.planReady, true);
  assert.deepEqual(payload.missingFields, []);
  assert.match(statusDoc, /- Current milestone step: `plan`/);
  assert.match(statusDoc, /- Current step mode: `condensed`/);
  assert.match(statusDoc, /- Step fulfillment state: `fulfilled_condensed`/);
  assert.match(contextDoc, /- Last control intent: `step_control\(plan, condensed\)`/);
  assert.match(execplanDoc, /Condensed plan mode translates skip language into a minimum checked plan/);
});

test('workflow:step-fulfillment reports missing fields for condensed plan failure instead of a generic refusal', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M11',
      '--name', 'Condensed plan gaps',
      '--goal', 'Return targeted missing fields when condensed plan is under-specified',
    ],
    targetRepo,
  );

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');

  assert.equal(payload.target, 'plan');
  assert.equal(payload.appliedMode, 'condensed');
  assert.equal(payload.state, 'condensed_needs_inputs');
  assert.equal(payload.fulfilled, false);
  assert.match(payload.message, /Condensed plan icin eksik alanlar bunlar/);
  assert.ok(payload.missingFields.length > 0);
  assert.match(statusDoc, /- Step fulfillment state: `condensed_needs_inputs`/);
});
