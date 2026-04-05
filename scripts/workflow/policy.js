const path = require('node:path');
const { parseArgs } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');

const DEFAULT_POLICY = Object.freeze({
  generatedAt: null,
  mode: 'standard',
  matrix: {
    docs: { edit: 'auto', delete: 'warn' },
    tests: { edit: 'auto', delete: 'warn' },
    src: { edit: 'warn', delete: 'human_needed' },
    config: { edit: 'human_needed', delete: 'block' },
    infra: { edit: 'human_needed', delete: 'block' },
    migrations: { edit: 'human_needed', delete: 'block' },
    secrets: { edit: 'block', delete: 'block' },
  },
});

function printHelp() {
  console.log(`
policy

Usage:
  node scripts/workflow/policy.js
  node scripts/workflow/policy.js check --files src/index.js --operation edit --actor worker

Options:
  --files <a;b>      Semicolon-separated file list
  --operation <op>   read|edit|delete|move|install|network|browser|git|shell
  --actor <type>     solo|worker|subagent|hook|mcp
  --mode <name>      strict|standard|open
  --json             Print machine-readable output
  `);
}

function policyFile(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'policy.json');
}

function loadPolicy(cwd) {
  const current = readJsonFile(policyFile(cwd), null);
  if (current) {
    return current;
  }
  const seeded = {
    ...DEFAULT_POLICY,
    generatedAt: new Date().toISOString(),
  };
  writeJsonFile(policyFile(cwd), seeded);
  return seeded;
}

function domainForFile(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  if (/secret|token|credential|\.env/.test(normalized)) {
    return 'secrets';
  }
  if (/migrat/.test(normalized)) {
    return 'migrations';
  }
  if (/infra|terraform|deploy|docker|k8s/.test(normalized)) {
    return 'infra';
  }
  if (/config|package\.json|\.github\//.test(normalized)) {
    return 'config';
  }
  if (/test/.test(normalized)) {
    return 'tests';
  }
  if (/docs\//.test(normalized) || /\.md$/.test(normalized)) {
    return 'docs';
  }
  return 'src';
}

function escalate(decision, mode, actor) {
  if (mode === 'open') {
    return decision === 'block' ? 'human_needed' : 'auto';
  }
  if (mode === 'strict' && actor === 'worker') {
    if (decision === 'warn') {
      return 'human_needed';
    }
  }
  return decision;
}

function checkPolicy(cwd, args) {
  const policy = loadPolicy(cwd);
  const files = String(args.files || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const operation = String(args.operation || 'edit').trim();
  const actor = String(args.actor || 'solo').trim();
  const mode = String(args.mode || policy.mode || 'standard').trim();
  const results = files.map((filePath) => {
    const domain = domainForFile(filePath);
    const domainPolicy = policy.matrix[domain] || {};
    const rawDecision = domainPolicy[operation] || (operation === 'read' ? 'auto' : 'warn');
    return {
      file: filePath,
      domain,
      operation,
      actor,
      decision: escalate(rawDecision, mode, actor),
    };
  });
  return {
    action: 'check',
    policyFile: relativePath(cwd, policyFile(cwd)),
    mode,
    results,
    verdict: results.some((item) => item.decision === 'block')
      ? 'fail'
      : results.some((item) => item.decision === 'human_needed')
        ? 'warn'
        : 'pass',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const payload = action === 'check'
    ? checkPolicy(cwd, args)
    : {
      action: 'status',
      policyFile: relativePath(cwd, policyFile(cwd)),
      policy: loadPolicy(cwd),
    };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# POLICY\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- File: \`${payload.policyFile}\``);
  if (payload.results) {
    for (const row of payload.results) {
      console.log(`- \`${row.file}\` -> \`${row.domain}\` / \`${row.decision}\``);
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

module.exports = {
  checkPolicy,
  domainForFile,
  loadPolicy,
};
