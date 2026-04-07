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
  dashboard: { script: 'dashboard.js', description: 'Generate the local operator dashboard HTML surface.' },
  setup: { script: 'setup.js', description: 'Install or refresh the workflow product in the current repo.' },
  init: { script: 'init.js', description: 'Bootstrap workflow control-plane files in the current repo.' },
  milestone: { script: 'new_milestone.js', description: 'Open a new full-workflow milestone.' },
  doctor: { script: 'doctor.js', description: 'Check install health and workflow contract integrity.' },
  health: { script: 'health.js', description: 'Check runtime health and validation integrity.' },
  discuss: { script: 'discuss.js', description: 'Generate the current discuss brief from workflow state.' },
  questions: { script: 'questions.js', description: 'List or capture open workflow questions.' },
  assumptions: { script: 'assumptions.js', description: 'Track active assumptions and their exit triggers.' },
  claims: { script: 'claims.js', description: 'Track claims, evidence, and traceability.' },
  secure: { script: 'secure_phase.js', description: 'Run the secure-phase heuristic guardrail scan.' },
  hud: { script: 'hud.js', description: 'Show the daily operator HUD.' },
  next: { script: 'next_step.js', description: 'Recommend the next safe workflow action.' },
  explore: { script: 'explore.js', description: 'Explore the repo with workflow-aware lenses.' },
  'verify-shell': { script: 'verify_shell.js', description: 'Run a bounded shell verification command.' },
  'verify-browser': { script: 'verify_browser.js', description: 'Run smoke browser verification and store evidence.' },
  'verify-work': { script: 'verify_work.js', description: 'Run the trust-layer verify-work pass and emit a fix plan if needed.' },
  packet: { script: 'packet.js', description: 'Compile, explain, lock, diff, and verify workflow packets.' },
  evidence: { script: 'evidence.js', description: 'Build the local evidence graph.' },
  'validation-map': { script: 'validation_map.js', description: 'Show the current validation contract mapping.' },
  checkpoint: { script: 'checkpoint.js', description: 'Write a continuity checkpoint.' },
  'next-prompt': { script: 'next_prompt.js', description: 'Generate a minimal resume prompt for the next session.' },
  quick: { script: 'quick.js', description: 'Run or inspect the lightweight quick-mode surface.' },
  team: { script: 'team.js', description: 'Plan or operate Team Lite orchestration.' },
  subagents: { script: 'subagents.js', description: 'Suggest bounded subagent slices via the Codex planner.' },
  policy: { script: 'policy.js', description: 'Inspect or evaluate workflow policy decisions.' },
  approval: { script: 'approvals.js', description: 'Roadmap-compatible alias for approvals and approval planning.' },
  approvals: { script: 'approvals.js', description: 'Record human approvals for risky workflow actions.' },
  route: { script: 'model_route.js', description: 'Recommend the right model preset for the current phase.' },
  stats: { script: 'stats.js', description: 'Show workflow telemetry, verification, and benchmark stats.' },
  profile: { script: 'profile.js', description: 'Show the operator profile and workflow defaults.' },
  workspaces: { script: 'workspaces_center.js', description: 'Show the workspace/workstream registry.' },
  hooks: { script: 'hooks.js', description: 'Manage disabled-by-default workflow hooks.' },
  mcp: { script: 'mcp.js', description: 'Install, inspect, and doctor the repo-local MCP servers.' },
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
  'review-mode': { script: 'review_mode.js', description: 'Run the deep multi-pass review engine.' },
  'review-orchestrate': { script: 'review_orchestrate.js', description: 'Build package/persona/wave-based review orchestration.' },
  'review-tasks': { script: 'review_task_graph.js', description: 'Turn review findings into a blocker-first task graph.' },
  'pr-review': { script: 'pr_review.js', description: 'Review a PR/diff surface with findings and blockers.' },
  're-review': { script: 're_review.js', description: 'Replay the latest review findings against current state.' },
  'ui-direction': { script: 'ui_direction.js', description: 'Generate the taste-aware UI direction pack.' },
  'ui-spec': { script: 'ui_spec.js', description: 'Generate the canonical UI specification.' },
  'ui-plan': { script: 'ui_plan.js', description: 'Generate the UI execution plan.' },
  'ui-review': { script: 'ui_review.js', description: 'Run the frontend review scorecard and evidence pass.' },
  preview: { script: 'preview.js', description: 'Build the latest preview gallery from browser artifacts.' },
  'component-map': { script: 'component_map.js', description: 'Generate the component inventory and reuse map.' },
  'responsive-matrix': { script: 'responsive_matrix.js', description: 'Generate the responsive audit matrix.' },
  'design-debt': { script: 'design_debt.js', description: 'Generate the frontend design debt ledger.' },
  monorepo: { script: 'monorepo.js', description: 'Generate package-aware monorepo execution and verify guidance.' },
  'ship-readiness': { script: 'ship_readiness.js', description: 'Score ship readiness from review, evidence, approvals, and verify-work.' },
  ship: { script: 'ship.js', description: 'Generate a ship-ready package.' },
  'pr-brief': { script: 'pr_brief.js', description: 'Generate a PR brief draft.' },
  'release-notes': { script: 'release_notes.js', description: 'Generate release notes.' },
  'session-report': { script: 'session_report.js', description: 'Generate a session report.' },
  update: { script: 'update.js', description: 'Refresh runtime files while preserving canonical markdown.' },
  uninstall: { script: 'uninstall.js', description: 'Safely remove installed runtime surfaces.' },
  benchmark: { script: 'benchmark.js', description: 'Measure hot-path command timings and cache metrics.' },
};

