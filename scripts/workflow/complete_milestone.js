const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  controlPaths,
  currentBranch,
  extractSection,
  fileCoveredByStagePath,
  listGitChanges,
  loadPreferences,
  normalizeStagePath,
  parseArgs,
  parseArchivedMilestones,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseWorkstreamTable,
  read,
  renderArchivedMilestones,
  renderMemorySection,
  renderMilestoneTable,
  renderOpenItems,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceOrAppendSection,
  replaceSection,
  resolveWorkflowRoot,
  runGit,
  setActiveMilestoneCard,
  slugify,
  syncPacketHash,
  syncWindowDocument,
  today,
  toList,
  validateValidationContract,
  warnAgentsSize,
  workflowPaths,
  write,
  ensureDir,
  computeWindowStatus,
} = require('./common');

function printHelp() {
  console.log(`
complete_milestone

Usage:
  node scripts/workflow/complete_milestone.js --agents-review unchanged --summary "Milestone completed"

Options:
  --root <path>               Workflow root. Default: active workstream root
  --id <milestone-id>         Optional. Defaults to current active milestone
  --summary <text>            Optional completion summary
  --next <text>               Optional next milestone recommendation
  --carryforward <a|b|c>      Optional carryforward items. Use | to separate multiple items
  --agents-review <value>     Required. Example: updated, unchanged
  --stage-paths <a,b,c>       Optional extra paths to stage with workflow files
  --allow-workflow-only       Allow docs-only workflow commit when other repo changes exist
  --commit-message <text>     Optional custom commit message
  --no-git                    Skip git add/commit/push
  --no-push                   Commit but skip push
  --dry-run                   Preview changes and git actions without writing
  `);
}

function updateWorkstreamRegistry(registryPath, rootDir, packetHash, budgetStatus, health) {
  let workstreams = read(registryPath);
  const table = parseWorkstreamTable(workstreams);
  const relativeRoot = path.relative(process.cwd(), rootDir).replace(/\\/g, '/');
  table.rows.forEach((row) => {
    if (row.root === relativeRoot) {
      row.status = 'active';
      row.currentMilestone = 'NONE';
      row.step = 'complete';
      row.packetHash = packetHash;
      row.budgetStatus = budgetStatus;
      row.health = health;
    }
  });
  workstreams = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(table.headerLines, table.rows));
  write(registryPath, workstreams);
}

