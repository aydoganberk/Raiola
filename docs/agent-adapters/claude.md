# Claude adapter

Wave 5 chooses Claude as the single adapter that gets a real hook/session integration. The readiness claim for Claude is no longer based on file presence alone. It is based on a verified lifecycle flowing through the runtime bridge.

## What “ready” means now

Claude is only treated as fully operational when the runtime has observed and persisted the lifecycle chain below:

- `sessionStart`
- `beforeCommand`
- `afterCommand`
- `patchApplied` (derived)
- `verificationRequested` (derived)
- `sessionEnd`

A declared hook config without observed events remains guided or partial support, not verified support.

## Contract

The adapter contract lives in `scripts/workflow/adapter_contract.js`.

Claude hook events map to the shared contract like this:

| Claude hook | Shared lifecycle event |
| --- | --- |
| `SessionStart` | `sessionStart` |
| `PreToolUse` | `beforeCommand` |
| `PostToolUse` | `afterCommand` |
| `SessionEnd` | `sessionEnd` |

Two lifecycle events are intentionally derived from command traffic:

- `patchApplied` is raised when the tool command matches patch/apply style operations.
- `verificationRequested` is raised when the tool command matches verify/test/build style operations.

## Bridge files

The file-backed bridge lives in `scripts/workflow/adapter_hooks_bridge.js`.

At runtime it writes:

- `.workflow/runtime/adapter-hooks/claude/state.json`
- `.workflow/runtime/adapter-hooks/claude/events.jsonl`
- `.workflow/runtime/adapter-hooks/claude/summary.json`
- `.workflow/telemetry/adapter-hooks.json`

Those artifacts are what `agent_runtime` now reads to decide whether Claude is merely configured, partially observed, or lifecycle-verified.

## Expected workspace files

A Claude-enabled workspace is expected to contain:

- `.claude-plugin/plugin.json`
- `.claude/commands/*.md`
- `.claude/hooks/session_start.js`
- `.claude/hooks/pre_tool_use.js`
- `.claude/hooks/post_tool_use.js`
- `.claude/hooks/session_end.js`

The hooks call the bridge runner and pass through the hook payload.

## Failure modes surfaced to runtime

Wave 5 promotes hook failures into runtime-visible signals instead of hiding them behind a “hook files found” check:

- `hook_missing`
- `transport_unavailable`
- `event_parse_failed`
- `partial_support`

`agent_runtime` includes those failures in the adapter summary so readiness can be explained, not guessed.

## Installation + verification flow

1. Install the Claude plugin and command markdown files.
2. Install the four hook wrapper scripts.
3. Run a Claude session that triggers at least one real command.
4. Confirm that `summary.json` shows the lifecycle chain and that `agent_runtime` reports Claude as hook-lifecycle verified.

## Current limitations

- The bridge is file-based, so it verifies lifecycle observation rather than deep transport semantics.
- `patchApplied` and `verificationRequested` are derived from command intent and can undercount exotic workflows.
- A workspace with declared hooks but no observed events is intentionally not upgraded to verified readiness.
