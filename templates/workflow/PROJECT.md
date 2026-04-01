# PROJECT

- Last updated: `2026-04-02`
- Scope owner: `Codex + repo collaborators`
- Current workstream: `Default workflow control plane`
- Project status: `ready`

## Purpose

- Bu klasor, repo icindeki kalici Codex workflow protokolunun kanonik yuzeyidir.
- Amac, cok-seansli calismalarda context kaybini azaltmak, packet budget'ini olcmek ve kanitsiz claim riskini dusurmektir.
- Bu yuzey varsayilan degil, opt-in calisir; kullanici workflow'u acikca istediginde aktif kullanilir.

## Primary Outcomes

- `discuss -> research -> plan -> execute -> audit -> complete` loop'unu sabitlemek
- `WORKSTREAMS -> CONTEXT packet -> EXECPLAN -> VALIDATION -> COMPLETE` zincirini source-of-truth olarak tutmak
- Active-window dosyalari ile archive dosyalarini ayirmak
- Memory, carryforward, handoff, window ve validation katmanlarini ayrik tutmak
- `lite | standard | full` workflow profilleri ile rituel yogunlugunu ayarlamak
- `RETRO.md` uzerinden surec kalitesi iyilestirme yuzeyi tutmak
- Milestone closeout sirasinda git scope'unu ve reasoning kalitesini daha guvenli hale getirmek

## Non-Goals

- Uygulama feature backlog'unu burada tutmak
- Kodun runtime mimarisini burada ayrintili belgelemek
- Tamamlanan milestone changelog'unu burada biriktirmek

## Stable Rules

- `AGENTS.md` davranis ve scope kurallarini tutar
- `PROJECT.md` neden bu workflow'un var oldugunu ve neyi optimize ettigini tutar
- `RUNTIME.md` operasyonel komutlari ve repo-level calisma notlarini tutar
- `DECISIONS.md` kalici mimari/surec kararlarinin kaydidir
- `STATUS.md` aktif pencere gorunumudur
- `WINDOW.md` aktif context budget snapshot'idir
- Workflow kullanimi explicit user opt-in ile baslar
- Varsayilan milestone granularity: bir istek = bir milestone, lifecycle asamalari = substep

## Success Criteria

- Yeni bir seans, yalnizca workflow dosyalarini okuyarak aktif milestone'u devam ettirebilmeli
- Bir milestone kapanirken active recall, carryforward, archive, packet hash ve git closeout senkron ilerlemeli
- Workstream ayrismasi gerektiginde `docs/<workstream>/` yuzeyi kolayca acilabilmeli
- Health strict gate packet drift, validation gap ve hallucination riskini gosterebilmeli
- Process kalitesi validation state'inden ayrik olarak `RETRO.md` uzerinde degerlendirilebilmeli
