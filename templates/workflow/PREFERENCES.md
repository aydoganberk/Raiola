# PREFERENCES

- Last updated: `2026-04-02`
- Workflow activation: `explicit_only`
- Workflow mode: `solo`
- Workflow profile: `standard`
- Discuss mode: `assumptions`
- Git isolation: `none`
- Team Lite delegation: `explicit_only`
- Auto push: `true`
- Auto checkpoint: `true`
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
  - `Auto push: true`
  - `Unique milestone ids: false`
  - `Pre-merge check: false`
  - `Git isolation: none`
  - `Health strict required: false`
- `team`
  - `Auto push: false`
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

## Profile Notes

- `Workflow mode` and `Workflow profile` are different:
  - `mode` controls git and team isolation behavior
  - `profile` controls process depth and packet expectations
- `lite` is a good fit for smaller bug fixes or lightweight repo operations
- `full` is a good fit for handoff, closeout, durable evidence chains, and workflow-quality tracking

## Discuss Modes

- `interview`
  - `Clarify the goal first, then ask only high-leverage questions`
- `assumptions`
  - `Scan the codebase first, then write evidence-backed assumptions and let the user correct them if needed`

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

## Budget Notes

- `When Window budget mode is native, these values may be filled from bridge data instead`
- `No run chunk should be planned without leaving Minimum next-step budget available`
- `Compaction target is the ratio to aim for after compacting a packet`

## Notes

- `This file is the repo-local configuration source for workflow behavior`
- `Scripts read this file first unless explicit flags override it`
- `The default operating assumption is explicit_only; the full workflow activates only when the user explicitly asks for it`
