const { readStdin, findRepoRoot, loadPolicy, findClosestAgents, printJson, recordHookEvent } = require('./common');

module.exports.__handler = async function handle(input) {
  const repoRoot = findRepoRoot(input.cwd || process.cwd());
  const policy = loadPolicy(repoRoot);
  const closestAgents = findClosestAgents(input.cwd || process.cwd(), repoRoot);
  const rationale = Array.isArray(policy.selectionRationale) && policy.selectionRationale.length > 0
    ? `Why this profile: ${policy.selectionRationale.slice(0, 2).join(' ')}`
    : '';
  const boundary = policy.writeBoundary?.roots?.length
    ? `Write boundary: ${policy.writeBoundary.roots.join(', ')}.`
    : 'Write boundary: repo root.';
  const verify = policy.verifyContract?.requiredCommands?.length
    ? `Verify contract: ${policy.verifyContract.requiredCommands.slice(0, 3).join(' | ')}.`
    : 'Verify contract: targeted verification.';

  const context = [
    'Raiola native Codex layer is active.',
    `Active profile: ${policy.selectedProfile}.`,
    `Approvals: ${policy.approvalPolicy}; sandbox: ${policy.sandboxMode}; network: ${policy.networkAccess ? 'enabled in workspace-write' : 'restricted'}.`,
    closestAgents ? `Read the closest AGENTS.md before editing: ${closestAgents}.` : 'Read AGENTS.md guidance before editing.',
    'Treat docs/workflow/*.md as canonical workflow state and .workflow/* as generated runtime mirrors.',
    boundary,
    verify,
    rationale,
    policy.locked
      ? 'Trust Center is holding the repo in a locked posture. Prefer diagnosis, review, and planning over edits.'
      : policy.strict
        ? 'Trust posture is strict. Keep changes narrow and verification explicit.'
        : 'Keep work bounded, verification visible, and close with the next safest command.',
  ].filter(Boolean).join(' ');

  recordHookEvent(repoRoot, 'SessionStart', {
    decision: 'note',
    notes: [context],
    cwd: input.cwd || process.cwd(),
  });

  printJson({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  });
};

readStdin(module.exports.__handler);
