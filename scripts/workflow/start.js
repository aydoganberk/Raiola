const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildStartPlan, listWorkflowBundles, writeStartPlanArtifacts } = require('./workflow_bundles');
const { findWorkflowBundle } = require('./workflow_bundle_catalog');
const { listStartAddOns, listStartProfiles } = require('./workflow_start_intelligence');
const { contractPayload } = require('./contract_versions');

function printHelp() {
  console.log(`
start

Usage:
  node scripts/workflow/start.js --goal "land the next slice"
  node scripts/workflow/start.js <bundle> --goal "review the repo"
  node scripts/workflow/start.js recommend --goal "ship the premium dashboard surface"
  node scripts/workflow/start.js list

Bundles:
  slice              Default implementation bundle for normal repos
  review             Diff/scoped review bundle
  repo               Full-repo audit bundle
  monorepo           Large-repo staged audit bundle
  correction         Review-correction control-plane bundle
  frontend           Frontend delivery bundle
  frontend-review    Frontend quality/review bundle
  frontend-refactor  Frontend surface-architecture/refactor bundle
  frontend-polish    Frontend consistency/polish bundle
  frontend-ship      Frontend browser-first ship-readiness bundle
  ship               Verification + closeout bundle

Profiles:
  speed            Leanest proving spine for fast slices
  balanced         Default packaged product lane
  deep             Wider bundle with complementary evidence/docs/closeout commands

Add-ons:
  trust            Secure scan + evidence + validation visibility
  docs             Packet compile + discuss brief
  handoff          PR brief + release notes + session report + checkpoint
  parallel         Review orchestration + team/delegation surfaces
  browser          Preview + responsive + browser verification helpers
  surface          Page blueprint + component inventory overlays
  design-system    Design DNA + debt/system alignment overlays
  state            UX-state ownership + responsive/state proof overlays
  ownership        Package ownership + hotspot responsibility overlays
  regression       Test impact + verify matrix overlays
  shard            Ranked shard + next-wave planning overlays
  repair           Patchability + bounded repair planning overlays
  recommended      Expands to the plan's recommended add-ons

Options:
  --goal <text>        Natural-language goal
  --profile <id>       speed|balanced|deep
  --with <ids>         Pipe or comma delimited add-ons, repeatable. Example: --with trust|docs
  --run                Execute safe auto-runnable steps in order
  --force-all          When used with --run, also execute optional/manual-tagged steps
  --continue-on-error  Keep running later steps even if one command fails
  --json               Print machine-readable output
  `);
}

function buildCatalogPayload() {
  return {
    bundles: listWorkflowBundles(),
    profiles: listStartProfiles(),
    addOns: listStartAddOns(),
  };
}

function printBundleList() {
  const catalog = buildCatalogPayload();
  console.log('# WORKFLOW BUNDLES\n');
  for (const bundle of catalog.bundles) {
    console.log(`- \`${bundle.id}\` (${bundle.shorthand}) -> ${bundle.summary}`);
    console.log(`  - profiles: \`${(bundle.supportedProfiles || []).join(', ')}\``);
    console.log(`  - add-ons: \`${(bundle.supportedAddOns || []).join(', ')}\``);
  }
  console.log('\n# START PROFILES\n');
  for (const profile of catalog.profiles) {
    console.log(`- \`${profile.id}\` -> ${profile.summary}`);
  }
  console.log('\n# START ADD-ONS\n');
  for (const addOn of catalog.addOns) {
    console.log(`- \`${addOn.id}\` -> ${addOn.summary}`);
  }
}

