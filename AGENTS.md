# AGENTS

## Operating Model

- Use Raiola workflow only when the user explicitly asks for workflow, milestones, handoff, closeout, resumability, or bounded parallelism.
- For normal coding requests, stay lightweight and use the lifecycle facade first: `rai spec`, `rai plan`, `rai build`, `rai test`, `rai simplify`, `rai review`, `rai ship`.
- Once workflow is active, treat `docs/workflow/WORKSTREAMS.md`, `EXECPLAN.md`, `STATUS.md`, `CONTEXT.md`, and `VALIDATION.md` as the canonical sources of truth.
- Keep `.workflow/state.json` and other runtime JSON mirrors derived and non-canonical.

## Skill Pack

- Meta-skill: `skills/using-raiola/SKILL.md`
- Full milestone lifecycle: `skills/raiola-milestone-lifecycle/SKILL.md`
- Quick lane: `skills/raiola-quick-lane/SKILL.md`
- Review and closeout: `skills/raiola-review-closeout/SKILL.md`
- Team orchestration: `skills/raiola-team-orchestration/SKILL.md`
- Frontend lane: `skills/raiola-frontend-lane/SKILL.md`
- Monorepo mode: `skills/raiola-monorepo-mode/SKILL.md`
- Code simplification: `skills/raiola-code-simplification/SKILL.md`

## Personas

- Review persona: `agents/code-reviewer.md`
- Test persona: `agents/test-engineer.md`
- Security persona: `agents/security-auditor.md`

## References

- Testing: `references/testing-checklist.md`
- Security: `references/security-checklist.md`
- Accessibility: `references/accessibility-checklist.md`
- Ship readiness: `references/ship-readiness-checklist.md`

## Session Start

- Claude-style plugin installs can load `hooks/session-start.sh` through `hooks/hooks.json`.
- The session-start hook should load the `using-raiola` meta-skill and remind the agent that workflow remains explicit opt-in.

## Packaging

- Claude command surface lives under `.claude/commands/`.
- Plugin metadata lives under `.claude-plugin/`.
- The npm package keeps the repo-local workflow OS install surface, while this repository also ships a portable agent-facing skill pack.
