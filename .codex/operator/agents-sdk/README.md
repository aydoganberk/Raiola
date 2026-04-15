# Agents SDK + Codex MCP

Use the scaffold in this folder when a task needs a reviewable multi-agent pipeline instead of a single interactive thread.

## Entry points

- `python codex_operator_pipeline.py` -> runs a bounded supervisor pipeline against `codex mcp-server`
- Set `CODEX_HOME=$(pwd)/.codex` so the pipeline uses repo-local profiles and MCP config

## Suggested use cases

- large-repo shard mapping
- release gating
- read-only review fan-out followed by a narrow patch lane
