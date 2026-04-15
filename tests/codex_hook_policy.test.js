const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const hookScript = path.join(repoRoot, '.codex', 'hooks', 'pre_tool_use_policy.js');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-hook-policy-'));
}

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function runHook(targetRepo, command) {
  const output = childProcess.execFileSync('node', [hookScript], {
    cwd: targetRepo,
    input: JSON.stringify({
      cwd: targetRepo,
      tool_input: { command },
    }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

test('pre-tool hook denies repo-wide mutation when policy keeps a narrow boundary', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-monorepo',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'changed-packages-first',
      roots: ['packages/core'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
    },
  }, null, 2)}\n`);

  const payload = runHook(targetRepo, 'prettier -w docs/README.md');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(payload.systemMessage, /Repo-wide mutation commands are blocked/i);
});

test('pre-tool hook introspects underlying package-manager release scripts before execution', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'hook-fixture',
    scripts: {
      release: 'pnpm publish -r',
    },
  }, null, 2));
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-strict',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'explicit-write-boundary',
      roots: ['apps/web'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
    },
  }, null, 2)}
`);

  const payload = runHook(targetRepo, 'npm run release');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(payload.systemMessage, /underlying npm script release expands to release or publish behavior/i);
});


test('pre-tool hook recursively introspects nested package-manager scripts before execution', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'hook-fixture',
    scripts: {
      ship: 'npm run publish:pkg',
      'publish:pkg': 'pnpm publish -r',
    },
  }, null, 2));
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-strict',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'explicit-write-boundary',
      roots: ['packages/core'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
    },
  }, null, 2)}
`);

  const payload = runHook(targetRepo, 'npm run ship');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(payload.systemMessage, /underlying npm script ship expands to release or publish behavior/i);
});

test('pre-tool hook denies repo-specific denylisted commands and wide execution waves', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-monorepo',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'changed-packages-first',
      roots: ['apps/web', 'apps/mobile', 'apps/api'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
      commandDenylist: ['turbo run release'],
      waveWriteRootThreshold: 2,
    },
  }, null, 2)}
`);

  const denylisted = runHook(targetRepo, 'turbo run release');
  assert.equal(denylisted.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(denylisted.systemMessage, /repo-specific denylist/i);

  const wideWave = runHook(targetRepo, 'cp a apps/web/page.tsx && cp b apps/mobile/home.tsx && cp c apps/api/server.ts');
  assert.equal(wideWave.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(wideWave.systemMessage, /too many package roots for the current execution wave/i);
});

test('pre-tool hook escalates GitHub workflow mutations under strict posture', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-strict',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: false },
    selectionRationale: [],
    writeBoundary: {
      mode: 'explicit-write-boundary',
      roots: ['.github'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 3,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
      ciWorkflowRiskEscalation: true,
    },
  }, null, 2)}
`);

  const payload = runHook(targetRepo, 'cp template.yml .github/workflows/release.yml');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(payload.systemMessage, /GitHub workflow changes are high-risk/i);
});


test('pre-tool hook warns instead of denying repo-wide git staging even when strict posture is active', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-monorepo',
    strict: true,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'changed-packages-first',
      roots: ['scripts', 'tests', 'docs'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
    },
  }, null, 2)}
`);

  const payload = runHook(targetRepo, 'git add -A');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'warn');
  assert.match(payload.systemMessage, /git staging is being allowed with warning/i);
});

test('pre-tool hook explains network-restricted git push explicitly', () => {
  const targetRepo = makeTempRepo();
  writeFile(targetRepo, '.codex/raiola-policy.json', `${JSON.stringify({
    selectedProfile: 'raiola-monorepo',
    strict: false,
    locked: false,
    networkAccess: false,
    repoSignals: { monorepo: true },
    selectionRationale: [],
    writeBoundary: {
      mode: 'changed-packages-first',
      roots: ['scripts', 'tests', 'docs'],
      protectedRoots: ['.git', '.workflow', 'node_modules'],
      allowGeneratedWorkflowWrites: false,
      repoWideChangeThreshold: 8,
    },
    commandPolicy: {
      protectedPaths: ['.git', '.workflow', 'node_modules'],
      explicitWriteBoundaryRequired: true,
      packageManagerIntrospection: true,
      nestedPackageManagerIntrospection: true,
    },
  }, null, 2)}
`);

  const payload = runHook(targetRepo, 'git push origin main');

  assert.equal(payload.hookSpecificOutput.permissionDecision, 'warn');
  assert.match(payload.systemMessage, /needs network access/i);
});
