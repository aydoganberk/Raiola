const fs = require('node:fs');
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
const { readProductManifest, readInstalledVersionMarker } = require('./product_manifest');
const { applyRepairPlan, buildRepairPlan } = require('./repair');
const { writeStateSurface } = require('./state_surface');

function summarizeItems(items, limit = 3) {
  if (items.length <= limit) {
    return items.join(', ');
  }
  return `${items.slice(0, limit).join(', ')} +${items.length - limit} more`;
}

function extractNodeScriptPath(scriptValue) {
  const match = String(scriptValue || '').trim().match(/^node\s+([^\s]+)/);
  return match ? match[1] : null;
}

function printHelp() {
  console.log(`
doctor

Usage:
  node scripts/workflow/doctor.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --strict          Exit non-zero when a fail check exists
  --repair          Print a dry-run repair plan for safe runtime fixes
  --apply           Apply the safe runtime fixes from the repair plan
  --json            Print machine-readable output
  `);
}

function buildDoctorReport(cwd, rootDir) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const checks = [];
  const pushCheck = (status, message, fix = null) => checks.push({ status, message, fix });

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
  const productManifest = readProductManifest(cwd);
  const expectedRuntimeScripts = productManifest?.runtimeScripts || {};
  const expectedScriptEntries = Object.entries(expectedRuntimeScripts);
  const expectedRuntimeFiles = [...new Set([
    ...expectedScriptEntries
      .map(([, scriptValue]) => extractNodeScriptPath(scriptValue))
      .filter(Boolean),
    ...((productManifest?.runtimeFiles || []).filter(Boolean)),
  ])].sort();
  const packageJsonPath = path.join(cwd, 'package.json');
  const skillPath = path.join(cwd, '.agents', 'skills', 'codex-workflow', 'SKILL.md');
  const versionMarker = readInstalledVersionMarker(cwd);
  const installedProductVersion = productManifest?.installedVersion || null;
  const packets = [
    buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  ];

  pushCheck(resolvedActiveRoot === rootDir ? 'pass' : 'warn', `Active workstream root -> ${activeRoot || defaultActiveRoot}`);
  pushCheck(milestone === String(getFieldValue(execplan, 'Active milestone') || 'NONE')
    ? 'pass'
    : 'fail', 'STATUS.md and EXECPLAN.md active milestone fields must stay in sync');
  pushCheck(step === String(getFieldValue(execplan, 'Active milestone step') || 'unknown')
    ? 'pass'
    : 'fail', 'STATUS.md and EXECPLAN.md active step fields must stay in sync');
  pushCheck(
    (!activeRow && milestone === 'NONE') || (activeRow && `${activeRow.milestone} - ${activeRow.goal}` === milestone)
      ? 'pass'
      : 'fail',
    'The active row in MILESTONES.md must match the milestone shown in STATUS.md',
  );
  pushCheck(
    ['solo', 'team'].includes(preferences.mode) ? 'pass' : 'fail',
    `Workflow mode -> ${preferences.mode}`,
  );
  pushCheck(
    ['lite', 'standard', 'full'].includes(preferences.repoWorkflowProfileRaw) ? 'pass' : 'fail',
    `Workflow profile -> repo=${preferences.repoWorkflowProfileRaw}, effective=${preferences.workflowProfile}`,
  );
  pushCheck(
    ['interview', 'assumptions'].includes(preferences.discussMode) ? 'pass' : 'fail',
    `Discuss mode -> ${preferences.discussMode}`,
  );
  pushCheck(
    ['manual', 'phase', 'full'].includes(preferences.automationMode) ? 'pass' : 'fail',
    `Automation mode -> ${preferences.automationMode}`,
  );
  pushCheck(
    ['idle', 'active', 'paused', 'handoff', 'complete'].includes(preferences.automationStatus) ? 'pass' : 'fail',
    `Automation status -> ${preferences.automationStatus}`,
  );
  pushCheck(
    ['handoff_then_compact', 'compact_then_continue'].includes(preferences.automationWindowPolicy) ? 'pass' : 'fail',
    `Automation window policy -> ${preferences.automationWindowPolicy}`,
  );
  pushCheck(
    ['auto', 'on', 'off'].includes(preferences.tokenEfficiencyMeasures) ? 'pass' : 'fail',
    `Token efficiency measures -> ${preferences.tokenEfficiencyMeasures} (loading=${preferences.packetLoadingMode})`,
  );
  pushCheck(
    ['explicit_only', 'suggest', 'off'].includes(preferences.teamLiteDelegation) ? 'pass' : 'fail',
    `Team Lite delegation -> ${preferences.teamLiteDelegation}`,
  );
  pushCheck(
    ['none', 'branch', 'worktree'].includes(preferences.gitIsolation) ? 'pass' : 'fail',
    `Git isolation -> ${preferences.gitIsolation}`,
  );
  if (!productManifest) {
    pushCheck(
      'warn',
      'Product manifest -> .workflow/product-manifest.json is missing, so install-surface parity cannot be fully checked',
      'cwf update',
    );
  } else if (!fs.existsSync(packageJsonPath)) {
    pushCheck(
      'fail',
      'Package scripts -> package.json is missing, so backward-compatible workflow:* commands are unavailable',
      'cwf update --overwrite-scripts',
    );
  } else {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentScripts = packageJson.scripts || {};
    const missingScripts = [];
    const mismatchedScripts = [];

    for (const [name, expected] of expectedScriptEntries) {
      if (!(name in currentScripts)) {
        missingScripts.push(name);
        continue;
      }
      if (currentScripts[name] !== expected) {
        mismatchedScripts.push(name);
      }
    }

    if (missingScripts.length === 0 && mismatchedScripts.length === 0) {
      pushCheck('pass', `Package scripts -> ${expectedScriptEntries.length} expected workflow:* mappings are installed`);
    } else {
      const details = [];
      if (missingScripts.length > 0) {
        details.push(`missing=${summarizeItems(missingScripts)}`);
      }
      if (mismatchedScripts.length > 0) {
        details.push(`mismatched=${summarizeItems(mismatchedScripts)}`);
      }
      pushCheck(
        'fail',
        `Package scripts -> ${details.join(' | ')}`,
        'cwf update --overwrite-scripts',
      );
    }
  }

  if (productManifest) {
    const missingRuntimeFiles = expectedRuntimeFiles.filter((relativeScriptPath) => !fs.existsSync(path.join(cwd, relativeScriptPath)));
    pushCheck(
      missingRuntimeFiles.length === 0 ? 'pass' : 'fail',
      missingRuntimeFiles.length === 0
        ? `Runtime surface -> ${expectedRuntimeFiles.length} expected files are present`
        : `Runtime surface -> missing ${summarizeItems(missingRuntimeFiles.map((item) => `\`${item}\``))}`,
      missingRuntimeFiles.length === 0 ? null : 'cwf update',
    );
  }

  pushCheck(
    fs.existsSync(skillPath) ? 'pass' : 'warn',
    fs.existsSync(skillPath)
      ? 'Skill surface -> codex-workflow skill is installed for Codex'
      : 'Skill surface -> .agents/skills/codex-workflow/SKILL.md is missing',
    fs.existsSync(skillPath) ? null : 'cwf update',
  );

  if (!versionMarker.exists) {
    pushCheck(
      'warn',
      'Product version marker -> .workflow/VERSION.md is missing, so update drift cannot be proven',
      'cwf update',
    );
  } else if (installedProductVersion && versionMarker.installedVersion !== installedProductVersion) {
    pushCheck(
      'warn',
      `Product version marker -> marker=${versionMarker.installedVersion || 'unknown'}, manifest=${installedProductVersion}`,
      'cwf update',
    );
  } else {
    pushCheck('pass', `Product version marker -> ${versionMarker.installedVersion || installedProductVersion || 'present'}`);
  }

  if (preferences.gitIsolation === 'branch' && milestone !== 'NONE') {
    pushCheck(currentBranch(cwd) !== 'main' ? 'pass' : 'warn', 'Branch isolation is expected but you are still on main');
  }
  pushCheck(workstreamRows.length > 0 ? 'pass' : 'warn', 'WORKSTREAMS.md should contain at least one entry');
  for (const packet of packets) {
    pushCheck(
      packet.storedInputHash ? 'pass' : 'warn',
      `${packet.primary.key} Input hash -> ${packet.storedInputHash || 'missing'}`,
    );
  }
  pushCheck('pass', warnAgentsSize(cwd));

  const failCount = checks.filter((item) => item.status === 'fail').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;
  return {
    rootDir,
    rootDirRelative: path.relative(cwd, rootDir),
    failCount,
    warnCount,
    checks,
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
  const report = buildDoctorReport(cwd, rootDir);
  const repairPlan = args.repair || args.apply
    ? buildRepairPlan(cwd, rootDir, { kind: 'doctor' })
    : null;
  const appliedRepair = args.apply ? applyRepairPlan(cwd, rootDir, repairPlan) : null;
  writeStateSurface(cwd, rootDir, {
    doctor: {
      failCount: report.failCount,
      warnCount: report.warnCount,
      checks: report.checks,
      rootDir: report.rootDirRelative,
    },
  }, { updatedBy: 'doctor' });

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
    if (args.strict && report.failCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`# WORKFLOW DOCTOR\n`);
  console.log(`- Root: \`${report.rootDir}\``);
  console.log(`- Fail count: \`${report.failCount}\``);
  console.log(`- Warn count: \`${report.warnCount}\``);
  console.log(`\n## Checks\n`);
  for (const check of report.checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
    if (check.fix) {
      console.log(`  fix: \`${check.fix}\``);
    }
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

  if (args.strict && report.failCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDoctorReport,
};
