const path = require('node:path');
const { parseArgs, readIfExists, resolveWorkflowRoot, tryExtractSection, workflowPaths } = require('./common');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const { readAssumptions } = require('./trust_os');
const { readTableDocument } = require('./roadmap_os');

function printHelp() {
  console.log(`
discuss

Usage:
  node scripts/workflow/discuss.js
  node scripts/workflow/discuss.js --goal "Clarify the next frontend slice"

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --goal <text>     Optional discuss focus or goal override
  --json            Print machine-readable output
  `);
}

function readQuestions(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: ['Id', 'Question', 'Status', 'Opened At', 'Resolution'],
  });
  return table.rows.filter((row) => row[1]);
}

function buildDiscussPayload(cwd, rootDir, args = {}) {
  const paths = workflowPaths(rootDir);
  const status = readIfExists(paths.status) || '';
  const context = readIfExists(paths.context) || '';
  const goal = String(args.goal || '').trim() || String((status.match(/^- Current goal: `(.*)`$/m) || [])[1] || 'Clarify the next safe slice').trim();
  const userIntent = tryExtractSection(context, 'User Intent', '').trim();
  const constraints = tryExtractSection(context, 'Explicit Constraints', '').trim();
  const questions = readQuestions(cwd).slice(0, 8).map((row) => ({
    id: row[0],
    question: row[1],
    status: row[2] || 'open',
  }));
  const assumptions = readAssumptions(cwd).filter((row) => row.status !== 'resolved').slice(0, 8);
  const prompts = [];

  if (questions.length === 0) {
    prompts.push('Capture at least one high-impact open question before leaving discuss.');
  }
  if (assumptions.length === 0) {
    prompts.push('Write one evidence-backed assumption so later corrections stay visible.');
  }
  if (!constraints) {
    prompts.push('Explicit Constraints in CONTEXT.md still look thin.');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'discuss',
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    goal,
    userIntent: userIntent || 'No explicit User Intent section is filled yet.',
    constraints: constraints || 'No explicit constraints were captured yet.',
    questions,
    assumptions,
    prompts,
  };

  const markdown = `# DISCUSS

- Goal: \`${payload.goal}\`
- Root: \`${payload.rootDir}\`

## User Intent

${payload.userIntent}

## Explicit Constraints

${payload.constraints}

## Open Questions

${payload.questions.length > 0
    ? payload.questions.map((row) => `- \`${row.id}\` ${row.question}`).join('\n')
    : '- `No open questions recorded.`'}

## Active Assumptions

${payload.assumptions.length > 0
    ? payload.assumptions.map((row) => `- \`${row.id}\` ${row.assumption}`).join('\n')
    : '- `No active assumptions recorded.`'}

## Discuss Prompts

${payload.prompts.length > 0
    ? payload.prompts.map((item) => `- \`${item}\``).join('\n')
    : '- `Discuss surface looks ready to move forward.`'}
`;

  const jsonPath = writeRuntimeJson(cwd, 'discuss.json', payload);
  const markdownPath = writeRuntimeMarkdown(cwd, 'discuss.md', markdown);
  payload.artifacts = {
    json: path.relative(cwd, jsonPath).replace(/\\/g, '/'),
    markdown: path.relative(cwd, markdownPath).replace(/\\/g, '/'),
  };
  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildDiscussPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DISCUSS\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Questions: \`${payload.questions.length}\``);
  console.log(`- Assumptions: \`${payload.assumptions.length}\``);
  console.log(`- Runtime brief: \`${payload.artifacts.markdown}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildDiscussPayload,
};
