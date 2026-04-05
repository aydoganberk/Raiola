# codex-workflow-kit — Cutting-Edge Roadmap

> Durum: repo-format final sürüm  
> Tarih: 2026-04-05  
> Kapsam: mevcut repo gerçekliği + önceki Codex-native roadmap + `oh-my-codex` ve `get-shit-done` karşılaştırmasından türetilen yeni ürün rotası  
> Amaç: `codex-workflow-kit`'i “iyi bir repo-native workflow companion” seviyesinden “Codex-native workflow OS + evidence engine + safe runtime” seviyesine taşımak

> Not: Bu dokümandaki “bugün eksik” ve faz bazlı boşluk anlatımı, `2026-04-05` tarihli baseline snapshot’ı temsil eder. Güncel uygulanma durumu ve doğrulama sonuçları için `docs/roadmap-audit.md` canonical audit yüzeyi olarak takip edilmelidir.

---

## 1. Belge Durumu

Bu belge, mevcut roadmap omurgasını koruyan ama onu **uygulanabilir, fazlara bölünmüş, ekstra cutting-edge önerilerle genişletilmiş** yeni canonical `Roadmap.md` sürümüdür.

Tarihsel olarak ürün zaten iki önemli sıçrama yaptı:

- `RP0-RP9` ile workflow kernel ve runtime companion zemini kuruldu
- önceki Codex-native taslak ile `CN0-CN11` seviyesinde yeni yön tarif edildi

Bu yeni sürüm bu iki kazanımı çöpe atmaz. Şunu yapar:

- mevcut repo gerçekliğini yeniden okur
- önceki Codex-native roadmap’te doğru olan omurgayı korur
- ama bunu **aşama aşama uygulanacak bir ürün rotasına** çevirir
- ayrıca önceki roadmap’te olmayan birkaç kritik cutting-edge katmanı açıkça ekler

Bu yüzden bu belgenin rolü:

- tarihsel programı inkâr etmek değil
- mevcut repo ile uyumsuz hayaller kurmak değil
- ürünün gerçekten bir sonraki 12 ayda ne yapacağını sıralamak

Kısa ifade:

> Bu roadmap, “ne yapabiliriz?” listesinden çıkıp “hangi sırayla, hangi risk kapılarıyla, hangi ürün hissi için yapacağız?” dokümanına dönüşür.

---

## 2. Repo Gerçeği: E2E Denetim Özeti

Bu roadmap, repodaki gerçek implementasyonu temel alır.

### 2.1 Bugün gerçekten güçlü olan taraflar

Repo bugün şunlara sahip:

- repo-native `cwf` operator shell
- `launch`, `manager`, `hud`, `next`, `explore`
- `doctor`, `health`, `repair`
- `quick`, `checkpoint`, `next-prompt`
- `review`, `ship`, `pr-brief`, `release-notes`, `session-report`
- `team` + adapter tabanlı runtime
- `route`, `stats`, `profile`, `workspaces`
- benchmark ve SLO kültürü
- markdown-canonical workflow contract
- worktree/snapshot tabanlı bounded paralellik başlangıcı
- browser smoke ve visual artefact başlangıcı
- route/stats için ilk telemetry yüzeyi
- repo-local install / update / uninstall ürünleşmesi

Bu çok önemli bir temel. Ürün “fikir aşamasında” değil.

### 2.2 Bugün gerçekten eksik olan taraflar

Repo incelemesinden çıkan en net boşluklar:

- `cwf codex` bugün gerçek bir Codex control plane değil; `launch` alias’ı
- `setup/update/uninstall` repo-local yüzeyleri yönetiyor; `.codex` / `~/.codex` entegrasyonu yok
- `.agents` altında skill yüzeyi var; ama role/prompt catalog yok
- `team_runtime` bugün `plan-only` ve `worktree` adapter’larına sahip; native `subagent` veya `hybrid` runtime yok
- `verify_browser` HTML/fetch + smoke + screenshot fallback düzeyinde; gerçek browser automation değil
- `route` ve `stats` bugün ağırlıklı olarak heuristik; gerçek provider/model/token/latency/spend telemetry yok
- mailbox / timeline / steering yok
- `do`, `note`, `thread`, `backlog` yok
- questions / claims / assumptions için first-class operator surface yok
- secure phase çekirdeğe yakın değil
- hooks / MCP / daemon yok
- `workspaces` yüzeyi repo-local; cross-repo operator center değil
- `explore` faydalı ama henüz symbol-aware impact analysis düzeyinde değil

### 2.3 Doğrudan karar

Bugünkü ürünün doğru tanımı şudur:

> **Çok iyi bir repo-native workflow companion.**  
> Henüz tam bir **Codex-native workflow OS** değil.

Bu roadmap’in ana amacı da tam olarak bu farkı kapatmaktır.

---

## 3. Önceki Codex-Native Roadmap’ten Korunan Omurga

Önceki roadmap’in ana omurgası doğrudu ve bu sürümde korunur:

- safe Codex control plane
- role / prompt / skill catalog
- `do`, `note`, `thread`, `backlog`
- questions / claims / assumptions ledger
- secure phase
- native subagent / hybrid runtime
- mailbox / timeline / steering
- Playwright tabanlı browser evidence
- hooks / MCP lifecycle
- daemon / GC / large-repo mode
- docs / templates / upgrade safety

Yani bu belge önceki yönü tersine çevirmez. Sadece onu daha da netleştirir ve üzerine yeni katmanlar ekler.

---

## 4. Bu Sürümün Eklediği Ekstra Cutting-Edge Öneriler

Önceki roadmap güçlüydü ama hâlâ birkaç kritik fark yaratıcı eksik taşıyordu. Bu sürüm bunları açıkça ekler.

