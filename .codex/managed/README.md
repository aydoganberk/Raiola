# Managed Requirements

Raiola keeps managed Codex policy as an exportable template, not as a silently enforced repo-local file.

Use `rai codex managed-export --json` to write a `requirements.toml` template under `.workflow/exports/codex/`.
Then deploy that file to cloud-managed Codex requirements or `/etc/codex/requirements.toml` on trusted machines.
