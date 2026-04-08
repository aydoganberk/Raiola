---
name: raiola
description: "Repo workstream continuity protocol. Use only when the user explicitly asks for workflow/milestone/handoff/closeout discipline, or when resuming a workflow milestone they explicitly started."
---

# raiola

This skill is used to run multi-session work inside a repository through one durable workflow protocol.
It is not the default path; if the user did not explicitly ask for workflow, continue with the normal task flow.

## When To Use

- When the user explicitly wants workflow, milestone, handoff, or closeout discipline
- When the user wants to continue a previously opened workflow milestone
- When named workstreams, validation contracts, or pause/resume snapshots are explicitly needed

## Quick Command Surface

- `$workflow-help`
  - `Show the short command surface and when to use quick/full/team.`
- `$workflow-next`
  - `Surface the single safest next move from current state.`
- `$workflow-quick`
  - `Start or continue quick mode for a narrow 15-60 minute task.`
- `$workflow-checkpoint`
  - `Write a continuity checkpoint before compaction or handoff.`
- `$workflow-team`
  - `Open Team Lite orchestration when the user explicitly asks for delegation or parallelism.`
- `$workflow-review`
  - `Generate a review-ready closeout package.`
- `$workflow-ship`
  - `Generate a ship-ready package.`

## Alias Mapping

- `$workflow-help` -> `rai help`
- `$workflow-next` -> `rai next`
- `$workflow-quick` -> `rai quick`
- `$workflow-checkpoint` -> `rai checkpoint`
- `$workflow-team` -> `rai team`
- `$workflow-review` -> `rai review`
- `$workflow-ship` -> `rai ship`

## Granularity

- The default planning unit is a single milestone.
- One user request usually maps to one milestone.
- `discuss -> research -> plan -> execute -> audit -> complete` are steps within that milestone, not separate milestones.
- `execute` is wave-based inside the milestone: `wave 1 -> wave 2 -> wave 3`.
- `frontend/UI` work may activate an automatic frontend-specialized lane while the milestone stays inside the same lifecycle.

## Workflow Profiles

- `lite`
  - `Small, short-lived, low-ritual tasks`
- `standard`
  - `Default general-purpose profile`
- `full`
  - `Real handoff/closeout, multi-session coordination, and process-quality tracking`
- `Workflow mode` and `Workflow profile` are different:
  - `mode` controls team/git isolation behavior
  - `profile` controls ritual depth and minimum-done expectations

## Automation Modes

- `manual`
  - `Pause at major workflow transitions unless the user explicitly asks to continue`
- `phase`
  - `Codex may complete the current phase end-to-end, update canonical docs, then stop at the next phase boundary`
- `full`
  - `Codex may continue phase-to-phase until blocked, complete, or window-managed`
- Read `Automation mode` and `Automation status` from `STATUS.md`, `CONTEXT.md`, and `HANDOFF.md` as the active behavior contract.
- Users may set or change this with:
- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..." --profile standard --automation phase`
- `rai milestone --id Mx --name "..." --goal "..." --profile standard --automation phase`
  - `npm run workflow:automation -- --mode full`
- When automation is active, Codex should own:
  - `discussion flow`
  - `CONTEXT.md updates`
  - `plan sequencing`
  - `phase transitions allowed by the current mode`
- `workflow:plan-check` may legitimately report `pending` during `discuss` or `research`; treat that as incomplete work, not as a hard failure.
- If `WINDOW.md` recommends `handoff-required` or `new-window-recommended` and the client can open a new window/thread, prefer that handoff path.
- If the client cannot open a new window/thread, compact the current context, refresh packet state, and continue from the remaining plan.

## Startup Sequence

Before reopening the full contract, prefer the short layer:

1. Use `$workflow-help` if the user needs orientation.
2. Use `$workflow-next` to see the safest next operator action.
3. If the task is narrow and short-lived, consider `$workflow-quick` before opening a full milestone.
4. If the user explicitly requests delegation or parallelism, route through `$workflow-team`.

Then follow the full startup sequence below when the milestone contract is active.

1. Read `AGENTS.md`.
2. Resolve the active workstream root from `docs/workflow/WORKSTREAMS.md`.
3. In that root, read `HANDOFF.md -> Continuity Checkpoint`, `EXECPLAN.md -> Open Requirements`, `EXECPLAN.md -> Current Capability Slice`, and the current chunk row from `EXECPLAN.md -> Plan of Record`.
4. Only if the checkpoint is stale, missing, or obviously insufficient, reopen the broader canonical docs (`PROJECT.md`, `RUNTIME.md`, `PREFERENCES.md`, `STATUS.md`, `CONTEXT.md`, `VALIDATION.md`, `WINDOW.md`, `SEEDS.md`).
5. If `MEMORY.md` contains `Active Recall Items` tied to the active milestone, read them automatically.
6. Read `Durable Notes` from `MEMORY.md` only if the user asked for durable memory or if it is genuinely necessary.
7. Summarize current state in `8-12` bullets.
8. Operate only within the active phase, active milestone, and active milestone step.

