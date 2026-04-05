#!/usr/bin/env node

const path = require('node:path');
const childProcess = require('node:child_process');

const CLI_COMMANDS = {
  launch: { script: 'launch.js', description: 'Strong-start launcher for the current Codex session.' },
  codex: { script: 'codex_control.js', description: 'Operate the safe Codex control plane.' },
  do: { script: 'do.js', description: 'Route a natural-language intent into the right workflow lane.' },
  note: { script: 'note.js', description: 'Capture a low-friction workflow note and optionally promote it.' },
  thread: { script: 'thread.js', description: 'Open, list, and resume named workflow threads.' },
  backlog: { script: 'backlog.js', description: 'Capture and review workflow backlog items.' },
  manager: { script: 'manager.js', description: 'Show the operator manager surface.' },
  setup: { script: 'setup.js', description: 'Install or refresh the workflow product in the current repo.' },
  init: { script: 'init.js', description: 'Bootstrap workflow control-plane files in the current repo.' },
  milestone: { script: 'new_milestone.js', description: 'Open a new full-workflow milestone.' },
  doctor: { script: 'doctor.js', description: 'Check install health and workflow contract integrity.' },
  health: { script: 'health.js', description: 'Check runtime health and validation integrity.' },
  questions: { script: 'questions.js', description: 'List or capture open workflow questions.' },
  claims: { script: 'claims.js', description: 'Track claims, evidence, and traceability.' },
  secure: { script: 'secure_phase.js', description: 'Run the secure-phase heuristic guardrail scan.' },
  hud: { script: 'hud.js', description: 'Show the daily operator HUD.' },
  next: { script: 'next_step.js', description: 'Recommend the next safe workflow action.' },
  explore: { script: 'explore.js', description: 'Explore the repo with workflow-aware lenses.' },
  'verify-shell': { script: 'verify_shell.js', description: 'Run a bounded shell verification command.' },
  'verify-browser': { script: 'verify_browser.js', description: 'Run smoke browser verification and store evidence.' },
  packet: { script: 'packet.js', description: 'Compile, explain, lock, diff, and verify workflow packets.' },
  evidence: { script: 'evidence.js', description: 'Build the local evidence graph.' },
  checkpoint: { script: 'checkpoint.js', description: 'Write a continuity checkpoint.' },
  'next-prompt': { script: 'next_prompt.js', description: 'Generate a minimal resume prompt for the next session.' },
  quick: { script: 'quick.js', description: 'Run or inspect the lightweight quick-mode surface.' },
  team: { script: 'team.js', description: 'Plan or operate Team Lite orchestration.' },
  policy: { script: 'policy.js', description: 'Inspect or evaluate workflow policy decisions.' },
  approvals: { script: 'approvals.js', description: 'Record human approvals for risky workflow actions.' },
  route: { script: 'model_route.js', description: 'Recommend the right model preset for the current phase.' },
  stats: { script: 'stats.js', description: 'Show workflow telemetry, verification, and benchmark stats.' },
  profile: { script: 'profile.js', description: 'Show the operator profile and workflow defaults.' },
  workspaces: { script: 'workspaces_center.js', description: 'Show the workspace/workstream registry.' },
  hooks: { script: 'hooks.js', description: 'Manage disabled-by-default workflow hooks.' },
  mcp: { script: 'mcp.js', description: 'Inspect the repo-local MCP manifest surface.' },
  notify: { script: 'notify.js', description: 'Emit a workflow notification smoke event.' },
  daemon: { script: 'daemon.js', description: 'Inspect or restart the optional workflow daemon state.' },
  gc: { script: 'gc.js', description: 'Prune old workflow runtime artifacts.' },
  incident: { script: 'incident.js', description: 'Open or list incident memory entries.' },
  fleet: { script: 'fleet.js', description: 'Show the current repo fleet/operator view.' },
  sessions: { script: 'sessions.js', description: 'List active workflow session surfaces.' },
  'patch-review': { script: 'patch_review.js', description: 'Review collected patch bundles.' },
  'patch-apply': { script: 'patch_apply.js', description: 'Apply a collected patch bundle.' },
  'patch-rollback': { script: 'patch_rollback.js', description: 'Rollback an applied patch bundle.' },
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
  ['cwf health', 'npm run workflow:health -- --strict'],
  ['cwf hud', 'npm run workflow:hud -- --compact'],
  ['cwf next', 'npm run workflow:next'],
  ['cwf launch', 'npm run workflow:launch'],
  ['cwf manager', 'npm run workflow:manager'],
  ['cwf do', 'npm run workflow:do -- "..."'],
  ['cwf note', 'npm run workflow:note -- "..."'],
  ['cwf packet', 'npm run workflow:packet -- --step plan'],
  ['cwf explore', 'npm run workflow:explore -- "query"'],
  ['cwf verify-shell', 'npm run workflow:verify-shell -- --cmd "npm test"'],
  ['cwf verify-browser', 'npm run workflow:verify-browser -- --url http://localhost:3000'],
  ['cwf next-prompt', 'npm run workflow:next-prompt'],
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
  launch           Strong-start launcher for the current Codex session
  codex            Safe Codex control-plane commands
  do               Route a natural-language task into the right lane
  note             Capture a note and optionally promote it
  thread           Open, list, and resume workflow threads
  backlog          Add or review backlog items
  manager          Show the operator manager surface
  setup            Install or refresh workflow surfaces in the current repo
  init             Bootstrap workflow control-plane files in the current repo
  milestone        Open a new full-workflow milestone
  doctor           Verify install/runtime integrity
  health           Verify runtime health and validation integrity
  questions        Track unresolved workflow questions
  claims           Track claims and evidence
  secure           Run the secure-phase guardrail scan
  hud              Show the current workflow HUD
  next             Show the next safe workflow action
  explore          Explore the repo with workflow-aware lenses
  verify-shell     Run a bounded shell verification command
  verify-browser   Run smoke browser verification and store evidence
  packet           Compile, explain, lock, diff, and verify packets
  evidence         Build the evidence graph
  checkpoint       Write a continuity checkpoint
  next-prompt      Generate the next session resume prompt
  quick            Run or inspect lightweight quick mode
  team             Plan or operate Team Lite orchestration
  policy           Check workflow policy decisions
  approvals        Record approvals for risky changes
  route            Recommend the right model preset for the current phase
  stats            Show workflow telemetry and benchmark stats
  profile          Show the operator profile
  workspaces       Show the workspace/workstream registry
  hooks            Manage optional workflow hooks
  mcp              Inspect the repo-local MCP manifest
  notify           Emit a notification smoke event
  daemon           Inspect or restart the daemon state
  gc               Prune old workflow artifacts
  incident         Open or list incident memory
  fleet            Show the operator fleet surface
  sessions         Show active session surfaces
  patch-review     Review collected patch bundles
  patch-apply      Apply a collected patch bundle
  patch-rollback   Rollback an applied patch bundle
  review           Generate a review-ready package
  ship             Generate a ship-ready package
  pr-brief         Generate a pull-request brief draft
  release-notes    Generate a release-notes draft
  session-report   Generate a session report
  update           Refresh runtime scripts/templates safely
  uninstall        Remove installed runtime surfaces safely
  benchmark        Measure hot-path performance

Examples:
  cwf codex setup --repo
  cwf do "land the next safe slice"
  cwf note "Investigate route drift" --promote backlog
  cwf manager
  cwf setup
  cwf milestone --id M1 --name "Initial setup" --goal "Land the first slice"
  cwf doctor --strict
  cwf claims add "Browser smoke passes" --evidence .workflow/verifications/browser/latest/meta.json
  cwf packet compile --step plan --role reviewer
  cwf health --repair
  cwf hud --compact
  cwf explore --symbol buildPacketSnapshot
  cwf verify-shell --cmd "npm test"
  cwf verify-browser --adapter playwright --url ./preview.html --assert main
  cwf next-prompt --mode full
  cwf quick start --goal "Fix a narrow bug"
  cwf team run --adapter hybrid --activation-text "parallel yap" --write-scope src,tests
  cwf team mailbox
  cwf policy check --files package.json --operation edit --actor worker
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
