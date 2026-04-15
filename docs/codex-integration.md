# Codex Integration

`rai codex` now manages a real native Codex project layer.

## What it manages

- repo-local config at `.codex/config.toml`
- native hook assets at `.codex/hooks/*` and an opt-in `.codex/hooks.json` registration when enabled
- project subagents at `.codex/agents/*.toml`
- trust-aware policy snapshots at `.codex/raiola-policy.json`
- repo-derived role and prompt helpers at `.codex/roles/*` and `.codex/prompts/*`
- backup journal at `.workflow/runtime/codex-control/journal.jsonl`
- cockpit and telemetry runtime surfaces under `.workflow/runtime/codex-control/*`

The source repository also ships a portable Codex-facing pack with:

- `skills/*`
- `agents/*`
- `references/*`
- `.agents/plugins/marketplace.json`
- `plugins/raiola-codex-optimizer/`
- `.github/codex/prompts/review.md`
- `.github/workflows/codex-review.yml`
- `.claude/commands/*` and `.claude-plugin/*` for compatibility

## Core flows

- `rai codex setup --repo`
- `rai codex setup --repo --enable-hooks` when you want session-start and tool-policy hooks active
- `rai codex diff-config --repo`
- `rai codex doctor --repo`
- `rai codex rollback --repo`
- `rai codex sync --repo`
- `rai codex scaffold-role --from repo-profile`
- `rai codex cockpit --goal "..." --json`
- `rai codex telemetry --json`
- `rai codex install-skill --role <name>`
- `rai codex remove-skill --role <name>`

## Trust to runtime mapping

Raiola no longer stops at reporting risk. The generated native config maps repo signals and Trust Center posture into real Codex behavior:

- `approval_policy`
- `sandbox_mode`
- workspace-write network access
- profile selection
- subagent thread/depth limits
- task-aware write boundaries
- verify contracts that keep browser proof/package proof degrade states explicit

This keeps risk discussions and actual Codex runtime behavior aligned.

## Task-aware policy selection

Profile choice is no longer repo-only. Raiola combines repo shape, current task text, changed/impacted packages, trust posture, and verification debt so the selected profile also carries the expected write boundary and verify contract for the current job. Raw monorepos no longer need the full workflow scaffold to surface hybrid package shapes first: nested Next.js web packages, Expo/React Native mobile packages, and Hono/Express API packages can all contribute directly to the task-aware profile and package-level verify contract.

## Hook posture

The native hook layer now enforces more than obvious destructive-command regexes. It warns or denies repo-wide mutation commands, release/publish actions outside explicit closeout lanes, writes outside the current boundary, protected runtime/tooling path edits, and CI/GitHub workflow changes that should keep verification debt visible. Package-manager script launches are also introspected so `npm run`/`pnpm run`/`yarn run` inherit the same denylist, boundary, and release-risk checks as the underlying script body instead of bypassing policy behind a wrapper command.

## Profile overlays, not labels

Profile names now map to concrete behavior overlays. Switching profiles changes thread/depth limits, network posture, write-scope mode, and verify mode so the native Codex session actually feels different instead of only carrying a different label.

## Layered guidance

Use the closest `AGENTS.md` for each file. Raiola ships top-level guidance plus deeper files for workflow code, docs, skills, and GitHub automation so Codex review behavior stays granular in larger repos.

## Default skill story

Installed repos still get `.agents/skills/raiola/SKILL.md` as the compatibility entrypoint. The expanded pack is copied into `.agents/skills/*`, and the native plugin marketplace points at `plugins/raiola-codex-optimizer/`.