| Yeni öneri | Neden kritik | Hangi fazda ürünleşir |
| --- | --- | --- |
| Context Compiler & Packet Lock | Runtime ve subagent kalitesini belirleyen asıl çekirdek bu; packet kalitesi artmadan paralellik kalite vermez | `CE5` |
| Patch-First Collect & Merge OS | Worker çıktısını sadece not ve markdown değil, güvenli patch bundle olarak yönetmek gerekir | `CE7` |
| Policy Engine & Approval Matrix | “riskli değişiklik” kavramı ürün içinde görünür ve enforce edilebilir olmalı | `CE9` |
| Evidence Graph / Provenance OS | Hangi claim, hangi requirement, hangi verify bundle ile destekleniyor sorusu ürün içinde cevaplanmalı | `CE8` |
| Adaptive Router & Real Telemetry | Preset seçimi heuristikten ölçülmüş veriye geçmeli | `CE10` |
| Symbol-Aware Explore & Impact Analysis | Büyük repolarda grep yetmez; sembol, caller, callee, impact haritası gerekir | `CE12` |
| Incident Memory & Repair Cookbook | Ürün sadece state tutmamalı; önceki failure pattern’lerinden öğrenmeli | `CE13` |
| Cross-Repo Operator Center | `workspaces` repo-local’dan çıkarılıp gerçek operator merkezine dönüşmeli | `CE13` |
| Repo-Derived Role Generator | Role catalog elle yazılmakla sınırlı kalmamalı; repo profilinden öneri üretebilmeli | `CE2` |

Kısa ifade:

> Bu roadmap’in farkı, önceki taslağı sadece sürdürmesi değil; onu **context compiler + patch runtime + policy engine + evidence graph** ile bir seviye yukarı taşımasıdır.

---

## 5. OMX ve GSD’den Alınacaklar, Aşılacaklar

### 5.1 oh-my-codex’ten alınacaklar

- gerçek `.codex` / `~/.codex` ilişkisinin ürün yüzeyi olması
- setup / doctor / uninstall / rollback hissinin ürün kimliğinin parçası olması
- role/prompt/skill görünürlüğü
- team runtime ve canlı operasyon hissi
- MCP ve runtime state katmanının product shell’e bağlanması

### 5.2 oh-my-codex’ten kopyalanmaması gerekenler

- rollback ve diff olmadan config mutasyonu
- görünürlüğü zayıf process çoğalması
- MCP lifecycle’ı büyüdükçe artan bellek riski
- operator’a fazla mekanik yük bindiren control plane davranışları

### 5.3 get-shit-done’dan alınacaklar

- `do` / `note` / thread / backlog düşük sürtünmeli günlük kullanım yüzeyi
- research gate
- secure phase
- claim provenance ve assumptions log
- scope reduction detection
- Playwright / browser doğrulama
- verified docs ve evidence-first closeout

### 5.4 get-shit-done’dan kopyalanmaması gerekenler

- her görevi ağır seremonik akışa çevirme
- komut yüzeyini aşırı genişletme
- sade fast-path’i gölgeleyen ritüel yükü
- ürün değerini “çok komut var” ile ölçme

### 5.5 Bu ürünün ikisini de aşacağı alanlar

Bu roadmap’in iddiası, yalnızca referans repoları yakalamak değildir. Aşılması hedeflenen alanlar:

- context compiler
- patch-first runtime
- evidence graph
- policy engine
- adaptive router
- symbol-aware impact analysis
- incident memory
- cross-repo operator center

---

## 6. Ürün Tezi vNext

Bir sonraki sıçrama “daha fazla workflow dosyası” eklemek değildir.

Bir sonraki sıçrama şudur:

> `codex-workflow-kit`, repo-native workflow kernel olmaktan çıkıp Codex ile birlikte çalışan, Codex’i güvenli biçimde bootstrap eden, niyeti doğru lane’e yönlendiren, bağlamı derleyen, paralelliği görünür ve patch-safe hale getiren, evidence/provenance üreten ve hız hissini koruyan bir workflow OS olmalıdır.

Hedef günlük akış:

1. repo aç  
2. `cwf codex` veya `cwf do "..."`  
3. `cwf note` ile hızlı capture  
4. gerekirse `cwf packet compile`  
5. solo veya `cwf team run --adapter hybrid`  
6. `cwf verify-*` + `cwf secure`  
7. `cwf review` / `cwf ship`  
8. `cwf checkpoint` / `cwf next-prompt`

Kısa ifade:

- workflow kernel kalacak
- runtime companion güçlenecek
- Codex control plane eklenecek
- evidence + policy + scale birlikte ürünleşecek
- paralellik “güç” değil, “kontrol edilebilir ürün yüzeyi” olacak

---

## 7. Değişmeyecek İlkeler

- Markdown canonical source-of-truth olarak kalacak.
- Runtime JSON, telemetry, cache ve daemon state hiçbir zaman tek gerçek olmayacak.
- `.codex` / `~/.codex` mutasyonu diff + backup + rollback olmadan yapılamayacak.
- Repo mode global kullanıcı kurulumunu sessizce etkilemeyecek.
- Quick path audit spine’i by-pass etmeyecek.
- Team runtime explicit write-scope olmadan write-capable hale gelmeyecek.
- Hook, MCP ve daemon default kapalı olacak.
- Browser / verify / evidence artefact’ları derived state olacak.
- Policy engine yoksa bile ürün temel akışını sürdürebilecek.
- Daemon kapalıyken feature parity korunacak.
- Performans bütçesi yazılmadan feature açılmayacak.
- “Confidence” dili kanıt, provenance ve guardrail olmadan ürün dili olmayacak.
- Bir komut = bir zihinsel model.
- Primary loop küçük kalacak; secondary verbs primary loop’u gölgelemeyecek.
- Hidden DB tabanlı control plane tasarımı yapılmayacak.

---

## 8. Hedef Operator Loop

### 8.1 Primary loop

- `cwf codex`
- `cwf do`
- `cwf note`
- `cwf manager`
- `cwf team`
- `cwf verify-shell`
- `cwf verify-browser`
- `cwf review`
- `cwf checkpoint`

### 8.2 Secondary loop

- `cwf doctor`
- `cwf health`
- `cwf secure`
- `cwf claims`
- `cwf questions`
- `cwf route`
- `cwf stats`
- `cwf hooks`
- `cwf mcp`
- `cwf daemon`
- `cwf gc`
- `cwf benchmark`
- `cwf update`

### 8.3 Yeni kritik loop

Yeni loop’un farkı şudur:

- orient (`codex`, `manager`)
- route (`do`)
- capture (`note`, `thread`, `backlog`)
- compile (`packet compile`)
- execute (solo / team)
- verify (`verify-*`, `secure`)
- prove (`evidence`, `claims trace`)
- close (`review`, `ship`, `checkpoint`)

Bu “compile” ve “prove” adımları mevcut ürüne göre yeni cutting-edge fark yaratır.

