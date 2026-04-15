# Codex App Server Notes

Use `codex app-server` when Raiola needs a deep, event-streaming integration instead of plain CLI control.

## Local remote-TUI loop

- Start the server: `CODEX_HOME=$(pwd)/.codex codex app-server --listen ws://127.0.0.1:4500`
- Connect the TUI: `CODEX_HOME=$(pwd)/.codex codex --remote ws://127.0.0.1:4500`

Keep non-local listeners behind authentication and TLS before real remote use.
