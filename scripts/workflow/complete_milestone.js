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
  childProcess.execFileSync('node', [path.join(__dirname, 'health.js'), '--root', rootDir, '--strict'], {
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
  const nextMilestone = String(args.next || 'Yeni milestone planning icin hazir').trim();
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
    ? parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'Henuz aktif recall notu yok')
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

  try {
    runHealthStrict(rootDir);
  } catch (error) {
    throw new Error(`workflow:health --strict failed before complete: ${String(error.stderr || error.stdout || error.message).trim()}`);
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

${carryforwardItems.length === 0 ? '- `Carryforward yok`' : carryforwardItems.map((item) => `- \`${item}\``).join('\n')}

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

${clearedMemoryEntries.length === 0 ? '- `Temizlenen aktif memory notu yok`' : clearedMemoryEntries.map((entry) => (
  `- \`${entry.date} | ${entry.title}\`
  - \`Note: ${entry.fields.Note || 'Yok'}\`
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
  - \`Yeni milestone acilana kadar aktif kart beklemede\`
- Success signal:
  - \`Yeni milestone olusturulunca doldurulacak\`
- Non-goals:
  - \`Bu kartta gecmis milestone detaylarini tutmak\`
- Discuss mode:
  - \`${preferences.discussMode}\`
- Clarifying questions / assumptions:
  - \`Yeni milestone ile doldurulacak\`
- Seed intake:
  - \`Henuz acik seed yok\`
- Active recall intake:
  - \`Aktif milestone yok\`
- Research target files:
  - \`Yeni milestone ile doldurulacak\`
- Plan checklist:
  - \`Yeni milestone ile doldurulacak\`
- Execute notes:
  - \`Yok\`
- Audit checklist:
  - \`Yok\`
- Completion note:
  - \`${activeRow.milestone} arsivlendi\`
`);

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', 'Phase 0 - Idle');
  status = replaceField(status, 'Current milestone', 'NONE');
  status = replaceField(status, 'Current milestone step', 'complete');
  status = replaceField(status, 'Context readiness', 'frozen_until_next_milestone');
  status = replaceSection(status, 'In Progress', `- \`Workflow surface idle durumda; yeni milestone bekleniyor\``);
  status = replaceSection(status, 'Verified', [
    `- \`${activeRow.milestone} archive edildi\``,
    '- `Validation snapshot ve packet hash archive icine tasindi`',
  ].join('\n'));
  status = replaceSection(status, 'Inferred', '- `Bir sonraki milestone yeni packet seti ile acilacak`');
  status = replaceSection(status, 'Unknown', '- `Sonraki milestone kapsamı henuz bilinmiyor`');
  status = replaceSection(status, 'Next', [
    '- `Kullanici explicit workflow isterse yeni milestone ac`',
    '- `workflow:next ile idle recommendation al`',
  ].join('\n'));
  status = replaceSection(status, 'Risks', '- `Aktif milestone yok`');
  status = replaceSection(status, 'Suggested Next Step', '- `Kullanici explicit workflow isterse ilk milestoneu ac`');

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Milestone', 'NONE');
  context = replaceField(context, 'Step source', 'discuss');
  context = replaceField(context, 'Context status', 'idle_until_milestone');
  context = replaceField(context, 'Plan readiness', 'not_ready');
  context = replaceField(context, 'Input hash', 'pending_sync');
  context = replaceField(context, 'Confidence summary', 'mixed_idle_surface');
  context = replaceSection(context, 'Problem Frame', `
- Goal:
  - \`Kullanici isterse acilacak workflow milestone'u icin temiz baslangic yuzeyi saglamak\`
- Success signal:
  - \`Ilk milestone kullanici tarafindan acikca tanimlandiginda bu dosya onun icin doldurulabilecek\`
- Non-goals:
  - \`Kullanici istemeden workflow milestone'u baslatmak\`
`);
  context = replaceSection(context, 'Codebase Scan Summary', [
    '- `Workflow surface idle durumuna cekildi`',
    `- \`${activeRow.milestone} archive altina tasindi\``,
  ].join('\n'));
  context = replaceSection(context, 'Clarifying Questions / Assumptions', `
| Claim | Confidence | Evidence refs | Failure mode |
| --- | --- | --- | --- |
| Workflow ancak kullanici acikca istediginde aktif kullanilacak | Confident | AGENTS.md; .agents/skills/codex-workflow/SKILL.md | Workflow istemeden aktiflenirse scope kayar |
| Tek bir kullanici istegi gerekirse tek milestone olarak modellenebilir | Likely | AGENTS.md; ${milestonesRef} | Milestone granularity tutarsiz olur |
`);
  context = replaceSection(context, 'Claim Ledger', `
| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| Workflow surface explicit opt-in olarak tasarlandi | source-backed | AGENTS.md; .agents/skills/codex-workflow/SKILL.md | Confident | Ajanlar workflow'u gereksiz yere acabilir |
| Current root idle state icin yeterli kanonik dosyalara sahip | source-backed | ${workstreamsRef}; ${execplanRef}; ${validationRef} | Likely | Yeni milestone baslangici eksik packet ile acilabilir |
`);
  context = replaceSection(context, 'Unknowns', `
| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| Ilk aktif milestone ne zaman acilacak | Packet iceriği milestone ile degisecek | user | open |
`);
  context = replaceSection(context, 'Research Targets', '- `Kullanici milestone acinca doldurulacak`');
  context = replaceSection(context, 'Touched Files', '- `Workflow milestone acildiginda doldurulacak`');
  context = replaceSection(context, 'Risks', '- `Aktif milestone yok`');
  context = replaceSection(context, 'What Would Falsify This Plan?', [
    '- `Workflow explicit_only degilse mevcut problem frame yanlis olur`',
    '- `WORKSTREAMS.md aktif rootu farkli bir yere tasimissa bu packet stale olur`',
  ].join('\n'));
  context = replaceSection(context, 'Ready For Plan', '- `Hayir`');

  execplan = replaceOrAppendField(execplan, 'Input hash', 'pending_sync');
  execplan = replaceField(execplan, 'Active milestone', 'NONE');
  execplan = replaceField(execplan, 'Active milestone step', 'complete');
  execplan = replaceField(execplan, 'Current phase', 'Phase 0 - Idle');
  execplan = replaceSection(execplan, 'Plan of Record', `
- Milestone: \`NONE\`
- Step owner: \`plan\`
- Plan status: \`idle_until_user_opens_milestone\`
- Carryforward considered: \`${carryforwardItems.length === 0 ? 'Yok' : carryforwardItems.join('; ')}\`
- Run chunk id: \`NONE\`
- Run chunk hash: \`pending\`
- Chunk cursor: \`0/0\`
- Completed items: \`Yok\`
- Remaining items: \`Kullanici isterse ilk milestone'u ac\`
- Resume from item: \`Milestone open\`
- Estimated packet tokens: \`0\`
- Estimated execution overhead: \`2000\`
- Estimated verify overhead: \`1000\`
- Minimum reserve: \`${preferences.reserveFloorTokens}\`
- Safe in current window: \`yes\`
- Current run chunk:
  - \`Yok\`
- Next run chunk:
  - \`Kullanici isterse ilk milestone'u ac\`
- Implementation checklist:
  - \`Yok\`
- Audit plan:
  - \`Yok\`
- Out-of-scope guardrails:
  - \`Kullanici istemeden milestone planning'i baslatma\`
`);

  carryforward = replaceSection(carryforward, 'Open Items', renderOpenItems(carryforwardItems));
  if (memory) {
    const activeEntries = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'Henuz aktif recall notu yok')
      .map((entry) => parseMemoryEntry(entry))
      .filter((entry) => entry.fields.Milestone !== `${activeRow.milestone} - ${activeRow.goal}`);
    memory = replaceField(memory, 'Last updated', today());
    memory = replaceField(memory, 'Status', 'active_recall_plus_durable');
    memory = replaceSection(memory, 'Active Recall Items', renderMemorySection(activeEntries, 'Henuz aktif recall notu yok'));
  }
  validation = replaceField(validation, 'Last updated', today());
  validation = replaceField(validation, 'Active milestone', 'NONE');
  validation = replaceField(validation, 'Validation status', 'idle_until_milestone');
  validation = replaceField(validation, 'Audit readiness', 'not_ready');
  validation = replaceField(validation, 'Input hash', 'pending_sync');
  validation = replaceSection(validation, 'Success Contract', `- \`Yeni milestone research/plani ile doldurulacak\``);
  validation = replaceSection(validation, 'Validation Contract', `
| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workflow idle validation surface | node scripts/workflow/doctor.js --strict | 0 fail | Idle workflow summary aligns with STATUS.md | ${goldenRef} | audit | pending | ${statusRef} | pending_sync |
`);
  validation = replaceSection(validation, 'Audit Notes', `- \`${activeRow.milestone} tamamlandi ve validation snapshot archive icine tasindi\``);
  validation = replaceSection(validation, 'Completion Gate', `- \`Yeni milestone ile doldurulacak\``);

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Handoff status', 'idle');
  handoff = replaceField(handoff, 'Milestone', 'NONE');
  handoff = replaceField(handoff, 'Step', 'complete');
  handoff = replaceField(handoff, 'Resume anchor', 'Milestone open');
  handoff = replaceField(handoff, 'Packet hash', 'pending_sync');
  handoff = replaceField(handoff, 'Current chunk cursor', '0/0');
  handoff = replaceField(handoff, 'Expected first command', 'npm run workflow:health -- --strict');
  handoff = replaceSection(handoff, 'Snapshot', `- \`${activeRow.milestone} complete edildi\``);
  handoff = replaceSection(handoff, 'Immediate Next Action', `- \`Bir sonraki milestone'u planla veya workstream degistir\``);
  handoff = replaceSection(handoff, 'Execution Cursor', `
- \`Completed checklist items: Milestone complete\`
- \`Remaining items: Kullanici isterse yeni milestone ac\`
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
  handoff = replaceSection(handoff, 'Risks', `- \`Yeni milestone acilmadan aktif context tekrar kullanilmaz\``);

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
  window = replaceField(window, 'Budget status', 'ok');
  window = replaceSection(window, 'Current Packet Summary', `
- \`Primary doc: validation\`
- \`Packet hash: pending_sync\`
- \`Estimated packet tokens: 0\`
- \`Packet budget status: ok\`
`);
  window = replaceSection(window, 'Read Set Estimate', `- \`Recommended read set henuz yok\``);
  window = replaceSection(window, 'Artifact Estimate', `
- \`Workflow artifact tokens: 0\`
- \`Execution overhead: 2000\`
- \`Verify overhead: 1000\`
`);
  window = replaceSection(window, 'Recent Context Growth', `
- \`Delta since last window snapshot: 0\`
- \`Budget ratio: 0.00\`
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
  const commitMessage = String(args['commit-message'] || `workflow: complete ${activeRow.milestone}`).trim();
  runGit(process.cwd(), ['commit', '-m', commitMessage], false);
  if (!noPush) {
    runGit(process.cwd(), ['push', '--set-upstream', 'origin', currentBranch(process.cwd())], false);
  }
  console.log(`Completed milestone ${activeRow.milestone} and archived to ${archivePath}`);
}

main();
