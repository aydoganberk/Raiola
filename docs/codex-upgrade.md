# Codex upgrade notes

## What was added

This build pushes the product toward a stronger Codex-native workflow for large repos:

- multilingual natural-language intent grounding across major languages
- taste-aware frontend direction generation before UI spec and UI plan work begins
- package-aware review orchestration with persona and wave planning
- monorepo intelligence for write scopes, review shards, verify plans, and performance risks
- Codex prompt packs that bundle route, verify contract, UI direction, and monorepo/review context
- shell verification fallback so CI and agent hosts do not depend on `zsh`

## New commands

- `cwf ui-direction`
- `cwf review-orchestrate`
- `cwf monorepo`
- `cwf codex promptpack --goal "..."`
- richer `cwf do` behavior on multilingual prompts
- richer `cwf review-mode` output via orchestration artifacts

## Suggested flows

### Frontend slice

```bash
cwf do "mejora el frontend con una dirección visual premium"
cwf ui-direction
cwf ui-spec
cwf ui-plan
cwf ui-review
```

### Large-repo review

```bash
cwf do "请做代码审查并验证浏览器"
cwf review-mode
cwf review-orchestrate
cwf codex promptpack --goal "review the diff and verify auth"
```

### Monorepo execution

```bash
cwf monorepo
cwf team run --parallel --activation-text "aynı anda paketleri ilerlet" 
cwf codex promptpack --goal "implement package-local fixes and verify impacted scopes"
```

## Main artifacts

- `docs/workflow/UI-DIRECTION.md`
- `docs/workflow/MONOREPO.md`
- `.workflow/runtime/ui-direction.json`
- `.workflow/cache/monorepo-intelligence.json`
- `.workflow/reports/review-orchestration.md`
- `.workflow/reports/review-orchestration.json`
- `.workflow/runtime/codex-control/promptpack.md`
- `.workflow/runtime/codex-control/promptpack.json`

## Why it matters

The goal is to make Codex spend fewer tokens rediscovering repo structure, reduce repo-wide scans in monorepos, give frontend work a higher aesthetic baseline, and make deep review repeatable under parallel execution.
