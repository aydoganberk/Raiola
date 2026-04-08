#!/usr/bin/env node

const fs = require('node:fs');
const {
  defaultPaths,
  extractChangelogSection,
  normalizeVersion,
  parseArgs,
  readChangelog,
} = require('./common');

function usage() {
  console.log(`Usage: node scripts/release/release_notes_from_changelog.js --version 1.2.3 [options]

Options:
  --tag v1.2.3         Use a git tag instead of --version
  --changelog <path>   Override CHANGELOG.md path
  --output <path>      Write release notes to a file instead of stdout
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const rawVersion = args.version || args.tag;
  if (!rawVersion) {
    throw new Error('Missing required --version or --tag argument.');
  }

  const version = normalizeVersion(rawVersion);
  const changelogPath = args.changelog || defaultPaths().changelog;
  const notes = extractChangelogSection(readChangelog(changelogPath), version);

  if (args.output) {
    fs.writeFileSync(args.output, `${notes}\n`);
    return;
  }
  process.stdout.write(`${notes}\n`);
}

try {
  main();
} catch (error) {
  console.error(`release notes generation failed: ${error.message}`);
  process.exit(1);
}
