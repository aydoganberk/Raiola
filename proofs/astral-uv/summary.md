# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/astral-uv`
- Overall confidence: `medium` (2/5)
- Coverage: `monorepo`
- Audit verdict: `at_risk` (62)

## Trustable findings

- Workspace graph reports 1 root
- Detected ecosystems: rust
- Verified finding: Repository has executable code but no automated tests
- Verified finding: Repository has no CI workflow
- Verified finding: Repository has no stable verify entrypoint

## Manual verify lane

- Cross-workspace boundaries, owners, and release sequencing
- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- Static route scan may miss runtime-generated endpoints or framework-specific mounts.
- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
