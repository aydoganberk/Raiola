const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const {
  collectMatchDetails,
  detectLanguageSignals,
  detectPersonaSignals,
  deterministicCapabilityMatches,
} = require('../scripts/workflow/intent_lexicon');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const cwfBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-phase21-'));
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

function seedPnpmMonorepo(targetRepo) {
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.private = true;
  packageJson.scripts = {
    test: 'node -e "process.exit(0)"',
    lint: 'node -e "process.exit(0)"',
    typecheck: 'node -e "process.exit(0)"',
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFile(targetRepo, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');

  const packages = [
    { name: 'core', deps: {} },
    { name: 'web', deps: { '@pnpm/core': '1.0.0' } },
  ];

  for (const pkg of packages) {
    const pkgDir = path.join(targetRepo, 'packages', pkg.name);
    fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify({
      name: `@pnpm/${pkg.name}`,
      private: true,
      scripts: {
        test: 'node -e "process.exit(0)"',
        lint: 'node -e "process.exit(0)"',
        typecheck: 'node -e "process.exit(0)"',
      },
      dependencies: pkg.deps,
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(pkgDir, 'src', 'index.ts'), `export const ${pkg.name} = true;\n`);
  }
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('ui-direction exports experience thesis, signature moments, and codex prompts', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const direction = JSON.parse(run(
    'node',
    [targetBin, 'ui-direction', '--goal', 'premium minimal analytics dashboard', '--taste', 'premium-minimal', '--json'],
    targetRepo,
  ));

  assert.equal(direction.taste.profile.id, 'premium-minimal');
  assert.ok(direction.experienceThesis?.title);
  assert.ok(direction.designDna.productCategory.label);
  assert.ok(direction.designDna.references.length >= 2);
  assert.ok(direction.signatureMoments.length >= 2);
  assert.ok(direction.screenBlueprints.length >= 2);
  assert.ok(direction.motionSystem.transitions.length >= 2);
  assert.ok(direction.copyVoice.tone.includes('copy'));
  assert.ok(direction.designSystemActions.length >= 2);
  assert.ok(direction.implementationPrompts.length >= 2);
  assert.ok(direction.semanticGuardrails.length >= 2);
  assert.ok(direction.nativeFirstRecommendations.length >= 4);
  assert.ok(direction.recipePack.length >= 3);
  assert.ok(direction.prototypeMode.mode);
});

test('ui-direction accepts the semantic-minimal taste profile for native-first guidance', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const direction = JSON.parse(run(
    'node',
    [targetBin, 'ui-direction', '--goal', 'build a semantic lightweight settings surface', '--taste', 'semantic-minimal', '--json'],
    targetRepo,
  ));

  assert.equal(direction.taste.profile.id, 'semantic-minimal');
  assert.ok(direction.semanticGuardrails.some((item) => item.includes('semantic')));
  assert.ok(direction.nativeFirstRecommendations.some((item) => item.native.includes('dialog') || item.native.includes('table')));
  assert.ok(direction.designDna.references.some((item) => item.label.includes('OpenCode') || item.label.includes('Replicate') || item.label.includes('Linear')));
});

test('review-mode produces a distinct execution spine, context pack, and artifacts', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);
  gitInit(targetRepo);

  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'baseline review mode fixture'], targetRepo);

  writeFile(
    targetRepo,
    'app/page.tsx',
    'export default function Page() { console.log("debug"); return <main><h1>After</h1><p>TODO tighten copy</p></main>; }\n',
  );

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const reviewMode = JSON.parse(run(
    'node',
    [targetBin, 'review-mode', '--goal', 'review the dashboard diff', '--json'],
    targetRepo,
  ));

  assert.ok(reviewMode.reviewLenses.length >= 1);
  assert.ok(reviewMode.executionSpine.length >= 4);
  assert.equal(reviewMode.taskGraph.waves.length, 4);
  assert.ok(reviewMode.contextPack.file);
  assert.ok(reviewMode.contextPack.focusFiles.length >= 1);
  assert.ok(fs.existsSync(path.join(targetRepo, reviewMode.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, reviewMode.jsonFile)));
});

