# MILESTONE TEMPLATE

Bu template, yeni bir milestone acarken ayni lifecycle'i tekrar kurmak icin kullanilir.

- Varsayilan kullanim: tek bir kullanici istegi = tek milestone
- `discuss -> research -> plan -> execute -> audit -> complete` ayni milestone'un step'leridir

## Packet Metadata Template

- Packet version: `2`
- Input hash: `pending_sync`
- Workflow profile: `standard`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `deep`
- Confidence summary: `mixed_until_research`
- Refresh policy: `refresh_when_input_hash_drifts`

## Canonical Refs Template

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/CONTEXT.md | Research packet source |
| source_of_truth | docs/workflow/EXECPLAN.md | Plan of Record source |
| source_of_truth | docs/workflow/VALIDATION.md | Audit contract source |

## Upstream Refs Template

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/WINDOW.md | Budget and handoff state |
| supporting | docs/workflow/HANDOFF.md | Resume cursor state |

## Unknowns Template

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Milestone-specific unknown` | `Plan kalitesini etkiler` | `owner` | `open` |

## Claim Ledger Template

| Claim | Type | Evidence refs | Confidence | Failure if wrong |
| --- | --- | --- | --- | --- |
| `Milestone claim` | `source-backed` | `docs/workflow/CONTEXT.md` | `Likely` | `Yanlis uygulama yapilabilir` |

## Table Row Template

| Milestone | Goal | Phase | Status | Step | Exit criteria | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| Mx | `Kisa hedef` | `Phase N` | active | discuss | `Bitis kosulu` | `Kanit sonra doldurulacak` |

## Validation Contract Template

| Deliverable | Verify command | Expected signal | Manual check | Golden | Audit owner | Status | Evidence | Packet hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Deliverable` | `npm test` | `Temiz sonuc` | `UI veya diff kontrolu` | `tests/golden/workflow/...` | `audit` | `pending` | `docs/workflow/STATUS.md` | `pending_sync` |

## Active Milestone Card Template

- Milestone: `Mx - Name`
- Phase: `Phase N`
- Status: `active`
- Step: `discuss`
- Goal:
  - `Milestone'un teslim hedefi`
- Success signal:
  - `Neyin basari sayilacagi`
- Non-goals:
  - `Bu milestone icinde yapilmayacaklar`
- Workflow profile:
  - `lite veya standard veya full`
- Discuss mode:
  - `assumptions veya interview`
- Clarifying questions / assumptions:
  - `Discuss sirasinda tabloya yazilacak`
- Seed intake:
  - `SEEDS.md icinden gelen ilgili fikirler`
- Active recall intake:
  - `MEMORY.md Active Recall Items icinden gelen ilgili notlar`
- Research target files:
  - `Degistirilmesi muhtemel dosyalar`
  - `CARRYFORWARD.md icindeki ilgili maddeler`
- Plan checklist:
  - `CONTEXT.md research-sonrasi guncel olmadan plan adimina gecme`
  - `EXECPLAN.md icindeki Plan of Record bolumunu doldur`
  - `Plani context window'a uygun 1-2 run chunk'a bol`
- Execute notes:
  - `Execute sirasinda doldur`
- Audit checklist:
  - `Kosulacak komutlar, diff'ler, smoke check'ler ve manual review`
- Completion note:
  - `Archive, kalan riskler, carryforward ve sonraki milestone onerisi`
- Window note:
  - `Minimum next-step budget birakmadan chunk olusturma`
- Falsifier:
  - `Bu milestone planini hangi bulgunun bozabilecegini yaz`

## Minimum Done Checklists

- `discuss`
  - `Goal/non-goals/success signal net`
  - `Canonical refs + assumptions dolu`
  - `Scope kanitli sekilde frame edildi`
- `research`
  - `Touched files dolu`
  - `Dependency map + risks dolu`
  - `Validation contract milestone scope'una daraltildi`
- `plan`
  - `Context plan-ready`
  - `1-2 run chunk yazildi`
  - `Audit plan + overhead alanlari dolu`
- `execute`
  - `Sadece aktif chunk uygulandi`
  - `Status alanlari guncellendi`
  - `Plan disi drift docs'a geri yazildi`
- `audit`
  - `Verify command'ler kostu`
  - `Manual checks + residual risks yazildi`
  - `Strict health gate temiz`
- `complete`
  - `Archive yazildi`
  - `Carryforward secildi`
  - `Git closeout scope'u bilincli netlestirildi`

## Failure Playbook

- `Hash drift`
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream veya --root ile dogru root'a don`
- `Resume ambiguity`
  - `HANDOFF.md + WINDOW.md oku -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `complete-milestone icin explicit --stage-paths veya docs-only ise --allow-workflow-only kullan`

## Lifecycle Reminder

`discuss -> research -> plan -> execute -> audit -> complete`