---

## 9. Capability Matrix: Bugün -> Hedef

| Capability | Bugün | Hedef |
| --- | --- | --- |
| Workflow kernel | güçlü | korunacak |
| Runtime companion | iyi | daha görünür ve akıllı |
| Codex control plane | zayıf | güçlü |
| Role/prompt/skill ecosystem | sınırlı | ürünleşmiş + repo-derived |
| Intent routing | sınırlı | `do` ile doğal |
| Capture UX | zayıf | `note/thread/backlog` ile günlük kullanım yüzeyi |
| Questions/claims/provenance | parça parça | first-class |
| Secure phase | zayıf | çekirdeğe yakın + policy destekli |
| Packet quality | belge odaklı | context compiler ile role-aware |
| Team runtime | adapter başlangıcı | prod-grade subagent/hybrid |
| Collect/merge | not ve sonuç odaklı | patch-first |
| Evidence | smoke başlangıcı | graph/provenance tabanlı |
| Telemetry | heuristik | gerçek ölçümlü |
| Explore | repo-aware | symbol/impact-aware |
| Hooks/MCP | yok | kontrollü |
| Large-repo scale | erken | olgun |
| Cross-repo operator surface | yok | güçlü |
| Self-heal | başlangıç | repair cookbook ve incident memory ile daha akıllı |

---

## 10. Release Dalgaları

| Release | Fazlar | Temel hedef |
| --- | --- | --- |
| Release A | `CE0-CE2` | ürünün Codex-native giriş katmanını güvenli hale getirmek |
| Release B | `CE3-CE4` | günlük kullanım ve trust yüzeyini açmak |
| Release C | `CE5-CE7` | context compiler + native runtime + patch collect |
| Release D | `CE8-CE10` | evidence graph + policy engine + adaptive telemetry |
| Release E | `CE11-CE12` | integrations + scale + symbol explore |
| Release F | `CE13` | incident memory + cross-repo center + tam productization |

### Release geçiş kapıları

Release A -> B:
- `.codex` kontrol plane’i idempotent olmalı
- rollback güvenilir olmalı
- role/prompt/skill sync drift raporlayabilmeli

Release B -> C:
- `do` ve `note` günlük kullanımda gerçek değer üretmeli
- research/claims/security false-positive bombardımanına dönüşmemeli
- packet compiler taslak değil, işe yarar hale gelmeli

Release C -> D:
- en az bir gerçek subagent veya hybrid adapter prod-grade olmalı
- patch-first collect deterministik olmalı
- manager/mailbox/timeline operasyonel değer üretmeli

Release D -> E:
- review/ship evidence graph’ten beslenmeli
- policy engine developer experience’i bozmadan risk sınıflaması yapabilmeli
- telemetry ölçümlü veriye dayanmalı

Release E -> F:
- daemon/GC büyük repo hissini bozmayacak şekilde olgunlaşmalı
- hooks/MCP process budget altında kalmalı
- symbol-aware explore yanlış pozitif üretimini kontrol altında tutmalı

---

## 11. Faz Bazlı Master Plan

## CE0. Program Freeze, Gap Lock ve Baseline Donması

### Amaç

Mevcut repo gerçekliğini dondurmak, önceki roadmap’teki doğru yönü korumak ve yeni execution route’u tek canonical belge haline getirmek.

### Kapsam

- repo gerçekliği ile roadmap farklarını tek tabloya indir
- primary / secondary verb setini dondur
- medium / large repo benchmark profillerini yaz
- issue/epic yapısını release dalgalarına bağla

### Çıktılar

- yeni `Roadmap.md`
- güncel `docs/roadmap-audit.md`
- command taxonomy
- benchmark expansion plan
- epic listesi

### Exit Criteria

- ekip ürünün bugün ne olduğunu tek cümlede anlatabilmeli
- ekip ürünün bir sonraki 12 ayda ne yapacağını sırayla anlatabilmeli

---

## CE1. Safe Codex Control Plane

### Amaç

`cwf codex` komutunu alias olmaktan çıkarıp gerçek bir Codex control plane’e dönüştürmek.

### Mevcut açık

Bugün `cwf codex` launch alias’ı. Repo-local install var; ama `.codex` / `~/.codex` tarafında gerçek bir setup / diff / rollback / doctor yüzeyi yok.

### Hedef komut yüzeyi

- `cwf codex setup --global|--local|--repo`
- `cwf codex doctor`
- `cwf codex diff-config`
- `cwf codex rollback`
- `cwf codex uninstall`
- `cwf codex repair`

### Davranış sözleşmesi

- parse etmeden append yapılmayacak
- her değişiklik diff preview gösterecek
- her değişiklik backup journal yazacak
- rollback tek komutla yapılacak
- repo scope global scope’u sessizce etkilemeyecek
- doctor bozuk TOML, drift ve eksik install durumlarını net raporlayacak

### Likely files

- `scripts/workflow/codex_control.js`
- `scripts/workflow/io/toml_patch.js`
- `scripts/workflow/setup.js`
- `scripts/workflow/update.js`
- `scripts/workflow/uninstall.js`
- `scripts/workflow/doctor.js`
- `docs/codex-integration.md`

### Exit Criteria

- setup -> diff -> apply -> rollback zinciri güvenilir olmalı
- bozuk config fixture’larında corruption yaşanmamalı
- uninstall / reinstall idempotent olmalı

---

## CE2. Role, Prompt, Skill Catalog ve Repo-Derived Role Generator

### Amaç

Codex-specific role/prompt/skill yüzeyini ürünün doğal parçası haline getirmek.

### Mevcut açık

Repo’da skill yüzeyi var; ama role/prompt catalog yok. Bu da hem router kalitesini hem team runtime yönlendirmesini sınırlar.

### Hedef komut yüzeyi

- `cwf codex sync`
- `cwf codex roles`
- `cwf codex prompts`
- `cwf codex install-skill --role reviewer`
- `cwf codex scaffold-role --from repo-profile`
- `cwf codex remove-skill --role reviewer`

### Ek cutting-edge öneri

Bu fazda yalnız static catalog yapılmayacak. Ayrıca:

- codebase map
- frontend profile
- test/CI shape
- package ecosystem
- repo structure

üzerinden **önerilen role seti** üretilecek.

Örnek repo-derived roller:

- `repo-explorer`
- `frontend-verifier`
- `release-noter`
- `dependency-risk-auditor`
- `migration-checker`
- `docs-verifier`

### Likely files

- `.agents/roles/*`
- `.agents/prompts/*`
- `.agents/skills/*`
- `templates/codex/*`
- `scripts/workflow/codex_roles.js`
- `scripts/workflow/repo_role_generator.js`

### Exit Criteria

- role catalog ürün içinde görünür olacak
- sync/install/remove güvenilir olacak
- repo-derived role suggestions saçma gürültü üretmeden değer verecek

---

## CE3. Daily Intent OS: `do`, `note`, `thread`, `backlog`

### Amaç

Kullanıcının doğal niyetini doğru lane’e yönlendirmek ve günlük capture akışını sürtünmesiz hale getirmek.

### Mevcut açık

Bugünkü komut yüzeyi güçlü ama hâlâ komut bilgisi gerektiriyor. Günlük kullanımda operator friction gereğinden yüksek.

### Hedef komut yüzeyi

- `cwf do "..."`
- `cwf note "..."`
- `cwf note --promote backlog|thread|seed`
- `cwf thread open <name>`
- `cwf thread list`
- `cwf thread resume <name>`
- `cwf backlog add "..."`
- `cwf backlog review`

### Davranış sözleşmesi

`cwf do`:
- niyeti parse eder
- repo state’ini okur
- quick/full/team önerir
- research/verify/security risklerini gösterir
- gerekiyorsa packet compile önerebilir
- preview-first kalır

`cwf note`:
- zero-friction capture sunar
- önce runtime inbox’a yazabilir
- promote ile canonical yüzeye taşır

### Likely files

- `scripts/workflow/do.js`
- `scripts/workflow/note.js`
- `scripts/workflow/thread.js`
- `scripts/workflow/backlog.js`
- `.workflow/runtime/inbox.md`
- `docs/workflow/BACKLOG.md`
- `docs/workflow/THREADS/*`

### Exit Criteria

- kullanıcı doğal cümle ile yön bulabilmeli
- capture akışı günlük kullanımda gerçekten kullanılmalı
- misroute oranı kabul edilebilir seviyede olmalı

---

## CE4. Trust Layer: Questions, Claims, Assumptions ve Secure Phase

### Amaç

“Bilmediğimizi”, “inandığımızı” ve “riskli olanı” ürün içinde first-class hale getirmek.

### Mevcut açık

Repo’da questions ve assumptions izleri var; ama operator-facing claims/questions/security yüzeyi first-class değil.

### Hedef komut yüzeyi

- `cwf questions`
- `cwf claims`
- `cwf claims check`
- `cwf claims trace`
- `cwf secure`
- `cwf review --security`
- `cwf ship --gate secure`

### Davranış sözleşmesi

- unresolved questions görünür kalır
- claim’ler evidence veya rationale taşır
- assumptions ayrı işaretlenir
- secure phase prompt injection, path traversal, secrets, risky shell, destructive ops alanlarını tarar
- verdict standardı olur: `pass / warn / fail / inconclusive / human_needed`

### Likely files

- `scripts/workflow/questions.js`
- `scripts/workflow/claims.js`
- `scripts/workflow/secure_phase.js`
- `docs/workflow/QUESTIONS.md`
- `docs/workflow/CLAIMS.md`
- `docs/workflow/ASSUMPTIONS.md`
- `docs/workflow/SECURITY.md`

### Exit Criteria

- ürün “önce araştır” demesi gereken yerde bunu açık biçimde söylemeli
- secure yüzeyi geliştiriciyi boğmadan makul guardrail üretmeli

---

## CE5. Context Compiler ve Packet Lock

### Amaç

Workflow ve runtime kalitesini belirleyen asıl katmanı kurmak: context compiler.

### Bu faz neden yeni ve kritik?

Önceki roadmap packet v2 diyordu. Bu sürümde packet sadece “iyileştirilmiş doküman özeti” olmayacak; doğrudan bir **context compiler** olacak.

### Problem

Native runtime, hybrid dispatch ve subagent kalitesi packet kalitesine bağlıdır. Yanlış packet, yanlış paralellik demektir.

### Hedef komut yüzeyi

- `cwf packet compile`
- `cwf packet explain`
- `cwf packet lock`
- `cwf packet diff`
- `cwf packet role --role reviewer`
- `cwf packet verify`

### Compiler girdileri

- aktif workstream docs
- open requirements
- current chunk / current step
- write scope
- touched files
- codebase map
- frontend profile
- verify contract
- claims/questions state
- route/profile defaults

### Compiler çıktıları

- role-aware packet
- minimal read set
- hard refs vs optional refs
- omitted refs explanation
- packet hash
- packet lock manifest
- packet provenance

### Neden cutting-edge?

Bu katman sayesinde:

- subagent’a daha az ama daha doğru bağlam gider
- `do` yalnız route değil, packet önerisi de üretebilir
- mailboxes ve evidence graph daha anlamlı hale gelir
- team runtime başarısı ölçülebilir biçimde artar

### Likely files

- `scripts/workflow/packet_compile.js`
- `scripts/workflow/build_packet.js`
- `scripts/workflow/packet_lock.js`
- `.workflow/packets/*`
- `.workflow/cache/packet-locks.json`
- `.workflow/cache/packet-provenance.json`

### Exit Criteria

- packet compile süreleri hot path’i bozmamalı
- packet’ler eksik kritik ref nedeniyle worker failure yaratmamalı
- compile explain yüzeyi operator’a güven vermeli

---

## CE6. Native Subagent Runtime ve Hybrid Dispatch

### Amaç

Adapter başlangıcını gerçek Codex-native runtime’a taşımak.

### Mevcut açık

Bugün runtime `plan-only` ve `worktree` düzeyinde. Bu iyi bir zemin ama Codex-native child/subagent lifecycle yok.

### Hedef komut yüzeyi

- `cwf team run --adapter subagent`
- `cwf team run --adapter hybrid`
- `cwf team dispatch`
- `cwf team monitor`
- `cwf team collect`
- `cwf team status --live`
- `cwf team stop`
- `cwf team resume`

### Adapter modeli

- `worktree`: write-heavy ve riskli işler
- `subagent`: read-heavy, analysis-heavy işler
- `hybrid`: task tipine göre adapter seçen policy layer

