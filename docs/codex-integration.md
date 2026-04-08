# Codex Integration

`rai codex` is the safe control-plane layer for repo-local Codex usage.

## What it manages

- generated config at `.workflow/runtime/codex-control/repo-codex/config.toml`
- a virtual repo-local `.codex` root that is kept rollback-safe inside the workflow runtime area
- repo-derived roles under `.workflow/runtime/codex-control/repo-codex/roles/`
- prompt catalog under `.workflow/runtime/codex-control/repo-codex/prompts/`
- skill installs under `.workflow/runtime/codex-control/repo-codex/skills/`
- backup journal under `.workflow/runtime/codex-control/journal.jsonl`

## Core flows

- `rai codex setup --repo`
- `rai codex diff-config --repo`
- `rai codex doctor --repo`
- `rai codex rollback --repo`
- `rai codex sync --repo`
- `rai codex scaffold-role --from repo-profile`

## Safety notes

- every mutating action snapshots the current control-plane state first
- rollback restores the latest backup journal entry
- the repo sandbox may block a literal `.codex/` directory, so the generated mirror lives under `.workflow/runtime/codex-control/`
- this keeps the flow deterministic for `setup`, `doctor`, `repair`, and test fixtures
