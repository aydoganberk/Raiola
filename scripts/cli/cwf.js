#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { readProductManifest } = require('../workflow/product_manifest');

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
  'design-dna': { script: 'design_dna.js', description: 'Generate the external design-reference blend for the target product surface.' },
  'page-blueprint': { script: 'page_blueprint.js', description: 'Generate the page-level section and conversion blueprint.' },
  'design-md': { script: 'design_md.js', description: 'Export a DESIGN.md contract for downstream agent-driven UI work.' },
  'component-strategy': { script: 'component_strategy.js', description: 'Generate reuse/extract/build guidance for the current frontend target.' },
  'design-benchmark': { script: 'design_benchmark.js', description: 'Generate differentiation plays and commodity-risk checks from the selected design blend.' },
  'state-atlas': { script: 'state_atlas.js', description: 'Generate the required UX state atlas for the current frontend slice.' },
  'frontend-brief': { script: 'frontend_brief.js', description: 'Generate a one-shot external-site frontend brief pack.' },
  'ui-recipe': { script: 'ui_recipe.js', description: 'Generate a framework-aware UI recipe scaffold.' },
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

const CLI_COMMAND_PROFILES = Object.freeze({
  pilot: [
    'launch',
    'codex',
    'do',
    'note',
    'thread',
    'backlog',
    'manager',
    'dashboard',
    'setup',
    'init',
    'milestone',
    'doctor',
    'health',
    'hud',
    'next',
    'verify-shell',
    'verify-work',
    'checkpoint',
    'next-prompt',
    'quick',
    'team',
    'review',
    'monorepo',
    'ship-readiness',
    'update',
    'uninstall',
  ],
});

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
      'ui-direction', 'design-dna', 'page-blueprint', 'design-md', 'component-strategy', 'design-benchmark', 'state-atlas', 'frontend-brief', 'ui-recipe', 'ui-spec', 'ui-plan', 'ui-review', 'preview', 'component-map', 'responsive-matrix', 'design-debt',
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
      'rai setup',
      'rai doctor --strict',
      'rai milestone --id M1 --name "Initial slice" --goal "Land the next safe slice"',
      'rai do "land the next safe slice"',
      'rai next',
      'rai checkpoint --next "Resume here"',
    ],
    relatedGroup: 'solo',
  },
  {
    id: 'review',
    title: 'Deep Review',
    summary: 'Use when the main job is understanding risk, regressions, or readiness to ship.',
    commands: ['route', 'review', 'review-tasks', 'ui-review', 'verify-work', 'ship-readiness', 'ship'],
    sequence: [
      'rai route --goal "review the current diff" --why',
      'rai review --heatmap',
      'rai review-tasks --json',
      'rai ui-review --url ./preview.html',
      'rai verify-work',
      'rai ship-readiness',
    ],
    relatedGroup: 'review',
  },
  {
    id: 'team',
    title: 'Team Parallel',
    summary: 'Use when the user explicitly wants parallel work with bounded write scopes.',
    commands: ['monorepo', 'team', 'subagents', 'patch-review', 'sessions'],
    sequence: [
      'rai monorepo',
      'rai team run --adapter hybrid --activation-text "parallel yap" --write-scope src,tests',
      'rai team collect --patch-first',
      'rai team mailbox',
      'rai patch-review',
    ],
    relatedGroup: 'team',
  },
]);

const CORE_COMMANDS = ['setup', 'doctor', 'do', 'next', 'review', 'team', 'dashboard'];

