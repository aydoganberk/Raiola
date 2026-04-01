const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  controlPaths,
  ensureUniqueMilestoneId,
  extractSection,
  getFieldValue,
  getOpenCarryforwardItems,
  loadPreferences,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseSeedEntries,
  parseWorkstreamTable,
  read,
  renderMarkdownTable,
  renderMilestoneTable,
  renderRefTable,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  resolveWorkflowRoot,
  setActiveMilestoneCard,
  syncPacketHash,
  syncWindowDocument,
  today,
  warnAgentsSize,
  workflowPaths,
  write,
} = require('./common');

function printHelp() {
  console.log(`
new_milestone

Usage:
  node scripts/workflow/new_milestone.js --id M3 --name "Seed Yahoo stream" --goal "Prepare yahoo-sync workstream"

Options:
  --root <path>            Workflow root. Default: active workstream root
  --id <milestone-id>      Required. Example: M3
  --name <display-name>    Required. Milestone title
  --goal <goal>            Required. Milestone goal
  --phase <phase>          Optional. Default: current phase from STATUS/EXECPLAN or Phase 1
  --success <text>         Optional success signal
  --non-goals <text>       Optional non-goal summary
  --dry-run                Print AGENTS size check and planned changes without writing
  `);
}

function renderAssumptionsTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Confidence', 'Evidence refs', 'Failure mode'],
    [[
      'Discuss asamasinda doldurulacak',
      'Unclear',
      contextRef,
      'Milestone scope yanlis netlesebilir',
    ]],
  );
}

function renderClaimLedgerTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Type', 'Evidence refs', 'Confidence', 'Failure if wrong'],
    [[
      'Initial milestone packet only seeds the frame',
      'inference',
      contextRef,
      'Likely',
      'Research oncesi plan yapilabilir',
    ]],
  );
}

function renderUnknownsTable() {
  return renderMarkdownTable(
    ['Unknown', 'Impact', 'Owner', 'Status'],
    [[
      'Milestone-specific unknowns discuss asamasinda netlesecek',
      'Plan kalitesini etkiler',
      'owner',
      'open',
    ]],
  );
}

function renderValidationContract(milestoneName, goldenRef, statusRef) {
  return renderMarkdownTable(
    ['Deliverable', 'Verify command', 'Expected signal', 'Manual check', 'Golden', 'Audit owner', 'Status', 'Evidence', 'Packet hash'],
    [[
      `${milestoneName} scope`,
      'Research sonrasi doldurulacak',
      'Scope ve packet netlesecek',
      'Discuss/research notlari gozden gecirilecek',
      goldenRef,
      'audit',
      'pending',
      statusRef,
      'pending_sync',
    ]],
  );
}

