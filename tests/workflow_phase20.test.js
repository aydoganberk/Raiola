const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const cwfBin = path.join(repoRoot, 'bin', 'cwf.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase20-'));
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

function seedFrontendRepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.dependencies = {
    next: '15.0.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
  };
  packageJson.devDependencies = {
    tailwindcss: '4.0.0',
  };
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
    build: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(targetRepo, 'components.json', '{ "style": "default" }\n');
  writeFile(targetRepo, 'app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n');
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><h1>Dashboard</h1></main>; }\n');
  writeFile(targetRepo, 'components/MetricCard.tsx', 'export function MetricCard() { return <section>Metric</section>; }\n');
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main><h1>Preview</h1></main></body></html>\n');
}

function seedMonorepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.private = true;
  packageJson.workspaces = ['packages/*'];
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const packages = [
    { name: 'app-one', deps: {} },
    { name: 'app-two', deps: { '@mono/app-one': '1.0.0' } },
    { name: 'app-three', deps: { '@mono/app-two': '1.0.0' } },
  ];

  for (const pkg of packages) {
    const pkgDir = path.join(targetRepo, 'packages', pkg.name);
    fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify({
      name: `@mono/${pkg.name}`,
      private: true,
      scripts: {
        test: 'node -e "process.exit(0)"',
        lint: 'node -e "process.exit(0)"',
      },
      dependencies: pkg.deps,
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(pkgDir, 'src', 'index.ts'), `export const ${pkg.name.replace(/-/g, '')} = true;\n`);
  }
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('ui-direction accepts explicit taste profiles and exports richer design signals', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const direction = JSON.parse(run(
    'node',
    [targetBin, 'ui-direction', '--goal', 'premium minimal analytics dashboard', '--taste', 'premium-minimal', '--json'],
    targetRepo,
  ));
  const spec = JSON.parse(run(
    'node',
    [targetBin, 'ui-spec', '--goal', 'premium minimal analytics dashboard', '--taste', 'premium-minimal', '--json'],
    targetRepo,
  ));

  assert.equal(direction.taste.profile.id, 'premium-minimal');
  assert.equal(direction.taste.profile.source, 'explicit');
  assert.ok(Object.keys(direction.designTokens).length >= 5);
  assert.ok(direction.componentCues.length >= 2);
  assert.ok(direction.styleGuardrails.length >= 2);
  assert.ok(direction.semanticGuardrails.length >= 2);
  assert.ok(direction.nativeFirstRecommendations.length >= 4);
  assert.ok(direction.recipePack.length >= 3);
  assert.ok(direction.prototypeMode.mode);
  assert.equal(spec.direction.taste.profile.id, 'premium-minimal');
  assert.ok(spec.direction.nativeFirstRecommendations.length >= 4);
  assert.ok(spec.direction.recipePack.length >= 3);
  assert.ok(spec.semanticAudit);
  assert.ok(spec.primitiveOpportunities);
  assert.ok(fs.existsSync(path.join(targetRepo, direction.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, spec.file)));
});

test('component-map reports primitive opportunities for repeated frontend patterns', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  writeFile(targetRepo, 'components/Modal.tsx', 'export function Modal() { return <div className="modal-shell"><button>Close</button></div>; }\n');
  writeFile(targetRepo, 'components/DataGrid.tsx', 'export function DataGrid() { return <div className="grid"><div>Row</div></div>; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const inventory = JSON.parse(run('node', [targetBin, 'component-map', '--json'], targetRepo));

  assert.ok(inventory.inventory.length >= 2);
  assert.ok(inventory.primitiveOpportunities.opportunityCount >= 1);
});

