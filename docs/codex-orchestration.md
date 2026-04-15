# Codex Orchestration

Raiola now treats native Codex surfaces as the default orchestration layer.

## Building blocks

- `.codex/config.toml` defines repo-local runtime behavior.
- `.codex/hooks/*` ships the deterministic lifecycle checks, and `.codex/hooks.json` is registered only after explicit opt-in.
- `.codex/agents/*.toml` provides project-scoped subagents.
- `.agents/plugins/marketplace.json` exposes installable plugin packaging.
- `.github/codex/prompts/review.md` and `.github/workflows/codex-review.yml` provide first-party review entrypoints.

## Recommended loop

1. Seed the repo with `rai codex setup --repo`. Hooks stay off until you explicitly run `rai hooks enable` or `rai codex setup --repo --enable-hooks`.
2. Let the generated policy choose the native profile from repo shape, current task, changed/impacted packages, current risk, and verification debt.
3. Use the closest `AGENTS.md` plus project subagents for bounded work.
4. Run `rai codex operator --goal "..."` before widening scope.
5. Use `rai codex cockpit --goal "..." --json` when the session needs a relaunchable launch kit.
6. Review `rai codex telemetry --json` after the run to tighten the next pass.
7. Close with Raiola review and ship-readiness surfaces when the task needs explicit closeout.

## Native slash-command bias

Raiola should feel additive to native Codex UX, not like a separate universe. Prefer built-ins such as `/init`, `/agent`, `/permissions`, and `/status` when they fit, then use Raiola commands for repo operating discipline and closeout.

## Compression layer

### Profile overlays are behavior packs

The named profiles should not behave like cosmetic labels. Raiola now carries per-profile overlays for:

- approval posture
- sandbox mode
- network access
- agent thread/depth budget
- write-scope mode
- verify mode
- package-first vs browser-proof preference

That means `raiola-monorepo` can stay package-contract-first, `raiola-frontend` can keep browser-proof bias visible, and `raiola-strict` can tighten command policy without pretending every profile is the same native session with a different sticker.


The core surface should stay narrow even when the product has deeper capability packs. The default foreground is a handful of golden paths:

- `Start safe` -> `rai start`, `rai do`, `rai next`
- `Prove and close` -> `rai verify-work --json`, `rai doctor --json`, `rai handoff`
- `Shape Codex session` -> `rai codex operator --goal "..."`, `rai codex cockpit --goal "..." --json`
- `Monorepo audit` -> `rai monorepo`, `rai review-orchestrate`, `rai audit-repo --mode oneshot --json` when repo truth says package-aware routing matters
- `Mobile surface` -> `rai map-frontend --json` when nested Expo/React Native packages make mobile work first-class inside the monorepo
- `API contract` -> `rai api-surface --json`, `rai trust --json` when Hono/Express/auth/data-store changes need package-aware proof rather than browser-only proof
- `Ship` -> `rai release-control`, `rai control-plane-publish` when closeout/export work is active

`repo-config` can still open advanced packs such as frontend, monorepo, trust, and CLI-specific overlays, but operators should not need the full internal vocabulary just to stay productive on the daily path.

## Codex-first operator packet

Use `rai codex operator --goal "..."` when the main question is how to shape the native Codex session itself. The packet names the right repo-local `CODEX_HOME`, the recommended profile, slash flow, subagents, automation/worktree posture, active write boundary, verify contract, and first-party entrypoints such as `codex exec`, `codex mcp-server`, and `codex app-server`.

Use `rai codex cockpit --goal "..." --json` when those operator decisions should become a runnable launch kit with manifest, session prompt, slash flow, launcher scripts, context pack, prompt pack, and resume card.

Use `rai codex telemetry --json` when you need a reviewable summary of denials, warnings, interruptions, and steering events captured by the native hooks.

Use `rai codex managed-export --json` when those Trust Center decisions should become a deployable native `requirements.toml` template for managed Codex environments.
