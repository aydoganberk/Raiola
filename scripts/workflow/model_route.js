const fs = require('node:fs');
const path = require('node:path');
const {
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
model_route

Usage:
  node scripts/workflow/model_route.js

Options:
  --root <path>               Workflow root. Defaults to active workstream root
  --phase <name>              discuss|research|plan|execute|audit|frontend|team-readonly
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
  if (phase === 'execute' || phase === 'team-readonly') {
    return {
      preset: phase === 'execute' ? 'fast' : 'fast',
      rationale: 'Execution and read-only team support benefit from lower-latency turns.',
    };
  }
  if (phase === 'frontend') {
    return {
      preset: 'balanced',
      rationale: 'Frontend visual review usually needs richer inspection than pure execute.',
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

function buildRoutePayload(cwd, rootDir, options = {}) {
  const paths = workflowPaths(rootDir, cwd);
  const preferences = loadPreferences(paths);
  const currentStep = require('./state_surface').buildBaseState(cwd, rootDir).workflow.step;
  const phase = options.phase
    ? inferPhase(currentStep, options.phase)
    : inferPhase(currentStep);
  const route = routeForPhase(phase);
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    phase,
    recommendedPreset: route.preset,
    rationale: route.rationale,
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
      preset: payload.recommendedPreset,
    },
    ...(cache.history || []),
  ].slice(0, 25);
  writeCache(cwd, cache);

  return {
    ...payload,
    cachePath: path.relative(cwd, cachePath(cwd)).replace(/\\/g, '/'),
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
  const payload = buildRoutePayload(cwd, rootDir, {
    phase: args.phase,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# ROUTE\n');
  console.log(`- Phase: \`${payload.phase}\``);
  console.log(`- Recommended preset: \`${payload.recommendedPreset}\``);
  console.log(`- Rationale: \`${payload.rationale}\``);
  console.log(`- Cache: \`${payload.cachePath}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRoutePayload,
  routeForPhase,
};
