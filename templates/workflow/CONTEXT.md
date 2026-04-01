# CONTEXT

- Last updated: `2026-04-02`
- Workstream: `Default workflow control plane`
- Milestone: `NONE`
- Step source: `discuss`
- Context status: `idle_until_milestone`
- Plan readiness: `not_ready`
- Packet version: `2`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `balanced`
- Confidence summary: `mixed_idle_surface`
- Refresh policy: `refresh_when_input_hash_drifts`
- Reset policy: `Her yeni milestone basinda sifirdan yazilir`
- Archive policy: `Complete olan milestone'lar completed_milestones/ altina tasinir`
- Discuss mode: `assumptions`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/PROJECT.md | Workflow purpose and operating model |
| source_of_truth | docs/workflow/WORKSTREAMS.md | Active root registry |
| source_of_truth | docs/workflow/PREFERENCES.md | Discuss and budget defaults |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/EXECPLAN.md | Plan source-of-truth relationship |
| supporting | docs/workflow/VALIDATION.md | Audit contract dependency |
| supporting | docs/workflow/HANDOFF.md | Resume surface dependency |

## Problem Frame

- Goal:
  - `Ilk workflow milestone'u icin temiz baslangic yuzeyi saglamak`
- Success signal:
  - `Ilk milestone kullanici tarafindan acikca tanimlandiginda bu dosya onun icin doldurulabilecek`
- Non-goals:
  - `Kullanici istemeden workflow milestone'u baslatmak`

## Codebase Scan Summary

- `Starter scaffold aktif milestone acilana kadar idle kalir`
- `Completed milestone arsivi bos baslar`
- `Packet ve validation alanlari ilk milestone ile birlikte senkronize edilir`

## Clarifying Questions / Assumptions

| Claim | Confidence | Evidence refs | Failure mode |
| --- | --- | --- | --- |
| `Workflow varsayilan olarak explicit activation bekler` | `Confident` | `docs/workflow/PREFERENCES.md; docs/workflow/PROJECT.md` | `Workflow istemeden aktiflenirse scope kayar` |
| `Tek bir kullanici istegi gerekirse tek milestone olarak modellenebilir` | `Likely` | `docs/workflow/MILESTONES.md; docs/workflow/RUNTIME.md` | `Milestone granularity tutarsiz olur` |

## Claim Ledger

| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| `Workflow surface explicit opt-in olarak tasarlandi` | `source-backed` | `docs/workflow/PREFERENCES.md; docs/workflow/PROJECT.md` | `Confident` | `Ajanlar workflow'u gereksiz yere acabilir` |
| `Current root idle state icin yeterli kanonik dosyalara sahip` | `source-backed` | `docs/workflow/WORKSTREAMS.md; docs/workflow/EXECPLAN.md; docs/workflow/VALIDATION.md` | `Likely` | `Yeni milestone baslangici eksik packet ile acilabilir` |

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Ilk aktif milestone ne zaman acilacak` | `Packet iceriği milestone ile degisecek` | `user` | `open` |

## Research Targets

- `Kullanici milestone acinca doldurulacak`

## Carryforward Intake

- `Henuz carryforward item yok`

## Seed Intake

- `Henuz acik seed yok`

## Active Recall Intake

- `Aktif milestone olmadigi icin active recall notu yok`

## Touched Files

- `Workflow milestone acildiginda doldurulacak`

## Dependency Map

- `WORKSTREAMS.md` -> aktif root secimi
- `PREFERENCES.md` -> discuss mode + git isolation + activation tercihi
- `EXECPLAN.md` -> Plan of Record
- `VALIDATION.md` -> audit kontrati
- `HANDOFF.md` -> pause/resume snapshot'i
- `WINDOW.md` -> budget/orchestrator snapshot'i

## Risks

- `Aktif milestone yok`

## Verification Surface

- `node scripts/workflow/doctor.js`
- `node scripts/workflow/health.js --strict`
- `node scripts/workflow/next_step.js --json`

## What Would Falsify This Plan?

- `Workflow explicit_only degilse mevcut problem frame yanlis olur`
- `WORKSTREAMS.md aktif root'u farkli bir yere tasimissa bu packet stale olur`

## Ready For Plan

- `Hayir`
