# Security Policy

## Supported release line

Security fixes are applied to the latest published `raiola` release line.

At the moment, the supported line is:

- `0.3.x`

## How to report a vulnerability

Do not open public GitHub issues, PRs, or discussions for security-sensitive reports.

Use GitHub's private vulnerability reporting flow for this repository:

1. Open the repository on GitHub.
2. Go to the `Security` tab.
3. Choose `Report a vulnerability`.
4. Submit the report privately with reproduction details and impact.

If private reporting is unavailable in your environment, contact the maintainers directly before disclosing anything publicly.

## What is in scope

This policy covers:

- the published `raiola` npm package
- the repo-local install surface created by `rai setup`, `rai init`, `rai migrate`, or `rai update`
- runtime helpers shipped under `scripts/workflow/`
- generated repo-local control-plane surfaces under `docs/workflow/` and `.workflow/`

## What to include

Include as much of the following as you can:

- affected `raiola` version
- operating system and Node.js version
- reproduction steps
- impacted commands, files, or runtime surfaces
- expected behavior versus actual behavior
- impact assessment
- proof-of-concept or logs, if safe to share privately
- any workaround or mitigation you found

## Disclosure expectations

- Give maintainers reasonable time to reproduce and remediate the issue.
- Avoid publishing exploit details before a fix or mitigation is available.
- If the issue affects unreleased code on `main`, call that out in the report.
