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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase11-'));
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

function replaceSection(content, heading, body) {
  const pattern = new RegExp(`(^## ${escapeRegex(heading)}\\n)([\\s\\S]*?)(?=^## [^\\n]+\\n|(?![\\s\\S]))`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing section: ${heading}`);
  }
  return content.replace(pattern, `$1${body.trimEnd()}\n\n`);
}

function readFile(targetRepo, relativePath) {
  return fs.readFileSync(path.join(targetRepo, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function writeFile(targetRepo, relativePath, content) {
  fs.writeFileSync(path.join(targetRepo, relativePath), content);
}

function currentMilestoneLabel(targetRepo) {
  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const match = statusDoc.match(/^- Current milestone: `(.*?)`$/m);
  return match ? match[1] : 'NONE';
}

function seedPlanReadyDocs(targetRepo) {
  const milestoneLabel = currentMilestoneLabel(targetRepo);

  let contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  contextDoc = replaceSection(contextDoc, 'User Intent', `
- Primary request:
  - \`Keep condensed planning safe enough that execute never starts without a checked plan\`
- Why this matters now:
  - \`The workflow should reduce ritual without losing the plan spine or requirement coverage\`
- In-scope outcome:
  - \`The packet can explain what we are building, what is open, and how we will verify it before execute\`
`);
  contextDoc = replaceSection(contextDoc, 'Explicit Constraints', `
| Constraint | Type | Source | Impact |
| --- | --- | --- | --- |
| \`Preserve markdown as the canonical workflow state\` | \`process\` | \`user\` | \`The done criteria must be visible in docs rather than hidden runtime state\` |
| \`Do not treat horizontal slicing as success\` | \`planning\` | \`user\` | \`Coverage and chunks must stay capability-oriented\` |
`);
  contextDoc = replaceSection(contextDoc, 'Alternatives Considered', `
| Option | Status | Why |
| --- | --- | --- |
| \`Literal skip for plan\` | \`rejected\` | \`It would let execute start without a verified planning spine\` |
| \`Condensed plan plus gate\` | \`chosen\` | \`It keeps the minimum checked plan while lowering ritual\` |
`);
  contextDoc = replaceSection(contextDoc, 'Unanswered High-Leverage Questions', `
| Question | Impact | Owner | Status |
| --- | --- | --- | --- |
| \`Which minimum slice proves plan readiness?\` | \`This decides the chunk and validation mapping\` | \`planner\` | \`answered\` |
`);
  contextDoc = replaceSection(contextDoc, 'Success Rubric', `
| Outcome | Observable signal | Why it matters |
| --- | --- | --- |
| \`Condensed plan still passes the gate\` | \`raiola:plan-check returns planReady=true\` | \`Execute must stay blocked until the checked plan exists\` |
| \`Coverage stays explicit\` | \`EXECPLAN.md maps every requirement to a chunk and acceptance target\` | \`Open requirements should stay visible even in condensed mode\` |
`);
  contextDoc = replaceSection(contextDoc, 'Requirement List', `
| Requirement ID | Requirement | Type | Source | Notes |
| --- | --- | --- | --- | --- |
| \`R1\` | \`Condensed plan must still explain the user-visible capability slice\` | \`functional\` | \`user\` | \`This keeps the plan legible before execute\` |
| \`R2\` | \`Every open requirement must stay mapped to one chunk and one validation target\` | \`functional\` | \`user\` | \`This prevents silent coverage loss\` |
`);
  writeFile(targetRepo, 'docs/workflow/CONTEXT.md', contextDoc);

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceSection(execplanDoc, 'Chosen Strategy', `
- \`Use one capability slice to make the done criteria observable without adding extra ritual.\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Rejected Strategies', `
- \`Do not split the work into UI/API/model layers because that hides user-visible progress and weakens the gate.\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Rollback / Fallback', `
- \`If the stricter gate is noisy, keep the same coverage surfaces and tune the missing-field summary rather than removing the gate.\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Dependency Blockers', `
| Blocker | Type | Owner | Status | Unblock signal |
| --- | --- | --- | --- | --- |
| \`None currently\` | \`none\` | \`n/a\` | \`clear\` | \`No external blocker is holding the plan gate\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Wave Structure', `
| Wave | Chunks | Goal | Depends on |
| --- | --- | --- | --- |
| \`1\` | \`chunk-discuss-packet\` | \`Capture the planning spine in one pass\` | \`none\` |
| \`2\` | \`chunk-plan-gate\` | \`Prove the plan is execute-ready in one gate\` | \`chunk-discuss-packet\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Coverage Matrix', `
| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| \`R1\` | \`${milestoneLabel}\` | \`Show the condensed but complete capability slice\` | \`chunk-discuss-packet\` | \`AC1\` | \`The plan stays legible before execute\` |
| \`R2\` | \`${milestoneLabel}\` | \`Keep coverage and validation mapping explicit\` | \`chunk-plan-gate\` | \`AC2\` | \`Open requirements remain mapped and auditable\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Plan Chunk Table', `
| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Status |
| --- | --- | --- | --- | --- | --- |
| \`chunk-discuss-packet\` | \`Capture the condensed planning spine\` | \`The user can inspect the minimum checked plan in one place\` | \`none\` | \`1\` | \`planned\` |
| \`chunk-plan-gate\` | \`Prove plan readiness\` | \`One gate validates coverage, observability, and execute readiness\` | \`chunk-discuss-packet\` | \`2\` | \`planned\` |
`);
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  let validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  validationDoc = replaceSection(validationDoc, 'Acceptance Criteria', `
| Acceptance ID | Criterion | How to observe | Status |
| --- | --- | --- | --- |
| \`AC1\` | \`The condensed plan keeps the capability slice explicit\` | \`Open EXECPLAN.md and inspect the chosen strategy and chunk table\` | \`planned\` |
| \`AC2\` | \`Execute remains blocked until the checked plan passes\` | \`Run raiola:plan-check and confirm planReady=true only for the complete packet\` | \`planned\` |
`);
  validationDoc = replaceSection(validationDoc, 'User-visible Outcomes', `
| Outcome | How to observe | Status |
| --- | --- | --- |
| \`The user can ask for less ritual without losing the plan spine\` | \`step_fulfillment returns fulfilled_condensed only after the gate passes\` | \`planned\` |
| \`Open requirements remain visible\` | \`Coverage Matrix and Open Requirements still map to validation IDs\` | \`planned\` |
`);
  validationDoc = replaceSection(validationDoc, 'Regression Focus', `
| Area | Risk | Check |
| --- | --- | --- |
| \`Workflow control commands\` | \`Natural-language routing could drift\` | \`Run raiola:control for condensed plan, tempo, and parallel phrases\` |
| \`Plan gating\` | \`Execute could bypass the gate\` | \`Run step_fulfillment -> execute on an unready milestone and expect a block\` |
`);
  validationDoc = replaceSection(validationDoc, 'Validation Contract', `
| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| \`Phase 6 done criteria gate\` | \`node scripts/workflow/plan_check.js --json --sync --strict\` | \`planReady=true\` | \`Read the summary and confirm coverage / observability / anti-horizontal slicing all pass\` | \`tests/golden/workflow/README.md\` | \`audit\` | \`planned\` | \`docs/workflow/EXECPLAN.md\` | \`pending_sync\` |
| \`Execute guard\` | \`node scripts/workflow/next_step.js --json\` | \`The recommendation keeps execute gated until planReady=true\` | \`Read STATUS.md and confirm Context readiness stays behind the gate\` | \`tests/golden/workflow/README.md\` | \`audit\` | \`planned\` | \`docs/workflow/STATUS.md\` | \`pending_sync\` |
`);
  writeFile(targetRepo, 'docs/workflow/VALIDATION.md', validationDoc);
}

