---
description: Define what to build before coding by activating the Raiola lifecycle spec stage
---

Invoke `using-raiola` first, then `raiola-milestone-lifecycle`.

Use the lifecycle facade and the explicit workflow docs to turn the request into a clear spec surface:

1. Run `rai spec --goal "..."` to inspect the right next commands and artifacts.
2. If workflow is not active yet, use `rai on next` or open a milestone with `rai milestone`.
3. Fill the discuss surface before code: `CONTEXT.md`, `ASSUMPTIONS.md`, `CLAIMS.md`, and the validation contract.
4. Keep assumptions visible and ask only high-leverage questions when the repo evidence is insufficient.
5. Do not start implementation until the scope, constraints, and success criteria are explicit.
