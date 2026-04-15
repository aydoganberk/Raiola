const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  defaultPolicyDsl,
  ensurePolicyDsl,
  loadPolicyDsl,
  resolveDslDecision,
  valueMatches,
} = require('../scripts/workflow/policy_dsl');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-policy-dsl-resolution-'));
}

test('policy dsl value matching supports wildcard and regex filters', () => {
  assert.equal(valueMatches('src/*', 'src/app.ts'), true);
  assert.equal(valueMatches('/^src\\/.+\\.ts$/', 'src/app.ts'), true);
  assert.equal(valueMatches('/[/', 'src/app.ts'), false);
  assert.equal(valueMatches('SRC', 'src'), true);
});

test('policy dsl bootstrap creates the default rules file on demand', () => {
  const targetRepo = makeTempRepo();
  const filePath = ensurePolicyDsl(targetRepo);
  assert.ok(fs.existsSync(filePath));

  const dsl = loadPolicyDsl(targetRepo);
  assert.equal(dsl.filePath, filePath);
  assert.equal(dsl.content.trim(), defaultPolicyDsl().trim());
  assert.ok(dsl.rules.length >= 3);
  assert.equal(dsl.issues.length, 0);
});

test('policy dsl grants match file, domain, and operation scopes alongside rules', () => {
  const targetRepo = makeTempRepo();
  const workflowDir = path.join(targetRepo, '.workflow');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, 'policy.rules'), [
    'grant src/* reason="source waiver"',
    'grant delete reason="destructive waiver"',
    'grant docs reason="docs waiver"',
    'warn edit when path=/^src\\/.+\\.ts$/ note="Track typed source edits."',
  ].join('\n'));

  const dsl = loadPolicyDsl(targetRepo);
  const sourceDecision = resolveDslDecision(dsl, {
    cwd: targetRepo,
    file: 'src/app.ts',
    path: 'src/app.ts',
    domain: 'src',
    operation: 'edit',
    actor: 'worker',
  });
  assert.equal(sourceDecision.strongestDecision, 'warn');
  assert.equal(sourceDecision.grants.length, 1);
  assert.equal(sourceDecision.grants[0].target, 'src/*');

  const docsDeleteDecision = resolveDslDecision(dsl, {
    cwd: targetRepo,
    file: 'docs/guide.md',
    path: 'docs/guide.md',
    domain: 'docs',
    operation: 'delete',
    actor: 'solo',
  });
  assert.equal(docsDeleteDecision.grants.length, 2);
  assert.deepEqual(
    docsDeleteDecision.grants.map((entry) => entry.target).sort((left, right) => left.localeCompare(right)),
    ['delete', 'docs'],
  );
});
