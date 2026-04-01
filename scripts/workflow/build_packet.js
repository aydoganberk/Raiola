const path = require('node:path');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  parseArgs,
  parseWorkstreamTable,
  renderWorkstreamTable,
  replaceSection,
  resolveWorkflowRoot,
  syncPacketHash,
  workflowPaths,
  read,
  write,
} = require('./common');

function printHelp() {
  console.log(`
build_packet

Usage:
  node scripts/workflow/build_packet.js --step plan --json

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --step <name>       Optional. discuss|research|plan|execute|audit|complete
  --doc <name>        Optional. context|execplan|validation
  --sync              Write computed Input hash back to the primary doc
  --all               Sync context, execplan and validation packets together
  --json              Print machine-readable output
  `);
}

function syncAll(paths, step) {
  const targets = [
    { doc: 'context', step: step || 'discuss' },
    { doc: 'execplan', step: step || 'plan' },
    { doc: 'validation', step: step || 'audit' },
  ];

  return targets.map((target) => syncPacketHash(paths, target));
}

function syncRegistry(registryPath, cwd, rootDir, packet) {
  const workstreams = read(registryPath);
  const table = parseWorkstreamTable(workstreams);
  const relativeRoot = path.relative(cwd, rootDir).replace(/\\/g, '/');

  let touched = false;
  table.rows.forEach((row) => {
    if (row.root !== relativeRoot) {
      return;
    }

    row.packetHash = packet.inputHash;
    row.budgetStatus = packet.budgetStatus;
    if (!['pass', 'warn', 'fail', 'pending'].includes(row.health)) {
      row.health = 'pending';
    }
    if (row.root === 'docs/workflow' && (!row.notes || row.notes === '$8')) {
      row.notes = 'Default workflow control plane';
    }
    touched = true;
  });

  if (!touched) {
    return;
  }

  const next = replaceSection(workstreams, 'Workstream Table', renderWorkstreamTable(table.headerLines, table.rows));
  if (next !== workstreams) {
    write(registryPath, next);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const step = args.step ? String(args.step).trim() : undefined;
  const doc = args.doc ? String(args.doc).trim() : undefined;
  const sync = Boolean(args.sync);
  const all = Boolean(args.all);
  const registryPath = path.join(cwd, 'docs', 'workflow', 'WORKSTREAMS.md');

  if (all) {
    const packets = syncAll(paths, step);
    syncRegistry(registryPath, cwd, rootDir, packets.find((item) => item.primary.key === 'execplan') || packets[0]);
    if (args.json) {
      console.log(JSON.stringify(packets, null, 2));
      return;
    }

    console.log(`# PACKET\n`);
    for (const packet of packets) {
      console.log(`- Doc: \`${packet.primary.key}\``);
      console.log(`- Hash: \`${packet.inputHash}\``);
      console.log(`- Tokens: \`${packet.estimatedTotalTokens}\``);
      console.log(`- Budget status: \`${packet.budgetStatus}\``);
    }
    return;
  }

  const packet = sync
    ? syncPacketHash(paths, { step, doc })
    : buildPacketSnapshot(paths, { step, doc });

  if (sync) {
    syncRegistry(registryPath, cwd, rootDir, packet);
  }

  if (args.json) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }

  console.log(`# PACKET\n`);
  console.log(`- Root: \`${path.relative(cwd, rootDir)}\``);
  console.log(`- Step: \`${packet.step}\``);
  console.log(`- Primary doc: \`${packet.primary.key}\``);
  console.log(`- Input hash: \`${packet.inputHash}\``);
  console.log(`- Stored hash: \`${packet.storedInputHash || 'missing'}\``);
  console.log(`- Hash drift: \`${packet.hashDrift ? 'yes' : 'no'}\``);
  console.log(`- Estimated tokens: \`${packet.estimatedTotalTokens}\``);
  console.log(`- Budget status: \`${packet.budgetStatus}\``);
  console.log(`\n## Recommended Read Set\n`);
  if (packet.recommendedReadSet.length === 0) {
    console.log('- `Recommended read set henuz yok`');
  } else {
    for (const item of packet.recommendedReadSet) {
      console.log(`- \`${item}\``);
    }
  }
}

main();
