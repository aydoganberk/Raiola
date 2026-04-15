# AGENTS

## Default operating model

- Use Raiola workflow only when the user explicitly asks for workflow, milestones, handoff, closeout, resumability, bounded parallelism, or deep review orchestration.
- For normal coding requests, stay lightweight and prefer the lifecycle facade first: `rai spec`, `rai plan`, `rai build`, `rai test`, `rai simplify`, `rai review`, `rai ship`.
- In Codex-native sessions, honor the closest `AGENTS.md` for every file you touch. Deeper files override this root file.
- Treat `docs/workflow/*.md` as canonical workflow state. Treat `.workflow/*` as generated runtime mirrors.

## Native Codex surfaces

- Repo config lives in `.codex/config.toml`.
- Native hooks live in `.codex/hooks.json` and `.codex/hooks/*`.
- Project subagents live in `.codex/agents/*.toml`.
- Raiola policy snapshots live in `.codex/raiola-policy.json` and may tighten approvals or sandboxing when trust posture is strict.
- First-party GitHub surfaces live under `.github/codex/` and `.github/workflows/codex-review.yml`.

## Slash-command and review bias

- Prefer built-in Codex flows such as `/agent`, `/permissions`, `/status`, `/init`, and `@codex review` when they fit the task.
- On reviews, lead with correctness, security, regressions, missing verification, and operational drift before style feedback.
- For large repos or monorepos, plan the shard before editing and keep write scopes bounded.

## Skill pack

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

## Packaging

- Codex plugin marketplace metadata lives under `.agents/plugins/marketplace.json`.
- Installable plugin content lives under `plugins/raiola-codex-optimizer/`.
- Claude compatibility remains available under `.claude/` and `.claude-plugin/`, but native Codex surfaces are the primary path.
