const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveTargetRepoArg } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  readProductManifest,
  readInstalledVersionMarker,
  sourcePackageVersion,
} = require('./install_common');

function printHelp() {
  console.log(`
update

Usage:
  node scripts/workflow/update.js [/path/to/repo] [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --source-root <path>   Optional Raiola package root to materialize/update from
  --refresh-docs         Refresh docs/workflow files from the latest templates
  --script-profile <id>  Package script profile. Defaults to the installed manifest profile
  --overwrite-scripts    Replace conflicting package.json workflow scripts
  --skip-gitignore       Do not patch .gitignore with workflow runtime entries
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

  const targetRepo = resolveTargetRepoArg(args);
  const mode = detectMode(targetRepo);
  const dryRun = Boolean(args['dry-run']);
  const installedVersion = readInstalledVersionMarker(targetRepo).installedVersion;
  const targetVersion = sourcePackageVersion();
  const installedManifest = readProductManifest(targetRepo);
  const payload = {
    targetRepo,
    mode,
    installedVersion,
    targetVersion,
    sourceRoot: args['source-root'] || null,
    scriptProfile: String(args['script-profile'] || installedManifest?.scriptProfile || 'full'),
    refreshDocs: Boolean(args['refresh-docs']),
    verify: !args['skip-verify'],
    overwriteScripts: Boolean(args['overwrite-scripts']),
    manageGitignore: !args['skip-gitignore'],
  };

  if (dryRun) {
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# RAIOLA UPDATE (DRY RUN)\n');
    console.log(`- Target: \`${targetRepo}\``);
    console.log(`- Mode: \`${mode}\``);
    console.log(`- Installed version: \`${installedVersion || 'unknown'}\``);
    console.log(`- Target version: \`${targetVersion}\``);
    console.log(`- Script profile: \`${payload.scriptProfile}\``);
    console.log(`- Refresh docs: \`${payload.refreshDocs ? 'yes' : 'no'}\``);
    console.log(`- Gitignore patching: \`${payload.manageGitignore ? 'yes' : 'no'}\``);
    console.log(`- Verify after update: \`${payload.verify ? 'yes' : 'no'}\``);
    return;
  }

  const report = installWorkflowSurface(targetRepo, {
    mode,
    sourceRoot: args['source-root'] || null,
    refreshDocs: payload.refreshDocs,
    scriptProfile: payload.scriptProfile,
    overwriteScriptConflicts: payload.overwriteScripts,
    manageGitignore: payload.manageGitignore,
    verify: payload.verify,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# RAIOLA UPDATE\n');
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }
  console.log('\n## Notes\n');
  console.log('- Canonical markdown stayed source-of-truth; only missing or explicitly refreshed surfaces were touched.');
  console.log('- Runtime scripts, skill surface, and generated state files were refreshed to the latest product shell.');
}

main();
