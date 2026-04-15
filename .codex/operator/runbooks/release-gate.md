# Release Gate Runbook

1. Refresh `rai trust`, `rai release-control`, and `rai handoff`.
2. Run `rai codex managed-export --json` when you need a deployable managed Codex policy.
3. Use `release_gatekeeper` and `trust_analyst` before any approval or ship decision.
4. Keep migration notes, rollback hints, and verification evidence visible in the final closeout.
