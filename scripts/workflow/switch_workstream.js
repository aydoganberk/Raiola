const fs = require('node:fs');
const path = require('node:path');
const {
  controlPaths,
  ensureDir,
  getFieldValue,
  parseArgs,
  parseWorkstreamTable,
  read,
  renderWorkstreamTable,
  replaceField,
  replaceSection,
  syncPacketHash,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
  computeWindowStatus,
} = require('./common');

function printHelp() {
  console.log(`
switch_workstream

Usage:
  node scripts/workflow/switch_workstream.js --name <slug>

Options:
  --name <slug>       Required. Workstream name
  --create            Create docs/<slug>/ if missing
  --note <text>       Optional note for the registry row
  --dry-run           Preview without writing
  `);
}

function copyTemplateWorkstream(templateRoot, targetRoot) {
  const files = [
    'PROJECT.md',
    'RUNTIME.md',
    'PREFERENCES.md',
    'EXECPLAN.md',
    'STATUS.md',
    'DECISIONS.md',
    'MILESTONES.md',
    'MILESTONE_TEMPLATE.md',
    'CONTEXT.md',
    'CARRYFORWARD.md',
    'VALIDATION.md',
    'HANDOFF.md',
    'WINDOW.md',
    'MEMORY.md',
    'SEEDS.md',
    'RETRO.md',
  ];

  ensureDir(targetRoot);
  ensureDir(path.join(targetRoot, 'completed_milestones'));

  for (const fileName of files) {
    fs.copyFileSync(path.join(templateRoot, fileName), path.join(targetRoot, fileName));
  }

  fs.writeFileSync(
    path.join(targetRoot, 'completed_milestones', 'README.md'),
    `# COMPLETED MILESTONES\n\n- \`${path.basename(targetRoot)}\` workstream'i icin tamamlanan milestone arsivleri burada tutulur\`\n`,
  );
}

