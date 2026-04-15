const fs = require('node:fs');
const path = require('node:path');
const {
  detectRepoProductMeta,
  embeddedProductMeta,
  productCommandName,
  productVersion,
  } = require('./product_version');
const {
  missingGitignoreEntries,
  WORKFLOW_GITIGNORE_ENTRIES,
  } = require('./install_common');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  currentBranch,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseMilestoneTable,
  parseWorkstreamTable,
  resolveWorkflowRoot,
  warnAgentsSize,
  workflowPaths,
} = require('./common');
const { readText: read } = require('./io/files');
const { readProductManifest, readInstalledVersionMarker } = require('./product_manifest');
const { applyRepairPlan, buildRepairPlan } = require('./repair');
const { buildRiskSummary } = require('./risk_score');
const { buildRuntimePrerequisiteChecks } = require('./runtime_prereqs');
const { writeStateSurface } = require('./state_surface');
const { contractPayload } = require('./contract_versions');
const { buildSetupCompatibilityReport } = require('./setup_compatibility');

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


function inventoryEntryExists(cwd, relativeEntry) {
  const normalized = String(relativeEntry || '').trim();
  if (!normalized) {
    return false;
  }
  return fs.existsSync(path.join(cwd, normalized));
}


function gitattributesHasEntries(cwd, entries = []) {
  const filePath = path.join(cwd, '.gitattributes');
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return entries.every((entry) => content.includes(entry));
}