function runHealthStrict(rootDir) {
  childProcess.execFileSync(process.execPath, [path.join(__dirname, 'health.js'), '--root', rootDir, '--strict'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const rootDir = resolveWorkflowRoot(process.cwd(), args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const dryRun = Boolean(args['dry-run']);
  const noGit = Boolean(args['no-git']);
  const agentsReview = String(args['agents-review'] || '').trim();
  const preferences = loadPreferences(paths);
  const noPush = Boolean(args['no-push']) || !preferences.autoPush;
  const requireStrictHealth = Boolean(preferences.healthStrictRequired);

  if (!agentsReview) {
    throw new Error('--agents-review is required');
  }

  let execplan = read(paths.execplan);
  let status = read(paths.status);
  let milestones = read(paths.milestones);
  let context = read(paths.context);
  const contextBefore = context;
  let carryforward = read(paths.carryforward);
  let memory = fs.existsSync(paths.memory) ? read(paths.memory) : null;
  let validation = read(paths.validation);
  let handoff = read(paths.handoff);
  let window = read(paths.window);

  const milestoneTable = parseMilestoneTable(milestones);
  const activeRow = milestoneTable.rows.find((row) => row.status === 'active');
  if (!activeRow) {
    throw new Error('No active milestone found');
  }

  if (args.id && String(args.id).trim() !== activeRow.milestone) {
    throw new Error(`Active milestone is ${activeRow.milestone}, not ${args.id}`);
  }

  const summary = String(args.summary || 'Milestone completed and archived').trim();
  const nextMilestone = String(args.next || 'Ready to plan the next milestone').trim();
  const carryforwardItems = toList(args.carryforward);
  const allowWorkflowOnly = Boolean(args['allow-workflow-only']);
  const milestonesRef = path.relative(process.cwd(), paths.milestones).replace(/\\/g, '/');
  const workstreamsRef = path.relative(process.cwd(), controlPaths(process.cwd()).workstreams).replace(/\\/g, '/');
  const execplanRef = path.relative(process.cwd(), paths.execplan).replace(/\\/g, '/');
  const validationRef = path.relative(process.cwd(), paths.validation).replace(/\\/g, '/');
  const statusRef = path.relative(process.cwd(), paths.status).replace(/\\/g, '/');
  const goldenRef = path.join('tests', 'golden', path.basename(rootDir), 'README.md').replace(/\\/g, '/');
  const testsRun = extractSection(status, 'Tests Run');
  const risks = extractSection(status, 'Risks');
  const verified = extractSection(status, 'Verified');
  const inferred = extractSection(status, 'Inferred');
  const unknown = extractSection(status, 'Unknown');
  const planOfRecord = extractSection(execplan, 'Plan of Record');
  const activeCard = extractSection(milestones, 'Active Milestone Card');
  const validationSnapshot = validation.trim();
  const handoffSnapshot = handoff.trim();
  const windowSnapshot = window.trim();
  const clearedMemoryEntries = memory
    ? parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
      .map((entry) => parseMemoryEntry(entry))
      .filter((entry) => entry.fields.Milestone === `${activeRow.milestone} - ${activeRow.goal}`)
    : [];

  syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  const execplanPacket = syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  const validationPacket = syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  const activeWindowStatus = syncWindowDocument(paths, computeWindowStatus(paths));

  const validationIssues = validateValidationContract(paths).filter((item) => item.status === 'fail');
  if (validationIssues.length > 0) {
    throw new Error(`Validation contract incomplete: ${validationIssues.map((item) => item.message).join('; ')}`);
  }

  if (requireStrictHealth) {
    try {
      runHealthStrict(rootDir);
    } catch (error) {
      throw new Error(`raiola:health --strict failed before complete: ${String(error.stderr || error.stdout || error.message).trim()}`);
    }
  }

  const archiveName = `${activeRow.milestone}-${slugify(activeRow.goal) || 'milestone'}.md`;
  const archivePath = path.join(paths.archiveDir, archiveName);
  const archiveContent = `# ${activeRow.milestone} - ${activeRow.goal}

- Phase: \`${activeRow.phase}\`
- Status: \`done\`
- Archive created: \`${today()}\`
- Exit criteria:
  - \`${activeRow.exitCriteria}\`
- AGENTS review:
  - \`${agentsReview}\`

## Summary

- \`${summary}\`

## Active Card Snapshot

${activeCard}

## Plan of Record Snapshot

${planOfRecord}

## Final Context Snapshot

${contextBefore.trim()}

## Status Snapshot

### Verified

${verified}

### Inferred

${inferred}

### Unknown

${unknown}

## Verification

${testsRun}

## Residual Risks

${risks}

## Carryforward

${carryforwardItems.length === 0 ? '- `No carryforward items selected`' : carryforwardItems.map((item) => `- \`${item}\``).join('\n')}

## Packet Snapshot

- \`Execplan packet hash: ${execplanPacket.inputHash}\`
- \`Validation packet hash: ${validationPacket.inputHash}\`
- \`Window decision at closeout: ${activeWindowStatus.decision}\`

## Validation Snapshot

${validationSnapshot}

## Handoff Snapshot

${handoffSnapshot}

## Window Snapshot

${windowSnapshot}

## Cleared Memory Recall Items

${clearedMemoryEntries.length === 0 ? '- `No cleared active memory notes`' : clearedMemoryEntries.map((entry) => (
  `- \`${entry.date} | ${entry.title}\`
  - \`Note: ${entry.fields.Note || 'None'}\`
  - \`Step: ${entry.fields.Step || 'unknown'}\`
  - \`Source: ${entry.fields.Source || 'user-triggered'}\``
)).join('\n')}

## Suggested Next Milestone

