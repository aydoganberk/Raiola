const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  relativePath,
} = require('./install_common');

function printHelp() {
  console.log(`
setup

Usage:
  node scripts/workflow/setup.js [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --dry-run              Show which mode would run without writing files
  --script-profile <id>  Package script profile. Defaults to pilot on fresh setup and full on migrate
  --write-agents-template
                         Write docs/workflow/AGENTS_PATCH_TEMPLATE.md
  --overwrite-scripts    Replace conflicting package.json workflow scripts
  --skip-gitignore       Do not patch .gitignore with workflow runtime entries
  --skip-verify          Skip doctor/health/next/hud verification
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

  if (dryRun) {
    const scriptProfile = String(args['script-profile'] || (mode === 'init' ? 'pilot' : 'full'));
    const payload = {
      targetRepo,
      mode,
      docsExists: mode === 'migrate',
      scriptProfile,
      verify: !args['skip-verify'],
      overwriteScripts: Boolean(args['overwrite-scripts']),
      manageGitignore: !args['skip-gitignore'],
      writeAgentsTemplate: Boolean(args['write-agents-template']),
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# WORKFLOW SETUP (DRY RUN)\n');
    console.log(`- Target: \`${targetRepo}\``);
    console.log(`- Mode: \`${mode}\``);
    console.log(`- Docs already exist: \`${mode === 'migrate' ? 'yes' : 'no'}\``);
    console.log(`- Script profile: \`${payload.scriptProfile}\``);
    console.log(`- Gitignore patching: \`${payload.manageGitignore ? 'enabled' : 'skipped'}\``);
    console.log(`- Verification: \`${payload.verify ? 'enabled' : 'skipped'}\``);
    return;
  }

  const report = installWorkflowSurface(targetRepo, {
    mode,
    scriptProfile: args['script-profile'] || (mode === 'init' ? 'pilot' : 'full'),
    overwriteScriptConflicts: Boolean(args['overwrite-scripts']),
    writeAgentsTemplate: Boolean(args['write-agents-template']),
    manageGitignore: !args['skip-gitignore'],
    verify: !args['skip-verify'],
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# WORKFLOW SETUP\n');
  console.log(`- Mode: \`${mode}\``);
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }
  console.log('\n## First Five Minutes\n');
  console.log(`- \`cd ${targetRepo}\``);
  console.log('- `rai doctor --strict`');
  console.log('- `rai hud --compact`');
  console.log('- `rai next`');
  if (report.hudState) {
    console.log(`- State surface refreshed at \`${relativePath(targetRepo, report.hudState.stateFile)}\``);
  }
}

main();
