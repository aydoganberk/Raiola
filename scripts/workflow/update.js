const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  readInstalledVersionMarker,
  sourcePackageVersion,
} = require('./install_common');

function printHelp() {
  console.log(`
update

Usage:
  node scripts/workflow/update.js [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --refresh-docs         Refresh docs/workflow files from the latest templates
  --overwrite-scripts    Replace conflicting package.json workflow scripts
  --skip-verify          Skip doctor/health/next/hud verification
  --dry-run              Show which update path would run
  --json                 Print machine-readable output
  `);
}

function detectMode(targetRepo) {
  return fs.existsSync(path.join(targetRepo, 'docs', 'workflow')) ? 'migrate' : 'init';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = path.resolve(process.cwd(), String(args.target || '.'));
  const mode = detectMode(targetRepo);
  const dryRun = Boolean(args['dry-run']);
  const installedVersion = readInstalledVersionMarker(targetRepo).installedVersion;
  const targetVersion = sourcePackageVersion();
  const payload = {
    targetRepo,
    mode,
    installedVersion,
    targetVersion,
    refreshDocs: Boolean(args['refresh-docs']),
    verify: !args['skip-verify'],
    overwriteScripts: Boolean(args['overwrite-scripts']),
  };

  if (dryRun) {
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# WORKFLOW UPDATE (DRY RUN)\n');
    console.log(`- Target: \`${targetRepo}\``);
    console.log(`- Mode: \`${mode}\``);
    console.log(`- Installed version: \`${installedVersion || 'unknown'}\``);
    console.log(`- Target version: \`${targetVersion}\``);
    console.log(`- Refresh docs: \`${payload.refreshDocs ? 'yes' : 'no'}\``);
    console.log(`- Verify after update: \`${payload.verify ? 'yes' : 'no'}\``);
    return;
  }

  const report = installWorkflowSurface(targetRepo, {
    mode,
    refreshDocs: payload.refreshDocs,
    overwriteScriptConflicts: payload.overwriteScripts,
    verify: payload.verify,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# WORKFLOW UPDATE\n');
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }
  console.log('\n## Notes\n');
  console.log('- Canonical markdown stayed source-of-truth; only missing or explicitly refreshed surfaces were touched.');
  console.log('- Runtime scripts, skill surface, and generated state files were refreshed to the latest product shell.');
}

main();
