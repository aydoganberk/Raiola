const path = require('node:path');
const { parseArgs } = require('./common');
const {
  relativePath,
  readTableDocument,
  writeTableDocument,
} = require('./roadmap_os');

const HEADERS = ['Id', 'Question', 'Status', 'Opened At', 'Resolution'];

function printHelp() {
  console.log(`
questions

Usage:
  node scripts/workflow/questions.js
  node scripts/workflow/questions.js add "Why did this route choose deep?"

Options:
  --json            Print machine-readable output
  `);
}

function questionsPath(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
}

function addQuestion(cwd, text) {
  const filePath = questionsPath(cwd);
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: HEADERS,
  });
  const row = [
    `q-${Date.now().toString(36)}`,
    text,
    'open',
    new Date().toISOString(),
    '',
  ];
  const rows = [...table.rows, row];
  writeTableDocument(filePath, 'QUESTIONS', 'Open Questions', HEADERS, rows);
  return {
    action: 'add',
    file: relativePath(cwd, filePath),
    question: row,
  };
}

function listQuestions(cwd) {
  const filePath = questionsPath(cwd);
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: HEADERS,
  });
  return {
    action: 'list',
    file: relativePath(cwd, filePath),
    headers: table.headers,
    rows: table.rows,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'list';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = action === 'add'
    ? addQuestion(cwd, String(args._.slice(1).join(' ') || args.text || '').trim())
    : listQuestions(cwd);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# QUESTIONS\n');
  console.log(`- File: \`${payload.file}\``);
  for (const row of payload.rows || [payload.question]) {
    console.log(`- \`${row[0]}\` ${row[1]} -> \`${row[2]}\``);
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
