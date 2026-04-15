# Codex Upgrade Notes

This build turns Raiola from a Codex-adjacent control plane into a more native Codex optimizer.

## What changed

- real native config under `.codex/config.toml`
- native hook assets under `.codex/hooks/*` plus an opt-in `.codex/hooks.json` registration
- native project subagents under `.codex/agents/*.toml`
- trust-aware mapping from Raiola posture into `approval_policy`, `sandbox_mode`, and network access
- layered `AGENTS.md` guidance for workflow code, docs, skills, and GitHub surfaces
- installable plugin packaging through `.agents/plugins/marketplace.json` and `plugins/raiola-codex-optimizer/`
- first-party GitHub review wiring with `openai/codex-action@v1`
- Codex prompt assets under `.github/codex/`

## Suggested flows

### Native repo bootstrap

```bash
rai codex setup --repo
rai codex doctor --repo
# optional: rai codex setup --repo --enable-hooks
```

### Large-repo planning

```bash
/agent monorepo_planner
rai monorepo
rai codex promptpack --goal "plan the shard and verification scope"
```

### Review and closeout

```bash
@codex review
rai review
rai ship-readiness
```

### Frontend execution

```bash
/agent browser_debugger
rai ui-direction
rai ui-review
```

## Main native artifacts

- `.codex/config.toml`
- `.codex/hooks/*.js`
- `.codex/hooks.json` after explicit enable
- `.codex/agents/*.toml`
- `.codex/raiola-policy.json`
- `.agents/plugins/marketplace.json`
- `plugins/raiola-codex-optimizer/.codex-plugin/plugin.json`
- `.github/codex/prompts/review.md`
- `.github/workflows/codex-review.yml`

## Why it matters

The goal is to make Codex pleasant on large repos, complex tasks, and high-stakes changes by reducing rediscovery cost, making trust posture enforceable, and keeping review, closeout, and orchestration first-party.