const COMMAND_GROUPS = Object.freeze([
  {
    id: 'solo',
    title: 'Solo Daily Loop',
    description: 'Single-operator setup, routing, continuity, and daily execution surfaces.',
    commands: [
      'setup', 'init', 'doctor', 'health', 'launch', 'do', 'note', 'thread', 'backlog',
      'hud', 'manager', 'next', 'explore', 'checkpoint', 'next-prompt', 'quick', 'milestone',
    ],
  },
  {
    id: 'review',
    title: 'Deep Review',
    description: 'Route risk, run review passes, collect evidence, and clear ship gates.',
    commands: [
      'route', 'review', 'review-mode', 'review-orchestrate', 'review-tasks', 'pr-review', 're-review',
      'verify-shell', 'verify-browser', 'verify-work', 'packet', 'evidence', 'validation-map',
      'ship-readiness',
    ],
  },
  {
    id: 'team',
    title: 'Team Parallel',
    description: 'Plan bounded parallel work, collect patches, and operate at package scope.',
    commands: [
      'team', 'subagents', 'workspaces', 'sessions', 'patch-review', 'patch-apply', 'patch-rollback', 'monorepo',
    ],
  },
  {
    id: 'frontend',
    title: 'Frontend',
    description: 'Direction, spec, review, preview, and design debt surfaces for UI work.',
    commands: [
      'ui-direction', 'ui-spec', 'ui-plan', 'ui-review', 'preview', 'component-map', 'responsive-matrix', 'design-debt',
    ],
  },
  {
    id: 'trust',
    title: 'Trust And Governance',
    description: 'Discuss, assumptions, claims, approvals, and policy-backed guardrails.',
    commands: [
      'discuss', 'questions', 'assumptions', 'claims', 'secure', 'policy', 'approval', 'approvals',
    ],
  },
  {
    id: 'runtime',
    title: 'Runtime And Operator Center',
    description: 'Dashboard, telemetry, hooks, daemon, incident memory, and cleanup surfaces.',
    commands: [
      'dashboard', 'stats', 'profile', 'hooks', 'mcp', 'notify', 'daemon', 'gc', 'incident', 'fleet',
    ],
  },
  {
    id: 'codex',
    title: 'Codex And Lifecycle',
    description: 'Codex control-plane actions and repo closeout packages.',
    commands: [
      'codex', 'ship', 'pr-brief', 'release-notes', 'session-report', 'update', 'uninstall', 'benchmark',
    ],
  },
]);

const GOLDEN_FLOWS = Object.freeze([
  {
    id: 'solo',
    title: 'Solo Daily Loop',
    summary: 'Best default for a single operator moving one safe slice at a time.',
    commands: ['do', 'next', 'verify-shell', 'checkpoint', 'next-prompt', 'quick', 'milestone'],
    sequence: [
      'cwf setup',
      'cwf doctor --strict',
      'cwf milestone --id M1 --name "Initial slice" --goal "Land the next safe slice"',
      'cwf do "land the next safe slice"',
      'cwf next',
      'cwf checkpoint --next "Resume here"',
    ],
    relatedGroup: 'solo',
  },
  {
    id: 'review',
    title: 'Deep Review',
    summary: 'Use when the main job is understanding risk, regressions, or readiness to ship.',
    commands: ['route', 'review', 'review-tasks', 'ui-review', 'verify-work', 'ship-readiness', 'ship'],
    sequence: [
      'cwf route --goal "review the current diff" --why',
      'cwf review --heatmap',
      'cwf review-tasks --json',
      'cwf ui-review --url ./preview.html',
      'cwf verify-work',
      'cwf ship-readiness',
    ],
    relatedGroup: 'review',
  },
  {
    id: 'team',
    title: 'Team Parallel',
    summary: 'Use when the user explicitly wants parallel work with bounded write scopes.',
    commands: ['monorepo', 'team', 'subagents', 'patch-review', 'sessions'],
    sequence: [
      'cwf monorepo',
      'cwf team run --adapter hybrid --activation-text "parallel yap" --write-scope src,tests',
      'cwf team collect --patch-first',
      'cwf team mailbox',
      'cwf patch-review',
    ],
    relatedGroup: 'team',
  },
]);

