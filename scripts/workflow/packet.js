const fs = require('node:fs');
const path = require('node:path');
const {
  buildPacketSnapshot,
  extractBulletItems,
  parseArgs,
  resolveWorkflowRoot,
  syncPacketHash,
  tryExtractSection,
  workflowPaths,
} = require('./common');
const { readTextIfExists: readIfExists } = require('./io/files');
const { baseLifecycleContext } = require('./lifecycle_common');
const { buildPackageGraph } = require('./package_graph');
const { latestReviewData, latestVerifyWork, readAssumptions } = require('./trust_os');
const {
  makeId,
  readTableDocument,
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

function contextSummaryFile(cwd) {
  return path.join(packetsDir(cwd), 'latest-context.json');
}

function compactList(items, limit = 6) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function nonPlaceholderItems(items) {
  return (items || []).filter((item) => item && !/^No /i.test(item));
}

function questionRows(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: ['Id', 'Question', 'Status', 'Opened At', 'Resolution'],
  });
  return table.rows
    .map((row) => ({
      id: row[0] || '',
      question: row[1] || '',
      status: row[2] || '',
      resolution: row[4] || '',
    }))
    .filter((row) => row.question);
}

function claimRows(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'CLAIMS.md');
  const table = readTableDocument(filePath, 'Claims Ledger', {
    title: 'CLAIMS',
    headers: ['Id', 'Claim', 'Status', 'Evidence', 'Rationale'],
  });
  return table.rows
    .map((row) => ({
      id: row[0] || '',
      claim: row[1] || '',
      status: row[2] || '',
      evidence: row[3] || '',
    }))
    .filter((row) => row.claim);
}

