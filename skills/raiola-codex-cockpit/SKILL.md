---
name: raiola-codex-cockpit
description: "Cockpit skill for generating runnable Codex launch kits with launchers, continuity packs, and preferred-entrypoint guidance."
---

# raiola-codex-cockpit

Use this skill when the session should become **relaunchable, shareable, and continuity-safe**, not just well prompted once.

## Focus

- materialize a runnable native Codex launch kit
- keep session genome, prompt/context packs, and resume surfaces explicit
- choose the safest preferred entrypoint among interactive, `codex exec`, app-server, remote TUI, Agents SDK, and eval loops
- preserve slash flow and launcher scripts so the session can restart without recomputing operator context

## Expected moves

1. Run `rai codex operator --goal "<task>"`.
2. Run `rai codex cockpit --goal "<task>" --json`.
3. Open `.workflow/runtime/codex-control/cockpit/launch/` and use the preferred launcher first.
4. Keep `session-prompt.txt`, `slash-flow.md`, and the resume card visible while operating.

## When to escalate

Escalate to telemetry review when the session drifted, or to automation curation when the same cockpit should become a recurring workflow.
