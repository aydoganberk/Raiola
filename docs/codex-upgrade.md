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

- `rai ui-direction`
- `rai review-orchestrate`
- `rai monorepo`
- `rai codex promptpack --goal "..."`
- richer `rai do` behavior on multilingual prompts
- richer `rai review-mode` output via orchestration artifacts

## Suggested flows

### Frontend slice

```bash
rai do "mejora el frontend con una dirección visual premium"
rai ui-direction
rai ui-spec
rai ui-plan
rai ui-review
```

### Large-repo review

```bash
rai do "请做代码审查并验证浏览器"
rai review-mode
rai review-orchestrate
rai codex promptpack --goal "review the diff and verify auth"
```

### Monorepo execution

```bash
rai monorepo
rai team run --parallel --activation-text "aynı anda paketleri ilerlet" 
rai codex promptpack --goal "implement package-local fixes and verify impacted scopes"
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
