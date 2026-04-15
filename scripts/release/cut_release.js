#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  bumpVersion,
  cutChangelogRelease,
  defaultPaths,
  parseArgs,
  readChangelog,
  readJson,
  replaceEmbeddedVersion,
  writeGithubOutput,
  writeJson,
} = require('./common');
const { buildDoctorReport } = require('../workflow/doctor');
const { resolveWorkflowRoot } = require('../workflow/common');

function usage() {
  console.log(`Usage: node scripts/release/cut_release.js --bump patch|minor|major [options]

Options:
  --date YYYY-MM-DD          Override the release date
  --package <path>           Override package.json path
  --product-version <path>   Override scripts/workflow/product_version.js path
  --changelog <path>         Override CHANGELOG.md path
  --allow-empty              Allow releasing with an empty Unreleased section
  --skip-doctor              Skip the source-repo doctor gate (for utility / fixture usage)
`);
}


function shouldRunDoctorGate(args) {
  return !args['skip-doctor']
    && !args.package
    && !args['product-version']
    && !args.changelog;
}

function runDoctorGate(cwd) {
  const report = buildDoctorReport(cwd, resolveWorkflowRoot(cwd));
  if (report.failCount > 0) {
    const failingChecks = report.checks.filter((item) => item.status === 'fail').slice(0, 5).map((item) => item.message).join(' | ');
    throw new Error(`doctor gate failed (${report.failCount} fail(s)). Run rai doctor --strict before cutting a release. ${failingChecks}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!args.bump) {
    throw new Error('Missing required --bump patch|minor|major argument.');
  }

  const paths = defaultPaths();
  const packagePath = args.package || paths.packageJson;
  const productVersionPath = args['product-version'] || paths.productVersion;
  const changelogPath = args.changelog || paths.changelog;
  const releaseDate = args.date || new Date().toISOString().slice(0, 10);

  if (shouldRunDoctorGate(args)) {
    runDoctorGate(process.cwd());
  }

  const pkg = readJson(packagePath);
  const currentVersion = String(pkg.version || '');
  const nextVersion = bumpVersion(currentVersion, args.bump);

  pkg.version = nextVersion;
  writeJson(packagePath, pkg);

  const productVersionContent = fs.readFileSync(productVersionPath, 'utf8');
  fs.writeFileSync(productVersionPath, replaceEmbeddedVersion(productVersionContent, nextVersion));

  const changelog = readChangelog(changelogPath);
  const nextChangelog = cutChangelogRelease(changelog, nextVersion, releaseDate, {
    allowEmpty: Boolean(args['allow-empty']),
  });
  fs.writeFileSync(changelogPath, nextChangelog);

  const tag = `v${nextVersion}`;
  console.log(`# RELEASE CUT`);
  console.log(`- Current version: \`${currentVersion}\``);
  console.log(`- Next version: \`${nextVersion}\``);
  console.log(`- Tag: \`${tag}\``);
  console.log(`- Date: \`${releaseDate}\``);

  writeGithubOutput({
    version: nextVersion,
    previous_version: currentVersion,
    tag,
    date: releaseDate,
  });
}

try {
  main();
} catch (error) {
  console.error(`release cut failed: ${error.message}`);
  process.exit(1);
}
