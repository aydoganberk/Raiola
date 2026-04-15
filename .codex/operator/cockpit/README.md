# Codex Cockpit

Use `rai codex cockpit --goal "..." --json` to materialize a runnable native Codex launch kit.

## Output set

- session prompt and slash flow ready to paste or reopen
- launch scripts for interactive, `codex exec`, remote TUI, app-server, Agents SDK, evals, telemetry, and managed export
- manifest, automation brief, context pack, prompt pack, and resume card references

## Why it exists

This gives Codex a repo-native operating layer that can be resumed, shared, and relaunched without reconstructing the operator context from memory.

## Core loop

1. Run `rai codex operator --goal "..."`.
2. Run `rai codex cockpit --goal "..." --json`.
3. Open `.workflow/runtime/codex-control/cockpit/launch/` and use the preferred launcher.
4. Keep the generated `session-prompt.txt` and `slash-flow.md` beside the live session.