function renderMinimumDoneChecklist(profile) {
  const variants = {
    lite: {
      discuss: [
        'Goal, non-goals ve success signal net',
        'Ilgili cekirdek dosyalar tarandi',
        'CONTEXT.md assumptions + canonical refs dolduruldu',
      ],
      research: [
        'Touched files yazildi',
        'Riskler ve verification surface yazildi',
        'VALIDATION.md milestone scopeuna daraltildi',
      ],
      plan: [
        'Context plan-ready ise devam edildi',
        '1-2 run chunk yazildi',
        'Packet / execution / verify overhead alanlari dolduruldu',
      ],
      execute: [
        'Sadece aktif chunk uygulandi',
        'Plan disi drift varsa docs guncellendi',
        'STATUS.md ozet alanlari tazelendi',
      ],
      audit: [
        'Verify command satirlari kosuldu',
        'Manual checks ve kalan riskler yazildi',
        'Audit kapanmadan complete adimina gecilmedi',
      ],
      complete: [
        'Carryforward secildi',
        'Archive ve validation snapshot yazildi',
        'Git closeout scopeu netlestirildi',
      ],
    },
    standard: {
      discuss: [
        'Goal, non-goals ve success signal net',
        '5-15 ilgili dosya tarandi',
        'Canonical refs, assumptions ve unknowns dolduruldu',
        'Seed intake ve active recall intake kaydedildi',
      ],
      research: [
        'Touched files yazildi',
        'Dependency map cikarildi',
        'Riskler ve verification surface yazildi',
        'VALIDATION.md milestone scopeuna daraltildi',
      ],
      plan: [
        'Context plan-ready ise devam edildi',
        'Carryforward + seed intake kontrol edildi',
        '1-2 run chunk yazildi',
        'Packet / execution / verify overhead ve audit plan yazildi',
      ],
      execute: [
        'Sadece aktif chunk uygulandi',
        'Plan disi drift varsa docs guncellendi',
        'STATUS.md Verified/Inferred/Unknown guncellendi',
        'Gerekirse active recall notu birakildi',
      ],
      audit: [
        'Verify command satirlari kosuldu',
        'Manual checks ve kalan riskler yazildi',
        'Evidence / packet hash alanlari guncellendi',
        'Complete oncesi strict health temizligi dogrulandi',
      ],
      complete: [
        'Carryforward secildi',
        'Archive ve validation snapshot yazildi',
        'Active recall temizligi kontrol edildi',
        'AGENTS.md / git closeout ihtiyaci kontrol edildi',
      ],
    },
    full: {
      discuss: [
        'Goal, non-goals ve success signal net',
        '5-15 ilgili dosya tarandi',
        'Canonical refs, assumptions, unknowns ve falsifier yazildi',
        'Seed intake ve active recall intake kaydedildi',
        'Handoff/closeout ihtiyaci not edildi',
      ],
      research: [
        'Touched files yazildi',
        'Dependency map cikarildi',
        'Riskler, verification surface ve research targets yazildi',
        'VALIDATION.md milestone scopeuna daraltildi',
        'Surec surtunmesi varsa RETRO.md icin not cikarildi',
      ],
      plan: [
        'Context plan-ready ise devam edildi',
        'Carryforward + seed intake kontrol edildi',
        '1-2 run chunk yazildi',
        'Packet / execution / verify overhead ve audit plan yazildi',
        'Resume anchor ve out-of-scope guardrails netlestirildi',
      ],
      execute: [
        'Sadece aktif chunk uygulandi',
        'Plan disi drift varsa docs guncellendi',
        'STATUS.md Verified/Inferred/Unknown guncellendi',
        'Gerekirse active recall notu birakildi',
        'Process gap varsa RETRO.md icin not tutuldu',
      ],
      audit: [
        'Verify command satirlari kosuldu',
        'Manual checks ve kalan riskler yazildi',
        'Evidence / packet hash alanlari guncellendi',
        'Complete oncesi strict health temizligi dogrulandi',
        'Process gap varsa RETRO.md kaydi hazirlandi',
      ],
      complete: [
        'Carryforward secildi',
        'Archive ve validation snapshot yazildi',
        'Active recall temizligi kontrol edildi',
        'AGENTS.md ve RETRO.md guncelleme ihtiyaci kontrol edildi',
        'Git closeout scopeu bilincli sekilde netlestirildi',
      ],
    },
  };
  const selected = variants[profile] || variants.standard;

  return `
- Minimum done (\`${profile}\`):
  - Discuss:
    - \`${selected.discuss.join('`\n    - `')}\`
  - Research:
    - \`${selected.research.join('`\n    - `')}\`
  - Plan:
    - \`${selected.plan.join('`\n    - `')}\`
  - Execute:
    - \`${selected.execute.join('`\n    - `')}\`
  - Audit:
    - \`${selected.audit.join('`\n    - `')}\`
  - Complete:
    - \`${selected.complete.join('`\n    - `')}\`
`;
}

