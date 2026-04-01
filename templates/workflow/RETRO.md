# RETRO

- Last updated: `2026-04-02`
- Retro status: `ready`
- Scope owner: `Codex + repo collaborators`
- Review cadence: `every_5_completed_milestones_or_repeated_process_failures`
- Trigger policy: `5_completed_milestones_or_2_similar_forensics_or_explicit_request`
- Current default profile: `standard`

## Purpose

- `RETRO.md`, workflow surec kalitesini validation state'inden ayri degerlendirmek icindir.
- Burada "kod dogru mu" degil, "workflow dogru calisti mi" sorusu izlenir.
- Validation bulgulari `VALIDATION.md` icinde kalir; surec frictions / iyilestirme fikirleri burada tutulur.

## Binary Process Quality Checks

| Check | Question | Target | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Explicit activation | Workflow yalnizca explicit istendiginde mi aktive oldu? | `yes` | `pending` | `AGENTS.md` | `Yanlis aktivasyon rituel yukunu arttirir` |
| Root consistency | Active root ile kullanilan dosya root'u uyumlu mu? | `yes` | `pending` | `WORKSTREAMS.md` | `Mismatch handoff ve packet drift uretir` |
| Resume clarity | Resume `<= 3` komutta net sekilde yapilabiliyor mu? | `yes` | `pending` | `HANDOFF.md` | `Belirsiz resume context kaybina yol acar` |
| Closeout hygiene | Complete oncesi strict health temiz mi? | `yes` | `pending` | `VALIDATION.md` | `Aksi halde stale closeout riski vardir` |
| Update visibility | Workflow sirasinda `WORKFLOW:` prefiksli update'ler gorunur mu? | `yes` | `pending` | `Installed workflow skill` | `Ayirt edilebilirlik dusebilir` |

## Open Frictions

- `Henuz acik process friction notu yok`

## Improvement Queue

- `Henuz planli process iyilestirmesi yok`

## Retro Loop

1. `completed_milestones/`, `HANDOFF.md`, `forensics/` ve kullanici duzeltmelerinden kanit topla.
2. Yukaridaki binary surec kalite check'lerini `yes/no` olarak degerlendir.
3. Tek bir process degisikligi sec:
   - `skill wording`
   - `docs surface`
   - `script guardrail`
   - `failure playbook`
4. Degisikligi uygula ve `doctor + health` ile yuzeyi tekrar dogrula.
5. Sonraki `1-2` gercek milestone sonunda keep/discard karari ver.
6. Sonucu `Recent Retro Entries` bolumune ekle.

## Recommended Triggers

- `Her 5 completed milestone`
- `Ayni tip forensics kok nedeni 2 kez tekrar ettiginde`
- `Resume ambiguity`, `hash drift`, `active root mismatch` veya `dirty closeout` tekrarladiginda
- `Kullanici explicit olarak workflow'u iyilestir dediginde`

## Failure Signals

- `Hash drift` -> `workflow:packet -- --all --sync -> workflow:window -- --sync -> workflow:health -- --strict`
- `Active root mismatch` -> `workflow:workstreams status -> workflow:switch-workstream veya --root ile dogru root'a don`
- `Resume ambiguity` -> `HANDOFF.md + WINDOW.md oku -> workflow:resume-work -> workflow:next`
- `Dirty worktree closeout` -> `complete-milestone icin explicit --stage-paths veya docs-only ise --allow-workflow-only kullan`

## Recent Retro Entries

- `Henuz retro entry yok`
