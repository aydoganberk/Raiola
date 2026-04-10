---
description: Generate a review-ready package and inspect change quality through Raiola
---

Invoke `using-raiola`, then `raiola-review-closeout`.

Review the current slice through the closeout surface:

1. Run `rai review` for the baseline package.
2. Use `rai review-mode` or `rai pr-review` when the surface is deeper than a quick review.
3. Apply the review personas when needed: `code-reviewer`, `test-engineer`, `security-auditor`.
4. Keep findings blocker-first, evidence-backed, and tied to specific files or contracts.
