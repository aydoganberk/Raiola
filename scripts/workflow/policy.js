const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  renderMarkdownTable,
} = require('./common');
const {
  readText: read,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const {
  relativePath,
  readTableDocument,
  writeJsonFile,
} = require('./roadmap_os');
const { loadPolicyDsl, policyDslPath, resolveDslDecision } = require('./policy_dsl');

const DOMAIN_HEADERS = Object.freeze(['Domain', 'Read', 'Edit', 'Delete', 'Move', 'Notes']);
const OPERATION_HEADERS = Object.freeze(['Operation', 'Decision', 'Notes']);
const APPROVAL_HEADERS = Object.freeze(['Target', 'Reason', 'Granted At']);

const DEFAULT_DOMAIN_ROWS = Object.freeze([
  ['docs', 'auto', 'auto', 'warn', 'warn', 'Canonical markdown can change quickly, but destructive edits stay visible.'],
  ['tests', 'auto', 'auto', 'warn', 'warn', 'Test updates are encouraged, but deletions and moves should be explicit.'],
  ['src', 'auto', 'warn', 'human_needed', 'human_needed', 'Source edits are allowed with review; destructive refactors need approval.'],
  ['config', 'auto', 'human_needed', 'block', 'block', 'Config drift can break installs, CI, or routing unexpectedly.'],
  ['infra', 'auto', 'human_needed', 'block', 'human_needed', 'Infra changes can affect deployment or remote environments.'],
  ['migrations', 'auto', 'human_needed', 'block', 'human_needed', 'Schema moves need a deliberate rollout plan and rollback story.'],
  ['secrets', 'human_needed', 'block', 'block', 'block', 'Secrets stay guarded unless a human explicitly approves access.'],
]);

const DEFAULT_OPERATION_ROWS = Object.freeze([
  ['read', 'auto', 'Read-only inspection is safe by default outside secret surfaces.'],
  ['edit', 'warn', 'Edits should stay reviewable and tied to the current scope.'],
  ['delete', 'human_needed', 'Destructive changes require an explicit acknowledgement.'],
  ['move', 'warn', 'Moves can hide churn or break paths and deserve visibility.'],
  ['install', 'human_needed', 'Dependency and tool installs mutate the runtime surface.'],
  ['network', 'human_needed', 'Network access can leak data or mutate remote systems.'],
  ['browser', 'warn', 'Browser verification is allowed, but it should remain intentional and evidence-backed.'],
  ['git', 'warn', 'Git mutations should remain preview-first and rollback-aware.'],
  ['shell', 'warn', 'Shell execution is allowed when bounded and justified by the workflow.'],
]);

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

function canonicalPolicyFile(cwd) {
  return path.join(cwd, 'docs', 'workflow', 'POLICY.md');
}

function runtimePolicyFile(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'policy.json');
}

function approvalsFile(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'approvals.json');
}

function defaultPolicyContent() {
  return [
    '# POLICY',
    '',
    'This document is the canonical workflow policy surface.',
    'Runtime mirrors under `.workflow/runtime/policy.json` and `.workflow/runtime/approvals.json` are derived state only.',
    'Declarative overrides live in `.workflow/policy.rules` and are evaluated before the markdown matrix is applied.',
    '',
    `## Domain Matrix\n${renderMarkdownTable(DOMAIN_HEADERS, DEFAULT_DOMAIN_ROWS)}`,
    '',
    `## Operation Defaults\n${renderMarkdownTable(OPERATION_HEADERS, DEFAULT_OPERATION_ROWS)}`,
    '',
    `## Approval Grants\n${renderMarkdownTable(APPROVAL_HEADERS, [])}`,
  ].join('\n');
}

function ensurePolicyDocument(cwd) {
  const filePath = canonicalPolicyFile(cwd);
  if (!fs.existsSync(filePath)) {
    writeIfChanged(filePath, `${defaultPolicyContent().trimEnd()}\n`);
  }
  return filePath;
}

function normalizeDomainRows(rows) {
  return (rows.length > 0 ? rows : DEFAULT_DOMAIN_ROWS).map((cells) => ([
    String(cells[0] || '').trim(),
    String(cells[1] || '').trim(),
    String(cells[2] || '').trim(),
    String(cells[3] || '').trim(),
    String(cells[4] || '').trim(),
    String(cells[5] || '').trim(),
  ]));
}

function normalizeOperationRows(rows) {
  return (rows.length > 0 ? rows : DEFAULT_OPERATION_ROWS).map((cells) => ([
    String(cells[0] || '').trim(),
    String(cells[1] || '').trim(),
    String(cells[2] || '').trim(),
  ]));
}

function normalizeApprovalRows(rows) {
  return rows
    .map((cells) => ([
      String(cells[0] || '').trim(),
      String(cells[1] || '').trim(),
      String(cells[2] || '').trim(),
    ]))
    .filter((cells) => cells[0] || cells[1] || cells[2]);
}

