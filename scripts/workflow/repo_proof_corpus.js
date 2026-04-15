const fs = require('node:fs');
const path = require('node:path');
const { buildRepoProof } = require('./repo_proof');
const { renderSummaryMarkdown } = require('./repo_proof_report');

const CORPUS_FIXTURES = Object.freeze([
  {
    slug: 'next-admin-dashboard',
    title: 'Next.js Admin Dashboard Template',
    category: 'next-react-web',
    sourceUrl: 'https://github.com/vercel/nextjs-postgres-nextauth-tailwindcss-template',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/next-admin-dashboard',
    expectations: {
      coverage: ['api', 'frontend'],
      frameworkSignals: ['next-api'],
    },
  },
  {
    slug: 'fastify-starter',
    title: 'Fastify Starter',
    category: 'api-fastify',
    sourceUrl: 'https://github.com/fastify/fastify-starter-codesandbox',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/fastify-starter',
    expectations: {
      coverage: ['api'],
      frameworkSignals: ['fastify'],
    },
  },
  {
    slug: 'react-native-community-template',
    title: 'React Native Community Template',
    category: 'react-native-mobile',
    sourceUrl: 'https://github.com/react-native-community/template',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/react-native-community-template',
    expectations: {
      coverage: ['frontend'],
      frameworkSignals: ['React Native'],
    },
  },
  {
    slug: 'create-t3-turbo',
    title: 'create-t3-turbo',
    category: 'pnpm-turbo-monorepo',
    sourceUrl: 'https://github.com/t3-oss/create-t3-turbo',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/create-t3-turbo',
    expectations: {
      coverage: ['api', 'frontend', 'monorepo'],
      frameworkSignals: ['next-api'],
    },
  },
  {
    slug: 'astral-uv',
    title: 'uv',
    category: 'polyglot-python-rust',
    sourceUrl: 'https://github.com/astral-sh/uv',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/astral-uv',
    expectations: {
      coverage: ['monorepo'],
      frameworkSignals: [],
    },
  },
  {
    slug: 'hono-starter',
    title: 'Hono Starter Templates',
    category: 'api-hono',
    sourceUrl: 'https://github.com/honojs/starter',
    snapshotType: 'curated-reduced-snapshot',
    fixtureDir: 'tests/fixtures/repo_proof_corpus/hono-starter',
    expectations: {
      coverage: ['repo-audit'],
      frameworkSignals: [],
    },
  },
]);

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function buildProofCorpusEntry(repoRoot, entry) {
  const fixturePath = path.join(repoRoot, entry.fixtureDir);
  const proof = buildRepoProof(repoRoot, {
    repo: fixturePath,
    refresh: 'full',
    write: false,
  });
  return {
    ...entry,
    fixturePath,
    proof,
  };
}

function generateProofCorpus(repoRoot, options = {}) {
  const proofsRoot = path.join(repoRoot, 'proofs');
  const generatedAt = new Date().toISOString();
  const entries = CORPUS_FIXTURES.map((entry) => buildProofCorpusEntry(repoRoot, entry));

  if (options.write !== false) {
    for (const entry of entries) {
      const proofDir = path.join(proofsRoot, entry.slug);
      writeJson(path.join(proofDir, 'proof.json'), entry.proof);
      writeText(path.join(proofDir, 'summary.md'), renderSummaryMarkdown(entry.proof));
    }
  }

  const manifest = {
    generatedAt,
    corpusType: 'repo-proof-corpus',
    snapshotStrategy: 'curated-reduced-snapshot',
    repoCount: entries.length,
    entries: entries.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      category: entry.category,
      sourceUrl: entry.sourceUrl,
      snapshotType: entry.snapshotType,
      fixtureDir: entry.fixtureDir,
      proofPath: `proofs/${entry.slug}/proof.json`,
      summaryPath: `proofs/${entry.slug}/summary.md`,
      coverage: entry.proof.coverage,
      overallConfidence: entry.proof.verdict.overallConfidence,
      trustableFindings: entry.proof.verdict.trustableFindings,
      manualVerify: entry.proof.verdict.manualVerify,
      knownLimitations: entry.proof.verdict.knownLimitations,
      findings: {
        verified: entry.proof.audit.verifiedCount,
        probable: entry.proof.audit.probableCount,
        heuristic: entry.proof.audit.heuristicCount,
      },
      expectations: entry.expectations,
    })),
  };

  if (options.write !== false) {
    writeJson(path.join(proofsRoot, 'manifest.json'), manifest);
  }

  return manifest;
}

module.exports = {
  CORPUS_FIXTURES,
  buildProofCorpusEntry,
  generateProofCorpus,
};
