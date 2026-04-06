const path = require('node:path');
const { parseArgs } = require('./common');
const {
  makeId,
  readTableDocument,
  relativePath,
  writeTableDocument,
} = require('./roadmap_os');

const HEADERS = ['Id', 'Assumption', 'Impact', 'Status', 'Exit Trigger'];

function printHelp() {
  console.log(`
assumptions

Usage:
  node scripts/workflow/assumptions.js
  node scripts/workflow/assumptions.js add "The browser adapter can fall back locally" --impact medium --exit-trigger "Playwright is installed"
  node scripts/workflow/assumptions.js resolve --id assumption-browser

Options:
  --impact <level>         low|medium|high
  --exit-trigger <text>    What should invalidate or close the assumption
  --id <value>             Assumption id for resolve
  --json                   Print machine-readable output
  `);
}

function assumptionsPath(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'ASSUMPTIONS.md');
}

function readAssumptions(cwd) {
  const filePath = assumptionsPath(cwd);
  return {
    filePath,
    ...readTableDocument(filePath, 'Active Assumptions', {
      title: 'ASSUMPTIONS',
      headers: HEADERS,
    }),
  };
}

function addAssumption(cwd, text, impact, exitTrigger) {
  const table = readAssumptions(cwd);
  const row = [
    makeId('assumption', text).slice(0, 24),
    text,
    impact || 'medium',
    'open',
    exitTrigger || '',
  ];
  writeTableDocument(table.filePath, 'ASSUMPTIONS', 'Active Assumptions', HEADERS, [...table.rows, row]);
  return {
    action: 'add',
    file: relativePath(cwd, table.filePath),
    assumption: row,
  };
}

function resolveAssumption(cwd, id) {
  const table = readAssumptions(cwd);
  const rows = table.rows.map((row) => (row[0] === id ? [row[0], row[1], row[2], 'resolved', row[4]] : row));
  writeTableDocument(table.filePath, 'ASSUMPTIONS', 'Active Assumptions', HEADERS, rows);
  return {
    action: 'resolve',
    file: relativePath(cwd, table.filePath),
    id,
    found: rows.some((row) => row[0] === id),
  };
}

function listAssumptions(cwd) {
  const table = readAssumptions(cwd);
  return {
    action: 'list',
    file: relativePath(cwd, table.filePath),
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
    ? addAssumption(
      cwd,
      String(args._.slice(1).join(' ') || args.text || '').trim(),
      args.impact ? String(args.impact).trim() : 'medium',
      args['exit-trigger'] ? String(args['exit-trigger']).trim() : '',
    )
    : action === 'resolve'
      ? resolveAssumption(cwd, String(args.id || '').trim())
      : listAssumptions(cwd);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# ASSUMPTIONS\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- File: \`${payload.file}\``);
  if (payload.assumption) {
    console.log(`- Added: \`${payload.assumption[0]}\``);
  }
  if (payload.rows) {
    for (const row of payload.rows) {
      console.log(`- \`${row[0]}\` ${row[1]} -> \`${row[3] || 'open'}\``);
    }
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
