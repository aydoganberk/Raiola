const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  parseMilestoneTable,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { readText: read } = require('./io/files');
const { buildNextPayload } = require('./next_step');

function printHelp() {
  console.log(`
onboarding

Usage:
  node scripts/workflow/onboarding.js [next]

Options:
  --target <path>     Target repository. Defaults to current working directory
  --goal <text>       Optional first milestone goal. Defaults to "Land the next safe slice"
  --json              Print machine-readable output
  `);
}

function workflowInstalled(targetRepo) {
  return fs.existsSync(path.join(targetRepo, 'docs', 'workflow'));
}

function nextMilestoneId(rootDir) {
  if (!workflowInstalled(rootDir)) {
    return 'M1';
  }

  const paths = workflowPaths(rootDir);
  const table = parseMilestoneTable(read(paths.milestones));
  const maxId = table.rows.reduce((highest, row) => {
    const match = String(row.milestone || '').match(/^M(\d+)$/i);
    if (!match) {
      return highest;
    }
    return Math.max(highest, Number(match[1]));
  }, 0);

  return `M${Math.max(maxId + 1, 1)}`;
}

function milestoneNameFromGoal(goal) {
  const normalized = String(goal || '').trim();
  if (!normalized || normalized.toLowerCase() === 'land the next safe slice') {
    return 'Initial slice';
  }

  const words = normalized
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  if (words.length === 0) {
    return 'Initial slice';
  }

  return words
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ');
}

function quote(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`;
}

function milestoneProposal(rootDir, goal) {
  const milestoneGoal = String(goal || 'Land the next safe slice').trim();
  const milestoneId = nextMilestoneId(rootDir);
  const milestoneName = milestoneNameFromGoal(milestoneGoal);
  return {
    id: milestoneId,
    name: milestoneName,
    goal: milestoneGoal,
    command: `rai milestone --id ${milestoneId} --name ${quote(milestoneName)} --goal ${quote(milestoneGoal)} --profile standard --automation manual`,
  };
}

function buildOnboardingPayload(targetRepo, options = {}) {
  const goal = String(options.goal || 'Land the next safe slice').trim();
  const topic = String(options.topic || 'next').trim().toLowerCase() || 'next';

  if (!workflowInstalled(targetRepo)) {
    const proposal = milestoneProposal(targetRepo, goal);
    return {
      topic,
      targetRepo,
      status: 'needs_setup',
      title: 'Install Raiola in this repo first',
      recommendation: 'Run setup, then reopen onboarding to start a milestone cleanly.',
      command: 'rai setup',
      followups: [
        'rai doctor --strict',
        'rai on next',
      ],
      milestoneProposal: proposal,
      note: 'No docs/workflow surface exists yet, so Raiola starts with setup before it can open a live milestone.',
    };
  }

  const rootDir = resolveWorkflowRoot(targetRepo, options.root);
  const nextPayload = buildNextPayload(targetRepo, rootDir);
  const proposal = milestoneProposal(rootDir, goal);

  if (nextPayload.milestone === 'NONE') {
    return {
      topic,
      targetRepo,
      rootDir,
      status: 'ready_for_milestone',
      title: 'Start a milestone from a clean Raiola entry point',
      recommendation: 'No active milestone is open, so the safest next move is to start one before routing work.',
      command: proposal.command,
      followups: [
        `rai do ${quote(proposal.goal)}`,
        'rai next',
      ],
      milestoneProposal: proposal,
      note: nextPayload.recommendation.note || 'No active milestone is open yet; this is the cleanest place to start.',
    };
  }

  return {
    topic,
    targetRepo,
    rootDir,
    status: 'active_milestone',
    title: 'Continue the active Raiola lane',
    recommendation: 'A milestone is already open, so onboarding hands off to the live next-step surface.',
    command: 'rai next',
    followups: [
      nextPayload.recommendation.command,
    ].filter(Boolean),
    activeMilestone: nextPayload.milestone,
    activeStep: nextPayload.step,
    note: nextPayload.recommendation.note,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const topic = args._[0] || 'next';
  const targetRepo = path.resolve(process.cwd(), String(args.target || '.'));
  const payload = buildOnboardingPayload(targetRepo, {
    topic,
    goal: args.goal,
    root: args.root,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# RAIOLA ON\n');
  console.log(`- Topic: \`${payload.topic}\``);
  console.log(`- Status: \`${payload.status}\``);
  console.log(`- Target: \`${payload.targetRepo}\``);
  if (payload.rootDir) {
    console.log(`- Root: \`${payload.rootDir}\``);
  }
  if (payload.activeMilestone) {
    console.log(`- Active milestone: \`${payload.activeMilestone}\``);
  }
  if (payload.activeStep) {
    console.log(`- Active step: \`${payload.activeStep}\``);
  }
  console.log(`- Recommendation: \`${payload.recommendation}\``);
  console.log(`- Command: \`${payload.command}\``);
  console.log(`- Note: \`${payload.note}\``);

  if (payload.milestoneProposal) {
    console.log('\n## Milestone Proposal\n');
    console.log(`- Id: \`${payload.milestoneProposal.id}\``);
    console.log(`- Name: \`${payload.milestoneProposal.name}\``);
    console.log(`- Goal: \`${payload.milestoneProposal.goal}\``);
  }

  if ((payload.followups || []).length > 0) {
    console.log('\n## Follow-ups\n');
    for (const command of payload.followups) {
      console.log(`- \`${command}\``);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildOnboardingPayload,
  main,
};
