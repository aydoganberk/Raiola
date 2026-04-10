const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');
const migrateScript = path.join(repoRoot, 'scripts', 'workflow', 'migrate.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase10-'));
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

function seedExecutePacketSurface(targetRepo) {
  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M17',
      '--name', 'Execute packet',
      '--goal', 'Keep execute read sets minimal and section-aware',
    ],
    targetRepo,
  );

  fs.mkdirSync(path.join(targetRepo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, 'src', 'demo.js'), 'export const demo = true;\n');

  let statusDoc = readFile(targetRepo, 'docs/workflow/STATUS.md');
  statusDoc = replaceField(statusDoc, 'Current milestone step', 'execute');
  writeFile(targetRepo, 'docs/workflow/STATUS.md', statusDoc);

  let contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  contextDoc = replaceSection(contextDoc, 'Touched Files', '- `src/demo.js`');
  writeFile(targetRepo, 'docs/workflow/CONTEXT.md', contextDoc);

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceSection(execplanDoc, 'Plan of Record', `
- Milestone: \`M17 - Execute packet\`
- Step owner: \`plan\`
- Plan status: \`ready_for_execute\`
- Plan-ready gate: \`pass\`
- Carryforward considered: \`None\`
- Run chunk id: \`chunk-1\`
- Run chunk hash: \`pending\`
- Chunk cursor: \`1/2\`
- Active wave: \`1/3\`
- Wave status: \`in_progress\`
- Wave advancement rule: \`dependency_free_only\`
- Worker orchestration: \`dependency_aware\`
- Commit granularity default: \`manual\`
- Atomic commit mode: \`off\`
- Completed items: \`None\`
- Remaining items: \`Finish execute and audit\`
- Resume from item: \`chunk-1\`
- Estimated packet tokens: \`0\`
- Estimated execution overhead: \`2000\`
- Estimated verify overhead: \`1000\`
- Minimum reserve: \`16000\`
- Safe in current window: \`yes\`
- Current run chunk:
  - \`chunk-1\`
- Next run chunk:
  - \`chunk-2\`
- Implementation checklist:
  - \`Implement the current execute slice\`
- Audit plan:
  - \`Check AC1 after execute\`
- Out-of-scope guardrails:
  - \`Stay inside the active execute slice\`
`);
  execplanDoc = replaceSection(execplanDoc, 'Open Requirements', `
| Requirement ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| \`R1\` | \`Keep execute packet loading focused on the current chunk\` | \`open\` | \`Maps to chunk-1\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Current Capability Slice', '- `Execute chunk-1 is the current capability slice`');
  execplanDoc = replaceSection(execplanDoc, 'Coverage Matrix', `
| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| \`R1\` | \`M17 - Execute packet\` | \`Load only the active execute slice\` | \`chunk-1\` | \`AC1\` | \`Execute should not reopen the whole planning packet\` |
`);
  execplanDoc = replaceSection(execplanDoc, 'Plan Chunk Table', `
| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Owner | Write scope | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| \`chunk-1\` | \`Focused execute slice\` | \`Implement the active execute work\` | \`none\` | \`1\` | \`main\` | \`src/demo.js\` | \`in_progress\` |
| \`chunk-2\` | \`Follow-up slice\` | \`Finish remaining work\` | \`chunk-1\` | \`2\` | \`main\` | \`src/demo.js\` | \`planned\` |
`);
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  let validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  validationDoc = replaceSection(validationDoc, 'Validation Core', `
- Acceptance criteria IDs: \`AC1\`
- Active validation IDs: \`AC1\`
- Primary verify command: \`node scripts/workflow/health.js --json\`
- Validation status: \`planned\`
- Audit readiness: \`planned\`
- Evidence source: \`docs/workflow/STATUS.md\`
`);
  validationDoc = replaceSection(validationDoc, 'Acceptance Criteria', `
| Acceptance ID | Criterion | How to observe | Status |
| --- | --- | --- | --- |
| \`AC1\` | \`Execute reads only the current chunk, open requirements, acceptance rows, and touched files\` | \`raiola:packet -- --step execute --json contains only the focused refs\` | \`planned\` |
`);
  writeFile(targetRepo, 'docs/workflow/VALIDATION.md', validationDoc);

  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--doc', 'context', '--step', 'discuss', '--sync'], targetRepo);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--doc', 'execplan', '--step', 'plan', '--sync'], targetRepo);
  run('node', [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--doc', 'validation', '--step', 'audit', '--sync'], targetRepo);
}

test('raiola:packet produces Packet v5 tiered read sets and omits cold refs on stable reruns', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = replaceSection(execplanDoc, 'Current Capability Slice', '- `Plan delta changed for the rerun test`');
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  const packet = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--step', 'plan', '--json'],
    targetRepo,
  ));

  assert.equal(packet.packetVersion, '5');
  assert.equal(packet.packetLoadingMode, 'delta');
  assert.equal(packet.tokenEfficiencyMeasures, 'auto');
  assert.equal(packet.hashDrift, true);
  assert.ok(packet.readSetTiers.tierA.length > 0);
  assert.ok(packet.readSetTiers.tierAOmitted.length > 0);
  assert.ok(packet.readSetTiers.tierBOmitted.length > 0);
  assert.ok(packet.readSetTiers.tierC.length > 0);
  assert.equal(packet.readSetTiers.tierCOmitted.length, 0);
  assert.ok(packet.unchangedSectionRefsOmittedCount > 0);
  assert.equal(packet.coldRefsOmittedCount, 0);
  assert.ok(packet.continuityReadSet.length >= packet.recommendedReadSet.length);
  assert.ok(packet.readSetTiers.tierA.every((ref) => ref.includes('#')));
  assert.ok(packet.readSetTiers.tierAOmitted.every((ref) => ref.includes('#')));
});