const LEGACY_EQUIVALENTS = [
  ['rai milestone', 'npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."'],
  ['rai doctor', 'npm run workflow:doctor -- --strict'],
  ['rai health', 'npm run workflow:health -- --strict'],
  ['rai discuss', 'npm run workflow:discuss'],
  ['rai assumptions', 'npm run workflow:assumptions'],
  ['rai hud', 'npm run workflow:hud -- --compact'],
  ['rai next', 'npm run workflow:next'],
  ['rai launch', 'npm run workflow:launch'],
  ['rai manager', 'npm run workflow:manager'],
  ['rai dashboard', 'npm run workflow:dashboard'],
  ['rai do', 'npm run workflow:do -- "..."'],
  ['rai note', 'npm run workflow:note -- "..."'],
  ['rai packet', 'npm run workflow:packet -- --step plan'],
  ['rai explore', 'npm run workflow:explore -- "query"'],
  ['rai verify-shell', 'npm run workflow:verify-shell -- --cmd "npm test"'],
  ['rai verify-browser', 'npm run workflow:verify-browser -- --url http://localhost:3000'],
  ['rai verify-work', 'npm run workflow:verify-work'],
  ['rai next-prompt', 'npm run workflow:next-prompt'],
  ['rai checkpoint', 'npm run workflow:checkpoint -- --next "Resume here"'],
  ['rai quick', 'npm run workflow:quick'],
  ['rai team', 'npm run workflow:team'],
  ['rai subagents', 'npm run workflow:subagents -- plan'],
  ['rai approval', 'npm run workflow:approval -- plan'],
  ['rai review', 'npm run workflow:review'],
  ['rai review-mode', 'npm run workflow:review-mode'],
  ['rai review-tasks', 'npm run workflow:review-tasks'],
  ['rai pr-review', 'npm run workflow:pr-review'],
  ['rai re-review', 'npm run workflow:re-review'],
  ['rai ui-spec', 'npm run workflow:ui-spec'],
  ['rai design-dna', 'npm run workflow:design-dna'],
  ['rai page-blueprint', 'npm run workflow:page-blueprint'],
  ['rai design-md', 'npm run workflow:design-md'],
  ['rai component-strategy', 'npm run workflow:component-strategy'],
  ['rai design-benchmark', 'npm run workflow:design-benchmark'],
  ['rai state-atlas', 'npm run workflow:state-atlas'],
  ['rai frontend-brief', 'npm run workflow:frontend-brief'],
  ['rai ui-recipe', 'npm run workflow:ui-recipe'],
  ['rai ui-plan', 'npm run workflow:ui-plan'],
  ['rai ui-review', 'npm run workflow:ui-review'],
  ['rai preview', 'npm run workflow:preview'],
  ['rai component-map', 'npm run workflow:component-map'],
  ['rai responsive-matrix', 'npm run workflow:responsive-matrix'],
  ['rai design-debt', 'npm run workflow:design-debt'],
  ['rai ship-readiness', 'npm run workflow:ship-readiness'],
  ['rai ship', 'npm run workflow:ship'],
  ['rai pr-brief', 'npm run workflow:pr-brief'],
  ['rai release-notes', 'npm run workflow:release-notes'],
  ['rai session-report', 'npm run workflow:session-report'],
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

function workflowScriptPath(scriptName) {
  return path.join(__dirname, '..', 'workflow', scriptName);
}

function commandSetForSurface(surface) {
  const knownCommands = Object.keys(CLI_COMMANDS);
  const expectedCommands = CLI_COMMAND_PROFILES[surface.scriptProfile] || knownCommands;
  return expectedCommands.filter((command) => fs.existsSync(workflowScriptPath(CLI_COMMANDS[command].script)));
}

function buildSurfaceContext(cwd = process.cwd()) {
  const manifest = readProductManifest(cwd);
  const scriptProfile = String(manifest?.scriptProfile || 'full').trim().toLowerCase();
  const availableCommands = new Set(commandSetForSurface({ scriptProfile }));
  return {
    manifest,
    scriptProfile,
    availableCommands,
    isFiltered: scriptProfile === 'pilot',
  };
}

function filterCommands(commands, surface) {
  return commands.filter((command) => surface.availableCommands.has(command));
}

function isFlowAvailable(flow, surface) {
  return flow.commands.every((command) => surface.availableCommands.has(command));
}

function visibleGroupsForSurface(surface) {
  return COMMAND_GROUPS
    .map((group) => ({ ...group, commands: filterCommands(group.commands, surface) }))
    .filter((group) => group.commands.length > 0);
}

function visibleAdvancedGroupsForSurface(surface) {
  return visibleGroupsForSurface(surface).filter((group) => ['frontend', 'trust', 'runtime', 'codex'].includes(group.id));
}

function upgradeHintForSurface(surface) {
  if (surface.scriptProfile === 'pilot') {
    return 'Run `rai update --script-profile core` for the full shell with curated npm aliases, or `rai update --script-profile full` for every legacy alias.';
  }
  return 'Run `rai doctor --strict` or `rai update` to repair the local shell.';
}

function printUnavailableSurface(topic, surface) {
  console.error(`The \`${topic}\` surface is not installed in this repo's current shell.`);
  console.error(upgradeHintForSurface(surface));
  process.exitCode = 1;
}

function groupById(groupId) {
  return COMMAND_GROUPS.find((group) => group.id === groupId) || null;
}

function flowById(flowId) {
  return GOLDEN_FLOWS.find((flow) => flow.id === flowId) || null;
}

function printDefaultHelp() {
  console.log(`# raiola

Usage:
  rai <command> [options]
  rai help <topic>

Start here:
  rai help solo      Single-operator daily loop for most repos
  rai help review    Deep review, risk triage, and closeout
  rai help team      Parallel Team Lite flow with bounded scopes

Core commands:
${formatCommandRows(CORE_COMMANDS)}

Golden flows:
  solo    -> rai do, rai next, rai verify-shell, rai checkpoint, rai next-prompt
  review  -> rai route, rai review, rai ui-review, rai verify-work, rai ship-readiness
  team    -> rai monorepo, rai team run, rai team collect, rai patch-review, rai sessions

More help:
  rai help categories   Browse command groups
  rai help frontend     UI direction, spec, review, and preview surfaces
  rai help trust        Discuss, claims, approvals, and policy surfaces
  rai help runtime      Dashboard, telemetry, daemon, and fleet surfaces
  rai help codex        Codex control plane and closeout packages
  rai help all          Full command reference

Examples:
  rai setup
  rai help solo
  rai help review
  rai help team
`);
}

function printFilteredDefaultHelp(surface) {
  const visibleCoreCommands = filterCommands(CORE_COMMANDS, surface);
  const visibleFlows = GOLDEN_FLOWS.filter((flow) => isFlowAvailable(flow, surface));
  const visibleAdvancedGroups = visibleAdvancedGroupsForSurface(surface);

  console.log(`# raiola

Usage:
  rai <command> [options]
  rai help <topic>

Focused install:
  This repo is using the \`pilot\` shell profile. Upgrade later with \`rai update --script-profile core\` or \`rai update --script-profile full\`.

Start here:`);
  if (visibleFlows.length > 0) {
    for (const flow of visibleFlows) {
      console.log(`  rai help ${flow.id.padEnd(9)} ${flow.summary}`);
    }
  } else {
    console.log('  rai help categories  Browse the currently installed command groups');
  }

  console.log(`
Core commands:
${formatCommandRows(visibleCoreCommands)}

More help:
  rai help categories   Browse command groups`);
  for (const group of visibleAdvancedGroups) {
    console.log(`  rai help ${group.id.padEnd(12)} ${group.description}`);
  }
  console.log(`
Examples:
  rai help solo
  rai do "land the next safe slice"
  rai next
`);
}

function printCategoriesHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Categories\n');
    for (const group of COMMAND_GROUPS) {
      console.log(`- \`${group.id}\` -> ${group.title}: ${group.description}`);
    }
    console.log('\nUse `rai help <category>` for the commands inside a category, or `rai help all` for the full shell.');
    return;
  }

  console.log('# raiola Categories\n');
  for (const group of visibleGroupsForSurface(surface)) {
    console.log(`- \`${group.id}\` -> ${group.title}: ${group.description}`);
  }
  console.log('\nUse `rai help <category>` for the commands inside a category, or `rai help all` for the full shell.');
}

