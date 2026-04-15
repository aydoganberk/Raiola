const fs = require('node:fs');
const path = require('node:path');
const { readJsonIfExists } = require('./io/json');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { runSecurePhase } = require('./secure_phase');
const { buildDoctorReport } = require('./doctor');
const { buildHealthReport } = require('./health');
const { buildRepairPlan } = require('./repair');
const { buildPackageGraph } = require('./package_graph');
const { buildWorkspaceImpactPayload } = require('./workspace_impact');
const { loadPolicy } = require('./policy');
const { compactList, writePlaneArtifacts } = require('./control_planes_common');

function printHelp() {
  console.log(`
safety_control

Usage:
  node scripts/workflow/safety_control.js

Options:
  --root <path>      Workflow root. Defaults to active workstream root
  --refresh          Recompute dependent reports instead of reusing cached control-room state
  --path <file>      Focus the security scan on one file while keeping the wider control room active
  --json             Print machine-readable output
  `);
}


function safeBuild(builder, fallback) {
  try {
    return builder();
  } catch {
    return fallback;
  }
}

function scriptsForPackage(cwd, packageId) {
  const manifestPath = packageId === '.'
    ? path.join(cwd, 'package.json')
    : path.join(cwd, packageId, 'package.json');
  const manifest = readJsonIfExists(manifestPath, {});
  return manifest.scripts || {};
}

function incidentSummary(cwd) {
  const incidentDir = path.join(cwd, '.workflow', 'incidents');
  if (!fs.existsSync(incidentDir)) {
    return {
      count: 0,
      files: [],
    };
  }
  const files = fs.readdirSync(incidentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `.workflow/incidents/${entry.name}`)
    .sort();
  return {
    count: files.length,
    files: files.slice(0, 10),
  };
}

function policyPosture(cwd) {
  const policy = safeBuild(() => loadPolicy(cwd), {
    mode: 'standard',
    operationDefaults: {},
  });
  const summarize = (operation) => ({
    operation,
    decision: policy.operationDefaults?.[operation]?.decision || 'unknown',
    notes: policy.operationDefaults?.[operation]?.notes || '',
  });
  const operations = ['install', 'network', 'shell', 'delete'];
  const defaults = operations.map(summarize);
  const cautionCount = defaults.filter((entry) => ['warn', 'human_needed', 'block'].includes(entry.decision)).length;
  return {
    mode: policy.mode || 'standard',
    defaults,
    cautionCount,
  };
}

function summarizeSecurePayload(payload) {
  return {
    verdict: payload.verdict || 'unknown',
    scannedFileCount: Number(payload.scannedFiles?.length || 0),
    skippedFileCount: Number(payload.skippedFiles?.length || 0),
    countsByVerdict: payload.countsByVerdict || {},
    countsByCategory: payload.countsByCategory || {},
    topRisks: (payload.topRisks || []).slice(0, 10),
    findings: (payload.findings || []).slice(0, 20),
    suggestedCommands: payload.suggestedCommands || [],
    scanScope: payload.scanScope || 'changes',
  };
}

function summarizeDoctorPayload(payload) {
  return {
    failCount: Number(payload.failCount || 0),
    warnCount: Number(payload.warnCount || 0),
    runtimeSyncCount: Number(payload.runtimeSyncCount || 0),
    topFails: (payload.checks || []).filter((entry) => entry.status === 'fail').slice(0, 10),
    topWarns: (payload.checks || []).filter((entry) => entry.status === 'warn').slice(0, 10),
  };
}

function summarizeHealthPayload(payload) {
  return {
    failCount: Number(payload.failCount || 0),
    warnCount: Number(payload.warnCount || 0),
    runtimeSyncCount: Number(payload.runtimeSyncCount || 0),
    window: payload.window || null,
    topFails: (payload.checks || []).filter((entry) => entry.status === 'fail').slice(0, 10),
    topWarns: (payload.checks || []).filter((entry) => entry.status === 'warn').slice(0, 10),
  };
}

function summarizeRepairPlan(plan) {
  return {
    kind: plan.kind || 'doctor',
    safeActionCount: Number(plan.safeActionCount || 0),
    runtimeIssueCount: Number(plan.runtimeIssues?.length || 0),
    manualIssueCount: Number(plan.manualIssues?.length || 0),
    runtimeIssues: (plan.runtimeIssues || []).slice(0, 12),
    manualIssues: (plan.manualIssues || []).slice(0, 12),
    actions: (plan.actions || []).map((action) => action.label).slice(0, 12),
  };
}

