# EXECPLAN

Bu dosya repo icindeki aktif workflow control plane'in canli master planidir.

Kullanim kurali:
- Tek bir aktif stream varsa bu dosyayi guncel tut.
- Ayrik bir stream gerekiyorsa ayni artifact setini `docs/<workstream>/` altina kopyala ve o root'u kanonik hale getir.
- Ayni anda birden fazla aktif stream varsa her stream kendi `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`, `CARRYFORWARD.md`, `VALIDATION.md`, `HANDOFF.md`, `WINDOW.md`, `MEMORY.md`, `SEEDS.md`, `RETRO.md` setine sahip olmali.

- Packet version: `2`
- Input hash: `pending_sync`
- Budget profile: `normal`
- Target input tokens: `12000`
- Hard cap tokens: `20000`
- Reasoning profile: `deep`
- Confidence summary: `starter_surface_waiting_for_first_milestone`
- Refresh policy: `refresh_when_context_hash_drifts`

## Canonical Refs

| Class | Ref | Why |
| --- | --- | --- |
| source_of_truth | docs/workflow/CONTEXT.md | Research packet dependency |
| source_of_truth | docs/workflow/MILESTONES.md | Active milestone / step truth |
| source_of_truth | docs/workflow/PREFERENCES.md | Budget and isolation policy |

## Upstream Refs

| Class | Ref | Why |
| --- | --- | --- |
| supporting | docs/workflow/VALIDATION.md | Audit plan dependency |
| supporting | docs/workflow/WINDOW.md | Current window budget state |
| supporting | docs/workflow/CARRYFORWARD.md | Open work carried into plan |

## Scope

- Workstream: `Default workflow control plane`
- Owner: `Codex + repo collaborators`
- Goal: `Starter workflow surface'ini ilk milestone icin hazir tutmak`
- Non-goals:
  - `Bu adimda urun feature/refactor implement etmek`

## Session Protocol

Her yeni Codex seansi su sirayla baslamali:
1. `AGENTS.md` oku.
2. `docs/workflow/WORKSTREAMS.md` icinden aktif root'u coz.
3. Ilgili root altinda `PROJECT.md`, `RUNTIME.md`, `PREFERENCES.md`, `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`, `CARRYFORWARD.md`, `VALIDATION.md`, `HANDOFF.md`, `WINDOW.md`, `SEEDS.md` dosyalarini oku.
4. `MEMORY.md` icinde aktif milestone'a bagli `Active Recall Items` varsa otomatik oku.
5. `workflow:next` ile aktif step icin onerilen sonraki hareketi kontrol et.
6. Mevcut state'i `8-12` maddede ozetle.
7. Yalnizca aktif fazi, aktif milestone'u ve aktif milestone step'ini uygula.

Ek kural:
- `resume-work` sonrasi ilk check `workflow:health -- --strict` olmali.
- Bu protokol ancak kullanici workflow'u acikca istediginde veya daha once acilan workflow milestone'u devam ettirilirken tam olarak uygulanir.
- Workflow acik degilse bu dosya referans yuzeyi olarak kalir; normal task akisi milestone acmadan devam edebilir.
- `PREFERENCES.md` icindeki `Workflow profile` (`lite|standard|full`) rituel yogunlugunu belirler.

## Milestone Loop

1. `discuss`
   - Once codebase'i tara.
   - `PREFERENCES.md` icindeki `Discuss mode` degerine gore `assumptions` veya `interview` akisini kullan.
   - `CONTEXT.md` icinde problem frame, seed intake, active recall intake, claim ledger ve unknowns yaz.
2. `research`
   - Degisecek dosyalari, bagimliliklari, verification surface'i ve riskleri topla.
   - `CONTEXT.md`yi research bulgulari ile guncelle.
   - `VALIDATION.md` kontratini milestone scope'una daralt.
3. `plan`
   - Yalnizca research-sonrasi guncel `CONTEXT.md` varsa basla.
   - `CARRYFORWARD.md` ve ilgili seed'leri oku.
   - Planin source of truth'unu `EXECPLAN.md` icindeki `Plan of Record` alanina yaz.
   - Plani context window'a uygun 1-2 run chunk olacak sekilde kucuk tut.
4. `execute`
   - Yalnizca aktif milestone plani icindeki isi uygula.
   - Gerekirse ayni milestone icin `workflow:save-memory` ile active recall notu birak.
5. `audit`
   - `VALIDATION.md` contract tablosu uzerinden test, diff, review veya smoke check yap.
   - Sonucu ve kalan riskleri `STATUS.md`'ye yaz.
6. `complete`
   - Cikis kosulunu, validation snapshot'ini ve sonraki milestone onerini yaz.
   - Bitmeyen ama korunmasi gereken isleri `CARRYFORWARD.md`'ye ekle.
   - Milestone ozetini `completed_milestones/` altina arsivle.
   - O milestone'a bagli `Active Recall Items` kayitlarini `MEMORY.md` icinden temizle.
   - `AGENTS.md` guncellemesi gerekip gerekmedigini kontrol et.
   - Audit kapanmissa `workflow:health -- --strict` temiz olmadan closeout yapma.

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

