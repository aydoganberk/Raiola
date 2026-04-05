const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  relativePath,
  readTableDocument,
  writeTableDocument,
} = require('./roadmap_os');

const HEADERS = ['Id', 'Claim', 'Status', 'Evidence', 'Rationale'];

function printHelp() {
  console.log(`
claims

Usage:
  node scripts/workflow/claims.js
  node scripts/workflow/claims.js add "Browser smoke passes" --evidence .workflow/verifications/browser/latest/meta.json
  node scripts/workflow/claims.js check
  node scripts/workflow/claims.js trace

Options:
  --evidence <path>   Evidence path for add
  --json              Print machine-readable output
  `);
}

function claimsPath(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'CLAIMS.md');
}

function readClaims(cwd) {
  const filePath = claimsPath(cwd);
  return {
    filePath,
    ...readTableDocument(filePath, 'Claims Ledger', {
      title: 'CLAIMS',
      headers: HEADERS,
    }),
  };
}

function addClaim(cwd, text, evidence, rationale) {
  const table = readClaims(cwd);
  const row = [
    `c-${Date.now().toString(36)}`,
    text,
    evidence ? 'supported' : 'needs_evidence',
    evidence || '',
    rationale || '',
  ];
  const rows = [...table.rows, row];
  writeTableDocument(table.filePath, 'CLAIMS', 'Claims Ledger', HEADERS, rows);
  return {
    action: 'add',
    file: relativePath(cwd, table.filePath),
    claim: row,
  };
}

function checkClaims(cwd) {
  const table = readClaims(cwd);
  const rows = table.rows.map((row) => {
    const evidence = row[3];
    const supported = evidence && fs.existsSync(path.join(cwd, evidence));
    return {
      id: row[0],
      claim: row[1],
      status: supported ? 'supported' : evidence ? 'missing_evidence' : 'needs_evidence',
      evidence,
      rationale: row[4],
    };
  });
  return {
    action: 'check',
    file: relativePath(cwd, table.filePath),
    verdict: rows.some((row) => row.status === 'missing_evidence')
      ? 'warn'
      : rows.some((row) => row.status === 'needs_evidence')
        ? 'inconclusive'
        : 'pass',
    rows,
  };
}

function traceClaims(cwd) {
  const checked = checkClaims(cwd);
  return {
    action: 'trace',
    file: checked.file,
    claims: checked.rows.map((row) => ({
      ...row,
      evidenceExists: row.evidence ? fs.existsSync(path.join(cwd, row.evidence)) : false,
    })),
  };
}

function listClaims(cwd) {
  const table = readClaims(cwd);
  return {
    action: 'list',
    file: relativePath(cwd, table.filePath),
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
    ? addClaim(cwd, String(args._.slice(1).join(' ') || args.text || '').trim(), args.evidence ? String(args.evidence) : '', args.rationale ? String(args.rationale) : '')
    : action === 'check'
      ? checkClaims(cwd)
      : action === 'trace'
        ? traceClaims(cwd)
        : listClaims(cwd);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# CLAIMS\n');
  console.log(`- Action: \`${payload.action}\``);
  if (payload.rows) {
    for (const row of payload.rows) {
      console.log(`- \`${row.id || row[0]}\` ${(row.claim || row[1])} -> \`${row.status || row[2]}\``);
    }
  }
  if (payload.claim) {
    console.log(`- Added: \`${payload.claim[0]}\``);
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

module.exports = {
  checkClaims,
};