function printFlowHelp(flow) {
  const relatedGroup = groupById(flow.relatedGroup);
  console.log(`# raiola ${flow.title}\n`);
  console.log(`- Summary: \`${flow.summary}\``);
  console.log('\n## Starter Commands\n');
  console.log(formatCommandRows(flow.commands));
  console.log('\n## Suggested Sequence\n');
  for (const command of flow.sequence) {
    console.log(`- \`${command}\``);
  }
  if (relatedGroup) {
    const relatedCommand = relatedGroup.id === flow.id ? 'rai help all' : `rai help ${relatedGroup.id}`;
    const relatedDescription = relatedGroup.id === flow.id
      ? `Full command reference including the ${relatedGroup.title.toLowerCase()} surfaces.`
      : relatedGroup.description;
    console.log(`\n## Related Category\n\n- \`${relatedCommand}\` -> ${relatedDescription}`);
  }
}

function printGroupHelp(group) {
  console.log(`# raiola ${group.title}\n`);
  console.log(`- ${group.description}`);
  console.log('\n## Commands\n');
  console.log(formatCommandRows(group.commands));
}

function printAdvancedHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Advanced\n');
    console.log('- `frontend` -> UI direction, review, responsive, and design debt surfaces');
    console.log('- `trust` -> discuss, assumptions, claims, approvals, and policy');
    console.log('- `runtime` -> dashboard, stats, hooks, daemon, gc, incident, and fleet');
    console.log('- `codex` -> control plane, prompt packs, lifecycle closeout, and benchmark');
    console.log('\nOpen any of them with `rai help <topic>` or use `rai help all` for the full command reference.');
    return;
  }

  console.log('# raiola Advanced\n');
  for (const group of visibleAdvancedGroupsForSurface(surface)) {
    console.log(`- \`${group.id}\` -> ${group.description}`);
  }
  console.log('\nOpen any of them with `rai help <topic>` or use `rai help all` for the full command reference.');
}

function printAllHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Full Command Reference\n');
    console.log('Use `rai help solo`, `rai help review`, or `rai help team` for the three golden flows.\n');
    for (const group of COMMAND_GROUPS) {
      console.log(`## ${group.title}\n`);
      console.log(`${group.description}\n`);
      console.log(`${formatCommandRows(group.commands)}\n`);
    }
    console.log('## Legacy command equivalence\n');
    for (const [current, legacy] of LEGACY_EQUIVALENTS) {
      console.log(`- \`${current}\` -> \`${legacy}\``);
    }
    return;
  }

  console.log('# raiola Full Command Reference\n');
  console.log('Use `rai help solo` for the installed starter flow. Upgrade to `core` or `full` to unlock the broader shell.\n');
  for (const group of visibleGroupsForSurface(surface)) {
    console.log(`## ${group.title}\n`);
    console.log(`${group.description}\n`);
    console.log(`${formatCommandRows(group.commands)}\n`);
  }
  console.log('## Installed legacy command equivalence\n');
  for (const [current, legacy] of LEGACY_EQUIVALENTS.filter(([current]) => surface.availableCommands.has(current.replace(/^rai\s+/, '')))) {
    console.log(`- \`${current}\` -> \`${legacy}\``);
  }
}

function printHelp(topic, surface) {
  const normalized = String(topic || '').trim().toLowerCase();
  if (!normalized) {
    if (surface.isFiltered) {
      printFilteredDefaultHelp(surface);
      return;
    }
    printDefaultHelp();
    return;
  }
  if (normalized === 'all') {
    printAllHelp(surface);
    return;
  }
  if (normalized === 'categories') {
    printCategoriesHelp(surface);
    return;
  }
  if (normalized === 'advanced') {
    printAdvancedHelp(surface);
    return;
  }

  const flow = flowById(normalized);
  if (flow && isFlowAvailable(flow, surface)) {
    printFlowHelp(flow);
    return;
  }

  const group = visibleGroupsForSurface(surface).find((entry) => entry.id === normalized) || null;
  if (group) {
    printGroupHelp(group);
    return;
  }

  if (flow || groupById(normalized)) {
    printUnavailableSurface(normalized, surface);
    return;
  }

  console.error(`Unknown help topic: ${topic}`);
  console.error('Run `rai help categories` to browse available help topics.');
  process.exitCode = 1;
}

function runScript(command, scriptName, forwardedArgs, surface) {
  if (surface.isFiltered && !surface.availableCommands.has(command)) {
    printUnavailableSurface(command, surface);
    return;
  }

  const scriptPath = workflowScriptPath(scriptName);
  if (!fs.existsSync(scriptPath)) {
    printUnavailableSurface(command, surface);
    return;
  }

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
  const surface = buildSurfaceContext(process.cwd());
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp(rest[0], surface);
    return;
  }

  const entry = CLI_COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}`);
    console.error('Run `rai help` for the golden flows or `rai help all` for the full shell.');
    process.exitCode = 1;
    return;
  }

  if (rest.includes('--help') || rest.includes('help')) {
    runScript(command, entry.script, ['--help'], surface);
    return;
  }

  runScript(command, entry.script, rest, surface);
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