function patchSeededRoot(rootDir, workstreamName, note) {
  const relativeRoot = path.relative(process.cwd(), rootDir).replace(/\\/g, '/');
  const paths = workflowPaths(rootDir);

  let project = read(paths.project);
  project = replaceField(project, 'Last updated', today());
  project = replaceField(project, 'Current workstream', workstreamName);
  write(paths.project, project);

  let runtime = read(paths.runtime);
  runtime = replaceField(runtime, 'Last updated', today());
  runtime = replaceField(runtime, 'Default workflow root', relativeRoot);
  runtime = replaceSection(runtime, 'Core Commands', [
    `- \`npm run workflow:new-milestone -- --root ${relativeRoot} --id Mx --name "..." --goal "..."\``,
    `- \`npm run workflow:packet -- --root ${relativeRoot} --step plan --json\``,
    `- \`npm run workflow:next -- --root ${relativeRoot}\``,
    `- \`npm run workflow:health -- --root ${relativeRoot} --strict\``,
  ].join('\n'));
  write(paths.runtime, runtime);

  let status = read(paths.status);
  status = replaceField(status, 'Last updated', today());
  status = replaceField(status, 'Current context file', `${relativeRoot}/CONTEXT.md`);
  status = replaceField(status, 'Current carryforward file', `${relativeRoot}/CARRYFORWARD.md`);
  status = replaceField(status, 'Current validation file', `${relativeRoot}/VALIDATION.md`);
  status = replaceField(status, 'Current handoff file', `${relativeRoot}/HANDOFF.md`);
  status = replaceField(status, 'Current window file', `${relativeRoot}/WINDOW.md`);
  status = replaceField(status, 'Current memory file', `${relativeRoot}/MEMORY.md`);
  status = replaceField(status, 'Current seed file', `${relativeRoot}/SEEDS.md`);
  status = replaceField(status, 'Current project file', `${relativeRoot}/PROJECT.md`);
  status = replaceField(status, 'Current runtime file', `${relativeRoot}/RUNTIME.md`);
  status = replaceField(status, 'Current preferences file', `${relativeRoot}/PREFERENCES.md`);
  status = replaceField(status, 'Current retro file', `${relativeRoot}/RETRO.md`);
  status = replaceField(status, 'Completed archive root', `${relativeRoot}/completed_milestones/`);
  status = replaceField(status, 'Current workstream', workstreamName);
  status = replaceSection(status, 'In Progress', `- \`Isimli workstream olusturuldu; aktif milestone bekleniyor\``);
  status = replaceSection(status, 'Verified', [
    `- \`${workstreamName} workstream surface'i root template'ten seed edildi\``,
    `- \`Packet, validation ve window dosyalari mevcut\``,
  ].join('\n'));
  status = replaceSection(status, 'Inferred', '- `Ilk milestone bu root altinda acilacak`');
  status = replaceSection(status, 'Unknown', '- `Ilk milestone kapsamı henuz bilinmiyor`');
  status = replaceSection(status, 'Next', [
    '- `Yeni milestone ac`',
    '- `workflow:next ile ilk onerilen adimi oku`',
  ].join('\n'));
  status = replaceSection(status, 'Suggested Next Step', '- `workflow:new-milestone ile ilk milestoneu ac ve discuss step ile basla`');
  write(paths.status, status);

  let context = read(paths.context);
  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Workstream', workstreamName);
  write(paths.context, context);

  let handoff = read(paths.handoff);
  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Workstream', workstreamName);
  handoff = replaceSection(handoff, 'Suggested Resume Commands', [
    `- \`npm run workflow:resume-work -- --root ${relativeRoot}\``,
    `- \`npm run workflow:health -- --strict --root ${relativeRoot}\``,
    `- \`npm run workflow:next -- --root ${relativeRoot}\``,
  ].join('\n'));
  write(paths.handoff, handoff);

  let decisions = read(paths.decisions);
  decisions += `\n\n## ${today()} - ${workstreamName} workstream active root oldu\n\n- Decision:\n  - \`${workstreamName}\` isimli workstream aktif root olarak secildi.\n- Why:\n  - Workstream isolation ve packet budget takibi icin.\n- Consequence:\n  - Active milestone bu root altinda ilerleyecek.\n`;
  write(paths.decisions, decisions);

  let workstreams = read(controlPaths(process.cwd()).workstreams);
  const table = parseWorkstreamTable(workstreams);
  const existing = table.rows.find((row) => row.name === workstreamName);
  if (!existing) {
    table.rows.push({
      name: workstreamName,
      root: relativeRoot,
      status: 'active',
      currentMilestone: 'NONE',
      step: 'complete',
      packetHash: 'pending_sync',
      budgetStatus: 'ok',
      health: 'pending',
      notes: note || 'Named workstream control plane',
    });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const workstreamName = String(args.name || '').trim();
  if (!workstreamName) {
    throw new Error('--name is required');
  }

  const cwd = process.cwd();
  const dryRun = Boolean(args['dry-run']);
  const note = String(args.note || 'Named workstream control plane').trim();
  const controls = controlPaths(cwd);
  const templateRoot = controls.rootDir;
  const targetRoot = path.join(cwd, 'docs', workstreamName);
  const create = Boolean(args.create);
  const rootExists = fs.existsSync(targetRoot);

  if (!rootExists && !create) {
    throw new Error(`Workstream root does not exist: ${targetRoot}. Pass --create to scaffold it.`);
  }

  let workstreams = read(controls.workstreams);
  const table = parseWorkstreamTable(workstreams);

  if (dryRun) {
    console.log(`DRY RUN: would ${rootExists ? 'switch' : 'create'} workstream ${workstreamName} at ${targetRoot}`);
    return;
  }

  if (!rootExists) {
    copyTemplateWorkstream(templateRoot, targetRoot);
  }

  patchSeededRoot(targetRoot, workstreamName, note);

  workstreams = read(controls.workstreams);
  const refreshedTable = parseWorkstreamTable(workstreams);
  for (const row of refreshedTable.rows) {
    row.status = row.name === workstreamName ? 'active' : 'inactive';
    if (row.name === workstreamName) {
      row.root = path.relative(cwd, targetRoot).replace(/\\/g, '/');
      row.currentMilestone = 'NONE';
      row.step = 'complete';
      row.packetHash = 'pending_sync';
      row.budgetStatus = 'ok';
      row.health = 'pending';
      row.notes = note;
    }
  }
  if (!refreshedTable.rows.some((row) => row.name === workstreamName)) {
    refreshedTable.rows.push({
      name: workstreamName,
      root: path.relative(cwd, targetRoot).replace(/\\/g, '/'),
      status: 'active',
      currentMilestone: 'NONE',
      step: 'complete',
      packetHash: 'pending_sync',
      budgetStatus: 'ok',
      health: 'pending',
      notes: note,
    });
  }

  workstreams = replaceField(workstreams, 'Last updated', today());
  workstreams = replaceField(workstreams, 'Active workstream name', workstreamName);
  workstreams = replaceField(workstreams, 'Active workstream root', path.relative(cwd, targetRoot).replace(/\\/g, '/'));
  workstreams = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(refreshedTable.headerLines, refreshedTable.rows));
  workstreams = replaceSection(workstreams, 'Switch Log', `${read(controls.workstreams).includes('## Switch Log') ? read(controls.workstreams).split('## Switch Log\n')[1].trim() : ''}\n- \`${today()} | ${workstreamName} | ${rootExists ? 'Switch existing root' : 'Create and switch root'}\``.trim());
  write(controls.workstreams, workstreams);

  const targetPaths = workflowPaths(targetRoot);
  syncPacketHash(targetPaths, { doc: 'context', step: 'discuss' });
  const execplanPacket = syncPacketHash(targetPaths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(targetPaths, { doc: 'validation', step: 'audit' });
  const windowStatus = syncWindowDocument(targetPaths, computeWindowStatus(targetPaths, { step: 'audit', doc: 'validation' }));

  let finalRegistry = read(controls.workstreams);
  const finalTable = parseWorkstreamTable(finalRegistry);
  for (const row of finalTable.rows) {
    if (row.name === workstreamName) {
      row.packetHash = execplanPacket.inputHash;
      row.budgetStatus = windowStatus.budgetStatus;
      row.health = 'pending';
    }
  }
  finalRegistry = replaceSection(finalRegistry, 'Workstream Table', renderWorkstreamTable(finalTable.headerLines, finalTable.rows));
  write(controls.workstreams, finalRegistry);

  console.log(`Switched active workstream to ${workstreamName}`);
}

main();
