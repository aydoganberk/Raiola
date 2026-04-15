# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/create-t3-turbo`
- Overall confidence: `high` (4/5)
- Coverage: `api, frontend, monorepo`
- Audit verdict: `critical` (0)

## Trustable findings

- Workspace graph reports 5 roots
- Detected ecosystems: node
- API surface found 1 endpoint via next-api
- Frontend surface detected (Expo / Next App Router)
- Verified finding: Repository has executable code but no automated tests

## Manual verify lane

- Critical UI flows, navigation params, and browser/mobile smoke paths
- Cross-workspace boundaries, owners, and release sequencing
- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- No proof harness was detected for the frontend surface; manual smoke verification remains necessary.
- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
