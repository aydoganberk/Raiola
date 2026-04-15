const path = require('node:path');
const { parseArgs } = require('./common');
const { nowIso, relativePath, writeJsonFile } = require('./roadmap_os');
const {
  desiredConfig,
  desiredCodexRoot,
  doDiff,
  doDoctor,
  doInstallSkill,
  doPrompts,
  doRemoveSkill,
  doRepair,
  doRoles,
  doRollback,
  doScaffoldRole,
  doSetup,
  doStatus,
  doSync,
  doUninstall,
  runtimeDir,
} = require('./codex_control_catalog');
const {
  doBootstrap,
  doContextPack,
  doPlanSubagents,
  doProfileSuggest,
  doPromptPack,
  doResumeCard,
} = require('./codex_control_packets');
const {
  doCockpit,
  doManagedExport,
  doMission,
  doOperator,
  doTelemetry,
} = require('./codex_operator_layer');

function printHelp() {
  console.log(`
codex_control

Usage:
  node scripts/workflow/codex_control.js [status]
  node scripts/workflow/codex_control.js setup --repo
  node scripts/workflow/codex_control.js diff-config --repo
  node scripts/workflow/codex_control.js rollback --repo

Actions:
  status           Show Codex control-plane status
  setup            Write native Codex config, hooks, agents, and role/prompt catalog
  diff-config      Compare the current config against the desired generated config
  doctor           Validate native config, hooks, subagents, drift, and installed catalog files
  rollback         Restore the latest journal backup
  uninstall        Remove generated Codex control-plane files
  repair           Re-run doctor and sync if drift or corruption is found
  sync             Refresh native config, hooks, subagents, roles, prompts, and catalog metadata
  roles            List generated roles
  prompts          List generated prompts
  install-skill    Install the workflow skill for a role
  remove-skill     Remove an installed role skill
  scaffold-role    Generate repo-derived role files
  profile suggest  Recommend the best Codex profile for the current task
  bootstrap        Build a task-specific Codex bootstrap packet
  promptpack       Write a task-specific Codex operator prompt pack
  contextpack      Write a task-shaped Codex context pack for app/CLI sessions
  resume-card      Generate a resume card for the current repo state
  plan-subagents   Suggest bounded subagent/worktree slices
  operator         Build a native Codex operator packet with CLI, slash, app-server, MCP, and automation guidance
  cockpit          Materialize a native Codex launch kit with runnable launchers, prompt/context packs, and continuity files
  mission          Materialize an execution capsule with charter, launcher, recovery ladder, trust gates, and resume anchor
  telemetry        Summarize hook-captured native Codex telemetry and operator friction
  managed-export   Export Trust-aware native requirements.toml template for managed Codex deployment

Options:
  --repo           Use <repo>/.codex (default)
  --local          Use <repo>/.codex
  --global         Use $CODEX_HOME/.codex or ~/.codex
  --role <name>    Role name for install-skill/remove-skill
  --goal <text>    Goal text for profile/bootstrapping/contextpack actions
  --taste <id>     Optional explicit frontend taste override for context packs
  --page <id>      Optional explicit frontend page type for context packs
  --from repo-profile
                   Generate roles from repo signals
  --json           Print machine-readable output
  `);
}

const ACTIONS = {
  status: doStatus,
  setup: doSetup,
  'diff-config': doDiff,
  doctor: doDoctor,
  rollback: doRollback,
  uninstall: doUninstall,
  repair: doRepair,
  sync: doSync,
  roles: doRoles,
  prompts: doPrompts,
  'install-skill': doInstallSkill,
  'remove-skill': doRemoveSkill,
  'scaffold-role': doScaffoldRole,
  profile: doProfileSuggest,
  bootstrap: doBootstrap,
  promptpack: doPromptPack,
  contextpack: doContextPack,
  'resume-card': doResumeCard,
  'plan-subagents': doPlanSubagents,
  operator: doOperator,
  cockpit: doCockpit,
  mission: doMission,
  telemetry: doTelemetry,
  'managed-export': doManagedExport,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] && !String(args._[0]).startsWith('--')
    ? String(args._[0]).trim()
    : 'status';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const handler = ACTIONS[action];
  if (!handler) {
    throw new Error(`Unknown codex control action: ${action}`);
  }

  const cwd = process.cwd();
  const payload = handler(cwd, args);
  writeJsonFile(path.join(runtimeDir(cwd), 'last-action.json'), {
    ...payload,
    generatedAt: nowIso(),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# CODEX CONTROL\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- Scope: \`${payload.scope}\``);
  console.log(`- Root: \`${relativePath(cwd, payload.rootDir)}\``);
  if (payload.virtualRoot) {
    console.log(`- Virtual root: \`${relativePath(cwd, payload.virtualRoot)}\``);
  }
  if ('verdict' in payload) {
    console.log(`- Verdict: \`${payload.verdict}\``);
  }
  if ('configFile' in payload) {
    console.log(`- Config: \`${payload.configFile}\``);
  }
  if ('file' in payload) {
    console.log(`- File: \`${payload.file}\``);
  }
  if (payload.promptPack?.file) {
    console.log(`- Prompt pack: \`${payload.promptPack.file}\``);
  }
  if (payload.roles && payload.roles.length > 0) {
    console.log('\n## Roles\n');
    for (const item of payload.roles) {
      if (typeof item === 'string') {
        console.log(`- \`${item}\``);
      } else {
        console.log(`- \`${item.name}\` -> ${item.summary || item.file}`);
      }
    }
  }
  if (payload.prompts && payload.prompts.length > 0) {
    console.log('\n## Prompts\n');
    for (const item of payload.prompts) {
      console.log(`- \`${item.name}\` -> ${item.summary || item.file}`);
    }
  }
  if (payload.diffLines && payload.diffLines.length > 0) {
    console.log('\n## Diff\n');
    for (const line of payload.diffLines) {
      console.log(line);
    }
  }
  if (payload.issues && payload.issues.length > 0) {
    console.log('\n## Issues\n');
    for (const issue of payload.issues) {
      console.log(`- \`${issue.status}\` ${issue.message}${issue.fix ? ` -> fix: \`${issue.fix}\`` : ''}`);
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
  ACTIONS,
  desiredConfig,
};
