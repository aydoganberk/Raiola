const {
  assertWorkflowFiles,
  computeWindowStatus,
  getFieldValue,
  loadPreferences,
  normalizeAutomationMode,
  normalizeAutomationStatus,
  parseArgs,
  read,
  replaceField,
  resolveWorkflowRoot,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
} = require('./common');
const { writeStateSurface } = require('./state_surface');

function printHelp() {
  console.log(`
automation

Usage:
  node scripts/workflow/automation.js --mode phase

Options:
  --root <path>           Workflow root. Defaults to active workstream root
  --mode <mode>           manual|phase|full
  --status <status>       idle|active|paused|handoff|complete
  --scope <scope>         auto|repo|milestone
  --json                  Print machine-readable output
  `);
}

function replaceAutomationFields(doc, mode, status) {
  let next = replaceField(doc, 'Automation mode', mode);
  next = replaceField(next, 'Automation status', status);
  return next;
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
  let handoffDoc = read(paths.handoff);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const scope = String(args.scope || (milestone === 'NONE' ? 'repo' : 'milestone')).trim().toLowerCase();

  if (!['auto', 'repo', 'milestone'].includes(scope)) {
    throw new Error('--scope must be one of: auto, repo, milestone');
  }

  const resolvedScope = scope === 'auto' ? (milestone === 'NONE' ? 'repo' : 'milestone') : scope;
  const currentPreferences = loadPreferences(paths);
  const rawMode = String(args.mode || '').trim();
  const rawStatus = String(args.status || '').trim();
  const mode = rawMode
    ? normalizeAutomationMode(rawMode, '')
    : (resolvedScope === 'repo' ? currentPreferences.repoAutomationMode : currentPreferences.automationMode);
  const status = rawStatus
    ? normalizeAutomationStatus(rawStatus, '')
    : (rawMode ? (mode === 'manual' ? 'idle' : 'active') : currentPreferences.automationStatus);

  if (rawMode && !mode) {
    throw new Error('--mode must be one of: manual, phase, full');
  }

  if (rawStatus && !status) {
    throw new Error('--status must be one of: idle, active, paused, handoff, complete');
  }

  if (resolvedScope === 'milestone' && milestone === 'NONE') {
    throw new Error('No active milestone is open, so milestone-scoped automation cannot be set');
  }

  if (resolvedScope === 'repo') {
    preferencesDoc = replaceField(preferencesDoc, 'Automation mode', mode);
    preferencesDoc = replaceField(preferencesDoc, 'Last updated', today());
    write(paths.preferences, preferencesDoc);

    if (milestone === 'NONE') {
      statusDoc = replaceAutomationFields(statusDoc, mode, status);
      contextDoc = replaceAutomationFields(contextDoc, mode, status);
      handoffDoc = replaceAutomationFields(handoffDoc, mode, status);
      write(paths.status, statusDoc);
      write(paths.context, contextDoc);
      write(paths.handoff, handoffDoc);
    }
  } else {
    statusDoc = replaceAutomationFields(statusDoc, mode, status);
    contextDoc = replaceAutomationFields(contextDoc, mode, status);
    handoffDoc = replaceAutomationFields(handoffDoc, mode, status);
    write(paths.status, statusDoc);
    write(paths.context, contextDoc);
    write(paths.handoff, handoffDoc);
  }

  const windowStatus = syncWindowDocument(paths, computeWindowStatus(paths));
  const effectivePreferences = loadPreferences(paths);
  const payload = {
    rootDir,
    scope: resolvedScope,
    milestone,
    automation: {
      mode: effectivePreferences.automationMode,
      status: effectivePreferences.automationStatus,
      windowPolicy: effectivePreferences.automationWindowPolicy,
      windowRecommendation: windowStatus.automationRecommendation,
    },
  };

  writeStateSurface(cwd, rootDir, { automation: payload.automation }, { updatedBy: 'automation' });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# AUTOMATION\n');
  console.log(`- Scope: \`${payload.scope}\``);
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Mode: \`${payload.automation.mode}\``);
  console.log(`- Status: \`${payload.automation.status}\``);
  console.log(`- Window policy: \`${payload.automation.windowPolicy}\``);
  console.log(`- Window recommendation: \`${payload.automation.windowRecommendation}\``);
}

main();
