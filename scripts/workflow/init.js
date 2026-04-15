const path = require('node:path');
const { parseArgs, resolveTargetRepoArg } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  relativePath,
} = require('./install_common');

function printHelp() {
  console.log(`
init

Usage:
  node scripts/workflow/init.js [/path/to/repo] [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --force-docs           Overwrite an existing docs/workflow surface
  --script-profile <id>  Package script profile. Defaults to full for direct init
  --write-agents-template
                         Write docs/workflow/AGENTS_PATCH_TEMPLATE.md
  --overwrite-scripts    Replace conflicting package.json workflow scripts
  --skip-gitignore       Do not patch .gitignore with workflow runtime entries
  --skip-verify          Skip doctor/health/next/hud verification
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = resolveTargetRepoArg(args);
  const report = installWorkflowSurface(targetRepo, {
    mode: 'init',
    forceDocs: Boolean(args['force-docs']),
    scriptProfile: args['script-profile'] || 'full',
    overwriteScriptConflicts: Boolean(args['overwrite-scripts']),
    writeAgentsTemplate: Boolean(args['write-agents-template']),
    manageGitignore: !args['skip-gitignore'],
    verify: !args['skip-verify'],
  });

  console.log('# WORKFLOW INIT\n');
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }

  if (report.packageScripts.conflicts.length > 0) {
    console.log('\n## Package Script Conflicts\n');
    for (const conflict of report.packageScripts.conflicts) {
      console.log(`- \`${conflict.name}\` kept existing value -> \`${conflict.existing}\``);
    }
  }

  console.log('\n## Next\n');
  console.log(`- \`cd ${targetRepo}\``);
  console.log('- `npm run raiola:hud -- --compact`');
  console.log('- `npm run raiola:doctor -- --strict`');
  console.log('- `npm run raiola:next`');
  if (report.hudState) {
    console.log(`- HUD state file written to \`${relativePath(targetRepo, report.hudState.stateFile)}\``);
  }
}

main();
