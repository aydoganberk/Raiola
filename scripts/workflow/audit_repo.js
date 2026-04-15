const path = require('node:path');
const { parseArgs } = require('./common');
const { runRepoAudit } = require('./repo_audit_engine');

function printHelp() {
  console.log(`
audit_repo

Usage:
  node scripts/workflow/audit_repo.js

Options:
  --repo <path>       Inspect a local repo snapshot without changing directories
  --goal <text>       Goal text for the audit report and prompt pack
  --mode <name>       oneshot|focused. Defaults to oneshot
  --stack <name>      Optional stack override such as flutter-firebase
  --refresh <mode>    incremental|full file index refresh. Defaults to incremental
  --json              Print machine-readable output
  `);
}

function resolveTargetRepo(cwd, requestedRepo) {
  if (!requestedRepo) {
    return cwd;
  }
  return path.resolve(cwd, String(requestedRepo));
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const targetRepo = resolveTargetRepo(process.cwd(), args.repo);
  const payload = runRepoAudit(targetRepo, {
    goal: args.goal || args._.join(' '),
    mode: args.mode,
    stack: args.stack,
    refresh: args.refresh,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# REPO AUDIT\n');
  console.log(`- Repo: \`${targetRepo}\``);
  console.log(`- Mode: \`${payload.mode}\``);
  console.log(`- Repo shape: \`${payload.repoShape}\``);
  console.log(`- Stack pack: \`${payload.stackPack.label}\``);
  console.log(`- Repo health: \`${payload.repoHealth.verdict}\``);
  console.log(`- Score: \`${payload.repoHealth.score}\``);
  console.log(`- Verified findings: \`${payload.findings.verified.length}\``);
  console.log(`- Probable findings: \`${payload.findings.probable.length}\``);
  console.log(`- Heuristic observations: \`${payload.findings.heuristic.length}\``);
  if (payload.outputPathRelative) {
    console.log(`- Report: \`${payload.outputPathRelative}\``);
  }
  if (payload.controlPlane?.artifacts?.correctionControlMarkdown) {
    console.log(`- Control plane: \`${payload.controlPlane.artifacts.correctionControlMarkdown}\``);
  }
  if (payload.controlPlane?.artifacts?.findingsRegistry) {
    console.log(`- Findings registry: \`${payload.controlPlane.artifacts.findingsRegistry}\``);
  }
  if (payload.artifacts?.prompts) {
    console.log(`- Prompt pack: \`${payload.artifacts.prompts}\``);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  resolveTargetRepo,
};
