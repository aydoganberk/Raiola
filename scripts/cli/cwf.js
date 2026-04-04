#!/usr/bin/env node

const path = require('node:path');
const childProcess = require('node:child_process');

const CLI_COMMANDS = {
  setup: { script: 'setup.js', description: 'Install or refresh the workflow product in the current repo.' },
  init: { script: 'init.js', description: 'Bootstrap workflow control-plane files in the current repo.' },
  milestone: { script: 'new_milestone.js', description: 'Open a new full-workflow milestone.' },
  doctor: { script: 'doctor.js', description: 'Check install health and workflow contract integrity.' },
  hud: { script: 'hud.js', description: 'Show the daily operator HUD.' },
  next: { script: 'next_step.js', description: 'Recommend the next safe workflow action.' },
  checkpoint: { script: 'checkpoint.js', description: 'Write a continuity checkpoint.' },
  quick: { script: 'quick.js', description: 'Run or inspect the lightweight quick-mode surface.' },
  team: { script: 'team.js', description: 'Plan or operate Team Lite orchestration.' },
  review: { script: 'review.js', description: 'Generate a review-ready closeout package.' },
  ship: { script: 'ship.js', description: 'Generate a ship-ready package.' },
  'pr-brief': { script: 'pr_brief.js', description: 'Generate a PR brief draft.' },
  'release-notes': { script: 'release_notes.js', description: 'Generate release notes.' },
  'session-report': { script: 'session_report.js', description: 'Generate a session report.' },
  update: { script: 'update.js', description: 'Refresh runtime files while preserving canonical markdown.' },
  uninstall: { script: 'uninstall.js', description: 'Safely remove installed runtime surfaces.' },
  benchmark: { script: 'benchmark.js', description: 'Measure hot-path command timings and cache metrics.' },
};

const LEGACY_EQUIVALENTS = [
  ['cwf milestone', 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."'],
  ['cwf doctor', 'npm run workflow:doctor -- --strict'],
  ['cwf hud', 'npm run workflow:hud -- --compact'],
  ['cwf next', 'npm run workflow:next'],
  ['cwf checkpoint', 'npm run workflow:checkpoint -- --next "Resume here"'],
  ['cwf quick', 'npm run workflow:quick'],
  ['cwf team', 'npm run workflow:team'],
  ['cwf review', 'npm run workflow:review'],
  ['cwf ship', 'npm run workflow:ship'],
  ['cwf pr-brief', 'npm run workflow:pr-brief'],
  ['cwf release-notes', 'npm run workflow:release-notes'],
  ['cwf session-report', 'npm run workflow:session-report'],
];

function printHelp() {
  console.log(`# CWF

Usage:
  cwf <command> [options]

Core commands:
  setup            Install or refresh workflow surfaces in the current repo
  init             Bootstrap workflow control-plane files in the current repo
  milestone        Open a new full-workflow milestone
  doctor           Verify install/runtime integrity
  hud              Show the current workflow HUD
  next             Show the next safe workflow action
  checkpoint       Write a continuity checkpoint
  quick            Run or inspect lightweight quick mode
  team             Plan or operate Team Lite orchestration
  review           Generate a review-ready package
  ship             Generate a ship-ready package
  pr-brief         Generate a pull-request brief draft
  release-notes    Generate a release-notes draft
  session-report   Generate a session report
  update           Refresh runtime scripts/templates safely
  uninstall        Remove installed runtime surfaces safely
  benchmark        Measure hot-path performance

Examples:
  cwf setup
  cwf milestone --id M1 --name "Initial setup" --goal "Land the first slice"
  cwf doctor --strict
  cwf hud --compact
  cwf quick start --goal "Fix a narrow bug"
  cwf team start --activation-text "parallel yap" --write-scope src,tests
  cwf review --json
  cwf release-notes --json

Legacy command equivalence:
${LEGACY_EQUIVALENTS.map(([current, legacy]) => `  ${current.padEnd(18)} -> ${legacy}`).join('\n')}
`);
}

function runScript(scriptName, forwardedArgs) {
  const scriptPath = path.join(__dirname, '..', 'workflow', scriptName);
  const result = childProcess.spawnSync('node', [scriptPath, ...forwardedArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return;
  }

  if (result.error) {
    throw result.error;
  }
}

function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const entry = CLI_COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}`);
    console.error('Run `cwf help` to see available commands.');
    process.exitCode = 1;
    return;
  }

  if (rest.includes('--help') || rest.includes('help')) {
    runScript(entry.script, ['--help']);
    return;
  }

  runScript(entry.script, rest);
}

if (require.main === module) {
  main();
}

module.exports = {
  CLI_COMMANDS,
  LEGACY_EQUIVALENTS,
  main,
};
