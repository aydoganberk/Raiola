const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { analyzeIntent } = require('./intent_engine');
const { writeRuntimeJson } = require('./runtime_helpers');
const { buildUiSpec } = require('./ui_spec');
const { buildUiDirection } = require('./design_intelligence');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildCommandPlan } = require('./command_plan');

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
  const payload = {
    generatedAt: new Date().toISOString(),
    goal,
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    currentStep: analysis.repoSignals.workflowStep,
    currentMilestone: analysis.repoSignals.workflowMilestone,
    lane: analysis.lane,
    capability: analysis.chosenCapability.id,
    fallbackCapability: analysis.fallbackCapability.id,
    secondaryCapability: analysis.secondaryCapability?.id || analysis.fallbackCapability.id,
    confidence: analysis.confidence,
    recommendedPreset: analysis.profile.preset,
    profile: analysis.profile,
    routeRationale: analysis.chosenCapability.reasons,
    ambiguityReasons: analysis.ambiguityReasons,
    ambiguityClass: analysis.ambiguityClass,
    languageMix: analysis.languageMix,
    personaSignals: analysis.personaSignals,
    rejectedAlternatives: analysis.rejectedAlternatives,
    packet,
    trust: {
      researchNeeded,
      verifyNeeded,
      secureNeeded,
    },
    verificationPlan: analysis.verificationPlan,
    suggestedCommands,
    routeEvaluation: analysis.evaluation,
    repoSignals: analysis.repoSignals,
    previewFirst: true,
    dryRunSafe: true,
  };
  payload.commandPlan = buildCommandPlan(payload);
  return payload;
}

function formatLanguageMix(languageMix) {
  if (Array.isArray(languageMix.matchedLanguages) && languageMix.matchedLanguages.length > 0) {
    return languageMix.matchedLanguages.join('+');
  }
  const labels = [];
  if (languageMix.turkishSignals) {
    labels.push('tr');
  }
  if (languageMix.englishSignals) {
    labels.push('en');
  }
  return labels.length > 0 ? labels.join('+') : 'neutral';
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
    const uiDirection = buildUiDirection(cwd, rootDir, { goal });
    const uiSpec = buildUiSpec(cwd, rootDir, { goal });
    payload.uiDirection = uiDirection.file;
    payload.uiSpec = uiSpec.file;
  }
  if (!args['dry-run'] && payload.repoSignals?.monorepo) {
    const monorepo = buildMonorepoIntelligence(cwd, rootDir, { writeFiles: true });
    payload.monorepo = {
      markdownFile: monorepo.markdownFile,
      jsonFile: monorepo.jsonFile,
      writeScopeCount: monorepo.writeScopes.length,
      agentWaves: monorepo.agentPlan,
    };
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
  console.log(`- Secondary capability: \`${payload.secondaryCapability}\``);
  console.log(`- Fallback capability: \`${payload.fallbackCapability}\``);
  console.log(`- Confidence: \`${payload.confidence}\``);
  console.log(`- Ambiguity class: \`${payload.ambiguityClass}\``);
  console.log(`- Preset: \`${payload.recommendedPreset}\``);
  console.log(`- Profile: \`${payload.profile.id}\``);
  console.log(`- Packet: \`${payload.packet}\``);
  if (payload.uiDirection) {
    console.log(`- UI direction: \`${payload.uiDirection}\``);
  }
  if (payload.uiSpec) {
    console.log(`- UI spec: \`${payload.uiSpec}\``);
  }
  if (payload.monorepo) {
    console.log(`- Monorepo intelligence: \`${payload.monorepo.markdownFile}\``);
  }
  console.log(`- Research needed: \`${payload.trust.researchNeeded ? 'yes' : 'no'}\``);
  console.log(`- Verify needed: \`${payload.trust.verifyNeeded ? 'yes' : 'no'}\``);
  console.log(`- Secure needed: \`${payload.trust.secureNeeded ? 'yes' : 'no'}\``);
  console.log(`- Language mix: \`${formatLanguageMix(payload.languageMix)}\``);
  console.log(`- Primary command: \`${payload.commandPlan.primaryCommand}\``);
  console.log(`- Execution mode: \`${payload.commandPlan.executionMode}\``);
  console.log('\n## Suggested Commands\n');
  for (const command of payload.suggestedCommands) {
    console.log(`- \`${command.replace('<goal>', payload.goal)}\``);
  }
  if (payload.commandPlan.secondaryCommands.length > 0) {
    console.log('\n## Command Plan\n');
    for (const command of payload.commandPlan.secondaryCommands) {
      console.log(`- \`${command}\``);
    }
  }
  if (payload.commandPlan.specialtyFlows && Object.keys(payload.commandPlan.specialtyFlows).length > 0) {
    console.log('\n## Specialized Flow\n');
    for (const entries of Object.values(payload.commandPlan.specialtyFlows)) {
      for (const entry of entries) {
        console.log(`- ${entry}`);
      }
    }
  }
  if (payload.commandPlan.codexAppFlow.length > 0) {
    console.log('\n## Codex App Notes\n');
    for (const entry of payload.commandPlan.codexAppFlow) {
      console.log(`- ${entry}`);
    }
  }
  if (payload.commandPlan.parallelFlow.length > 0) {
    console.log('\n## Parallel Execution\n');
    for (const entry of payload.commandPlan.parallelFlow) {
      console.log(`- ${entry}`);
    }
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
    if (payload.rejectedAlternatives.length > 0) {
      console.log('\n## Rejected Alternatives\n');
      for (const alternative of payload.rejectedAlternatives) {
        console.log(`- \`${alternative.id}\` score=\`${alternative.score}\``);
      }
    }
    if (payload.routeEvaluation?.rerouteRecommendation) {
      console.log('\n## Reroute\n');
      console.log(`- \`${payload.routeEvaluation.rerouteRecommendation.reason}\``);
      console.log(`- Command: \`${payload.routeEvaluation.rerouteRecommendation.command}\``);
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
