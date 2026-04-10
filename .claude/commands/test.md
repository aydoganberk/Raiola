---
description: Prove the slice works using Raiola verification surfaces
---

Invoke `using-raiola`, then `raiola-review-closeout`.

Use the verification facade instead of relying on intuition:

1. Run `rai test --cmd "..." --url ...` to inspect the right verification sequence.
2. Use `rai verify-shell`, `rai verify-browser`, and `rai verify-work` as the evidence spine.
3. Record manual checks and residual risks in the workflow docs, not only in chat output.
4. Escalate to review or ship-readiness only after verification evidence exists.
