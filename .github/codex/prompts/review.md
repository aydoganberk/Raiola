# Codex Review Prompt

Use this prompt when a pull request needs a structured Raiola review lane.

## Required outputs

1. Summarize the changed surfaces and highest-risk areas first.
2. Name the impacted packages or workspaces before proposing repo-wide actions.
3. Separate **proof**, **smoke**, and **assumption** clearly.
4. Call out verification debt, missing ownership, and release risk explicitly.
5. End with a compact ship recommendation: `ready`, `needs-more-proof`, or `blocked`.

## Review stance

- Prefer package-aware checks over blanket repo sweeps.
- Treat CI/release workflow edits, auth/payment changes, and broad write-scope diffs as elevated risk.
- If browser verification used smoke fallback, state that browser proof is degraded rather than implying full proof.
