const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  loadPolicyDsl,
  parseRuleLine,
  resolveDslDecision,
  tokenize,
} = require('../scripts/workflow/policy_dsl');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-policy-dsl-'));
}

test('policy dsl tokenization and parsing preserve quoted notes', () => {
  const line = 'warn edit when domain=src and actor=worker note="Keep source edits reviewable."';
  assert.deepEqual(tokenize(line), [
    'warn',
    'edit',
    'when',
    'domain=src',
    'and',
    'actor=worker',
    'note="Keep source edits reviewable."',
  ]);

  const parsed = parseRuleLine(line, 0);
  assert.equal(parsed.type, 'rule');
  assert.equal(parsed.decision, 'warn');
  assert.equal(parsed.operation, 'edit');
  assert.deepEqual(parsed.filters, {
    domain: 'src',
    actor: 'worker',
  });
  assert.equal(parsed.note, 'Keep source edits reviewable.');
});

test('policy dsl keeps malformed directives visible as issues instead of silently dropping them', () => {
  const targetRepo = makeTempRepo();
  const workflowDir = path.join(targetRepo, '.workflow');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, 'policy.rules'), [
    'warn edit when domain=src and ??? note="Review source edits."',
    'bogus whatever',
    'block edit when actor=worker and domain=src note="Workers cannot edit source directly."',
  ].join('\n'));

  const dsl = loadPolicyDsl(targetRepo);
  assert.equal(dsl.rules.length, 2);
  assert.equal(dsl.issues.length, 2);
  assert.match(dsl.issues[0].reason, /malformed condition token/i);
  assert.match(dsl.issues[1].reason, /unknown policy directive/i);

  const resolution = resolveDslDecision(dsl, {
    cwd: targetRepo,
    file: 'src/index.ts',
    path: 'src/index.ts',
    domain: 'src',
    operation: 'edit',
    actor: 'worker',
  });
  assert.equal(resolution.strongestDecision, 'block');
  assert.equal(resolution.issues.length, 2);
});

test('policy dsl prefers the strongest matching rule over weaker defaults', () => {
  const targetRepo = makeTempRepo();
  const workflowDir = path.join(targetRepo, '.workflow');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, 'policy.rules'), [
    'warn edit when domain=src note="Source edits are visible."',
    'require_approval edit when actor=worker and domain=src note="Workers need approval."',
    'block edit when path=package.json note="Package manifest edits stay blocked."',
  ].join('\n'));

  const dsl = loadPolicyDsl(targetRepo);
  const workerResolution = resolveDslDecision(dsl, {
    cwd: targetRepo,
    file: 'src/app.ts',
    path: 'src/app.ts',
    domain: 'src',
    operation: 'edit',
    actor: 'worker',
  });
  assert.equal(workerResolution.strongestDecision, 'human_needed');
  assert.equal(workerResolution.matchedRules.length, 2);

  const packageResolution = resolveDslDecision(dsl, {
    cwd: targetRepo,
    file: 'package.json',
    path: 'package.json',
    domain: 'config',
    operation: 'edit',
    actor: 'worker',
  });
  assert.equal(packageResolution.strongestDecision, 'block');
  assert.equal(packageResolution.strongestRule.line, 3);
});
