# raiola skill pack

`raiola` now ships as a portable skill pack plus a compatibility entrypoint.

## What Changed

- `skill/SKILL.md` remains the compatibility entrypoint and now behaves like a meta-skill.
- The smaller targeted skills live under [`../skills`](../skills).
- The lifecycle facade is now the preferred first layer:
  - `rai spec`
  - `rai plan`
  - `rai build`
  - `rai test`
  - `rai simplify`
  - `rai review`
  - `rai ship`

## Skill Pack

- `using-raiola`
  Discovery and explicit opt-in rules
- `raiola-milestone-lifecycle`
  Full milestone contract
- `raiola-quick-lane`
  Narrow tasks with visible artifacts
- `raiola-review-closeout`
  Review, verification, and ship package discipline
- `raiola-team-orchestration`
  Parallel work with write-scope rules
- `raiola-frontend-lane`
  Frontend specialization and browser-backed visual proof
- `raiola-monorepo-mode`
  Large-repo staged analysis
- `raiola-code-simplification`
  Behavior-preserving cleanup lane

## Personas

- `agents/code-reviewer.md`
- `agents/test-engineer.md`
- `agents/security-auditor.md`

## References

- `references/testing-checklist.md`
- `references/security-checklist.md`
- `references/accessibility-checklist.md`
- `references/ship-readiness-checklist.md`

## Packaging Surfaces

- Claude commands: `.claude/commands/`
- Claude plugin metadata: `.claude-plugin/`
- Session-start hook: `hooks/session-start.sh`
- Root repo instructions: `AGENTS.md`

## Installed Repo Surface

`rai setup` still copies the compatibility skill to `.agents/skills/raiola/SKILL.md`.
The expanded skill pack is also installed into `.agents/skills/*` so downstream repos get the same discovery model without needing the full source tree.
- Creating a second source of truth instead of using `EXECPLAN.md`
- Closing a milestone before filling out `VALIDATION.md`
- Treating `CARRYFORWARD.md` and `SEEDS.md` as the same thing
- Creating a named workstream but still operating against the old root

## Short checklist

- Is the active root correct?
- Are the active milestone and active step explicit?
- Is `CONTEXT.md` up to date after research?
- Is `EXECPLAN.md` written as dependency-aware execution waves?
- Is `VALIDATION.md` narrowed to milestone scope?
- If frontend mode is active, did `raiola:map-frontend` run and did `VALIDATION.md` expand the visual verdict rows?
- Is `raiola:health -- --strict` clean when it needs to be?
