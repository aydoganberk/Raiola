const path = require('node:path');
const childProcess = require('node:child_process');

const ACTIONS = {
  plan: { script: 'delegation_plan.js', args: [] },
  start: { script: 'delegation_plan.js', args: ['--start'] },
  status: { script: 'delegation_plan.js', args: ['--status'] },
  resume: { script: 'delegation_plan.js', args: ['--resume-runtime'] },
  stop: { script: 'delegation_plan.js', args: ['--stop'] },
  advance: { script: 'delegation_plan.js', args: ['--advance'] },
  packet: { script: 'delegation_plan.js', args: [] },
  run: { script: 'team_runtime.js', args: ['run'] },
  dispatch: { script: 'team_runtime.js', args: ['dispatch'] },
  monitor: { script: 'team_runtime.js', args: ['monitor'] },
  collect: { script: 'team_runtime.js', args: ['collect'] },
  mailbox: { script: 'team_runtime.js', args: ['mailbox'] },
  timeline: { script: 'team_runtime.js', args: ['timeline'] },
  steer: { script: 'team_runtime.js', args: ['steer'] },
};

function printHelp() {
  console.log(`
team

Usage:
  node scripts/workflow/team.js [plan]
  node scripts/workflow/team.js start --activation-text "parallel yap" --write-scope src/foo,tests/foo
  node scripts/workflow/team.js run --adapter worktree --activation-text "parallel yap" --write-scope src/foo,tests/foo
  node scripts/workflow/team.js dispatch
  node scripts/workflow/team.js monitor
  node scripts/workflow/team.js collect
  node scripts/workflow/team.js mailbox
  node scripts/workflow/team.js timeline
  node scripts/workflow/team.js steer --note "Re-scope worker 2 to docs only"
  node scripts/workflow/team.js status
  node scripts/workflow/team.js resume
  node scripts/workflow/team.js stop --summary "Pause orchestration here"
  node scripts/workflow/team.js advance
  node scripts/workflow/team.js packet --task-packet wave1-worker-1

Notes:
  This command is a product-friendly wrapper over workflow:delegation-plan plus team_runtime.
  \`team plan\` keeps planning on paper; \`team run/dispatch/monitor/collect\` operate the adapter runtime.
  `);
}

function main() {
  const argv = process.argv.slice(2);
  const first = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'plan';
  const rest = first === 'plan' ? argv : argv.slice(1);

  if (first === '--help' || first === '-h' || first === 'help') {
    printHelp();
    return;
  }

  if (!(first in ACTIONS)) {
    console.error(`Unknown team action: ${first}`);
    console.error('Run `node scripts/workflow/team.js --help` to see supported actions.');
    process.exitCode = 1;
    return;
  }

  const action = ACTIONS[first];
  const targetScript = path.join(__dirname, action.script);
  const forwarded = [...action.args, ...rest];
  const result = childProcess.spawnSync('node', [targetScript, ...forwarded], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
  });

  process.exitCode = typeof result.status === 'number' ? result.status : 1;
}

main();
