---
name: raiola
description: "Portable Raiola meta-skill. Use when deciding whether to activate Raiola workflow, when choosing the lifecycle facade command, or when routing into a targeted Raiola skill pack."
---

# raiola

Raiola is a repo-native operator layer for Codex. Treat this skill as the **router**, not as the heavy workflow itself.

## Use this skill when

- you need to decide whether the task actually benefits from workflow discipline
- you want the thinnest safe entry into Raiola from a native Codex session
- you need to choose between operator, review, release, frontend, large-repo, automation, or milestone lanes

Do **not** activate the full workflow just because Raiola is installed.

## Preferred entrypoints

Start with the smallest useful surface:

- `rai spec`
- `rai plan`
- `rai build`
- `rai test`
- `rai simplify`
- `rai review`
- `rai ship`
- `rai codex operator --goal "..."`

Use the deeper workflow shell only when continuity, auditability, orchestration, or explicit release control is actually needed.

## Routing map

- Native operator and Codex-first session shaping -> `raiola-native-operator`
- General discovery and opt-in -> `using-raiola`
- Full milestone contract -> `raiola-milestone-lifecycle`
- Narrow tasks -> `raiola-quick-lane`
- Review and closeout -> `raiola-review-closeout`
- Release gates and ship decisions -> `raiola-release-gate`
- Large repo optimization -> `raiola-large-repo-optimizer`
- Automation and worktree recipes -> `raiola-automation-curator`
- Delegation and bounded parallelism -> `raiola-team-orchestration`
- Frontend specialization -> `raiola-frontend-lane`
- Behavior-preserving cleanup -> `raiola-code-simplification`

## Non-negotiables

1. Workflow remains explicit opt-in.
2. Markdown stays canonical once workflow is active.
3. Verification must be visible and evidence-backed.
4. Delegation requires bounded write scope.
5. Trust and release calls should tighten native Codex posture, not just produce prose.

## Verification

- [ ] A thin native entrypoint was considered first.
- [ ] The chosen lane matches the real task, not just the repo shape.
- [ ] Verification and closeout expectations are explicit before edits widen.
