# Large Repo Runbook

1. Start with `rai codex operator --goal "audit the large repo"`.
2. Launch Codex with the repo-local home and the generated profile.
3. Use `/plan-mode`, `/status`, `/agent`, and `/mcp` before editing.
4. Run `monorepo_planner` + `pr_explorer` first, then open a bounded fix lane only after the shard map is explicit.
5. Prefer dedicated worktrees for recurring review or correction loops.
