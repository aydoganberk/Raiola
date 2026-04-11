# Security Policy

## Supported Release Line

Security fixes are applied to the latest published `raiola` release line.

At the moment, the supported line is:

- `0.4.x`

The `main` branch may contain unreleased fixes or ongoing changes, but the supported public target is the latest published release line.

## How To Report A Vulnerability

Do not open public GitHub issues, PRs, or discussions for security-sensitive reports.

Use GitHub's private vulnerability reporting flow for this repository:

1. Open the repository on GitHub.
2. Go to the `Security` tab.
3. Choose `Report a vulnerability`.
4. Submit the report privately with impact, reproduction details, and any mitigation notes.

If private reporting is unavailable in your environment, contact the maintainers directly before disclosing anything publicly.

## What Is In Scope

This policy covers vulnerabilities in:

- the published `raiola` npm package
- the `rai`, `raiola`, and `raiola-on` command surfaces
- repo-local install and migration surfaces created by `rai setup`, `rai init`, `rai migrate`, `rai update`, `rai repair`, or `rai uninstall`
- runtime helpers shipped under `scripts/workflow/`
- generated repo-local control-plane surfaces under `docs/workflow/` and `.workflow/` when the issue can cause a security impact

Examples of in-scope issues include:

- command injection through workflow, verification, or helper surfaces
- arbitrary file write, delete, or read outside the intended repo boundary
- path traversal in generated artifacts, patch handling, or installer logic
- unsafe patch application or rollback behavior that breaks expected repo isolation
- exposure of secrets or sensitive local data through generated reports or runtime mirrors
- privilege escalation caused by installer, updater, repair, or runtime flows

## Out Of Scope

The following are usually out of scope unless they create a concrete security impact:

- documentation typos or confusing wording
- purely local misconfiguration without a product vulnerability
- issues that require already-compromised local shell access and do not expand that access
- third-party service outages or vulnerabilities outside this repository
- best-practice suggestions without a demonstrated exploit path

## What To Include

Include as much of the following as you can:

- affected `raiola` version
- whether the issue affects a published release, `main`, or both
- operating system and Node.js version
- reproduction steps
- impacted commands, files, or runtime surfaces
- expected behavior versus actual behavior
- impact assessment
- proof-of-concept or logs, if safe to share privately
- any workaround or mitigation you found

If the issue touches generated repo-local surfaces, please mention whether it was triggered through a fresh install, an upgraded install, or a repaired install.

## Disclosure Expectations

- Give maintainers reasonable time to reproduce and remediate the issue.
- Avoid publishing exploit details before a fix or mitigation is available.
- If the issue affects unreleased code on `main`, call that out in the report.
- If you believe the issue can affect existing installed repos after upgrade, include that in the impact summary.
