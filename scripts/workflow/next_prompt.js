const path = require('node:path');
const {
  assertWorkflowFiles,
  extractSection,
  getFieldValue,
  parseArgs,
  resolveWorkflowRoot,
  workflowPaths,
} = require('./common');
const { readText: read } = require('./io/files');
const { buildNextPayload } = require('./next_step');
const { writeRuntimeMarkdown } = require('./runtime_helpers');

function printHelp() {
  console.log(`
next_prompt

Usage:
  node scripts/workflow/next_prompt.js

Options:
  --root <path>               Workflow root. Defaults to active workstream root
  --mode <minimal|full>       Prompt density. Defaults to minimal
  --json                      Print machine-readable output
  `);
}

function buildNextPrompt(cwd, rootDir, options = {}) {
  const mode = String(options.mode || 'minimal').trim().toLowerCase() === 'full'
    ? 'full'
    : 'minimal';
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);
  const status = read(paths.status);
  const handoff = read(paths.handoff);
  const validation = read(paths.validation);
  const nextPayload = buildNextPayload(cwd, rootDir);
  const verificationSection = extractSection(validation, 'Validation Core');
  const promptLines = [
    '# NEXT PROMPT',
    '',
    `- Workflow root: \`${path.relative(cwd, rootDir).replace(/\\/g, '/')}\``,
    `- Milestone: \`${nextPayload.milestone}\``,
    `- Step: \`${nextPayload.step}\``,
    `- Plan gate: \`${nextPayload.planGate}\``,
    `- Recommended first command: \`${nextPayload.recommendation.command}\``,
    `- Read first: \`${nextPayload.recommendedReadSet.slice(0, mode === 'full' ? 8 : 4).join(' | ') || 'docs/workflow/HANDOFF.md'}\``,
    `- Open risks: \`${nextPayload.frontend.active ? 'Frontend verification is active' : 'Review HANDOFF.md and VALIDATION.md before execution'}\``,
    `- Handoff anchor: \`${String(getFieldValue(handoff, 'Resume anchor') || 'start').trim()}\``,
    `- Verification status: \`${String(getFieldValue(validation, 'Validation status') || 'planned').trim()}\``,
    '',
    '## Resume',
    '',
    `- ${nextPayload.recommendation.title}`,
    `- ${nextPayload.recommendation.note}`,
  ];

  if (mode === 'full') {
    promptLines.push('');
    promptLines.push('## Checklist');
    promptLines.push('');
    for (const item of nextPayload.recommendation.checklist) {
      promptLines.push(`- ${item}`);
    }
    promptLines.push('');
    promptLines.push('## Verification Core');
    promptLines.push('');
    for (const line of verificationSection.split('\n').map((item) => item.trim()).filter(Boolean)) {
      promptLines.push(line.startsWith('-') ? line : `- ${line}`);
    }
    promptLines.push('');
    promptLines.push('## Status');
    promptLines.push('');
    promptLines.push(`- Context readiness: \`${String(getFieldValue(status, 'Context readiness') || 'unknown').trim()}\``);
    promptLines.push(`- Current phase: \`${String(getFieldValue(status, 'Current phase') || 'unknown').trim()}\``);
  }

  const prompt = `${promptLines.join('\n').trimEnd()}\n`;
  return {
    mode,
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    prompt,
    recommendation: nextPayload.recommendation,
    recommendedReadSet: nextPayload.recommendedReadSet,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildNextPrompt(cwd, rootDir, { mode: args.mode });
  const filePath = writeRuntimeMarkdown(cwd, 'next-prompt.md', payload.prompt);

  if (args.json) {
    console.log(JSON.stringify({
      ...payload,
      filePath: path.relative(cwd, filePath).replace(/\\/g, '/'),
    }, null, 2));
    return;
  }

  process.stdout.write(payload.prompt);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildNextPrompt,
};