## Milestone Loop

An active milestone always follows this loop:

1. `discuss`
   - Scan the codebase first.
   - Follow the value of `Discuss mode` in `PREFERENCES.md`:
     - `assumptions`: read the codebase first, then write evidence-backed assumptions.
     - `interview`: clarify the goal first, then ask only high-leverage questions.
   - Complete `intent capture -> constraint extraction -> execution shaping`.
   - Write user intent, explicit constraints, alternatives considered, success rubric, requirement list, problem frame, scan summary, canonical refs, claim ledger, unknowns, seed intake, and active recall intake into `CONTEXT.md`.
2. `research`
   - Identify touched files, dependencies, risks, and verification surface.
   - Update `CONTEXT.md` with research findings.
   - Narrow acceptance criteria, user-visible outcomes, regression focus, success contract, verify commands, and manual check fields in `VALIDATION.md` to the active milestone scope.
   - If workflow is active and frontend/UI signals are present, run `workflow:map-frontend` and treat the generated profile as the routing input for adapters and audit expectations.
3. `plan`
   - Continue only if `CONTEXT.md` is current after research.
   - Read `CARRYFORWARD.md` and relevant seeds.
   - Write the source-of-truth plan into `Plan of Record`, `Chosen Strategy`, `Wave Execution Policy`, `Wave Structure`, `Coverage Matrix`, `Plan Chunk Table`, and `Commit Policy` in `EXECPLAN.md`.
   - Split execute into dependency-aware chunks across `wave 1 -> wave 2 -> wave 3`.
   - Keep each chunk run-sized, keep same-wave parallelism minimal, and mark unused waves as `not needed` rather than silently skipping them.
   - If frontend mode is active, choose the adapter route, make design-system-aware behavior explicit, and expand `VALIDATION.md` with the visual verdict protocol before execute.
   - Run `workflow:plan-check -- --sync --strict` before execute begins.
   - Treat `pending` as "finish the planning packet first" and `fail` as "the plan shape is wrong and must be revised".
   - If `WINDOW.md` and packet budget are insufficient for a new chunk, do not start a new step.
4. `execute`
   - Apply only the active milestone plan.
   - Run `wave 1`, then `wave 2`, then `wave 3`; never open a later wave while an earlier wave is still incomplete.
   - Only dependency-free chunks may share a wave.
   - Parallel workers must come from the planned wave/chunk rows; do not open workers ad hoc just because spare parallelism exists.
   - Same-wave write-capable workers need explicit ownership and disjoint write scope before fan-out.
   - The main agent acts as orchestrator: delegate -> wait -> integrate -> update docs -> decide the next wave.
   - If `Atomic commit mode` is enabled in `EXECPLAN.md`, commit only at the declared `wave` or `chunk` boundary.
   - Leave active recall notes with `workflow:save-memory` if needed.
5. `audit`
   - Use the `VALIDATION.md` contract table for test, diff, review, or smoke checks.
   - If frontend mode is active, visual verdict checks become part of the audit contract instead of optional nice-to-have review.
   - Write the result and remaining risks into `STATUS.md`.
6. `complete`
   - Write evidence, remaining risks, and the recommended next milestone.
   - Move unfinished items into `CARRYFORWARD.md` if needed.
   - Archive milestone summary, final context, and validation snapshot under `completed_milestones/`.
   - Remove milestone-linked `Active Recall Items` from `MEMORY.md`.
   - Check whether `AGENTS.md` needs an update.
   - If audit is closed, apply commit and push protocol only while `workflow:health -- --strict` is clean.

## Minimum Done Checklists

- `discuss`
  - `Intent capture, constraint extraction, and execution shaping are complete`
  - `User intent, explicit constraints, success rubric, and requirement list are filled in`
  - `Scope is framed with evidence`
- `research`
  - `Touched files are known`
  - `Dependency map and risks are filled in`
  - `VALIDATION.md acceptance criteria, user-visible outcomes, regression focus, and contract are narrowed to milestone scope`
- `plan`
  - `Chosen strategy, rejected strategies, rollback/fallback, blockers, wave execution policy, chunks, and commit policy are written`
  - `Coverage matrix has no orphan or duplicate requirements`
  - `workflow:plan-check passes before execute begins`
