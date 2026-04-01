# DECISIONS

Bu dosya aktif stream ile ilgili mimari ve surec kararlarini tarih sirasi ile tutar.

Kural:
- Bu dosya active-window degil, ama yalnizca kalici ve cross-milestone kararlar icin kullanilir.
- Milestone'a ozel gecici kararlar, tradeoff log'lari ve implementation tartismalari `completed_milestones/` arsivine gider.

## 2026-04-01 - Varsayilan workflow surface `docs/workflow/*`

- Decision:
  - Repo genelinde tek ve kolay bulunabilir bir varsayilan surface olarak `docs/workflow/EXECPLAN.md`, `docs/workflow/STATUS.md`, `docs/workflow/DECISIONS.md` kullan.
- Why:
  - Her yeni seans icin sabit bir giris noktasi verir.
  - Tek aktif stream senaryosunda overhead dusuktur.
  - Gerektiginde ayni yapinin `docs/<workstream>/` altina kopyalanmasi kolaydir.
- Consequence:
  - Parallel stream basladiginda generic klasor tek basina yeterli olmayabilir; o anda isimli klasore gecilmeli.

## 2026-04-01 - Repo-local skill ile workflow invocation

- Decision:
  - Bu sistematigi repo icinde cagirilabilir bir skill olarak `.agents/skills/codex-workflow/` altina koy.
- Why:
  - Gelecek Codex seanslarinda ayni protokolu yeniden anlatma ihtiyacini azaltir.
  - Skill, `AGENTS.md` ile birlikte hem kalici kural hem de task-level workflow verir.
- Consequence:
  - Skill metni kisa tutulmali; detayli state her zaman `docs/workflow/*` veya `docs/<workstream>/*` icinde yasamali.

## 2026-04-01 - Golden artifacts `tests/golden/` altinda tutulur

- Decision:
  - Provider baselines icin `tests/golden/providers/`, is akisina ozel baselines icin `tests/golden/<workstream>/` kullan.
- Why:
  - Provider-level fixtures ile workstream regression baselines ayrisir.
  - Test yuzu runtime koda yakin kalir.
- Consequence:
  - Baseline adlandirma ve update disiplini `STATUS.md` icinde not edilmelidir.

## 2026-04-01 - Milestone tracking `MILESTONES.md` ile ayrilir

- Decision:
  - Fazlardan ayri olarak teslimat bazli milestone takibi icin `MILESTONES.md` kullan.
- Why:
  - Fazlar cok genis kalabiliyor; milestone'lar seanslar arasi daha kisa ve takip edilebilir ilerleme noktasi veriyor.
  - "Sadece aktif milestone" kuralini koyarak scope kaymasi azalir.
- Consequence:
  - Her workflow klasoru artik dort ana dosya ile gelir: `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`.

## 2026-04-01 - Milestone lifecycle zorunlu loop olarak calisir

- Decision:
  - Her aktif milestone `discuss -> research -> plan -> execute -> audit -> complete` loop'u ile ilerler.
- Why:
  - Scope'u erken netlestirir.
  - Kod degistirmeden once arastirma ve dosya taramasini zorunlu kilar.
  - Audit adimini explicit yaparak "implement edildi ama dogrulanmadi" durumunu azaltir.
- Consequence:
  - `STATUS.md`, `EXECPLAN.md` ve `MILESTONES.md` aktif milestone step bilgisini tasir.
  - Sonraki milestone planlama, mevcut milestone complete edilmeden baslamaz.

## 2026-04-01 - `CONTEXT.md` discuss/research arasinda zorunlu hafiza katmanidir

- Decision:
  - Her workflow klasorune `CONTEXT.md` ekle.
  - `discuss` sonunda ilk context snapshot'i olustur.
  - `research` sonunda ayni dosyayi guncelle.
  - `plan` adimi ancak research-sonrasi guncel context ile baslasin.
- Why:
  - Seanslar arasi problem framing, varsayimlar, touched files ve risklerin dagilmasini onler.
  - Context kaybi oldugunda tek ve hizli bir referans noktasi verir.
- Consequence:
  - Varsayilan workflow surface artik bes ana dosya ile gelir: `EXECPLAN.md`, `STATUS.md`, `DECISIONS.md`, `MILESTONES.md`, `CONTEXT.md`.

## 2026-04-01 - `CONTEXT.md` aktif milestone'a ozeldir, tamamlananlar arsivlenir

- Decision:
  - `CONTEXT.md` yalnizca aktif milestone'un calisma hafizasi olarak kullanilsin.
  - Her yeni milestone basinda sifirlanip yeniden yazilsin.
  - Tamamlanan milestone detaylari `completed_milestones/` altinda saklansin.
- Why:
  - Aktif context'in temiz kalmasini saglar.
  - Eski milestone framing'inin yeni milestone'a sizmasini onler.
  - Backtrack gerektiginde milestone bazli audit trail verir.
