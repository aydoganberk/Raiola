const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { deriveNativePolicy } = require('../scripts/workflow/codex_native');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

function makeTempRepo(prefix = 'raiola-native-policy-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('deriveNativePolicy chooses monorepo profile from repo truth plus task signals', () => {
  const targetRepo = makeTempRepo('raiola-native-monorepo-');
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'polyglot-fixture',
    private: true,
    workspaces: ['packages/*'],
    scripts: { test: 'vitest run' },
  }, null, 2));
  writeFile(targetRepo, 'go.work', 'go 1.22\nuse ./services/go-api\n');
  writeFile(targetRepo, 'packages/core/package.json', JSON.stringify({ name: '@fixture/core' }, null, 2));
  writeFile(targetRepo, 'services/go-api/go.mod', 'module example.com/go-api\n');
  writeFile(targetRepo, 'CODEOWNERS', [
    '/packages/core @team-core',
    '/services/go-api @team-go',
    '',
  ].join('\n'));

  const policy = deriveNativePolicy(targetRepo, {
    goal: 'stabilize monorepo workflow in Codex',
  });

  assert.ok(['raiola-monorepo', 'raiola-strict'].includes(policy.selectedProfile));
  assert.equal(policy.profileBehavior.writeScopeMode, 'changed-packages-first');
  assert.equal(policy.verifyContract.mode, 'package-contract-first');
  assert.ok(policy.verifyContract.requiredCommands.includes('go test ./...'));
  assert.ok(policy.verifyContract.requiredCommands.includes('rai audit-repo --mode oneshot --json'));
  assert.deepEqual(policy.writeBoundary.roots, ['packages/core', 'services/go-api']);
  assert.ok(Array.isArray(policy.verifyContract.packageVerificationMatrix));
  assert.ok(policy.verifyContract.packageVerificationMatrix.some((entry) => entry.root === 'services/go-api' && entry.lane === 'go-contract'));
  assert.ok(policy.verifyContract.matrixSummary.lanes.includes('go-contract'));
  assert.ok(policy.selectionRationale.some((entry) => /monorepo\/package graph/i.test(entry)));
});

test('deriveNativePolicy keeps frontend work on a frontend-specific profile when risk stays bounded', () => {
  const targetRepo = makeTempRepo('raiola-native-frontend-');
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'frontend-fixture',
    private: true,
    dependencies: { next: '15.0.0' },
  }, null, 2));
  writeFile(targetRepo, 'app/layout.tsx', 'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main>Hello</main>; }\n');

  const policy = deriveNativePolicy(targetRepo, {
    goal: 'debug frontend browser interaction',
  });

  assert.equal(policy.selectedProfile, 'raiola-frontend');
  assert.equal(policy.verifyContract.browserProofPreferred, true);
  assert.equal(policy.profileBehavior.verifyMode, 'browser-proof-preferred');
  assert.ok(policy.selectionRationale.some((entry) => /frontend\/browser/i.test(entry)));
});

test('deriveNativePolicy builds package-aware verify contracts for hybrid turborepo surfaces', () => {
  const targetRepo = makeMezatLikeRepo('raiola-native-hybrid-');

  const policy = deriveNativePolicy(targetRepo, {
    goal: 'stabilize turborepo workflow across web mobile and api packages',
  });

  assert.equal(policy.selectedProfile, 'raiola-monorepo');
  assert.equal(policy.verifyContract.mode, 'package-contract-first');
  assert.ok(policy.writeBoundary.roots.includes('apps/web'));
  assert.ok(policy.writeBoundary.roots.includes('apps/mobile'));
  assert.ok(policy.writeBoundary.roots.includes('apps/api'));
  assert.ok(policy.verifyContract.requiredCommands.includes('rai api-surface --json'));
  assert.ok(Array.isArray(policy.verifyContract.packageContracts));
  assert.ok(policy.verifyContract.packageContracts.some((entry) => entry.root === 'apps/web' && entry.lane === 'web-proof'));
  assert.ok(policy.verifyContract.packageContracts.some((entry) => entry.root === 'apps/mobile' && entry.lane === 'mobile-surface'));
  assert.ok(policy.verifyContract.packageContracts.some((entry) => entry.root === 'apps/api' && entry.lane === 'api-contract'));
  assert.ok(Array.isArray(policy.verifyContract.packageVerificationMatrix));
  assert.ok(policy.verifyContract.matrixSummary.packageCount >= 3);
  assert.ok(policy.verifyContract.matrixSummary.lanes.includes('web-proof'));
  assert.ok(policy.verifyContract.matrixSummary.lanes.includes('api-contract'));
});


test('deriveNativePolicy prefers source-repo roots when workspace discovery is dominated by fixtures', () => {
  const targetRepo = makeTempRepo('raiola-native-source-boundary-');
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'source-repo-fixture',
    private: true,
    workspaces: ['tests/fixtures/repo_proof_corpus/*'],
  }, null, 2));
  writeFile(targetRepo, 'scripts/workflow/index.js', 'module.exports = {}\n');
  writeFile(targetRepo, 'docs/README.md', '# docs\n');
  writeFile(targetRepo, 'tests/fixtures/repo_proof_corpus/alpha/package.json', JSON.stringify({ name: '@fixture/alpha' }, null, 2));
  writeFile(targetRepo, 'tests/fixtures/repo_proof_corpus/beta/package.json', JSON.stringify({ name: '@fixture/beta' }, null, 2));

  const policy = deriveNativePolicy(targetRepo, {
    goal: 'maintain the product source repo scripts and docs',
  });

  assert.ok(['raiola-monorepo', 'raiola-strict'].includes(policy.selectedProfile));
  assert.ok(policy.writeBoundary.roots.includes('scripts'));
  assert.ok(policy.writeBoundary.roots.includes('tests'));
  assert.ok(policy.writeBoundary.roots.includes('docs'));
  assert.ok(policy.writeBoundary.roots.every((root) => !root.startsWith('tests/fixtures/repo_proof_corpus/')));
});
