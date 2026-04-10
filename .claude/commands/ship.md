---
description: Prepare a slice for closeout and ship using Raiola
---

Invoke `using-raiola`, then `raiola-review-closeout`.

Use the explicit ship surface instead of a generic wrap-up:

1. Run `rai ship` to generate the ship-ready package.
2. Run `rai ship-readiness` when you need blocker and residual-risk scoring first.
3. Confirm review, verification, rollback note, and remaining risks are explicit.
4. Keep the final output inspectable enough for a human reviewer to approve without reconstructing the session from memory.
