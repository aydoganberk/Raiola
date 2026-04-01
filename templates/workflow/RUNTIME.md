# RUNTIME

- Last updated: `2026-04-02`
- Runtime status: `documented`
- Default workflow root: `docs/workflow`
- Default compare script: `scripts/compare_golden_snapshots.ts`

## Core Commands

- `npm run workflow:new-milestone -- --id Mx --name "..." --goal "..."`
- `npm run workflow:complete-milestone -- --agents-review unchanged --summary "..."`
- `npm run workflow:save-memory -- --title "..." --note "..."`
- `npm run workflow:packet -- --step plan --json`
- `npm run workflow:next`
- `npm run workflow:pause-work -- --summary "..."`
- `npm run workflow:resume-work`
- `npm run workflow:doctor`
- `npm run workflow:health -- --strict`
- `npm run workflow:forensics`
- `npm run workflow:workstreams status`
- `npm run workflow:switch-workstream -- --name "<slug>"`
- `npm run workflow:plant-seed -- --title "..." --trigger "..."`

## Activation Notes

- Workflow protokolu varsayilan degildir; kullanici acikca istediginde acilir
- Kullanici workflow istemediyse normal task akisiyla ilerlenir
- Tek bir kullanici istegi genelde tek milestone olarak modellenir
- `discuss -> research -> plan -> execute -> audit -> complete` asamalari ayni milestone'un step'leridir

## Workflow Profiles

- `lite`
  - `Kucuk isler, minimum rituel, kisa packet`
- `standard`
  - `Genel varsayilan profil`
- `full`
  - `Gercek handoff/closeout, cok-seansli takip ve process kalite notu gereken isler`

## Git Runtime Notes

- `complete_milestone` default closeout davranisi commit + push yonundedir
- Dirty worktree varsa script explicit `--stage-paths` veya bilincli `--allow-workflow-only` ister
- `PREFERENCES.md` icindeki `Git isolation` alani workflow'un branch/worktree beklentisini kaydeder
- `ensure_isolation.js` none|branch|worktree davranisini set eder veya dogrular

## Validation Runtime Notes

- `VALIDATION.md` audit kontratinin kanonik kaynagidir
- Plan sirasinda verify command, expected signal, manual check, golden ve evidence kayitlari oraya yazilmali
- Audit sirasinda kosulan komutlar `STATUS.md` ve `VALIDATION.md` uzerinden okunur

## Minimum Done

- `discuss`
  - `Goal/non-goals/success signal net`
  - `Canonical refs ve assumptions dolu`
  - `Scope kanitli sekilde frame edildi`
- `research`
  - `Touched files dolu`
  - `Dependency map ve risks dolu`
  - `Validation contract milestone scope'una daraltildi`
- `plan`
  - `Context plan-ready`
  - `1-2 run chunk yazildi`
  - `Audit plan ve overhead alanlari yazildi`
- `execute`
  - `Sadece aktif chunk uygulandi`
  - `Status alanlari guncellendi`
  - `Plan disi drift docs'a geri yansitildi`
- `audit`
  - `Verify command'ler kostu`
  - `Manual checks ve residual risks yazildi`
  - `Strict health gate complete oncesi temiz`
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
  - `workflow:complete-milestone komutunda explicit --stage-paths ver veya docs-only ise --allow-workflow-only kullan`

## Resume Runtime Notes

- `HANDOFF.md` session-level pause/resume katmanidir
- `WINDOW.md` budget/orchestrator snapshot'idir
- `MEMORY.md` active recall + durable memory icindir
- `SEEDS.md` bir sonraki milestone veya workstream'e tasinacak fikirleri tutar
- `resume-work` sonrasi ilk komut `workflow:health -- --strict` olmalidir

## Retro Runtime Notes

- `RETRO.md` surec kalitesi yuzeyidir; validation state'i degil process frictions / improvements kaydidir
- Her `5` completed milestone sonrasi, tekrar eden forensics kok nedeni goruldugunde veya explicit istenince guncellenir
- `full` profilde audit/complete sirasinda retro notu ihtimali aktif olarak kontrol edilir