- Consequence:
  - Varsayilan workflow surface artik aktif dosyalar + `completed_milestones/` arsiv klasorunden olusur.

## 2026-04-01 - Plan step'in source of truth'u `EXECPLAN.md` icindeki `Plan of Record` olur

- Decision:
  - `plan` adiminda olusan uygulanabilir planin kanonik kaynagi `EXECPLAN.md` icindeki `Plan of Record` bolumudur.
  - `MILESTONES.md` icindeki plan checklist'i yalnizca kisa bir ozet olarak kalir.
- Why:
  - Planin tek bir yerde kanonik olmasi execute adiminda karisiklik riskini azaltir.
  - Milestone karti kisa kalir, detayli uygulama plani sismez.
- Consequence:
  - Execute adimi `EXECPLAN.md` uzerinden ilerler.

## 2026-04-01 - `CARRYFORWARD.md` kapanmayan isler icin aktif kuyruktur

- Decision:
  - Tamamlanmayan ama sonraki milestone'a tasinmasi gereken maddeler `CARRYFORWARD.md` icinde tutulur.
  - Yeni milestone planning'i baslamadan once bu dosya okunur.
- Why:
  - Milestone kapanisinda is kaybini azaltir.
  - Sonraki milestone planinin dogrudan onceki eksiklerden beslenmesini saglar.
- Consequence:
  - `CARRYFORWARD.md` active-window only tutulur; detayli tarihce arsivlerde kalir.

## 2026-04-01 - `MEMORY.md` kullanici-tetiklemeli kalici hafiza yuzeyidir

- Decision:
  - `MEMORY.md` yalnizca kullanici explicit olarak hafiza tutulmasini istediginde veya ayni milestone icin active recall notu birakilacaginda guncellenir.
  - Dosya iki katmanlidir: `Active Recall Items` ve `Durable Notes`.
- Why:
  - Kullanici tarafindan "bunu sonra da hatirla" denilen seyleri context reset'lerinden korur.
  - Ayni milestone icindeki gecici recall notlarini daha kalici tercihlerden ayirir.
- Consequence:
  - `MEMORY.md` aktif recall + durable hafiza olarak okunur.

## 2026-04-01 - `save_memory` helper'i memory formatini standardize eder

- Decision:
  - `MEMORY.md` kayitlari icin `workflow:save-memory` helper'i kullan.
- Why:
  - Durable note formatinin tutarli kalmasini saglar.
  - Elle edit ihtiyacini azaltir.
- Consequence:
  - `MEMORY.md` girisleri tarih, baslik, note ve opsiyonel tag/source formatinda yazilir.

## 2026-04-01 - Planlar run-sized chunk'lara bolunur

- Decision:
  - Her milestone plan'i context window'a uygun 1-2 run chunk olacak sekilde yazilir.
- Why:
  - Tek seferde fazla scope acilmasini onler.
  - Seanslar arasi planin uygulanabilir parcalara bolunmesini saglar.
- Consequence:
  - `EXECPLAN.md` icindeki `Plan of Record` bolumu current/next run chunk alanlari tasir.

## 2026-04-01 - Complete milestone audit kapanisindan sonra commit/push gerektirir

- Decision:
  - Milestone `complete` edilmeden once audit kapanmali.
  - `complete milestone` sonrasinda commit ve push protokolunun uygulanmasi varsayilan davranistir.
  - `AGENTS.md` guncellemesi gerekip gerekmedigi complete oncesi kontrol edilir.
- Why:
  - Milestone kapanisini sadece dokumansal degil, version control seviyesinde de netlestirir.
  - Bilgi drift'ini azaltir.
- Consequence:
  - `complete_milestone` helper'i git add/commit/push akisini destekler.
  - `AGENTS.md` combined size takibi gereklidir.

## 2026-04-01 - Active recall memory ayni milestone icinde otomatik okunur

- Decision:
  - `MEMORY.md` iki bolume ayrilir: `Active Recall Items` ve `Durable Notes`.
  - Aktif milestone'a bagli recall notlari ayni milestone devam ederken otomatik okunur.
- Why:
  - Context window degistiginde ayni milestone icindeki ara notlar kaybolmasin.
  - Milestone-a ozel gecici notlar ile daha kalici tercihler ayrissin.
- Consequence:
  - `workflow:save-memory` aktif milestone varken varsayilan olarak `active` modda yazar.
  - Seans baslangic protokolu active recall notlarini otomatik okur.

## 2026-04-01 - Milestone complete aktif recall memory notlarini temizler

- Decision:
  - `complete_milestone` aktif milestone'a bagli `Active Recall Items` kayitlarini `MEMORY.md` icinden temizler ve arsive snapshot olarak tasir.
- Why:
  - Milestone tamamlandiktan sonra gecici recall notlari birikmesin.
  - Backtrack icin bilgi kaybi olmadan aktif hafiza temiz kalsin.
