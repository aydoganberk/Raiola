const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cutReleaseScript = path.join(repoRoot, 'scripts', 'release', 'cut_release.js');
const releaseNotesScript = path.join(repoRoot, 'scripts', 'release', 'release_notes_from_changelog.js');

function makeTempDir(prefix = 'raiola-release-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(args, cwd = repoRoot) {
  return childProcess.execFileSync('node', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('cut_release bumps package and embedded versions and rolls the changelog', () => {
  const tempDir = makeTempDir('raiola-release-cut-');
  const packagePath = path.join(tempDir, 'package.json');
  const productVersionPath = path.join(tempDir, 'product_version.js');
  const changelogPath = path.join(tempDir, 'CHANGELOG.md');

  fs.writeFileSync(packagePath, `${JSON.stringify({ name: 'raiola', version: '1.2.3' }, null, 2)}\n`);
  fs.writeFileSync(productVersionPath, `const EMBEDDED_PRODUCT = Object.freeze({\n  version: '1.2.3',\n});\n`);
  fs.writeFileSync(
    changelogPath,
    `# Changelog

## Unreleased

- Added release automation.
- Added better publish docs.

## 1.2.3 - 2026-04-07

- Previous release.
`,
  );

  run([
    cutReleaseScript,
    '--bump', 'minor',
    '--date', '2026-04-08',
    '--package', packagePath,
    '--product-version', productVersionPath,
    '--changelog', changelogPath,
  ]);

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const productVersion = fs.readFileSync(productVersionPath, 'utf8');
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  assert.equal(pkg.version, '1.3.0');
  assert.match(productVersion, /version: '1\.3\.0'/);
  assert.match(changelog, /## Unreleased\n\n_No unreleased changes yet\._/);
  assert.match(changelog, /## 1\.3\.0 - 2026-04-08/);
  assert.match(changelog, /- Added release automation\./);
});

test('release_notes_from_changelog extracts the requested version section', () => {
  const tempDir = makeTempDir('raiola-release-notes-');
  const changelogPath = path.join(tempDir, 'CHANGELOG.md');

  fs.writeFileSync(
    changelogPath,
    `# Changelog

## Unreleased

_No unreleased changes yet._

## 2.0.0 - 2026-04-08

- Major release note one.
- Major release note two.

## 1.9.0 - 2026-04-01

- Older release.
`,
  );

  const output = run([
    releaseNotesScript,
    '--tag', 'v2.0.0',
    '--changelog', changelogPath,
  ]);

  assert.match(output, /Major release note one/);
  assert.match(output, /Major release note two/);
  assert.doesNotMatch(output, /Older release/);
});
