# AGENTS

These files are Codex lifecycle hooks, not user-facing business logic.

- Keep hooks deterministic and fast.
- Emit guidance or denials only when the reason is concrete and actionable.
- Prefer reading `.codex/raiola-policy.json` and the closest `AGENTS.md` over inventing policy in code.
- Record native operator telemetry through the shared helpers instead of inventing new file formats.
