const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { buildRepoProof } = require('../scripts/workflow/repo_proof');
const { CORPUS_FIXTURES } = require('../scripts/workflow/repo_proof_corpus');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'proofs', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const manifestEntries = new Map(manifest.entries.map((entry) => [entry.slug, entry]));

function buildFixtureProof(entry) {
  return buildRepoProof(REPO_ROOT, {
    repo: path.join(REPO_ROOT, entry.fixtureDir),
    refresh: 'full',
    write: false,
  });
}

test('repo proof corpus manifest stays aligned with fixture list', () => {
  assert.equal(manifest.corpusType, 'repo-proof-corpus');
  assert.equal(manifest.snapshotStrategy, 'curated-reduced-snapshot');
  assert.equal(manifest.repoCount, CORPUS_FIXTURES.length);
  assert.deepEqual(
    manifest.entries.map((entry) => entry.slug).sort(),
    CORPUS_FIXTURES.map((entry) => entry.slug).sort(),
  );
});

for (const entry of CORPUS_FIXTURES) {
  test(`repo proof corpus builds ${entry.slug} without crashing and preserves key expectations`, () => {
    const proof = buildFixtureProof(entry);
    const storedProof = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'proofs', entry.slug, 'proof.json'), 'utf8'));
    const manifestEntry = manifestEntries.get(entry.slug);

    assert.ok(proof.generatedAt);
    assert.ok(proof.verdict);
    assert.ok(Array.isArray(proof.verdict.trustableFindings));
    assert.ok(Array.isArray(proof.verdict.manualVerify));
    assert.ok(Array.isArray(proof.verdict.knownLimitations));

    for (const coverage of entry.expectations.coverage) {
      assert.ok(proof.coverage.includes(coverage), `${entry.slug} should include coverage ${coverage}`);
    }

    assert.deepEqual(storedProof.coverage, proof.coverage);
    assert.equal(storedProof.verdict.overallConfidence, proof.verdict.overallConfidence);
    assert.deepEqual(manifestEntry.coverage, proof.coverage);
    assert.equal(manifestEntry.overallConfidence, proof.verdict.overallConfidence);
  });
}

test('next-admin-dashboard keeps web + api evidence', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'next-admin-dashboard'));
  assert.ok(proof.apiSurface.frameworks.includes('next-api'));
  assert.equal(proof.frontend.framework, 'Next');
  assert.equal(proof.frontend.hasProofHarness, false);
});

test('fastify-starter keeps Fastify API signal', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'fastify-starter'));
  assert.ok(proof.apiSurface.frameworks.includes('fastify'));
  assert.equal(proof.apiSurface.endpointCount, 3);
});

test('react-native-community-template keeps mobile frontend signal and surfaces monorepo overreach as a limitation', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'react-native-community-template'));
  assert.equal(proof.frontend.framework, 'React Native');
  assert.ok(proof.coverage.includes('frontend'));
  assert.ok(proof.coverage.includes('monorepo'));
});

test('create-t3-turbo keeps combined monorepo proof pack coverage', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'create-t3-turbo'));
  assert.ok(proof.coverage.includes('api'));
  assert.ok(proof.coverage.includes('frontend'));
  assert.ok(proof.coverage.includes('monorepo'));
  assert.ok(proof.repoTruth.workspaceCount >= 3);
  assert.equal(proof.frontend.framework, 'Expo');
  assert.equal(proof.frontend.routing, 'Next App Router');
});

test('astral-uv keeps the polyglot rust workspace signal but still undercounts python evidence', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'astral-uv'));
  assert.ok(proof.coverage.includes('monorepo'));
  assert.ok(proof.repoTruth.ecosystems.includes('rust'));
  assert.ok(!proof.repoTruth.ecosystems.includes('python'));
  assert.equal(proof.verdict.overallConfidence, 'medium');
});

test('hono-starter remains an explicit low-confidence false negative', () => {
  const proof = buildFixtureProof(CORPUS_FIXTURES.find((entry) => entry.slug === 'hono-starter'));
  assert.deepEqual(proof.coverage, ['repo-audit']);
  assert.equal(proof.verdict.overallConfidence, 'low');
  assert.equal(proof.apiSurface.endpointCount, 0);
});
