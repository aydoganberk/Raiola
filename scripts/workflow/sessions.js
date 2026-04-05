const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildBaseState } = require('./state_surface');
const { readJsonIfExists } = require('./runtime_helpers');

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    console.log('Usage: node scripts/workflow/sessions.js [--json]');
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const state = buildBaseState(cwd, rootDir);
  const teamRuntime = readJsonIfExists(path.join(cwd, '.workflow', 'orchestration', 'runtime', 'state.json'));
  const quickSession = readJsonIfExists(path.join(cwd, '.workflow', 'quick', 'session.json'));
  const payload = {
    generatedAt: new Date().toISOString(),
    workflow: {
      milestone: state.workflow.milestone,
      step: state.workflow.step,
      phase: state.workflow.phase,
    },
    runtime: {
      team: teamRuntime ? teamRuntime.status : 'idle',
      quick: quickSession ? quickSession.status : 'idle',
      handoff: state.handoff.status,
    },
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# SESSIONS\n');
  console.log(`- Milestone: \`${payload.workflow.milestone}\``);
  console.log(`- Step: \`${payload.workflow.step}\``);
  console.log(`- Team runtime: \`${payload.runtime.team}\``);
  console.log(`- Quick runtime: \`${payload.runtime.quick}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