function verificationExposure(cwd, workspaceImpact) {
  const rows = (workspaceImpact.packageBoard || []).map((row) => {
    const scripts = scriptsForPackage(cwd, row.packageId);
    return {
      packageId: row.packageId,
      packageName: row.packageName,
      packagePath: row.packagePath,
      changed: Boolean(row.changed),
      impacted: Boolean(row.impacted),
      dependentCount: Number(row.dependentCount || 0),
      internalDependencyCount: Number(row.internalDependencyCount || 0),
      changedFileCount: Number(row.changedFileCount || 0),
      verificationCommands: row.verificationCommands || [],
      scriptNames: Object.keys(scripts),
    };
  });

  const highRisk = rows
    .filter((row) => (row.changed || row.impacted) && row.dependentCount >= 3 && row.verificationCommands.length === 0)
    .slice(0, 8);
  const mediumRisk = rows
    .filter((row) => (row.changed || row.impacted) && row.verificationCommands.length === 0 && !highRisk.some((entry) => entry.packageId === row.packageId))
    .slice(0, 8);
  const thinCoverage = rows
    .filter((row) => (row.changed || row.impacted) && row.verificationCommands.length > 0 && row.verificationCommands.length <= 1)
    .slice(0, 8);

  return {
    highRiskPackages: highRisk,
    mediumRiskPackages: mediumRisk,
    thinCoveragePackages: thinCoverage,
  };
}

function failureForecast(secure, doctor, health, repair, workspaceImpact, exposure, incidents) {
  const forecast = [];
  const push = (severity, title, reason, command = null) => {
    if (!title || forecast.some((entry) => entry.title === title)) {
      return;
    }
    forecast.push({ severity, title, reason, command });
  };

  if ((secure.countsByVerdict.fail || 0) > 0) {
    push('high', 'Security-critical patterns detected', 'The secure phase found at least one high-confidence destructive command or embedded secret pattern.', 'rai secure --scope repo --json');
  }
  if (doctor.failCount > 0 || health.failCount > 0) {
    push('high', 'Runtime or lifecycle integrity is failing', 'Doctor or health checks are already failing, so implementation work may be happening on a broken operator surface.', 'rai repair --kind health --json');
  }
  if (repair.safeActionCount > 0) {
    push('medium', 'Self-healing actions are pending', 'Safe repair actions exist and should be reviewed before the next wider execution wave.', 'rai repair --kind health --json');
  }
  if (workspaceImpact.blastRadius?.verdict === 'repo-wide') {
    push('medium', 'Blast radius is repo-wide', 'A broad change surface increases the odds of security, verification, and rollback gaps compounding.', 'rai workspace-impact --json');
  }
  if ((exposure.highRiskPackages || []).length > 0) {
    push('high', 'High-fan-out packages lack local verification', 'Changed or impacted packages with many dependents do not expose package-local verification commands.', 'rai workspace-impact --json');
  }
  if ((exposure.mediumRiskPackages || []).length > 0) {
    push('medium', 'Some changed packages have no local verify lane', 'Changed or impacted packages exist without test, lint, typecheck, or build commands nearby.', 'rai workspace-impact --json');
  }
  if (incidents.count > 0) {
    push('medium', 'Open incident memory exists', 'Past incidents are still recorded and should shape the next repair or hardening decision.', 'rai incident list --json');
  }
  return forecast.slice(0, 10);
}

function buildVerdict(secure, doctor, health, repair, forecast) {
  if (secure.verdict === 'fail' || doctor.failCount > 0 || health.failCount > 0 || forecast.some((entry) => entry.severity === 'high')) {
    return 'attention-required';
  }
  if (secure.verdict === 'warn' || doctor.warnCount > 0 || health.warnCount > 0 || repair.safeActionCount > 0 || forecast.length > 0) {
    return 'guided';
  }
  return 'clear';
}