## Unknowns

| Unknown | Impact | Owner | Status |
| --- | --- | --- | --- |
| `Ilk aktif milestone scope'u` | `Plan of Record packet'i dogrudan degistirir` | `user` | `open` |

## Milestone Model

- Aktif milestone kaynagi: `MILESTONES.md`
- Aktif context kaynagi: `CONTEXT.md`
- Aktif validation kaynagi: `VALIDATION.md`
- Aktif handoff kaynagi: `HANDOFF.md`
- Aktif window kaynagi: `WINDOW.md`
- Aktif seed kaynagi: `SEEDS.md`
- Aktif root kaynagi: `WORKSTREAMS.md`
- Ayni anda yalnizca bir milestone `active` olmali.
- Ayni anda yalnizca bir milestone step `active` olmali.
- `Plan of Record`, plan step'inin tek source of truth'udur.
- `CONTEXT.md`, her yeni milestone basinda sifirlanir.
- `STATUS.md` ve `EXECPLAN.md` aktif milestone / step alanlarinda senkron kalir.
- `AGENTS.md` combined size limiti varsayilan olarak `32 KiB` kabul edilir; buyurse baglami bol.
- Varsayilan granularity: tek bir kullanici istegi tek milestone olabilir; lifecycle asamalari bu milestone'un step'leridir.

## Active Phase

- Current phase: `Phase 0 - Idle`
- Active milestone: `NONE`
- Active milestone step: `complete`
- Entry criteria: `Kullanici acikca workflow milestone'u acmak ister`
- Exit criteria: `Ilk aktif milestone acildi`
- In scope now:
  - `Workflow surface'i idle ve temiz tutmak`
  - `Workflow ancak explicit istendiginde acilsin`
- Explicitly out of scope now:
  - `Kullanici istemeden milestone planning'i baslatmak`

## Phase Ladder

| Phase | Name | Status | Exit signal |
| --- | --- | --- | --- |
| 0 | Idle / Ready | active | Kullanici isterse milestone acilabilir |
| 1 | Discuss / Research | pending | Scope net ve context hazir |
| 2 | Execute / Audit | pending | Dogrulama temiz |
| 3 | Complete / Handoff | pending | Closeout veya pause hazir |

## Plan of Record

- Milestone: `NONE`
- Step owner: `plan`
- Plan status: `idle_until_user_opens_milestone`
- Carryforward considered: `Yok`
- Run chunk id: `NONE`
- Run chunk hash: `pending`
- Chunk cursor: `0/0`
- Completed items: `Yok`
- Remaining items: `Kullanici isterse ilk milestone'u ac`
- Resume from item: `Milestone open`
- Estimated packet tokens: `0`
- Estimated execution overhead: `2000`
- Estimated verify overhead: `1000`
- Minimum reserve: `16000`
- Safe in current window: `yes`
- Current run chunk:
  - `Yok`
- Next run chunk:
  - `Kullanici isterse ilk milestone'u ac`
- Implementation checklist:
  - `Yok`
- Audit plan:
  - `Yok`
- Out-of-scope guardrails:
  - `Kullanici istemeden milestone planning'i baslatma`

## What Would Falsify This Plan?

- `CONTEXT input hash plan step'inde refresh edilmeden degisirse bu plan stale olur`
- `WINDOW budget yeni step icin yetersizse ayni chunk guvenli degildir`

## Deliverables

- `PROJECT.md` workflow'un neden var oldugunu ve hedeflerini tutacak
- `RUNTIME.md` operasyonel komutlari ve git/runtime notlarini tutacak
- `PREFERENCES.md` solo/team, discuss mode ve git isolation davranisini tutacak
- `VALIDATION.md` audit kontratini tutacak
- `HANDOFF.md` session-level pause/resume snapshot'ini tutacak
- `WINDOW.md` context-budget ve resume cursor katmanini tutacak
- `SEEDS.md` ileriye donuk fikirleri tutacak
- `RETRO.md` surec kalitesi ve self-improvement kuyruğunu tutacak
- `WORKSTREAMS.md` aktif root'u ve switch log'unu tutacak
- `tests/golden/workflow/` workflow-level golden yuzeyi olarak kullanilabilecek

## Notes

- `Bu dosya backlog degil; yalnizca aktif stream'in kanonik plani`
- `workflow:packet`, `workflow:next`, `workflow:pause-work`, `workflow:resume-work`, `workflow:doctor`, `workflow:health` ve `workflow:forensics` operasyonel katmani destekler
- `complete_milestone`, workflow disi degisiklik varken explicit `--stage-paths` veya bilincli `--allow-workflow-only` olmadan auto-commit etmez
