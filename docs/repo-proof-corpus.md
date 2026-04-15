# Repo proof corpus

Wave 5 adds a repeatable proof corpus so `repo_proof` is backed by stored evidence instead of fixture-only confidence.

## Corpus strategy

The corpus is versioned inside the repository and uses curated reduced snapshots of public repositories under `tests/fixtures/repo_proof_corpus/*`.

Each corpus entry produces two saved artifacts:

- `proofs/<repo-slug>/proof.json`
- `proofs/<repo-slug>/summary.md`

The corpus manifest is stored at `proofs/manifest.json`.

This keeps the corpus deterministic, cheap to run in CI, and reviewable in diffs.

## Included snapshot set

The current corpus covers six repository shapes:

- `next-admin-dashboard` — Next.js / React web app
- `fastify-starter` — Fastify API
- `react-native-community-template` — React Native mobile app
- `create-t3-turbo` — pnpm + Turbo monorepo with web/mobile/API slices
- `astral-uv` — polyglot Rust/Python workspace shape
- `hono-starter` — Hono API starter shape

## What this corpus now proves

The corpus is not a claim that `repo_proof` understands every repository. It is a stored claim that the command can run end-to-end against these representative shapes without crashing, and that the resulting proof packs are inspectable after the run.

That is the step from “interesting feature” to “feature with evidence.”

## Findings fed back from the corpus

The Wave 5 corpus already produced concrete findings that were converted into regression expectations or known limitations:

1. `next-admin-dashboard` lights up both `api` and `frontend` coverage.
2. `next-admin-dashboard` still lacks a detected proof harness, so UI confidence remains capped.
3. `fastify-starter` correctly lands in the API lane and preserves `fastify` as a framework signal.
4. `react-native-community-template` activates the mobile/frontend lane from a non-web repo shape.
5. `react-native-community-template` can over-promote a single-root mobile repo into a monorepo-style lane.
6. `create-t3-turbo` preserves `api`, `frontend`, and `monorepo` coverage together.
7. `create-t3-turbo` shows a prioritization mismatch where Expo is primary but web routing evidence still appears through Next App Router.
8. `astral-uv` proves the command survives a non-Node polyglot workspace without crashing.
9. `astral-uv` still undercounts Python evidence in a Rust-first snapshot.
10. `hono-starter` currently falls back to `repo-audit`, which is a real false negative worth tracking.
11. Read-only snapshot mode leaves deployment wiring and live integration checks in the manual-verify lane across the corpus.
12. Proof harness detection remains sparse across the corpus and therefore limits confidence on frontend-heavy repos.

## Regression contract

The regression contract lives in `tests/repo_proof_corpus_regression.test.js`.

That test verifies that:

- every corpus entry can be processed without a crash
- every repo keeps a saved proof artifact
- expected coverage lanes stay stable for the current corpus
- representative framework signals stay visible where expected
- low-confidence false negatives are preserved as explicit evidence instead of being forgotten

## Known limitations

- The corpus uses curated reduced snapshots, not full upstream git histories.
- Dynamic runtime behavior still needs manual validation.
- Framework support should only expand when the corpus exposes a real miss, not because a new heuristic sounds attractive.