function expectedGithubReleaseSurface() {
  return [
    '.github/AGENTS.md',
    '.github/codex/AGENTS.md',
    '.github/codex/prompts/review.md',
    '.github/workflows/codex-review.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/release.yml',
  ];
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

The doctor surface checks install integrity, runtime file drift, and host prerequisites.
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
  const packageJson = (() => {
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch {
      return null;
    }
  })();
  const expectedGithubFiles = expectedGithubReleaseSurface();
  const skillPath = path.join(cwd, '.agents', 'skills', 'raiola', 'SKILL.md');
  const expectedSkillFiles = [...new Set([
    productManifest?.skillPath || '.agents/skills/raiola/SKILL.md',
    ...((productManifest?.skillPackPaths || []).filter(Boolean)),
  ])];
  const versionMarker = readInstalledVersionMarker(cwd);
  const installedProductVersion = productManifest?.installedVersion || null;
  const expectedProductVersion = productVersion();
  const embeddedMeta = embeddedProductMeta();
  const productPackageRoot = path.resolve(__dirname, '..', '..');
  const repoProductMeta = detectRepoProductMeta(productPackageRoot);
  const installReportPresent = fs.existsSync(path.join(cwd, '.workflow', 'install-report.json'));
  const isProductSourceRepo = path.resolve(cwd) === productPackageRoot && Boolean(repoProductMeta);
  const enforceSourceReleaseInventory = isProductSourceRepo && !installReportPresent;
  const sourceRepoVersion = repoProductMeta?.version || null;
  const versionDriftStatus = sourceRepoVersion ? 'fail' : 'warn';
  const packets = [
    buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  ];

  const compatibility = buildSetupCompatibilityReport(cwd, {
    scriptProfile: productManifest?.scriptProfile || 'full',
    manageGitignore: true,
  });

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
    ['interview', 'assumptions', 'proposal_first'].includes(preferences.discussMode) ? 'pass' : 'fail',
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
  for (const check of buildRuntimePrerequisiteChecks(cwd, { surface: 'doctor' })) {
    pushCheck(check.status, check.message, check.fix || null);
  }
  if (!productManifest) {
    pushCheck(
      isProductSourceRepo ? 'pass' : 'warn',
      isProductSourceRepo
        ? 'Product manifest -> source package repo uses package.json as the canonical install surface'
        : 'Product manifest -> .workflow/product-manifest.json is missing, so install-surface parity cannot be fully checked',
      isProductSourceRepo ? null : `${productCommandName()} update`,
    );
  } else if (!fs.existsSync(packageJsonPath)) {
    pushCheck(
      'fail',
      'Package scripts -> package.json is missing, so repo-local raiola:* commands are unavailable',
      `${productCommandName()} update --overwrite-scripts`,
    );
  } else if (!packageJson) {
    pushCheck(
      'fail',
      'Package scripts -> package.json is invalid JSON',
      `Fix package.json JSON syntax, then rerun ${productCommandName()} doctor --repair`,
    );
  } else {
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
      pushCheck('pass', `Package scripts -> ${expectedScriptEntries.length} expected raiola:* mappings are installed`);
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
        `${productCommandName()} update --overwrite-scripts`,
      );
    }
  }

  if (productManifest) {
    pushCheck(
      'pass',
      `Install surface -> profile=${productManifest.scriptProfile || 'full'}, runtime=${productManifest.runtimeSurfaceProfile || 'full'}, files=${productManifest.runtimeFiles?.length || 0}`,
    );
    const missingRuntimeFiles = expectedRuntimeFiles.filter((relativeScriptPath) => !fs.existsSync(path.join(cwd, relativeScriptPath)));
    pushCheck(
      missingRuntimeFiles.length === 0 ? 'pass' : 'fail',
      missingRuntimeFiles.length === 0
        ? `Runtime surface -> ${expectedRuntimeFiles.length} expected files are present`
        : `Runtime surface -> missing ${summarizeItems(missingRuntimeFiles.map((item) => `\`${item}\``))}`,
      missingRuntimeFiles.length === 0 ? null : `${productCommandName()} update`,
    );
  }


  if (packageJson?.files?.length) {
    const missingPackagedEntries = packageJson.files.filter((entry) => !inventoryEntryExists(cwd, entry));
    pushCheck(
      missingPackagedEntries.length === 0 ? 'pass' : 'fail',
      missingPackagedEntries.length === 0
        ? `Release inventory -> package.json files entries resolve (${packageJson.files.length})`
        : `Release inventory -> package.json files contains missing paths ${summarizeItems(missingPackagedEntries.map((item) => `\`${item}\``))}`,
      missingPackagedEntries.length === 0 ? null : 'Restore or remove the missing file-inventory entries before shipping',
    );
  }

  if (enforceSourceReleaseInventory) {
    const missingGithubFiles = expectedGithubFiles.filter((entry) => !inventoryEntryExists(cwd, entry));
    pushCheck(
      missingGithubFiles.length === 0 ? 'pass' : 'fail',
      missingGithubFiles.length === 0
        ? `Release inventory -> GitHub surfaces are present (${expectedGithubFiles.length})`
        : `Release inventory -> missing GitHub surfaces ${summarizeItems(missingGithubFiles.map((item) => `\`${item}\``))}`,
      missingGithubFiles.length === 0 ? null : 'Restore the documented .github release surfaces before packaging',
    );
  }

  const recommendedGitignoreEntries = productManifest?.recommendedGitignoreEntries || WORKFLOW_GITIGNORE_ENTRIES;
  const missingIgnoreEntries = missingGitignoreEntries(cwd, recommendedGitignoreEntries);
  pushCheck(
    missingIgnoreEntries.length === 0 ? 'pass' : 'warn',
    missingIgnoreEntries.length === 0
      ? `Gitignore hygiene -> runtime artifacts are ignored (${recommendedGitignoreEntries.join(', ')})`
      : `Gitignore hygiene -> missing ${summarizeItems(missingIgnoreEntries)}`,
    missingIgnoreEntries.length === 0 ? null : `${productCommandName()} update`,
  );

  const requiredArchiveIgnoreEntries = ['.workflow export-ignore', '.workflow/** export-ignore'];
  pushCheck(
    gitattributesHasEntries(cwd, requiredArchiveIgnoreEntries) ? 'pass' : 'warn',
    gitattributesHasEntries(cwd, requiredArchiveIgnoreEntries)
      ? 'Release inventory -> archive hygiene excludes .workflow runtime state'
      : 'Release inventory -> .gitattributes is missing .workflow export-ignore rules',
    gitattributesHasEntries(cwd, requiredArchiveIgnoreEntries) ? null : 'Add .workflow export-ignore rules to .gitattributes before packaging source archives',
  );

  const skillSurfacePresent = fs.existsSync(skillPath);
  const installedSkillFiles = expectedSkillFiles.filter((relativeFile) => fs.existsSync(path.join(cwd, relativeFile)));
  pushCheck(
    skillSurfacePresent || isProductSourceRepo ? 'pass' : 'warn',
    skillSurfacePresent
      ? `Skill surface -> primary raiola skill plus ${Math.max(installedSkillFiles.length - 1, 0)} packaged skill files are installed`
      : isProductSourceRepo
        ? 'Skill surface -> source package repo ships skill/SKILL.md and skills/*; installed alias copies are not required here'
        : 'Skill surface -> .agents/skills/raiola/SKILL.md is missing',
    skillSurfacePresent || isProductSourceRepo ? null : `${productCommandName()} update`,
  );

  if (!versionMarker.exists) {
    if (isProductSourceRepo) {
      pushCheck(
        'pass',
        'Product version marker -> source package repo uses package.json as the canonical version source',
      );
    } else {
      pushCheck(
        versionDriftStatus,
        'Product version marker -> .workflow/VERSION.md is missing, so update drift cannot be proven',
        `${productCommandName()} update`,
      );
    }
  } else if (installedProductVersion && versionMarker.installedVersion !== installedProductVersion) {
    pushCheck(
      versionDriftStatus,
      `Product version marker -> marker=${versionMarker.installedVersion || 'unknown'}, manifest=${installedProductVersion}`,
      `${productCommandName()} update`,
    );
  } else if (versionMarker.installedVersion && versionMarker.installedVersion !== expectedProductVersion) {
    pushCheck(
      versionDriftStatus,
      `Product version marker -> marker=${versionMarker.installedVersion}, expected=${expectedProductVersion}`,
      `${productCommandName()} update`,
    );
  } else {
    pushCheck('pass', `Product version marker -> ${versionMarker.installedVersion || installedProductVersion || 'present'}`);
  }

  if (productManifest && installedProductVersion && installedProductVersion !== expectedProductVersion) {
    pushCheck(
      versionDriftStatus,
      `Product manifest version -> manifest=${installedProductVersion}, expected=${expectedProductVersion}`,
      `${productCommandName()} update`,
    );
  }

  if (productManifest?.sourcePackageVersion && productManifest.sourcePackageVersion !== expectedProductVersion) {
    pushCheck(
      versionDriftStatus,
      `Product manifest source package -> manifest=${productManifest.sourcePackageVersion}, expected=${expectedProductVersion}`,
      `${productCommandName()} update`,
    );
  }

  if (repoProductMeta && repoProductMeta.version !== embeddedMeta.version) {
    pushCheck(
      'fail',
      `Embedded workflow product version -> embedded=${embeddedMeta.version}, repo package=${repoProductMeta.version}`,
      'Update scripts/workflow/product_version.js to match package.json before shipping',
    );
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

  if (compatibility.detectedTooling.hookManagers.length > 0) {
    pushCheck(
      'pass',
      `Compatibility -> hook/tooling managers detected (${compatibility.detectedTooling.hookManagers.join(', ')}); Raiola keeps Git-hook integration repo-local and opt-in`,
    );
  }
  if (compatibility.detectedTooling.linters.length > 0) {
    pushCheck(
      'pass',
      `Compatibility -> lint/format tooling detected (${compatibility.detectedTooling.linters.join(', ')})`,
    );
  }
  if (compatibility.detectedTooling.ciWorkflows.length > 0) {
    pushCheck(
      compatibility.conflicts.managedFiles.some((entry) => entry.path.startsWith('.github/')) ? 'warn' : 'pass',
      `Compatibility -> CI workflows detected (${compatibility.detectedTooling.ciWorkflows.join(', ')})`,
      compatibility.conflicts.managedFiles.some((entry) => entry.path.startsWith('.github/')) ? `${productCommandName()} setup --dry-run` : null,
    );
  }
  if (compatibility.conflicts.managedFiles.length > 0) {
    pushCheck(
      'warn',
      `Compatibility -> managed surface overlaps ${summarizeItems(compatibility.conflicts.managedFiles.map((entry) => `\`${entry.path}\``))}`,
      `${productCommandName()} setup --dry-run`,
    );
  }
  if (compatibility.detectedTooling.agentDirs.claude) {
    pushCheck(
      'pass',
      'Compatibility -> existing .claude directory detected; Raiola setup does not overwrite it by default',
    );
  }

  const failCount = checks.filter((item) => item.status === 'fail').length;
  const warnCount = checks.filter((item) => item.status === 'warn').length;
  const risk = buildRiskSummary(checks);
  return {
    ...contractPayload('doctorReport'),
    rootDir,
    rootDirRelative: path.relative(cwd, rootDir),
    failCount,
    warnCount,
    checks,
    risk,
    compatibility,
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
      risk: report.risk,
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
  console.log(`- Risk: \`${report.risk.level}\` (\`${report.risk.score}/100\`)`);
  console.log(`\n## Checks\n`);
  for (const check of report.checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
    if (check.fix) {
      console.log(`  fix: \`${check.fix}\``);
    }
  }

  if (report.risk.factors.length > 0) {
    console.log(`\n## Risk Factors\n`);
    for (const factor of report.risk.factors) {
      console.log(`- [${String(factor.status).toUpperCase()}] impact=\`${factor.impact}\` ${factor.message}`);
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