### Bu fazın şartı

CE6, CE5 olmadan açılmaz. Packet compile zayıfsa native runtime erken açılmaz.

### Likely files

- `scripts/workflow/team_runtime.js`
- `scripts/workflow/team_adapters/subagent.js`
- `scripts/workflow/team_adapters/hybrid.js`
- `scripts/workflow/build_packet.js`
- `scripts/workflow/ensure_isolation.js`

### Exit Criteria

- en az bir gerçek native/hybrid adapter prod-grade çalışmalı
- timeout/cancel/retry semantics görünür olmalı
- fallback olarak solo veya worktree mode mümkün kalmalı

---

## CE7. Patch-First Collect, Mailbox, Timeline ve Manager 2.0

### Amaç

Runtime’ı yalnız başlatılabilir değil, güvenli biçimde toplanabilir ve merge edilebilir hale getirmek.

### Bu faz neden yeni ve kritik?

Önceki roadmap mailbox/timeline diyordu. Bu sürüm buna bir katman daha ekler: **patch-first collect**.

### Problem

Worker çıktısını sadece markdown sonuç ve serbest yazılmış özet olarak toplamak uzun vadede ölçeklenmez. Gerçek ürün için collect aşaması patch-aware olmalıdır.

### Hedef komut yüzeyi

- `cwf team mailbox`
- `cwf team timeline`
- `cwf team steer`
- `cwf team collect --as patch`
- `cwf patch review`
- `cwf patch apply`
- `cwf patch rollback`
- `cwf manager --live`

### Yeni runtime sözleşmesi

Her worker çıktısı şu seçeneklerden en az birini üretir:

- result summary
- evidence refs
- patch bundle
- conflict note
- next action
- confidence / risk note

### Neden cutting-edge?

Bu katman sayesinde:

- worker collect daha deterministik olur
- orchestrator patch preview yapabilir
- merge ve rollback hikâyesi daha güçlü olur
- write-scope policy runtime seviyesinde enforce edilir

### Likely files

- `scripts/workflow/runtime_mailbox.js`
- `scripts/workflow/runtime_timeline.js`
- `scripts/workflow/patch_collect.js`
- `scripts/workflow/patch_apply.js`
- `scripts/workflow/patch_review.js`
- `.workflow/orchestration/runtime/mailbox.jsonl`
- `.workflow/orchestration/runtime/timeline.jsonl`
- `.workflow/orchestration/patches/*`

### Exit Criteria

- operator worker’ları ürün içinden izleyip yönlendirebilmeli
- patch collect rastgele değil, standart protokol ile çalışmalı
- patch apply/rollback veri kaybı riski yaratmamalı

---

## CE8. Evidence OS, Playwright ve Evidence Graph

### Amaç

Verification katmanını smoke helper’dan gerçek evidence engine seviyesine taşımak.

### Mevcut açık

Bugünkü `verify-browser` fetch + HTML signal + visual fallback düzeyinde. Bu iyi başlangıç; ama gerçek UI closeout için yetmez.

### Hedef komut yüzeyi

- `cwf verify-browser --adapter playwright`
- `cwf verify-browser --smoke`
- `cwf verify-browser --assert selector=...`
- `cwf evidence`
- `cwf evidence graph`
- `cwf claims trace`
- `cwf review --require-evidence`
- `cwf ship --gate evidence`

### Bu sürümün ekstra önerisi

Önceki roadmap evidence bundle diyordu. Bu sürüm evidence’i **graph** haline getirir.

Graph düğümleri:

- requirement
- claim
- touched file
- verify run
- screenshot
- console/network log
- manual verdict
- reviewer note

### Neden cutting-edge?

Bu sayede ürün şu sorulara cevap verir:

- Hangi requirement henüz verify edilmedi?
- Hangi claim’in evidence’i yok?
- Hangi değişiklik UI smoke geçti ama network error verdi?
- Review niye `human_needed` dedi?

### Likely files

- `scripts/workflow/verify_browser.js`
- `scripts/workflow/browser_adapters/playwright.js`
- `scripts/workflow/evidence_graph.js`
- `scripts/workflow/evidence_check.js`
- `.workflow/verifications/browser/*`
- `.workflow/evidence-graph/*.json`
- `docs/workflow/EVIDENCE.md`

### Exit Criteria

- frontend closeout güveni ciddi biçimde artmalı
- review/ship evidence graph’ten yararlanmalı
- uncovered requirement’lar görünür olmalı

---

## CE9. Policy Engine ve Approval Matrix

### Amaç

Riskli işlemleri ürün içinde first-class hale getirmek.

### Bu faz neden yeni ve kritik?

Secure phase önemli ama tek başına yeterli değil. Çünkü sorun yalnız tehlikeyi tespit etmek değil; **hangi riske hangi onay modeli uygulanacak** sorusudur.

### Hedef komut yüzeyi

- `cwf policy`
- `cwf policy check`
- `cwf approvals`
- `cwf approvals grant`
- `cwf review --policy`
- `cwf team run --policy strict|standard|open`

### Politika alanları

- file domain: `src`, `docs`, `tests`, `config`, `infra`, `migrations`, `secrets`
- operation type: `read`, `edit`, `delete`, `move`, `install`, `network`, `browser`, `git`, `shell`
- actor type: `solo`, `worker`, `subagent`, `hook`, `mcp`
- approval mode: `auto`, `warn`, `human_needed`, `block`

### Neden cutting-edge?

Çünkü ürün artık yalnız “risk var” demez; şunu da söyler:

- bu risk niye var
- hangi policy bunu tetikledi
- nasıl override edilir
- override sonucu ne olur
- review ve ship’te bunun izi kalır mı

### Likely files

- `scripts/workflow/policy.js`
- `scripts/workflow/approvals.js`
- `docs/workflow/POLICY.md`
- `.workflow/runtime/policy.json`
- `.workflow/runtime/approvals.json`

### Exit Criteria

- destructive / config / secret / migration riskleri görünür olmalı
- developer experience bozulmadan policy enforce edilebilmeli
- worker policy’si solo policy’den farklılaştırılabilmeli

---

## CE10. Telemetry v2 ve Adaptive Router

### Amaç

Route ve stats yüzeyini heuristikten ölçülmüş veriye taşımak.

### Mevcut açık

