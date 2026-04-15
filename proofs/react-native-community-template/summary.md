# REPO PROOF SUMMARY

- Repo: `tests/fixtures/repo_proof_corpus/react-native-community-template`
- Overall confidence: `medium` (3/5)
- Coverage: `frontend, monorepo`
- Audit verdict: `at_risk` (61)

## Trustable findings

- Workspace graph reports 1 root
- Detected ecosystems: java
- Frontend surface detected (React Native / React Native Navigation)
- Verified finding: Repository has executable code but no automated tests
- Verified finding: Repository has no CI workflow

## Manual verify lane

- Critical UI flows, navigation params, and browser/mobile smoke paths
- Cross-workspace boundaries, owners, and release sequencing
- Deployment-time integrations that are invisible in a read-only snapshot

## Known limitations

- Static route scan may miss runtime-generated endpoints or framework-specific mounts.
- No proof harness was detected for the frontend surface; manual smoke verification remains necessary.
- Read-only snapshot mode cannot confirm secrets, env wiring, or live services.
