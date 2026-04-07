
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-workflow-kit-phase19-'));
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

test('multilingual natural-language routing handles Chinese, Spanish, and Turkish commands', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  fs.mkdirSync(path.join(targetRepo, '.workflow', 'cache'), { recursive: true });
  fs.writeFileSync(
    path.join(targetRepo, '.workflow', 'cache', 'intent-steering.json'),
    `${JSON.stringify({
      updatedAt: new Date().toISOString(),
      preferences: {
        preferBrowser: true,
      },
      history: [],
    }, null, 2)}\n`,
  );

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const chineseReview = JSON.parse(run('node', [targetBin, 'do', '请做代码审查并验证浏览器', '--json'], targetRepo));
  const spanishFrontend = JSON.parse(run('node', [targetBin, 'do', 'crea una especificación UI frontend con diseño premium y revisión responsive', '--json'], targetRepo));
  const turkishReview = JSON.parse(run('node', [targetBin, 'do', 'kapsamlı ürün değerlendirmesi yap', '--json'], targetRepo));
  const turkishResearch = JSON.parse(run('node', [targetBin, 'do', 'kapsamlı analiz yap ve en büyük riski açıkla', '--json'], targetRepo));

  assert.equal(chineseReview.capability, 'review.deep_review');
  assert.ok(chineseReview.languageMix.matchedLanguages.includes('zh'));
  assert.equal(chineseReview.lane, 'review');

  assert.equal(spanishFrontend.lane, 'frontend');
  assert.ok(spanishFrontend.languageMix.matchedLanguages.includes('es'));
  assert.ok(fs.existsSync(path.join(targetRepo, spanishFrontend.uiDirection)));
  assert.ok(fs.existsSync(path.join(targetRepo, spanishFrontend.uiSpec)));

  assert.equal(turkishReview.capability, 'review.deep_review');
  assert.equal(turkishReview.lane, 'review');
  assert.ok(turkishReview.languageMix.matchedLanguages.includes('tr'));

  assert.equal(turkishResearch.capability, 'research.discuss');
  assert.equal(turkishResearch.lane, 'full');
  assert.ok(turkishResearch.languageMix.matchedLanguages.includes('tr'));
});

test('english and turkish conversational routing covers broader Codex operator phrasing', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const englishResearch = JSON.parse(run('node', [targetBin, 'do', 'look into why the verification plan feels weak before patching', '--json'], targetRepo));
  const englishPlan = JSON.parse(run('node', [targetBin, 'do', 'put together the next execution packet with risks and checks', '--json'], targetRepo));
  const englishReview = JSON.parse(run('node', [targetBin, 'do', 'go over the diff and call out blockers', '--json'], targetRepo));
  const englishShip = JSON.parse(run('node', [targetBin, 'do', 'get this out with handoff notes after final review', '--json'], targetRepo));
  const turkishResearch = JSON.parse(run('node', [targetBin, 'do', 'neden verify plani zayif bir bak ve kok nedeni acikla', '--json'], targetRepo));
  const turkishPlan = JSON.parse(run('node', [targetBin, 'do', 'bir sonraki milestone paketini hazirla ve verify planini ekle', '--json'], targetRepo));
  const turkishReview = JSON.parse(run('node', [targetBin, 'do', 'elden gecir ve riskleri yaz', '--json'], targetRepo));
  const turkishParallel = JSON.parse(run('node', [targetBin, 'do', 'bunu parcalara bol ve paketlere dagit', '--json'], targetRepo));
  const turkishShip = JSON.parse(run('node', [targetBin, 'do', 'bunu yayina al ve handoff notlarini ekle', '--json'], targetRepo));

  assert.equal(englishResearch.capability, 'research.discuss');
  assert.equal(englishPlan.capability, 'plan.execution_packet');
  assert.equal(englishReview.capability, 'review.deep_review');
  assert.equal(englishShip.capability, 'ship.release');
  assert.ok(englishReview.languageMix.matchedLanguages.includes('en'));

  assert.equal(turkishResearch.capability, 'research.discuss');
  assert.equal(turkishPlan.capability, 'plan.execution_packet');
  assert.equal(turkishReview.capability, 'review.deep_review');
  assert.equal(turkishParallel.capability, 'team.parallel');
  assert.equal(turkishShip.capability, 'ship.release');
  assert.ok(turkishReview.languageMix.matchedLanguages.includes('tr'));
});