function seedOpenRequirements(targetRepo) {
  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceSection(execplanDoc, 'Open Requirements', `
| Requirement ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| \`R1\` | \`Keep the current workflow slice visible\` | \`open\` | \`Still active\` |
| \`R2\` | \`Preserve open requirement counts across tempo and resume\` | \`open\` | \`Still active\` |
| \`R3\` | \`Archive the completed requirement\` | \`closed\` | \`Already done\` |
`);
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);
}

test('phase 6 done criteria keeps plan skip as a checked condensed plan', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M18',
      '--name', 'Done criteria gate',
      '--goal', 'Translate plan skip into a checked condensed plan',
    ],
    targetRepo,
  );
  seedPlanReadyDocs(targetRepo);

  const successPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    targetRepo,
  ));

  assert.equal(successPayload.target, 'plan');
  assert.equal(successPayload.appliedMode, 'condensed');
  assert.equal(successPayload.state, 'fulfilled_condensed');
  assert.equal(successPayload.fulfilled, true);
  assert.equal(successPayload.gate.planReady, true);
  assert.deepEqual(successPayload.missingFields, []);

  const gapRepo = makeTempRepo();
  run('node', [initScript, '--target', gapRepo], repoRoot);
  run(
    'node',
    [
      path.join(gapRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M19',
      '--name', 'Done criteria gaps',
      '--goal', 'Return targeted missing fields when condensed plan is under-specified',
    ],
    gapRepo,
  );

  const gapPayload = JSON.parse(run(
    'node',
    [path.join(gapRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--utterance', 'plan kısmını geçelim', '--json'],
    gapRepo,
  ));

  assert.equal(gapPayload.target, 'plan');
  assert.equal(gapPayload.appliedMode, 'condensed');
  assert.equal(gapPayload.state, 'condensed_needs_inputs');
  assert.equal(gapPayload.fulfilled, false);
  assert.ok(gapPayload.missingFields.length > 0);
  assert.match(gapPayload.message, /Condensed plan icin eksik alanlar bunlar/);
});

test('phase 6 done criteria lets "hızlı geç" lower ritual without losing open requirement counts', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M20',
      '--name', 'Tempo done criteria',
      '--goal', 'Lower ritual without hiding open requirements',
    ],
    targetRepo,
  );
  seedOpenRequirements(targetRepo);

  const controlPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'control.js'), '--utterance', 'hızlı geç', '--json'],
    targetRepo,
  ));
  const tempoPayload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'tempo.js'), '--utterance', 'hızlı geç', '--json'],
    targetRepo,
  ));

  const statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  const contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.equal(controlPayload.intent.family, 'tempo_control');
  assert.equal(controlPayload.intent.mode, 'lite');
  assert.match(controlPayload.suggestedCommand, /raiola:tempo/);
  assert.equal(tempoPayload.scope, 'milestone');
  assert.equal(tempoPayload.workflowProfile, 'lite');
  assert.equal(tempoPayload.packetLoadingMode, 'delta');
  assert.equal(tempoPayload.tokenEfficiencyMeasures, 'auto');
  assert.equal(tempoPayload.openRequirementCount, 2);
  assert.match(statusDoc, /- Effective workflow profile: `lite`/);
  assert.match(contextDoc, /- Milestone profile override: `lite`/);
  assert.match(windowDoc, /- Token efficiency measures: `auto`/);
});

