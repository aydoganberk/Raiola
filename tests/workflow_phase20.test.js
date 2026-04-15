const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const raiBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase20-'));
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

function seedFlutterRepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(
    targetRepo,
    'pubspec.yaml',
    'name: conflip\nflutter:\n  uses-material-design: true\n',
  );
  writeFile(
    targetRepo,
    'lib/main.dart',
    'import \'package:flutter/material.dart\';\nvoid main() => runApp(const MaterialApp(home: Placeholder()));\n',
  );
  writeFile(
    targetRepo,
    'lib/features/onboarding/onboarding_screen.dart',
    'import \'package:flutter/material.dart\';\nclass OnboardingScreen extends StatelessWidget { const OnboardingScreen({super.key}); @override Widget build(BuildContext context) { return const Placeholder(); } }\n',
  );
  writeFile(
    targetRepo,
    'lib/features/home/home_screen.dart',
    'import \'package:flutter/material.dart\';\nclass HomeScreen extends StatelessWidget { const HomeScreen({super.key}); @override Widget build(BuildContext context) { return const Placeholder(); } }\n',
  );
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
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
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
  assert.ok(direction.designDna);
  assert.ok(direction.designDna.references.length >= 2);
  assert.ok(direction.designDna.productCategory.label);
  assert.ok(Object.keys(direction.designTokens).length >= 5);
  assert.ok(direction.componentCues.length >= 2);
  assert.ok(direction.styleGuardrails.length >= 2);
  assert.ok(direction.semanticGuardrails.length >= 2);
  assert.ok(direction.nativeFirstRecommendations.length >= 4);
  assert.ok(direction.recipePack.length >= 3);
  assert.ok(direction.prototypeMode.mode);
  assert.equal(spec.direction.taste.profile.id, 'premium-minimal');
  assert.ok(spec.designDna.references.length >= 2);
  assert.ok(spec.stateAtlas.requiredStates.includes('loading'));
  assert.ok(spec.direction.nativeFirstRecommendations.length >= 4);
  assert.ok(spec.direction.recipePack.length >= 3);
  assert.ok(spec.semanticAudit);
  assert.ok(spec.primitiveOpportunities);
  assert.ok(fs.existsSync(path.join(targetRepo, direction.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, spec.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, spec.designDna.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, spec.stateAtlas.file)));
});

test('map-frontend emits routing, surface inventory, planning signals, and command packs', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const frontendMap = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'map_frontend.js'), '--json'],
    targetRepo,
  ));

  assert.equal(frontendMap.framework.primary, 'Next');
  assert.equal(frontendMap.routing.primary, 'next-app-router');
  assert.equal(frontendMap.surfaceInventory.routeCount, 1);
  assert.ok(frontendMap.surfaceInventory.sharedComponentCount >= 1);
  assert.equal(frontendMap.planningSignals.webSurface, true);
  assert.equal(frontendMap.planningSignals.mobileSurface, false);
  assert.equal(frontendMap.planningSignals.needsStateAtlas, false);
  assert.equal(frontendMap.planningSignals.needsComponentStrategy, false);
  assert.equal(frontendMap.planningSignals.needsFullBrief, false);
  assert.ok(frontendMap.commandPacks.available.some((pack) => pack.id === 'frontend-lean-core'));
  assert.equal(frontendMap.recommendedCommandPack.id, 'frontend-lean-core');
  assert.ok(frontendMap.recommendedCommandPack.commands.some((command) => command.includes('rai ui-spec')));
});

test('design-dna and state-atlas generate downstream site-building contracts', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  writeFile(
    targetRepo,
    'app/page.tsx',
    'export default function Page() { return <main><h1>CLI for AI agents</h1><p>Ship faster with traceable workflows.</p><form><input aria-label="Email" /><button type="submit">Join</button></form></main>; }\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const designDna = JSON.parse(run(
    'node',
    [targetBin, 'design-dna', '--goal', 'build a developer tool landing page for AI agents', '--json'],
    targetRepo,
  ));
  const stateAtlas = JSON.parse(run(
    'node',
    [targetBin, 'state-atlas', '--goal', 'build a developer tool landing page for AI agents', '--json'],
    targetRepo,
  ));

  assert.ok(designDna.productCategory.id === 'developer-tool' || designDna.productCategory.id === 'ai-platform');
  assert.ok(designDna.references.length >= 2);
  assert.ok(designDna.blend.summary.includes('+'));
  assert.ok(stateAtlas.requiredStates.includes('success'));
  assert.ok(stateAtlas.states.some((item) => item.id === 'form-validation'));
  assert.ok(fs.existsSync(path.join(targetRepo, designDna.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, stateAtlas.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, designDna.runtimeFile)));
  assert.ok(fs.existsSync(path.join(targetRepo, stateAtlas.runtimeFile)));
});

