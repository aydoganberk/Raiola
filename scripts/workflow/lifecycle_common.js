const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowFiles,
  extractBulletItems,
  extractSection,
  getFieldValue,
  listGitChanges,
  parseArgs,
  parseValidationContract,
  read,
  resolveWorkflowRoot,
  tryExtractSection,
  workflowPaths,
  write,
} = require('./common');

function reportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function ensureReportsDir(cwd) {
  fs.mkdirSync(reportsDir(cwd), { recursive: true });
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function safeBulletList(sectionBody, fallback) {
  const items = extractBulletItems(sectionBody);
  return items.length > 0 ? items : [fallback];
}

function baseLifecycleContext(cwd, rootDir) {
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const status = read(paths.status);
  const context = read(paths.context);
  const validation = read(paths.validation);
  const handoff = read(paths.handoff);
  const execplan = read(paths.execplan);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(status, 'Current milestone step') || 'complete').trim();
  const validationRows = parseValidationContract(validation);

  return {
    cwd,
    rootDir,
    paths,
    milestone,
    step,
    workflowRootRelative: relativePath(cwd, rootDir),
    touchedFiles: safeBulletList(tryExtractSection(context, 'Touched Files', ''), 'No touched files recorded'),
    verified: safeBulletList(tryExtractSection(status, 'Verified', ''), 'No verified items recorded'),
    testsRun: safeBulletList(tryExtractSection(status, 'Tests Run', ''), 'No test runs recorded'),
    residualRisks: safeBulletList(tryExtractSection(status, 'Risks', ''), 'No residual risks recorded'),
    nextActions: safeBulletList(tryExtractSection(status, 'Next', ''), 'No next action recorded'),
    openRequirements: safeBulletList(tryExtractSection(execplan, 'Open Requirements', ''), 'No open requirement rows recorded'),
    validationRows,
    handoffNext: safeBulletList(tryExtractSection(handoff, 'Immediate Next Action', ''), 'No handoff action recorded'),
    gitChanges: (() => {
      try {
        return listGitChanges(cwd);
      } catch {
        return [];
      }
    })(),
  };
}

function renderReviewPackage(context) {
  const reviewerChecklist = [
    'Confirm the touched scope matches the user-visible outcome.',
    'Confirm verify commands or manual checks are sufficient for the milestone risk.',
    'Confirm residual risks are explicitly acceptable or have follow-up owners.',
  ];

  return `# REVIEW READY

- Workflow root: \`${context.workflowRootRelative}\`
- Milestone: \`${context.milestone}\`
- Step: \`${context.step}\`

## Milestone Summary

${context.verified.map((item) => `- \`${item}\``).join('\n')}

## Scope And Touched Files

${context.touchedFiles.map((item) => `- \`${item}\``).join('\n')}

## Verification

${context.testsRun.map((item) => `- \`${item}\``).join('\n')}

## Residual Risks

${context.residualRisks.map((item) => `- \`${item}\``).join('\n')}

## Reviewer Checklist

${reviewerChecklist.map((item) => `- \`${item}\``).join('\n')}
`;
}

function renderPrBrief(context) {
  return `# PR BRIEF

## Summary

${context.verified.map((item) => `- \`${item}\``).join('\n')}

## Scope

${context.touchedFiles.map((item) => `- \`${item}\``).join('\n')}

## Verification

${context.testsRun.map((item) => `- \`${item}\``).join('\n')}

## Risks

${context.residualRisks.map((item) => `- \`${item}\``).join('\n')}
`;
}

function renderReleaseNotes(context) {
  return `# RELEASE NOTES DRAFT

## What Changed

${context.verified.map((item) => `- \`${item}\``).join('\n')}

## Migration Notes

- \`No migration note recorded yet; add one if schema/runtime behavior changed.\`

## Rollback Notes

- \`Rollback by reverting the touched scope and re-running the verification contract.\`
`;
}

function renderSessionReport(context) {
  return `# SESSION REPORT

## Completed This Session

${context.verified.map((item) => `- \`${item}\``).join('\n')}

## Remaining

${context.openRequirements.map((item) => `- \`${item}\``).join('\n')}

## Resume Here

${context.handoffNext.map((item) => `- \`${item}\``).join('\n')}

## Risks

${context.residualRisks.map((item) => `- \`${item}\``).join('\n')}

## Verification Status

${context.testsRun.map((item) => `- \`${item}\``).join('\n')}
`;
}

function renderShipPackage(context) {
  const finalChecklist = [
    'PR brief is readable by a reviewer without re-opening all workflow docs.',
    'Release notes and rollback note are explicit enough for handoff.',
    'Remaining risks are known and acceptable for ship-readiness.',
  ];

  return `# SHIP READY

- Workflow root: \`${context.workflowRootRelative}\`
- Milestone: \`${context.milestone}\`
- Step: \`${context.step}\`

## PR Body Draft

${renderPrBrief(context).trim()}

## Release Notes Draft

${renderReleaseNotes(context).trim()}

## Final Checklist

${finalChecklist.map((item) => `- \`${item}\``).join('\n')}
`;
}

function writeReport(cwd, fileName, content) {
  ensureReportsDir(cwd);
  const targetPath = path.join(reportsDir(cwd), fileName);
  write(targetPath, `${content.trimEnd()}\n`);
  return targetPath;
}

function printLifecycleHelp(commandName) {
  console.log(`
${commandName}

Usage:
  node scripts/workflow/${commandName}.js [--root <path>] [--json]
  `);
}

function buildLifecyclePayload(commandName, renderer, fileName) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printLifecycleHelp(commandName);
    return { handled: true };
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const context = baseLifecycleContext(cwd, rootDir);
  const content = renderer(context);
  const outputPath = writeReport(cwd, fileName, content);
  const payload = {
    command: commandName,
    workflowRootRelative: context.workflowRootRelative,
    milestone: context.milestone,
    step: context.step,
    outputPath,
    outputPathRelative: relativePath(cwd, outputPath),
    touchedFiles: context.touchedFiles,
    testsRun: context.testsRun,
    residualRisks: context.residualRisks,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return { handled: true };
  }

  console.log(`# ${commandName.toUpperCase().replace(/_/g, ' ')}\n`);
  console.log(`- Output: \`${payload.outputPathRelative}\``);
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Touched files: \`${payload.touchedFiles.length}\``);
  console.log(`- Verification items: \`${payload.testsRun.length}\``);
  console.log(`- Residual risks: \`${payload.residualRisks.length}\``);
  return { handled: true };
}

module.exports = {
  baseLifecycleContext,
  buildLifecyclePayload,
  renderPrBrief,
  renderReleaseNotes,
  renderReviewPackage,
  renderSessionReport,
  renderShipPackage,
  reportsDir,
};
