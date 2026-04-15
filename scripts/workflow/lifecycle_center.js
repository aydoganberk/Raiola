const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildDoctorReport } = require('./doctor');
const { buildHealthReport } = require('./health');
const { buildRepairPlan } = require('./repair');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { readInstalledVersionMarker, readProductManifest } = require('./product_manifest');
const { productVersion } = require('./product_version');
const { readJson, relativePath, writePlaneArtifacts } = require('./control_planes_common');
const { EXPORT_KEY_BY_CONFIG } = require('./control_plane_publish');
const { evaluateLifecycleState } = require('./lifecycle_fsm');
const { buildRuntimeContract } = require('./agent_runtime');

const CONFIG_DRIFT_KEYS = Object.freeze([
  'defaultProfile',
  'trustLevel',
  'preferredBundles',
  'preferredAddOns',
  'requiredVerifications',
  'handoffStandard',
  'automation',
  'releaseControl',
  'externalExports',
  'explainability',
]);

function sortValue(value) {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => sortValue(entry));
    const scalarsOnly = normalized.every((entry) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry));
    return scalarsOnly
      ? [...normalized].sort((left, right) => String(left).localeCompare(String(right)))
      : normalized;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function valuesEqual(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function reverseExportMap() {
  return Object.entries(EXPORT_KEY_BY_CONFIG).reduce((acc, [configName, exportKey]) => {
    acc[exportKey] = configName;
    return acc;
  }, {});
}

function buildConfigDrift(cwd, repoConfigPayload) {
  const filePath = path.join(cwd, '.workflow', 'repo-config.json');
  const storedConfig = readJson(filePath, null);
  const changedKeys = [];
  if (storedConfig?.generatedDefaults && repoConfigPayload.generatedDefaults) {
    for (const key of CONFIG_DRIFT_KEYS) {
      if (!valuesEqual(storedConfig.generatedDefaults[key], repoConfigPayload.generatedDefaults[key])) {
        changedKeys.push(key);
      }
    }
  }

  const reasons = [];
  if (!storedConfig) {
    reasons.push('repo-config file is missing');
  }
  if (storedConfig && !storedConfig.generatedDefaults) {
    reasons.push('stored repo-config does not include generated defaults');
  }
  if (changedKeys.length > 0) {
    reasons.push(`generated defaults changed: ${changedKeys.join(', ')}`);
  }
  if ((repoConfigPayload.warnings || []).length > 0) {
    reasons.push(`${repoConfigPayload.warnings.length} repo-config warning(s) are active`);
  }

  return {
    present: reasons.length > 0,
    path: relativePath(cwd, filePath),
    stored: Boolean(storedConfig),
    changedKeys,
    warnings: repoConfigPayload.warnings || [],
    reasons,
    detectedProfiles: (repoConfigPayload.detectedProfiles || []).map((entry) => entry.id),
    command: storedConfig ? 'rai repo-config --refresh --json' : 'rai repo-config --write --json',
  };
}

function buildExportDrift(cwd, repoConfigSummary) {
  const manifestPath = path.join(cwd, '.workflow', 'exports', 'export-manifest.json');
  const manifest = readJson(manifestPath, null);
  const changeControl = readJson(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null);
  const reverseMap = reverseExportMap();
  const expected = Array.isArray(repoConfigSummary.externalExports) ? repoConfigSummary.externalExports : [];
  const exportsMap = manifest?.exports || {};
  const producedConfigNames = Object.keys(exportsMap)
    .map((key) => reverseMap[key])
    .filter(Boolean);
  const missingByConfig = expected.filter((name) => !exportsMap[EXPORT_KEY_BY_CONFIG[name]]);
  const missingFiles = Object.entries(exportsMap)
    .filter(([, relativeFile]) => !relativeFile || !fs.existsSync(path.join(cwd, relativeFile)))
    .map(([exportKey]) => exportKey);
  const unexpected = producedConfigNames.filter((name) => !expected.includes(name));
  const stale = Boolean(
    manifest?.generatedAt
    && changeControl?.generatedAt
    && new Date(manifest.generatedAt).getTime() < new Date(changeControl.generatedAt).getTime()
  );

  const reasons = [];
  if (!manifest) {
    reasons.push('export manifest is missing');
  }
  if (missingByConfig.length > 0) {
    reasons.push(`expected exports are missing: ${missingByConfig.join(', ')}`);
  }
  if (missingFiles.length > 0) {
    reasons.push(`materialized export files are missing: ${missingFiles.join(', ')}`);
  }
  if (unexpected.length > 0) {
    reasons.push(`unexpected exports are present: ${unexpected.join(', ')}`);
  }
  if (stale) {
    reasons.push('export manifest is older than the current change-control artifact');
  }

  return {
    present: reasons.length > 0,
    path: relativePath(cwd, manifestPath),
    manifestPresent: Boolean(manifest),
    expected,
    produced: producedConfigNames,
    producedCount: producedConfigNames.length,
    expectedCount: expected.length,
    coverageRatio: manifest?.publishPlan?.exportCoverage?.coverageRatio
      ?? (expected.length > 0 ? Number(((producedConfigNames.length / expected.length) * 100).toFixed(1)) : 100),
    missingByConfig,
    missingFiles,
    unexpected,
    stale,
    reasons,
    command: changeControl ? 'node scripts/workflow/control_plane_publish.js --json' : 'rai release-control --json',
  };
}

function lifecycleVerdict(summary = {}) {
  if ((summary.doctor?.failCount || 0) > 0 || (summary.health?.failCount || 0) > 0) {
    return 'repair-needed';
  }
  if (summary.upgrade?.drift || summary.runtimeDrift?.present || summary.drift?.config?.present || summary.drift?.exports?.present || (summary.doctor?.warnCount || 0) > 0 || (summary.health?.warnCount || 0) > 0) {
    return 'watch';
  }
  return 'healthy';
}

function buildSelfHealing(doctorRepair, healthRepair, configDrift, exportDrift, upgrade, versionMarker) {
  const actions = [];
  const manualIssues = [];
  const pushAction = (label, command, reason, priority = 'medium') => {
    if (!label || actions.some((entry) => entry.label === label && entry.command === command)) {
      return;
    }
    actions.push({ label, command, reason, priority });
  };
  const pushManual = (command, reason) => {
    if (!command || manualIssues.some((entry) => entry.command === command && entry.reason === reason)) {
      return;
    }
    manualIssues.push({ command, reason });
  };

  for (const action of doctorRepair.actions || []) {
    pushAction(action.label, action.command || 'rai doctor --repair', action.reason || action.label, 'high');
  }
  for (const action of healthRepair.actions || []) {
    pushAction(action.label, action.command || 'rai health --repair', action.reason || action.label, 'high');
  }
  for (const issue of doctorRepair.manualIssues || []) {
    pushManual(issue.command, issue.reason || issue.type || 'doctor manual issue');
  }
  for (const issue of healthRepair.manualIssues || []) {
    pushManual(issue.command, issue.reason || issue.type || 'health manual issue');
  }

  if (configDrift.present) {
    pushAction('Refresh repo-native config defaults', configDrift.command, configDrift.reasons[0] || 'Repo config drift is active.', 'medium');
  }
  if (exportDrift.present) {
    pushAction('Refresh publish/export surface', exportDrift.command, exportDrift.reasons[0] || 'External integration exports are stale or incomplete.', 'medium');
  }
  if (upgrade.drift) {
    pushAction(
      versionMarker.previousVersion ? `Update from ${versionMarker.installedVersion || 'unknown'} to ${productVersion()}` : 'Refresh to the current product version',
      'rai update',
      'Installed version markers differ from the current embedded product version.',
      'high',
    );
  }

  return {
    safeActions: actions.length,
    actions: actions.slice(0, 16),
    manualIssues: manualIssues.slice(0, 12),
    commands: [...new Set(actions.map((entry) => entry.command).filter(Boolean))],
  };
}

function renderLifecycleMarkdown(payload) {
  return `# LIFECYCLE CENTER

- Verdict: \`${payload.verdict}\`
- Installed version: \`${payload.version.installed || 'unknown'}\`
- Expected version: \`${payload.version.expected}\`
- Doctor: fail=\`${payload.doctor.failCount}\` warn=\`${payload.doctor.warnCount}\`
- Health: fail=\`${payload.health.failCount}\` warn=\`${payload.health.warnCount}\`

## Lifecycle Questions

- Installation complete? \`${payload.installation.ready ? 'yes' : 'no'}\`
- Upgrade drift present? \`${payload.upgrade.drift ? 'yes' : 'no'}\`
- Runtime drift present? \`${payload.runtimeDrift.present ? 'yes' : 'no'}\`
- Config drift present? \`${payload.drift.config.present ? 'yes' : 'no'}\`
- Export drift present? \`${payload.drift.exports.present ? 'yes' : 'no'}\`
- Safe repair actions available? \`${payload.selfHealing.safeActions}\`
- Safe rollback hint available? \`${payload.rollback.hint || 'none'}\`
- Primary agent runtime: \`${payload.agentRuntime.primary}\`
- Recommended lifecycle next: \`${payload.stateMachine.recommendedNext}\`

## Runtime Contract

- Primary runtime: \`${payload.agentRuntime.primary}\`
- Multi-runtime repo: \`${payload.agentRuntime.multiRuntime ? 'yes' : 'no'}\`
- Detected adapters: \`${payload.agentRuntime.depthSummary.detectedAdapters.join(', ') || 'generic'}\`
- Operational adapters: \`${payload.agentRuntime.depthSummary.operationalAdapters.join(', ') || 'none'}\`
- Hook-capable adapters: \`${payload.agentRuntime.depthSummary.hookCapableAdapters.join(', ') || 'none'}\`
- MCP transports: \`${payload.agentRuntime.depthSummary.mcpTransports.join(', ') || 'none'}\`
- Valid lifecycle transitions: \`${payload.stateMachine.validTransitions.join(', ') || 'none'}\`
- Blocked lifecycle transitions: \`${payload.stateMachine.blockedTransitions.map((entry) => entry.next).join(', ') || 'none'}\`

## Adapter Depth

${payload.agentRuntime.adapters.filter((entry) => entry.detected && entry.id !== 'generic').length > 0
    ? payload.agentRuntime.adapters
      .filter((entry) => entry.detected && entry.id !== 'generic')
      .map((entry) => `- \`${entry.id}\` -> \`${entry.integration.level}\` (${entry.integration.score}/${entry.integration.maxScore}) :: ${entry.integration.summary}`)
      .join('\n')
    : '- `No named adapter is currently detected.`'}

