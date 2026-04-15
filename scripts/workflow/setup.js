const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const {
  formatInstallSummary,
  installWorkflowSurface,
  relativePath,
} = require('./install_common');
const { contractPayload } = require('./contract_versions');
const { buildSetupCompatibilityReport } = require('./setup_compatibility');

function printHelp() {
  console.log(`
setup

Usage:
  node scripts/workflow/setup.js [--target /path/to/repo]

Options:
  --target <path>        Target repository. Defaults to current working directory
  --dry-run              Show the exact write plan, compatibility risks, and rollback story without writing files
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

function buildSetupPayload(targetRepo, mode, scriptProfile, args, report = null, compatibilityOverride = null) {
  const compatibility = compatibilityOverride || buildSetupCompatibilityReport(targetRepo, {
    scriptProfile,
    manageGitignore: !args['skip-gitignore'],
  });
  return {
    ...contractPayload('setupPlan'),
    generatedAt: new Date().toISOString(),
    targetRepo,
    mode,
    docsExists: mode === 'migrate',
    scriptProfile,
    verify: !args['skip-verify'],
    overwriteScripts: Boolean(args['overwrite-scripts']),
    manageGitignore: !args['skip-gitignore'],
    writeAgentsTemplate: Boolean(args['write-agents-template']),
    compatibility,
    rollback: compatibility.rollback,
    report,
  };
}

function persistInstallReport(targetRepo, payload) {
  const filePath = path.join(targetRepo, '.workflow', 'install-report.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
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
  const scriptProfile = String(args['script-profile'] || (mode === 'init' ? 'pilot' : 'full'));

  if (dryRun) {
    const payload = buildSetupPayload(targetRepo, mode, scriptProfile, args);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# RAIOLA SETUP (DRY RUN)\n');
    console.log(`- Target: \`${targetRepo}\``);
    console.log(`- Mode: \`${mode}\``);
    console.log(`- Docs already exist: \`${mode === 'migrate' ? 'yes' : 'no'}\``);
    console.log(`- Script profile: \`${payload.scriptProfile}\``);
    console.log(`- Gitignore patching: \`${payload.manageGitignore ? 'enabled' : 'skipped'}\``);
    console.log(`- Verification: \`${payload.verify ? 'enabled' : 'skipped'}\``);
    console.log(`- Compatibility verdict: \`${payload.compatibility.verdict}\``);
    console.log(`- Planned runtime files: \`${payload.compatibility.plannedMutations.runtimeFileCount}\``);
    if (payload.compatibility.risks.length > 0) {
      console.log(`- Compatibility notes: \`${payload.compatibility.risks.map((item) => item.id).join(', ')}\``);
    }
    console.log(`- Rollback: \`${payload.rollback.command}\``);
    return;
  }

  const compatibilityBeforeInstall = buildSetupCompatibilityReport(targetRepo, {
    scriptProfile,
    manageGitignore: !args['skip-gitignore'],
  });

  const report = installWorkflowSurface(targetRepo, {
    mode,
    scriptProfile,
    overwriteScriptConflicts: Boolean(args['overwrite-scripts']),
    writeAgentsTemplate: Boolean(args['write-agents-template']),
    manageGitignore: !args['skip-gitignore'],
    verify: !args['skip-verify'],
  });
  const payload = buildSetupPayload(targetRepo, mode, scriptProfile, args, report, compatibilityBeforeInstall);
  const installReportPath = persistInstallReport(targetRepo, payload);

  if (args.json) {
    console.log(JSON.stringify({ ...payload, installReportPath: relativePath(targetRepo, installReportPath) }, null, 2));
    return;
  }

  console.log('# RAIOLA SETUP\n');
  console.log(`- Mode: \`${mode}\``);
  for (const line of formatInstallSummary(report)) {
    console.log(line);
  }
  console.log(`- Compatibility verdict: \`${payload.compatibility.verdict}\``);
  if (payload.compatibility.risks.length > 0) {
    console.log(`- Compatibility notes: \`${payload.compatibility.risks.map((item) => item.id).join(', ')}\``);
  }
  console.log(`- Install report: \`${relativePath(targetRepo, installReportPath)}\``);
  console.log(`- Rollback: \`${payload.rollback.command}\``);
  console.log('\n## First Five Minutes\n');
  console.log(`- \`cd ${targetRepo}\``);
  console.log('- `rai help quickstart`');
  console.log('- `rai setup --dry-run` when you need to inspect future updates before they touch package.json, .codex, or .workflow');
  console.log('- `rai doctor --strict`');
  console.log('- Optional: `rai codex setup --repo --enable-hooks` only if you want Raiola session hooks to run automatically in Codex');
  console.log('- `rai start recommend --goal "land the next safe slice"`');
  console.log('- `rai next`');
  if (report.hudState) {
    console.log(`- State surface refreshed at \`${relativePath(targetRepo, report.hudState.stateFile)}\``);
  }
}

main();
