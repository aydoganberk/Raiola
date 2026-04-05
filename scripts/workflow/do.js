const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildRoutePayload } = require('./model_route');
const { buildBaseState } = require('./state_surface');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
do

Usage:
  node scripts/workflow/do.js "fix the flaky audit"

Options:
  --goal <text>       Goal text. Falls back to the free-form arguments
  --root <path>       Workflow root. Defaults to active workstream root
  --json              Print machine-readable output
  `);
}

function classifyIntent(text) {
  const normalized = String(text || '').toLowerCase();
  const researchNeeded = /(why|investigate|compare|audit|review|analyse|analyze|araştır|incele)/i.test(normalized);
  const verifyNeeded = /(fix|ship|release|ui|browser|frontend|verify|test|deploy|kapat|tamamla)/i.test(normalized);
  const secureNeeded = /(secret|token|auth|credential|shell|config|migration|delete|rm |reset --hard|rollback)/i.test(normalized);
  const teamCandidate = /(parallel|subagent|delegate|multi|sweep|fleet|across|many files|çok dosya)/i.test(normalized);
  const lane = teamCandidate
    ? 'team'
    : researchNeeded
      ? 'full'
      : verifyNeeded
        ? 'quick'
        : 'full';
  return {
    lane,
    researchNeeded,
    verifyNeeded,
    secureNeeded,
  };
}

function packetRecommendation(baseState, intent) {
  if (intent.lane === 'team') {
    return 'recommended';
  }
  if (['plan', 'audit'].includes(baseState.workflow.step)) {
    return 'recommended';
  }
  return intent.researchNeeded ? 'suggested' : 'optional';
}

function buildDoPayload(cwd, rootDir, goal) {
  const route = buildRoutePayload(cwd, rootDir, {});
  const state = buildBaseState(cwd, rootDir);
  const intent = classifyIntent(goal);
  return {
    generatedAt: new Date().toISOString(),
    goal,
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    currentStep: state.workflow.step,
    currentMilestone: state.workflow.milestone,
    lane: intent.lane,
    recommendedPreset: route.recommendedPreset,
    routeRationale: route.rationale,
    packet: packetRecommendation(state, intent),
    trust: {
      researchNeeded: intent.researchNeeded,
      verifyNeeded: intent.verifyNeeded,
      secureNeeded: intent.secureNeeded,
    },
    suggestedCommands: [
      intent.lane === 'team'
        ? 'cwf team run --adapter hybrid'
        : intent.lane === 'quick'
          ? 'cwf quick start --goal "<goal>"'
          : 'cwf manager',
      packetRecommendation(state, intent) !== 'optional' ? 'cwf packet compile' : null,
      intent.secureNeeded ? 'cwf secure' : null,
      intent.verifyNeeded ? 'cwf verify-shell --cmd "npm test"' : null,
    ].filter(Boolean),
    previewFirst: true,
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
  writeRuntimeJson(cwd, 'do-latest.json', payload);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DO\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Lane: \`${payload.lane}\``);
  console.log(`- Preset: \`${payload.recommendedPreset}\``);
  console.log(`- Packet: \`${payload.packet}\``);
  console.log(`- Research needed: \`${payload.trust.researchNeeded ? 'yes' : 'no'}\``);
  console.log(`- Verify needed: \`${payload.trust.verifyNeeded ? 'yes' : 'no'}\``);
  console.log(`- Secure needed: \`${payload.trust.secureNeeded ? 'yes' : 'no'}\``);
  console.log('\n## Suggested Commands\n');
  for (const command of payload.suggestedCommands) {
    console.log(`- \`${command.replace('<goal>', payload.goal)}\``);
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
