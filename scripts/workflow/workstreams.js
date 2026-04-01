const path = require('node:path');
const childProcess = require('node:child_process');
const {
  controlPaths,
  parseArgs,
  parseWorkstreamTable,
  read,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
workstreams

Usage:
  node scripts/workflow/workstreams.js <subcommand>

Subcommands:
  list
  create --name <slug>
  switch --name <slug> [--create]
  status
  progress
  resume
  complete
  `);
}

function runLegacySwitch(argv) {
  childProcess.execFileSync('node', [path.join(__dirname, 'switch_workstream.js'), ...argv], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

function readRegistry() {
  const cwd = process.cwd();
  const registryPath = controlPaths(cwd).workstreams;
  return {
    cwd,
    registryPath,
    content: read(registryPath),
    table: parseWorkstreamTable(read(registryPath)),
  };
}

function printRows(rows) {
  for (const row of rows) {
    console.log(`- \`${row.name}\` -> root=\`${row.root}\`, status=\`${row.status}\`, milestone=\`${row.currentMilestone || 'NONE'}\`, step=\`${row.step || 'unknown'}\`, packet=\`${row.packetHash || 'missing'}\`, budget=\`${row.budgetStatus || 'unknown'}\`, health=\`${row.health || 'pending'}\``);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [subcommand = 'status'] = args._;
  if (args.help || subcommand === 'help') {
    printHelp();
    return;
  }

  if (['create', 'switch'].includes(subcommand)) {
    const passArgs = process.argv.slice(2).filter((item) => item !== subcommand);
    runLegacySwitch(passArgs);
    return;
  }

  const registry = readRegistry();
  const activeRoot = resolveWorkflowRoot(registry.cwd);

  if (subcommand === 'list' || subcommand === 'status' || subcommand === 'progress') {
    console.log(`# WORKSTREAMS\n`);
    console.log(`- Registry: \`${path.relative(registry.cwd, registry.registryPath)}\``);
    console.log(`- Active root: \`${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`\n## Rows\n`);
    printRows(registry.table.rows);
    return;
  }

  if (subcommand === 'resume') {
    const paths = workflowPaths(activeRoot);
    console.log(`# WORKSTREAM RESUME\n`);
    console.log(`- Root: \`${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`- Resume command: \`npm run workflow:resume-work -- --root ${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`- Next command: \`npm run workflow:next -- --root ${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`- Health command: \`npm run workflow:health -- --strict --root ${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`- Files: \`${path.relative(registry.cwd, paths.context)}\`, \`${path.relative(registry.cwd, paths.execplan)}\`, \`${path.relative(registry.cwd, paths.window)}\``);
    return;
  }

  if (subcommand === 'complete') {
    console.log(`# WORKSTREAM COMPLETE\n`);
    console.log(`- Active root: \`${path.relative(registry.cwd, activeRoot)}\``);
    console.log(`- Use: \`npm run workflow:complete-milestone -- --agents-review unchanged --summary "..."\``);
    return;
  }

  throw new Error(`Unknown subcommand: ${subcommand}`);
}

main();
