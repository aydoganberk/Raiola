---
name: codex-workflow
description: "Repo workstream continuity protocol. Use only when the user explicitly asks for workflow/milestone/handoff/closeout discipline, or when resuming a workflow milestone they explicitly started."
---

# codex-workflow

Bu skill, repo icindeki cok-seansli isleri ayni kalici protokolle surdurmek icin kullanilir.
Varsayilan degildir; kullanici workflow'u acikca istemediyse normal task akisiyla ilerlenir.

## Ne zaman kullanilir

- Kullanici acikca workflow/milestone/handoff/closeout disiplini istediginde
- Kullanici daha once acikca baslatilmis yarim bir workflow milestone'unu devam ettirmeyi istediginde
- Named workstream, validation kontrati veya pause/resume snapshot'i explicit olarak istendiginde

## Granularity

- Varsayilan planning birimi tek milestone'dur.
- Tek bir kullanici istegi genelde tek milestone olarak ele alinir.
- `discuss -> research -> plan -> execute -> audit -> complete` asamalari ayrik milestone degil, ayni milestone'un step'leridir.

## Workflow Profilleri

- `lite`
  - `Kucuk, tek-seansli veya dusuk rituel gerektiren isler`
- `standard`
  - `Varsayilan genel amacli profil`
- `full`
  - `Gercek handoff/closeout, cok-seansli koordinasyon ve process kalite takibi gereken isler`
- `Workflow mode` ile `Workflow profile` ayridir:
  - `mode` ekip/git izolasyonunu belirler
  - `profile` rituel derinligini ve minimum done beklentisini belirler

## Baslangic sirasi

1. `AGENTS.md` oku.
2. Aktif workstream root'unu `docs/workflow/WORKSTREAMS.md` uzerinden coz.
3. Ilgili root altinda su dosyalari oku:
   - `PROJECT.md`
   - `RUNTIME.md`
   - `PREFERENCES.md`
   - `EXECPLAN.md`
   - `STATUS.md`
   - `DECISIONS.md`
   - `MILESTONES.md`
   - `CONTEXT.md`
   - `CARRYFORWARD.md`
   - `VALIDATION.md`
   - `HANDOFF.md`
   - `WINDOW.md`
   - `SEEDS.md`
4. `MEMORY.md` icinde aktif milestone'a bagli `Active Recall Items` varsa otomatik oku.
5. `MEMORY.md` icindeki `Durable Notes` bolumunu yalnizca kullanici kalici hafiza tutmani istediyse veya task icin gercekten gerekli ise oku.
6. Mevcut state'i `8-12` maddede ozetle.
7. Yalnizca aktif fazi, aktif milestone'u ve aktif milestone step'ini uygula.

## Milestone loop

Aktif milestone her zaman su loop ile ilerler:

1. `discuss`
   - Once codebase'i tara.
   - `PREFERENCES.md` icindeki `Discuss mode` degerine gore ilerle:
     - `assumptions`: once dosyalari oku, sonra kanitli varsayim listesi cikar.
     - `interview`: once hedefi netlestir, sonra yalnizca yuksek etkili sorular sor.
   - `CONTEXT.md` icinde problem frame, scan summary, canonical refs, claim ledger, unknowns, seed intake ve active recall intake'i yaz.
2. `research`
   - Degisecek dosyalari, bagimliliklari, riskleri ve verification surface'i cikar.
   - `CONTEXT.md`yi research bulgulari ile guncelle.
   - `VALIDATION.md` icindeki success contract, verify command ve manual check alanlarini aktif milestone scope'una daralt.
3. `plan`
   - Yalnizca `CONTEXT.md` research-sonrasi guncelse devam et.
   - `CARRYFORWARD.md` ve ilgili seed'leri oku.
   - Source of truth plani `EXECPLAN.md` icindeki `Plan of Record` bolumune yaz.
   - Plani context window'a uygun 1-2 run chunk olacak sekilde bol.
   - `WINDOW.md` ve packet budget yeni chunk icin yeterli degilse yeni step baslatma.
4. `execute`
   - Yalnizca aktif milestone planini uygula.
   - Gerekirse ayni milestone icin `workflow:save-memory` ile active recall notu birak.
5. `audit`
   - `VALIDATION.md` contract tablosu uzerinden test, diff, review veya smoke check yap.
   - Sonucu ve kalan riskleri `STATUS.md`'ye yaz.
6. `complete`
   - Kaniti, kalan riskleri ve sonraki milestone onerini yaz.
   - Tamamlanmayan maddeleri gerekiyorsa `CARRYFORWARD.md`'ye tasi.
   - Milestone ozetini, final context'i ve validation snapshot'ini `completed_milestones/` altina arsivle.
   - O milestone'a bagli `Active Recall Items` kayitlarini `MEMORY.md` icinden temizle.
   - `AGENTS.md` guncellemesi gerekip gerekmedigini kontrol et.
   - Audit kapanmissa `workflow:health -- --strict` temizken commit ve push protokolunu uygula.

## Minimum Done Checklists

- `discuss`
  - `Goal/non-goals/success signal net`
  - `Canonical refs + assumptions dolu`
  - `Scope kanitli sekilde frame edildi`
- `research`
  - `Touched files dolu`
  - `Dependency map + risks dolu`
  - `VALIDATION.md milestone scope'una daraltildi`
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

## Operasyonel helper'lar

- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."`
- `npm run workflow:complete-milestone -- --agents-review unchanged --summary "..." --stage-paths src/foo,tests/foo`
- `npm run workflow:save-memory -- --title "..." --note "..."`
- `npm run workflow:packet -- --step plan --json`
- `npm run workflow:next`
- `npm run workflow:pause-work -- --summary "..."`
- `npm run workflow:resume-work`
- `npm run workflow:plant-seed -- --title "..." --trigger "..."`
- `npm run workflow:switch-workstream -- --name "<slug>" --create`
- `npm run workflow:doctor`
- `npm run workflow:health -- --strict`
- `npm run workflow:forensics`

## Failure Playbook

- `Hash drift`
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream veya --root ile dogru root'a don`
- `Resume ambiguity`
  - `HANDOFF.md + WINDOW.md oku -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `complete-milestone icin explicit --stage-paths veya docs-only ise --allow-workflow-only kullan`

## Calisma kurallari

- `STATUS.md` active-window only tutulur.
- `EXECPLAN.md` plan step'inin tek source of truth'udur.
- `DECISIONS.md` yalnizca kalici cross-milestone kararlar icindir.
- `VALIDATION.md` audit kontratinin kanonik kaynagidir.
- `HANDOFF.md` session-level pause/resume snapshot'idir.
- `WINDOW.md` aktif context budget ve execution cursor karari icindir.
- `SEEDS.md`, `CARRYFORWARD.md` ile karistirilmaz:
  - `CARRYFORWARD`: kapanmayan aktif isler
  - `SEEDS`: daha sonraya ekilecek fikirler
- `WORKSTREAMS.md` aktif root'u kaydeder; script'ler explicit `--root` verilmediginde once buraya bakar.
- `PREFERENCES.md` solo/team mode, discuss mode ve git isolation davranisini belirler.
- Named stream gerekiyorsa generic `docs/workflow/*` yerine `docs/<workstream>/*` surface'ine gec.
- `AGENTS.md` combined size limiti varsayilan olarak `32 KiB` kabul edilir; buyurse baglami bol.

## Gorunurluk notu

- Codex app uzerinde skill bazli renk veya custom UI stili garanti edilemez.
- Bu nedenle workflow skill aktifken tum `commentary` update'leri `WORKFLOW:` prefiksi ile baslamalidir.
- Prefiks yalnizca workflow aktifken zorunludur; normal task akisinda kullanilmaz.
- Mumkunse prefiksten hemen sonra aktif step yaz:
  - `WORKFLOW: discuss`
  - `WORKFLOW: research`
  - `WORKFLOW: plan`
  - `WORKFLOW: execute`
  - `WORKFLOW: audit`
  - `WORKFLOW: complete`
  - `WORKFLOW: handoff`

## Workflow update kontrati

- Workflow aktifken her ara update su formata yakin olmali:
  - `WORKFLOW: <step> | milestone=<id veya NONE> | root=<path>`
- Ilk cumle mevcut hareketi ve sonraki adimi soylemeli.
- Mumkun oldugunca 1-2 cumle kal; detay gerekiyorsa ikinci cumlede ver.
- Block varsa step yerine `blocked` veya `handoff` kullanmak serbesttir:
  - `WORKFLOW: blocked | milestone=M3 | root=docs/yahoo-sync`
  - `WORKFLOW: handoff | milestone=M3 | root=docs/yahoo-sync`
- Dosya editi oncesi update mutlaka `WORKFLOW: execute` ile baslamali.
- Audit/test oncesi update mutlaka `WORKFLOW: audit` ile baslamali.

## Update sablonlari

```text
WORKFLOW: discuss | milestone=M2 | root=docs/workflow
Aktif root ve kanonik dosyalari okuyup scope'u netlestiriyorum; sonra CONTEXT.md icin kanitli varsayimlari cikaracagim.
```

```text
WORKFLOW: research | milestone=M2 | root=docs/workflow
Degisecek dosyalari ve verification surface'i daraltiyorum; bir sonraki adim VALIDATION.md kontratini milestone scope'una indirmek.
```

```text
WORKFLOW: execute | milestone=M2 | root=docs/workflow
Planlanan degisiklikleri uyguluyorum; hemen ardindan doctor/health ile workflow yuzeyini tekrar kontrol edecegim.
```

```text
WORKFLOW: audit | milestone=M2 | root=docs/workflow
Hedefli komutlari kosup kalan riskleri kapatiyorum; sonuc temizse milestone closeout'a gececegim.
```

```text
WORKFLOW: handoff | milestone=M2 | root=docs/workflow
Bu pencerede yeni adim baslatmiyorum; resume icin HANDOFF.md ve workflow:resume-work komutunu hazirliyorum.
```

## Golden snapshot kurali

- Provider-level baselines: `tests/golden/providers/`
- Workflow/workstream baselines: `tests/golden/workflow/` veya `tests/golden/<workstream>/`
- Diff almak icin:

```bash
node scripts/compare_golden_snapshots.ts <baseline> <candidate>
```

## Sinirlar

- Skill state tutmaz; state'in kanonik kaynagi her zaman repo icindeki workflow dosyalaridir.
- Skill backlog dokumani yerine gecmez; yalnizca aktif state ve closeout disiplinini sabitler.

## Retro Surface

- `RETRO.md` validation state degil, surec kalitesi yuzeyidir.
- Trigger:
  - `Her 5 completed milestone`
  - `Ayni tip forensics kok nedeni 2 kez gorulurse`
  - `Kullanici explicit surec iyilestirmesi isterse`
- Retro loop:
  - `Archive + handoff + forensics + kullanici duzeltmelerini topla`
  - `Binary surec kalite check'lerini degerlendir`
  - `Tek bir process degisikligi sec`
  - `Skill/docs/scripts'e uygula`
  - `Sonraki 1-2 gercek milestone'da keep/discard karari ver`
