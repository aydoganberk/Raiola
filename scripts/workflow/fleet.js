const { parseArgs } = require('./common');
const { buildWorkspacePayload } = require('./workspaces_center');
const { buildBaseState } = require('./state_surface');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/fleet.js status [--json]');
    return;
  }
  const cwd = process.cwd();
  const workspaces = buildWorkspacePayload(cwd);
  const state = buildBaseState(cwd, require('./common').resolveWorkflowRoot(cwd));
  const payload = {
    action: 'status',
    repoRoot: cwd,
    activeMilestone: state.workflow.milestone,
    step: state.workflow.step,
    workspaceCount: workspaces.workspaces.length,
    workspaces: workspaces.workspaces,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# FLEET\n');
  console.log(`- Active milestone: \`${payload.activeMilestone}\``);
  console.log(`- Workspaces: \`${payload.workspaceCount}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
