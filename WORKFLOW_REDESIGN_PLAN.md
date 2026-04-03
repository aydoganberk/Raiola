# Workflow Natural Language Control and Continuity Redesign Plan

## Tasarım Özeti

Bu tasarımın ana kararı şu: workflow adımlarını user doğal dille yönetebilsin, ama sistem güvenlik ve süreklilik artifact'larını sessizce korusun.

Mevcut kontrat bunun için iyi bir taban veriyor:

- Explicit opt-in workflow akışı: `RUNTIME.md` line 31
- `plan -> execute` gate'i: `plan_check.js` line 201
- Doğal dil ile parallel activation: `delegation_plan.js` line 24
- Step tavsiyesi: `next_step.js` line 113
- Window kararı: `common.js` line 1206

### Varsayılan Kararlar

- Workflow explicit opt-in kalacak.
- `execute` literal olarak skip edilemeyecek.
- `discuss`, `research`, `plan`, `audit`, `complete` user tarafından "condensed" modda geçirilebilecek.
- Canonical state markdown yüzeyinde kalacak; gizli runtime hafızası source of truth olmayacak.

## 1. Step Fulfillment Model

Her step için yeni kavram `skip` değil, `fulfillment mode` olacak.

### Step Bazlı Modlar

- `discuss`: `explicit` veya `condensed`
- `research`: `explicit` veya `condensed`
- `plan`: `explicit` veya `condensed`, ama her durumda minimum plan artifact'ı üretilecek ve `workflow:plan-check` geçilecek
- `execute`: sadece `explicit`
- `audit`: `explicit` veya `smoke`
- `complete`: `explicit` veya `fast_closeout`

### "Plan kısmını geçelim" Anlamı

Bu ifade sistem içinde şu anlama gelir:

- `intent = step_control`
- `target = plan`
- `mode = condensed`

### Runtime Davranışı

Minimum şu alanlar doldurulur:

- `Chosen Strategy`
- `Coverage Matrix`
- `Plan Chunk Table`
- `Validation Contract`

Sonrasında:

- `workflow:plan-check --sync --strict` çalışır
- Gate geçerse step `fulfilled_condensed`
- Gate geçmezse sistem "geçemedim" demez
- Bunun yerine "condensed plan için eksik alanlar bunlar" şeklinde geri döner

### Amaç

Bu sayede user ritüeli atlar, ama sistem plan omurgasını silmez.

## 2. Natural Language Control Plane

### Yeni Öneri

Yeni komut:

```bash
workflow:control --utterance "<user text>"
```

Bu komut ya da eşdeğer helper, user cümlesini kontrollü intent'lere map eder.

İlk sürümde deterministic pattern + küçük kural motoru yeterli.

### Desteklenecek Intent Aileleri

- `workflow_activation`: aç, kapat, bu task için kullanma
- `step_control`: step'i `condensed` / `smoke` / `fast-closeout` moduna al
- `automation_control`: `manual | phase | full`
- `parallel_control`: mevcut Team Lite aktivasyonu
- `tempo_control`: `lite | standard | full`
- `pause_resume_control`: dur, devam et, buradan sürdür
- `context_control`: checkpoint al, compact et, handoff oluştur

### Örnek Map'ler

- "plan kısmını geçelim" -> `step_control(plan, condensed)`
- "detaya girmeyelim hızlı geç" -> `tempo_control(lite)`
- "buradan sonra sen akıt" -> `automation_control(phase)` veya `full`
- "şimdilik workflow istemiyorum" -> `workflow_activation(off)`
- "parallel yap" -> mevcut `parallel_control(on)`
- "burada duralım" -> `pause_resume_control(pause)`

### Güvenlik Kuralları

- Low-risk intent'ler doğrudan uygulanır.
- Medium-risk intent uygulanır ve kullanıcıya netçe hangi davranışa çevrildiği yazılır.
- High-risk intent'lerde güvenli fallback seçilir.
- Örnek: `plan` hiçbir zaman literal skip olmaz; en fazla `condensed plan` olur.

## 3. Continuity-First Context Model

Asıl problem token değil, plan omurgasının yanlış sıkıştırılması. Bu yüzden yeni model üç katmanlı olacak.

### Katman A: Asla Sıkıştırılmayan Çekirdek

- hedef
- non-goals
- explicit constraints
- requirement ID listesi
- open requirement'lar
- acceptance criteria
- kritik kararlar
- current capability slice

### Katman B: Aktif Çalışma Yüzeyi

- current run chunk
- next one action
- completed items
- remaining items
- touched files
- verify command
- active risks
- drift note

### Katman C: Soğuk Arşiv

- uzun tartışmalar
- eski alternatifler
- eski reasoning
- tamamlanmış chunk ayrıntıları

### Doküman Yüzeyine Eklenecek Alanlar

