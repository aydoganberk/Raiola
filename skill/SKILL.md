---
name: raiola
description: "Portable Raiola meta-skill. Use when deciding whether to activate Raiola workflow, when choosing the lifecycle facade command, or when routing into a targeted Raiola skill pack."
---

# raiola

This is the compatibility entrypoint for the Raiola skill pack.
It should behave like a meta-skill: choose the right Raiola lane, keep workflow explicit opt-in, and route to the smaller targeted skills instead of loading the entire workflow contract by default.

## When To Use

- When starting a session in a repo that ships Raiola
- When deciding whether a request needs workflow at all
- When choosing between quick mode, full milestones, review, frontend, monorepo, team, or simplify lanes

Do not activate full workflow just because Raiola is present.

## Lifecycle Facade

Prefer the thin lifecycle facade first:

- `rai spec`
- `rai plan`
- `rai build`
- `rai test`
- `rai simplify`
- `rai review`
- `rai ship`

Use the full workflow shell only when the task explicitly benefits from canonical docs, checkpoints, or bounded orchestration.

## Skill Routing

- Discovery and opt-in rules -> `using-raiola`
- Full milestone contract -> `raiola-milestone-lifecycle`
- Narrow tasks -> `raiola-quick-lane`
- Review and closeout -> `raiola-review-closeout`
- Delegation and bounded parallelism -> `raiola-team-orchestration`
- Frontend specialization -> `raiola-frontend-lane`
- Large repo staging -> `raiola-monorepo-mode`
- Behavior-preserving cleanup -> `raiola-code-simplification`

## Non-Negotiables

1. Workflow remains explicit opt-in.
2. Markdown is canonical once workflow is active.
3. Verification must be explicit and evidence-backed.
4. Delegation requires disjoint write scopes.
5. `.workflow/state.json` and other runtime JSON files are derived, not authoritative.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Raiola is installed, so everything should use workflow." | Workflow overhead only makes sense when continuity, auditability, or orchestration are real needs. |
| "I can skip the lifecycle facade because I know the right deep command." | The facade exists to make the safe entrypoint obvious and portable. |
| "State can stay in chat because this is only one session." | Raiola exists because one session is not a trustworthy control plane. |

## Verification

 - [ ] Raiola was activated only when appropriate
 - [ ] The lifecycle facade or a targeted skill was selected intentionally
 - [ ] Verification expectations are visible before edits expand
  - `Use when React/TSX surfaces are active`
- `web-design-guidelines`
  - `Use when frontend mode is active so visual, accessibility, and UX checks stay explicit`
- `figma-implement-design`
  - `Use when Figma links or design implementation intent are present`
- `browser-verify`
  - `Use when preview/dev-server/browser verification or screenshot evidence is needed`

## Visual Verdict Protocol

- `responsive`
  - `Check desktop/mobile or equivalent breakpoint behavior`
- `interaction`
  - `Check primary UI states and interactions`
- `visual consistency`
  - `Check typography, spacing, color, and motion coherence`
- `component reuse`
  - `Check reuse of shared UI primitives or design-system surfaces`
- `accessibility smoke`
  - `Check basic focus, labels, semantics, and obvious accessibility gaps`
- `screenshot evidence`
  - `Capture or reference a visual artifact when frontend mode is active`

## Wave-Based Execute Rules

- `Wave 1` is for dependency-free foundation or prep work.
- `Wave 2` is for work that depends only on completed wave 1 outputs.
- `Wave 3` is for final integration, shared-surface work, or execution closeout before audit.
- `Only dependency-free chunks may be grouped into the same wave.`
- `If a dependency is unclear, serialize it on main or move it to a later wave.`
- `Every write-capable chunk must name an owner and explicit write scope in EXECPLAN.md before a worker starts.`
- `Parallelism is dependency-aware, not random; idle capacity alone is not a reason to spawn workers.`
- `The orchestrator should wait for the active wave, integrate results, refresh plan/status state, then advance to the next wave.`

## Commit Granularity

- Read the repo-default policy from `PREFERENCES.md -> Commit granularity`.
- `manual`
  - `Default. Commits stay explicit and usually happen during normal closeout unless the user chooses otherwise.`
- `phase`
  - `Prefer one integrated commit at a phase boundary, usually after execute or complete.`
- `chunk`
  - `Allow chunk-level commits after integration when that chunk is complete and safe to checkpoint.`
- `Atomic commit mode` is a per-milestone execute override written in `EXECPLAN.md`:
  - `off`
  - `wave`
  - `chunk`
- `wave` means commit only after a full wave has been integrated.
- `chunk` means commit only after an individual chunk has been integrated.
- `Atomic commit mode` is optional; do not force it unless the plan or user explicitly wants it.

## Failure Playbook

- `Hash drift`
  - `raiola:packet -- --all --sync -> raiola:window -- --sync -> raiola:health -- --strict`