test('raiola:packet keeps execute read sets focused on current chunk, acceptance rows, and touched files', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  seedExecutePacketSurface(targetRepo);

  const packet = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--step', 'execute', '--json'],
    targetRepo,
  ));

  assert.equal(packet.packetVersion, '5');
  assert.equal(packet.hashDrift, false);
  assert.equal(packet.readSetTiers.tierC.length, 0);
  assert.ok(packet.readSetTiers.tierCOmitted.length > 0);
  assert.ok(packet.recommendedReadSet.some((ref) => ref.includes('EXECPLAN.md#Plan Chunk Table (chunk-1)')));
  assert.ok(packet.recommendedReadSet.some((ref) => ref.includes('EXECPLAN.md#Coverage Matrix (open requirements)')));
  assert.ok(packet.recommendedReadSet.some((ref) => ref.includes('VALIDATION.md#Acceptance Criteria (active validation IDs)')));
  assert.ok(packet.recommendedReadSet.some((ref) => ref.includes('CONTEXT.md#Touched Files')));
  assert.ok(packet.recommendedReadSet.includes('src/demo.js'));
  assert.ok(!packet.recommendedReadSet.includes('docs/workflow/PROJECT.md'));
  assert.ok(!packet.recommendedReadSet.includes('docs/workflow/RUNTIME.md'));
});

