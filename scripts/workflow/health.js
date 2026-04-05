const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  computeWindowStatus,
  extractSection,
  loadPreferences,
  getFieldValue,
  parseArgs,
  parseArchivedMilestones,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseSeedEntries,
  parseWorkstreamTable,
  read,
  readPlanGateStatus,
  resolveWorkflowRoot,
  runEvidenceChecks,
  validateValidationContract,
  warnAgentsSize,
  workflowPaths,
} = require('./common');
const { applyRepairPlan, buildRepairPlan } = require('./repair');

function printHelp() {
  console.log(`
health

Usage:
  node scripts/workflow/health.js --strict

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --strict          Exit non-zero on fail checks
  --repair          Print a dry-run repair plan for safe runtime fixes
  --apply           Apply the safe runtime fixes from the repair plan
  --json            Print machine-readable output
  `);
}

function safeExtract(content, heading) {
  try {
    return extractSection(content, heading);
  } catch {
    return '';
  }
}

function buildHealthReport(cwd, rootDir, options = {}) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);
  const preferences = loadPreferences(paths);
  const strictMode = Object.prototype.hasOwnProperty.call(options, 'strictMode')
    ? Boolean(options.strictMode)
    : Boolean(preferences.healthStrictRequired);

  const checks = [];
  const pushCheck = (status, message, extra = {}) => checks.push({ status, message, ...extra });

  const statusDoc = read(paths.status);
  const execplan = read(paths.execplan);
  const context = read(paths.context);
  const validation = read(paths.validation);
  const milestones = read(paths.milestones);
  const handoff = read(paths.handoff);
  const memory = read(paths.memory);
  const seeds = read(paths.seeds);
  const workstreams = read(paths.workstreams);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(statusDoc, 'Current milestone step') || 'unknown').trim();
  const contextReadiness = String(getFieldValue(statusDoc, 'Context readiness') || 'unknown').trim();
  const planGate = readPlanGateStatus(paths);
  const activeRow = parseMilestoneTable(milestones).rows.find((row) => row.status === 'active');

  pushCheck(
    milestone === String(getFieldValue(execplan, 'Active milestone') || 'NONE')
      ? 'pass'
      : 'fail',
    'STATUS.md and EXECPLAN.md active milestone fields must stay in sync',
  );
  pushCheck(
    step === String(getFieldValue(execplan, 'Active milestone step') || 'unknown')
      ? 'pass'
      : 'fail',
    'STATUS.md and EXECPLAN.md active step fields must stay in sync',
  );
  pushCheck(
    (!activeRow && milestone === 'NONE') || (activeRow && `${activeRow.milestone} - ${activeRow.goal}` === milestone)
      ? 'pass'
      : 'fail',
    'The active row in MILESTONES.md must match the milestone shown in STATUS.md',
  );
  if (milestone !== 'NONE' && ['execute', 'audit'].includes(step)) {
    pushCheck(
      planGate === 'pass' ? 'pass' : 'fail',
      `Execute/audit requires plan gate pass -> gate=${planGate}, readiness=${contextReadiness}`,
    );
  }

  const packets = [
    buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  ];

  for (const packet of packets) {
    pushCheck(
      packet.reasoningProfileValid ? 'pass' : 'fail',
      `${packet.primary.key} reasoning profile -> ${packet.reasoningProfileRaw || packet.reasoningProfile} (allowed: fast|balanced|deep|critical)`,
      { packet: packet.primary.key },
    );
    pushCheck(
      packet.canonicalRefs.length > 0 ? 'pass' : 'fail',
      `${packet.primary.key} canonical refs must not be empty`,
      { packet: packet.primary.key },
    );
    pushCheck(
      packet.storedInputHash ? 'pass' : (milestone === 'NONE' ? 'warn' : 'fail'),
      `${packet.primary.key} input hash must be present`,
      { packet: packet.primary.key },
    );
    pushCheck(
      packet.hashDrift ? (milestone === 'NONE' ? 'warn' : 'fail') : 'pass',
      `${packet.primary.key} packet hash must not be stale`,
      { packet: packet.primary.key },
    );
    pushCheck(
      packet.budgetStatus === 'critical' ? 'fail' : packet.budgetStatus === 'warn' ? 'warn' : 'pass',
      `${packet.primary.key} packet budget status -> ${packet.budgetStatus}`,
      { packet: packet.primary.key },
    );
    if (['execplan', 'validation'].includes(packet.primary.key)) {
      pushCheck(
        packet.falsificationItems.length > 0 ? 'pass' : 'fail',
        `${packet.primary.key} must name what would falsify the current plan`,
        { packet: packet.primary.key },
      );
    }
  }

  const windowStatus = computeWindowStatus(paths);
  pushCheck(
    windowStatus.budgetStatus === 'critical' ? 'fail' : windowStatus.budgetStatus === 'warn' ? 'warn' : 'pass',
    `WINDOW budget status -> ${windowStatus.budgetStatus}`,
  );
  pushCheck(
    ['continue', 'compact-now', 'do-not-start-next-step', 'handoff-required', 'new-window-recommended'].includes(windowStatus.decision)
      ? 'pass'
      : 'fail',
    `WINDOW decision -> ${windowStatus.decision}`,
  );

  for (const check of runEvidenceChecks(paths)) {
    pushCheck(check.status, `${check.kind}: ${check.claim} -> ${check.message}${check.ref ? ` (${check.ref})` : ''}`);
  }

  const claimLedger = require('./common').parseTableSectionObjects(context, 'Claim Ledger');
  for (const claim of claimLedger) {
    if (claim.type === 'source-backed' && !String(claim.evidence_refs || '').trim()) {
      pushCheck('fail', `Critical claim missing evidence refs -> ${claim.claim}`);
    }
    if (claim.type === 'inference' && String(claim.confidence || '').trim() === 'Confident') {
      pushCheck('warn', `Inference claim marked too confidently -> ${claim.claim}`);
    }
  }

  for (const issue of validateValidationContract(paths)) {
    pushCheck(issue.status, issue.message);
  }

  const archived = parseArchivedMilestones(milestones);
  for (const line of archived) {
    const match = line.match(/-> `([^`]+)`$/);
    if (!match) {
      continue;
    }
    const archivePath = path.resolve(cwd, match[1]);
    pushCheck(fs.existsSync(archivePath) ? 'pass' : 'fail', `Archive ref exists -> ${match[1]}`);
  }

  const activeMemory = parseMemoryEntries(safeExtract(memory, 'Active Recall Items'), 'No active recall notes yet')
    .map((entry) => parseMemoryEntry(entry));
  const orphanRecall = activeMemory.filter((entry) => entry.fields.Milestone && entry.fields.Milestone !== milestone);
  if (milestone === 'NONE' && activeMemory.length > 0) {
    pushCheck('warn', 'Active Recall Items exist even though there is no active milestone');
  }
  for (const entry of orphanRecall) {
    pushCheck('warn', `Orphan active recall -> ${entry.title}`);
  }

  const openSeeds = parseSeedEntries(safeExtract(seeds, 'Open Seeds'), 'No open seeds yet');
  const contextSeedIntake = safeExtract(context, 'Seed Intake');
  if (openSeeds.length > 0 && contextSeedIntake.includes('No open seeds yet') && milestone !== 'NONE') {
    pushCheck('warn', 'Seed drift: open seeds exist but CONTEXT seed intake does not reflect them');
  } else {
    pushCheck('pass', `Seed intake check -> ${openSeeds.length} open seed(s)`);
  }

  const activeRoot = String(getFieldValue(workstreams, 'Active workstream root') || path.relative(cwd, rootDir).replace(/\\/g, '/')).trim();
  pushCheck(
    path.resolve(cwd, activeRoot) === rootDir ? 'pass' : 'warn',
    `WORKSTREAMS active root -> ${activeRoot}`,
  );
  const workstreamRows = parseWorkstreamTable(workstreams).rows;
  pushCheck(workstreamRows.length > 0 ? 'pass' : 'warn', 'WORKSTREAMS table should contain at least one entry');
  pushCheck('pass', warnAgentsSize(cwd));

  const failCount = checks.filter((item) => item.status === 'fail').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;

  return {
    rootDir: path.relative(cwd, rootDir),
    strictMode,
    failCount,
    warnCount,
    checks,
    packetHashes: packets.map((packet) => ({ doc: packet.primary.key, hash: packet.inputHash })),
    window: {
      decision: windowStatus.decision,
      remaining: windowStatus.estimatedRemainingTokens,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const report = buildHealthReport(
    cwd,
    rootDir,
    Boolean(args.strict) ? { strictMode: true } : {},
  );
  const repairPlan = args.repair || args.apply
    ? buildRepairPlan(cwd, rootDir, { kind: 'health', healthReport: report })
    : null;
  const appliedRepair = args.apply ? applyRepairPlan(cwd, rootDir, repairPlan) : null;

  if (args.json) {
    console.log(JSON.stringify({
      ...report,
      repair: repairPlan
        ? {
          safeActionCount: repairPlan.safeActionCount,
          runtimeIssues: repairPlan.runtimeIssues,
          manualIssues: repairPlan.manualIssues,
          actions: repairPlan.actions.map((action) => action.label),
          applied: appliedRepair,
        }
        : null,
    }, null, 2));
    return;
  }

  console.log(`# WORKFLOW HEALTH\n`);
  console.log(`- Root: \`${report.rootDir}\``);
  console.log(`- Fail count: \`${report.failCount}\``);
  console.log(`- Warn count: \`${report.warnCount}\``);
  console.log(`- Strict mode: \`${report.strictMode ? 'on' : 'off'}\``);
  console.log(`\n## Checks\n`);
  for (const check of report.checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
  }

  if (repairPlan) {
    console.log(`\n## Repair\n`);
    if (repairPlan.actions.length === 0) {
      console.log('- `No safe runtime repair action is pending`');
    } else {
      for (const action of repairPlan.actions) {
        console.log(`- ${action.label}`);
      }
    }
    for (const issue of repairPlan.manualIssues) {
      console.log(`- manual: \`${issue.command}\` -> ${issue.reason}`);
    }
    if (appliedRepair) {
      console.log('- `Safe runtime fixes were applied.`');
    } else {
      console.log('- `Dry run only. Re-run with --repair --apply to execute safe fixes.`');
    }
  }

  if (report.strictMode && report.failCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildHealthReport,
};
