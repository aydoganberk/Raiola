---
description: Build the next safe slice using the Raiola lifecycle facade
---

Invoke `using-raiola`, then `raiola-milestone-lifecycle`.

Translate the current plan into one explicit execution slice:

1. Run `rai build --goal "..."` to inspect the current build-phase commands.
2. Work only on the active wave and the ready chunk rows from `EXECPLAN.md`.
3. Keep writes inside the planned scope; do not drift into opportunistic cleanup.
4. Verify each slice with the declared shell or browser checks before widening scope.
5. Leave a checkpoint if the next chunk cannot be safely started in the current window.