function updateWorkstreamRegistry(registryPath, rootDir, milestoneLabel, packetHash, budgetStatus) {
  let workstreams = read(registryPath);
  const table = parseWorkstreamTable(workstreams);
  const relativeRoot = path.relative(process.cwd(), rootDir).replace(/\\/g, '/');
  table.rows.forEach((row) => {
    if (row.root === relativeRoot) {
      row.status = 'active';
      row.currentMilestone = milestoneLabel;
      row.step = 'discuss';
      row.packetHash = packetHash;
      row.budgetStatus = budgetStatus;
      row.health = 'pending';
    }
  });
  workstreams = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(table.headerLines, table.rows));
  write(registryPath, workstreams);
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

  const rawMilestoneId = String(args.id || '').trim();
  const milestoneName = String(args.name || '').trim();
  const milestoneGoal = String(args.goal || '').trim();
  const dryRun = Boolean(args['dry-run']);

  if (!rawMilestoneId || !milestoneName || !milestoneGoal) {
    throw new Error('--id, --name, and --goal are required');
  }

  let execplan = read(paths.execplan);
  let status = read(paths.status);
  let milestones = read(paths.milestones);
  let context = read(paths.context);
  const carryforward = read(paths.carryforward);
  let validation = read(paths.validation);
  let handoff = read(paths.handoff);
  let window = read(paths.window);
  const memory = read(paths.memory);
  const seeds = read(paths.seeds);
  const preferences = loadPreferences(paths);
  const currentWorkstream = String(getFieldValue(status, 'Current workstream') || path.relative(process.cwd(), rootDir)).trim();
  const previousMilestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const milestoneId = ensureUniqueMilestoneId(rawMilestoneId, preferences);
  const milestoneLabel = `${milestoneId} - ${milestoneName}`;
  const contextRef = path.relative(process.cwd(), paths.context).replace(/\\/g, '/');
  const statusRef = path.relative(process.cwd(), paths.status).replace(/\\/g, '/');
  const workstreamsRef = path.relative(process.cwd(), controlPaths(process.cwd()).workstreams).replace(/\\/g, '/');
  const goldenRef = path.join('tests', 'golden', path.basename(rootDir), 'README.md').replace(/\\/g, '/');
  const activeRecall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'Henuz aktif recall notu yok')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === previousMilestone);
  const openSeeds = parseSeedEntries(extractSection(seeds, 'Open Seeds'), 'Henuz acik seed yok');

  const milestoneTable = parseMilestoneTable(milestones);
  if (milestoneTable.rows.some((row) => row.status === 'active')) {
    throw new Error('An active milestone already exists. Complete it before opening a new one.');
  }

  const currentPhaseMatch = status.match(/^- Current phase: `(.*?)`$/m);
  const phase = String(args.phase || currentPhaseMatch?.[1] || 'Phase 1 - Discuss').trim();
  const successSignal = String(args.success || `Milestone ${milestoneId} icin scope, context ve research hedefleri net`).trim();
  const nonGoals = String(args['non-goals'] || 'Bu milestone disindaki feature/refactor isleri').trim();
  const carryforwardItems = getOpenCarryforwardItems(carryforward);

  milestoneTable.rows.push({
    milestone: milestoneId,
    goal: milestoneName,
    phase,
    status: 'active',
    step: 'discuss',
    exitCriteria: milestoneGoal,
    evidence: '`Packet seeded`',
  });

  milestones = replaceSection(
    milestones,
    'Milestone Table',
    renderMilestoneTable(milestoneTable.headerLines, milestoneTable.rows),
  );

  milestones = setActiveMilestoneCard(milestones, `
- Milestone: \`${milestoneLabel}\`
- Phase: \`${phase}\`
- Status: \`active\`
- Step: \`discuss\`
- Goal:
  - \`${milestoneGoal}\`
- Success signal:
  - \`${successSignal}\`
- Non-goals:
  - \`${nonGoals}\`
- Workflow profile:
  - \`${preferences.workflowProfile}\`
- Discuss mode:
  - \`${preferences.discussMode}\`
- Clarifying questions / assumptions:
  - \`CONTEXT.md icindeki assumptions tablosuna yaz\`
- Seed intake:
  - \`${openSeeds.length === 0 ? 'Henuz acik seed yok' : `${openSeeds.length} open seed var`}\`
- Active recall intake:
  - \`${activeRecall.length === 0 ? 'Bu milestone icin henuz active recall notu yok' : `${activeRecall.length} active recall notu var`}\`
- Research target files:
  - \`Discuss sonrasi doldurulacak\`
- Plan checklist:
  - \`CONTEXT.md research-sonrasi guncel olmadan plan adimina gecme\`
  - \`EXECPLAN.md icindeki Plan of Record bolumunu doldur\`
  - \`Plani context window'a uygun 1-2 run chunk'a bol\`
- Execute notes:
  - \`Henuz yok\`
- Audit checklist:
  - \`VALIDATION.md contract tablosunu doldur\`
- Completion note:
  - \`Henuz yok\`
${renderMinimumDoneChecklist(preferences.workflowProfile)}
`);

  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current phase', phase);
  status = replaceField(status, 'Current milestone', milestoneLabel);
  status = replaceField(status, 'Current milestone step', 'discuss');
  status = replaceField(status, 'Context readiness', 'not_ready');
  status = replaceSection(status, 'In Progress', `- \`${milestoneLabel} discuss step'inde\``);
  status = replaceSection(status, 'Verified', [
    `- \`Milestone acildi ve packet seed edildi\``,
    `- \`Validation / handoff / window surfaces milestone scope'u icin resetlendi\``,
  ].join('\n'));
  status = replaceSection(status, 'Inferred', `- \`Research sonrasi run chunk plan'i netlesecek\``);
  status = replaceSection(status, 'Unknown', `- \`Discuss tamamlanmadan tam file scope belli degil\``);
  status = replaceSection(status, 'Next', [
    `- \`Codebase-first discuss akisini baslat\``,
    `- \`workflow:packet ve workflow:next ile packet/budget gorunumunu kontrol et\``,
  ].join('\n'));
  status = replaceSection(status, 'Risks', `- \`Discuss ve research tamamlanmadan plan adimina gecilmemeli\``);
  status = replaceSection(status, 'Tests Run', `- \`Milestone seed edildi; verify komutlari research sonrasi daraltilacak\``);
  status = replaceSection(status, 'Suggested Next Step', `- \`CONTEXT.md assumptions + claim ledger + canonical refs alanlarini doldur\``);

  execplan = replaceOrAppendField(execplan, 'Last updated', today());
  execplan = replaceField(execplan, 'Input hash', 'pending_sync');
  execplan = replaceField(execplan, 'Active milestone', milestoneLabel);
  execplan = replaceField(execplan, 'Active milestone step', 'discuss');
  execplan = replaceField(execplan, 'Current phase', phase);
  execplan = replaceSection(execplan, 'Plan of Record', `
- Milestone: \`${milestoneLabel}\`
- Step owner: \`plan\`
- Plan status: \`waiting_for_research\`
- Carryforward considered: \`${carryforwardItems.length === 0 ? 'Henuz yok' : carryforwardItems.join('; ')}\`
- Run chunk id: \`NONE\`
- Run chunk hash: \`pending\`
- Chunk cursor: \`0/0\`
- Completed items: \`Yok\`
- Remaining items: \`Discuss -> research -> packet refresh\`
- Resume from item: \`Discuss start\`
- Estimated packet tokens: \`0\`
- Estimated execution overhead: \`2000\`
- Estimated verify overhead: \`1000\`
- Minimum reserve: \`${preferences.reserveFloorTokens}\`
- Safe in current window: \`yes\`
- Current run chunk:
  - \`Yok\`
- Next run chunk:
  - \`Research tamamlaninca ilk chunk yazilacak\`
- Implementation checklist:
  - \`Research tamamlaninca doldurulacak\`
- Audit plan:
  - \`Validation contract research sonrasi daraltilacak\`
- Out-of-scope guardrails:
  - \`Aktif milestone disina tasma yok\`
`);
  execplan = replaceSection(execplan, 'Unknowns', renderUnknownsTable());
  execplan = replaceSection(execplan, 'What Would Falsify This Plan?', [
    "- `Research bulgulari hedeflenen scope ile celisirse chunk plan'i yeniden yazilir`",
    '- `Window budget yetersizse yeni step baslatilmaz`',
  ].join('\n'));

  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Workstream', currentWorkstream);
  context = replaceField(context, 'Milestone', milestoneLabel);
  context = replaceField(context, 'Step source', 'discuss');
  context = replaceField(context, 'Context status', 'initial_from_discuss');
  context = replaceField(context, 'Plan readiness', 'not_ready');
  context = replaceField(context, 'Input hash', 'pending_sync');
  context = replaceField(context, 'Budget profile', preferences.budgetProfile);
  context = replaceField(context, 'Target input tokens', String(preferences.discussBudget));
  context = replaceField(context, 'Hard cap tokens', String(preferences.discussBudget + preferences.tokenReserve));
  context = replaceField(context, 'Reasoning profile', 'balanced');
  context = replaceField(context, 'Confidence summary', 'initial_discuss_unknowns');
  context = replaceField(context, 'Discuss mode', preferences.discussMode);
  context = replaceSection(context, 'Canonical Refs', renderRefTable([
    { class: 'source_of_truth', ref: 'AGENTS.md', why: 'Root workflow protocol' },
    { class: 'source_of_truth', ref: path.relative(process.cwd(), paths.preferences).replace(/\\/g, '/'), why: 'Discuss and budget defaults' },
    { class: 'source_of_truth', ref: workstreamsRef, why: 'Active root registry' },
  ]));
  context = replaceSection(context, 'Upstream Refs', renderRefTable([
    { class: 'supporting', ref: path.relative(process.cwd(), paths.execplan).replace(/\\/g, '/'), why: 'Plan of Record relationship' },
    { class: 'supporting', ref: path.relative(process.cwd(), paths.validation).replace(/\\/g, '/'), why: 'Validation dependency' },
    { class: 'supporting', ref: path.relative(process.cwd(), paths.handoff).replace(/\\/g, '/'), why: 'Resume surface dependency' },
  ]));
  context = replaceSection(context, 'Problem Frame', `
- Goal:
  - \`${milestoneGoal}\`
- Success signal:
  - \`${successSignal}\`
- Non-goals:
  - \`${nonGoals}\`
`);
  context = replaceSection(context, 'Codebase Scan Summary', `- \`Discuss asamasinda doldurulacak\``);
  context = replaceSection(context, 'Clarifying Questions / Assumptions', renderAssumptionsTable(contextRef));
  context = replaceSection(context, 'Claim Ledger', renderClaimLedgerTable(contextRef));
  context = replaceSection(context, 'Unknowns', renderUnknownsTable());
  context = replaceSection(context, 'Research Targets', `- \`Discuss sonrasi doldurulacak\``);
  context = replaceSection(context, 'Carryforward Intake', carryforwardItems.length === 0
    ? '- `Henuz carryforward item yok`'
    : carryforwardItems.map((item) => `- \`${item}\``).join('\n'));
  context = replaceSection(context, 'Seed Intake', openSeeds.length === 0
    ? '- `Henuz acik seed yok`'
    : openSeeds.map((entry) => `- \`${entry.title}\` -> \`Trigger: ${entry.fields.Trigger || 'Yok'}\``).join('\n'));
  context = replaceSection(context, 'Active Recall Intake', activeRecall.length === 0
    ? '- `Bu milestone icin henuz active recall notu yok`'
    : activeRecall.map((entry) => `- \`${entry.title}\``).join('\n'));
  context = replaceSection(context, 'Touched Files', `- \`Discuss sonrasi henuz netlesmedi\``);
  context = replaceSection(context, 'Dependency Map', [
    `- \`${path.relative(process.cwd(), paths.execplan)} -> Plan of Record\``,
    `- \`${path.relative(process.cwd(), paths.validation)} -> Validation contract\``,
    `- \`${path.relative(process.cwd(), paths.window)} -> Budget state\``,
  ].join('\n'));
  context = replaceSection(context, 'Risks', `- \`Discuss sonrasi doldurulacak\``);
  context = replaceSection(context, 'Verification Surface', [
    '- `node scripts/workflow/build_packet.js --step discuss --json`',
    '- `node scripts/workflow/next_step.js --json`',
    '- `node scripts/workflow/health.js --strict`',
  ].join('\n'));
  context = replaceSection(context, 'What Would Falsify This Plan?', [
    '- `Discuss bulgulari milestone goal ile celisirse context yeniden yazilir`',
    '- `Canonical refs milestone ihtiyacini yansitmiyorsa packet gecersiz sayilir`',
  ].join('\n'));
  context = replaceSection(context, 'Ready For Plan', `- \`Hayir\``);

  validation = replaceField(validation, 'Last updated', today());
  validation = replaceField(validation, 'Active milestone', milestoneLabel);
  validation = replaceField(validation, 'Validation status', 'pending_research');
  validation = replaceField(validation, 'Audit readiness', 'not_ready');
  validation = replaceField(validation, 'Input hash', 'pending_sync');
  validation = replaceField(validation, 'Target input tokens', String(preferences.auditBudget));
  validation = replaceField(validation, 'Hard cap tokens', String(preferences.auditBudget + preferences.tokenReserve));
  validation = replaceSection(validation, 'Success Contract', `- \`${milestoneGoal}\``);
  validation = replaceSection(validation, 'Validation Contract', renderValidationContract(milestoneName, goldenRef, statusRef));
  validation = replaceSection(validation, 'Unknowns', renderUnknownsTable());
  validation = replaceSection(validation, 'What Would Falsify This Plan?', [
    '- `Validation contract bos verify/manual/evidence kolonlariyla kalirsa audit gecersizdir`',
    '- `Packet hash stale kalirsa audit eski plan uzerinden kapanamaz`',
  ].join('\n'));
  validation = replaceSection(validation, 'Audit Notes', `- \`Milestone acildi, validation contract research bekliyor\``);
  validation = replaceSection(validation, 'Completion Gate', `- \`Audit kapanmadan complete milestone yapma\``);

  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Handoff status', 'idle');
  handoff = replaceField(handoff, 'Workstream', String(getFieldValue(status, 'Current workstream') || currentWorkstream));
  handoff = replaceField(handoff, 'Milestone', milestoneLabel);
  handoff = replaceField(handoff, 'Step', 'discuss');
  handoff = replaceField(handoff, 'Resume anchor', 'Discuss start');
  handoff = replaceField(handoff, 'Packet hash', 'pending_sync');
  handoff = replaceField(handoff, 'Current chunk cursor', '0/0');
  handoff = replaceField(handoff, 'Expected first command', 'npm run workflow:health -- --strict');
  handoff = replaceSection(handoff, 'Snapshot', `- \`Milestone acildi; discuss step baslamaya hazir\``);
  handoff = replaceSection(handoff, 'Immediate Next Action', `
- \`${preferences.discussMode === 'assumptions' ? 'Codebase-first assumptions discuss akisini baslat' : 'Discuss sorularini baslat'}\`
`);
  handoff = replaceSection(handoff, 'Execution Cursor', `
- \`Completed checklist items: Yok\`
- \`Remaining items: Discuss -> research -> packet refresh\`
- \`Next unread canonical refs: ${path.relative(process.cwd(), paths.context)}; ${path.relative(process.cwd(), paths.execplan)}; ${path.relative(process.cwd(), paths.validation)}\`
`);
  handoff = replaceSection(handoff, 'Packet Snapshot', `
- \`Packet hash: pending_sync\`
- \`Current run chunk: NONE\`
- \`Chunk cursor: 0/0\`
`);
  handoff = replaceSection(handoff, 'Suggested Resume Commands', `
- \`npm run workflow:resume-work -- --root ${path.relative(process.cwd(), rootDir)}\`
- \`npm run workflow:health -- --strict --root ${path.relative(process.cwd(), rootDir)}\`
- \`npm run workflow:next -- --root ${path.relative(process.cwd(), rootDir)}\`
`);
  handoff = replaceSection(handoff, 'Files To Reopen', `
- \`${path.relative(process.cwd(), paths.context)}\`
- \`${path.relative(process.cwd(), paths.execplan)}\`
- \`${path.relative(process.cwd(), paths.validation)}\`
- \`${path.relative(process.cwd(), paths.window)}\`
`);
  handoff = replaceSection(handoff, 'Risks', `
- \`Discuss ve research tamamlanmadan plan adimina gecilmemeli\`
`);

  window = replaceField(window, 'Last updated', today());
  window = replaceField(window, 'Session id', 'pending_sync');
  window = replaceField(window, 'Current packet hash', 'pending_sync');
  window = replaceField(window, 'Window mode', preferences.windowBudgetMode);
  window = replaceField(window, 'Window size tokens', String(preferences.windowSizeTokens));
  window = replaceField(window, 'Estimated used tokens', '0');
  window = replaceField(window, 'Estimated remaining tokens', String(preferences.windowSizeTokens));
  window = replaceField(window, 'Reserve floor', String(preferences.reserveFloorTokens));
  window = replaceField(window, 'Current step', 'discuss');
  window = replaceField(window, 'Current run chunk', 'NONE');
  window = replaceField(window, 'Can finish current chunk', 'yes');
  window = replaceField(window, 'Can start next chunk', 'yes');
  window = replaceField(window, 'Recommended action', 'continue');
  window = replaceField(window, 'Resume anchor', 'Discuss start');
  window = replaceField(window, 'Last safe checkpoint', 'pending_sync');
  window = replaceField(window, 'Budget status', 'ok');
  window = replaceSection(window, 'Current Packet Summary', `
- \`Primary doc: context\`
- \`Packet hash: pending_sync\`
- \`Estimated packet tokens: 0\`
- \`Packet budget status: ok\`
`);
  window = replaceSection(window, 'Read Set Estimate', `
- \`${path.relative(process.cwd(), paths.context)}\`
- \`${path.relative(process.cwd(), paths.execplan)}\`
- \`${path.relative(process.cwd(), paths.validation)}\`
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

  const warning = warnAgentsSize(process.cwd());
  console.log(warning);

  if (dryRun) {
    console.log(`DRY RUN: would open ${milestoneId} at ${rootDir}`);
    return;
  }

  write(paths.milestones, milestones);
  write(paths.status, status);
  write(paths.execplan, execplan);
  write(paths.context, context);
  write(paths.validation, validation);
  write(paths.handoff, handoff);
  write(paths.window, window);

  const contextPacket = syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  const windowStatus = syncWindowDocument(paths, computeWindowStatus(paths, { step: 'discuss', doc: 'context' }));

  let nextHandoff = read(paths.handoff);
  nextHandoff = replaceField(nextHandoff, 'Packet hash', contextPacket.inputHash);
  write(paths.handoff, nextHandoff);

  updateWorkstreamRegistry(controlPaths(process.cwd()).workstreams, rootDir, milestoneLabel, contextPacket.inputHash, windowStatus.budgetStatus);
  console.log(`Opened milestone ${milestoneLabel}`);
}

main();