test('phase 6 done criteria preserves open requirement count and next one action across pause and resume', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M21',
      '--name', 'Resume done criteria',
      '--goal', 'Resume from checkpoint without losing continuity fields',
    ],
    targetRepo,
  );
  seedOpenRequirements(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'pause_work.js'),
      '--summary', 'Compact after the current milestone state is checkpointed',
      '--next', 'Resume with the first still-open requirement',
    ],
    targetRepo,
  );

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'resume_work.js'), '--json'],
    targetRepo,
  ));
  const handoffDoc = readFile(targetRepo, 'docs/workflow/HANDOFF.md');

  assert.equal(payload.nextOneAction, 'Resume with the first still-open requirement');
  assert.equal(payload.openRequirementCount, 2);
  assert.match(payload.openRequirements, /R1/);
  assert.match(payload.openRequirements, /R2/);
  assert.doesNotMatch(payload.openRequirements, /R3.*open/);
  assert.match(handoffDoc, /- Next one action: `Resume with the first still-open requirement`/);
});

test('phase 6 done criteria blocks execute from starting before the plan gate passes', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M22',
      '--name', 'Execute guard',
      '--goal', 'Never start execute without a checked plan',
    ],
    targetRepo,
  );

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = replaceField(statusDoc, 'Current milestone step', 'research');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'step_fulfillment.js'), '--target', 'execute', '--mode', 'explicit', '--json'],
    targetRepo,
  ));
  const statusAfter = readFile(targetRepo, 'docs/workflow/STATUS.md');

  assert.equal(payload.state, 'blocked_by_plan_gate');
  assert.equal(payload.fulfilled, false);
  assert.equal(payload.gate.planGate, 'pending');
  assert.match(payload.message, /Execute step cannot start before raiola:plan-check passes/);
  assert.match(statusAfter, /- Current milestone step: `research`/);
  assert.doesNotMatch(statusAfter, /- Current milestone step: `execute`/);
});