- Consequence:
  - `MEMORY.md` active-window benzeri temiz bir recall yuzeyi olarak kalir.
  - Gecmis recall notlari milestone arsivinde izlenebilir.

## 2026-04-01 - Complete milestone git preflight stage scope'u zorunlu netlestirir

- Decision:
  - `complete_milestone`, workflow dosyalari disinda repo degisikligi varsa explicit `--stage-paths` veya bilincli `--allow-workflow-only` olmadan auto-commit etmez.
- Why:
  - Yanlis scope ile eksik veya fazla dosyanin milestone commit'ine girmesini azaltir.
  - Dirty worktree icinde milestone closeout'u daha guvenli yapar.
- Consequence:
  - Milestone kapanisinda code path secimi explicit hale gelir.
  - Docs-only kapanislar icin `--allow-workflow-only` bilincli bir override olur.

## 2026-04-01 - Artifact seti `PROJECT`, `RUNTIME`, `PREFERENCES`, `VALIDATION`, `HANDOFF`, `SEEDS`, `WORKSTREAMS` ile genisletildi

- Decision:
  - Workflow surface artik yalnizca plan/status/decisions/milestones baglamindan olusmaz.
  - `PROJECT.md`, `RUNTIME.md`, `PREFERENCES.md`, `VALIDATION.md`, `HANDOFF.md`, `SEEDS.md` ve `WORKSTREAMS.md` artefact setine eklenir.
- Why:
  - Neden, nasil ve su an ne durumda sorularini ayni dosyada toplamak yerine ayrik katmanlara bolmek AGENTS sismesini ve context drift'ini azaltir.
- Consequence:
  - Seans baslangic protokolu ve helper script'ler bu dosyalari da okuyacak sekilde genisler.

## 2026-04-01 - Discuss mode preference seviyesinde secilir

- Decision:
  - `PREFERENCES.md` icindeki `Discuss mode` alani `assumptions` ve `interview` modlari arasinda secim yapar.
- Why:
  - Bazi codebase'lerde once kodu tarayip varsayim uretmek daha hizlidir; bazi task'larda ise once kisa hedef netlestirmesi gerekir.
- Consequence:
  - `CONTEXT.md`, `MILESTONES.md` ve `workflow:next` discuss davranisini bu preference'a gore aciklar.

## 2026-04-01 - `workflow:next` aktif step icin operasyonel yonlendirici olur

- Decision:
  - `workflow:next`, aktif milestone step'ine gore tek onerilen sonraki hareketi ureten yardimci olur.
- Why:
  - Buyuyen workflow artifact seti icinde "simdi ne yapmaliyim" sorusuna hizli cevap verir.
- Consequence:
  - `STATUS.md` ve `HANDOFF.md` okunarak aktif step, discuss mode ve recall state birlestirilir.

## 2026-04-01 - `HANDOFF.md` pause/resume icin session-level snapshot katmanidir

- Decision:
  - `HANDOFF.md` milestone history degil, sadece seans kapanis/acilis snapshot'i tutar.
- Why:
  - `MEMORY.md` kalici hafiza icin, `HANDOFF.md` ise "tam burada kaldik" bilgisi icin daha uygun katmandir.
- Consequence:
  - `workflow:pause-work` ve `workflow:resume-work` bu dosya etrafinda calisir.

## 2026-04-01 - `SEEDS.md` carryforward'dan ayrik tutulur

- Decision:
  - `SEEDS.md`, kapanmayan aktif isleri tutan `CARRYFORWARD.md`'den ayrik bir fikir katmani olarak tutulur.
- Why:
  - "Sonraki milestone'da muhtemelen lazim olacak fikir" ile "tamamlanmadi, tasinmali" ayni sey degildir.
- Consequence:
  - Yeni milestone discuss/plan asamalarinda seed intake ayrica gorunur.

## 2026-04-01 - Named workstream root secimi `WORKSTREAMS.md` ile kaydedilir

- Decision:
  - Aktif workflow root'u `WORKSTREAMS.md` icinde kaydedilir ve script'ler explicit `--root` verilmediginde once buraya bakar.
- Why:
  - Generic `docs/workflow` ile isimli `docs/<workstream>` root'lari arasinda gecis ergonomisini iyilestirir.
- Consequence:
  - `workflow:switch-workstream` named root scaffold etme ve aktif root secme gorevini ustlenir.

## 2026-04-01 - `workflow:doctor` ve `workflow:forensics` gozlem katmani ekler

- Decision:
  - Workflow state'in sagligini kontrol etmek icin `workflow:doctor`, ayni andaki state'i dondurmek icin `workflow:forensics` eklenir.
- Why:
  - Artifact sayisi arttikca dosyalar arasi drift'i elle yakalamak zorlasir.
- Consequence:
  - Verification asamasinda doctor/forensics komutlari hedefli audit yuzeyine dahil olur.