test('monorepo intelligence discovers pnpm workspaces and builds agent waves', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedPnpmMonorepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const monorepo = JSON.parse(run('node', [targetBin, 'monorepo', '--json'], targetRepo));

  assert.equal(monorepo.repoShape, 'monorepo');
  assert.ok(monorepo.workspaceDiscovery.sources.includes('pnpm-workspace.yaml'));
  assert.ok(monorepo.workspaceDiscovery.directories.some((item) => item === 'packages/core'));
  assert.ok(monorepo.performanceLevers.length >= 1);
  assert.ok(monorepo.agentPlan.scout.length >= 1);
  assert.ok(monorepo.agentPlan.verify.length >= 1);
});

test('multilingual lexicon recognizes expanded language markers and deterministic intents', () => {
  const greek = detectLanguageSignals('παράλληλα κάνε ανασκόπηση κώδικα και επαλήθευσε το frontend');
  const hebrewCaps = deterministicCapabilityMatches('בצע סקירת קוד במקביל');
  const thai = detectLanguageSignals('รีวิวโค้ด แล้วตรวจสอบ frontend แบบขนาน');

  assert.ok(greek.matchedLanguages.includes('el'));
  assert.ok(thai.matchedLanguages.includes('th'));
  assert.ok(hebrewCaps.includes('team.parallel') || hebrewCaps.includes('review.deep_review'));
});

test('language detection de-noises shared technical loanwords for Codex routing', () => {
  const englishReview = detectLanguageSignals('review codex repo performance and suggest improvements');
  const spanishFrontend = detectLanguageSignals('crea una especificación UI frontend con diseño premium y revisión responsive');
  const englishConversational = detectLanguageSignals('go over the patch and call out blockers');
  const turkishConversational = detectLanguageSignals('previewu smoke et ve ekran goruntusu al');

  assert.deepEqual(englishReview.matchedLanguages, ['en']);
  assert.equal(englishReview.multilingual, false);
  assert.deepEqual(spanishFrontend.matchedLanguages, ['es']);
  assert.equal(spanishFrontend.englishSignals, false);
  assert.deepEqual(englishConversational.matchedLanguages, ['en']);
  assert.deepEqual(turkishConversational.matchedLanguages, ['tr']);
});

test('persona packs and typo-tolerant matching recover English and Turkish operator phrasing', () => {
  const englishPersona = detectPersonaSignals('act like a head developer and go ovre the diff with blocker focus');
  const turkishPersona = detectPersonaSignals('teknik lider gibi milestone paketini hazrla');
  const typoMatches = collectMatchDetails('go ovre the diff and call out blokers', ['go over the diff', 'call out blockers']);
  const turkishTypoMatches = collectMatchDetails('milestone paketini hazrla ve verify planini ekle', ['hazirla', 'verify planini']);

  assert.ok(englishPersona.matchedPersonaIds.includes('lead_engineer'));
  assert.ok(turkishPersona.matchedPersonaIds.includes('lead_engineer'));
  assert.ok(englishPersona.steeringPreferences.preferReview);
  assert.ok(typoMatches.every((item) => ['exact', 'fuzzy'].includes(item.mode)));
  assert.ok(typoMatches.some((item) => item.mode === 'fuzzy'));
  assert.ok(turkishTypoMatches.some((item) => item.mode === 'fuzzy'));
});

test('do payload includes a codex command plan for frontend lanes', () => {
  const targetRepo = makeTempRepo();
  run('node', [cwfBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  seedFrontendRepo(targetRepo);

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const payload = JSON.parse(run(
    'node',
    [targetBin, 'do', '--goal', 'design a premium frontend analytics dashboard with better taste', '--json'],
    targetRepo,
  ));

  assert.ok(payload.commandPlan.primaryCommand.includes('rai ui-plan') || payload.commandPlan.primaryCommand.includes('rai do'));
  assert.ok(payload.commandPlan.secondaryCommands.some((command) => command.includes('rai ui-recipe')));
  assert.ok(payload.commandPlan.codexAppFlow.length >= 1);
  assert.ok(payload.commandPlan.codexAppFlow.some((entry) => entry.includes('UI-RECIPE')));
  assert.ok(payload.verificationPlan.includes('rai ui-recipe'));
  assert.ok(payload.uiDirection);
  assert.ok(payload.uiSpec);
  assert.ok(payload.uiRecipe);
});