test('phase 6 done criteria keeps existing parallel natural-language activation intact', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M23',
      '--name', 'Parallel continuity',
      '--goal', 'Keep parallel activation working after the control-plane redesign',
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
  assert.match(parallelPayload.suggestedCommand, /raiola:delegation-plan/);
  assert.ok(
    nextPayload.recommendation.checklist.some(
      (item) => item.includes('raiola:control -- --utterance "<user request>"')
        && item.includes('raiola:delegation-plan'),
    ),
  );
});

test('phase 6 done criteria requires a checkpoint before compaction when the window warns', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M24',
      '--name', 'Checkpoint before compact',
      '--goal', 'Avoid blind compaction when the window warns',
    ],
    targetRepo,
  );

  let preferencesDoc = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  preferencesDoc = replaceField(preferencesDoc, 'Reserve floor tokens', '1000');
  preferencesDoc = replaceField(preferencesDoc, 'Must-handoff threshold', '500');
  preferencesDoc = replaceField(preferencesDoc, 'Stop-starting-new-work threshold', '200000');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', preferencesDoc);

  const payload = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'window_monitor.js'), '--sync', '--json'],
    targetRepo,
  ));
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.equal(payload.checkpointFreshness, 'no');
  assert.equal(payload.decision, 'do-not-start-next-step');
  assert.equal(payload.recommendedAction, 'checkpoint_then_compact');
  assert.equal(payload.checkpointRequiredBeforeCompaction, true);
  assert.match(windowDoc, /- Recommended action: `checkpoint_then_compact`/);
});

test('phase 6 done criteria keeps token-efficiency measures mode-aware and switchable', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  const autoFull = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'tempo.js'), '--mode', 'full', '--scope', 'repo', '--json'],
    targetRepo,
  ));
  const autoLite = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'tempo.js'), '--mode', 'lite', '--scope', 'repo', '--json'],
    targetRepo,
  ));

  let preferencesDoc = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  preferencesDoc = replaceField(preferencesDoc, 'Token efficiency measures', 'on');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', preferencesDoc);

  const forcedOn = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'tempo.js'), '--mode', 'full', '--scope', 'repo', '--json'],
    targetRepo,
  ));

  preferencesDoc = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  preferencesDoc = replaceField(preferencesDoc, 'Token efficiency measures', 'off');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', preferencesDoc);

  const forcedOff = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'tempo.js'), '--mode', 'lite', '--scope', 'repo', '--json'],
    targetRepo,
  ));
  const windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');

  assert.equal(autoFull.tokenEfficiencyMeasures, 'auto');
  assert.equal(autoFull.workflowProfile, 'full');
  assert.equal(autoFull.packetLoadingMode, 'continuity_first');
  assert.equal(autoLite.workflowProfile, 'lite');
  assert.equal(autoLite.packetLoadingMode, 'delta');
  assert.equal(forcedOn.tokenEfficiencyMeasures, 'on');
  assert.equal(forcedOn.packetLoadingMode, 'delta');
  assert.equal(forcedOff.tokenEfficiencyMeasures, 'off');
  assert.equal(forcedOff.packetLoadingMode, 'continuity_first');
  assert.match(windowDoc, /- Token efficiency measures: `off`/);
  assert.match(windowDoc, /- Packet loading mode: `continuity_first`/);
});