test('page-blueprint, design-md, component-strategy, design-benchmark, and frontend-brief generate external-site artifact packs', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  writeFile(
    targetRepo,
    'app/page.tsx',
    'export default function Page() { return <main><h1>AI agent platform</h1><p>Ship trusted workflows fast.</p><button type="button">Start building</button></main>; }\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const blueprint = JSON.parse(run(
    'node',
    [targetBin, 'page-blueprint', '--goal', 'build a developer tool landing page for AI agents', '--json'],
    targetRepo,
  ));
  const designMd = JSON.parse(run(
    'node',
    [targetBin, 'design-md', '--goal', 'build a developer tool landing page for AI agents', '--project-root', '--json'],
    targetRepo,
  ));
  const componentStrategy = JSON.parse(run(
    'node',
    [targetBin, 'component-strategy', '--goal', 'build a developer tool landing page for AI agents', '--json'],
    targetRepo,
  ));
  const designBenchmark = JSON.parse(run(
    'node',
    [targetBin, 'design-benchmark', '--goal', 'build a developer tool landing page for AI agents', '--json'],
    targetRepo,
  ));
  const frontendBrief = JSON.parse(run(
    'node',
    [targetBin, 'frontend-brief', '--goal', 'build a developer tool landing page for AI agents', '--project-root', '--json'],
    targetRepo,
  ));

  assert.equal(blueprint.pageType.id, 'landing-page');
  assert.ok(blueprint.sections.length >= 5);
  assert.ok(blueprint.sections.some((item) => item.id === 'hero'));
  assert.ok(designMd.file.endsWith('docs/workflow/DESIGN.md'));
  assert.equal(designMd.projectRootFile, 'DESIGN.md');
  assert.ok(componentStrategy.file.endsWith('COMPONENT-STRATEGY.md'));
  assert.ok(componentStrategy.buildNow.length >= 1);
  assert.ok(componentStrategy.componentPolicy.length >= 3);
  assert.ok(designBenchmark.file.endsWith('DESIGN-BENCHMARK.md'));
  assert.ok(designBenchmark.differentiationPlays.length >= 2);
  assert.ok(designBenchmark.commodityRisks.length >= 2);
  assert.ok(fs.existsSync(path.join(targetRepo, designMd.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, designMd.projectRootFile)));
  assert.ok(fs.existsSync(path.join(targetRepo, componentStrategy.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, designBenchmark.file)));
  assert.ok(frontendBrief.pageBlueprint.file.endsWith('PAGE-BLUEPRINT.md'));
  assert.ok(frontendBrief.designMd.file.endsWith('DESIGN.md'));
  assert.ok(frontendBrief.componentStrategy.file.endsWith('COMPONENT-STRATEGY.md'));
  assert.ok(frontendBrief.designBenchmark.file.endsWith('DESIGN-BENCHMARK.md'));
  assert.ok(frontendBrief.spec.file.endsWith('UI-SPEC.md'));
  assert.ok(fs.existsSync(path.join(targetRepo, frontendBrief.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, frontendBrief.runtimeFile)));
});

test('flutter/mobile repos are recognized as mobile-first surfaces instead of web-first page families', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFlutterRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const frontendMap = JSON.parse(run(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', 'map_frontend.js'), '--json'],
    targetRepo,
  ));
  const designDna = JSON.parse(run(
    'node',
    [targetBin, 'design-dna', '--goal', 'plan the flutter mobile consumer app onboarding flow with gestures and bottom sheets', '--json'],
    targetRepo,
  ));
  const blueprint = JSON.parse(run(
    'node',
    [targetBin, 'page-blueprint', '--goal', 'plan the flutter mobile consumer app onboarding flow with gestures and bottom sheets', '--json'],
    targetRepo,
  ));

  assert.equal(frontendMap.framework.primary, 'Flutter');
  assert.equal(frontendMap.routing.primary, 'flutter-navigator');
  assert.equal(frontendMap.productSurface.id, 'mobile-app');
  assert.equal(frontendMap.interactionModel.primary, 'gesture-heavy');
  assert.equal(frontendMap.recommendedCommandPack.id, 'mobile-surface-pack');
  assert.ok(frontendMap.visualVerdict.areas.some((item) => item.area === 'screen flow'));
  assert.ok(frontendMap.visualVerdict.areas.some((item) => item.area === 'gesture fidelity'));
  assert.equal(designDna.productCategory.id, 'mobile-consumer-app');
  assert.equal(blueprint.pageType.id, 'mobile-screen-flow');
  assert.ok(blueprint.sections.some((item) => item.id === 'primary-task'));
});

