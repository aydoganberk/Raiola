const fs = require('node:fs');
const path = require('node:path');
const {
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { analyzeIntent, evaluateRoutePayload, readRouteHistory } = require('./intent_engine');

function printHelp() {
  console.log(`
model_route

Usage:
  node scripts/workflow/model_route.js
  node scripts/workflow/model_route.js --goal "review the diff"
  node scripts/workflow/model_route.js replay
  node scripts/workflow/model_route.js eval

Options:
  --root <path>               Workflow root. Defaults to active workstream root
  --goal <text>               Free-form goal used for routing
  --phase <name>              discuss|research|plan|execute|audit|frontend|team-readonly
  --why                       Print an explanation-rich route summary
  --json                      Print machine-readable output
  `);
}

function cachePath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'model-routing.json');
}

function inferPhase(step, explicitPhase) {
  const normalized = String(explicitPhase || '').trim().toLowerCase();
  if (normalized) {
    return normalized;
  }
  return String(step || 'plan').trim().toLowerCase();
}

function routeForPhase(phase) {
  if (['discuss', 'research'].includes(phase)) {
    return {
      preset: 'deep',
      rationale: 'Discovery quality matters more than latency in discuss/research.',
    };
  }
  if (['plan', 'audit'].includes(phase)) {
    return {
      preset: 'balanced',
      rationale: 'Plan/audit needs careful reasoning without always paying the deepest cost.',
    };
  }
  if (phase === 'frontend') {
    return {
      preset: 'balanced',
      rationale: 'Frontend review needs more context plus browser evidence.',
    };
  }
  if (phase === 'execute' || phase === 'team-readonly') {
    return {
      preset: 'fast',
      rationale: 'Execution hot paths benefit from lower-latency turns.',
    };
  }
  return {
    preset: 'balanced',
    rationale: 'Balanced is the default fallback when the phase is ambiguous.',
  };
}

function readCache(cwd) {
  if (!fs.existsSync(cachePath(cwd))) {
    return {
      generatedAt: null,
      history: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath(cwd), 'utf8'));
  } catch {
    return {
      generatedAt: null,
      history: [],
    };
  }
}

function writeCache(cwd, payload) {
  fs.mkdirSync(path.dirname(cachePath(cwd)), { recursive: true });
  fs.writeFileSync(cachePath(cwd), `${JSON.stringify(payload, null, 2)}\n`);
}

function buildGoalFromPhase(phase) {
  const mapping = {
    discuss: 'investigate the next safe slice',
    research: 'investigate the next safe slice',
    plan: 'plan the next milestone slice',
    audit: 'review the current work and identify blockers',
    execute: 'implement the next safe slice',
    frontend: 'review the frontend flow and evidence',
    'team-readonly': 'coordinate a parallel readonly sweep',
  };
  return mapping[phase] || 'plan the next safe slice';
}

function buildRoutePayload(cwd, rootDir, options = {}) {
  const paths = workflowPaths(rootDir, cwd);
  const preferences = loadPreferences(paths);
  const currentStep = require('./state_surface').buildBaseState(cwd, rootDir).workflow.step;
  const phase = inferPhase(currentStep, options.phase);
  const goal = String(options.goal || buildGoalFromPhase(phase)).trim();
  const intentAnalysis = analyzeIntent(cwd, rootDir, goal);
  const fallbackRoute = routeForPhase(phase);
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    phase,
    goal,
    recommendedPreset: intentAnalysis.profile.preset || fallbackRoute.preset,
    rationale: intentAnalysis.profile.reasons?.[0] || fallbackRoute.rationale,
    why: {
      chosenCapability: intentAnalysis.chosenCapability.id,
      fallbackCapability: intentAnalysis.fallbackCapability.id,
      secondaryCapability: intentAnalysis.secondaryCapability?.id || intentAnalysis.fallbackCapability.id,
      chosenReasons: intentAnalysis.chosenCapability.reasons,
      ambiguityReasons: intentAnalysis.ambiguityReasons,
      ambiguityClass: intentAnalysis.ambiguityClass,
      rejectedAlternatives: intentAnalysis.rejectedAlternatives,
      languageMix: intentAnalysis.languageMix,
      personas: intentAnalysis.personaSignals,
    },
    confidence: intentAnalysis.confidence,
    recommendedCapability: intentAnalysis.chosenCapability.id,
    verificationPlan: intentAnalysis.verificationPlan,
    suggestedCodexProfile: intentAnalysis.profile,
    routeEvaluation: intentAnalysis.evaluation,
    personaSignals: intentAnalysis.personaSignals,
    profile: {
      workflow: preferences.workflowProfile,
      budget: preferences.budgetProfile,
      automation: preferences.automationMode,
    },
    estimatedBudget: {
      discuss: preferences.discussBudget,
      plan: preferences.planBudget,
      audit: preferences.auditBudget,
      reserve: preferences.tokenReserve,
    },
  };

  const cache = readCache(cwd);
  cache.generatedAt = payload.generatedAt;
  cache.lastRecommendation = payload;
  cache.history = [
    {
      at: payload.generatedAt,
      phase: payload.phase,
      goal: payload.goal,
      preset: payload.recommendedPreset,
      capability: payload.recommendedCapability,
      confidence: payload.confidence,
    },
    ...(cache.history || []),
  ].slice(0, 25);
  writeCache(cwd, cache);

  return {
    ...payload,
    cachePath: path.relative(cwd, cachePath(cwd)).replace(/\\/g, '/'),
  };
}

