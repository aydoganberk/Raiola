const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveTargetRepoArg } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  relativePath,
} = require('./install_common');

function printHelp() {
  console.log(`
migrate

Usage:
  node scripts/workflow/migrate.js [/path/to/repo] [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --refresh-docs         Refresh docs/workflow files from the latest starter templates
  --script-profile <id>  Package script profile. Defaults to existing manifest or full
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
  const docsRoot = path.join(targetRepo, 'docs', 'workflow');
  const mode = fs.existsSync(docsRoot) ? 'migrate' : 'init';
  const report = installWorkflowSurface(targetRepo, {
    mode,
    refreshDocs: Boolean(args['refresh-docs']),
    scriptProfile: args['script-profile'] || null,
    overwriteScriptConflicts: Boolean(args['overwrite-scripts']),
    writeAgentsTemplate: Boolean(args['write-agents-template']),
    manageGitignore: !args['skip-gitignore'],
    verify: !args['skip-verify'],
  });

  console.log('# WORKFLOW MIGRATE\n');
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }

  console.log('\n## Notes\n');
  if (mode === 'init') {
    console.log('- `docs/workflow` was missing, so migrate fell back to a clean init');
  } else {
    console.log('- Existing workflow markdown was preserved by default; missing files were added and runtime files were refreshed');
  }
  console.log('- Pass `--refresh-docs` only if you want starter template text to overwrite current workflow docs');

  if (report.packageScripts.conflicts.length > 0) {
    console.log('\n## Package Script Conflicts\n');
    for (const conflict of report.packageScripts.conflicts) {
      console.log(`- \`${conflict.name}\` kept existing value -> \`${conflict.existing}\``);
    }
  }

  console.log('\n## Next\n');
  console.log(`- \`cd ${targetRepo}\``);
  console.log('- `npm run raiola:hud`');
  console.log('- `npm run raiola:health -- --strict`');
  if (report.hudState) {
    console.log(`- HUD state file refreshed at \`${relativePath(targetRepo, report.hudState.stateFile)}\``);
  }
}

main();
