const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const initScript = path.join(repoRoot, 'scripts', 'workflow', 'init.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase2-'));
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

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function seedFrontendLikeRepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.scripts = {
    ...packageJson.scripts,
    dev: 'vite',
    build: 'tsc -b && vite build',
    test: 'vitest run',
    lint: 'eslint .',
    typecheck: 'tsc --noEmit',
  };
  packageJson.dependencies = {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  };
  packageJson.devDependencies = {
    tailwindcss: '^4.0.0',
    typescript: '^5.8.0',
    vite: '^6.0.0',
    vitest: '^2.0.0',
    eslint: '^9.0.0',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  writeFile(targetRepo, 'package-lock.json', '{ "name": "workflow-fixture", "lockfileVersion": 3 }');
  writeFile(targetRepo, 'tsconfig.json', JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }, null, 2));
  writeFile(targetRepo, 'vite.config.ts', 'export default {}\n');
  writeFile(targetRepo, 'tailwind.config.ts', 'export default {}\n');
  writeFile(targetRepo, 'components.json', JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json', style: 'default' }, null, 2));
  writeFile(targetRepo, 'src/app.tsx', 'export function App() { return <main>Hello</main>; }\n');
  writeFile(targetRepo, 'src/lib/helpers.ts', 'export const answer = 42;\n');
  writeFile(targetRepo, 'tests/app.test.ts', 'import { describe, it, expect } from "vitest"; describe("app", () => it("works", () => expect(true).toBe(true)));\n');
  writeFile(targetRepo, '.github/workflows/ci.yml', 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n');
}

test('workflow:map-codebase writes incremental lane metadata and detects repo signals', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  seedFrontendLikeRepo(targetRepo);

  const mapScript = path.join(targetRepo, 'scripts', 'workflow', 'map_codebase.js');
  const firstMap = JSON.parse(run('node', [mapScript, '--json'], targetRepo));
  const secondMap = JSON.parse(run('node', [mapScript, '--json'], targetRepo));

  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase-map.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase-map.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'STACK.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'INTEGRATIONS.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'ARCHITECTURE.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'STRUCTURE.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'TESTING.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'codebase', 'CONCERNS.md')));
  assert.equal(firstMap.workflowRootRelative, 'docs/workflow');
  assert.equal(firstMap.scope.kind, 'workstream');
  assert.ok(firstMap.lanes.stack.data.frameworks.includes('react'));
  assert.ok(firstMap.lanes.stack.data.frameworks.includes('tailwind'));
  assert.ok(firstMap.surfaces.integrations.data.integrations.some((item) => item.name === 'GitHub Actions'));
  assert.ok(firstMap.surfaces.integrations.data.integrations.some((item) => item.name === 'Playwright') === false);
  assert.ok(firstMap.lanes.quality.data.verifyScripts.includes('test'));
  assert.ok(firstMap.lanes.quality.data.testFiles.some((filePath) => filePath === 'tests/app.test.ts'));
  assert.equal(secondMap.freshness.refreshStatus, 'reused');
  assert.equal(secondMap.lanes.stack.refreshStatus, 'reused');
});

test('workflow:delegation-plan routes research and execute work predictably', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  seedFrontendLikeRepo(targetRepo);

  const planScript = path.join(targetRepo, 'scripts', 'workflow', 'delegation_plan.js');
  const researchPlan = JSON.parse(run('node', [planScript, '--json', '--intent', 'research', '--activation-text', 'parallel yap, subagent kullan'], targetRepo));
  const executePlan = JSON.parse(run('node', [planScript, '--json', '--intent', 'execute', '--activation-text', 'delegate et', '--write-scope', 'src;tests'], targetRepo));

  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'delegation-plan.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'delegation-plan.md')));
  assert.equal(researchPlan.teamLite.active, true);
  assert.equal(researchPlan.teamLite.activationReason, 'natural_language_trigger');
  assert.equal(researchPlan.intent, 'research');
  assert.equal(researchPlan.waves.length, 2);
  assert.ok(researchPlan.roleCatalog.some((role) => role.role === 'explorer' && role.status === 'assigned'));
  assert.equal(executePlan.intent, 'execute');
  assert.equal(executePlan.blockers.length, 0);
  assert.equal(executePlan.writeScope.disjoint, true);
  assert.ok(executePlan.waves[0].roles.some((role) => role.role === 'worker-1'));
  assert.ok(executePlan.waves[0].roles.some((role) => role.role === 'worker-2'));
});

test('workflow:delegation-plan orchestration runtime coordinates waves and next routes', () => {
  const targetRepo = makeTempRepo();
  run('node', [initScript, '--target', targetRepo], repoRoot);
  seedFrontendLikeRepo(targetRepo);

  const planScript = path.join(targetRepo, 'scripts', 'workflow', 'delegation_plan.js');
  const startState = JSON.parse(run('node', [planScript, '--json', '--start', '--intent', 'research', '--activation-text', 'team mode, parallel yap'], targetRepo));

  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'state.json')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'STATUS.md')));
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'packets', 'wave1-explorer-stack.md')));
  assert.equal(startState.runtime.route.action, 'dispatch_ready_tasks');
  assert.equal(startState.activeWave, 1);

  const waveOneTasks = [
    'wave1-main',
    'wave1-explorer-stack',
    'wave1-explorer-architecture',
    'wave1-explorer-quality',
    'wave1-explorer-risks',
  ];

  for (const taskId of waveOneTasks) {
    run('node', [planScript, '--complete-task', taskId, '--summary', `${taskId} done`], targetRepo);
  }

  const beforeAdvance = JSON.parse(run('node', [planScript, '--json', '--status'], targetRepo));
  assert.equal(beforeAdvance.runtime.route.action, 'advance_wave');

  const advancedState = JSON.parse(run('node', [planScript, '--json', '--advance'], targetRepo));
  assert.equal(advancedState.activeWave, 2);
  assert.equal(advancedState.runtime.route.action, 'dispatch_ready_tasks');
  assert.ok(advancedState.tasks.some((task) => task.id === 'wave2-main' && task.status === 'ready'));

  const startedWaveTwo = JSON.parse(run('node', [planScript, '--json', '--start-task', 'wave2-main'], targetRepo));
  assert.ok(startedWaveTwo.tasks.some((task) => task.id === 'wave2-main' && task.status === 'in_progress'));

  const finishedState = JSON.parse(run('node', [planScript, '--json', '--complete-task', 'wave2-main', '--summary', 'Integrated findings', '--evidence', 'docs/workflow/CONTEXT.md|docs/workflow/VALIDATION.md'], targetRepo));
  assert.equal(finishedState.runtime.route.action, 'orchestration_complete');
  assert.equal(finishedState.runtime.status, 'completed');
  assert.ok(fs.existsSync(path.join(targetRepo, '.workflow', 'orchestration', 'results', 'wave2-main.md')));
});