function toRelativeRuntimePath(filePath) {
  return String(filePath).replace(/^.*?\.workflow\//, '.workflow/').replace(/\\/g, '/');
}

function printRecommendation(plan) {
  console.log('# START RECOMMENDATION\n');
  console.log(`- Goal: \`${plan.goal}\``);
  console.log(`- Recommended bundle: \`${plan.bundle.label}\``);
  console.log(`- Profile: \`${plan.profile.label}\` (${plan.profile.reason})`);
  console.log(`- Suggested starter: \`${plan.recommendedStarterCommand}\``);
  console.log(`- Applied add-ons: \`${plan.addOns.length > 0 ? plan.addOns.map((entry) => entry.id).join(', ') : 'none'}\``);
  console.log(`- Recommended add-ons: \`${plan.recommendedAddOns.length > 0 ? plan.recommendedAddOns.map((entry) => entry.id).join(', ') : 'none'}\``);
  console.log(`- Repo shape: \`${plan.repoContext.repoShape}\``);
  if (plan.frontend) {
    console.log(`- Frontend lane: \`${plan.frontend.workflowIntent?.lane || 'n/a'}\``);
    console.log(`- Frontend pack: \`${plan.frontend.commandPack}\``);
    console.log(`- Frontend surface: \`${plan.frontend.productSurface}\``);
    console.log(`- Suggested frontend add-ons: \`${(plan.frontend.suggestedAddOns || []).join(', ') || 'none'}\``);
  }
  console.log('\n## Top Candidate Bundles\n');
  for (const candidate of plan.candidateBundles.slice(0, 5)) {
    console.log(`- \`${candidate.label}\` score=\`${candidate.score}\` -> \`${candidate.starterCommand}\`${candidate.reasons.length > 0 ? ` (${candidate.reasons.join(', ')})` : ''}`);
  }
  if (plan.operatorTips.length > 0) {
    console.log('\n## Operator Tips\n');
    for (const tip of plan.operatorTips) {
      console.log(`- ${tip}`);
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const firstToken = args._[0] ? String(args._[0]).trim() : '';
  if (firstToken === 'list' || args.list) {
    const catalog = buildCatalogPayload();
    if (args.json) {
      console.log(JSON.stringify(catalog, null, 2));
      return;
    }
    printBundleList();
    return;
  }

  const wantsRecommendation = ['recommend', 'suggest', 'probe'].includes(firstToken);
  const explicitBundle = wantsRecommendation ? null : findWorkflowBundle(firstToken);
  const remainingFreeText = wantsRecommendation
    ? args._.slice(1).join(' ')
    : explicitBundle
      ? args._.slice(1).join(' ')
      : args._.join(' ');
  const goal = String(args.goal || remainingFreeText || '').trim();
  if (!goal) {
    throw new Error('Provide a goal via --goal or free-form text.');
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const plan = buildStartPlan(cwd, rootDir, {
    goal,
    bundleId: explicitBundle?.id || (args.bundle ? String(args.bundle).trim() : ''),
    profileId: args.profile ? String(args.profile).trim() : '',
    addOns: args.with || args.addons,
    run: Boolean(args.run),
    forceAll: Boolean(args['force-all']),
    continueOnError: Boolean(args['continue-on-error']),
  });

  if (wantsRecommendation) {
    if (args.json) {
      console.log(JSON.stringify({ ...contractPayload('start'), ...plan }, null, 2));
      return;
    }
    printRecommendation(plan);
    return;
  }

  const artifacts = writeStartPlanArtifacts(cwd, plan);
  const payload = {
    ...contractPayload('start'),
    ...plan,
    artifacts: {
      json: toRelativeRuntimePath(artifacts.jsonPath),
      markdown: toRelativeRuntimePath(artifacts.markdownPath),
    },
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# START\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Bundle: \`${payload.bundle.label}\``);
  console.log(`- Starter command: \`${payload.entryCommand}\``);
  console.log(`- Recommended starter: \`${payload.recommendedStarterCommand}\``);
  console.log(`- Selection reason: \`${payload.selectionReason}\``);
  console.log(`- Route lane: \`${payload.route.lane}\``);
  console.log(`- Route capability: \`${payload.route.capability}\``);
  console.log(`- Repo shape: \`${payload.repoContext.repoShape}\``);
  console.log(`- Profile: \`${payload.profile.label}\` (${payload.profile.reason})`);
  console.log(`- Applied add-ons: \`${payload.addOns.length > 0 ? payload.addOns.map((entry) => entry.id).join(', ') : 'none'}\``);
  console.log(`- Recommended add-ons: \`${payload.recommendedAddOns.length > 0 ? payload.recommendedAddOns.map((entry) => entry.id).join(', ') : 'none'}\``);
  if (payload.frontend) {
    console.log(`- Frontend lane: \`${payload.frontend.workflowIntent?.lane || 'n/a'}\``);
    console.log(`- Frontend pack: \`${payload.frontend.commandPack}\``);
    console.log(`- Frontend surface: \`${payload.frontend.productSurface}\``);
    console.log(`- Suggested frontend add-ons: \`${(payload.frontend.suggestedAddOns || []).join(', ') || 'none'}\``);
  }
  if (payload.ignoredAddOns.length > 0) {
    console.log(`- Ignored add-ons: \`${payload.ignoredAddOns.map((entry) => `${entry.id}:${entry.reason}`).join(', ')}\``);
  }
  console.log(`- Start plan: \`${payload.artifacts.markdown}\``);
  console.log('\n## Command Families\n');
  for (const family of payload.commandFamilies) {
    console.log(`- \`${family.label}\` -> ${family.commands.join(', ')}`);
  }
  console.log('\n## Structured Phases\n');
  for (const phase of payload.phases) {
    console.log(`### ${phase.label}`);
    console.log(`- ${phase.objective}`);
    for (const command of phase.commands) {
      console.log(`- \`${command.cli}\`${command.reason ? ` -> ${command.reason}` : ''}`);
    }
    console.log('');
  }
  if (payload.operatorTips.length > 0) {
    console.log('## Operator Tips\n');
    for (const tip of payload.operatorTips) {
      console.log(`- ${tip}`);
    }
  }
  if (payload.candidateBundles.length > 0) {
    console.log('\n## Candidate Bundles\n');
    for (const candidate of payload.candidateBundles.slice(0, 5)) {
      console.log(`- \`${candidate.label}\` score=\`${candidate.score}\` -> \`${candidate.starterCommand}\`${candidate.reasons.length > 0 ? ` (${candidate.reasons.join(', ')})` : ''}`);
    }
  }
  if (payload.execution?.runs?.length) {
    console.log('\n## Execution\n');
    for (const run of payload.execution.runs) {
      console.log(`- \`${run.cli}\` -> \`${run.status}\``);
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
  main,
};
