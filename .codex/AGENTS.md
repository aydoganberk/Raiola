# AGENTS

This `.codex/` directory is the native Raiola operator layer for Codex.

## Working rules

- Keep `.codex/config.toml`, hooks, subagents, and operator templates aligned.
- Treat `.workflow/` runtime state as derived unless a document explicitly says otherwise.
- Use `rai codex operator` before large, risky, or cross-surface tasks.
- Use `rai codex cockpit` when a task needs a runnable launch kit, resume surface, and operator packet bundle.
- Use `rai codex telemetry --json` to review the native hook flight recorder before repeating or widening the session.
- Use `rai codex managed-export` when Trust Center decisions need to become deployable native requirements.

## Current generated posture

- Native profile: `raiola-monorepo`
- Approval policy: `on-request`
- Sandbox mode: `workspace-write`