Bugünkü `model_route.js` ve `stats.js` kullanışlı ama ağırlıklı olarak heuristik. Bu, ürünün uzun vadede optimize olmasını sınırlar.

### Hedef komut yüzeyi

- `cwf route --explain`
- `cwf route tune`
- `cwf stats --perf`
- `cwf stats --spend`
- `cwf stats --runtime`
- `cwf stats --quality`

### Ölçülecek alanlar

- provider/model
- reasoning profile
- latency
- retries
- tool errors
- token count
- spend
- verification pass rate
- human_needed rate
- worker success rate
- patch conflict rate

### Adaptive davranış

Router şu tip öneriler verebilmeli:

- bu task için `balanced` yerine `deep`
- bu role için `fast` yeterli
- browser verify için önce smoke sonra Playwright
- large-repo modunda packet budget düşür
- bu repo’da `frontend-verifier` rolü değer üretiyor / üretmiyor

### Likely files

- `scripts/workflow/model_route.js`
- `scripts/workflow/stats.js`
- `scripts/workflow/telemetry_store.js`
- `.workflow/cache/model-routing.json`
- `.workflow/cache/telemetry/*.jsonl`

### Exit Criteria

- router gerçek ölçümlerle iyileşmeli
- route önerileri “neden” açıklamasıyla gelmeli
- spend/perf görünürlüğü operator’a karar avantajı vermeli

---

## CE11. Hooks, MCP ve Notification Layer

### Amaç

Ürünü kontrollü entegrasyonlara açmak; ama bunu kontrollü ve ölçülü yapmak.

### Mevcut açık

Hooks / MCP bugün yok. Bu alan büyük güç yaratır ama erken ve kontrolsüz açılırsa güvenilirliği düşürür.

### Hedef komut yüzeyi

- `cwf hooks init`
- `cwf hooks validate`
- `cwf hooks list`
- `cwf mcp install`
- `cwf mcp doctor`
- `cwf mcp status`
- `cwf notify test`

### Başlangıç paketi

Hook olayları:
- `session_start`
- `question_needed`
- `verify_failed`
- `phase_complete`
- `session_idle`
- `session_end`

MCP başlangıç seti:
- workflow-state
- packet
- evidence
- mailbox
- thread/memory
- policy

Notification seti:
- verify fail
- blocked worker
- stalled session
- handoff ready
- review ready

### Likely files

- `scripts/workflow/hooks.js`
- `scripts/workflow/mcp.js`
- `scripts/workflow/mcp_servers/*`
- `scripts/workflow/notify.js`
- `.workflow/runtime/hooks/*`
- `.workflow/runtime/mcp/*`

### Exit Criteria

- hooks/MCP default kapalı olmalı
- açıldığında lifecycle budget ve process budget görünür olmalı
- failure ana akışı bozmamalı

---

## CE12. Scale OS: Daemon, GC, Large-Repo Mode ve Symbol-Aware Explore

### Amaç

Yeni katmanlar açılırken hız hissini korumak ve büyük repolarda ürünün akıcılığını kaybetmesini engellemek.

### Bu sürümün ekstra önerisi

Önceki roadmap daemon/GC diyordu. Bu sürüm buna symbol-aware explore ve impact analysis katıyor.

### Hedef komut yüzeyi

- `cwf daemon status`
- `cwf daemon restart`
- `cwf gc`
- `cwf benchmark --profile medium|large`
- `cwf stats --perf`
- `cwf explore --symbol <name>`
- `cwf explore --callers <symbol>`
- `cwf explore --impact <file|symbol>`

### Teknik yön

- optional daemon / sidecar
- persistent metadata store
- watcher-based refresh
- event log compaction
- artefact retention policy
- packet cache reuse
- symbol index
- impact graph
- tree-sitter veya LSP-when-available yaklaşımı

### Neden cutting-edge?

Çünkü ürün artık yalnız “dosya ara” değil, “bu değişiklik neyi etkiler?” sorusunu da cevaplar.

### Likely files

- `scripts/workflow/daemon.js`
- `scripts/workflow/gc.js`
- `scripts/workflow/fs_index.js`
- `scripts/workflow/symbol_index.js`
- `scripts/workflow/impact_analysis.js`
- `.workflow/cache/symbols/*`
- `.workflow/cache/impact/*`

### Exit Criteria

- large repo modunda hot-path SLO’lar korunmalı
- daemon kapalıyken parity korunmalı
- symbol explore yanlış pozitif patlaması yaratmamalı

---

## CE13. Incident Memory, Cross-Repo Operator Center ve Productization

### Amaç

Ürünü sadece çalışan değil, öğrenen ve çok-repo kullanıma hazır bir ürüne dönüştürmek.

### Bu faz neden yeni ve kritik?

Self-heal başlangıcı var; ama ürün failure pattern’lerini öğrenmiyor. `workspaces` var; ama cross-repo operator center değil. Docs/templates var; ama cutting-edge ürünleşme için henüz erken.

### Hedef komut yüzeyi

- `cwf incident open`
- `cwf incident list`
- `cwf repair learn`
- `cwf fleet status`
- `cwf sessions`
- `cwf init --template nextjs|library|monorepo|frontend-app`
- `cwf update --channel stable|canary`
- `cwf doctor --compat`

### Incident memory alanı

- failure signature
- trigger surface
- touched files
- broken command / verify
- repair recipe
- human note
- recurrence count

### Cross-repo center alanı

- birden fazla repo’nun aktif session görünümü
- handoff-ready repo’lar
- blocked runtime’lar
- verify debt
- release-ready queue

### Likely files

- `scripts/workflow/incident.js`
- `scripts/workflow/repair_learning.js`
- `scripts/workflow/fleet.js`
- `scripts/workflow/session_registry.js`
- `templates/*`
- `docs/getting-started.md`
- `docs/commands.md`
- `CHANGELOG.md`

### Exit Criteria

- ürün “repo içi shell” olmaktan çıkıp operator-grade product shell hissi vermeli
- upgrade ve compatibility story güvenli olmalı
- incident memory repair kalitesini gerçekten iyileştirmeli

---

## 12. Aşama Aşama Uygulanacak Rota

## 12.1 İlk kritik yol

Sıkı ekip / az kapasite durumunda izlenecek gerçek kritik yol:

`CE1 -> CE3 -> CE4 -> CE5 -> CE6 -> CE7 -> CE8 -> CE12 -> CE13`

### Neden bu yol?

- `CE1` olmadan gerçek Codex-native his oluşmaz
- `CE3` olmadan günlük adoption düşer
- `CE4` olmadan güven yüzeyi zayıf kalır
- `CE5` olmadan runtime kalitesi yükselmez
- `CE6-CE7` olmadan team/runtime sıçraması olmaz
- `CE8` olmadan verify closeout zayıf kalır
- `CE12` olmadan yeni katmanlar ürünü ağırlaştırır
- `CE13` olmadan ürün tam product shell’e dönüşmez

## 12.2 Paralel yürütülebilecek yan yollar

- `CE2`, `CE1` sonrasında paralel açılabilir
- `CE9`, `CE4` sonrasında paralel açılabilir
- `CE10`, `CE5` sonrasında paralel açılabilir
- `CE11`, `CE7` sonrasında açılmalı

## 12.3 Küçük ekip için scope trim sırası

Kapasite daralırsa önce ertelenecekler:

1. Cross-repo operator center
2. Notification layer genişlemesi
3. Symbol-aware explore’un LSP derinliği
4. Adaptive router’ın ileri otomasyonu
5. Repo-derived role generator’ın zengin varyantları

Ama ertelenmemesi gerekenler:

- safe Codex control plane
- `do` / `note`
- trust layer
- context compiler
- native runtime çekirdeği
- patch-first collect
- Playwright evidence
- daemon/GC temel hattı

---

## 13. İlk 90 Gün İçin Somut Uygulama Planı

### Gün 0-14

- `CE0` tamamlanır
- `CE1` contract dondurulur
- command taxonomy dondurulur
- benchmark profile expansion çıkarılır
- issue epics açılır

### Gün 15-30

- `CE1` MVP: `setup`, `diff-config`, `doctor`, `rollback`
- bozuk TOML fixture’ları
- backup journal layer
- docs’ta Codex control plane görünür hale gelir

### Gün 31-45

- `CE2` role/prompt/skill catalog v1
- `CE3` için `cwf do` MVP
- `cwf note` runtime inbox MVP
- manager entegrasyonu

### Gün 46-60

- `CE3` thread/backlog yüzeyleri
- `CE4` claims/questions/assumptions ledger
- `CE4` secure baseline
- review/security gates başlangıcı

### Gün 61-75

- `CE5` context compiler spike
- `packet compile`, `packet explain`, `packet lock` MVP
- `CE6` subagent adapter spike
- write-scope safety testleri

### Gün 76-90

- `CE7` mailbox/timeline schema
- patch bundle protokolü taslağı
- `CE8` Playwright smoke slice
- `CE12` GC baseline ve large-repo fixture başlangıcı

---

## 14. 12 Sprintlik Pratik Yürütme Planı

### Sprint 1
- `CE1` control plane contract
- TOML patch engine skeleton
- preview / journal / rollback API

### Sprint 2
- `cwf codex setup/doctor/diff-config/rollback` MVP
- property testler
- docs quick-start güncellemesi

### Sprint 3
- role catalog v1
- prompt catalog v1
- repo-derived role suggestion skeleton

### Sprint 4
- `cwf do` MVP
- route preview
- manager integration

### Sprint 5
- `cwf note`, `thread`, `backlog` MVP
- runtime inbox + promote akışı

### Sprint 6
- questions / claims / assumptions ledger
- secure baseline
- review/ship gate taslağı

### Sprint 7
- packet compile / explain / lock MVP
- packet provenance taslağı

### Sprint 8
- subagent adapter spike
- hybrid dispatch heuristic taslağı

### Sprint 9
- mailbox / timeline / steering
- patch bundle schema
- collect --as patch MVP

### Sprint 10
- Playwright smoke
- evidence bundle schema
- review --require-evidence

### Sprint 11
- policy engine v1
- telemetry probes
- route explain / stats perf-spend

### Sprint 12
- daemon feasibility
- GC policy
- large-repo benchmark
- symbol index spike

---

## 15. 12 Aylık Delivery Takvimi

### 5 Nisan 2026 - 31 Mayıs 2026
- `CE0`
- `CE1`
- `CE2`

### 1 Haziran 2026 - 31 Temmuz 2026
- `CE3`
- `CE4`

### 1 Ağustos 2026 - 30 Eylül 2026
- `CE5`
- `CE6`

### 1 Ekim 2026 - 30 Kasım 2026
- `CE7`
- `CE8`

### 1 Aralık 2026 - 31 Ocak 2027
- `CE9`
- `CE10`

### 1 Şubat 2027 - 31 Mart 2027
- `CE11`
- `CE12`

### 1 Nisan 2027 - 30 Nisan 2027
- `CE13`
- productization closeout
- public benchmark / docs / templates finalization

---

## 16. KPI ve Success Dashboard

## 16.1 Adoption KPI’ları

- install -> first-success rate
- `cwf codex` / `cwf do` session entry usage rate
- `note` usage rate
- thread/backlog promote rate
- resume success rate

## 16.2 Trust KPI’ları

- unresolved-question detection precision
- secure false-positive rate
- human_needed doğru sınıflama oranı
- rollback success rate
- evidence coverage ratio

## 16.3 Runtime KPI’ları

- subagent dispatch success rate
- blocked worker resolution time
- collect success rate
- patch apply success rate
- patch rollback success rate
- mailbox latency

## 16.4 Performance KPI’ları

- `cwf codex doctor <400ms warm`
- `cwf codex diff-config <100ms warm`
- `cwf do <150ms warm`
- `cwf note <100ms`
- `cwf packet compile <250ms warm`
- `cwf manager --live refresh <200ms warm`
- `cwf team mailbox <200ms warm`
- `subagent dispatch overhead <750ms`
- `verify-browser --smoke <10s`
- `verify-browser --adapter playwright <30s` basit akışta
- `cwf gc <300ms`
- `large-repo manager <350ms warm` daemon açıkken

## 16.5 Product Feel KPI’ları

- time to orientation
- command discoverability
- perceived confidence after verify/review
- manual recovery steps per week
- “neden böyle önerdi?” sorusuna ürün içinden cevap verebilme

---

## 17. Definition of Ready / Done

## 17.1 Definition of Ready

