# AGENTS

## Scope

This file applies to `scripts/**` unless a deeper `AGENTS.md` overrides it.

## Guidance

- Keep scripts deterministic, CLI-safe, and Node 22 compatible.
- Prefer small pure helpers over hidden global state.
- When adding file writes, preserve rollback safety and machine-readable JSON output.
- Do not encode repo-specific absolute paths or personal machine state.
