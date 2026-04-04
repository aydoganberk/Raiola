const path = require('node:path');
const childProcess = require('node:child_process');

const ACTION_FLAGS = {
  plan: [],
  start: ['--start'],
  status: ['--status'],
  resume: ['--resume-runtime'],
  stop: ['--stop'],
  advance: ['--advance'],
  packet: [],
};

function printHelp() {
  console.log(`
team

Usage:
  node scripts/workflow/team.js [plan]
  node scripts/workflow/team.js start --activation-text "parallel yap" --write-scope src/foo,tests/foo
  node scripts/workflow/team.js status
  node scripts/workflow/team.js resume
  node scripts/workflow/team.js stop --summary "Pause orchestration here"
  node scripts/workflow/team.js advance
  node scripts/workflow/team.js packet --task-packet wave1-worker-1

Notes:
  This command is a product-friendly wrapper over workflow:delegation-plan.
  \`team plan\` keeps planning on paper; \`team start/status/resume/stop/advance\` operate the runtime.
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

  if (!(first in ACTION_FLAGS)) {
    console.error(`Unknown team action: ${first}`);
    console.error('Run `node scripts/workflow/team.js --help` to see supported actions.');
    process.exitCode = 1;
    return;
  }

  const delegationScript = path.join(__dirname, 'delegation_plan.js');
  const forwarded = [...ACTION_FLAGS[first], ...rest];
  const result = childProcess.spawnSync('node', [delegationScript, ...forwarded], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
  });

  process.exitCode = typeof result.status === 'number' ? result.status : 1;
}

main();
