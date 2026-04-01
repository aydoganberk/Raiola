# MILESTONES

Bu dosya workstream icindeki teslim odakli ilerleme noktalarini tutar.

Kullanim kurali:
- Ayni anda yalnizca bir milestone `active` olmali.
- Ayni anda yalnizca bir milestone step `active` olmali.
- Her aktif milestone `discuss -> research -> plan -> execute -> audit -> complete` loop'u ile ilerlemeli.
- `CONTEXT.md` discuss sonunda olusmali, research sonunda guncellenmeli, plan ondan sonra baslamali.
- `VALIDATION.md` research/plan sirasinda scope'a daraltilmali, audit sirasinda kapanmali.
- `HANDOFF.md` session-level snapshot katmanidir; milestone history burada birikmez.
- `WINDOW.md` yeni step baslamadan budget/orchestrator karari vermelidir.
- `SEEDS.md` daha sonra yuzeye cikacak fikirleri, `CARRYFORWARD.md` ise kapanmayan aktif isleri tutar.

## Status Vocabulary

- `pending`
- `active`
- `blocked`
- `done`
- `dropped`

## Step Vocabulary

- `discuss`: Codebase scan + hedef netlestirme + discuss mode akisi + claim ledger baslangici
- `research`: Degisecek dosyalar, bagimliliklar, riskler ve verification surface taramasi
- `plan`: `EXECPLAN.md` icindeki `Plan of Record`'u yazma
- `execute`: Planlanan degisikliklerin uygulanmasi
- `audit`: `VALIDATION.md` ve `STATUS.md` uzerinden dogrulama
- `complete`: Archive, carryforward, memory cleanup ve git closeout

## Step Gate Rules

- `discuss` tamamlanmadan `research`e gecme:
  - Goal, success signal ve non-goals net olmali
  - `PREFERENCES.md` icindeki discuss mode dikkate alinmali
  - `CONTEXT.md` initial snapshot olusmus olmali
  - Seed intake, active recall intake, canonical refs ve claim ledger yazilmis olmali
- `research` tamamlanmadan `plan`a gecme:
  - Muhtemel touched files listesi
  - Riskler / bagimliliklar
  - Verification surface
  - `VALIDATION.md` ilk scope kontrati
  - `CONTEXT.md` research-sonrasi guncel surum
  - `CARRYFORWARD.md` review edildi notu
- `plan` tamamlanmadan `execute`a gecme:
  - 1-2 run chunk'a bolunmus plan
  - Uygulama checklist'i
  - Audit/test plani
  - `EXECPLAN.md` icindeki `Plan of Record` guncel
  - `WINDOW.md` can start next chunk = yes
- `execute` tamamlanmadan `audit`e gecme:
  - Yapilan degisiklik ozeti
  - Kapsam genislediyse notu
  - Gerekirse active recall notlari kaydedilmis olmali
- `audit` tamamlanmadan `complete`e gecme:
  - Kosulan komutlar / kontroller
  - Sonuc
  - Kalan riskler
  - Validation kontratinin durumu
  - AGENTS review plani
  - Git closeout scope'u
  - `workflow:health -- --strict` temiz olmali
- `complete` olmadan sonraki milestone planning'ine gecme
- Varsayilan granularity:
  - `Tek bir kullanici istegi genelde tek milestone olarak modellenir`
  - `discuss -> research -> plan -> execute -> audit -> complete` ayni milestone'un step'leridir

## Active Milestone Rule

- `EXECPLAN.md` icindeki `Active milestone` alani ile bu dosya senkron kalmali.
- `STATUS.md` icindeki `Current milestone` alani ile bu dosya senkron kalmali.
- `EXECPLAN.md` icindeki `Active milestone step` alani ile bu dosya senkron kalmali.
- `STATUS.md` icindeki `Current milestone step` alani ile bu dosya senkron kalmali.
- Aktif milestone card'i ile `CONTEXT.md`, `VALIDATION.md`, `WINDOW.md` ve aktif recall notlari ayni scope'u tasimali.
- Tamamlanan milestone detaylari active card'da birikmez; `completed_milestones/` altina tasinir.

## Milestone Table

| Milestone | Goal | Phase | Status | Step | Exit criteria | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |

## Archived Done Milestones

- `Henuz arsivlenmis milestone yok`

## Active Milestone Card

- Milestone: `NONE`
- Phase: `Idle`
- Status: `idle`
- Step: `complete`
- Goal:
  - `Kullanici isterse acilacak ilk milestone'u beklemek`
- Success signal:
  - `Ilk milestone kullanici tarafindan acikca tanimlanmis olacak`
- Non-goals:
  - `Kullanici istemeden milestone planning'i baslatmak`
- Discuss mode:
  - `assumptions`
- Clarifying questions / assumptions:
  - `Workflow ancak explicit user request ile acilir`
- Seed intake:
  - `Henuz acik seed yok`
- Active recall intake:
  - `Aktif milestone yok`
- Research target files:
  - `Kullanici milestone acinca doldurulacak`
- Plan checklist:
  - `Kullanici milestone acinca doldurulacak`
- Execute notes:
  - `Yok`
- Audit checklist:
  - `Yok`
- Completion note:
  - `Kullanici isterse ilk milestone acilacak`

## Milestone Notes

- `workflow:packet` step packet'ini deterministic hash ile uretir.
- `workflow:next` aktif step icin onerilen sonraki hareketi uretir.
- `workflow:pause-work` ve `workflow:resume-work` execution cursor + packet snapshot tasir.
- `workflow:health --strict` asil gate olarak kullanilir.
- `workflow:switch-workstream -- --name <slug> --create` veya `workflow:workstreams switch --name <slug> --create` ile named root scaffold edilebilir.
- `Aktif veya pending milestone listesi kullanici explicit istemeden doldurulmaz.`
