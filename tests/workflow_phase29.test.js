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

const HEALTHY_CASES = [
  {
    fixture: 'healthy-express-api',
    stack: 'express-api',
    blockedTitles: [
      'Express route surfaces have no visible owned tests',
      'Auth-sensitive routes lack visible middleware enforcement',
      'Express API lacks a visible central error handler',
    ],
  },
  {
    fixture: 'healthy-supabase-pg',
    stack: 'supabase-pg',
    blockedTitles: [
      'Data-access surface lacks visible schema or migration files',
      'Schema-bearing data layer has no visible contract tests',
      'Supabase surface has thin visible policy signals',
    ],
  },
  {
    fixture: 'healthy-stripe',
    stack: 'stripe',
    blockedTitles: [
      'Stripe dependency lacks a visible webhook surface',
      'Stripe or billing flows have no visible targeted tests',
      'Webhook routes lack visible event-verification or idempotency signals',
    ],
  },
  {
    fixture: 'healthy-auth',
    stack: 'auth',
    blockedTitles: [
      'Authentication surface has no visible targeted tests',
      'Authentication files have thin visible enforcement signals',
    ],
  },
  {
    fixture: 'healthy-workers-cloudflare',
    stack: 'workers-cloudflare',
    blockedTitles: [
      'Worker entrypoints exist without visible wrangler config',
      'Cloudflare Worker surface has no visible targeted tests',
      'Worker runtime has thin visible observability signals',
    ],
  },
];

for (const fixtureCase of HEALTHY_CASES) {
  test(`healthy fixture ${fixtureCase.stack} avoids stack-specific false positives`, () => {
    const targetRepo = makeTempRepoFromFixture(fixtureCase.fixture);
    run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
    const targetBin = path.join(targetRepo, 'bin', 'rai.js');

    const payload = JSON.parse(run(
      'node',
      [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', `audit the healthy ${fixtureCase.stack} repo`, '--json'],
      targetRepo,
    ));

    const allTitles = [
      ...payload.findings.verified,
      ...payload.findings.probable,
      ...payload.findings.heuristic,
    ].map((item) => item.title);

    assert.equal(payload.stackPack.id, fixtureCase.stack);
    for (const title of fixtureCase.blockedTitles) {
      assert.ok(!allTitles.includes(title), `Did not expect false-positive finding "${title}" in ${fixtureCase.stack}`);
    }
    assert.equal((payload.stackDiagnostics.contractRisks || []).length, 0);
    assert.ok(payload.repoHealth.score >= 70);
  });
}
