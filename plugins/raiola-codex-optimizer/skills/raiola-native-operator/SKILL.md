---
name: raiola-native-operator
description: "Codex-first operator skill for native session shaping, slash flow, app-server/MCP choice, and trust-aware posture."
---

# raiola-native-operator

Use this skill when the main question is **how Codex should operate**, not just what code to change.

## Focus

- start from native Codex surfaces first
- choose the right profile, sandbox posture, and approval posture
- recommend the smallest safe entrypoint among interactive, `codex exec`, MCP server, and app-server
- suggest the right built-in slash sequence before edits expand

## Expected moves

1. Run `rai codex operator --goal "<task>"`.
2. Read the generated operator packet and the closest `AGENTS.md`.
3. Start native Codex with `CODEX_HOME=$(pwd)/.codex` so repo-local config becomes the operator home.
4. Use `/status`, `/permissions`, `/agent`, `/mcp`, `/review`, and `/plan-mode` intentionally.

## When to escalate

Escalate to release, large-repo, or automation skills when the task becomes cross-cutting, recurring, or release-facing.
