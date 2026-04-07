const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  computeWindowStatus,
  controlPaths,
  ensureDir,
  escapeRegex,
  slugify,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseWorkstreamTable,
  read,
  renderWorkstreamTable,
  replaceField,
  replaceSection,
  syncStablePacketSet,
  today,
  tryExtractSection,
  workflowPaths,
  write,
} = require('./common');

const WORKSTREAM_DOC_FILES = [
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

const LIFECYCLE_STEPS = new Set(['discuss', 'research', 'plan', 'execute', 'audit', 'complete']);
const WORKSTREAM_NAME_MAX_LENGTH = 60;

function validateWorkstreamName(rawName) {
  const name = String(rawName || '').trim();
  if (!name) {
    throw new Error('--name is required');
  }

  if (slugify(name).length < 1) {
    throw new Error(`Invalid workstream name: ${name}`);
  }

  if (name !== slugify(name)) {
    throw new Error(`Invalid workstream name: ${name}`);
  }

  if (name.length > WORKSTREAM_NAME_MAX_LENGTH) {
    throw new Error(`Invalid workstream name: ${name}`);
  }

  return name;
}

function printHelp() {
  console.log(`
workstreams

Usage:
  node scripts/workflow/workstreams.js <subcommand>

Subcommands:
  list
  create --name <slug>
  switch --name <slug> [--create]
  status
  progress
  resume [--name <slug>]
  complete [--name <slug>]

Options:
  --name <slug>         Workstream name
  --note <text>         Optional row note
  --json                Print machine-readable output
  --strict              Exit non-zero when stale, budget-out, or failed rows exist
  --dry-run             Preview create/switch changes
  --create              Create the target root when switching
  --no-isolation        Skip automatic ensure-isolation during switch
  `);
}

function repoRelative(cwd, targetPath) {
  return path.relative(cwd, targetPath).replace(/\\/g, '/');
}

function readRegistry(cwd) {
  const registryPath = controlPaths(cwd).workstreams;
  const content = read(registryPath);
  return {
    registryPath,
    content,
    table: parseWorkstreamTable(content),
  };
}

function targetRootForName(cwd, workstreamName) {
  return workstreamName === 'workflow'
    ? controlPaths(cwd).rootDir
    : path.join(cwd, 'docs', workstreamName);
}

function switchLogBody(existingBody, entry) {
  const lines = String(existingBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  lines.push(`- \`${entry}\``);
  return lines.join('\n');
}

function replaceAllExact(content, fromValue, toValue) {
  return content.replace(new RegExp(escapeRegex(fromValue), 'g'), toValue);
}

function retargetSeededDocs(targetRoot, relativeRoot) {
  for (const fileName of WORKSTREAM_DOC_FILES) {
    const filePath = path.join(targetRoot, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    let content = read(filePath);
    content = replaceAllExact(content, 'docs/workflow', relativeRoot);
    content = replaceAllExact(content, `${relativeRoot}/WORKSTREAMS.md`, 'docs/workflow/WORKSTREAMS.md');
    content = replaceAllExact(content, 'tests/golden/workflow', `tests/golden/${path.basename(relativeRoot)}`);
    write(filePath, content);
  }
}

function copyTemplateWorkstream(templateRoot, targetRoot, workstreamName) {
  ensureDir(targetRoot);
  ensureDir(path.join(targetRoot, 'completed_milestones'));

  for (const fileName of WORKSTREAM_DOC_FILES) {
    fs.copyFileSync(path.join(templateRoot, fileName), path.join(targetRoot, fileName));
  }

  write(
    path.join(targetRoot, 'completed_milestones', 'README.md'),
    `# COMPLETED MILESTONES\n\n- \`Completed milestone archives for the ${workstreamName} workstream are stored here\`\n`,
  );
}

function seedWorkstreamRoot(cwd, rootDir, workstreamName) {
  const relativeRoot = repoRelative(cwd, rootDir);
  retargetSeededDocs(rootDir, relativeRoot);

  const paths = workflowPaths(rootDir, cwd);

  let project = read(paths.project);
  project = replaceField(project, 'Last updated', today());
  project = replaceField(project, 'Current workstream', workstreamName);
  write(paths.project, project);

  let runtime = read(paths.runtime);
  runtime = replaceField(runtime, 'Last updated', today());
  runtime = replaceField(runtime, 'Default workflow root', relativeRoot);
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
  status = replaceField(status, 'Current workstreams file', 'docs/workflow/WORKSTREAMS.md');
  status = replaceField(status, 'Completed archive root', `${relativeRoot}/completed_milestones/`);
  status = replaceField(status, 'Current workstream', workstreamName);
  write(paths.status, status);

  let context = read(paths.context);
  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Workstream', workstreamName);
  write(paths.context, context);

  let handoff = read(paths.handoff);
  handoff = replaceField(handoff, 'Last updated', today());
  handoff = replaceField(handoff, 'Workstream', workstreamName);
  write(paths.handoff, handoff);

  let decisions = read(paths.decisions);
  const decisionEntry = [
    '',
    '',
    `## ${today()} - ${workstreamName} workstream root was seeded`,
    '',
    '- Decision:',
    `  - \`Create the ${workstreamName} named workstream under ${relativeRoot}.\``,
    '- Why:',
    '  - `Keep the control plane isolated when the repository needs multiple long-lived streams.`',
    '- Consequence:',
    '  - `This stream can be switched to independently without disturbing the default root.`',
  ].join('\n');
  decisions = `${decisions.trimEnd()}${decisionEntry}\n`;
  write(paths.decisions, decisions);

  syncStablePacketSet(paths);
}

function budgetRank(status) {
  return {
    ok: 0,
    warn: 1,
    critical: 2,
    unknown: 0,
  }[String(status || '').trim().toLowerCase()] ?? 0;
}

function worstBudgetStatus(statuses) {
  let winner = 'ok';
  for (const status of statuses) {
    if (budgetRank(status) > budgetRank(winner)) {
      winner = status;
    }
  }
  return winner;
}

function lifecycleStep(step) {
  const normalized = String(step || '').trim().toLowerCase();
  return LIFECYCLE_STEPS.has(normalized) ? normalized : 'complete';
}

function healthStatusFromChecks(checks) {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }
  if (checks.some((check) => check.status === 'warn')) {
    return 'warn';
  }
  return checks.length > 0 ? 'pass' : 'pending';
}

function runJsonSibling(scriptName, argv, cwd) {
  return JSON.parse(childProcess.execFileSync(
    process.execPath,
    [path.join(__dirname, scriptName), ...argv],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ));
}

function summarizeHealthForRow(cwd, relativeRoot, isActive) {
  try {
    const payload = runJsonSibling('health.js', ['--root', relativeRoot, '--json'], cwd);
    const checks = isActive
      ? payload.checks
      : payload.checks.filter((check) => !String(check.message || '').startsWith('WORKSTREAMS active root ->'));
    const failCount = checks.filter((check) => check.status === 'fail').length;
    const warnCount = checks.filter((check) => check.status === 'warn').length;

    return {
      status: healthStatusFromChecks(checks),
      failCount,
      warnCount,
    };
  } catch (error) {
    return {
      status: 'fail',
      failCount: 1,
      warnCount: 0,
      error: String(error.stderr || error.stdout || error.message).trim(),
    };
  }
}

function stabilizeRegisteredWorkstreams(cwd) {
  const registry = readRegistry(cwd);
  for (const row of registry.table.rows) {
    const rootDir = path.resolve(cwd, row.root);
    if (!fs.existsSync(rootDir)) {
      continue;
    }

    try {
      childProcess.execFileSync(
        process.execPath,
        [path.join(__dirname, 'build_packet.js'), '--root', row.root, '--all', '--sync'],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      // Leave broken roots for status/health to surface explicitly.
    }
  }
}

function loadWorkstreamState(cwd, row, activeRoot) {
  const rootDir = path.resolve(cwd, row.root);
  const isActive = path.resolve(cwd, activeRoot) === rootDir;

  if (!fs.existsSync(rootDir)) {
    return {
      ...row,
      rootDir,
      status: isActive ? 'active' : 'inactive',
      currentMilestone: 'MISSING_ROOT',
      step: 'unknown',
      packetHash: 'missing',
      budgetStatus: 'critical',
      health: 'fail',
      stale: true,
      stalePackets: ['root'],
      budgetOut: true,
      mode: 'unknown',
      gitIsolation: 'unknown',
      windowDecision: 'missing_root',
    };
  }

  try {
    const paths = workflowPaths(rootDir, cwd);
    assertWorkflowFiles(paths);
    const statusDoc = read(paths.status);
    const currentMilestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
    const currentStep = lifecycleStep(getFieldValue(statusDoc, 'Current milestone step') || row.step);
    const activePacket = buildPacketSnapshot(paths, { step: currentStep });
    const contextPacket = buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' });
    const execplanPacket = buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' });
    const validationPacket = buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' });
    const windowStatus = computeWindowStatus(paths, { step: activePacket.step, doc: activePacket.primary.key });
    const preferences = loadPreferences(paths);
    const stalePackets = [contextPacket, execplanPacket, validationPacket]
      .filter((packet) => !packet.storedInputHash || packet.hashDrift)
      .map((packet) => packet.primary.key);
    const health = summarizeHealthForRow(cwd, row.root, isActive);
    const budgetStatus = worstBudgetStatus([
      contextPacket.budgetStatus,
      execplanPacket.budgetStatus,
      validationPacket.budgetStatus,
      windowStatus.budgetStatus,
    ]);

    return {
      ...row,
      rootDir,
      status: isActive ? 'active' : 'inactive',
      currentMilestone,
      step: currentStep,
      packetHash: activePacket.inputHash,
      budgetStatus,
      health: health.status,
      stale: stalePackets.length > 0,
      stalePackets,
      budgetOut: budgetStatus !== 'ok',
      mode: preferences.mode,
      gitIsolation: preferences.gitIsolation,
      windowDecision: windowStatus.decision,
      healthFailCount: health.failCount,
      healthWarnCount: health.warnCount,
      healthError: health.error || '',
    };
  } catch (error) {
    return {
      ...row,
      rootDir,
      status: isActive ? 'active' : 'inactive',
      currentMilestone: row.currentMilestone || 'UNKNOWN',
      step: row.step || 'unknown',
      packetHash: row.packetHash || 'missing',
      budgetStatus: 'critical',
      health: 'fail',
      stale: true,
      stalePackets: ['packet'],
      budgetOut: true,
      mode: 'unknown',
      gitIsolation: 'unknown',
      windowDecision: 'error',
      healthError: String(error.stderr || error.stdout || error.message).trim(),
    };
  }
}

function writeRegistry(cwd, content, rows, options = {}) {
  const activeRow = rows.find((row) => row.status === 'active') || null;
  let next = content;
  next = replaceField(next, 'Last updated', today());
  if (activeRow) {
    next = replaceField(next, 'Active workstream name', activeRow.name);
    next = replaceField(next, 'Active workstream root', activeRow.root);
  }
  next = replaceSection(next, 'Workstream Table', renderWorkstreamTable(parseWorkstreamTable(next).headerLines, rows));

  if (options.switchLogEntry) {
    const currentSwitchLog = tryExtractSection(next, 'Switch Log', '');
    next = replaceSection(next, 'Switch Log', switchLogBody(currentSwitchLog, options.switchLogEntry));
  }

  write(controlPaths(cwd).workstreams, next);
  return next;
}

function refreshRegistry(cwd, options = {}) {
  const registry = readRegistry(cwd);
  const activeRoot = String(getFieldValue(registry.content, 'Active workstream root') || 'docs/workflow').trim();
  const rows = registry.table.rows.map((row) => loadWorkstreamState(cwd, row, activeRoot));

  if (options.write) {
    writeRegistry(cwd, registry.content, rows);
  }

  const active = rows.find((row) => row.status === 'active') || null;
  return {
    registryPath: registry.registryPath,
    rows,
    active,
    stale: rows.filter((row) => row.stale),
    budgetOut: rows.filter((row) => row.budgetOut),
    failed: rows.filter((row) => row.health === 'fail'),
  };
}

function ensureRegistryRow(cwd, rowData, options = {}) {
  const registry = readRegistry(cwd);
  const rows = registry.table.rows.map((row) => ({ ...row }));
  const existing = rows.find((row) => row.name === rowData.name || row.root === rowData.root);

  if (existing) {
    Object.assign(existing, rowData);
  } else {
    rows.push(rowData);
  }

  if (options.activate) {
    for (const row of rows) {
      row.status = row.name === rowData.name ? 'active' : 'inactive';
    }
  }

  writeRegistry(cwd, registry.content, rows, options);
}

function createWorkstream(cwd, args) {
  const workstreamName = validateWorkstreamName(args.name);

  const targetRoot = targetRootForName(cwd, workstreamName);
  if (fs.existsSync(targetRoot)) {
    throw new Error(`Workstream root already exists: ${targetRoot}`);
  }

  const templateRoot = controlPaths(cwd).rootDir;
  if (Boolean(args['dry-run'])) {
    return {
      action: 'create',
      name: workstreamName,
      root: repoRelative(cwd, targetRoot),
      dryRun: true,
    };
  }

  copyTemplateWorkstream(templateRoot, targetRoot, workstreamName);
  seedWorkstreamRoot(cwd, targetRoot, workstreamName);

  const relativeRoot = repoRelative(cwd, targetRoot);
  ensureRegistryRow(cwd, {
    name: workstreamName,
    root: relativeRoot,
    status: 'inactive',
    currentMilestone: 'NONE',
    step: 'complete',
    packetHash: 'pending_sync',
    budgetStatus: 'ok',
    health: 'pending',
    notes: String(args.note || 'Named workstream control plane').trim(),
  }, {
    switchLogEntry: `${today()} | ${workstreamName} | Create root`,
  });

  stabilizeRegisteredWorkstreams(cwd);
  refreshRegistry(cwd);

  return {
    action: 'create',
    name: workstreamName,
    root: relativeRoot,
    dryRun: false,
  };
}

function switchWorkstream(cwd, args) {
  const workstreamName = validateWorkstreamName(args.name);

  const note = String(args.note || 'Named workstream control plane').trim();
  const targetRoot = targetRootForName(cwd, workstreamName);
  const relativeRoot = repoRelative(cwd, targetRoot);
  const exists = fs.existsSync(targetRoot);

  if (!exists && !Boolean(args.create)) {
    throw new Error(`Workstream root does not exist: ${targetRoot}. Pass --create to scaffold it.`);
  }

  if (Boolean(args['dry-run'])) {
    return {
      action: exists ? 'switch' : 'create+switch',
      name: workstreamName,
      root: relativeRoot,
      dryRun: true,
    };
  }

  if (!exists) {
    createWorkstream(cwd, { ...args, note });
  }

  const registry = readRegistry(cwd);
  const rows = registry.table.rows.map((row) => ({ ...row }));
  const targetRow = rows.find((row) => row.name === workstreamName || row.root === relativeRoot);

  if (!targetRow) {
    rows.push({
      name: workstreamName,
      root: relativeRoot,
      status: 'active',
      currentMilestone: 'NONE',
      step: 'complete',
      packetHash: 'pending_sync',
      budgetStatus: 'ok',
      health: 'pending',
      notes: note,
    });
  } else {
    targetRow.notes = note;
  }

  for (const row of rows) {
    row.status = row.name === workstreamName ? 'active' : 'inactive';
  }

  writeRegistry(cwd, registry.content, rows, {
    switchLogEntry: `${today()} | ${workstreamName} | Switch active root`,
  });

  stabilizeRegisteredWorkstreams(cwd);
  const refreshed = refreshRegistry(cwd);
  let isolation = null;
  if (!Boolean(args['no-isolation'])) {
    isolation = runJsonSibling('ensure_isolation.js', ['--root', relativeRoot, '--json'], cwd);
  }

  return {
    action: exists ? 'switch' : 'create+switch',
    name: workstreamName,
    root: relativeRoot,
    dryRun: false,
    active: refreshed.active,
    isolation,
  };
}

function resolveTargetRow(cwd, name) {
  const summary = refreshRegistry(cwd);
  if (!name) {
    if (!summary.active) {
      throw new Error('No active workstream found');
    }
    return { summary, row: summary.active };
  }

  const row = summary.rows.find((item) => item.name === name);
  if (!row) {
    throw new Error(`Unknown workstream: ${name}`);
  }
  return { summary, row };
}

function printStatus(summary, cwd) {
  console.log('# WORKSTREAM STATUS\n');
  console.log(`- Registry: \`${repoRelative(cwd, summary.registryPath)}\``);
  console.log(`- Active workstream: \`${summary.active ? summary.active.name : 'none'}\``);
  console.log(`- Stream count: \`${summary.rows.length}\``);
  console.log(`- Budget-out streams: \`${summary.budgetOut.map((row) => row.name).join(', ') || 'none'}\``);
  console.log(`- Stale streams: \`${summary.stale.map((row) => row.name).join(', ') || 'none'}\``);
  console.log(`- Failed streams: \`${summary.failed.map((row) => row.name).join(', ') || 'none'}\``);
  console.log('\n## Rows\n');
  for (const row of summary.rows) {
    console.log(
      `- \`${row.name}\` status=\`${row.status}\` root=\`${row.root}\` milestone=\`${row.currentMilestone || 'NONE'}\` step=\`${row.step}\` packet=\`${row.packetHash}\` budget=\`${row.budgetStatus}\` stale=\`${row.stale ? row.stalePackets.join(', ') : 'no'}\` health=\`${row.health}\` mode=\`${row.mode}\` isolation=\`${row.gitIsolation}\``,
    );
  }
}

function printProgress(summary) {
  console.log('# WORKSTREAM PROGRESS\n');
  if (summary.rows.length === 0) {
    console.log('- `No workstreams registered yet`');
    return;
  }

  if (summary.budgetOut.length === 0 && summary.stale.length === 0 && summary.failed.length === 0) {
    console.log('- `All registered streams are within budget and non-stale`');
  } else {
    if (summary.budgetOut.length > 0) {
      console.log(`- Budget out: \`${summary.budgetOut.map((row) => `${row.name}:${row.budgetStatus}`).join(', ')}\``);
    }
    if (summary.stale.length > 0) {
      console.log(`- Stale: \`${summary.stale.map((row) => `${row.name}:${row.stalePackets.join('+')}`).join(', ')}\``);
    }
    if (summary.failed.length > 0) {
      console.log(`- Health fail: \`${summary.failed.map((row) => row.name).join(', ')}\``);
    }
  }

  console.log('\n## Active\n');
  const active = summary.active;
  if (!active) {
    console.log('- `No active workstream`');
    return;
  }

  console.log(`- \`${active.name}\` milestone=\`${active.currentMilestone}\` step=\`${active.step}\` budget=\`${active.budgetStatus}\` stale=\`${active.stale ? active.stalePackets.join(', ') : 'no'}\` health=\`${active.health}\``);
}

function printList(summary) {
  console.log('# WORKSTREAMS\n');
  for (const row of summary.rows) {
    console.log(`- \`${row.name}\` -> root=\`${row.root}\`, status=\`${row.status}\`, milestone=\`${row.currentMilestone || 'NONE'}\``);
  }
}

function printResume(row) {
  const strictFlag = row.mode === 'team' ? '--strict ' : '';
  console.log('# WORKSTREAM RESUME\n');
  console.log(`- Workstream: \`${row.name}\``);
  console.log(`- Root: \`${row.root}\``);
  console.log(`- Resume command: \`npm run workflow:resume-work -- --root ${row.root}\``);
  console.log(`- Next command: \`npm run workflow:next -- --root ${row.root}\``);
  console.log(`- Health command: \`npm run workflow:health -- ${strictFlag}--root ${row.root}\``);
  if (row.gitIsolation !== 'none') {
    console.log(`- Isolation command: \`npm run workflow:ensure-isolation -- --root ${row.root}\``);
  }
}

function printComplete(row) {
  const strictFlag = row.mode === 'team' ? '--strict ' : '';
  console.log('# WORKSTREAM COMPLETE\n');
  console.log(`- Workstream: \`${row.name}\``);
  console.log(`- Root: \`${row.root}\``);
  console.log(`- Closeout command: \`npm run workflow:complete-milestone -- --root ${row.root} --agents-review unchanged --summary "..."\``);
  console.log(`- Preflight: \`npm run workflow:health -- ${strictFlag}--root ${row.root}\``);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [subcommand = 'status'] = args._;
  if (args.help || subcommand === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();

  if (subcommand === 'create') {
    const payload = createWorkstream(cwd, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log(`${payload.dryRun ? 'Would create' : 'Created'} workstream ${payload.name} at ${payload.root}`);
    return;
  }

  if (subcommand === 'switch') {
    const payload = switchWorkstream(cwd, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`Switched active workstream to ${payload.name}`);
    if (payload.isolation) {
      console.log(`- isolation=\`${payload.isolation.mode}\` action=\`${payload.isolation.action}\``);
      if (payload.isolation.checkoutRoot && payload.isolation.checkoutRoot !== cwd) {
        console.log(`- continue from \`${payload.isolation.checkoutRoot}\``);
      }
    }
    return;
  }

  const summary = refreshRegistry(cwd);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    if (args.strict && (summary.stale.length > 0 || summary.budgetOut.length > 0 || summary.failed.length > 0)) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === 'list') {
    printList(summary);
  } else if (subcommand === 'status') {
    printStatus(summary, cwd);
  } else if (subcommand === 'progress') {
    printProgress(summary);
  } else if (subcommand === 'resume') {
    const target = String(args.name || '').trim();
    const { row } = resolveTargetRow(cwd, target);
    printResume(row);
  } else if (subcommand === 'complete') {
    const target = String(args.name || '').trim();
    const { row } = resolveTargetRow(cwd, target);
    printComplete(row);
  } else {
    throw new Error(`Unknown subcommand: ${subcommand}`);
  }

  if (args.strict && (summary.stale.length > 0 || summary.budgetOut.length > 0 || summary.failed.length > 0)) {
    process.exitCode = 1;
  }
}

main();
