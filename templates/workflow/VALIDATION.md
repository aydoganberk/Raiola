# VALIDATION

- Last updated: `2026-04-02`
- Active milestone: `NONE`
- Validation status: `idle_until_milestone`
- Audit readiness: `not_ready`
- Contract owner: `audit`
- Packet version: `2`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `9000`
- Hard cap tokens: `17000`
- Reasoning profile: `deep`
- Confidence summary: `idle_surface_waiting_for_contract`
- Refresh policy: `refresh_when_plan_hash_drifts`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/EXECPLAN.md | Plan / audit dependency |
| source_of_truth | docs/workflow/STATUS.md | Audit outcome and risks |
| source_of_truth | docs/workflow/PREFERENCES.md | Audit budget defaults |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| verify_only | scripts/workflow/doctor.js | Fast sync signal |
| verify_only | scripts/workflow/health.js | Strict gate |
| supporting | docs/workflow/WINDOW.md | Budget evidence |

## Success Contract

- `Yeni milestone research/plani ile doldurulacak`

## Validation Contract

| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Workflow idle validation surface` | `node scripts/workflow/doctor.js --strict` | `0 fail` | `Idle workflow summary aligns with STATUS.md` | `tests/golden/workflow/README.md` | `audit` | `pending` | `docs/workflow/STATUS.md` | `pending_sync` |

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Ilk aktif milestone dogrulama kontrati` | `Validation rows degisecek` | `user` | `open` |

## What Would Falsify This Plan?

- `Validation tablosu verify/manual/evidence kolonlari bos kalirsa audit contract gecersiz olur`
- `Packet hash stale kalirsa audit eski plan uzerinden kapanabilir`

## Audit Notes

- `Starter scaffold ilk aktif milestone'a kadar beklemede`

## Completion Gate

- `Yeni milestone ile doldurulacak`
