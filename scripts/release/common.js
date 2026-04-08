const fs = require('node:fs');
const path = require('node:path');

const UNRELEASED_PLACEHOLDER = '_No unreleased changes yet._';

function repoRoot() {
  return path.join(__dirname, '..', '..');
}

function defaultPaths() {
  const root = repoRoot();
  return {
    packageJson: path.join(root, 'package.json'),
    productVersion: path.join(root, 'scripts', 'workflow', 'product_version.js'),
    changelog: path.join(root, 'CHANGELOG.md'),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function assertSimpleSemver(version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    throw new Error(`Expected a simple semver version, received: ${version || 'empty'}`);
  }
}

function normalizeVersion(value) {
  const normalized = String(value || '').trim().replace(/^v/, '');
  assertSimpleSemver(normalized);
  return normalized;
}

function bumpVersion(version, bump) {
  const normalized = normalizeVersion(version);
  const [major, minor, patch] = normalized.split('.').map((part) => Number(part));
  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  if (bump === 'patch') {
    return `${major}.${minor}.${patch + 1}`;
  }
  throw new Error(`Unsupported bump type: ${bump}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function replaceEmbeddedVersion(content, nextVersion) {
  const updated = content.replace(/version:\s*'[^']+'/u, `version: '${nextVersion}'`);
  if (updated === content) {
    throw new Error('Could not update embedded product version.');
  }
  return updated;
}

function readChangelog(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeUnreleasedBody(body) {
  const normalized = String(body || '').trim();
  if (!normalized || normalized === UNRELEASED_PLACEHOLDER) {
    return '';
  }
  return normalized;
}

function findUnreleasedSection(changelog) {
  const header = '## Unreleased';
  const headerStart = changelog.indexOf(header);
  if (headerStart === -1) {
    throw new Error('CHANGELOG.md is missing the "## Unreleased" section.');
  }
  const headerEnd = changelog.indexOf('\n', headerStart);
  const bodyStart = headerEnd === -1 ? changelog.length : headerEnd + 1;
  const nextHeaderMarker = '\n## ';
  const nextHeaderStart = changelog.indexOf(nextHeaderMarker, bodyStart);
  const bodyEnd = nextHeaderStart === -1 ? changelog.length : nextHeaderStart;
  return {
    before: changelog.slice(0, headerStart),
    body: changelog.slice(bodyStart, bodyEnd),
    after: nextHeaderStart === -1 ? '' : changelog.slice(nextHeaderStart + 1),
  };
}

function cutChangelogRelease(changelog, version, date, { allowEmpty = false } = {}) {
  const unreleased = findUnreleasedSection(changelog);
  const releaseBody = normalizeUnreleasedBody(unreleased.body);
  if (!releaseBody && !allowEmpty) {
    throw new Error('CHANGELOG.md has no unreleased entries to release.');
  }
  const notes = releaseBody || '- No user-facing changes were recorded for this release.';
  const remaining = unreleased.after.trimStart();
  return [
    unreleased.before.trimEnd(),
    '',
    '## Unreleased',
    '',
    UNRELEASED_PLACEHOLDER,
    '',
    `## ${version} - ${date}`,
    '',
    notes,
    ...(remaining ? ['', remaining] : []),
    '',
  ].join('\n');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractChangelogSection(changelog, version) {
  const normalized = normalizeVersion(version);
  const match = changelog.match(new RegExp(`^## ${escapeRegex(normalized)} - .*?$`, 'm'));
  if (!match || typeof match.index !== 'number') {
    throw new Error(`Could not find CHANGELOG section for version ${normalized}.`);
  }
  const sectionStart = match.index;
  const titleEnd = changelog.indexOf('\n', sectionStart);
  const bodyStart = titleEnd === -1 ? changelog.length : titleEnd + 1;
  const nextHeaderStart = changelog.indexOf('\n## ', bodyStart);
  const bodyEnd = nextHeaderStart === -1 ? changelog.length : nextHeaderStart;
  return changelog.slice(bodyStart, bodyEnd).trim();
}

function writeGithubOutput(entries) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  const lines = Object.entries(entries).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

module.exports = {
  UNRELEASED_PLACEHOLDER,
  bumpVersion,
  cutChangelogRelease,
  defaultPaths,
  extractChangelogSection,
  normalizeVersion,
  parseArgs,
  readChangelog,
  readJson,
  replaceEmbeddedVersion,
  writeGithubOutput,
  writeJson,
};
