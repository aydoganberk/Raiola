const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepoFromFixture(fixtureName) {
  const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', fixtureName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `raiola-${fixtureName}-`));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const FIXTURE_CASES = [
  {
    fixture: 'audit-express-api',
    stack: 'express-api',
    goal: 'audit the express api repo deeply',
    expectedTitles: [
      'Express route surfaces have no visible owned tests',
      'Auth-sensitive routes lack visible middleware enforcement',
      'Express API lacks a visible central error handler',
    ],
  },
  {
    fixture: 'audit-supabase-pg',
    stack: 'supabase-pg',
    goal: 'audit the supabase postgres repo deeply',
    expectedTitles: [
      'Schema-bearing data layer has no visible contract tests',
    ],
  },
  {
    fixture: 'audit-stripe',
    stack: 'stripe',
    goal: 'audit the stripe integration repo deeply',
    expectedTitles: [
      'Stripe dependency lacks a visible webhook surface',
      'Stripe or billing flows have no visible targeted tests',
    ],
  },
  {
    fixture: 'audit-auth',
    stack: 'auth',
    goal: 'audit the auth stack deeply',
    expectedTitles: [
      'Authentication surface has no visible targeted tests',
      'Authentication files have thin visible enforcement signals',
    ],
  },
  {
    fixture: 'audit-workers-cloudflare',
    stack: 'workers-cloudflare',
    goal: 'audit the cloudflare workers repo deeply',
    expectedTitles: [
      'Worker entrypoints exist without visible wrangler config',
      'Cloudflare Worker surface has no visible targeted tests',
      'Worker runtime has thin visible observability signals',
    ],
  },
];

for (const fixtureCase of FIXTURE_CASES) {
  test(`fixture audit pack ${fixtureCase.stack} auto-detects and raises the expected contract findings`, () => {
    const targetRepo = makeTempRepoFromFixture(fixtureCase.fixture);
    run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
    const targetBin = path.join(targetRepo, 'bin', 'rai.js');

    const payload = JSON.parse(run(
      'node',
      [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', fixtureCase.goal, '--json'],
      targetRepo,
    ));

    const allTitles = [
      ...payload.findings.verified,
      ...payload.findings.probable,
      ...payload.findings.heuristic,
    ].map((item) => item.title);

    assert.equal(payload.stackPack.id, fixtureCase.stack);
    for (const title of fixtureCase.expectedTitles) {
      assert.ok(allTitles.includes(title), `Expected finding "${title}" in ${fixtureCase.stack}`);
    }
    assert.ok((payload.stackDiagnostics.contractRisks || []).length >= 1);
  });
}
