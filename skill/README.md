# codex-workflow README

`codex-workflow`, repo icindeki cok-seansli veya milestone bazli isleri ayni kontrol duzlemiyle surdurmek icin yazilmis bir skill'dir.
Varsayilan akisin yerine gecmez. Kullanici workflow, milestone, handoff, closeout veya named workstream istemediyse normal task akisi tercih edilir.

## Ne zaman kullan

- Is birden fazla seansa yayilacaksa
- Handoff, resume veya closeout disiplini isteniyorsa
- Validation contract, carryforward veya seed takibi gerekiyorsa
- Ayrik bir `docs/<workstream>/` root'u ile ilerlemek gerekiyorsa

## Ne zaman kullanma

- Tek adimlik duz bir bugfix veya ufak refactor ise
- Kullanici explicit workflow istemediyse
- Workflow dosyalarini guncellemek istenmiyorsa

## Ilk 60 saniye

1. `AGENTS.md` oku.
2. Aktif root'u bulmak icin `docs/workflow/WORKSTREAMS.md` oku.
3. Aktif root altinda su dosyalari hizlica tara:
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
   - `MEMORY.md`
4. State'i `8-12` maddede ozetle.
5. Sadece aktif milestone ve aktif step scope'unda kal.

## Milestone akisi

Tek bir kullanici istegi genelde tek milestone kabul edilir. Step'ler:

1. `discuss`
2. `research`
3. `plan`
4. `execute`
5. `audit`
6. `complete`

Bu step'ler ayrik milestone degildir; ayni milestone'un ic akisi olarak dusunulur.

## Workflow Profilleri

- `lite`: kucuk ve dusuk rituel gerektiren isler
- `standard`: varsayilan genel amacli profil
- `full`: handoff, closeout ve process kalite takibi gereken isler

## En kisa mutlu yol

Yeni milestone ac:

```bash
npm run workflow:new-milestone -- --id M2 --name "Fix auth drift" --goal "Auth akisini kanitli sekilde toparla"
```

Sonraki onerilen adimi gor:

```bash
npm run workflow:next
```

Saglik kontrolu al:

```bash
npm run workflow:doctor
npm run workflow:health -- --strict
```

Milestone kapat:

```bash
npm run workflow:complete-milestone -- --agents-review unchanged --summary "Auth drift kapatildi" --stage-paths src/foo,tests/foo
```

## Temel dosyalar

- `WORKSTREAMS.md`: aktif root ve named workstream kayitlari
- `STATUS.md`: yalnizca aktif pencere ve son durum
- `CONTEXT.md`: aktif milestone hafizasi
- `EXECPLAN.md`: `Plan of Record`
- `VALIDATION.md`: audit kontrati
- `HANDOFF.md`: pause/resume snapshot'i
- `WINDOW.md`: context budget ve chunk karari
- `CARRYFORWARD.md`: kapanmayan isler
- `SEEDS.md`: daha sonra ekilebilecek fikirler
- `MEMORY.md`: active recall ve durable notes

## En cok kullanilan komutlar

```bash
npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."
npm run workflow:next
npm run workflow:packet -- --step plan --json
npm run workflow:pause-work -- --summary "..."
npm run workflow:resume-work
npm run workflow:save-memory -- --title "..." --note "..."
npm run workflow:plant-seed -- --title "..." --trigger "..."
npm run workflow:switch-workstream -- --name "<slug>" --create
npm run workflow:workstreams status
npm run workflow:doctor
npm run workflow:health -- --strict
npm run workflow:forensics
```

## Named workstream

Repo-wide varsayilan root `docs/workflow` altindadir.
Isi ayirmak gerekiyorsa:

```bash
npm run workflow:switch-workstream -- --name yahoo-sync --create
```

Bu komut `docs/yahoo-sync/` altinda ayni artifact setini olusturur ve aktif root'u oraya tasir.

## Minimum Done

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

## Memory kurali

- `Active Recall Items`: sadece aktif milestone boyunca otomatik geri cagrilacak notlar
- `Durable Notes`: milestone disi daha kalici notlar

Kayit icin:

```bash
npm run workflow:save-memory -- --title "UI preference" --note "Responses short olsun"
```

Kalici not istersen:

```bash
npm run workflow:save-memory -- --mode durable --title "Repo rule" --note "..."
```

## Gorunurluk

Codex app icinde skill bazli renk atamasi README veya skill seviyesinden yapilamaz.
Bu yuzden workflow aktifken ara update'leri zorunlu olarak `WORKFLOW:` prefiksi ile ayirt et.
En iyi pratik, prefiksten hemen sonra aktif step'i ve mumkunse milestone/root bilgisini yazmaktir:

- `WORKFLOW: discuss | milestone=M2 | root=docs/workflow`
- `WORKFLOW: research | milestone=M2 | root=docs/workflow`
- `WORKFLOW: execute | milestone=M2 | root=docs/workflow`
- `WORKFLOW: audit | milestone=M2 | root=docs/workflow`
- `WORKFLOW: handoff | milestone=M2 | root=docs/workflow`

Kisa ornekler:

```text
WORKFLOW: discuss | milestone=M2 | root=docs/workflow
Aktif root ve state'i okuyorum; birazdan CONTEXT.md icin kanitli varsayim ozetini cikaracagim.
```

```text
WORKFLOW: execute | milestone=M2 | root=docs/workflow
Planlanan dosya editlerine geciyorum; bittiginde doctor ve health ile workflow yuzeyini tekrar dogrulayacagim.
```

```text
WORKFLOW: handoff | milestone=M2 | root=docs/workflow
Bu pencerede yeni step baslatmiyorum; resume komutunu ve acik cursor'u HANDOFF.md uzerinden birakiyorum.
```

## Failure Playbook

- `Hash drift`
  - `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch`
  - `workflow:workstreams status -> workflow:switch-workstream veya --root ile dogru root'a don`
- `Resume ambiguity`
  - `HANDOFF.md + WINDOW.md oku -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout`
  - `complete-milestone icin explicit --stage-paths veya docs-only ise --allow-workflow-only kullan`

## Retro Surface

- `RETRO.md` surec kalitesi icindir; validation yerine gecmez
- Her `5` completed milestone sonrasi veya tekrar eden process arizasinda guncellenir
- `full` profilde audit/complete sirasinda retro notu kontrol etmek iyi pratiktir

## Sik hatalar

- Workflow istemeyen normal task'ta bu skill'i gereksiz yere aktive etmek
- `STATUS.md` yerine gecmis changelog yazmak
- `EXECPLAN.md` disinda ikinci bir plan kaynagi olusturmak
- `VALIDATION.md` audit kontratini doldurmadan milestone kapatmak
- `CARRYFORWARD.md` ile `SEEDS.md`'i ayni sey sanmak
- Named workstream acip halen eski root'a gore calismak

## Kisa checklist

- Aktif root dogru mu
- Aktif milestone ve step net mi
- `CONTEXT.md` research sonrasi guncel mi
- `EXECPLAN.md` 1-2 run chunk'a bolunmus mu
- `VALIDATION.md` milestone scope'una daraltilmis mi
- `workflow:health -- --strict` temiz mi