test('ui direction and ui plan generate taste-aware frontend guidance for Codex', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const direction = JSON.parse(run('node', [targetBin, 'ui-direction', '--json'], targetRepo));
  const spec = JSON.parse(run('node', [targetBin, 'ui-spec', '--json'], targetRepo));
  const plan = JSON.parse(run('node', [targetBin, 'ui-plan', '--json'], targetRepo));

  assert.ok(direction.taste.tagline.length > 20);
  assert.ok(direction.codexRecipes.length >= 4);
  assert.ok(direction.acceptanceChecklist.length >= 5);
  assert.ok(fs.existsSync(path.join(targetRepo, direction.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, spec.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, plan.file)));
  assert.equal(plan.uiDirection, direction.file);
  assert.equal(spec.direction.file, direction.file);
});

test('review orchestration builds package and persona waves on top of review mode', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  gitInit(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M60',
      '--name', 'Review orchestration',
      '--goal', 'Exercise review orchestration',
    ],
    targetRepo,
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline review fixture'], targetRepo);

  fs.writeFileSync(
    path.join(targetRepo, 'app', 'page.tsx'),
    'export default function Page() { console.log("debug"); return <main><h1>After</h1><p>TODO tighten copy</p></main>; }\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const review = JSON.parse(run('node', [targetBin, 'review-orchestrate', '--json'], targetRepo));

  assert.ok(review.findings.length >= 2);
  assert.ok(review.orchestration.packageGroups.length >= 1);
  assert.ok(review.orchestration.personaShards.length >= 1);
  assert.equal(review.orchestration.waves.length, 3);
  assert.ok(fs.existsSync(path.join(targetRepo, review.orchestration.markdownFile)));
  assert.ok(review.orchestration.waves[0].tasks.every((task) => task.mode === 'parallel_readonly'));
});

test('monorepo intelligence and delegation plan auto-synthesize package-local write scopes', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--skip-verify'], repoRoot);
  seedMonorepo(targetRepo);
  gitInit(targetRepo);

  run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'new_milestone.js'),
      '--id', 'M61',
      '--name', 'Monorepo execution',
      '--goal', 'Exercise monorepo execution',
    ],
    targetRepo,
  );

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline monorepo fixture'], targetRepo);

  fs.writeFileSync(path.join(targetRepo, 'packages', 'app-one', 'src', 'index.ts'), 'export const appone = false;\n');

  const targetBin = path.join(targetRepo, 'bin', 'cwf.js');
  const monorepo = JSON.parse(run('node', [targetBin, 'monorepo', '--json'], targetRepo));
  const delegation = JSON.parse(run(
    'node',
    [
      path.join(targetRepo, 'scripts', 'workflow', 'delegation_plan.js'),
      '--json',
      '--intent', 'execute',
      '--parallel',
      '--goal', 'implement the package delta',
    ],
    targetRepo,
  ));
  const promptPack = JSON.parse(run('node', [targetBin, 'codex', 'promptpack', '--goal', 'implement the package delta', '--json'], targetRepo));

  assert.equal(monorepo.repoShape, 'monorepo');
  assert.ok(monorepo.writeScopes.length >= 2);
  assert.ok(monorepo.reviewShards.length >= 1);
  assert.equal(delegation.writeScope.autoSynthesized, true);
  assert.equal(delegation.blockers.length, 0);
  assert.ok(delegation.waves[0].roles.some((role) => role.role === 'worker-1'));
  assert.ok(delegation.waves[0].roles.some((role) => role.role === 'worker-2'));
  assert.equal(promptPack.action, 'promptpack');
  assert.ok(promptPack.monorepo);
  assert.ok(fs.existsSync(path.join(targetRepo, promptPack.file)));
});