function buildReplayPayload(cwd) {
  const history = readRouteHistory(cwd);
  return {
    generatedAt: new Date().toISOString(),
    entries: history.history || [],
  };
}

function buildEvalPayload(cwd, rootDir, args) {
  const route = buildRoutePayload(cwd, rootDir, {
    goal: args.goal,
    phase: args.phase,
  });
  return {
    generatedAt: new Date().toISOString(),
    goal: route.goal,
    capability: route.recommendedCapability,
    preset: route.recommendedPreset,
    confidence: route.confidence,
    evaluation: evaluateRoutePayload({
      confidence: route.confidence,
      risk: { level: route.suggestedCodexProfile.riskBudget === 'high' ? 'high' : 'medium' },
      repoSignals: {
        frontendActive: route.suggestedCodexProfile.mode === 'frontend',
      },
      verificationPlan: route.verificationPlan,
    }),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] && !String(args._[0]).startsWith('--')
    ? String(args._[0]).trim()
    : 'route';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = action === 'replay'
    ? buildReplayPayload(cwd)
    : action === 'eval'
      ? buildEvalPayload(cwd, rootDir, args)
      : buildRoutePayload(cwd, rootDir, {
        phase: args.phase,
        goal: args.goal || args._.slice(action === 'route' ? 1 : 0).join(' ').trim(),
      });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (action === 'replay') {
    console.log('# ROUTE REPLAY\n');
    for (const entry of payload.entries.slice(0, 10)) {
      console.log(`- \`${entry.goal || entry.normalizedGoal || entry.chosenCapability?.id || 'unknown'}\` -> capability=\`${entry.chosenCapability?.id || entry.capability}\` confidence=\`${entry.confidence}\``);
    }
    return;
  }

  if (action === 'eval') {
    console.log('# ROUTE EVAL\n');
    console.log(`- Goal: \`${payload.goal}\``);
    console.log(`- Capability: \`${payload.capability}\``);
    console.log(`- Verdict: \`${payload.evaluation.verdict}\``);
    if (payload.evaluation.warnings.length > 0) {
      console.log('\n## Warnings\n');
      for (const warning of payload.evaluation.warnings) {
        console.log(`- \`${warning}\``);
      }
    }
    if (payload.evaluation.rerouteRecommendation) {
      console.log('\n## Reroute\n');
      console.log(`- \`${payload.evaluation.rerouteRecommendation.reason}\``);
      console.log(`- Command: \`${payload.evaluation.rerouteRecommendation.command}\``);
    }
    return;
  }

  console.log('# ROUTE\n');
  console.log(`- Phase: \`${payload.phase}\``);
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Recommended preset: \`${payload.recommendedPreset}\``);
  console.log(`- Capability: \`${payload.recommendedCapability}\``);
  console.log(`- Confidence: \`${payload.confidence}\``);
  console.log(`- Rationale: \`${payload.rationale}\``);
  console.log(`- Cache: \`${payload.cachePath}\``);
  if (args.why) {
    console.log('\n## Why\n');
    for (const reason of payload.why.chosenReasons) {
      console.log(`- \`${reason}\``);
    }
    if (payload.why.ambiguityReasons.length > 0) {
      console.log('\n## Ambiguity\n');
      console.log(`- class=\`${payload.why.ambiguityClass}\``);
      for (const reason of payload.why.ambiguityReasons) {
        console.log(`- \`${reason}\``);
      }
    }
    if (payload.why.rejectedAlternatives.length > 0) {
      console.log('\n## Rejected Alternatives\n');
      for (const alternative of payload.why.rejectedAlternatives) {
        console.log(`- \`${alternative.id}\` score=\`${alternative.score}\``);
      }
    }
    console.log('\n## Language Mix\n');
    console.log(`- \`tr=${payload.why.languageMix.turkishSignals ? 'yes' : 'no'} en=${payload.why.languageMix.englishSignals ? 'yes' : 'no'}\``);
    if (payload.routeEvaluation?.rerouteRecommendation) {
      console.log('\n## Reroute\n');
      console.log(`- \`${payload.routeEvaluation.rerouteRecommendation.reason}\``);
      console.log(`- Command: \`${payload.routeEvaluation.rerouteRecommendation.command}\``);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRoutePayload,
  routeForPhase,
};
