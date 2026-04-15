const { readStdin, findRepoRoot, loadPolicy, printJson, recordHookEvent } = require('./common');

module.exports.__handler = async function handle(input) {
  const repoRoot = findRepoRoot(input.cwd || process.cwd());
  const policy = loadPolicy(repoRoot);
  const command = String(input.tool_input?.command || '');
  const response = typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response || {});
  const notes = [];

  if (/not a git repository/i.test(response)) {
    notes.push('This project may be running outside a Git checkout. Use .codex project root markers and repo-local paths instead of assuming git metadata is present.');
  }
  if (/permission denied|operation not permitted/i.test(response) && policy.sandboxMode === 'read-only') {
    notes.push('The active Raiola profile is read-only. Tighten the plan or switch permissions before retrying write operations.');
  }
  if (/\.workflow\//.test(command)) {
    notes.push('A generated workflow surface changed. Re-check docs/workflow canonical sources before closeout.');
  }
  if (notes.length === 0) {
    return;
  }

  recordHookEvent(repoRoot, 'PostToolUse', {
    decision: 'interrupt',
    command,
    notes,
  });

  printJson({
    continue: false,
    systemMessage: notes[0],
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: notes.join(' '),
    },
  });
};

readStdin(module.exports.__handler);
