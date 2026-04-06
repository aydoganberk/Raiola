const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { analyzeIntent } = require('./intent_engine');
const { writeRuntimeJson } = require('./runtime_helpers');
const { buildUiSpec } = require('./ui_spec');

function printHelp() {
  console.log(`
do

Usage:
  node scripts/workflow/do.js "fix the flaky audit"

Options:
  --goal <text>       Goal text. Falls back to the free-form arguments
  --root <path>       Workflow root. Defaults to active workstream root
  --explain           Print scoring, confidence, and rejected alternatives
  --dry-run           Skip follow-up suggestions that would mutate workflow docs
  --json              Print machine-readable output
  `);
}

function buildDoPayload(cwd, rootDir, goal) {
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const secureNeeded = analysis.risk.level !== 'low';
  const verifyNeeded = analysis.intent.verify
    || ['execute', 'frontend', 'review', 'verify', 'ship', 'incident'].includes(analysis.chosenCapability.domain);
  const researchNeeded = analysis.intent.research || analysis.chosenCapability.domain === 'research';
  const packet = analysis.chosenCapability.domain === 'plan' || ['full', 'team', 'review', 'frontend'].includes(analysis.lane)
    ? 'recommended'
    : researchNeeded
      ? 'suggested'
      : 'optional';
  const suggestedCommands = analysis.verificationPlan.length > 0
    ? [...analysis.verificationPlan]
    : ['cwf next'];
  if (packet !== 'optional' && !suggestedCommands.includes('cwf packet compile')) {
    suggestedCommands.unshift('cwf packet compile');
  }
  return {
    generatedAt: new Date().toISOString(),
    goal,
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    currentStep: analysis.repoSignals.workflowStep,
    currentMilestone: analysis.repoSignals.workflowMilestone,
    lane: analysis.lane,
    capability: analysis.chosenCapability.id,
    fallbackCapability: analysis.fallbackCapability.id,
    confidence: analysis.confidence,
    recommendedPreset: analysis.profile.preset,
    profile: analysis.profile,
    routeRationale: analysis.chosenCapability.reasons,
    ambiguityReasons: analysis.ambiguityReasons,
    packet,
    trust: {
      researchNeeded,
      verifyNeeded,
      secureNeeded,
    },
    verificationPlan: analysis.verificationPlan,
    suggestedCommands,
    routeEvaluation: analysis.evaluation,
    previewFirst: true,
    dryRunSafe: true,
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
  const goal = String(args.goal || args._.join(' ')).trim();
  if (!goal) {
    throw new Error('Provide a goal via --goal or free-form text.');
  }
  const payload = buildDoPayload(cwd, rootDir, goal);
  if (!args['dry-run'] && payload.lane === 'frontend') {
    const uiSpec = buildUiSpec(cwd, rootDir);
    payload.uiSpec = uiSpec.file;
  }
  writeRuntimeJson(cwd, 'do-latest.json', payload);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DO\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Lane: \`${payload.lane}\``);
  console.log(`- Capability: \`${payload.capability}\``);
  console.log(`- Fallback capability: \`${payload.fallbackCapability}\``);
  console.log(`- Confidence: \`${payload.confidence}\``);
  console.log(`- Preset: \`${payload.recommendedPreset}\``);
  console.log(`- Profile: \`${payload.profile.id}\``);
  console.log(`- Packet: \`${payload.packet}\``);
  if (payload.uiSpec) {
    console.log(`- UI spec: \`${payload.uiSpec}\``);
  }
  console.log(`- Research needed: \`${payload.trust.researchNeeded ? 'yes' : 'no'}\``);
  console.log(`- Verify needed: \`${payload.trust.verifyNeeded ? 'yes' : 'no'}\``);
  console.log(`- Secure needed: \`${payload.trust.secureNeeded ? 'yes' : 'no'}\``);
  console.log('\n## Suggested Commands\n');
  for (const command of payload.suggestedCommands) {
    console.log(`- \`${command.replace('<goal>', payload.goal)}\``);
  }
  if (args.explain) {
    console.log('\n## Route Why\n');
    for (const reason of payload.routeRationale) {
      console.log(`- \`${reason}\``);
    }
    if (payload.ambiguityReasons.length > 0) {
      console.log('\n## Ambiguity\n');
      for (const reason of payload.ambiguityReasons) {
        console.log(`- \`${reason}\``);
      }
    }
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
  buildDoPayload,
};
