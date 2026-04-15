# AGENTS

## Scope

This file applies to `scripts/workflow/**`.

## Guidance

- Preserve Raiola's repo-native contract: canonical workflow docs in `docs/workflow`, generated runtime under `.workflow`, native Codex surfaces under `.codex`.
- Favor stable JSON output for commands that support `--json`.
- When changing Codex integration, prefer native `.codex/config.toml`, `.codex/hooks.json`, `.codex/agents/*.toml`, `.agents/plugins/marketplace.json`, and first-party GitHub surfaces over Raiola-only mirrors.
- Keep approvals, sandboxing, and trust posture explicit in code and docs.
