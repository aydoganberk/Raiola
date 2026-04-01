# PREFERENCES

- Last updated: `2026-04-02`
- Workflow activation: `explicit_only`
- Workflow mode: `solo`
- Workflow profile: `standard`
- Discuss mode: `assumptions`
- Git isolation: `none`
- Auto push: `true`
- Auto checkpoint: `true`
- Commit docs: `true`
- Unique milestone ids: `false`
- Pre-merge check: `false`
- Health strict required: `false`
- Budget profile: `normal`
- Token reserve: `8000`
- Discuss budget: `6000`
- Plan budget: `12000`
- Audit budget: `9000`
- Compaction threshold: `0.8`
- Max canonical refs per step: `10`
- Window budget mode: `estimated`
- Window size tokens: `128000`
- Reserve floor tokens: `16000`
- Stop-starting-new-work threshold: `24000`
- Must-handoff threshold: `12000`
- Minimum next-step budget: `10000`
- Compaction target: `0.55`

## Presets

- `solo`
  - `Auto push: true`
  - `Unique milestone ids: false`
  - `Pre-merge check: false`
  - `Git isolation: none`
  - `Health strict required: false`
- `team`
  - `Auto push: false`
  - `Unique milestone ids: true`
  - `Pre-merge check: true`
  - `Git isolation: branch`
  - `Health strict required: true`

## Workflow Profiles

- `lite`
  - `Kucuk ve tek-seansli isler icin dusuk rituel / kucuk packet beklentisi`
  - `Onerilen varsayilanlar: Budget profile=lean, Discuss=4000, Plan=8000, Audit=6000, Max refs=6`
- `standard`
  - `Varsayilan genel amacli profil`
  - `Onerilen varsayilanlar: Budget profile=normal, Discuss=6000, Plan=12000, Audit=9000, Max refs=10`
- `full`
  - `Gercek handoff, closeout ve cok-seansli koordinasyon gerektiren isler`
  - `Onerilen varsayilanlar: Budget profile=deep, Discuss=8000, Plan=16000, Audit=12000, Max refs=14`
  - `Health strict ve retro notu beklentisi daha yuksek kabul edilir`

## Profile Notes

- `Workflow mode` ile `Workflow profile` ayridir:
  - `mode` daha cok git/ekip izolasyonunu belirler
  - `profile` surec derinligini ve packet/rhythm beklentisini belirler
- `lite` kucuk bugfix veya kisa repo operasyonlari icin uygundur
- `full` handoff, closeout, tekrar kullanilacak kanit zinciri ve surec kalitesi gerektiren isler icin uygundur

## Discuss Modes

- `interview`
  - `Discuss adiminda once hedef netlestirilir, sonra yuksek etkili sorular sorulur`
- `assumptions`
  - `Discuss adiminda once codebase taranir, sonra kanitli varsayim listesi uretilir ve gerekiyorsa kullanici duzeltir`

## Git Isolation Modes

- `none`
  - `Mevcut branch/worktree icinde calis`
- `branch`
  - `Milestone icin ayrik branch beklentisi olustur`
- `worktree`
  - `Milestone icin ayrik worktree beklentisi olustur`

## Budget Notes

- `Window budget mode native oldugunda ayni alanlar bridge dosyasindan okunacak`
- `Hiçbir run chunk Minimum next-step budget birakmadan planlanmamali`
- `Compaction target, packet compact edilince inilecek hedef oran olarak yorumlanir`

## Notes

- `Bu dosya workflow davranisinin repo-local konfig kaynagidir`
- `Script'ler explicit flag verilmediginde once bu dosyaya bakar`
- `Varsayilan kullanim explicit_only olarak dusunulur; workflow tam protokol olarak ancak kullanici istediginde acilir`
