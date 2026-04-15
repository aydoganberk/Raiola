const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const { buildCommandPlan } = require('../scripts/workflow/command_plan');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const largeMonorepoFixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepoFromFixture(fixturePath, prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(fixturePath, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('audit-repo emits repo health, pass order, and prompts for a single-package repo', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-single-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  packageJson.scripts = {
    dev: 'next dev',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, 'src/auth/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'app/api/route.ts', 'export async function GET() { return Response.json({ ok: true }); }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'audit the full repo and plan fixes', '--json'],
    targetRepo,
  ));

  assert.equal(payload.auditType, 'repo-health');
  assert.equal(payload.mode, 'oneshot');
  assert.equal(payload.repoShape, 'single-package');
  assert.ok(payload.findings.verified.length >= 2);
  assert.ok(payload.testGapMatrix.length >= 1);
  assert.ok(payload.suggestedPassOrder.length >= 1);
  assert.match(payload.promptLibrary.oneshot, /repo-health mode/i);
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.markdown)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.prompts)));
});

test('audit-repo ranks monorepo hotspots and emits a correction plan', () => {
  const targetRepo = makeTempRepoFromFixture(largeMonorepoFixture, 'raiola-phase27-mono-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const rootPackageJsonPath = path.join(targetRepo, 'package.json');
  const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  rootPackageJson.scripts = {
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, 2)}\n`);

  writeFile(targetRepo, 'packages/auth/src/permission.ts', 'export function requirePermission() { return true; }\n');
  writeFile(targetRepo, 'packages/data/src/repository.ts', 'export function repository() { return { ok: true }; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'run a full repo audit and fix the highest risk issues', '--json'],
    targetRepo,
  ));

  assert.equal(payload.repoShape, 'monorepo');
  assert.equal(payload.stackPack.id, 'node-monorepo');
  assert.ok(payload.subsystemHeatmap.length >= 3);
  assert.ok(payload.correctionPlan.length >= 1);
  assert.ok(payload.suggestedPassOrder.some((item) => item.area.includes('packages/auth') || item.area.includes('packages/data')));
  assert.match(payload.promptLibrary.correction, /verified findings/i);
});

test('command plan routes full repo review goals into monorepo-mode first for large repos', () => {
  const plan = buildCommandPlan({
    goal: 'run a full repo audit and fix the highest risk issues',
    lane: 'review',
    capability: 'review.deep_review',
    repoSignals: { monorepo: true },
    trust: { verifyNeeded: true },
    profile: { id: 'review-deep' },
  });

  assert.equal(plan.bundleId, 'correction-wave');
  assert.match(plan.primaryCommand, /rai fix --goal/);
  assert.match(plan.resolvedPrimaryCommand, /rai fix --goal/);
  assert.ok(plan.secondaryCommands.some((command) => command.includes('rai monorepo-mode --goal')));
});

test('review no longer flags fcmToken or design tokens as sensitive config changes', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-review-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'src/push.ts', 'export function readToken(value) { return value; }\n');
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline'], targetRepo);

  writeFile(
    targetRepo,
    'src/push.ts',
    'export function readToken(value) { const fcmToken = value.token; const DESIGN_TOKENS = value.designTokens; return { fcmToken, DESIGN_TOKENS }; }\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run('node', [targetBin, 'review', '--json'], targetRepo));

  assert.ok(!payload.findings.some((item) => item.title === 'Sensitive configuration changed'));
});

test('audit-repo runs Flutter/Firebase contract checks for startup, rules, locale parity, and runtime wiring', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-flutter-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  fs.rmSync(packageJsonPath);

  writeFile(
    targetRepo,
    'pubspec.yaml',
    [
      'name: demo_app',
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
      '  firebase_core: ^3.0.0',
      '  firebase_auth: ^5.0.0',
      '  cloud_firestore: ^5.0.0',
      '  flutter_localizations:',
      '    sdk: flutter',
      '  app_links: ^6.0.0',
      '  google_mobile_ads: ^5.0.0',
      '  purchases_flutter: ^8.0.0',
      '',
    ].join('\n'),
  );
  writeFile(targetRepo, 'firebase.json', '{ "project": "demo" }\n');
  writeFile(
    targetRepo,
    'lib/main.dart',
    'import "package:flutter/material.dart";\nvoid main() { runApp(const MyApp()); }\nclass MyApp extends StatelessWidget { const MyApp({super.key}); @override Widget build(BuildContext context) { return const MaterialApp(home: Placeholder()); } }\n',
  );
  writeFile(
    targetRepo,
    'lib/services/subscription_service.dart',
    'class SubscriptionService { void load() { FirebaseFirestore.instance.collection("subscriptions"); } }\n',
  );
  writeFile(
    targetRepo,
    'lib/repositories/user_repository.dart',
    'class UserRepository { void load() { FirebaseFirestore.instance.collection("users"); } }\n',
  );
  writeFile(
    targetRepo,
    'firestore.rules',
    'rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}\n',
  );
  writeFile(targetRepo, 'lib/l10n/app_en.arb', '{ "welcome": "Welcome", "paywallTitle": "Upgrade" }\n');
  writeFile(targetRepo, 'lib/l10n/app_tr.arb', '{ "welcome": "Hos geldin" }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--stack', 'flutter-firebase', '--goal', 'audit the flutter firebase repo deeply', '--json'],
    targetRepo,
  ));

  assert.equal(payload.stackPack.id, 'flutter-firebase');
  assert.ok(payload.stackDiagnostics.summary.some((item) => item.includes('Firebase deps:')));
  assert.ok(payload.findings.verified.some((item) => item.title === 'Firebase dependencies are present but startup does not visibly initialize Firebase'));
  assert.ok(payload.findings.verified.some((item) => item.title === 'Firestore collections used in Dart are missing from firestore.rules'));
  assert.ok(payload.findings.verified.some((item) => item.title === 'Localization keys drift across ARB locales'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'Deep-link packages are declared without a visible startup handler'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'Ads SDK is present without visible initialization'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'Premium or purchase dependencies lack visible runtime wiring'));
  assert.match(payload.promptLibrary.oneshot, /Known contract risks:/);
});

test('audit-repo runs Next.js and React contract checks for auth, client boundaries, routes, and loading states', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-next-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
    'next-auth': '5.0.0',
  };
  packageJson.scripts = {
    dev: 'next dev',
    lint: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, 'app/dashboard/page.tsx', '\'use client\';\nimport { cookies } from "next/headers";\nexport default function Page() { return <main>{cookies().toString()}</main>; }\n');
  writeFile(targetRepo, 'app/api/session/route.ts', 'export async function GET() { return Response.json({ ok: true }); }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--stack', 'next-react', '--goal', 'audit the next react repo deeply', '--json'],
    targetRepo,
  ));

  assert.equal(payload.stackPack.id, 'next-react');
  assert.ok(payload.findings.verified.some((item) => item.title === 'Client components reference server-only runtime APIs'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'Auth dependencies are present without visible route or middleware enforcement'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'Route handlers have no visible owned tests'));
  assert.ok(payload.findings.probable.some((item) => item.title === 'App Router pages lack explicit loading or error states'));
});

test('audit-only verify facade uses repo audit as a soft gate instead of failing on workflow contract gaps alone', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-verify-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, '.github/workflows/ci.yml', 'name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n');
  writeFile(targetRepo, 'package-lock.json', '{ "name": "fixture" }\n');
  writeFile(targetRepo, 'src/index.ts', 'export function add(a, b) { return a + b; }\n');
  writeFile(targetRepo, 'tests/index.test.js', 'import assert from "node:assert/strict";\nassert.equal(1, 1);\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  run('node', [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'audit the repo health only', '--json'], targetRepo);
  const verifyPayload = JSON.parse(run('node', [targetBin, 'verify', '--goal', 'verify the repo health only', '--json'], targetRepo));

  assert.equal(verifyPayload.route, 'verify-work');
  assert.equal(verifyPayload.trustMode, 'audit-only');
  assert.equal(verifyPayload.result.trustMode, 'audit-only');
  assert.ok(!verifyPayload.result.reasons.some((reason) => /Validation contract is empty or missing/i.test(reason)));
  assert.ok(['pass', 'warn'].includes(verifyPayload.result.verdict));
});

test('repo audit applies accepted-risk policy without keeping the same probable finding in the active lane', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-policy-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, '.workflow/config/finding-policy.json', JSON.stringify({
    acceptedRisks: [
      {
        title: 'App Router pages lack explicit loading or error states',
        area: 'app/dashboard/page.tsx',
        reason: 'Temporary acceptance while the page contract is still being redesigned',
      },
    ],
  }, null, 2));
  writeFile(targetRepo, 'app/dashboard/page.tsx', 'export default function Page() { return <main>Dashboard</main>; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--stack', 'next-react', '--goal', 'audit the repo with accepted risk policy', '--json'],
    targetRepo,
  ));

  assert.ok(!payload.findings.probable.some((item) => item.title === 'App Router pages lack explicit loading or error states'));
  assert.ok(payload.policySummary.acceptedRisks.some((item) => item.title === 'App Router pages lack explicit loading or error states'));
});

test('repo audit records finding history across runs', () => {
  const targetRepo = makeTempRepoFromFixture(blankFixture, 'raiola-phase27-history-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  writeFile(targetRepo, 'src/index.ts', 'export const value = 1;\n');
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const firstPayload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'first repo audit history run', '--json'],
    targetRepo,
  ));
  assert.ok(firstPayload.history.introduced.length >= 1);

  writeFile(targetRepo, 'tests/index.test.js', 'import assert from "node:assert/strict";\nassert.equal(1, 1);\n');
  const secondPayload = JSON.parse(run(
    'node',
    [targetBin, 'audit-repo', '--mode', 'oneshot', '--goal', 'second repo audit history run', '--json'],
    targetRepo,
  ));

  assert.ok(secondPayload.history.resolved.some((item) => item.title === 'Repository has executable code but no automated tests'));
  assert.ok(fs.existsSync(path.join(targetRepo, secondPayload.artifacts.history)));
});

test('audit facade routes large repo full-audit requests into monorepo-mode and exposes the fix follow-up', () => {
  const targetRepo = makeTempRepoFromFixture(largeMonorepoFixture, 'raiola-phase27-audit-facade-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  const targetBin = path.join(targetRepo, 'bin', 'rai.js');

  const payload = JSON.parse(run(
    'node',
    [targetBin, 'audit', '--goal', 'bu buyuk monorepoyu full audit et ve en riskli alani sirala', '--json'],
    targetRepo,
  ));

  assert.equal(payload.facade, 'audit');
  assert.equal(payload.route, 'monorepo-mode');
  assert.match(payload.nextCommand, /rai start correction --goal/);
  assert.ok(payload.result.repoAudit);
  assert.equal(payload.result.controlPlane.reviewControlRoom.activeLane, 'large-repo-review');
});

test('monorepo-mode consumes repo-audit prepass and promotes audit-ranked subsystem planning', () => {
  const targetRepo = makeTempRepoFromFixture(largeMonorepoFixture, 'raiola-phase27-merged-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const rootPackageJsonPath = path.join(targetRepo, 'package.json');
  const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  rootPackageJson.scripts = {
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, 2)}\n`);

  writeFile(targetRepo, 'packages/auth/src/session.ts', 'export function getSession() { return "session"; }\n');
  writeFile(targetRepo, 'packages/auth/src/permission.ts', 'export function requirePermission() { return true; }\n');
  writeFile(targetRepo, 'packages/data/src/repository.ts', 'export function repository() { return { ok: true }; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'monorepo-mode', '--goal', 'full repo audit et ve en riskli yerden fix workflow baslat', '--json'],
    targetRepo,
  ));

  assert.ok(payload.repoAudit);
  assert.ok(payload.repoAudit.repoHealth);
  assert.ok(payload.repoAudit.suggestedPassOrder.length >= 1);
  assert.ok(payload.commandPlan.primaryCommand.includes('rai fix --goal'));
  assert.ok(payload.commandPlan.resolvedPrimaryCommand.includes('rai fix --goal'));
  assert.ok(payload.commandPlan.secondaryCommands.some((command) => command.includes('rai monorepo-mode --goal')));
  assert.ok(payload.controlPlane.reviewControlRoom.activeLane === 'large-repo-review');
  assert.ok(fs.existsSync(path.join(targetRepo, payload.files.repoAudit)));
  assert.ok(payload.criticalAreas.some((area) => (area.auditFindings || []).length > 0));
  assert.ok(payload.selectedSubsystem);
});
