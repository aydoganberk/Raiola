const { readStdin, findRepoRoot, loadPolicy, findClosestAgents, printJson, recordHookEvent } = require('./common');

module.exports.__handler = async function handle(input) {
  const repoRoot = findRepoRoot(input.cwd || process.cwd());
  const policy = loadPolicy(repoRoot);
  const prompt = String(input.prompt || '');
  const closestAgents = findClosestAgents(input.cwd || process.cwd(), repoRoot);
  const notes = [];

  if (/ignore\s+agents|skip\s+review|skip\s+verify|ship\s+it\s+now/i.test(prompt)) {
    notes.push('Do not bypass AGENTS guidance, review, or verification without explicitly recording the reason.');
  }
  if (policy.repoSignals?.monorepo && /review|plan|large repo|monorepo/i.test(prompt)) {
    notes.push('This repo has monorepo signals. Prefer /agent with monorepo_planner or ask Raiola to shard the work before editing.');
  }
  if (policy.repoSignals?.frontend && /ui|frontend|design|browser/i.test(prompt)) {
    notes.push('This repo has frontend signals. Prefer the frontend lane, browser evidence, and state-aware review for user-visible changes.');
  }
  if (closestAgents) {
    notes.push(`Closest AGENTS guidance: ${closestAgents}.`);
  }

  if (notes.length === 0) {
    return;
  }

  recordHookEvent(repoRoot, 'UserPromptSubmit', {
    decision: 'note',
    prompt,
    notes,
  });

  printJson({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: notes.join(' '),
    },
  });
};

readStdin(module.exports.__handler);