function buildNextActions(payload) {
  const actions = [];
  const push = (priority, title, command, reason) => {
    if (!command || actions.some((entry) => entry.command === command)) {
      return;
    }
    actions.push({ priority, title, command, reason });
  };

  if (payload.security.verdict === 'fail') {
    push('high', 'Inspect the security-critical findings', 'rai secure --scope repo --json', 'High-confidence destructive commands or secret material were detected.');
  }
  if (payload.recovery.doctor.failCount > 0 || payload.recovery.health.failCount > 0) {
    push('high', 'Review the runtime repair plan', 'rai repair --kind health --json', 'The operator surface itself is failing checks and should be stabilized before wider edits.');
  }
  if (payload.recovery.repair.safeActionCount > 0) {
    push('medium', 'Review safe self-healing fixes', 'rai repair --kind health --json', 'A bounded set of safe repair actions is available and should be reviewed before apply.');
  }
  if (payload.failureForecast.some((entry) => entry.title === 'High-fan-out packages lack local verification')) {
    push('high', 'Open the impacted package wave', 'rai workspace-impact --json', 'Package fan-out and missing local verification should be tightened before more edits land.');
  }
  if (payload.policy.cautionCount > 0) {
    push('medium', 'Check policy posture for risky operations', 'rai policy --json', 'Install, network, shell, or delete operations deserve an explicit policy read.');
  }
  if (payload.incidents.count === 0 && payload.verdict === 'attention-required') {
    push('medium', 'Open an incident note for the current blockers', `rai incident open --title ${JSON.stringify('safety-control-incident')} --summary ${JSON.stringify('Record the current safety blockers and the repair path before widening the next execution wave.')} --command ${JSON.stringify('rai safety-control --json')}`, 'An explicit incident trail makes repeated failures easier to recover from.');
  }
  push('medium', 'Refresh the trust posture', 'rai trust --json', 'After hardening and repair review, re-check whether the work is safe to start, merge, or ship.');
  return actions.slice(0, 8);
}

function renderSafetyControlMarkdown(payload) {
  return `# SAFETY CONTROL ROOM

- Verdict: \`${payload.verdict}\`
- Repo shape: \`${payload.repoShape}\`
- Secure phase: \`${payload.security.verdict}\`
- Doctor: fail=\`${payload.recovery.doctor.failCount}\` warn=\`${payload.recovery.doctor.warnCount}\`
- Health: fail=\`${payload.recovery.health.failCount}\` warn=\`${payload.recovery.health.warnCount}\`
- Safe repairs: \`${payload.recovery.repair.safeActionCount}\`
- Incidents: \`${payload.incidents.count}\`
- Blast radius: \`${payload.workspaceImpact.blastRadius?.verdict || 'unknown'}\`

## Security Top Risks

${payload.security.topRisks.length > 0
    ? payload.security.topRisks.map((item) => `- [${String(item.verdict).toUpperCase()}] ${item.file} :: ${item.reason}`).join('\n')
    : '- `No security finding is currently open.`'}

## Failure Forecast

${payload.failureForecast.length > 0
    ? payload.failureForecast.map((item) => `- [${String(item.severity).toUpperCase()}] ${item.title} -> ${item.reason}${item.command ? ` :: \`${item.command}\`` : ''}`).join('\n')
    : '- `No failure forecast is currently active.`'}

## Verification Exposure

${payload.exposure.highRiskPackages.length > 0
    ? payload.exposure.highRiskPackages.map((item) => `- HIGH \`${item.packageName}\` -> dependents=${item.dependentCount} changed=${item.changed} impacted=${item.impacted}`).join('\n')
    : '- `No high-risk verification exposure is active.`'}${payload.exposure.mediumRiskPackages.length > 0
    ? `\n${payload.exposure.mediumRiskPackages.map((item) => `- MEDIUM \`${item.packageName}\` -> dependents=${item.dependentCount} changed=${item.changed} impacted=${item.impacted}`).join('\n')}`
    : ''}

## Recovery Surface

- Doctor top fails: \`${payload.recovery.doctor.topFails.length}\`
- Health top fails: \`${payload.recovery.health.topFails.length}\`
- Repair actions: \`${payload.recovery.repair.actions.join(', ') || 'none'}\`

## Next Actions

${payload.nextActions.length > 0
    ? payload.nextActions.map((item) => `- [${item.priority}] ${item.title} -> \`${item.command}\``).join('\n')
    : '- `No follow-up action is queued.`'}