test('raiola:migrate seeds Packet v5 sections into older docs without overwriting custom content', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  let contextDoc = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  contextDoc = contextDoc.replace(/^- Packet version: `.*?`$/m, '- Packet version: `3`');
  contextDoc = contextDoc.replace(/\n## Intent Core[\s\S]*?\n## Discuss Breakdown\n/m, '\n## Discuss Breakdown\n');
  contextDoc += '\n- `custom context marker`\n';
  writeFile(targetRepo, 'docs/workflow/CONTEXT.md', contextDoc);

  let execplanDoc = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  execplanDoc = execplanDoc.replace(/^- Packet version: `.*?`$/m, '- Packet version: `4`');
  execplanDoc = execplanDoc.replace(/\n## Delivery Core[\s\S]*?\n## Open Requirements\n/m, '\n## Open Requirements\n');
  writeFile(targetRepo, 'docs/workflow/EXECPLAN.md', execplanDoc);

  let validationDoc = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  validationDoc = validationDoc.replace(/^- Packet version: `.*?`$/m, '- Packet version: `4`');
  validationDoc = validationDoc.replace(/\n## Validation Core[\s\S]*?\n## Acceptance Criteria\n/m, '\n## Acceptance Criteria\n');
  writeFile(targetRepo, 'docs/workflow/VALIDATION.md', validationDoc);

  let windowDoc = readFile(targetRepo, 'docs/workflow/WINDOW.md');
  windowDoc = windowDoc.replace(/^.*Packet loading mode.*$\n?/m, '');
  windowDoc = windowDoc.replace(/^.*Loaded packet size.*$\n?/m, '');
  windowDoc = windowDoc.replace(/^.*Unchanged refs omitted.*$\n?/m, '');
  windowDoc = windowDoc.replace(/^.*Core packet size.*$\n?/m, '');
  windowDoc = windowDoc.replace(/^.*Cold refs omitted.*$\n?/m, '');
  windowDoc = windowDoc.replace(/\n## Packet Tier Summary[\s\S]*?\n## Artifact Estimate\n/m, '\n## Artifact Estimate\n');
  writeFile(targetRepo, 'docs/workflow/WINDOW.md', windowDoc);

  let preferencesDoc = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  preferencesDoc = preferencesDoc.replace(/^.*Token efficiency measures.*$\n?/m, '');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', preferencesDoc);

  run('node', [migrateScript, '--target', targetRepo], repoRoot);

  const contextAfter = readFile(targetRepo, 'docs/workflow/CONTEXT.md');
  const execplanAfter = readFile(targetRepo, 'docs/workflow/EXECPLAN.md');
  const validationAfter = readFile(targetRepo, 'docs/workflow/VALIDATION.md');
  const windowAfter = readFile(targetRepo, 'docs/workflow/WINDOW.md');
  const preferencesAfter = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');

  assert.match(contextAfter, /- Packet version: `5`/);
  assert.match(contextAfter, /## Intent Core/);
  assert.match(contextAfter, /custom context marker/);
  assert.match(execplanAfter, /- Packet version: `5`/);
  assert.match(execplanAfter, /## Delivery Core/);
  assert.match(validationAfter, /- Packet version: `5`/);
  assert.match(validationAfter, /## Validation Core/);
  assert.match(preferencesAfter, /- Token efficiency measures: `auto`/);
  assert.match(windowAfter, /- Packet loading mode: `delta`/);
  assert.match(windowAfter, /- Loaded packet size: `\d+`/);
  assert.match(windowAfter, /- Unchanged refs omitted: `\d+`/);
  assert.match(windowAfter, /- Core packet size: `\d+`/);
  assert.match(windowAfter, /- Cold refs omitted: `\d+`/);
  assert.match(windowAfter, /## Packet Tier Summary/);
  assert.match(windowAfter, /## Checkpoint Guard/);
});

test('raiola:packet can disable token efficiency measures and force continuity-first loading', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);

  let preferencesDoc = readFile(targetRepo, 'docs/workflow/PREFERENCES.md');
  preferencesDoc = replaceField(preferencesDoc, 'Token efficiency measures', 'off');
  writeFile(targetRepo, 'docs/workflow/PREFERENCES.md', preferencesDoc);

  const packet = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'build_packet.js'), '--step', 'plan', '--json'],
    targetRepo,
  ));

  assert.equal(packet.packetLoadingMode, 'continuity_first');
  assert.equal(packet.tokenEfficiencyMeasures, 'off');
  assert.equal(packet.readSetTiers.tierAOmitted.length, 0);
  assert.equal(packet.readSetTiers.tierBOmitted.length, 0);
  assert.equal(packet.unchangedSectionRefsOmittedCount, 0);
  assert.ok(packet.readSetTiers.tierA.length > 0);
  assert.ok(packet.readSetTiers.tierB.length > 0);
  assert.ok(packet.readSetTiers.tierC.length > 0);
  assert.equal(packet.coldRefsOmittedCount, 0);
  assert.ok(packet.recommendedReadSet.some((ref) => ref === 'docs/workflow/PREFERENCES.md'));
});
