const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildSetupCompatibilityReport } = require('../scripts/workflow/setup_compatibility');

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('setup compatibility report surfaces script collisions and existing tooling', () => {
  const targetRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-setup-compat-'));
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'compat-fixture',
    private: true,
    scripts: {
      'raiola:start': 'echo existing-start',
      lint: 'eslint .',
      prepare: 'husky install',
    },
    devDependencies: {
      husky: '^9.0.0',
      eslint: '^9.0.0',
    },
  }, null, 2));
  writeFile(targetRepo, '.codex/hooks.json', '{"hooks":[]}\n');
  writeFile(targetRepo, '.github/workflows/ci.yml', 'name: ci\n');
  writeFile(targetRepo, '.gitignore', 'node_modules/\n');

  const report = buildSetupCompatibilityReport(targetRepo, {
    scriptProfile: 'pilot',
    manageGitignore: true,
  });

  assert.equal(report.schema, 'raiola/install-compatibility/v1');
  assert.equal(report.verdict, 'high-risk');
  assert.ok(report.risks.some((entry) => entry.id === 'package-script-collision'));
  assert.ok(report.risks.some((entry) => entry.id === 'codex-layer-present'));
  assert.ok(report.risks.some((entry) => entry.id === 'existing-hook-manager'));
  assert.ok(report.risks.some((entry) => entry.id === 'ci-present'));
  assert.ok(report.recommendedFlags.includes('--overwrite-scripts'));
  assert.match(report.rollback.command, /rai uninstall --target/);
});