- `execute`
  - `Only ready chunks from the active wave were implemented`
  - `Same-wave work was dependency-free and had disjoint write scopes`
  - `Status fields were updated`
  - `Integration order and any atomic commit checkpoints were documented`
  - `Off-plan drift was written back into docs`
- `audit`
  - `Verify commands were run`
  - `Manual checks and residual risks were documented`
  - `Strict health gate is clean`
- `complete`
  - `Archive output was written`
  - `Carryforward was decided`
  - `Git closeout scope was made explicit`

## Operational Helpers

- `npm run workflow:hud`
- `npm run workflow:map-codebase`
- `npm run workflow:map-frontend`
- `npm run workflow:control -- --utterance "plan kismini gecelim"`
- `npm run workflow:step-fulfillment -- --utterance "plan kismini gecelim"`
- `npm run workflow:delegation-plan`
- `npm run workflow:plan-check -- --sync --strict`
- `rai milestone --id Mx --name "..." --goal "..." --profile standard --automation manual`
- `npm run workflow:automation -- --mode phase`
- `npm run workflow:checkpoint -- --next "..."`
- `npm run workflow:complete-milestone -- --agents-review unchanged --summary "..." --stage-paths src/foo,tests/foo`
- `npm run workflow:save-memory -- --title "..." --note "..."`
- `npm run workflow:packet -- --step plan --json`
- `npm run workflow:next`
- `npm run workflow:tempo -- --utterance "hızlı geç"`
- `npm run workflow:pause-work -- --summary "..."`
- `npm run workflow:resume-work`
- `npm run workflow:plant-seed -- --title "..." --trigger "..."`
- `npm run workflow:switch-workstream -- --name "<slug>" --create`
- `npm run workflow:doctor`
- `npm run workflow:health -- --strict`
- `npm run workflow:forensics`

## Packet v5 Rules

- `Packet v5` is section-aware by default.
- `Tier A` keeps continuity core refs loaded.
- `Tier B` keeps the active chunk or active step surface loaded.
- `Tier C` is cold and should load only on hash drift or explicit need.
- `PREFERENCES.md -> Token efficiency measures` controls whether unchanged Tier A/B refs may stay out of the next packet:
  - `auto` is mode-aware
  - `on` keeps delta loading active
  - `off` switches to `continuity_first` so more context stays loaded
- `WINDOW.md` should show both the active `Packet loading mode` and `Token efficiency measures` value so the current safety posture is visible before compacting.
- Do not prefer full-doc reads when a section-level packet ref is available.
- `execute` should minimize the read set to the current chunk, open requirements, acceptance rows, and touched files.
- If `WINDOW.md` recommends `compact-now` or `do-not-start-next-step`, first check `Checkpoint freshness`.
- If `Checkpoint freshness = no`, run `workflow:checkpoint` before compacting or handing off.

## Frontend Auto Mode

- `workflow:map-frontend` fingerprints:
  - `framework: Next, Vite, Astro, Remix`
  - `styling: Tailwind, CSS Modules, styled-components, custom`
  - `UI system: shadcn, Radix, MUI, Chakra, custom`
  - `forms/data/motion/test stack`
  - `Storybook/Figma/Playwright presence`
- It writes:
  - `FRONTEND_PROFILE.md` in the active workflow root
  - `.workflow/frontend-profile.json` in the runtime surface
- Frontend auto mode activates only while workflow is active and at least one frontend signal is present.
- Activation signals include:
  - `React/TSX-heavy edit surface`
  - `components.json`
  - `Tailwind config`
  - `Storybook`
  - `Figma link`
  - `dev server / preview validation need`
  - `user intent such as landing page, frontend, UI, screen, component, design, responsive`
- When frontend mode is active:
  - `behave in a design-system-aware way rather than treating UI as isolated markup`
  - `select the adapter route from the frontend registry`
  - `expand audit expectations to include the visual verdict protocol`
  - `make visual verdict required when the UI work needs visual or UX acceptance, not just functional proof`

## Frontend Adapter Registry

- `shadcn`
  - `Use when components.json or shadcn-style routing is present`
- `react-best-practices`
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
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream or use --root to return to the correct root`
- `Resume ambiguity`
  - `Read HANDOFF.md + WINDOW.md -> workflow:resume-work -> workflow:next`
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
  - run `workflow:map-codebase`
  - run `workflow:delegation-plan -- --start --activation-text "<user request>"`
  - use `.workflow/orchestration/packets/` as child-task packets
  - ingest results with `workflow:delegation-plan -- --complete-task ...`
  - use `workflow:delegation-plan -- --status` to decide the next route
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
I am not starting a new step in this window; I am preparing HANDOFF.md and the workflow:resume-work command for resume.
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
- `workflow:hud`, `workflow:doctor`, and `workflow:next` may all refresh that generated state surface.
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
