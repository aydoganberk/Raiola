const path = require('node:path');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractSection,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  read,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
next_step

Usage:
  node scripts/workflow/next_step.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --json            Print machine-readable JSON
  `);
}

function checklistForProfile(profile, variants) {
  return variants[profile] || variants.standard;
}

function deriveRecommendation(state) {
  const {
    preferences,
    milestone,
    step,
    contextReadiness,
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
  } = state;

  const recommendation = {
    title: '',
    command: '',
    checklist: [],
    note: '',
  };

  if (handoffStatus === 'ready_to_resume' && handoffNext) {
    recommendation.title = 'Resume from handoff';
    recommendation.command = 'npm run workflow:resume-work';
    recommendation.checklist = [
      'HANDOFF.md icindeki execution cursor ve packet snapshot bolumlerini oku',
      'Resume sonrasi workflow:health -- --strict kos',
      'Health temizse workflow:next ile step check yap',
    ];
    recommendation.note = handoffNext;
    return recommendation;
  }

  if (windowStatus.decision !== 'continue' && milestone !== 'NONE') {
    recommendation.title = 'Do not start the next step in this window';
    recommendation.command = 'npm run workflow:pause-work -- --summary "Window budget threshold reached"';
    recommendation.checklist = [
      `WINDOW karari -> ${windowStatus.decision}`,
      'Mevcut pencereyi compact et veya handoff snapshot al',
      'Yeni pencerede workflow:resume-work -> workflow:health -- --strict -> workflow:next akisini izle',
    ];
    recommendation.note = `Remaining budget: ${windowStatus.estimatedRemainingTokens}`;
    return recommendation;
  }

  if (milestone === 'NONE') {
    recommendation.title = 'Open or switch a milestone';
    recommendation.command = 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Gerekirse once workflow:workstreams status ile aktif rootu kontrol et',
        'Task boyutuna gore lite|standard|full profilini sec',
        'Yeni milestone acildiginda discuss step ile basla',
      ],
      standard: [
        'Gerekirse once workflow:workstreams status ile aktif rootu kontrol et',
        'Open seeds varsa yeni milestone scopeuna uygun olanlari cek',
        'Task boyutuna gore lite|standard|full profilini sec',
        'Yeni milestone acildiginda discuss step ile basla',
      ],
      full: [
        'Gerekirse once workflow:workstreams status ile aktif rootu kontrol et',
        'Open seeds ve carryforward varsa milestone scopeuna cek',
        'Handoff/closeout gerekiyorsa full profili sec',
        'Yeni milestone acildiginda discuss step ile basla',
        'RETRO.md only-once process gap var mi diye hizlica tara',
      ],
    });
    recommendation.note = seeds.length > 0
      ? `Acik seed sayisi: ${seeds.length} | profil=${preferences.workflowProfile}`
      : `Aktif milestone yok | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'discuss') {
    recommendation.title = preferences.discussMode === 'assumptions'
      ? 'Run discuss in assumptions mode'
      : 'Run discuss in interview mode';
    recommendation.command = 'Discuss tamamlaninca CONTEXT.md initial packet snapshot guncellenmeli';
    recommendation.checklist = preferences.discussMode === 'assumptions'
      ? checklistForProfile(preferences.workflowProfile, {
        lite: [
          'Ilgili cekirdek dosyalari tara ve scope varsayimlarini yaz',
          'Goal, non-goals ve success signal alanlarini netlestir',
          'CONTEXT.md icinde canonical refs + assumptions tablosunu doldur',
        ],
        standard: [
          '5-15 ilgili dosya tara ve kanitli varsayim tablosunu doldur',
          'Goal, non-goals ve success signal alanlarini netlestir',
          'Claim Ledger, Unknowns ve Canonical Refs bolumlerini doldur',
          'CONTEXT.md icinde seed intake ve active recall baglamini yaz',
        ],
        full: [
          '5-15 ilgili dosya tara ve kanitli varsayim tablosunu doldur',
          'Goal, non-goals ve success signal alanlarini netlestir',
          'Claim Ledger, Unknowns ve Canonical Refs bolumlerini doldur',
          'Seed intake, active recall ve failure/falsifier notlarini yaz',
          'Research bitmeden once hangi bulgunun scopeu bozabilecegini not et',
        ],
      })
      : checklistForProfile(preferences.workflowProfile, {
        lite: [
          'Goal, non-goals ve success signal alanlarini netlestir',
          'Sadece yuksek etkili sorular sor',
          'CONTEXT.md initial packet snapshot alanlarini doldur',
        ],
        standard: [
          'Goal, non-goals ve success signal alanlarini netlestir',
          'Sadece yuksek etkili sorular sor',
          'Assumptions tablosuna kalan belirsizlikleri yaz',
          'CONTEXT.md initial packet snapshot alanlarini doldur',
        ],
        full: [
          'Goal, non-goals ve success signal alanlarini netlestir',
          'Sadece yuksek etkili sorular sor',
          'Assumptions tablosuna kalan belirsizlikleri yaz',
          'Canonical refs, unknowns ve falsifier alanlarini doldur',
          'Handoff/closeout gerekecekse bunu simdiden not et',
        ],
      });
    recommendation.note = activeRecall.length > 0
      ? `Bu milestone icin ${activeRecall.length} active recall notu var | profil=${preferences.workflowProfile}`
      : `Discuss sonrasi CONTEXT.md plan-ready degil | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'research') {
    recommendation.title = 'Consolidate research and validation inputs';
    recommendation.command = 'Research bitince CONTEXT.md + VALIDATION.md guncelle';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Touched files alanini doldur',
        'Risks ve verification surface alanlarini yaz',
        'VALIDATION.md contract tablosunu milestone scopeuna daralt',
      ],
      standard: [
        'Touched files, dependency map ve risks alanlarini CONTEXT.md icine yaz',
        'Verification surface ve research target files alanlarini guncelle',
        'VALIDATION.md contract tablosunu milestone scopeuna daralt',
        'Plan readiness alanini only-ready ise guncelle',
      ],
      full: [
        'Touched files, dependency map ve risks alanlarini CONTEXT.md icine yaz',
        'Verification surface, research targets ve falsifier alanlarini guncelle',
        'VALIDATION.md contract tablosunu milestone scopeuna daralt',
        'Plan readiness alanini only-ready ise guncelle',
        'Tekrarlayan surec surtunmesi varsa RETRO.md icin not cikar',
      ],
    });
    recommendation.note = contextReadiness === 'plan_ready'
      ? `Context hazir, plan step baslayabilir | profil=${preferences.workflowProfile}`
      : `Research bulgulari tamamlaninca plan adimina gec | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'plan') {
    recommendation.title = 'Write the Plan of Record';
    recommendation.command = 'EXECPLAN.md > Plan of Record';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'CARRYFORWARD.md ve ilgili seedleri oku',
        'Plani 1-2 run chunk olacak sekilde yaz',
        'Estimated packet / execution / verify overhead alanlarini doldur',
      ],
      standard: [
        'CARRYFORWARD.md ve ilgili seedleri oku',
        'Plani 1-2 run chunk olacak sekilde yaz ve chunk cursor alanlarini doldur',
        'Estimated packet tokens / execution overhead / verify overhead alanlarini doldur',
        'Out-of-scope guardrails ve audit plan alanlarini netlestir',
      ],
      full: [
        'CARRYFORWARD.md ve ilgili seedleri oku',
        'Plani 1-2 run chunk olacak sekilde yaz ve chunk cursor alanlarini doldur',
        'Estimated packet tokens / execution overhead / verify overhead alanlarini doldur',
        'Out-of-scope guardrails, audit plan ve resume anchor alanlarini netlestir',
        'Yeni chunk minimum next-step budget birakiyorsa devam et; aksi halde bol',
      ],
    });
    recommendation.note = `Plan source of truth EXECPLAN.md icindeki Plan of Record bolumudur | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'execute') {
    recommendation.title = 'Execute the current run chunk';
    recommendation.command = 'EXECPLAN.md icindeki Current run chunk checklistini uygula';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'Sadece aktif milestone scopeunda kal',
        'Plan disina tasma varsa once docs guncelle',
        'Anlamli degisikliklerde STATUS.md ozet alanlarini guncelle',
      ],
      standard: [
        'Sadece aktif milestone scopeunda kal',
        'Plan disina tasma varsa once docs guncelle',
        'Anlamli degisikliklerde STATUS.md Verified/Inferred/Unknown alanlarini guncelle',
        'Gerekirse ara hatirlatmalari Active Recall Items olarak kaydet',
      ],
      full: [
        'Sadece aktif milestone scopeunda kal',
        'Plan disina tasma varsa once docs guncelle',
        'Anlamli degisikliklerde STATUS.md Verified/Inferred/Unknown alanlarini guncelle',
        'Gerekirse ara hatirlatmalari Active Recall Items olarak kaydet',
        'Surec surtunmesi yasandiysa closeout sonrasi RETRO.md icin kisa not tut',
      ],
    });
    recommendation.note = `Execute sirasinda plan disina tasma varsa once docs guncelle | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  if (step === 'audit') {
    recommendation.title = 'Run validation and audit';
    recommendation.command = 'VALIDATION.md ve STATUS.md uzerinden audit kapat';
    recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
      lite: [
        'VALIDATION.md contract tablosundaki verify command satirlarini kos',
        'Manual checks ve kalan riskleri STATUS.md icine yaz',
        'Audit kapanmadan complete milestone yapma',
      ],
      standard: [
        'VALIDATION.md contract tablosundaki verify command satirlarini kos',
        'Manual checks ve kalan riskleri STATUS.md icine yaz',
        'Evidence ve packet hash kolonlarini guncelle',
        'Complete oncesi workflow:health -- --strict temizligini dogrula',
      ],
      full: [
        'VALIDATION.md contract tablosundaki verify command satirlarini kos',
        'Manual checks ve kalan riskleri STATUS.md icine yaz',
        'Evidence ve packet hash kolonlarini guncelle',
        'Complete oncesi workflow:health -- --strict temizligini dogrula',
        'Surec kaynakli bir gap varsa RETRO.md icin tek satirlik not cikar',
      ],
    });
    recommendation.note = `Audit kapanmadan complete milestone yapma | profil=${preferences.workflowProfile}`;
    return recommendation;
  }

  recommendation.title = 'Close out the milestone';
  recommendation.command = 'npm run workflow:complete-milestone -- --agents-review unchanged --summary "..." --stage-paths <paths>';
  recommendation.checklist = checklistForProfile(preferences.workflowProfile, {
    lite: [
      'Carryforward maddelerini sec',
      'Validation contract ve packet snapshot archive icine tasinacak',
      'Git scope net degilse --stage-paths ver',
    ],
    standard: [
      'Carryforward maddelerini sec',
      'Validation contract ve packet snapshot archive icine tasinacak',
      'AGENTS.md guncellemesi gerekip gerekmedigini kontrol et',
      'Git scope net degilse --stage-paths ver veya docs-only ise --allow-workflow-only kullan',
    ],
    full: [
      'Carryforward maddelerini sec',
      'Validation contract ve packet snapshot archive icine tasinacak',
      'Active Recall Items temizliginin milestone ile uyumlu oldugunu kontrol et',
      'AGENTS.md ve RETRO.md icin process guncellemesi gerekip gerekmedigini kontrol et',
      'Git scope net degilse --stage-paths ver veya docs-only ise --allow-workflow-only kullan',
    ],
  });
  recommendation.note = `Complete sonrasi yeni milestone planningi baslar | profil=${preferences.workflowProfile}`;
  return recommendation;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const status = read(paths.status);
  const handoff = read(paths.handoff);
  const memory = read(paths.memory);
  const seedsDoc = read(paths.seeds);
  const preferences = loadPreferences(paths);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(status, 'Current milestone step') || 'unknown').trim();
  const contextReadiness = String(getFieldValue(status, 'Context readiness') || 'unknown').trim();
  const handoffStatus = String(getFieldValue(handoff, 'Handoff status') || 'idle').trim();
  const handoffNext = extractSection(handoff, 'Immediate Next Action');
  const activeRecall = parseMemoryEntries(extractSection(memory, 'Active Recall Items'), 'Henuz aktif recall notu yok')
    .map((entry) => parseMemoryEntry(entry))
    .filter((entry) => entry.fields.Milestone === milestone);
  const seeds = parseSeedEntries(extractSection(seedsDoc, 'Open Seeds'), 'Henuz acik seed yok');
  const windowStatus = computeWindowStatus(paths);

  const recommendation = deriveRecommendation({
    preferences,
    milestone,
    step,
    contextReadiness,
    handoffStatus,
    handoffNext,
    activeRecall,
    seeds,
    windowStatus,
  });

  const payload = {
    rootDir: path.relative(cwd, rootDir),
    milestone,
    step,
    preferences,
    packetHash: windowStatus.packet.inputHash,
    estimatedTokens: windowStatus.packet.estimatedTotalTokens,
    budgetStatus: windowStatus.packet.budgetStatus,
    recommendedReadSet: windowStatus.packet.recommendedReadSet,
    windowStatus: {
      decision: windowStatus.decision,
      remainingBudget: windowStatus.estimatedRemainingTokens,
      canStartNextStep: windowStatus.canStartNextChunk,
      canFinishCurrentChunk: windowStatus.canFinishCurrentChunk,
    },
    recommendation,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# NEXT\n`);
  console.log(`- Root: \`${payload.rootDir}\``);
  console.log(`- Milestone: \`${milestone}\``);
  console.log(`- Step: \`${step}\``);
  console.log(`- Workflow profile: \`${preferences.workflowProfile}\``);
  console.log(`- Discuss mode: \`${preferences.discussMode}\``);
  console.log(`- Git isolation: \`${preferences.gitIsolation}\``);
  console.log(`- Packet hash: \`${payload.packetHash}\``);
  console.log(`- Estimated tokens: \`${payload.estimatedTokens}\``);
  console.log(`- Budget status: \`${payload.budgetStatus}\``);
  console.log(`- Remaining budget: \`${payload.windowStatus.remainingBudget}\``);
  console.log(`- Can start next step: \`${payload.windowStatus.canStartNextStep ? 'yes' : 'no'}\``);
  console.log(`\n## Recommended Read Set\n`);
  if (payload.recommendedReadSet.length === 0) {
    console.log('- `Recommended read set henuz yok`');
  } else {
    for (const item of payload.recommendedReadSet) {
      console.log(`- \`${item}\``);
    }
  }
  console.log(`\n## Recommendation\n`);
  console.log(`- Title: \`${recommendation.title}\``);
  console.log(`- Command: \`${recommendation.command}\``);
  console.log(`- Note: \`${recommendation.note}\``);
  console.log(`\n## Checklist\n`);
  for (const item of recommendation.checklist) {
    console.log(`- \`${item}\``);
  }
}

main();