- `Active root mismatch`
  - `raiola:workstreams status -> raiola:switch-workstream or use --root to return to the correct root`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> raiola:resume-work -> raiola:next`
- `Dirty worktree closeout`
  - `Use explicit --stage-paths or --allow-workflow-only when it is truly docs-only`

## Working Rules

- `STATUS.md` is active-window only.
- `EXECPLAN.md` is the sole source of truth for the plan step.
- `DECISIONS.md` is only for durable cross-milestone decisions.
- `VALIDATION.md` is the canonical audit-contract source.
- `HANDOFF.md` is the session-level pause/resume snapshot.
- `WINDOW.md` is for active context budget and execution-cursor decisions.
- `SEEDS.md` must not be confused with `CARRYFORWARD.md`:
  - `CARRYFORWARD`: unfinished active work
  - `SEEDS`: ideas that may be planted later
- `WORKSTREAMS.md` records the active root; scripts consult it first when `--root` is not provided.
- `PREFERENCES.md` controls solo/team mode, discuss mode, and git isolation behavior.
- `PREFERENCES.md` also carries the repo-default commit granularity preference.
- `FRONTEND_PROFILE.md` and `.workflow/frontend-profile.json` are generated routing aids, not canonical replacements for `VALIDATION.md`.
- `Team Lite delegation` in `PREFERENCES.md` controls whether delegation is explicit-only, suggested, or off.
- If a named stream is required, move from generic `docs/workflow/*` to `docs/<workstream>/*`.
- `AGENTS.md` combined size defaults to `32 KiB`; split supporting context if it grows too large.
- Team Lite becomes active only when the user explicitly asks for parallel mode; worker write scopes must be disjoint before execute fan-out.
- Explicit Team Lite trigger phrases include:
  - `parallel yap`
  - `subagent kullan`
  - `delegate et`
  - `team mode`
- When Team Lite is active:
  - run `raiola:map-codebase`
  - run `raiola:delegation-plan -- --start --activation-text "<user request>"`
  - use `.workflow/orchestration/packets/` as child-task packets
  - ingest results with `raiola:delegation-plan -- --complete-task ...`
  - use `raiola:delegation-plan -- --status` to decide the next route
  - only start workers from the active execute wave and only after owner + write scope + dependency assumptions are written in `EXECPLAN.md`
  - integrate the whole active wave before advancing to the next one

## Visibility Note

- The Codex app cannot guarantee skill-specific color or custom UI styling.
- Therefore, all commentary updates while this workflow skill is active should begin with the `WORKFLOW:` prefix.
- The prefix is required only while workflow is active, not in normal task flow.
- When possible, include the active step right after the prefix:
  - `WORKFLOW: discuss`
  - `WORKFLOW: research`
  - `WORKFLOW: plan`
  - `WORKFLOW: execute`
  - `WORKFLOW: audit`
  - `WORKFLOW: complete`
  - `WORKFLOW: handoff`

## Workflow Update Contract

- While workflow is active, each update should roughly follow:
  - `WORKFLOW: <step> | milestone=<id or NONE> | root=<path>`
- The first sentence should describe the current move and the next step.
- Stay at `1-2` sentences where possible; add a second sentence only when it adds value.
- If blocked, you may use `blocked` or `handoff` instead of the step:
  - `WORKFLOW: blocked | milestone=M3 | root=docs/yahoo-sync`
  - `WORKFLOW: handoff | milestone=M3 | root=docs/yahoo-sync`
- Before file edits, updates must begin with `WORKFLOW: execute`.
- Before audit/test work, updates must begin with `WORKFLOW: audit`.

## Update Templates

```text
WORKFLOW: discuss | milestone=M2 | root=docs/workflow
I am reading the active root and canonical files to tighten scope; next I will write evidence-backed assumptions into CONTEXT.md.
```

```text
WORKFLOW: research | milestone=M2 | root=docs/workflow
I am narrowing the touched files and verification surface; next I will reduce VALIDATION.md to milestone scope.
```

```text
WORKFLOW: execute | milestone=M2 | root=docs/workflow
I am applying the planned changes now; immediately after that I will re-check the workflow surface with doctor and health.
```

```text
WORKFLOW: audit | milestone=M2 | root=docs/workflow
I am running targeted checks and closing remaining risks; if the result is clean I will move into milestone closeout.
```

```text
WORKFLOW: handoff | milestone=M2 | root=docs/workflow
I am not starting a new step in this window; I am preparing HANDOFF.md and the raiola:resume-work command for resume.
```

## Golden Snapshot Rule

- Provider-level baselines: `tests/golden/providers/`
- Workflow/workstream baselines: `tests/golden/workflow/` or `tests/golden/<workstream>/`
- To diff snapshots:

```bash
node scripts/compare_golden_snapshots.ts <baseline> <candidate>
```

## Limits

- The skill does not store state; the canonical source of state is always the workflow files inside the repository.
- `.workflow/state.json` is a generated convenience surface only and must never replace the markdown control plane.
- `raiola:hud`, `raiola:doctor`, and `raiola:next` may all refresh that generated state surface.
- The skill is not a backlog document; it exists to stabilize active state and closeout discipline.

## Retro Surface

- `RETRO.md` is a process-quality surface, not the validation state.
- Trigger conditions:
  - `Every 5 completed milestones`
  - `When the same forensics root cause appears twice`
  - `When the user explicitly asks for workflow improvement`
- Retro loop:
  - `Collect archive, handoff, forensics, and user corrections`
  - `Evaluate the binary process-quality checks`
  - `Choose one process change`
  - `Apply it to skill/docs/scripts`
  - `Make a keep/discard decision after the next 1-2 real milestones`
