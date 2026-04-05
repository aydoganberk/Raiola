const path = require('node:path');
const {
  controlPaths,
  getFieldValue,
  parseArgs,
  parseWorkstreamTable,
  read,
} = require('./common');

function printHelp() {
  console.log(`
workspaces_center

Usage:
  node scripts/workflow/workspaces_center.js

Options:
  --json            Print machine-readable output
  `);
}

function buildWorkspacePayload(cwd) {
  const workstreams = read(controlPaths(cwd).workstreams);
  const table = parseWorkstreamTable(workstreams);
  const activeRoot = String(getFieldValue(workstreams, 'Active workstream root') || 'docs/workflow').trim();
  const activeName = String(getFieldValue(workstreams, 'Active workstream name') || 'workflow').trim();
  return {
    generatedAt: new Date().toISOString(),
    activeRoot,
    activeName,
    workspaces: table.rows.map((row) => ({
      name: row.name,
      root: row.root,
      status: row.status,
      currentMilestone: row.currentMilestone,
      step: row.step,
      packetHash: row.packetHash,
      budgetStatus: row.budgetStatus,
      health: row.health,
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const payload = buildWorkspacePayload(cwd);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# WORKSPACES\n');
  console.log(`- Active: \`${payload.activeName}\` -> \`${payload.activeRoot}\``);
  console.log('\n## Registry\n');
  for (const workspace of payload.workspaces) {
    console.log(`- \`${workspace.name}\` -> root=\`${workspace.root}\`, status=\`${workspace.status}\`, milestone=\`${workspace.currentMilestone}\`, step=\`${workspace.step}\``);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildWorkspacePayload,
};
