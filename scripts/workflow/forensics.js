const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  buildPacketSnapshot,
  computeWindowStatus,
  currentBranch,
  ensureDir,
  getFieldValue,
  parseArgs,
  read,
  resolveWorkflowRoot,
  runEvidenceChecks,
  slugify,
  today,
  validateValidationContract,
  workflowPaths,
} = require('./common');

function printHelp() {
  console.log(`
forensics

Usage:
  node scripts/workflow/forensics.js

Options:
  --root <path>         Workflow root. Defaults to active workstream root
  --label <text>        Optional report label
  `);
}

function safeGit(cwd, args) {
  try {
    return childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
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

  const label = String(args.label || 'workflow-forensics').trim();
  const forensicsDir = path.join(rootDir, 'forensics');
  ensureDir(forensicsDir);
  const filename = `${today()}-${slugify(label) || 'forensics'}.md`;
  const reportPath = path.join(forensicsDir, filename);
  const status = read(paths.status);
  const execplan = read(paths.execplan);
  const validation = read(paths.validation);
  const context = read(paths.context);
  const packets = [
    buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
  ];
  const windowStatus = computeWindowStatus(paths);
  const evidenceIssues = runEvidenceChecks(paths).filter((item) => item.status !== 'pass');
  const validationIssues = validateValidationContract(paths).filter((item) => item.status !== 'pass');

  const report = `# FORENSICS

- Created: \`${today()}\`
- Label: \`${label}\`
- Root: \`${rootDir}\`
- Branch: \`${currentBranch(cwd)}\`
- Milestone: \`${getFieldValue(status, 'Current milestone') || 'NONE'}\`
- Step: \`${getFieldValue(status, 'Current milestone step') || 'unknown'}\`

## Packet Snapshots

${packets.map((packet) => (
  `- \`${packet.primary.key}\` -> hash=\`${packet.inputHash}\`, stored=\`${packet.storedInputHash || 'missing'}\`, drift=\`${packet.hashDrift ? 'yes' : 'no'}\`, budget=\`${packet.budgetStatus}\``
)).join('\n')}

## Window Snapshot

- \`Decision: ${windowStatus.decision}\`
- \`Recommended action: ${windowStatus.recommendedAction}\`
- \`Remaining budget: ${windowStatus.estimatedRemainingTokens}\`
- \`Can start next chunk: ${windowStatus.canStartNextChunk ? 'yes' : 'no'}\`

## Diff Since Plan

\`\`\`
${safeGit(cwd, ['diff', '--stat'])}
\`\`\`

## STATUS Snapshot

${status.trim()}

## CONTEXT Snapshot

${context.trim()}

## EXECPLAN Snapshot

${execplan.trim()}

## VALIDATION Snapshot

${validation.trim()}

## Git Status

\`\`\`
${safeGit(cwd, ['status', '--short'])}
\`\`\`

## Recent Commits

\`\`\`
${safeGit(cwd, ['log', '--oneline', '-n', '10'])}
\`\`\`

## Likely Hallucination Candidates

${evidenceIssues.length === 0
    ? '- `No obvious hallucination candidates found`'
    : evidenceIssues.map((item) => `- \`${item.kind}: ${item.claim} -> ${item.message}${item.ref ? ` (${item.ref})` : ''}\``).join('\n')}

## Validation Gaps

${validationIssues.length === 0
    ? '- `No validation contract gaps found`'
    : validationIssues.map((item) => `- \`${item.message}\``).join('\n')}

## Suspected Root Causes

- \`If hash drift exists, a stale packet may be in use\`
- \`If budget is warn/critical, a chunk may have been planned that does not fit the window\`
- \`If evidence issues exist, unsupported source-backed claims may be blocking closeout\`

## Recommended Repair Order

1. \`workflow:packet -- --all --sync\`
2. \`workflow:window -- --sync\`
3. \`workflow:evidence-check --strict\`
4. \`workflow:validate-contract --strict\`
5. \`workflow:health -- --strict\`
`;

  fs.writeFileSync(reportPath, report);
  console.log(`Wrote forensics report to ${reportPath}`);
}

main();