test('ui-recipe scaffolds a framework-aware semantic-first slice', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const recipe = JSON.parse(run(
    'node',
    [
      targetBin,
      'ui-recipe',
      '--goal', 'build a premium review dashboard shell',
      '--recipe', 'filter-table-inspector',
      '--json',
    ],
    targetRepo,
  ));

  assert.equal(recipe.recipe.id, 'filter-table-inspector');
  assert.equal(recipe.semanticPrototype.language, 'html');
  assert.equal(recipe.stackScaffold.language, 'tsx');
  assert.ok(recipe.targetFiles.includes('app/page.tsx'));
  assert.ok(recipe.targetFiles.length >= 2);
  assert.ok(recipe.nativeFirst.length >= 2);
  assert.ok(recipe.translationNotes.length >= 3);
  assert.ok(recipe.verificationPlan.length >= 2);
  assert.ok(fs.existsSync(path.join(targetRepo, recipe.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, recipe.runtimeFile)));
});

test('component-map reports primitive opportunities for repeated frontend patterns', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  writeFile(targetRepo, 'components/Modal.tsx', 'export function Modal() { return <div className="modal-shell"><button>Close</button></div>; }\n');
  writeFile(targetRepo, 'components/DataGrid.tsx', 'export function DataGrid() { return <div className="grid"><div>Row</div></div>; }\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const inventory = JSON.parse(run('node', [targetBin, 'component-map', '--json'], targetRepo));

  assert.ok(inventory.inventory.length >= 2);
  assert.ok(inventory.primitiveOpportunities.opportunityCount >= 1);
});

test('review-tasks builds a blocker-first four-wave task graph for large review loops', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
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

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
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
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
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

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
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
  assert.ok(pack.frontend.designDnaFile);
  assert.ok(pack.frontend.pageBlueprintFile);
  assert.ok(pack.frontend.designMdFile);
  assert.ok(pack.frontend.componentStrategyFile);
  assert.ok(pack.frontend.designBenchmarkFile);
  assert.ok(pack.frontend.productCategory);
  assert.ok(pack.frontend.referenceBlend);
  assert.ok(pack.frontend.pageType);
  assert.ok(pack.frontend.pageSections.length >= 3);
  assert.ok(pack.frontend.buildNow.length >= 1);
  assert.ok(pack.frontend.differentiationPlays.length >= 2);
  assert.ok(pack.frontend.semanticGuardrails.length >= 2);
  assert.ok(pack.frontend.nativeFirst.length >= 3);
  assert.ok(pack.frontend.recipePack.length >= 2);
  assert.ok(pack.frontend.prototypeMode);
  assert.ok(pack.frontend.recipeFile);
  assert.ok(pack.frontend.selectedRecipe);
  assert.ok(pack.attachments.some((item) => item.id === 'page-blueprint'));
  assert.ok(pack.attachments.some((item) => item.id === 'design-md'));
  assert.ok(pack.attachments.some((item) => item.id === 'component-strategy'));
  assert.ok(pack.attachments.some((item) => item.id === 'design-benchmark'));
  assert.ok(pack.attachments.some((item) => item.id === 'ui-recipe'));
  assert.ok(pack.suggestedCommands.includes('rai frontend-brief --json'));
  assert.ok(pack.suggestedCommands.includes('rai design-md --json'));
  assert.ok(pack.suggestedCommands.includes('rai component-strategy --json'));
  assert.ok(pack.suggestedCommands.includes('rai design-benchmark --json'));
  assert.ok(pack.suggestedCommands.includes('rai ui-recipe --json'));
  assert.ok(pack.review);
  assert.equal(pack.review.waveCount, 4);
});

test('codex contextpack still infers focus files when no review graph or frontend lane is active', () => {
  const targetRepo = makeTempRepo();
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
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
  run('node', [raiBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
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

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const monorepo = JSON.parse(run('node', [targetBin, 'monorepo', '--json'], targetRepo));

  assert.equal(monorepo.repoShape, 'monorepo');
  assert.ok(monorepo.hotspots.length >= 2);
  assert.ok(monorepo.contextSlices.length >= 2);
  assert.ok(monorepo.contextBudgetPlan.compact.readFirst.length >= 1);
  assert.ok(monorepo.contextBudgetPlan.balanced.verifyFirst.length >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, monorepo.markdownFile)));
});
