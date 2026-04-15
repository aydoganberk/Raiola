# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/next-admin-dashboard`
- Overall confidence: `medium` (3/5)
- Coverage: `api, frontend`
- Audit verdict: `critical` (0)

## Trustable findings

- API surface found 2 endpoints via next-api
- Frontend surface detected (Next / Next App Router)
- Verified finding: Repository has executable code but no automated tests
- Verified finding: High-risk area has no owned tests
- Verified finding: Repository has no CI workflow

## Manual verify lane

- Critical UI flows, navigation params, and browser/mobile smoke paths
- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- No proof harness was detected for the frontend surface; manual smoke verification remains necessary.
- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