const CORE_COMMANDS = ['setup', 'doctor', 'do', 'next', 'review', 'team', 'dashboard'];

const LEGACY_EQUIVALENTS = [
  ['cwf milestone', 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."'],
  ['cwf doctor', 'npm run workflow:doctor -- --strict'],
  ['cwf health', 'npm run workflow:health -- --strict'],
  ['cwf discuss', 'npm run workflow:discuss'],
  ['cwf assumptions', 'npm run workflow:assumptions'],
  ['cwf hud', 'npm run workflow:hud -- --compact'],
  ['cwf next', 'npm run workflow:next'],
  ['cwf launch', 'npm run workflow:launch'],
  ['cwf manager', 'npm run workflow:manager'],
  ['cwf dashboard', 'npm run workflow:dashboard'],
  ['cwf do', 'npm run workflow:do -- "..."'],
  ['cwf note', 'npm run workflow:note -- "..."'],
  ['cwf packet', 'npm run workflow:packet -- --step plan'],
  ['cwf explore', 'npm run workflow:explore -- "query"'],
  ['cwf verify-shell', 'npm run workflow:verify-shell -- --cmd "npm test"'],
  ['cwf verify-browser', 'npm run workflow:verify-browser -- --url http://localhost:3000'],
  ['cwf verify-work', 'npm run workflow:verify-work'],
  ['cwf next-prompt', 'npm run workflow:next-prompt'],
  ['cwf checkpoint', 'npm run workflow:checkpoint -- --next "Resume here"'],
  ['cwf quick', 'npm run workflow:quick'],
  ['cwf team', 'npm run workflow:team'],
  ['cwf subagents', 'npm run workflow:subagents -- plan'],
  ['cwf approval', 'npm run workflow:approval -- plan'],
  ['cwf review', 'npm run workflow:review'],
  ['cwf review-mode', 'npm run workflow:review-mode'],
  ['cwf review-tasks', 'npm run workflow:review-tasks'],
  ['cwf pr-review', 'npm run workflow:pr-review'],
  ['cwf re-review', 'npm run workflow:re-review'],
  ['cwf ui-spec', 'npm run workflow:ui-spec'],
  ['cwf ui-plan', 'npm run workflow:ui-plan'],
  ['cwf ui-review', 'npm run workflow:ui-review'],
  ['cwf preview', 'npm run workflow:preview'],
  ['cwf component-map', 'npm run workflow:component-map'],
  ['cwf responsive-matrix', 'npm run workflow:responsive-matrix'],
  ['cwf design-debt', 'npm run workflow:design-debt'],
  ['cwf ship-readiness', 'npm run workflow:ship-readiness'],
  ['cwf ship', 'npm run workflow:ship'],
  ['cwf pr-brief', 'npm run workflow:pr-brief'],
  ['cwf release-notes', 'npm run workflow:release-notes'],
  ['cwf session-report', 'npm run workflow:session-report'],
];

function validateCommandGroups() {
  const knownCommands = new Set(Object.keys(CLI_COMMANDS));
  const seen = new Set();
  for (const group of COMMAND_GROUPS) {
    for (const command of group.commands) {
      if (!knownCommands.has(command)) {
        throw new Error(`Unknown help command in group ${group.id}: ${command}`);
      }
      if (seen.has(command)) {
        throw new Error(`Command ${command} appears in multiple help groups.`);
      }
      seen.add(command);
    }
  }

  const missing = [...knownCommands].filter((command) => !seen.has(command));
  if (missing.length > 0) {
    throw new Error(`COMMAND_GROUPS is missing commands: ${missing.join(', ')}`);
  }
}

validateCommandGroups();

function formatCommandRows(commands) {
  return commands
    .map((command) => `  ${command.padEnd(16)} ${CLI_COMMANDS[command].description}`)
    .join('\n');
}

function groupById(groupId) {
  return COMMAND_GROUPS.find((group) => group.id === groupId) || null;
}

function flowById(flowId) {
  return GOLDEN_FLOWS.find((flow) => flow.id === flowId) || null;
}

function printDefaultHelp() {
  console.log(`# CWF

Usage:
  cwf <command> [options]
  cwf help <topic>

Start here:
  cwf help solo      Single-operator daily loop for most repos
  cwf help review    Deep review, risk triage, and closeout
  cwf help team      Parallel Team Lite flow with bounded scopes

Core commands:
${formatCommandRows(CORE_COMMANDS)}

Golden flows:
  solo    -> cwf do, cwf next, cwf verify-shell, cwf checkpoint, cwf next-prompt
  review  -> cwf route, cwf review, cwf ui-review, cwf verify-work, cwf ship-readiness
  team    -> cwf monorepo, cwf team run, cwf team collect, cwf patch-review, cwf sessions

More help:
  cwf help categories   Browse command groups
  cwf help frontend     UI direction, spec, review, and preview surfaces
  cwf help trust        Discuss, claims, approvals, and policy surfaces
  cwf help runtime      Dashboard, telemetry, daemon, and fleet surfaces
  cwf help codex        Codex control plane and closeout packages
  cwf help all          Full command reference

Examples:
  cwf setup
  cwf help solo
  cwf help review
  cwf help team
`);
}

function printCategoriesHelp() {
  console.log('# CWF CATEGORIES\n');
  for (const group of COMMAND_GROUPS) {
    console.log(`- \`${group.id}\` -> ${group.title}: ${group.description}`);
  }
  console.log('\nUse `cwf help <category>` for the commands inside a category, or `cwf help all` for the full shell.');
}

function printFlowHelp(flow) {
  const relatedGroup = groupById(flow.relatedGroup);
  console.log(`# CWF ${flow.title.toUpperCase()}\n`);
  console.log(`- Summary: \`${flow.summary}\``);
  console.log('\n## Starter Commands\n');
  console.log(formatCommandRows(flow.commands));
  console.log('\n## Suggested Sequence\n');
  for (const command of flow.sequence) {
    console.log(`- \`${command}\``);
  }
  if (relatedGroup) {
    const relatedCommand = relatedGroup.id === flow.id ? 'cwf help all' : `cwf help ${relatedGroup.id}`;
    const relatedDescription = relatedGroup.id === flow.id
      ? `Full command reference including the ${relatedGroup.title.toLowerCase()} surfaces.`
      : relatedGroup.description;
    console.log(`\n## Related Category\n\n- \`${relatedCommand}\` -> ${relatedDescription}`);
  }
}

function printGroupHelp(group) {
  console.log(`# CWF ${group.title.toUpperCase()}\n`);
  console.log(`- ${group.description}`);
  console.log('\n## Commands\n');
  console.log(formatCommandRows(group.commands));
}

function printAdvancedHelp() {
  console.log('# CWF ADVANCED\n');
  console.log('- `frontend` -> UI direction, review, responsive, and design debt surfaces');
  console.log('- `trust` -> discuss, assumptions, claims, approvals, and policy');
  console.log('- `runtime` -> dashboard, stats, hooks, daemon, gc, incident, and fleet');
  console.log('- `codex` -> control plane, prompt packs, lifecycle closeout, and benchmark');
  console.log('\nOpen any of them with `cwf help <topic>` or use `cwf help all` for the full command reference.');
}

function printAllHelp() {
  console.log('# CWF FULL COMMAND REFERENCE\n');
  console.log('Use `cwf help solo`, `cwf help review`, or `cwf help team` for the three golden flows.\n');
  for (const group of COMMAND_GROUPS) {
    console.log(`## ${group.title}\n`);
    console.log(`${group.description}\n`);
    console.log(`${formatCommandRows(group.commands)}\n`);
  }
  console.log('## Legacy command equivalence\n');
  for (const [current, legacy] of LEGACY_EQUIVALENTS) {
    console.log(`- \`${current}\` -> \`${legacy}\``);
  }
}

function printHelp(topic) {
  const normalized = String(topic || '').trim().toLowerCase();
  if (!normalized) {
    printDefaultHelp();
    return;
  }
  if (normalized === 'all') {
    printAllHelp();
    return;
  }
  if (normalized === 'categories') {
    printCategoriesHelp();
    return;
  }
  if (normalized === 'advanced') {
    printAdvancedHelp();
    return;
  }

  const flow = flowById(normalized);
  if (flow) {
    printFlowHelp(flow);
    return;
  }

  const group = groupById(normalized);
  if (group) {
    printGroupHelp(group);
    return;
  }

  console.error(`Unknown help topic: ${topic}`);
  console.error('Run `cwf help categories` to browse available help topics.');
  process.exitCode = 1;
}

function runScript(scriptName, forwardedArgs) {
  const scriptPath = path.join(__dirname, '..', 'workflow', scriptName);
  const result = childProcess.spawnSync(process.execPath, [scriptPath, ...forwardedArgs], {
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
    printHelp(rest[0]);
    return;
  }

  const entry = CLI_COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}`);
    console.error('Run `cwf help` for the golden flows or `cwf help all` for the full shell.');
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
  COMMAND_GROUPS,
  GOLDEN_FLOWS,
  LEGACY_EQUIVALENTS,
  main,
};
