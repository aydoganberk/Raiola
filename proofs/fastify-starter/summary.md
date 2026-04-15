# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/fastify-starter`
- Overall confidence: `medium` (3/5)
- Coverage: `api`
- Audit verdict: `watch` (83)

## Trustable findings

- API surface found 3 endpoints via fastify
- Verified finding: Repository has no CI workflow

## Manual verify lane

- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
