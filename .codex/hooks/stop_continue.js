const { readStdin, findRepoRoot, loadPolicy, printJson, recordHookEvent } = require('./common');

module.exports.__handler = async function handle(input) {
  const repoRoot = findRepoRoot(input.cwd || process.cwd());
  const policy = loadPolicy(repoRoot);
  const alreadyContinued = Boolean(input.stop_hook_active);
  const gaps = Number(policy.pendingApprovals || 0) + Number(policy.verificationGaps || 0) + Number(policy.missingEvidence || 0);

  if (alreadyContinued || gaps === 0) {
    printJson({ continue: true });
    return;
  }

  recordHookEvent(repoRoot, 'StopContinue', {
    decision: 'block',
    blockerCount: gaps,
    reason: 'Before stopping, summarize the remaining Raiola blockers from .codex/raiola-policy.json and name the next safest command to clear them.',
  });

  printJson({
    decision: 'block',
    reason: 'Before stopping, summarize the remaining Raiola blockers from .codex/raiola-policy.json and name the next safest command to clear them.',
  });
};

readStdin(module.exports.__handler);