## Drift Surface

- Config changed keys: \`${payload.drift.config.changedKeys.join(', ') || 'none'}\`
- Export coverage: \`${payload.drift.exports.coverageRatio}\`%
- Missing exports: \`${payload.drift.exports.missingByConfig.join(', ') || 'none'}\`
- Missing export files: \`${payload.drift.exports.missingFiles.join(', ') || 'none'}\`
- Export command: \`${payload.drift.exports.command}\`

## Self-Healing

${payload.selfHealing.actions.length > 0
    ? payload.selfHealing.actions.map((item) => `- [${item.priority}] ${item.label} -> \`${item.command}\``).join('\n')
    : '- `No automatic repair action is currently queued.`'}

## Manual Issues

${payload.selfHealing.manualIssues.length > 0
    ? payload.selfHealing.manualIssues.map((item) => `- \`${item.command}\` :: ${item.reason}`).join('\n')
    : '- `No manual issue is currently queued.`'}

## Top Doctor Signals

${payload.doctor.topChecks.length > 0
    ? payload.doctor.topChecks.map((item) => `- [${item.status}] ${item.message}`).join('\n')
    : '- `No doctor signal is present.`'}

## Top Health Signals

${payload.health.topChecks.length > 0
    ? payload.health.topChecks.map((item) => `- [${item.status}] ${item.message}`).join('\n')
    : '- `No health signal is present.`'}