function writePolicyDocument(cwd, payload) {
  const filePath = canonicalPolicyFile(cwd);
  const content = [
    '# POLICY',
    '',
    'This document is the canonical workflow policy surface.',
    'Runtime mirrors under `.workflow/runtime/policy.json` and `.workflow/runtime/approvals.json` are derived state only.',
    'Declarative overrides live in `.workflow/policy.rules` and are evaluated before the markdown matrix is applied.',
    '',
    `## Domain Matrix\n${renderMarkdownTable(DOMAIN_HEADERS, payload.domainRows)}`,
    '',
    `## Operation Defaults\n${renderMarkdownTable(OPERATION_HEADERS, payload.operationRows)}`,
    '',
    `## Approval Grants\n${renderMarkdownTable(APPROVAL_HEADERS, payload.approvalRows)}`,
  ].join('\n');
  writeIfChanged(filePath, `${content.trimEnd()}\n`);
}

function derivePolicyRuntime(doc, dsl) {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'standard',
    matrix: Object.fromEntries(
      doc.domainRows.map((row) => [
        row[0],
        {
          read: row[1],
          edit: row[2],
          delete: row[3],
          move: row[4],
          notes: row[5],
        },
      ]),
    ),
    operationDefaults: Object.fromEntries(
      doc.operationRows.map((row) => [
        row[0],
        {
          decision: row[1],
          notes: row[2],
        },
      ]),
    ),
    declarative: {
      file: relativePath(path.dirname(path.dirname(path.dirname(doc.filePath))), dsl.filePath),
      ruleCount: dsl.rules.length,
      grantCount: dsl.grants.length,
      issueCount: dsl.issues.length,
    },
  };
}

function deriveApprovalsRuntime(doc, dsl) {
  return {
    generatedAt: new Date().toISOString(),
    grants: [
      ...doc.approvalRows.map((row) => ({ target: row[0], reason: row[1], grantedAt: row[2], source: 'markdown' })),
      ...dsl.grants.map((grant) => ({ target: grant.target, reason: grant.reason, grantedAt: `dsl:line:${grant.line}`, source: 'dsl' })),
    ],
  };
}

function syncRuntimeFromDocument(cwd, doc) {
  const dsl = loadPolicyDsl(cwd);
  const policy = derivePolicyRuntime(doc, dsl);
  const approvals = deriveApprovalsRuntime(doc, dsl);
  writeJsonFile(runtimePolicyFile(cwd), policy);
  writeJsonFile(approvalsFile(cwd), approvals);
  return {
    policy,
    approvals,
    dsl,
  };
}

function readPolicyDocument(cwd) {
  const filePath = ensurePolicyDocument(cwd);
  const domainTable = readTableDocument(filePath, 'Domain Matrix', {
    title: 'POLICY',
    headers: DOMAIN_HEADERS,
  });
  const operationTable = readTableDocument(filePath, 'Operation Defaults', {
    title: 'POLICY',
    headers: OPERATION_HEADERS,
  });
  const approvalsTable = readTableDocument(filePath, 'Approval Grants', {
    title: 'POLICY',
    headers: APPROVAL_HEADERS,
  });
  const doc = {
    filePath,
    content: read(filePath),
    domainRows: normalizeDomainRows(domainTable.rows),
    operationRows: normalizeOperationRows(operationTable.rows),
    approvalRows: normalizeApprovalRows(approvalsTable.rows),
  };
  writePolicyDocument(cwd, doc);
  syncRuntimeFromDocument(cwd, doc);
  return doc;
}

function loadPolicy(cwd) {
  const dsl = loadPolicyDsl(cwd);
  return derivePolicyRuntime(readPolicyDocument(cwd), dsl);
}

function readApprovals(cwd) {
  const dsl = loadPolicyDsl(cwd);
  return deriveApprovalsRuntime(readPolicyDocument(cwd), dsl);
}

function grantApproval(cwd, target, reason) {
  const normalizedTarget = String(target || '').trim();
  const normalizedReason = String(reason || '').trim();
  if (!normalizedTarget) {
    throw new Error('Approval target is required.');
  }
  if (!normalizedReason) {
    throw new Error('Approval reason is required.');
  }
  const doc = readPolicyDocument(cwd);
  const row = [
    normalizedTarget,
    normalizedReason,
    new Date().toISOString(),
  ];
  const next = {
    ...doc,
    approvalRows: [...doc.approvalRows, row],
  };
  writePolicyDocument(cwd, next);
  syncRuntimeFromDocument(cwd, next);
  return {
    action: 'grant',
    file: relativePath(cwd, next.filePath),
    grant: {
      target: row[0],
      reason: row[1],
      grantedAt: row[2],
    },
  };
}

