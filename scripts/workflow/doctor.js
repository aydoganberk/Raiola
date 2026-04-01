const path = require('node:path');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  currentBranch,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseMilestoneTable,
  parseWorkstreamTable,
  read,
  resolveWorkflowRoot,
  warnAgentsSize,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
doctor

Usage:
  node scripts/workflow/doctor.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --strict          Exit non-zero when a fail check exists
  `);
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

  const checks = [];
  const pushCheck = (status, message) => checks.push({ status, message });

  const status = read(paths.status);
  const execplan = read(paths.execplan);
  const milestones = read(paths.milestones);
  const preferences = loadPreferences(paths);
  const workstreams = read(paths.workstreams);
  const activeRoot = getFieldValue(workstreams, 'Active workstream root');
  const defaultActiveRoot = path.relative(cwd, rootDir).replace(/\\/g, '/');
  const resolvedActiveRoot = path.resolve(cwd, activeRoot || defaultActiveRoot);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE');
  const step = String(getFieldValue(status, 'Current milestone step') || 'unknown');
  const activeRow = parseMilestoneTable(milestones).rows.find((row) => row.status === 'active');
  const workstreamRows = parseWorkstreamTable(workstreams).rows;
  const packets = [
    buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  ];

  pushCheck(resolvedActiveRoot === rootDir ? 'pass' : 'warn', `Active workstream root -> ${activeRoot || defaultActiveRoot}`);
  pushCheck(milestone === String(getFieldValue(execplan, 'Active milestone') || 'NONE')
    ? 'pass'
    : 'fail', 'STATUS.md ve EXECPLAN.md aktif milestone alanlari senkron olmali');
  pushCheck(step === String(getFieldValue(execplan, 'Active milestone step') || 'unknown')
    ? 'pass'
    : 'fail', 'STATUS.md ve EXECPLAN.md aktif step alanlari senkron olmali');
  pushCheck(
    (!activeRow && milestone === 'NONE') || (activeRow && `${activeRow.milestone} - ${activeRow.goal}` === milestone)
      ? 'pass'
      : 'fail',
    'MILESTONES.md aktif satiri ile STATUS.md ayni milestoneu gostermeli',
  );
  pushCheck(
    ['solo', 'team'].includes(preferences.mode) ? 'pass' : 'fail',
    `Workflow mode -> ${preferences.mode}`,
  );
  pushCheck(
    ['lite', 'standard', 'full'].includes(preferences.workflowProfileRaw) ? 'pass' : 'fail',
    `Workflow profile -> ${preferences.workflowProfileRaw}`,
  );
  pushCheck(
    ['interview', 'assumptions'].includes(preferences.discussMode) ? 'pass' : 'fail',
    `Discuss mode -> ${preferences.discussMode}`,
  );
  pushCheck(
    ['none', 'branch', 'worktree'].includes(preferences.gitIsolation) ? 'pass' : 'fail',
    `Git isolation -> ${preferences.gitIsolation}`,
  );
  if (preferences.gitIsolation === 'branch' && milestone !== 'NONE') {
    pushCheck(currentBranch(cwd) !== 'main' ? 'pass' : 'warn', 'Branch isolation beklenirken hala main branch uzerindesin');
  }
  pushCheck(workstreamRows.length > 0 ? 'pass' : 'warn', 'WORKSTREAMS.md en az bir kayit icermeli');
  for (const packet of packets) {
    pushCheck(
      packet.storedInputHash ? 'pass' : 'warn',
      `${packet.primary.key} Input hash -> ${packet.storedInputHash || 'missing'}`,
    );
  }
  pushCheck('pass', warnAgentsSize(cwd));

  const failCount = checks.filter((item) => item.status === 'fail').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;

  console.log(`# WORKFLOW DOCTOR\n`);
  console.log(`- Root: \`${rootDir}\``);
  console.log(`- Fail count: \`${failCount}\``);
  console.log(`- Warn count: \`${warnCount}\``);
  console.log(`\n## Checks\n`);
  for (const check of checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
  }

  if (args.strict && failCount > 0) {
    process.exitCode = 1;
  }
}

main();
