---
name: raiola-monorepo-mode
description: Runs the staged Raiola monorepo analysis flow with repo map, review scope, patch plan, and verify discipline. Use when the repo is large enough that package-aware staging matters more than one-shot exploration.
---

# Raiola Monorepo Mode

## Overview

This skill narrows large-repo work into explicit subsystems, tracks, and review stages before implementation or remediation begins.

## When to Use

- The repository is a monorepo or otherwise too broad for one-shot review
- Package scope, blast radius, and staged verification matter
- You need repo map, review scope, and patch plan artifacts before edits

## Workflow

1. Start with `rai monorepo`.
2. Run `rai monorepo-mode --goal "..."`.
3. Use the emitted repo map, review scope, and patch plan to choose the first subsystem.
4. Keep subsequent review or patch work scoped to the selected subsystem until the contract expands intentionally.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I can just inspect the whole repo directly." | Large repos punish unscoped review with shallow conclusions and missed hotspots. |
| "Package boundaries are obvious enough." | The explicit repo map exists so that assumptions about boundaries are testable. |

## Red Flags

- Reviews jump between packages with no selected subsystem
- Verification expands repo-wide before package-local risk is understood
- `AGENTS.md` and monorepo artifacts drift apart

## Verification

- [ ] Repo map, review scope, and patch plan artifacts exist
- [ ] The selected subsystem is explicit
- [ ] Follow-up work stays package-aware