function buildCompilerSummary(cwd, rootDir, packet, role) {
  const context = baseLifecycleContext(cwd, rootDir);
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const route = readJsonFile(path.join(cwd, '.workflow', 'cache', 'model-routing.json'), {}).lastRecommendation
    || readJsonFile(path.join(cwd, '.workflow', 'runtime', 'do-latest.json'), null);
  const verifyWork = latestVerifyWork(cwd);
  const shipReadiness = readJsonFile(path.join(cwd, '.workflow', 'reports', 'ship-readiness.json'), null);
  const releaseControl = readJsonFile(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null)
    || readJsonFile(path.join(cwd, '.workflow', 'reports', 'release-control.json'), null);
  const review = latestReviewData(cwd);
  const frontendReview = readJsonFile(path.join(cwd, '.workflow', 'runtime', 'frontend-review.json'), null);
  const frontendSpec = readJsonFile(path.join(cwd, '.workflow', 'runtime', 'frontend-spec.json'), null);
  const assumptions = readAssumptions(cwd).filter((item) => !/closed/i.test(item.status || ''));
  const questions = questionRows(cwd).filter((item) => !/resolved/i.test(item.status || ''));
  const claims = claimRows(cwd);
  const handoffContent = readIfExists(path.join(rootDir, 'HANDOFF.md')) || '';
  const resumeHere = extractBulletItems(tryExtractSection(handoffContent, 'Immediate Next Action', ''));
  const taskBrief = compactList([
    route?.goal,
    ...resumeHere,
    ...nonPlaceholderItems(context.nextActions),
  ], 3);
  const evidenceSlots = compactList([
    ...context.validationRows.flatMap((row) => [row.deliverable, row.evidence, row.verify_command, row.manual_check]),
    ...claims.map((row) => row.evidence),
    ...review.findings.slice(0, 4).map((finding) => `${finding.file}:${finding.category}`),
  ], 10);
  const verificationChecklist = compactList([
    ...(route?.verificationPlan || []),
    ...nonPlaceholderItems(context.testsRun),
    ...(verifyWork?.manualChecks || []).map((item) => `${item.status}: ${item.label}`),
    ...(shipReadiness?.nextActions || []),
  ], 10);
  const activeRisks = compactList([
    ...nonPlaceholderItems(context.residualRisks),
    ...review.blockers.slice(0, 4).map((finding) => `${finding.category}: ${finding.title}`),
    ...((shipReadiness?.reasons) || []),
  ], 10);

  return {
    generatedAt: new Date().toISOString(),
    role,
    taskBrief,
    workflow: {
      milestone: context.milestone,
      step: context.step,
      rootDir: context.workflowRootRelative,
      routeCapability: route?.recommendedCapability || route?.capability || 'n/a',
    },
    packet: {
      id: packet.packetId || null,
      primaryDoc: packet.primary.key,
      step: packet.step,
      budgetStatus: packet.budgetStatus,
      packetLoadingMode: packet.packetLoadingMode,
      estimatedTotalTokens: packet.estimatedTotalTokens,
      recommendedReadSet: packet.recommendedReadSet.slice(0, 10),
      openRequirementIds: packet.openRequirementIds.slice(0, 10),
      activeValidationIds: packet.activeValidationIds.slice(0, 10),
    },
    scope: {
      touchedFiles: nonPlaceholderItems(context.touchedFiles).slice(0, 10),
      changedPackages: (packageGraph.changedPackages || []).slice(0, 10),
      impactedPackages: (packageGraph.impactedPackages || []).slice(0, 10),
      impactedTests: (packageGraph.impactedTests || []).slice(0, 10),
    },
    context: {
      openQuestions: questions.slice(0, 10),
      assumptions: assumptions.slice(0, 10),
      claims: claims.slice(0, 10),
      evidenceSlots,
      verificationChecklist,
      activeRisks,
    },
    review: {
      findingCount: review.findings.length,
      blockerCount: review.blockers.length,
      blockerTitles: review.blockers.slice(0, 6).map((finding) => finding.title),
    },
    frontend: frontendReview || frontendSpec
      ? {
        scorecard: frontendReview?.scorecard || null,
        accessibility: frontendReview?.accessibilityAudit || frontendSpec?.accessibilityAudit || null,
        journey: frontendReview?.journeyAudit || frontendSpec?.journeyAudit || null,
        debtCount: frontendReview?.debt?.length || 0,
      }
      : null,
    trust: {
      verifyWorkVerdict: verifyWork?.verdict || 'n/a',
      verifyWorkReasons: (verifyWork?.reasons || []).slice(0, 6),
      verifyQueueCount: releaseControl?.verifyStatusBoard?.queuedForVerifyCount || 0,
      shipVerdict: shipReadiness?.verdict || releaseControl?.shipReadinessBoard?.verdict || 'n/a',
      shipBlockerCount: releaseControl?.shipReadinessBoard?.shipBlockerCount || 0,
      pendingApprovalCount: shipReadiness?.approvalPlan?.pending?.length || releaseControl?.shipReadinessBoard?.pendingApprovalCount || 0,
    },
  };
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
  const compilerSummary = buildCompilerSummary(cwd, rootDir, {
    ...packet,
    packetId,
  }, role);
  writeJsonFile(artifactPath, {
    ...packet,
    role,
    packetId,
    rootDir: relativePath(cwd, rootDir),
    compilerSummary,
  });
  writeJsonFile(path.join(packetsDir(cwd), 'latest.json'), {
    ...packet,
    role,
    packetId,
    artifact: relativePath(cwd, artifactPath),
    compilerSummary,
  });
  writeJsonFile(contextSummaryFile(cwd), compilerSummary);
  return {
    action: 'compile',
    packetId,
    role,
    artifact: relativePath(cwd, artifactPath),
    packet,
    compilerSummary,
    contextArtifact: relativePath(cwd, contextSummaryFile(cwd)),
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
    compilerSummary: compiled.compilerSummary,
    contextArtifact: compiled.contextArtifact,
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
  if (payload.contextArtifact) {
    console.log(`- Context summary: \`${payload.contextArtifact}\``);
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