Her iş için şunlar yazılmadan iş başlamaz:

- kullanıcı problemi
- command surface
- canonical/runtime/home etkisi
- failure mode
- perf budget
- test fikri
- docs etkisi
- kill switch veya safe default

## 17.2 Definition of Done

Bir iş done değildir, eğer:

- intent net değilse
- `--json` yüzeyi yoksa
- canonical/runtime/home contract yazılmadıysa
- failure mode görünür değilse
- perf etkisi ölçülmediyse
- docs/help örneği yoksa
- fixture veya scenario testi yoksa

### Codex home’a dokunan işler için ekstra done şartı

- diff preview
- backup journal
- rollback
- property tests
- scope isolation

### Runtime işleri için ekstra done şartı

- write-scope refusal testleri
- timeout/cancel/retry testi
- orphan cleanup testi
- fallback story

### Evidence işleri için ekstra done şartı

- verdict protocol
- evidence bundle
- uncovered requirement report
- flaky budget tanımı

---

## 18. Fail-Fast ve Kill Switch Kuralları

## 18.1 Immediate stop kriterleri

- Codex config corruption
- rollback failure
- silent canonical mutation
- packet compiler kritik ref’i yanlış dışarıda bırakıyor olması
- uncontrolled process explosion
- patch apply veri kaybı riski
- evidence graph false-pass üretiyor olması

## 18.2 Kill switch kriterleri

- daemon tek flag ile kapanabilmeli
- hooks tek flag ile kapanabilmeli
- MCP layer tümden kapanabilmeli
- subagent runtime worktree/solo fallback verebilmeli
- adaptive router ölçüm moduna geri çekilebilmeli
- patch-first collect klasik summary collect’e geri dönebilmeli

## 18.3 Scope trim kriterleri

- `do` adoption düşükse komut yüzeyi büyütülmez
- role catalog karmaşıklaşıyorsa repo-derived rol jeneratörü bekletilir
- hybrid runtime karmaşıksa önce pure subagent veya pure worktree ile sınırlanır
- policy engine gürültü üretiyorsa önce warn-only modda kalır
- symbol explore erken karmaşıklaşıyorsa grep+index hibritinde tutulur

---

## 19. İlk Öncelikli Backlog

### P0 — Hemen yapılacaklar

- safe TOML patch engine
- `cwf codex setup/doctor/diff-config/rollback`
- role/prompt/skill catalog v1
- repo-derived role suggestion v0
- `cwf do`
- `cwf note`
- thread/backlog MVP
- questions/claims/assumptions ledger
- secure phase baseline
- context compiler spike
- subagent adapter spike
- Playwright smoke slice

### P1 — Yakın vade

- packet lock / provenance
- mailbox/timeline/steering
- patch bundle schema
- collect --as patch
- evidence graph v1
- policy engine v1
- telemetry probes
- hooks/MCP baseline
- GC policy
- large-repo benchmarks

### P2 — Orta vade

- adaptive routing
- notification layer
- symbol-aware explore
- incident memory
- cross-repo operator center
- public benchmark publishing
- stable/canary update engine

---

## 20. Non-Goals

- hidden DB tabanlı source-of-truth
- preview’siz global config yazımı
- görünmez agent swarm
- evidence olmadan autonomous closeout
- default açık hook/MCP/daemon
- ilk fazda tüm runtime’ları desteklemek
- ilk fazda tam LSP parity kovalamak
- shell yüzeyini tamamen öldürmek
- çok sayıda primary komut eklemek
- patch-first collect gelmeden kontrolsüz write-capable swarm açmak

---

## 21. Repo İçi Ownership Önerisi

- Stream A: Codex control plane
- Stream B: daily UX / router / capture
- Stream C: trust / secure / policy
- Stream D: packet compiler / runtime / patch collect
- Stream E: verify / evidence / Playwright
- Stream F: telemetry / scale / daemon / explore
- Stream G: docs / templates / release / fleet

### Her sprint için kural

- 1 adet user-facing primary win
- 1 adet trust/perf guardrail işi
- 1 adet docs işi

---

## 22. Yönetici Özeti

Bu roadmap’in net sonucu şudur:

1. Ürün bugün iyi durumda; çekirdek güçlü.
2. En büyük açık, Codex-native son katmanların eksik olması.
3. Önceki roadmap’in ana yönü doğruydu ve korunuyor.
4. Ama cutting-edge ürün olmak için yalnız CN omurgası yetmez.
5. Bu yüzden bu sürüm şu yeni katmanları ekliyor:
   - context compiler
   - patch-first runtime
   - policy engine
   - evidence graph
   - adaptive router
   - symbol-aware explore
   - incident memory
   - cross-repo operator center
6. Uygulama sırası rastgele değil:
   - önce control plane
   - sonra daily loop
   - sonra trust
   - sonra context compiler
   - sonra native runtime
   - sonra evidence/policy
   - sonra scale/integrations
   - en son cross-repo/productization

Kısa ifade:

> `codex-workflow-kit` bundan sonra “workflow dosyaları olan iyi bir CLI” değil, Codex kullanan geliştirici için güvenilir, hızlı, kanıt üreten ve paralelliği kontrol eden bir çalışma işletim sistemi olarak tasarlanmalıdır.

---

## 23. Bir Sonraki Somut Paket

İlk merge sırası:

1. `CE1` contract + TOML patch engine skeleton
2. `cwf codex setup/doctor/diff-config/rollback` MVP
3. `CE2` role/prompt catalog v1
4. `CE3` için `cwf do` + `cwf note` MVP
5. `CE4` claims/questions/secure baseline
6. `CE5` packet compile spike
7. `CE6` subagent adapter spike
8. `CE8` Playwright smoke slice

İlk büyük kazanımın formülü:

> `codex control plane + do + note + claims + packet compile + subagent spike`

---

## 24. Referans Girdiler

Bu roadmap şu girdilerden türetildi:

- mevcut repo implementasyonu
- mevcut repo roadmap ve audit yüzeyleri
- `oh-my-codex`’in Codex control plane, runtime ve MCP yaklaşımı
- `get-shit-done`’ın `do/note/thread/backlog`, secure phase, research gate, provenance ve browser verification yaklaşımı

Bu belge, bu girdilerin aynısını kopyalamaz; onları repo gerçekliğiyle uyumlu bir ürün rotasına çevirir.