test('review-tasks builds a blocker-first four-wave task graph for large review loops', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  gitInit(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M70',
      '--name', 'Review task graph',
      '--goal', 'Exercise blocker-first review planning',
    ],
    targetRepo,
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline review task graph fixture'], targetRepo);

  writeFile(
    targetRepo,
    'app/page.tsx',
    'export default function Page() { console.log("debug"); return <main><h1>After</h1><p>TODO tighten copy</p></main>; }\n',
  );
  writeFile(
    targetRepo,
    'prisma/migrations/20260406_add_users.sql',
    'alter table users add column nickname text;\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const taskGraph = JSON.parse(run('node', [targetBin, 'review-tasks', '--json'], targetRepo));

  assert.equal(taskGraph.waves.length, 4);
  assert.ok(taskGraph.summary.fixTaskCount >= 1);
  assert.ok(taskGraph.waves[0].label === 'triage');
  assert.ok(taskGraph.waves[2].tasks.some((task) => task.mode === 'bounded_write'));
  assert.ok(taskGraph.waves[3].tasks.some((task) => task.mode === 'targeted_verify' || task.mode === 're_review'));
  assert.ok(fs.existsSync(path.join(targetRepo, taskGraph.markdownFile)));
  assert.ok(fs.existsSync(path.join(targetRepo, taskGraph.jsonFile)));
});

test('codex contextpack wraps workflow, repo, frontend, and review context into budgeted attachments', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  gitInit(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M71',
      '--name', 'Context pack',
      '--goal', 'Exercise codex context packing',
    ],
    targetRepo,
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline context pack fixture'], targetRepo);

  writeFile(
    targetRepo,
    'app/page.tsx',
    'export default function Page() { return <main><h1>After</h1><p>TODO tighten copy</p></main>; }\n',
  );
  writeFile(
    targetRepo,
    'prisma/migrations/20260406_add_users.sql',
    'alter table users add column nickname text;\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  run('node', [targetBin, 'review-tasks', '--json'], targetRepo);
  const wrapper = JSON.parse(run(
    'node',
    [targetBin, 'codex', 'contextpack', '--goal', 'review the premium dashboard diff', '--json'],
    targetRepo,
  ));
  const pack = JSON.parse(fs.readFileSync(path.join(targetRepo, wrapper.jsonFile), 'utf8'));

  assert.ok(fs.existsSync(path.join(targetRepo, wrapper.file)));
  assert.ok(pack.attachments.length >= 4);
  assert.ok(pack.budgetPresets.compact.attachmentPaths.length >= 1);
  assert.ok(pack.focusFiles.length >= 1);
  assert.ok(pack.frontend);
  assert.ok(pack.frontend.tasteProfile);
  assert.ok(pack.frontend.semanticGuardrails.length >= 2);
  assert.ok(pack.frontend.nativeFirst.length >= 3);
  assert.ok(pack.frontend.recipePack.length >= 2);
  assert.ok(pack.frontend.prototypeMode);
  assert.ok(pack.review);
  assert.equal(pack.review.waveCount, 4);
});

test('codex contextpack still infers focus files when no review graph or frontend lane is active', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const wrapper = JSON.parse(run(
    'node',
    [targetBin, 'codex', 'contextpack', '--goal', 'review the current diff', '--json'],
    targetRepo,
  ));
  const pack = JSON.parse(fs.readFileSync(path.join(targetRepo, wrapper.jsonFile), 'utf8'));

  assert.ok(pack.focusFiles.length >= 1);
  assert.ok(pack.focusFiles.every((item) => !item.startsWith('.workflow/')));
});

test('monorepo intelligence exposes hotspots and context budgets for broad package graphs', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedMonorepo(targetRepo);
  gitInit(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M72',
      '--name', 'Monorepo hotspots',
      '--goal', 'Exercise monorepo hotspot planning',
    ],
    targetRepo,
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline monorepo hotspot fixture'], targetRepo);

  writeFile(targetRepo, 'packages/app-one/src/index.ts', 'export const appone = false;\n');
  writeFile(targetRepo, 'packages/app-two/src/index.ts', 'export const apptwo = false;\n');

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const monorepo = JSON.parse(run('node', [targetBin, 'monorepo', '--json'], targetRepo));

  assert.equal(monorepo.repoShape, 'monorepo');
  assert.ok(monorepo.hotspots.length >= 2);
  assert.ok(monorepo.contextSlices.length >= 2);
  assert.ok(monorepo.contextBudgetPlan.compact.readFirst.length >= 1);
  assert.ok(monorepo.contextBudgetPlan.balanced.verifyFirst.length >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, monorepo.markdownFile)));
});