function resolveOperationDefault(policy, operation) {
  return policy.operationDefaults[operation]
    || policy.operationDefaults.edit
    || { decision: operation === 'read' ? 'auto' : 'warn', notes: 'Fallback workflow decision.' };
}

function findMatchingApproval(approvals, filePath, domain, operation) {
  const normalizedPath = String(filePath || '').trim();
  const candidates = new Set([
    normalizedPath,
    domain,
    operation,
    `operation:${operation}`,
    '*',
  ]);
  return approvals.grants.find((grant) => candidates.has(String(grant.target || '').trim())) || null;
}

function applyApproval(decision, approval) {
  if (!approval) {
    return {
      decision,
      approved: false,
    };
  }
  if (decision === 'block') {
    return {
      decision,
      approved: false,
    };
  }
  return {
    decision: 'auto',
    approved: true,
  };
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
  if (mode === 'strict' && ['worker', 'subagent', 'hook', 'mcp'].includes(actor)) {
    if (decision === 'warn') {
      return 'human_needed';
    }
  }
  return decision;
}

function checkPolicy(cwd, args) {
  const policy = loadPolicy(cwd);
  const approvals = readApprovals(cwd);
  const dsl = loadPolicyDsl(cwd);
  const files = String(args.files || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const operation = String(args.operation || 'edit').trim();
  const actor = String(args.actor || 'solo').trim();
  const mode = String(args.mode || policy.mode || 'standard').trim();
  const results = files.map((filePath) => {
    const domain = domainForFile(filePath);
    const dslResolution = resolveDslDecision(dsl, { cwd, file: filePath, path: filePath, domain, operation, actor, mode });
    const domainPolicy = policy.matrix[domain] || {};
    const operationDefault = resolveOperationDefault(policy, operation);
    const markdownDecision = domainPolicy[operation] || operationDefault.decision;
    const rawDecision = dslResolution.strongestDecision || markdownDecision;
    const matchingApproval = dslResolution.grants[0] || findMatchingApproval(approvals, filePath, domain, operation);
    const escalatedDecision = escalate(rawDecision, mode, actor);
    const approvalOutcome = applyApproval(escalatedDecision, matchingApproval);
    return {
      file: filePath,
      domain,
      operation,
      actor,
      decision: approvalOutcome.decision,
      rawDecision,
      markdownDecision,
      rule: dslResolution.strongestRule ? `dsl:line:${dslResolution.strongestRule.line}` : (domainPolicy[operation] ? `domain:${domain}:${operation}` : `operation:${operation}`),
      notes: dslResolution.strongestRule?.note || (domainPolicy[operation] ? domainPolicy.notes || '' : operationDefault.notes || ''),
      approved: approvalOutcome.approved,
      approvalTarget: matchingApproval ? matchingApproval.target : '',
      declarative: dslResolution,
      overrideHint: escalatedDecision === 'block'
        ? 'No override available in-product; change scope or review the policy rules/doc.'
        : `Run rai approvals grant --target ${domain} --reason "Document the approval"`,
    };
  });
  return {
    action: 'check',
    policyFile: relativePath(cwd, runtimePolicyFile(cwd)),
    canonicalFile: relativePath(cwd, canonicalPolicyFile(cwd)),
    declarativeFile: relativePath(cwd, policyDslPath(cwd)),
    declarativeIssues: dsl.issues,
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
  const dsl = loadPolicyDsl(cwd);
  const payload = action === 'check'
    ? checkPolicy(cwd, args)
    : {
      action: 'status',
      policyFile: relativePath(cwd, runtimePolicyFile(cwd)),
      canonicalFile: relativePath(cwd, canonicalPolicyFile(cwd)),
      declarativeFile: relativePath(cwd, policyDslPath(cwd)),
      policy: loadPolicy(cwd),
      approvals: readApprovals(cwd).grants,
      declarative: dsl.rules.map((rule) => ({ line: rule.line, source: rule.source, decision: rule.decision })),
      declarativeIssues: dsl.issues,
    };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# POLICY\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- Canonical file: \`${payload.canonicalFile}\``);
  console.log(`- File: \`${payload.policyFile}\``);
  console.log(`- Declarative rules: \`${payload.declarativeFile || relativePath(cwd, policyDslPath(cwd))}\``);
  console.log(`- Declarative issues: \`${payload.declarativeIssues?.length || 0}\``);
  if (payload.results) {
    for (const row of payload.results) {
      console.log(`- \`${row.file}\` -> \`${row.domain}\` / \`${row.decision}\` via \`${row.rule}\``);
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
  APPROVAL_HEADERS,
  checkPolicy,
  DOMAIN_HEADERS,
  domainForFile,
  grantApproval,
  loadPolicy,
  OPERATION_HEADERS,
  readApprovals,
  readPolicyDocument,
};
