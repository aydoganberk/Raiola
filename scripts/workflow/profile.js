const path = require('node:path');
const {
  loadPreferences,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');

function printHelp() {
  console.log(`
profile

Usage:
  node scripts/workflow/profile.js

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --json            Print machine-readable output
  `);
}

function buildProfilePayload(cwd, rootDir) {
  const preferences = loadPreferences(workflowPaths(rootDir, cwd));
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  return {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    workflowProfile: preferences.workflowProfile,
    repoWorkflowProfile: preferences.repoWorkflowProfileRaw,
    budgetProfile: preferences.budgetProfile,
    automationMode: preferences.automationMode,
    automationStatus: preferences.automationStatus,
    reasoningDefaults: {
      discussBudget: preferences.discussBudget,
      planBudget: preferences.planBudget,
      auditBudget: preferences.auditBudget,
    },
    routingHints: {
      discuss: 'deep',
      plan: 'balanced',
      execute: 'fast',
      audit: 'balanced',
    },
    repoConfig: summarizeRepoConfig(repoConfigPayload),
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
  const payload = buildProfilePayload(cwd, rootDir);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# PROFILE\n');
  console.log(`- Workflow profile: \`${payload.workflowProfile}\``);
  console.log(`- Repo default: \`${payload.repoWorkflowProfile}\``);
  console.log(`- Budget profile: \`${payload.budgetProfile}\``);
  console.log(`- Automation: \`${payload.automationMode}\` (\`${payload.automationStatus}\`)`);
  console.log(`- Repo config: profile=\`${payload.repoConfig.defaultProfile}\` trust=\`${payload.repoConfig.trustLevel}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProfilePayload,
};