- `CONTEXT.md`: `Intent Core`
- `EXECPLAN.md`: `Delivery Core`, `Open Requirements`, `Current Capability Slice`
- `VALIDATION.md`: `Validation Core`
- `HANDOFF.md`: `Continuity Checkpoint`
- `STATUS.md`: `At-Risk Requirements`
- `WINDOW.md`: `Checkpoint Freshness`

### Continuity Checkpoint Sabit Formatı

- promised scope
- finished since last checkpoint
- remaining scope
- drift from plan
- next one action
- affected files
- open requirement IDs
- active validation IDs

### Operasyonel Kurallar

- compact etmeden önce checkpoint zorunlu
- handoff almadan önce checkpoint zorunlu
- phase boundary geçmeden önce, automation aktifse checkpoint zorunlu
- resume olurken full docs değil, önce checkpoint + open requirements + current chunk okunur

### Amaç

Bu, "başta planladığımız şeylerin %60-70'i kayboluyor" hissini kıran ana mekanizma.

## 4. Packet ve Token Yönetimi

Yeni packet modeli `Packet v5` olsun.

### Yükleme Katmanları

- Tier A: çekirdek continuity refs
- Tier B: aktif chunk refs
- Tier C: cold refs, sadece hash drift veya explicit ihtiyaçta

### Temel Kurallar

- full doc yerine section-level packet tercih edilecek
- unchanged section tekrar read set'e girmeyecek
- `compact-now` ve `do-not-start-next-step` kararında önce `checkpoint_fresh=yes` aranacak
- `checkpoint_fresh=no` ise önce checkpoint üretilecek, sonra compact yapılacak
- `execute` sırasında read set minimuma indirilecek: current chunk, open requirements, acceptance rows, touched files

### Amaç

Buradaki amaç token kısmak değil, yanlış kısmayı önlemek.

## 5. Uygulama Planı

### 1. Intent Katmanını Ekle

- `scripts/workflow/control.js` oluştur
- `scripts/workflow/common.js` içine intent catalog, phrase normalization ve action mapping helper'ları ekle
- `scripts/workflow/automation.js` ve `scripts/workflow/next_step.js` bu katmanı kullanacak hale gelsin
- Test: doğal dil cümlesi doğru intent'e dönüyor mu

### 2. Step Fulfillment Modlarını Ekle

- `STATUS.md`, `CONTEXT.md`, `EXECPLAN.md` içine `Current step mode`, `Step fulfillment state`, `Last control intent` alanları ekle
- `discuss` / `research` / `plan` / `audit` / `complete` için condensed behavior helper'ları yaz
- `plan` için hard rule: condensed olsa bile gate gerekir
- Test: "plan kısmını geçelim" condensed plan üretip gate'e gidiyor mu

### 3. Continuity Core Alanlarını Ekle

- Template dosyalarını güncelle: `EXECPLAN.md`, `HANDOFF.md`, `WINDOW.md`, `STATUS.md`
- `workflow:checkpoint` komutunu ekle
- `pause_work`, `resume_work`, `window_monitor` checkpoint aware olsun
- Test: compact sonrası resume yalnızca checkpoint ile doğru next action'a dönebiliyor mu

### 4. Packet v5 ve Delta Loading'i Ekle

- `buildPacketSnapshot` section-aware hale gelsin
- `computeWindowStatus` checkpoint freshness ve tiered read set bilgisi üretsin
- `WINDOW.md` içinde `checkpoint freshness`, `core packet size`, `cold refs omitted` görünür olsun
- Test: aynı planla tekrar çalışan packet gereksiz full-doc okumuyor mu

### 5. Migration ve Docs

- `migrate.js` yeni section'ları seed etsin
- `RUNTIME.md`, `README.md`, skill dokümantasyonu güncellensin
- Golden snapshot ve phase testleri genişletilsin

## 6. Done Kriterleri

Bu tasarım ancak şu senaryolar çalışıyorsa tamam sayılmalı:

- User "plan kısmını geçelim" dediğinde sistem bunu `condensed plan` olarak yorumlar; ya gate geçer ya da eksik alanları nokta atışı söyler.
- User "hızlı geç" dediğinde workflow ritüeli azalır ama açık requirement sayısı kaybolmaz.
- Compact sonrası resume'da `open requirement count` ve `next one action` korunur.
- `execute` hiçbir zaman plansız başlamaz.
- `parallel yap` gibi mevcut doğal dil aktivasyonları bozulmaz.
- Window warning geldiğinde sistem checkpoint almadan kör compact yapmaz.

## Sonraki Adım Önerisi

İstenirse bu plan bir sonraki adımda doğrudan repo seviyesinde "hangi dosyada hangi değişiklik yapılacak" formatında implementation backlog'a çevrilebilir.
