# PREFERENCES

- Last updated: `2026-04-03`
- Workflow activation: `explicit_only`
- Workflow mode: `solo`
- Workflow profile: `standard`
- Token efficiency measures: `auto`
- Automation mode: `manual`
- Automation window policy: `handoff_then_compact`
- Discuss mode: `assumptions`
- Git isolation: `none`
- Team Lite delegation: `explicit_only`
- Auto push: `true`
- Auto checkpoint: `true`
- Commit granularity: `manual`
- Commit docs: `true`
- Unique milestone ids: `false`
- Pre-merge check: `false`
- Health strict required: `false`
- Budget profile: `normal`
- Token reserve: `8000`
- Discuss budget: `6000`
- Plan budget: `12000`
- Audit budget: `9000`
- Compaction threshold: `0.8`
- Max canonical refs per step: `10`
- Window budget mode: `estimated`
- Window size tokens: `128000`
- Reserve floor tokens: `16000`
- Stop-starting-new-work threshold: `24000`
- Must-handoff threshold: `12000`
- Minimum next-step budget: `10000`
- Compaction target: `0.55`

## Presets

- `solo`
  - `Effective behavior: work on the current checkout unless a milestone explicitly asks for isolation`
  - `Auto push: true`
  - `Commit granularity: manual`
  - `Unique milestone ids: false`
  - `Pre-merge check: false`
  - `Git isolation: none`
  - `Health strict required: false`
- `team`
  - `Effective behavior: the preset is enforced even if lower fields drift`
  - `Auto push: false`
  - `Commit granularity: phase`
  - `Unique milestone ids: true`
  - `Pre-merge check: true`
  - `Git isolation: branch`
  - `Team Lite delegation: suggest`
  - `Health strict required: true`

## Workflow Profiles

- `lite`
  - `Low-ritual profile for small or short tasks`
  - `Suggested defaults: Budget profile=lean, Discuss=4000, Plan=8000, Audit=6000, Max refs=6`
- `standard`
  - `Default general-purpose profile`
  - `Suggested defaults: Budget profile=normal, Discuss=6000, Plan=12000, Audit=9000, Max refs=10`
- `full`
  - `Stronger process profile for real handoff, closeout, and long-lived coordination`
  - `Suggested defaults: Budget profile=deep, Discuss=8000, Plan=16000, Audit=12000, Max refs=14`
  - `Health strict and retro expectations are assumed to be higher`
  - `Token efficiency auto-default resolves to continuity_first unless explicitly overridden`
  - `A milestone may still override the repo default via workflow:new-milestone --profile`

## Profile Notes

- `Workflow mode` and `Workflow profile` are different:
  - `mode` controls git and team isolation behavior
  - `profile` controls process depth and packet expectations
- `Token efficiency measures` controls whether Packet v5 can omit unchanged refs:
  - `auto` -> `lite/standard` prefer delta loading, `full` and automated runs prefer `continuity_first`
  - `on` -> delta loading stays active
  - `off` -> `continuity_first` loading keeps more context in exchange for a larger packet
- `lite` is a good fit for smaller bug fixes or lightweight repo operations
- `full` is a good fit for handoff, closeout, durable evidence chains, and workflow-quality tracking

## Discuss Modes

- `interview`
  - `Clarify the goal first, then ask only high-leverage questions`
- `assumptions`
  - `Scan the codebase first, then write evidence-backed assumptions and let the user correct them if needed`

## Reasoning Profiles

- `fast`
  - `Use for lightweight scanning or low-risk packet refreshes`
- `balanced`
  - `Default for discuss/assumptions and general packet work`
- `deep`
  - `Default for plan and audit packets`
- `critical`
  - `Reserve for high-risk closeout, production-sensitive audits, or especially failure-intolerant planning`

## Automation Modes

- `manual`
  - `Codex follows the normal step-by-step workflow and waits for explicit direction between major transitions`
- `phase`
  - `Codex may complete the current phase end-to-end, update the canonical docs, then stop at the next phase boundary`
- `full`
  - `Codex may continue phase-to-phase until the milestone is blocked, completed, or hits a window-management boundary`

## Automation Window Policy

- `handoff_then_compact`
  - `When the context window gets tight, prefer a clean handoff/new window if the client can provide one; otherwise refresh packet state and continue from the remaining plan`

## Git Isolation Modes

- `none`
  - `Work on the current branch or worktree`
- `branch`
  - `Expect the milestone to use a dedicated branch`
- `worktree`
  - `Expect the milestone to use a dedicated worktree`

## Team Lite Delegation

- `explicit_only`
  - `Only produce active delegation plans when the user explicitly asks for parallel mode`
- `suggest`
  - `Show delegation opportunities in next-step guidance, but still require explicit parallel mode to activate`
- `off`
  - `Do not suggest Team Lite automatically; explicit user intent can still override`

## Commit Granularity

- `manual`
  - `Default. Commits happen only when explicitly chosen or during the normal milestone closeout path.`
- `phase`
  - `Prefer one integrated commit at a workflow phase boundary, usually after execute or complete.`
- `chunk`
  - `Allow integrated commits after each plan chunk when the chunk is complete, merged, and safe to checkpoint.`

## Commit Policy Notes

- `The human-readable field name is Commit granularity; tooling may serialize the same preference as commit_granularity.`
- `Commit granularity is the repo-default commit cadence for workflow work.`
- `Atomic commit mode remains optional and should be written per milestone in EXECPLAN.md when execute needs tighter isolation.`
- `When Team Lite is active, choose the coarsest safe commit boundary that still keeps rollback and integration understandable.`

## Budget Notes

- `When Window budget mode is native, these values may be filled from bridge data instead`
- `No run chunk should be planned without leaving Minimum next-step budget available`
- `Compaction target is the ratio to aim for after compacting a packet`

## Notes

- `This file is the repo-local configuration source for workflow behavior`
- `Scripts read this file first unless explicit flags override it`
- `The default operating assumption is explicit_only; the full workflow activates only when the user explicitly asks for it`
- `Automation mode is only a workflow behavior setting; it does not force automation unless the user explicitly chooses it`
- `Commit granularity is a default preference, not a mandate; the active milestone may stay fully manual or opt into atomic wave/chunk commits in EXECPLAN.md`
- `Team mode forces unique milestone ids, disables auto-push, requires branch isolation, and keeps health --strict mandatory`
