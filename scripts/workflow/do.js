const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { analyzeIntent } = require('./intent_engine');
const { writeRuntimeJson } = require('./runtime_helpers');
const { contractPayload } = require('./contract_versions');
const { buildUiRecipeScaffold } = require('./ui_recipe');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { buildUiSpec } = require('./ui_spec');
const { buildUiDirection } = require('./design_intelligence');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildCommandPlan } = require('./command_plan');
const { buildFrontendProfile } = require('./map_frontend');
const { findWorkflowBundle } = require('./workflow_bundle_catalog');
const { buildStartEntryCommand, buildStartRecommendation } = require('./workflow_start_intelligence');
const { buildFrontendStartSummary, classifyFrontendIntent } = require('./workflow_frontend_start');
const { logRoutingDecision, suggestTelemetryBias } = require('./routing_telemetry');

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

function wantsFrontendGoal(goal) {
  return /\b(frontend|ui|ux|design|surface|screen|dashboard|page|layout|component|form|table|modal|drawer|settings|onboarding|landing|hero|mobile|responsive|a11y|accessibility)\b/i.test(String(goal || ''));
}

function buildDoPayload(cwd, rootDir, goal) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const telemetryBias = suggestTelemetryBias(cwd, { phase: analysis.repoSignals.workflowStep || 'plan', goal });
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
    : ['rai next'];
  if (packet !== 'optional' && !suggestedCommands.includes('rai packet compile')) {
    suggestedCommands.unshift('rai packet compile');
  }
  const payload = {
    ...contractPayload('do'),
    generatedAt: new Date().toISOString(),
    goal,
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    currentStep: analysis.repoSignals.workflowStep,
    currentMilestone: analysis.repoSignals.workflowMilestone,
    lane: analysis.lane,
    capability: telemetryBias?.recommendedCapability && analysis.confidence < 0.72 ? telemetryBias.recommendedCapability : analysis.chosenCapability.id,
    fallbackCapability: analysis.fallbackCapability.id,
    secondaryCapability: analysis.secondaryCapability?.id || analysis.fallbackCapability.id,
    confidence: analysis.confidence,
    recommendedPreset: telemetryBias?.recommendedPreset && analysis.confidence < 0.82 ? telemetryBias.recommendedPreset : analysis.profile.preset,
    telemetryBias,
    profile: { ...analysis.profile, preset: telemetryBias?.recommendedPreset && analysis.confidence < 0.82 ? telemetryBias.recommendedPreset : analysis.profile.preset },
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
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    previewFirst: true,
    dryRunSafe: true,
  };
  payload.commandPlan = buildCommandPlan(payload);

  const shouldProbeFrontend = payload.lane === 'frontend' || payload.repoSignals.frontendActive || wantsFrontendGoal(goal);
  const frontendProfile = shouldProbeFrontend
    ? buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' })
    : null;
  const frontendIntent = classifyFrontendIntent(goal, frontendProfile);
  payload.frontendStart = buildFrontendStartSummary(frontendProfile, frontendIntent);

  const startBundleId = frontendIntent.frontend
    ? frontendIntent.primaryBundleId
    : payload.commandPlan.bundleId;
  const startBundle = findWorkflowBundle(startBundleId) || findWorkflowBundle(payload.commandPlan.bundleId);
  if (startBundle) {
    const startRecommendation = buildStartRecommendation(startBundle, {
      goal,
      route: {
        lane: payload.lane,
        capability: payload.capability,
        confidence: payload.confidence,
        packet: payload.packet,
        commandPlan: payload.commandPlan,
        repoSignals: payload.repoSignals,
      },
      packageGraph: {
        repoShape: payload.repoSignals.repoShape,
        packageCount: payload.repoSignals.packageCount,
      },
      frontendProfile,
    });
    payload.commandPlan.bundleHint = {
      id: startBundle.id,
      label: startBundle.label,
      reason: frontendIntent.frontend ? frontendIntent.reason : 'route_command_plan',
    };
    payload.commandPlan.startBundleId = startBundle.id;
    payload.commandPlan.startBundleLabel = startBundle.label;
    payload.commandPlan.startProfile = {
      id: startRecommendation.profile.id,
      label: startRecommendation.profile.label,
      reason: startRecommendation.profile.reason,
    };
    payload.commandPlan.startAddOns = startRecommendation.recommendedAddOns;
    payload.commandPlan.recommendedAddOns = startRecommendation.recommendedAddOns;
    payload.commandPlan.candidateBundles = startRecommendation.candidates.slice(0, 5);
    payload.commandPlan.recommendedStartCommand = buildStartEntryCommand(startBundle.id, goal);
    payload.commandPlan.recommendedExpandedStartCommand = startRecommendation.starterCommand;
  }
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
  if (!args['dry-run'] && (payload.lane === 'frontend' || payload.frontendStart)) {
    const uiDirection = buildUiDirection(cwd, rootDir, { goal });
    const uiSpec = buildUiSpec(cwd, rootDir, { goal });
    const uiRecipe = buildUiRecipeScaffold(cwd, rootDir, { goal });
    payload.uiDirection = uiDirection.file;
    payload.uiSpec = uiSpec.file;
    payload.uiRecipe = uiRecipe.file;
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
  logRoutingDecision(cwd, {
    source: 'do',
    phase: payload.currentStep || 'plan',
    goal: payload.goal,
    recommendedCapability: payload.capability,
    recommendedPreset: payload.recommendedPreset,
    confidence: payload.confidence,
    repoShape: payload.repoSignals.repoShape,
    monorepo: payload.repoSignals.monorepo,
    frontendActive: payload.repoSignals.frontendActive,
  });

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
  if (payload.uiRecipe) {
    console.log(`- UI recipe: \`${payload.uiRecipe}\``);
  }
  if (payload.monorepo) {
    console.log(`- Monorepo intelligence: \`${payload.monorepo.markdownFile}\``);
  }
  console.log(`- Research needed: \`${payload.trust.researchNeeded ? 'yes' : 'no'}\``);
  console.log(`- Verify needed: \`${payload.trust.verifyNeeded ? 'yes' : 'no'}\``);
  console.log(`- Secure needed: \`${payload.trust.secureNeeded ? 'yes' : 'no'}\``);
  console.log(`- Language mix: \`${formatLanguageMix(payload.languageMix)}\``);
  console.log(`- Repo profile: \`${payload.repoConfig.defaultProfile}\` / trust=\`${payload.repoConfig.trustLevel}\``);
  console.log(`- Bundle: \`${payload.commandPlan.bundleLabel || payload.commandPlan.bundleId}\``);
  if (payload.telemetryBias) {
    console.log(`- Telemetry bias: capability=\`${payload.telemetryBias.recommendedCapability || 'n/a'}\` preset=\`${payload.telemetryBias.recommendedPreset || 'n/a'}\` examples=\`${payload.telemetryBias.totalExamples}\``);
  }
  if (payload.commandPlan.recommendedStartCommand) {
    console.log(`- Start bundle: \`${payload.commandPlan.recommendedStartCommand}\``);
  }
  if (payload.commandPlan.startBundleLabel) {
    console.log(`- Start lane: \`${payload.commandPlan.startBundleLabel}\` (${payload.commandPlan.bundleHint?.reason || 'route-derived'})`);
  }
  if (payload.commandPlan.startProfile) {
    console.log(`- Start profile: \`${payload.commandPlan.startProfile.label}\` (${payload.commandPlan.startProfile.reason})`);
  }
  if (payload.frontendStart) {
    console.log(`- Frontend lane: \`${payload.frontendStart.workflowIntent?.lane || 'n/a'}\``);
    console.log(`- Frontend pack: \`${payload.frontendStart.commandPack}\``);
    console.log(`- Frontend surface: \`${payload.frontendStart.productSurface}\``);
  }
  if (Array.isArray(payload.commandPlan.startAddOns) && payload.commandPlan.startAddOns.length > 0) {
    console.log(`- Recommended start add-ons: \`${payload.commandPlan.startAddOns.map((entry) => entry.id).join(', ')}\``);
  }
  if (payload.commandPlan.recommendedExpandedStartCommand) {
    console.log(`- Expanded starter: \`${payload.commandPlan.recommendedExpandedStartCommand}\``);
  }
  console.log(`- Primary command: \`${payload.commandPlan.primaryCommand}\``);
  if (payload.commandPlan.resolvedPrimaryCommand && payload.commandPlan.resolvedPrimaryCommand !== payload.commandPlan.primaryCommand) {
    console.log(`- Resolved command: \`${payload.commandPlan.resolvedPrimaryCommand}\``);
  }
  console.log(`- Execution mode: \`${payload.commandPlan.executionMode}\``);
  console.log('\n## Suggested Commands\n');
  for (const command of payload.suggestedCommands) {
    console.log(`- \`${command.replace('<goal>', payload.goal)}\``);
  }
  if (Array.isArray(payload.commandPlan.commandFamilies) && payload.commandPlan.commandFamilies.length > 0) {
    console.log('\n## Command Families\n');
    for (const family of payload.commandPlan.commandFamilies) {
      console.log(`- \`${family.label}\` -> ${family.commands.join(', ')}`);
    }
  }
  if (Array.isArray(payload.commandPlan.phases) && payload.commandPlan.phases.length > 0) {
    console.log('\n## Structured Phases\n');
    for (const phase of payload.commandPlan.phases) {
      console.log(`### ${phase.label}`);
      console.log(`- ${phase.objective}`);
      for (const command of phase.commands) {
        console.log(`- \`${command}\``);
      }
      console.log('');
    }
  }
  if (payload.commandPlan.secondaryCommands.length > 0) {
    console.log('\n## Expanded Command List\n');
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
