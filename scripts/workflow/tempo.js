const {
  assertWorkflowFiles,
  computeWindowStatus,
  getFieldValue,
  loadPreferences,
  normalizeWorkflowProfile,
  parseArgs,
  replaceField,
  resolveWorkflowControlIntent,
  resolveWorkflowRoot,
  syncWindowDocument,
  today,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  writeText: write,
} = require('./io/files');
const { writeStateSurface } = require('./state_surface');

function printHelp() {
  console.log(`
tempo

Usage:
  node scripts/workflow/tempo.js --mode lite

Options:
  --root <path>           Workflow root. Defaults to active workstream root
  --mode <mode>           lite|standard|full
  --utterance <text>      Natural-language tempo instruction, e.g. "detaya girmeyelim hizli gec"
  --scope <scope>         auto|repo|milestone
  --json                  Print machine-readable output
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

  let preferencesDoc = read(paths.preferences);
  let statusDoc = read(paths.status);
  let contextDoc = read(paths.context);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const scope = String(args.scope || (milestone === 'NONE' ? 'repo' : 'milestone')).trim().toLowerCase();
  const rawUtterance = String(args.utterance || '').trim();
  const currentPreferences = loadPreferences(paths);
  const rawMode = String(args.mode || '').trim();

  if (!['auto', 'repo', 'milestone'].includes(scope)) {
    throw new Error('--scope must be one of: auto, repo, milestone');
  }

  const resolvedScope = scope === 'auto' ? (milestone === 'NONE' ? 'repo' : 'milestone') : scope;
  if (rawMode && rawUtterance) {
    throw new Error('Use either --mode or --utterance, not both');
  }

  const controlIntent = rawUtterance ? resolveWorkflowControlIntent(rawUtterance) : null;
  if (controlIntent && controlIntent.matched && controlIntent.family !== 'tempo_control') {
    throw new Error(`--utterance resolved to ${controlIntent.family}; tempo requires a tempo_control intent`);
  }
  if (controlIntent && !controlIntent.matched) {
    throw new Error('--utterance did not resolve to a tempo control intent');
  }

  const mode = rawMode
    ? normalizeWorkflowProfile(rawMode, '')
    : controlIntent?.mode
      ? normalizeWorkflowProfile(controlIntent.mode, '')
      : currentPreferences.workflowProfile;

  if ((rawMode || controlIntent) && !mode) {
    throw new Error('--mode must be one of: lite, standard, full');
  }

  if (resolvedScope === 'milestone' && milestone === 'NONE') {
    throw new Error('No active milestone is open, so milestone-scoped tempo cannot be set');
  }

  if (resolvedScope === 'repo') {
    preferencesDoc = replaceField(preferencesDoc, 'Workflow profile', mode);
    preferencesDoc = replaceField(preferencesDoc, 'Last updated', today());
    write(paths.preferences, preferencesDoc);

    if (milestone === 'NONE') {
      statusDoc = replaceField(statusDoc, 'Effective workflow profile', mode);
      statusDoc = replaceField(statusDoc, 'Last updated', today());
      write(paths.status, statusDoc);
    }
  } else {
    contextDoc = replaceField(contextDoc, 'Milestone profile override', mode);
    contextDoc = replaceField(contextDoc, 'Last updated', today());
    statusDoc = replaceField(statusDoc, 'Effective workflow profile', mode);
    statusDoc = replaceField(statusDoc, 'Last updated', today());
    write(paths.context, contextDoc);
    write(paths.status, statusDoc);
  }

  const windowStatus = syncWindowDocument(paths, computeWindowStatus(paths));
  const effectivePreferences = loadPreferences(paths);
  const payload = {
    rootDir,
    scope: resolvedScope,
    milestone,
    workflowProfile: effectivePreferences.workflowProfile,
    repoWorkflowProfile: effectivePreferences.repoWorkflowProfile,
    milestoneProfileOverride: effectivePreferences.milestoneProfileOverride,
    packetLoadingMode: effectivePreferences.packetLoadingMode,
    tokenEfficiencyMeasures: effectivePreferences.tokenEfficiencyMeasures,
    openRequirementCount: windowStatus.packet.openRequirementIds.length,
    control: controlIntent
      ? {
        utterance: rawUtterance,
        family: controlIntent.family,
        matchId: controlIntent.matchId,
        resolution: controlIntent.resolution,
        mode: controlIntent.mode,
      }
      : null,
  };

  writeStateSurface(cwd, rootDir, {
    tempo: {
      workflowProfile: payload.workflowProfile,
      scope: payload.scope,
      milestoneProfileOverride: payload.milestoneProfileOverride,
      packetLoadingMode: payload.packetLoadingMode,
      tokenEfficiencyMeasures: payload.tokenEfficiencyMeasures,
    },
  }, { updatedBy: 'tempo' });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# TEMPO\n');
  console.log(`- Scope: \`${payload.scope}\``);
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Effective workflow profile: \`${payload.workflowProfile}\``);
  console.log(`- Repo workflow profile: \`${payload.repoWorkflowProfile}\``);
  console.log(`- Milestone profile override: \`${payload.milestoneProfileOverride}\``);
  console.log(`- Packet loading mode: \`${payload.packetLoadingMode}\``);
  console.log(`- Token efficiency measures: \`${payload.tokenEfficiencyMeasures}\``);
  console.log(`- Open requirement count: \`${payload.openRequirementCount}\``);
  if (payload.control) {
    console.log(`- Control intent: \`${payload.control.family}\``);
    console.log(`- Control mode: \`${payload.control.mode}\``);
  }
}

main();
