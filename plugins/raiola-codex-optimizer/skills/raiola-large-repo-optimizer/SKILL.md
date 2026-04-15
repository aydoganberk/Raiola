---
name: raiola-large-repo-optimizer
description: "Large-repo optimization skill for shard planning, bounded subagents, worktrees, and repo-audit-first execution."
---

# raiola-large-repo-optimizer

Use this skill when the repo is too large for a naive single-thread prompt.

## Focus

- shard first, edit second
- keep write scopes disjoint
- use repo-audit and monorepo planning before a correction wave
- prefer worktrees for recurring or long-running automation

## Expected moves

- `rai audit-repo --mode oneshot --goal "<task>"`
- `rai monorepo-mode --goal "<task>"`
- `rai codex operator --goal "<task>"`
- spawn `monorepo_planner`, `pr_explorer`, and `operator_supervisor` before opening a write lane