`;
}

function buildLifecycleCenterPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const doctor = buildDoctorReport(cwd, rootDir);
  const health = buildHealthReport(cwd, rootDir, Boolean(options.strict) ? { strictMode: true } : {});
  const doctorRepair = buildRepairPlan(cwd, rootDir, { kind: 'doctor' });
  const healthRepair = buildRepairPlan(cwd, rootDir, { kind: 'health', healthReport: health });
  const versionMarker = readInstalledVersionMarker(cwd);
  const manifest = readProductManifest(cwd);
  const repoConfigSummary = summarizeRepoConfig(repoConfigPayload);
  const configDrift = buildConfigDrift(cwd, repoConfigPayload);
  const exportDrift = buildExportDrift(cwd, repoConfigSummary);
  const agentRuntime = buildRuntimeContract(cwd);
  const stateMachine = evaluateLifecycleState({
    step: manifest?.lifecycle?.current || 'discuss',
    hasGoal: true,
    hasValidation: repoConfigPayload.file.exists,
    hasPlan: Boolean(manifest?.installedVersion || repoConfigPayload.file.exists),
    hasExecutionEvidence: health.runtimeSyncCount > 0 || doctor.warnCount > 0 || doctor.failCount > 0,
    hasCodeChanges: exportDrift.present || configDrift.present,
    hasCheckpoint: Boolean(versionMarker.exists),
    hasVerification: doctor.failCount === 0 && health.failCount === 0,
    hasBlockingFailures: doctor.failCount > 0 || health.failCount > 0,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'lifecycle',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    repoConfig: repoConfigSummary,
    version: {
      installed: versionMarker.installedVersion || manifest?.installedVersion || null,
      previous: versionMarker.previousVersion || null,
      expected: productVersion(),
      refreshedAt: versionMarker.refreshedAt || null,
    },
    installation: {
      ready: doctor.failCount === 0 && repoConfigPayload.file.exists,
      scriptProfile: manifest?.scriptProfile || 'unknown',
      runtimeSurfaceProfile: manifest?.runtimeSurfaceProfile || 'unknown',
      manifestPresent: Boolean(manifest),
      versionMarkerPresent: Boolean(versionMarker.exists),
      repoConfigPresent: Boolean(repoConfigPayload.file.exists),
    },
    upgrade: {
      drift: Boolean(
        (versionMarker.installedVersion && versionMarker.installedVersion !== productVersion())
        || (manifest?.installedVersion && manifest.installedVersion !== productVersion())
      ),
      command: 'rai update',
    },
    runtimeDrift: {
      present: doctor.failCount > 0 || health.runtimeSyncCount > 0,
      doctorRisk: doctor.risk,
      healthRisk: health.risk,
      runtimeSyncCount: health.runtimeSyncCount,
    },
    drift: {
      config: configDrift,
      exports: exportDrift,
    },
    rollback: {
      hint: versionMarker.previousVersion ? `Reinstall or restore version ${versionMarker.previousVersion}` : 'Use git revert or the last known good runtime snapshot',
      previousVersion: versionMarker.previousVersion || null,
    },
    doctor: {
      failCount: doctor.failCount,
      warnCount: doctor.warnCount,
      risk: doctor.risk,
      topChecks: doctor.checks.slice(0, 8),
    },
    health: {
      failCount: health.failCount,
      warnCount: health.warnCount,
      runtimeSyncCount: health.runtimeSyncCount,
      risk: health.risk,
      window: health.window,
      topChecks: health.checks.slice(0, 8),
    },
    selfHealing: null,
    agentRuntime,
    stateMachine,
    artifacts: null,
  };

  payload.selfHealing = buildSelfHealing(doctorRepair, healthRepair, configDrift, exportDrift, payload.upgrade, versionMarker);
  payload.verdict = lifecycleVerdict(payload);
  payload.artifacts = writePlaneArtifacts(cwd, 'lifecycle-center', payload, renderLifecycleMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
lifecycle_center

Usage:
  node scripts/workflow/lifecycle_center.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --strict            Use strict health checks
  --json              Print machine-readable output
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
  const payload = buildLifecycleCenterPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# LIFECYCLE CENTER\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Installed version: \`${payload.version.installed || 'unknown'}\``);
  console.log(`- Doctor fail/warn: \`${payload.doctor.failCount}\` / \`${payload.doctor.warnCount}\``);
  console.log(`- Health fail/warn: \`${payload.health.failCount}\` / \`${payload.health.warnCount}\``);
  console.log(`- Config drift: \`${payload.drift.config.present ? 'yes' : 'no'}\``);
  console.log(`- Export drift: \`${payload.drift.exports.present ? 'yes' : 'no'}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
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
  buildLifecycleCenterPayload,
};