- \`${nextMilestone}\`
`;

  const remainingRows = milestoneTable.rows.filter((row) => row.milestone !== activeRow.milestone);
  milestones = replaceSection(
    milestones,
    'Milestone Table',
    renderMilestoneTable(milestoneTable.headerLines, remainingRows),
  );

  const archived = parseArchivedMilestones(milestones);
  archived.push(`- \`${activeRow.milestone}\` -> \`${path.relative(process.cwd(), archivePath)}\``);
  milestones = replaceSection(milestones, 'Archived Done Milestones', renderArchivedMilestones(archived));
  milestones = setActiveMilestoneCard(milestones, `
- Milestone: \`NONE\`
- Phase: \`Idle\`
- Status: \`idle\`
- Step: \`complete\`
- Goal:
  - \`Wait until the next milestone is explicitly opened\`
- Success signal:
  - \`The next milestone is explicitly defined by the user\`
- Non-goals:
  - \`Keeping historical milestone details on this card\`
- Discuss mode:
  - \`${preferences.discussMode}\`
- Discuss breakdown:
  - \`intent capture -> user intent + requirement list\`
  - \`constraint extraction -> explicit constraints + unanswered high-leverage questions\`
  - \`execution shaping -> alternatives considered + success rubric\`
- Clarifying questions / assumptions:
  - \`Fill this when the next milestone opens\`
- Seed intake:
  - \`No open seeds yet\`
- Active recall intake:
  - \`No active milestone\`
- Research target files:
  - \`Fill this when the next milestone opens\`
- Plan checklist:
  - \`Fill this when the next milestone opens\`
- Execute notes:
  - \`None\`
- Audit checklist:
  - \`None\`
- Completion note:
  - \`${activeRow.milestone} was archived\`
`);

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', 'Phase 0 - Idle');
  status = replaceField(status, 'Current milestone', 'NONE');
  status = replaceField(status, 'Current milestone step', 'complete');
  status = replaceField(status, 'Effective workflow profile', preferences.repoWorkflowProfile);
  status = replaceField(status, 'Automation mode', preferences.repoAutomationMode);
  status = replaceField(status, 'Automation status', 'idle');
  status = replaceField(status, 'Context readiness', 'frozen_until_next_milestone');
  status = replaceSection(status, 'In Progress', '- `Workflow surface is idle; waiting for the next milestone`');
  status = replaceSection(status, 'Verified', [
    `- \`${activeRow.milestone} was archived\``,
    '- `Validation snapshot and packet hash were moved into the archive`',
  ].join('\n'));
  status = replaceSection(status, 'Inferred', '- `The next milestone will open with a fresh packet set`');
  status = replaceSection(status, 'Unknown', '- `The next milestone scope is not known yet`');
  status = replaceSection(status, 'Next', [
    '- `Open a new milestone if the user explicitly wants workflow`',
    '- `Use raiola:next to get the idle recommendation`',
  ].join('\n'));
  status = replaceSection(status, 'Risks', '- `There is no active milestone`');
  status = replaceSection(status, 'Suggested Next Step', '- `Open the next milestone if the user explicitly wants workflow`');

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Milestone', 'NONE');
  context = replaceField(context, 'Milestone profile override', 'none');
  context = replaceField(context, 'Step source', 'discuss');
  context = replaceField(context, 'Context status', 'idle_until_milestone');
  context = replaceField(context, 'Discuss subphase', 'intent_capture');
  context = replaceField(context, 'Automation mode', preferences.repoAutomationMode);
  context = replaceField(context, 'Automation status', 'idle');
  context = replaceField(context, 'Plan readiness', 'not_ready');
  context = replaceField(context, 'Packet version', '5');
  context = replaceField(context, 'Input hash', 'pending_sync');
  context = replaceField(context, 'Confidence summary', 'mixed_idle_surface');
  context = replaceSection(context, 'Problem Frame', `
- Goal:
  - \`Provide a clean starting surface for the next workflow milestone if the user wants one\`
- Success signal:
  - \`When the user explicitly defines the next milestone, this file can be filled for it\`
- Non-goals:
  - \`Starting a workflow milestone without the user's request\`
`);
  context = replaceSection(context, 'Discuss Breakdown', [
    '- `Intent capture -> turn the user request into concrete intent and requirements`',
    '- `Constraint extraction -> surface explicit constraints and unanswered high-leverage questions`',
    '- `Execution shaping -> compare approaches before execution and validation start`',
  ].join('\n'));
  context = replaceSection(context, 'User Intent', `
- Primary request:
  - \`Fill this when the next milestone opens\`
- Why this matters now:
  - \`Capture the user-facing reason before planning starts\`
- In-scope outcome:
  - \`Describe the smallest meaningful capability we are trying to land\`
`);
  context = replaceSection(context, 'Explicit Constraints', `
| Constraint | Type | Source | Impact |
| --- | --- | --- | --- |
| \`Fill when the next milestone opens\` | \`scope\` | \`user\` | \`Planning should not start until constraints are explicit\` |
`);
  context = replaceSection(context, 'Alternatives Considered', `
| Option | Status | Why |
| --- | --- | --- |
| \`Fill when the next milestone opens\` | \`open\` | \`Document the main alternatives before choosing a strategy\` |
`);
  context = replaceSection(context, 'Unanswered High-Leverage Questions', `
| Question | Impact | Owner | Status |
| --- | --- | --- | --- |
| \`Fill when the next milestone opens\` | \`Open questions can change the plan shape\` | \`owner\` | \`open\` |
`);
  context = replaceSection(context, 'Success Rubric', `
| Outcome | Observable signal | Why it matters |
| --- | --- | --- |
| \`Fill when the next milestone opens\` | \`Describe how success would be observed\` | \`A plan is only ready when success is observable\` |
`);
  context = replaceSection(context, 'Requirement List', `
| Requirement ID | Requirement | Type | Source | Notes |
| --- | --- | --- | --- | --- |
| \`R0\` | \`Fill when the next milestone opens\` | \`functional\` | \`user\` | \`Replace this placeholder with real requirements\` |
`);
  context = replaceSection(context, 'Codebase Scan Summary', [
    '- `Workflow surface returned to idle state`',
    `- \`${activeRow.milestone} was moved under the archive\``,
  ].join('\n'));
  context = replaceSection(context, 'Clarifying Questions / Assumptions', `
| Claim | Confidence | Evidence refs | Failure mode |
| --- | --- | --- | --- |
| Workflow will be used only when the user explicitly asks for it | Confident | AGENTS.md; .agents/skills/raiola/SKILL.md | Scope drifts if workflow activates without request |
| A single user request can still be modeled as one milestone when needed | Likely | AGENTS.md; ${milestonesRef} | Milestone granularity becomes inconsistent |
`);
  context = replaceSection(context, 'Claim Ledger', `
| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| The workflow surface is designed as explicit opt-in | source-backed | AGENTS.md; .agents/skills/raiola/SKILL.md | Confident | Agents may open workflow unnecessarily |
| The current root has enough canonical files for idle state | source-backed | ${workstreamsRef}; ${execplanRef}; ${validationRef} | Likely | A new milestone may open with an incomplete packet |
`);
  context = replaceSection(context, 'Unknowns', `
| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| When the next active milestone will be opened | Packet contents will change with milestone scope | user | open |
`);
  context = replaceSection(context, 'Research Targets', '- `Fill this when the user opens a milestone`');
  context = replaceSection(context, 'Touched Files', '- `Fill this when a workflow milestone opens`');
  context = replaceSection(context, 'Risks', '- `There is no active milestone`');
  context = replaceSection(context, 'What Would Falsify This Plan?', [
    '- `If workflow is not explicit-only, the current problem frame is wrong`',
    '- `If WORKSTREAMS.md moved the active root elsewhere, this packet becomes stale`',
  ].join('\n'));
  context = replaceSection(context, 'Ready For Plan', '- `No`');

  execplan = replaceField(execplan, 'Packet version', '5');
  execplan = replaceOrAppendField(execplan, 'Input hash', 'pending_sync');
  execplan = replaceField(execplan, 'Active milestone', 'NONE');
  execplan = replaceField(execplan, 'Active milestone step', 'complete');
  execplan = replaceField(execplan, 'Current phase', 'Phase 0 - Idle');
  execplan = replaceSection(execplan, 'Plan of Record', `
- Milestone: \`NONE\`
- Step owner: \`plan\`
- Plan status: \`idle_until_user_opens_milestone\`
- Plan-ready gate: \`pending\`
- Carryforward considered: \`${carryforwardItems.length === 0 ? 'None' : carryforwardItems.join('; ')}\`
- Run chunk id: \`NONE\`
- Run chunk hash: \`pending\`
- Chunk cursor: \`0/0\`
- Active wave: \`0/3\`
- Wave status: \`idle\`
- Wave advancement rule: \`dependency_free_only\`
- Worker orchestration: \`dependency_aware\`
- Commit granularity default: \`${preferences.commitGranularity}\`
- Atomic commit mode: \`off\`
- Completed items: \`None\`
- Remaining items: \`Open the next milestone if needed\`
- Resume from item: \`Milestone open\`
- Estimated packet tokens: \`0\`
- Estimated execution overhead: \`2000\`
- Estimated verify overhead: \`1000\`
- Minimum reserve: \`${preferences.reserveFloorTokens}\`
- Safe in current window: \`yes\`
- Current run chunk:
  - \`None\`
- Next run chunk:
  - \`Open the next milestone if the user wants workflow\`
- Implementation checklist:
  - \`None\`
- Audit plan:
  - \`None\`
- Out-of-scope guardrails:
  - \`Do not start milestone planning without the user's request\`
`);
  execplan = replaceSection(execplan, 'Chosen Strategy', '- `Fill when the next milestone reaches planning`');
  execplan = replaceSection(execplan, 'Wave Execution Policy', `
- \`Execute follows wave 1 -> wave 2 -> wave 3.\`
- \`Wave 1 carries dependency-free foundation or prep slices.\`
- \`Wave 2 may start only after wave 1 is integrated and only for work that depends on completed wave 1 outputs.\`
- \`Wave 3 closes the execute loop with final integration, shared-surface work, or execution-level cleanup.\`
- \`Only dependency-free chunks may share a wave. If a dependency is unclear, serialize it or move it to a later wave.\`
- \`Every write-capable chunk must name an owner and explicit write scope before a worker can be opened.\`
- \`Unused waves must be marked not needed rather than omitted so resume logic can see the intended execution shape.\`
`);
  execplan = replaceSection(execplan, 'Rejected Strategies', '- `Document rejected strategies during the next milestone`');
  execplan = replaceSection(execplan, 'Rollback / Fallback', '- `Describe rollback or fallback before the next milestone executes`');
  execplan = replaceSection(execplan, 'Dependency Blockers', `
| Blocker | Type | Owner | Status | Unblock signal |
| --- | --- | --- | --- | --- |
| \`None currently\` | \`none\` | \`n/a\` | \`clear\` | \`Replace this row if a real blocker appears\` |
`);
  execplan = replaceSection(execplan, 'Wave Structure', `
| Wave | Chunks | Goal | Depends on | Parallel rule | Owners / write scope | Integration order | Commit boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| \`1\` | \`chunk-1\` | \`Dependency-free foundation or prep slice\` | \`none\` | \`Only independent chunks may run together\` | \`Fill owners and paths\` | \`Integrate wave 1 before wave 2 opens\` | \`manual\` |
| \`2\` | \`chunk-2\` | \`Build on completed wave 1 outputs\` | \`wave-1\` | \`Only chunks that depend only on completed wave 1 work\` | \`Fill owners and paths\` | \`Integrate after all wave 2 work is complete\` | \`manual\` |
| \`3\` | \`chunk-3\` | \`Final integration, shared-surface work, or execute closeout\` | \`wave-1, wave-2\` | \`Prefer serialized or narrowly parallel work\` | \`Fill owners and paths\` | \`Close execute before audit begins\` | \`manual\` |
`);
  execplan = replaceSection(execplan, 'Coverage Matrix', `
| Requirement ID | Milestone | Capability slice | Plan chunk | Validation ID | Notes |
| --- | --- | --- | --- | --- | --- |
| \`R0\` | \`NONE\` | \`Fill when the next milestone reaches planning\` | \`chunk-1\` | \`AC0\` | \`Replace this placeholder before execute\` |
`);
  execplan = replaceSection(execplan, 'Plan Chunk Table', `
| Chunk ID | Capability slice | Deliverable | Depends on | Wave | Owner | Write scope | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| \`chunk-1\` | \`Fill when the next milestone reaches planning\` | \`Describe the dependency-free slice this chunk delivers\` | \`none\` | \`1\` | \`main\` | \`Fill owned paths before execute\` | \`pending\` |
| \`chunk-2\` | \`Fill when the next milestone reaches planning\` | \`Describe the wave 2 slice this chunk delivers\` | \`chunk-1\` | \`2\` | \`main\` | \`Fill owned paths before execute\` | \`pending\` |
| \`chunk-3\` | \`Fill when the next milestone reaches planning\` | \`Describe the wave 3 integration slice this chunk delivers\` | \`chunk-1, chunk-2\` | \`3\` | \`main\` | \`Fill owned paths before execute\` | \`pending\` |
`);
  execplan = replaceSection(execplan, 'Commit Policy', `
- \`Preference source: PREFERENCES.md -> Commit granularity\`
- \`Commit granularity: ${preferences.commitGranularity}\`
- \`Atomic commit mode: off\`
- \`If atomic commit mode = wave, only commit after a whole wave has been integrated.\`
- \`If atomic commit mode = chunk, only commit after a single chunk has been integrated.\`
- \`If atomic commit mode = off, stay manual and use the normal milestone closeout path unless the user explicitly wants otherwise.\`
`);

  carryforward = replaceSection(carryforward, 'Open Items', renderOpenItems(carryforwardItems));
  if (memory) {
    const activeEntries = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'No active recall notes yet')
      .map((entry) => parseMemoryEntry(entry))
      .filter((entry) => entry.fields.Milestone !== `${activeRow.milestone} - ${activeRow.goal}`);
    memory = replaceField(memory, 'Last updated', today());
    memory = replaceField(memory, 'Status', 'active_recall_plus_durable');
    memory = replaceSection(memory, 'Active Recall Items', renderMemorySection(activeEntries, 'No active recall notes yet'));
  }
  validation = replaceField(validation, 'Last updated', today());
  validation = replaceField(validation, 'Active milestone', 'NONE');
  validation = replaceField(validation, 'Validation status', 'idle_until_milestone');
  validation = replaceField(validation, 'Audit readiness', 'not_ready');
  validation = replaceField(validation, 'Packet version', '5');
  validation = replaceField(validation, 'Input hash', 'pending_sync');
  validation = replaceOrAppendField(validation, 'Frontend mode', 'inactive');
  validation = replaceOrAppendField(validation, 'Frontend profile ref', path.relative(process.cwd(), path.join(paths.rootDir, 'FRONTEND_PROFILE.md')).replace(/\\/g, '/'));
  validation = replaceOrAppendField(validation, 'Frontend profile json', '.workflow/frontend-profile.json');
  validation = replaceOrAppendField(validation, 'Frontend adapter route', 'none');
  validation = replaceOrAppendField(validation, 'Visual verdict required', 'no');
  validation = replaceSection(validation, 'Success Contract', '- `To be filled by the next milestone research/plan`');
  validation = replaceSection(validation, 'Acceptance Criteria', `
| Acceptance ID | Criterion | How to observe | Status |
| --- | --- | --- | --- |
| \`AC0\` | \`Fill when the next milestone opens\` | \`Describe the observable signal that proves this criterion\` | \`pending\` |
`);
  validation = replaceSection(validation, 'User-visible Outcomes', `
| Outcome | How to observe | Status |
| --- | --- | --- |
| \`Fill when the next milestone opens\` | \`Describe what the user should be able to see or do\` | \`pending\` |
`);
  validation = replaceSection(validation, 'Regression Focus', `
| Area | Risk | Check |
| --- | --- | --- |
| \`Fill when the next milestone opens\` | \`Document what could regress\` | \`Describe the regression-oriented check\` |
`);
  validation = replaceOrAppendSection(validation, 'Frontend Audit Mode', `
- \`Frontend mode: inactive\`
- \`Activation reason: workflow_active_without_frontend_signals\`
- \`Activation signals: none\`
- \`Design-system aware execution: no\`
- \`Adapter route: none\`
- \`Preview/browser verification need: no\`
- \`Visual verdict required: no\`
`);
  validation = replaceSection(validation, 'Verification Attachments', '- `Optionally add VERIFICATION_BRIEF.md or TEST_SPEC.md when the next milestone needs deeper verification planning`');
  validation = replaceOrAppendSection(validation, 'Visual Verdict', `
| Verdict area | Expectation | How to observe | Evidence expectation | Status |
| --- | --- | --- | --- | --- |
| \`responsive\` | \`Fill when frontend mode is active\` | \`Describe viewport or breakpoint proof\` | \`Screenshot or browser-verify note\` | \`optional\` |
| \`interaction\` | \`Fill when frontend mode is active\` | \`Describe key interaction checks\` | \`Manual note, test output, or browser trace\` | \`optional\` |
| \`visual consistency\` | \`Fill when frontend mode is active\` | \`Describe design-system or visual review\` | \`Review note plus screenshot evidence when relevant\` | \`optional\` |
| \`component reuse\` | \`Fill when frontend mode is active\` | \`Describe shared component/design-system reuse\` | \`Diff review note\` | \`optional\` |
| \`accessibility smoke\` | \`Fill when frontend mode is active\` | \`Describe semantic/focus/label smoke checks\` | \`Manual note or tool output\` | \`optional\` |
| \`screenshot evidence\` | \`Fill when frontend mode is active\` | \`Describe the screenshot or visual artifact\` | \`Screenshot path, URL, or explicit note\` | \`optional\` |
`);
  validation = replaceSection(validation, 'Validation Contract', `
| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workflow idle validation surface | node scripts/workflow/doctor.js --strict | 0 fail | Idle workflow summary aligns with STATUS.md | ${goldenRef} | audit | pending | ${statusRef} | pending_sync |
`);
  validation = replaceSection(validation, 'Audit Notes', `- \`${activeRow.milestone} completed and the validation snapshot was moved into the archive\``);
  validation = replaceSection(validation, 'Completion Gate', '- `To be filled by the next milestone`');

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Handoff status', 'idle');
  handoff = replaceField(handoff, 'Milestone', 'NONE');
  handoff = replaceField(handoff, 'Step', 'complete');
  handoff = replaceField(handoff, 'Automation mode', preferences.repoAutomationMode);
  handoff = replaceField(handoff, 'Automation status', 'idle');
  handoff = replaceField(handoff, 'Resume anchor', 'Milestone open');
  handoff = replaceField(handoff, 'Packet hash', 'pending_sync');
  handoff = replaceField(handoff, 'Current chunk cursor', '0/0');
  handoff = replaceField(handoff, 'Expected first command', 'npm run raiola:health -- --strict');
  handoff = replaceSection(handoff, 'Snapshot', `- \`${activeRow.milestone} was completed\``);
  handoff = replaceSection(handoff, 'Immediate Next Action', '- `Plan the next milestone or switch workstreams`');
  handoff = replaceSection(handoff, 'Execution Cursor', `
- \`Completed checklist items: Milestone complete\`
- \`Remaining items: Open the next milestone if needed\`
- \`Next unread canonical refs: ${path.relative(process.cwd(), paths.workstreams || controlPaths(process.cwd()).workstreams)}; ${path.relative(process.cwd(), paths.context)}\`
`);
  handoff = replaceSection(handoff, 'Packet Snapshot', `
- \`Packet hash: pending_sync\`
- \`Current run chunk: NONE\`
- \`Chunk cursor: 0/0\`
`);
  handoff = replaceSection(handoff, 'Files To Reopen', `
- \`${path.relative(process.cwd(), paths.milestones)}\`
- \`${path.relative(process.cwd(), paths.status)}\`
- \`${path.relative(process.cwd(), paths.window)}\`
`);
  handoff = replaceSection(handoff, 'Risks', '- `Do not reuse active context before a new milestone is opened`');

  window = replaceField(window, 'Last updated', today());
  window = replaceField(window, 'Session id', 'pending_sync');
  window = replaceField(window, 'Current packet hash', 'pending_sync');
  window = replaceField(window, 'Estimated used tokens', '0');
  window = replaceField(window, 'Estimated remaining tokens', String(preferences.windowSizeTokens));
  window = replaceField(window, 'Current step', 'complete');
  window = replaceField(window, 'Current run chunk', 'NONE');
  window = replaceField(window, 'Can finish current chunk', 'yes');
  window = replaceField(window, 'Can start next chunk', 'yes');
  window = replaceField(window, 'Recommended action', 'continue');
  window = replaceField(window, 'Resume anchor', 'Milestone open');
  window = replaceField(window, 'Last safe checkpoint', 'pending_sync');
  window = replaceOrAppendField(window, 'Checkpoint freshness', 'no');
  window = replaceOrAppendField(window, 'Packet loading mode', preferences.packetLoadingMode);
  window = replaceOrAppendField(window, 'Token efficiency measures', preferences.tokenEfficiencyMeasures);
  window = replaceOrAppendField(window, 'Core packet size', '0');
  window = replaceOrAppendField(window, 'Loaded packet size', '0');
  window = replaceOrAppendField(window, 'Unchanged refs omitted', '0');
  window = replaceOrAppendField(window, 'Cold refs omitted', '0');
  window = replaceField(window, 'Budget status', 'ok');
  window = replaceSection(window, 'Current Packet Summary', `
- \`Packet version: 5\`
- \`Primary doc: validation\`
- \`Packet hash: pending_sync\`
- \`Packet loading mode: ${preferences.packetLoadingMode}\`
- \`Token efficiency measures: ${preferences.tokenEfficiencyMeasures}\`
- \`Core packet size: 0\`
- \`Loaded packet size: 0\`
- \`Active read size: 0\`
- \`Unchanged refs omitted: 0\`
- \`Cold refs omitted: 0\`
- \`Estimated packet tokens: 0\`
- \`Packet budget status: ok\`
`);
  window = replaceSection(window, 'Read Set Estimate', '- `No recommended read set yet`');
  window = replaceOrAppendSection(window, 'Packet Tier Summary', `
- \`Tier A: ${path.relative(process.cwd(), paths.handoff)}#Continuity Checkpoint; ${path.relative(process.cwd(), paths.context)}#Intent Core; ${path.relative(process.cwd(), paths.execplan)}#Delivery Core; ${path.relative(process.cwd(), paths.execplan)}#Open Requirements; ${path.relative(process.cwd(), paths.execplan)}#Current Capability Slice; ${path.relative(process.cwd(), paths.status)}#Workflow Cursor; ${path.relative(process.cwd(), paths.validation)}#Validation Core\`
- \`Tier A omitted unchanged: None\`
- \`Tier B: None\`
- \`Tier B omitted unchanged: None\`
- \`Tier C loaded: None\`
- \`Tier C omitted: ${path.relative(process.cwd(), paths.context)}; ${path.relative(process.cwd(), paths.execplan)}; ${path.relative(process.cwd(), paths.validation)}\`
`);
  window = replaceSection(window, 'Artifact Estimate', `
- \`Workflow artifact tokens: 0\`
- \`Execution overhead: 2000\`
- \`Verify overhead: 1000\`
`);
  window = replaceSection(window, 'Recent Context Growth', `
- \`Delta since last window snapshot: 0\`
- \`Budget ratio: 0.00\`
`);
  window = replaceOrAppendSection(window, 'Checkpoint Guard', `
- \`Checkpoint freshness: no\`
- \`Reason: No continuity checkpoint is recorded for the current packet\`
- \`Checkpoint required before compaction: no\`
- \`Recommended action: continue\`
`);

  const warning = warnAgentsSize(process.cwd());
  console.log(warning);

  const workflowStagePaths = [
    path.relative(process.cwd(), paths.execplan),
    path.relative(process.cwd(), paths.status),
    path.relative(process.cwd(), paths.decisions),
    path.relative(process.cwd(), paths.milestones),
    path.relative(process.cwd(), paths.context),
    path.relative(process.cwd(), paths.carryforward),
    path.relative(process.cwd(), paths.validation),
    path.relative(process.cwd(), paths.handoff),
    path.relative(process.cwd(), paths.window),
    path.relative(process.cwd(), paths.project),
    path.relative(process.cwd(), paths.runtime),
    path.relative(process.cwd(), paths.preferences),
    path.relative(process.cwd(), paths.seeds),
    path.relative(process.cwd(), archivePath),
  ];
  const workstreamGoldenRoot = path.join(process.cwd(), 'tests', 'golden', path.basename(rootDir));
  if (fs.existsSync(workstreamGoldenRoot)) {
    workflowStagePaths.push(path.relative(process.cwd(), workstreamGoldenRoot));
  }
  if (fs.existsSync(path.join(process.cwd(), 'AGENTS.md'))) {
    workflowStagePaths.unshift('AGENTS.md');
  }
  if (fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    workflowStagePaths.push('package.json');
  }
  if (memory) {
    workflowStagePaths.splice(workflowStagePaths.length - 1, 0, path.relative(process.cwd(), paths.memory));
  }

  const extraStagePaths = String(args['stage-paths'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedExtraStagePaths = extraStagePaths.map((item) => normalizeStagePath(process.cwd(), item));
  const stagePaths = [...new Set([...workflowStagePaths, ...normalizedExtraStagePaths])];

  if (!noGit) {
    const changedFiles = listGitChanges(process.cwd());
    const workflowCoveredChanges = changedFiles.filter((filePath) => (
      workflowStagePaths.some((stagePath) => fileCoveredByStagePath(filePath, stagePath))
    ));
    const nonWorkflowChanges = changedFiles.filter((filePath) => !workflowCoveredChanges.includes(filePath));

    if (normalizedExtraStagePaths.length === 0 && nonWorkflowChanges.length > 0 && !allowWorkflowOnly) {
      throw new Error(
        `Refusing to auto-commit with non-workflow changes present. Pass --stage-paths for milestone code paths or --allow-workflow-only if this closeout is docs-only. Non-workflow changes: ${nonWorkflowChanges.slice(0, 10).join(', ')}`,
      );
    }
  }

  if (dryRun) {
    console.log(`DRY RUN: would archive to ${archivePath}`);
    console.log(`DRY RUN: would stage ${stagePaths.join(', ')}`);
    if (!noGit) {
      const branch = currentBranch(process.cwd());
      console.log(`DRY RUN: would commit and ${noPush ? 'not push' : `push branch ${branch}`}`);
    }
    return;
  }

  ensureDir(paths.archiveDir);
  fs.writeFileSync(archivePath, archiveContent);
  write(paths.milestones, milestones);
  write(paths.status, status);
  write(paths.execplan, execplan);
  write(paths.context, context);
  write(paths.carryforward, carryforward);
  write(paths.validation, validation);
  write(paths.handoff, handoff);
  write(paths.window, window);
  if (memory) {
    write(paths.memory, memory);
  }

  syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  const idleExecplanPacket = syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  const idleWindowStatus = syncWindowDocument(paths, computeWindowStatus(paths, { step: 'audit', doc: 'validation' }));
  updateWorkstreamRegistry(controlPaths(process.cwd()).workstreams, rootDir, idleExecplanPacket.inputHash, idleWindowStatus.budgetStatus, 'pass');

  if (noGit) {
    console.log(`Completed milestone ${activeRow.milestone} without git operations`);
    return;
  }

  runGit(process.cwd(), ['add', ...stagePaths], false);
  const commitMessage = String(args['commit-message'] || `raiola: complete ${activeRow.milestone}`).trim();
  runGit(process.cwd(), ['commit', '-m', commitMessage], false);
  if (!noPush) {
    runGit(process.cwd(), ['push', '--set-upstream', 'origin', currentBranch(process.cwd())], false);
  }
  console.log(`Completed milestone ${activeRow.milestone} and archived to ${archivePath}`);
}

main();
