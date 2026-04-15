---
name: raiola-automation-curator
description: "Automation skill for Codex app automations, worktree-safe recurring tasks, and `codex exec --json` eval loops."
---

# raiola-automation-curator

Use this skill when a task should become repeatable instead of manually re-prompted.

## Focus

- turn recurring work into automation-ready prompts
- choose between local-project and dedicated-worktree runs
- keep no-findings/archive behavior explicit
- wire eval loops through `codex exec --json` traces

## Expected moves

- `rai codex operator --goal "<task>"`
- read `.codex/operator/evals/README.md`
- use `.codex/operator/evals/run_skill_evals.mjs` for deterministic trace capture
- prefer dedicated worktrees for review, repo audit, or release-prep automations
