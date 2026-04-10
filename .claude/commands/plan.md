---
description: Break work into explicit plan chunks and validation gates using Raiola
---

Invoke `using-raiola` first, then `raiola-milestone-lifecycle`.

Plan through the thin lifecycle facade while keeping `EXECPLAN.md` canonical:

1. Run `rai plan --goal "..."` to inspect the recommended planning commands.
2. Update `EXECPLAN.md` with chosen strategy, wave policy, chunk table, and commit policy.
3. Narrow `VALIDATION.md` so the contract matches the current milestone scope.
4. Run `rai plan-check --sync --strict` before execute begins.
5. Only promote dependency-aware, verifiable chunks into the active wave.
