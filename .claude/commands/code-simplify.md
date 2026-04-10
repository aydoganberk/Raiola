---
description: Simplify code without changing behavior through the Raiola simplify stage
---

Invoke `using-raiola`, then `raiola-code-simplification`.

Use the dedicated simplify stage for behavior-preserving cleanup:

1. Run `rai simplify --scope "..."` to inspect the recommended simplification flow.
2. Simplify only the requested or recently changed code.
3. After each simplification slice, re-run the relevant verification command.
4. Keep exact behavior intact and separate simplification from feature work.