`;
}

function buildSafetyControlPayload(cwd, rootDir, options = {}) {
  const securePayload = summarizeSecurePayload(runSecurePhase(cwd, {
    scope: 'repo',
    repo: true,
    path: options.path,
  }));
  const doctorPayload = summarizeDoctorPayload(safeBuild(() => buildDoctorReport(cwd, rootDir), {
    failCount: 0,
    warnCount: 0,
    runtimeSyncCount: 0,
    checks: [],
  }));
  const healthRaw = safeBuild(() => buildHealthReport(cwd, rootDir), {
    failCount: 0,
    warnCount: 0,
    runtimeSyncCount: 0,
    checks: [],
    window: null,
  });
  const healthPayload = summarizeHealthPayload(healthRaw);
  const repairPayload = summarizeRepairPlan(buildRepairPlan(cwd, rootDir, {
    kind: 'health',
    healthReport: healthRaw,
  }));
  const packageGraph = safeBuild(() => buildPackageGraph(cwd, { writeFiles: true }), {
    repoShape: 'unknown',
    packageCount: 0,
    packages: [],
  });
  const workspaceImpact = safeBuild(() => buildWorkspaceImpactPayload(cwd, rootDir, options), {
    repoShape: packageGraph.repoShape || 'unknown',
    packageCount: Number(packageGraph.packageCount || 0),
    blastRadius: {
      verdict: 'clean',
      changedPackageCount: 0,
      impactedPackageCount: 0,
      impactedWorkspaceCount: 0,
    },
    packageBoard: [],
    waves: [],
    parallelization: {
      mode: 'single-wave-first',
      recommendedLaneCount: 1,
    },
  });
  const policy = policyPosture(cwd);
  const incidents = incidentSummary(cwd);
  const exposure = verificationExposure(cwd, workspaceImpact);
  const forecast = failureForecast(securePayload, doctorPayload, healthPayload, repairPayload, workspaceImpact, exposure, incidents);
  const verdict = buildVerdict(securePayload, doctorPayload, healthPayload, repairPayload, forecast);

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'safety-control',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    verdict,
    repoShape: packageGraph.repoShape || workspaceImpact.repoShape || 'unknown',
    packageCount: Number(packageGraph.packageCount || workspaceImpact.packageCount || 0),
    security: securePayload,
    recovery: {
      doctor: doctorPayload,
      health: healthPayload,
      repair: repairPayload,
    },
    workspaceImpact: {
      verdict: workspaceImpact.verdict,
      blastRadius: workspaceImpact.blastRadius,
      waves: (workspaceImpact.waves || []).slice(0, 8),
      parallelization: workspaceImpact.parallelization,
      packageBoard: (workspaceImpact.packageBoard || []).slice(0, 20),
    },
    exposure,
    policy,
    incidents,
    failureForecast: forecast,
    codex: {
      command: 'rai codex operator --goal "stabilize the current security and repair wave" --json',
      skills: ['raiola-safety-control-room', 'raiola-native-operator', 'raiola-codex-cockpit'],
      guide: '.codex/operator/safety-control/README.md',
    },
    commands: {
      secure: 'rai secure --scope repo --json',
      doctor: 'rai doctor --repair --json',
      repair: 'rai repair --kind health --json',
      trust: 'rai trust --json',
      workspaceImpact: 'rai workspace-impact --json',
      incidentList: 'rai incident list --json',
      repoControl: 'rai repo-control --json',
    },
    nextActions: [],
    artifacts: null,
  };

  payload.nextActions = buildNextActions(payload);
  payload.artifacts = writePlaneArtifacts(cwd, 'safety-control-room', payload, renderSafetyControlMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildSafetyControlPayload(cwd, rootDir, args);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# SAFETY CONTROL ROOM\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Secure phase: \`${payload.security.verdict}\``);
  console.log(`- Doctor fail/warn: \`${payload.recovery.doctor.failCount}/${payload.recovery.doctor.warnCount}\``);
  console.log(`- Health fail/warn: \`${payload.recovery.health.failCount}/${payload.recovery.health.warnCount}\``);
  console.log(`- Repair actions: \`${payload.recovery.repair.safeActionCount}\``);
  if (payload.artifacts?.markdown) {
    console.log(`- Output: \`${payload.artifacts.markdown}\``);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildSafetyControlPayload,
};
