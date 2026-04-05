const fs = require('node:fs');
const path = require('node:path');
const {
  buildPacketSnapshot,
  parseArgs,
  resolveWorkflowRoot,
  syncPacketHash,
  workflowPaths,
} = require('./common');
const {
  makeId,
  readJsonFile,
  relativePath,
  writeJsonFile,
} = require('./roadmap_os');

function printHelp() {
  console.log(`
packet

Usage:
  node scripts/workflow/packet.js compile --step plan
  node scripts/workflow/packet.js explain --step execute
  node scripts/workflow/packet.js lock --step audit
  node scripts/workflow/packet.js verify --step audit

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --step <name>       discuss|research|plan|execute|audit|complete
  --doc <name>        context|execplan|validation
  --role <name>       Optional role name for role-aware packet output
  --json              Print machine-readable output
  `);
}

function packetsDir(cwd) {
  return path.join(cwd, '.workflow', 'packets');
}

function lockFile(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'packet-locks.json');
}

function provenanceFile(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'packet-provenance.json');
}

function compilePacket(cwd, rootDir, args) {
  const paths = workflowPaths(rootDir, cwd);
  const packet = buildPacketSnapshot(paths, {
    step: args.step ? String(args.step) : undefined,
    doc: args.doc ? String(args.doc) : undefined,
    includeColdRefs: Boolean(args['include-cold']),
  });
  const role = args.role ? String(args.role) : 'default';
  const packetId = makeId(`packet-${packet.primary.key}-${packet.step}`, role);
  const artifactPath = path.join(packetsDir(cwd), `${packetId}.json`);
  writeJsonFile(artifactPath, {
    ...packet,
    role,
    packetId,
    rootDir: relativePath(cwd, rootDir),
  });
  writeJsonFile(path.join(packetsDir(cwd), 'latest.json'), {
    ...packet,
    role,
    packetId,
    artifact: relativePath(cwd, artifactPath),
  });
  return {
    action: 'compile',
    packetId,
    role,
    artifact: relativePath(cwd, artifactPath),
    packet,
  };
}

function explainPacket(cwd, rootDir, args) {
  const compiled = compilePacket(cwd, rootDir, args);
  return {
    action: 'explain',
    packetId: compiled.packetId,
    role: compiled.role,
    artifact: compiled.artifact,
    summary: {
      primaryDoc: compiled.packet.primary.key,
      step: compiled.packet.step,
      budgetStatus: compiled.packet.budgetStatus,
      omittedRefs: compiled.packet.unchangedSectionRefsOmittedCount + compiled.packet.coldRefsOmittedCount,
      recommendedReadSet: compiled.packet.recommendedReadSet,
    },
  };
}

function lockPacket(cwd, rootDir, args) {
  const compiled = compilePacket(cwd, rootDir, args);
  const locks = readJsonFile(lockFile(cwd), {});
  const key = `${compiled.packet.primary.key}:${compiled.packet.step}:${compiled.role}`;
  locks[key] = {
    packetId: compiled.packetId,
    inputHash: compiled.packet.inputHash,
    storedAt: new Date().toISOString(),
    artifact: compiled.artifact,
  };
  writeJsonFile(lockFile(cwd), locks);
  const provenance = readJsonFile(provenanceFile(cwd), {});
  provenance[compiled.packetId] = {
    role: compiled.role,
    primaryDoc: compiled.packet.primary.key,
    step: compiled.packet.step,
    hash: compiled.packet.inputHash,
    generatedAt: new Date().toISOString(),
    recommendedReadSet: compiled.packet.recommendedReadSet,
  };
  writeJsonFile(provenanceFile(cwd), provenance);
  return {
    action: 'lock',
    key,
    lock: locks[key],
  };
}

function diffPacket(cwd, rootDir, args) {
  const compiled = compilePacket(cwd, rootDir, args);
  const locks = readJsonFile(lockFile(cwd), {});
  const key = `${compiled.packet.primary.key}:${compiled.packet.step}:${compiled.role}`;
  const locked = locks[key] || null;
  return {
    action: 'diff',
    key,
    changed: !locked || locked.inputHash !== compiled.packet.inputHash,
    currentHash: compiled.packet.inputHash,
    lockedHash: locked ? locked.inputHash : null,
    artifact: compiled.artifact,
  };
}

function verifyPacket(cwd, rootDir, args) {
  const diff = diffPacket(cwd, rootDir, args);
  return {
    action: 'verify',
    key: diff.key,
    verdict: diff.changed ? 'warn' : 'pass',
    changed: diff.changed,
    currentHash: diff.currentHash,
    lockedHash: diff.lockedHash,
  };
}

function syncPacket(cwd, rootDir, args) {
  const packet = syncPacketHash(workflowPaths(rootDir, cwd), {
    step: args.step ? String(args.step) : undefined,
    doc: args.doc ? String(args.doc) : undefined,
    includeColdRefs: Boolean(args['include-cold']),
  });
  return {
    action: 'sync',
    step: packet.step,
    primaryDoc: packet.primary.key,
    inputHash: packet.inputHash,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'compile';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = action === 'compile'
    ? compilePacket(cwd, rootDir, args)
    : action === 'explain'
      ? explainPacket(cwd, rootDir, args)
      : action === 'lock'
        ? lockPacket(cwd, rootDir, args)
        : action === 'diff'
          ? diffPacket(cwd, rootDir, args)
          : action === 'verify'
            ? verifyPacket(cwd, rootDir, args)
            : action === 'sync'
              ? syncPacket(cwd, rootDir, args)
              : (() => {
                throw new Error(`Unknown packet action: ${action}`);
              })();
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# PACKET OS\n');
  console.log(`- Action: \`${payload.action}\``);
  if (payload.packetId) {
    console.log(`- Packet: \`${payload.packetId}\``);
  }
  if (payload.key) {
    console.log(`- Key: \`${payload.key}\``);
  }
  if (payload.verdict) {
    console.log(`- Verdict: \`${payload.verdict}\``);
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
