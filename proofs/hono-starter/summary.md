# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/hono-starter`
- Overall confidence: `low` (1/5)
- Coverage: `repo-audit`
- Audit verdict: `at_risk` (62)

## Trustable findings

- Verified finding: Repository has executable code but no automated tests
- Verified finding: Repository has no CI workflow
- Verified finding: Repository has no stable verify entrypoint

## Manual verify lane

- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- Static route scan may miss runtime-generated endpoints or framework-specific mounts.
- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
