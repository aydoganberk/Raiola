# Codex Evals Loop

This directory holds a minimal repeatable eval runner built around `codex exec --json` traces.

## Loop

1. Write a prompt set for the skill or workflow you care about.
2. Run `node run_skill_evals.mjs`.
3. Parse the JSONL traces and score deterministic checks.

Use this to tune skills, operator prompts, and large-repo routing.
