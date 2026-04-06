# Roadmap.md — codex-workflow-kit'i Cutting-Edge Codex Development OS'a Dönüştürme Planı

> Tarih: 2026-04-06  
> Hazırlayan: E2E ürün + mimari + Codex workflow audit  
> Kapsam: mevcut repo incelemesi + `oh-my-codex` ve `get-shit-done` karşılaştırması + uygulanabilir step-by-step ürün rotası  
> Hedef: `codex-workflow-kit`'i güçlü bir repo-native workflow companion seviyesinden, **Codex-native Development OS** seviyesine taşımak

---

## 1) Executive Summary

Bu repo bugün kötü değil; aksine workflow omurgası, markdown-canonical yaklaşımı, runtime yüzeyleri, benchmark/doctor kültürü ve temel team/orchestration iskeleti açısından oldukça iyi bir zemine sahip.

Ancak pazar lideri ve “cutting edge” bir ürün olmak için en kritik dört alanda net boşluk var:

1. **Natural language native intent engine** zayıf.  
   Bugünkü yönlendirme ve model routing ağırlıklı olarak heuristik/regex bazlı. Bu, “her seferinde doğru fonksiyonu çağırma” hedefi için yeterli değil.

2. **Code review mode gerçek bir ürün olarak yok.**  
   Review yüzeyi var ama daha çok closeout/reporting karakterinde. Derin semantic PR review, risk heatmap, diff intelligence, re-review loop ve blocker engine eksik.

3. **Frontend tarafı rakipleri aşacak düzeyde ürünleşmemiş.**  
   Frontend sinyal tespiti ve browser smoke doğrulaması var; fakat gerçek bir `UI phase`, `design contract`, `visual review`, `component intelligence`, `responsive audit`, `a11y + screenshot evidence` ürünü henüz yok.

4. **Large monorepo scale için current hot path'ler yeterince güçlü değil.**  
   Bazı cache'ler var ama invocation'lar arası persistent index, symbol graph, dependency graph, package-scoped invalidation, daemonized hot path ve monorepo delta-first execution eksik.

Bu roadmap’in ana tezi:

> Ürünü “workflow command set” olmaktan çıkarıp, **intent-aware, Codex-optimized, review-first, frontend-intelligent, monorepo-scaled Development OS** haline getirmeliyiz.

---

## 2) Benim E2E Audit Sonucum

Aşağıdaki değerlendirme, gönderdiğiniz zip içindeki yerel kod ve dokümantasyonun gerçek incelemesine dayanır.

### 2.1 Doğrulayabildiğim şeyler

Yerelde şu kontrolleri çalıştırdım:

- `node bin/cwf.js doctor --strict` → temiz geçti (`0 fail / 0 warn`)
- `node scripts/workflow/benchmark.js --runs 3 --json` → küçük repo baseline’ında SLO altında sonuçlar verdi
- `node --test tests/workflow_phase1.test.js` → geçti

Küçük repo üzerinde benchmark sıcak median değerleri yaklaşık şu aralıkta çıktı:

- `hud`: ~174 ms
- `next`: ~156 ms
- `doctor`: ~120 ms
- `health`: ~124 ms
- `map-codebase`: ~173 ms
- `map-frontend`: ~183 ms

### 2.2 Dürüst not

Repodaki `docs/roadmap-audit.md`, çok daha ileri bir “tamamlandı” görünümü veriyor. Fakat kodun E2E okunması, bu yüzeylerin önemli bir kısmının:

- iskelet seviyesinde,
- heuristik seviyede,
- küçük repo için yeterli ama büyük repo için yetersiz,
- veya ürünselleşmiş değil “surface present” seviyesinde

olduğunu gösteriyor.

Yani mevcut repo kendi kendine “tamamlandı” dese de, benim ürün/mimari değerlendirmem şu:

> **Foundation güçlü.  
> Differentiator katmanları henüz market-leading değil.**

### 2.3 Mevcut ürüne verdiğim olgunluk puanı

| Alan | Durum | Puan |
| --- | --- | --- |
| Workflow kernel / CLI surface | Güçlü temel | 8/10 |
| Codex control plane | Başlangıç var, derinlik eksik | 5/10 |
| Natural language routing | Heuristik, kırılgan | 4/10 |
| Code review mode | Gerçek differentiator değil | 3/10 |
| Frontend mode | Sinyal tespiti var, gerçek UI OS yok | 3/10 |
| Team runtime | Sağlam başlangıç | 6/10 |
| Evidence / trust | Başlangıç iyi | 6/10 |
| Monorepo scale | Küçük repo iyi, büyük repo için yetersiz | 5/10 |
| Product UX / operator experience | CLI iyi, premium product feel eksik | 5/10 |

---

## 3) Referans Repo Karşılaştırması: Ne Alacağız, Nasıl Aşacağız

## 3.1 `oh-my-codex`'ten alınacaklar

`oh-my-codex` tarafında özellikle değerli olan noktalar:

- güçlü session bootstrap hissi
- durable team runtime
- mailbox / dispatch / lifecycle disiplini
- Codex native subagents ile durable worker runtime ayrımının net olması
- operator HUD ve runtime görünürlüğü
- execution engine olarak Codex’i merkeze koyup workflow katmanını onun etrafında tasarlaması

### Bizim ürüne taşınacak karşılıkları

- `cwf codex profile`
- `cwf codex bootstrap`
- `cwf codex resume-card`
- `cwf team api`
- `cwf team watch`
- `cwf team collect --patch-first`
- `cwf hud --intent --cost --risk`
- `cwf subagents plan`

## 3.2 `get-shit-done`'dan alınacaklar

`get-shit-done` tarafında çok kıymetli olanlar:

- discuss/assumptions katmanı
- `verify work` / UAT döngüsü
- `UI phase` ve `UI review`
- requirement-to-test doğrulama mantığı
- workstream / backlog / parking-lot yaklaşımı
- hızlı günlük kullanım komut yüzeyleri

### Bizim ürüne taşınacak karşılıkları

- `cwf discuss`
- `cwf assumptions`
- `cwf verify-work`
- `cwf ui-spec`
- `cwf ui-review`
- `cwf validation-map`
- `cwf backlog park`
- `cwf next --from-gap`

## 3.3 İkisini de aşmamız gereken alanlar

Sadece bu iki ürünü taklit etmek yetmez. Bizim ekstra differantiator alanlarımız şunlar olmalı:

1. **Intent Engine v2**
2. **Context Compiler**
3. **Review OS**
4. **Frontend OS**
5. **Monorepo Scale OS**
6. **Evidence Graph**
7. **Adaptive Codex Profile Engine**
8. **Patch-First Orchestration**
9. **Policy & Approval Matrix**
10. **Product-grade dashboard / TUI / web control surface**

---

## 4) En Kritik Bulgular: Koddaki Gerçek Darboğazlar

Aşağıdaki maddeler doğrudan repo incelemesinden çıkan ana darboğazlardır.

## 4.1 Natural language routing bugün yeterli değil

Bugünkü routing yüzeyi ağırlıklı olarak `regex + keyword + phase heuristics` mantığında.

Bu yaklaşımın problemleri:

- synonym coverage zayıf
- çok dilli doğal dil güvenilirliği zayıf
- task ambiguity yönetimi zayıf
- confidence score yok
- “neden bu lane seçildi?” açıklaması yetersiz
- repo context ile grounding yok
- user intent ile repo capability eşleşmesi zayıf
- yanlış lane seçildiğinde self-repair yok

### Sonuç

“Natural language ile native bir şekilde çalışıp doğru fonksiyonları her seferinde çağırmak” hedefi için **Intent OS v2** şart.

## 4.2 Code review mode aslında gerçek bir review engine değil

Şu an review tarafı daha çok:

- milestone summary
- touched files
- verification summary
- risk note
- reviewer checklist

seviyesinde.

Eksik olanlar:

- changed-lines semantic triage
- correctness risk
- regression risk
- API contract drift
- migration risk
- architecture drift
- performance regression review
- security review lanes
- frontend-specific review
- re-review / resolved issues replay
- PR scoring / blocker engine

### Sonuç

Ayrı bir `Code Review Mode` ürünleştirmek şart.

## 4.3 Frontend tarafı henüz gerçek differentiator değil

Bugünkü frontend tarafında şunlar var:

- framework detection
- stack presence detection
- figma link detection
- browser verify başlangıcı
- frontend intent sinyalleri

Ama eksik olanlar:

- design contract
- UI specification canonical ledger
- responsive matrix
- component inventory & reuse analysis
- accessibility regression gates
- screenshot diff + DOM diff + token drift analizi
- “missing states” detector
- frontend review scorecard
- preview gallery
- user-journey validation
- storybook / playwright / design token intelligence

### Sonuç

Frontend tarafını rakiplerden ciddi biçimde ayıracak ayrı bir **Frontend OS** inşa etmek gerekiyor.

## 4.4 Monorepo scale için bugünkü cache ve index yaklaşımı yeterli değil

Bugünkü yapı bazı iyi adımlara sahip olsa da şu problemler açık:

- invocation bazlı process reset → cache yeniden ısınıyor
- bazı hot path’lerde sync FS kullanımı
- file index’in her çağrıda geniş repo üzerinde stat/read yükü oluşturma riski
- persistent daemon/index yok
- symbol graph yok
- dependency graph yok
- package ownership / test ownership graph yok
- git delta invalidation stratejisi sınırlı
- `.workflowignore` / repo-specific huge-dir denylist konsepti yetersiz
- mailbox/timeline/log büyümesi ileride I/O baskısı yaratacak
- `explore` derin semantic navigation yerine daha çok grep/path-scorer karakterinde

### Sonuç

Büyük monorepolar için ayrı bir **Scale OS** katmanı kurmadan ürün akışkan olmaz.

---

## 5) Kuzey Yıldızı: Hangi Ürünü İnşa Ediyoruz?

Hedef ürünün kısa tanımı şu olmalı:

> **Codex-native Development OS**  
> Repo’yu okuyan, intent’i doğru anlayan, doğru çalışma modunu seçen, Codex’i buna göre bootstrap eden, context’i paketleyen, gerekiyorsa subagent/team orkestrasyonunu güvenli yürüten, review ve frontend audit’i derin yapan, evidence üreten, policy’ye göre ship eden sistem.

Bu ürünün 7 ana sütunu:

1. **Intent OS**
2. **Codex Control Plane**
3. **Context Compiler**
4. **Review OS**
5. **Frontend OS**
6. **Scale OS**
7. **Evidence / Policy OS**

---

## 6) Mimari Karar: Hangi Katmanları Eklemeliyiz?

## 6.1 Command Registry + Capability Graph

İlk mimari değişiklik: komutlar sadece CLI mapping değil, metadata ile tanımlanan capability objeleri olmalı.

Her capability şu alanlara sahip olmalı:

```ts
type Capability = {
  id: string;
  aliases: string[];
  domain: "research" | "plan" | "execute" | "review" | "frontend" | "verify" | "ship" | "ops";
  risk: "low" | "medium" | "high";
  sideEffects: ("write_fs" | "run_shell" | "network" | "git_mutation" | "browser" | "config_mutation")[];
  repoSignals: string[];
  preconditions: string[];
  postconditions: string[];
  evidenceOutputs: string[];
  supportsMonorepo: boolean;
  supportsFrontend: boolean;
  supportsReview: boolean;
  codexModes: string[];
};
```

### Neden?

Çünkü:

- intent engine bu capability graph üzerinden karar verir
- explainability mümkün olur
- policy/approval matrix entegre olur
- review/frontend/monorepo lane’leri ilk sınıf hale gelir
- yanlış komut seçimi azaltılır

---

## 6.2 Intent Engine v2

Yeni intent katmanı şu pipeline ile çalışmalı:

1. **Lexical parse**  
   Emir, kısıt, bağlam, dosya, hedef, repo ipuçları çıkarılır.

2. **Semantic intent classify**  
   Kullanıcı cümlesi şu eksenlerde etiketlenir:  
   `research`, `plan`, `execute`, `review`, `frontend`, `debug`, `security`, `ship`, `incident`, `monorepo`, `refactor`, `migration`.

3. **Repo-grounded planner**  
   Repo shape, frontend varlığı, changed files, package graph, active workflow state ile birlikte capability selection yapılır.

4. **Confidence scorer**  
   “Bu seçim ne kadar güvenli?” belirlenir.

5. **Action planner**  
   Tek komut yerine mini çalışma planı döner:
   - primary capability
   - fallback
   - verification
   - evidence outputs

6. **Self-repair / retry**  
   Yanlış lane sinyali, failed verification veya kullanıcı steering’i olursa yeniden route edilir.

### Minimum çıktılar

- `cwf do --explain`
- `cwf do --dry-run`
- `cwf route --why`
- `cwf route --json`
- route confidence score
- ambiguity classes
- user steering memory

---

## 6.3 Codex Profile Engine

Bugünkü model routing, faz adına göre preset seçmekten öteye geçmeli.

Yeni sistem:

```ts
type CodexProfile = {
  mode: "implement" | "review" | "frontend" | "research" | "incident" | "refactor";
  reasoningEffort: "low" | "medium" | "high" | "extra_high";
  contextDepth: "minimal" | "delta" | "focused" | "full";
  subagentPolicy: "off" | "bounded" | "parallel_readonly" | "hybrid";
  verifyPolicy: "light" | "standard" | "strict";
  costBudget: "tiny" | "small" | "medium" | "large";
  riskBudget: "low" | "medium" | "high";
};
```

### Profile selection sinyalleri

- repo büyüklüğü
- task risk’i
- frontend mi?
- review mü?
- migration mi?
- shell / browser gerekiyor mu?
- write-scope ne kadar geniş?
- kullanıcı “hızlı” mı istiyor “derin” mi?

### Öneri

Sizin geliştirme akışınıza özel bir preset de ilk sınıf olmalı:

- `codex-gpt54-extra-high`
- `codex-review-deep`
- `codex-frontend-ship`
- `codex-monorepo-delta`
- `codex-incident-fast`

---

## 6.4 Context Compiler

Bu ürünün gerçek sıçrama noktalarından biri bu olmalı.

Amaç:

- tüm repo context’ini değil
- **göreve uygun, sıkıştırılmış, ispatlı, diff-aware, package-aware** context pack üretmek

### Context Compiler çıktıları

- task brief
- touched packages
- relevant files
- active risks
- dependency impact
- open questions
- known claims
- verification checklist
- review checklist
- frontend checklist
- evidence slots

### Packet türleri

- `intent packet`
- `execution packet`
- `review packet`
- `frontend packet`
- `incident packet`
- `handoff packet`
- `resume card`

### Neden bu kritik?

Çünkü Codex başarısı büyük oranda doğru context packing’e bağlı.  
Bu ürünün “Codex-specific moat”i burada oluşur.

---

## 6.5 Evidence Graph

Bugünkü yaklaşım “dosya yazıldı / verify oldu” seviyesinde kalmamalı.

İstediğimiz model:

```ts
Question -> Assumption -> Claim -> Change -> Diff -> Test -> Screenshot -> Review Finding -> Approval -> Ship
```

Bu zinciri graph halinde tutmalıyız.

### Yararları

- review mode çok güçlenir
- ship güveni artar
- UAT sonucu bağlanır
- failed claim’ler görülebilir
- “hangi değişiklik neyi ispatlıyor?” sorusu cevaplanır

---

## 6.6 Frontend OS Schema

Frontend için ayrı canonical yüzeyler gerekli:

- `UI-SPEC.md`
- `UI-PLAN.md`
- `UI-REVIEW.md`
- `RESPONSIVE-MATRIX.md`
- `COMPONENT-INVENTORY.md`
- `DESIGN-DEBT.md`

### UI-SPEC zorunlu boyutları

1. Bilgi mimarisi
2. Kullanıcı akışı
3. Bileşen envanteri
4. State map
5. Responsive davranış
6. Copy tone
7. A11y checklist
8. Design token kullanımı
9. Empty/loading/error/success states
10. Evidence plan

---

## 6.7 Review OS Schema

Code review ayrı bir veri modeli ile çalışmalı.

- `REVIEW-RUN.md`
- `REVIEW-FINDINGS.json`
- `RISK-HEATMAP.json`
- `REVIEW-BLOCKERS.md`
- `REVIEW-REPLAY.md`

### Review kategori seti

- correctness
- regression
- performance
- security
- architecture
- API drift
- data/migration
- test gap
- frontend UX/a11y
- maintainability

---

## 6.8 Scale OS

Monorepo için yeni katmanlar:

- persistent file index
- package graph
- symbol graph
- dependency graph
- test ownership graph
- watch mode / daemon
- delta invalidation
- lazy content loading
- workspace sharding
- hot-path budget enforcement

---

## 7) Step-by-Step Roadmap

Aşağıdaki plan, uygulanabilir sıralamadır.  
Burada amaç “her şeyi aynı anda” yapmak değil; **ürünün DNA’sını doğru sırayla yükseltmek**.

---

## Phase 0 — Truth Reset, Baseline ve Instrumentation
**Süre:** 3–5 gün  
**Öncelik:** P0  
**Amaç:** repo içindeki “tamamlandı” hissini gerçek metrik ve fixture’larla eşitlemek

### Yapılacaklar

1. `Roadmap.md` ve audit dokümanlarını “surface exists” vs “market-ready” ayrımıyla yeniden yaz.
2. `benchmark` harness’ine large repo fixture desteği ekle:
   - small
   - medium
   - large monorepo
3. Intent routing için golden dataset oluştur.
4. Review mode için sample PR/diff corpus oluştur.
5. Frontend için UI audit corpus oluştur.
6. `doctor` ve `health` raporlarına gerçek risk puanı ekle.
7. Tüm yeni roadmap fazları için success metric şeması tanımla.

### Değişecek alanlar

- `Roadmap.md`
- `docs/roadmap-audit.md`
- `scripts/workflow/benchmark.js`
- `tests/fixtures/*`
- `tests/*`

### Acceptance criteria

- “tamamlandı” iddiası olan her faz için ölçülebilir kanıt şeması olsun
- benchmark small/medium/large fixture’da çalışsın
- intent golden set en az 200 utterance içersin
- review corpus en az 25 diff senaryosu içersin

---

## Phase 1 — Intent OS v2
**Süre:** 1–2 hafta  
**Öncelik:** En kritik  
**Amaç:** natural language → doğru capability → doğru verify path zincirini güvenilir hale getirmek

### Yapılacaklar

1. Capability registry ekle.
2. `do.js` içindeki regex router’ı modüler hale getir.
3. Semantic intent classifier ekle.
4. Repo-grounded planner ekle.
5. Confidence score + ambiguity reason ekle.
6. `--explain` / `--dry-run` modlarını ekle.
7. Route telemetry:
   - chosen capability
   - rejected alternatives
   - confidence
   - verification plan
8. Route self-eval:
   - verification başarısızsa re-route
   - review mode gerekiyorsa auto-escalate
   - frontend task ise UI lane’e auto-route
9. User steering memory:
   - “bunu review modu ile yap”
   - “browser da kullan”
   - “önce araştır sonra patch”
   gibi tercihler kalıcı olsun.

### Yeni komutlar

- `cwf do --explain`
- `cwf route --why`
- `cwf route replay`
- `cwf route eval`

### Acceptance criteria

- golden utterance set üzerinde top-1 intent accuracy ≥ %95
- wrong-lane oranı ≤ %5
- user correction sonrası repeat accuracy ≥ %98
- Türkçe + İngilizce karışık promptlarda stabil sonuç

### Kod dokunulacak noktalar

- `scripts/workflow/do.js`
- `scripts/workflow/model_route.js`
- `scripts/workflow/common.js`
- yeni: `scripts/workflow/intent_engine.js`
- yeni: `scripts/workflow/capability_registry.js`
- yeni test suite

---

## Phase 2 — Codex Profile Engine + Session Bootstrap
**Süre:** 1 hafta  
**Öncelik:** Çok yüksek  
**Amaç:** Codex’i göreve uygun modda bootstrap etmek

### Yapılacaklar

1. `codex_control.js` içine profile layer ekle.
2. Profile presets tanımla:
   - implement-fast
   - implement-deep
   - review-deep
   - frontend-ship
   - monorepo-delta
   - incident-fast
   - gpt54-extra-high
3. Session bootstrap komutu ekle:
   - intent
   - repo profile
   - risk lane
   - context depth
   - verification policy
4. Resume card üret:
   - session summary
   - last touched files
   - open questions
   - next best actions
5. Skill/role catalog’u repo-derived hale getir.
6. Subagent plan recommendation yüzeyi ekle.
7. “neden bu Codex profile seçildi?” açıklamasını görünür yap.

### Yeni komutlar

- `cwf codex profile suggest`
- `cwf codex bootstrap`
- `cwf codex resume-card`
- `cwf codex plan-subagents`

### Acceptance criteria

- her task için profile explanation üretilebilsin
- high-risk task’lar auto strict verify moduna geçsin
- frontend task auto frontend-ship profile alsın
- review task auto review-deep profile alsın

### Kod dokunulacak noktalar

- `scripts/workflow/codex_control.js`
- `scripts/workflow/model_route.js`
- `scripts/workflow/roadmap_os.js`
- role/prompt catalog surface

---

## Phase 3 — Code Review Mode v1
**Süre:** 2 hafta  
**Öncelik:** Çok yüksek  
**Amaç:** ürüne ayrı bir differentiator olarak gerçek review engine kazandırmak

### Yapılacaklar

1. Review task’ını ayrı workflow mode yap.
2. Review input kaynaklarını destekle:
   - git diff
   - patch bundle
   - changed files
   - PR range
3. Multi-pass review engine kur:
   - pass 1: fast triage
   - pass 2: semantic correctness
   - pass 3: architecture/perf/security
   - pass 4: verify/test gap
4. Risk heatmap üret:
   - file bazlı
   - package bazlı
   - concern bazlı
5. Category-tagged findings üret.
6. Blocker engine kur:
   - ship blockers
   - must-fix
   - should-fix
   - nice-to-have
7. Re-review loop kur:
   - issue resolved mı?
   - partially resolved mı?
   - regression oluştu mu?
8. Review packet ile evidence graph’i bağla.
9. Review outcome score üret:
   - confidence
   - severity weighted score
   - ship readiness

### Yeni komutlar

- `cwf review-mode`
- `cwf pr-review`
- `cwf re-review`
- `cwf review --heatmap`
- `cwf review --blockers`
- `cwf review --patch-suggestions`

### Acceptance criteria

- diff bazlı review çalışsın
- findings kategorize edilsin
- re-review issue resolution state döndürsün
- review çıktısı ship kararı için kullanılabilsin

### Kod dokunulacak noktalar

- `scripts/workflow/review.js`
- `scripts/workflow/lifecycle_common.js`
- `scripts/workflow/patch_review.js`
- yeni: `scripts/workflow/review_engine.js`
- yeni: `scripts/workflow/review_findings.js`

---

## Phase 4 — Frontend OS v1
**Süre:** 2–3 hafta  
**Öncelik:** Çok yüksek  
**Amaç:** frontend geliştirme ve review tarafında rakiplerden ciddi biçimde daha iyi bir ürün yapmak

### Yapılacaklar

1. `UI-SPEC` üretimini zorunlu hale getir.
2. `UI phase` ekle:
   - hedef ekranlar
   - user flows
   - component inventory
   - state map
   - responsive matrix
   - tokens
   - a11y expectations
3. `UI review` katmanı ekle:
   - screenshot diff
   - DOM diff
   - a11y audit
   - component reuse audit
   - token drift audit
   - missing states audit
4. Storybook / Playwright / preview adapters güçlendir.
5. Figma link varsa design contract’a bağla.
6. Frontend scorecard oluştur:
   - visual consistency
   - interaction clarity
   - responsive correctness
   - accessibility
   - component hygiene
   - copy consistency
7. Preview gallery üret.
8. “before vs after” evidence yüzeyi ekle.
9. Frontend task’larda auto browser verify ve screenshot evidence üret.
10. Empty/loading/error/success states için checklist zorunlu kıl.

### Yeni komutlar

- `cwf ui-spec`
- `cwf ui-plan`
- `cwf ui-review`
- `cwf preview`
- `cwf component-map`
- `cwf responsive-matrix`
- `cwf design-debt`

### Acceptance criteria

- frontend task başladığında UI-SPEC oluşsun
- task bittiğinde UI-REVIEW oluşsun
- visual/a11y/responsive/component scorecard çıksın
- browser verify sadece smoke değil, gerçek frontend audit üretsin

### Kod dokunulacak noktalar

- `scripts/workflow/map_frontend.js`
- `scripts/workflow/verify_browser.js`
- yeni: `scripts/workflow/ui_spec.js`
- yeni: `scripts/workflow/ui_review.js`
- yeni: `scripts/workflow/component_inventory.js`
- yeni: `scripts/workflow/responsive_matrix.js`

---

## Phase 5 — Product UX Differentiator: Dashboard / TUI / Web Surface
**Süre:** 2 hafta  
**Öncelik:** Yüksek  
**Amaç:** ürünün kendi frontend’ini premium differentiator haline getirmek

Bugün ürün ağırlıklı olarak CLI.  
Bu iyi ama yeterli değil. “Rakiplerden çok daha iyi frontend” talebini karşılamak için **ürünün kendi operator yüzeyi** de çok güçlü olmalı.

### Yapılacaklar

1. Local dashboard/TUI başlat:
   - active task
   - chosen route
   - confidence
   - cost
   - risk
   - changed files
   - verify status
   - screenshots
   - review findings
2. Review Board UI:
   - risk heatmap
   - blockers
   - file findings
   - resolution status
3. Frontend Review UI:
   - before/after gallery
   - responsive breakpoints
   - a11y issues
   - token drift
4. Team Runtime UI:
   - workers
   - claimed tasks
   - patch bundles
   - conflicts
5. Resume card / session timeline UI.
6. “Why this tool?” explanation panel.
7. Command palette:
   - doğal dille komut çalıştırma
   - route preview
   - manual override

### Önerilen teknik yaklaşım

- küçük ama çok hızlı bir local web app
- file-based runtime state’ten beslenen dashboard
- incremental rendering
- virtualized tables/panels
- screenshot diff gallery

### Acceptance criteria

- CLI tek başına yetmeyen review/frontend/team kullanımında UI gerçek değer katsın
- dashboard cold start < 2s
- büyük review’larda bile akıcı olsun

---

## Phase 6 — Scale OS v1 (Monorepo Performance)
**Süre:** 2–3 hafta  
**Öncelik:** Kritik  
**Amaç:** 100k+ dosyalı monorepolarda bile akışkanlık

### Bugünkü açık darboğazlar

1. **Per-invocation cache reset**
2. **sync filesystem hot path**
3. **file stat/read geniş repo tarama maliyeti**
4. **symbol graph yok**
5. **package graph / dependency graph eksik**
6. **git delta invalidation sınırlı**
7. **mailbox/log/jsonl büyüme riski**
8. **startup cost / node process churn**
9. **semantic explore eksik**
10. **per-command duplicate parsing**

### Yapılacaklar

1. Persistent daemon ekle.
2. Persistent index store kur:
   - file metadata
   - package ownership
   - exports/imports
   - symbol edges
   - changed files
3. `.workflowignore` tanımla.
4. `.gitignore` + workspace config + custom denylist birleşimi yap.
5. `git ls-files` / watchman / ripgrep fallback hiyerarşisi oluştur.
6. async + batched FS layer ekle.
7. worker-thread indexing ekle.
8. package-scoped invalidation kur.
9. delta-aware map-codebase/map-frontend/explore yap.
10. log retention + gc politikası ekle.
11. telemetry ile hot-path bütçeleri enforce et.
12. large monorepo fixture benchmark oluştur.

### Monorepo SLO hedefleri

#### Küçük repo
- `hud` < 250ms warm
- `next` < 250ms warm

#### Orta repo
- `hud` < 500ms warm
- `next` < 500ms warm
- `map-codebase` < 1.5s warm

#### Büyük monorepo
- `hud` < 1.2s warm
- `next` < 1.0s warm
- `map-codebase` delta mode < 2.5s
- `explore symbol` < 700ms
- `review preflight` < 1.5s

### Kod dokunulacak noktalar

- `scripts/workflow/fs_index.js`
- `scripts/workflow/io/files.js`
- `scripts/workflow/perf/runtime_cache.js`
- `scripts/workflow/runtime_collector.js`
- `scripts/workflow/explore.js`
- yeni: `scripts/workflow/daemon_index.js`
- yeni: `scripts/workflow/package_graph.js`
- yeni: `scripts/workflow/symbol_graph.js`

---

## Phase 7 — Team Runtime v2 + Patch-First Orchestration
**Süre:** 1–2 hafta  
**Öncelik:** Yüksek  
**Amaç:** paralellik kalitesini gerçek ürün avantajına dönüştürmek

### Yapılacaklar

1. Native subagent vs durable team ayrımını netleştir:
   - bounded read-only analysis → native subagent
   - durable parallel patch work → team runtime
2. Claim/lease ownership katmanı ekle.
3. Patch-first collect modeline geç.
4. Conflict detector kur.
5. Patch merge queue kur.
6. Team collect sonrası review packet otomatik üret.
7. Worker quality score ve retry reason ekle.
8. Monorepo package boundaries’ni write-scope olarak kullan.

### Yeni komutlar

- `cwf subagents plan`
- `cwf team collect --patch-first`
- `cwf team conflicts`
- `cwf team merge-queue`
- `cwf team quality`

### Acceptance criteria

- parallel work overlapped write scope yaratmasın
- collect süreci patch-first olsun
- worker çıktıları review’a otomatik bağlansın

---

## Phase 8 — Evidence / Trust / Policy OS
**Süre:** 1–2 hafta  
**Öncelik:** Yüksek  
**Amaç:** “yapıldı” yerine “kanıtlandı” kültürü

### Yapılacaklar

1. Evidence graph schema’yı uygula.
2. Questions / assumptions / claims / verify / screenshots / approvals zincirini bağla.
3. Risk lane bazlı approval matrix ekle.
4. Security deep mode:
   - migrations
   - auth
   - secrets
   - destructive ops
   - infra mutations
5. Manual UAT lane ekle:
   - `verify-work`
   - yes/no guided checks
   - failure → fix plan
6. Ship readiness score üret.

### Yeni komutlar

- `cwf verify-work`
- `cwf evidence graph`
- `cwf approval plan`
- `cwf ship-readiness`

### Acceptance criteria

- review bulguları evidence graph’e bağlansın
- high-risk task approval isteyebilsin
- verify-work çıktısı fix plan üretebilsin

---

## Phase 9 — Product Polish, API, Ecosystem
**Süre:** 1–2 hafta  
**Öncelik:** Orta  
**Amaç:** ürünü uzun vadede ölçeklenebilir ve entegre edilebilir hale getirmek

### Yapılacaklar

1. Stable JSON API surface tanımla.
2. Dashboard ile CLI aynı runtime state’i kullansın.
3. MCP / hooks / notify yüzeylerini kalite açısından toparla.
4. Plugin API / adapter API tasarla.
5. Exportable session bundles ekle.
6. Team/review/frontend raporlarını paylaşılabilir hale getir.
7. Docs / upgrade / migrations iyileştir.

---

## 8) İlk 30 Gün İçin Uygulanabilir PR Planı

Burada “hemen başlayalım” seviyesinde net bir plan veriyorum.

## PR-1 — Truth Reset ve gerçek baseline
**Kapsam**
- roadmap/audit düzelt
- benchmark fixture altyapısı
- intent/review/ui corpus klasörleri
- doctor/health risk score

**Neden ilk?**  
Çünkü yanlış başarı hissi, yanlış öncelik doğurur.

---

## PR-2 — Capability Registry
**Kapsam**
- capability schema
- command metadata registry
- side effects / risk / evidence annotations

**Neden?**  
Intent engine ve policy engine bunun üstüne kurulacak.

---

## PR-3 — Intent Engine v2 skeleton
**Kapsam**
- lexical parse
- semantic tags
- confidence score
- `--explain`
- golden route tests

**Başarı kriteri**
- top-1 routing doğruluğunda gözle görülür artış

---

## PR-4 — Codex Profile Engine
**Kapsam**
- profile presets
- bootstrap flow
- resume card
- explainable profile choice

**Başarı kriteri**
- her task için uygun Codex çalışma modu seçilebilmesi

---

## PR-5 — Code Review Mode v1
**Kapsam**
- `pr-review`
- `review findings`
- blockers
- re-review

**Başarı kriteri**
- review çıktısı sadece rapor değil, karar motoru olsun

---

## PR-6 — Frontend OS v1 Skeleton
**Kapsam**
- `ui-spec`
- `ui-review`
- screenshot evidence
- responsive matrix
- component inventory

**Başarı kriteri**
- frontend task’lar canonical UI docs üretsin

---

## PR-7 — Persistent Index + `.workflowignore`
**Kapsam**
- daemon index
- ignore controls
- delta invalidation
- package graph başlangıcı

**Başarı kriteri**
- large repo hot path iyileşmeye başlasın

---

## PR-8 — Dashboard v0
**Kapsam**
- active task
- route confidence
- review findings
- screenshot gallery
- team timeline

**Başarı kriteri**
- ürünün kendi UX’i farklılaşmaya başlasın

---

## PR-9 — Evidence Graph
**Kapsam**
- graph schema
- verify-work
- review/evidence link
- ship-readiness

**Başarı kriteri**
- closeout güveni ölçülebilir hale gelsin

---

## PR-10 — Team Runtime v2
**Kapsam**
- patch-first collect
- conflict detector
- merge queue
- worker quality

**Başarı kriteri**
- paralel execution daha güvenli ve daha verimli olsun

---

## 9) Natural Language Native Çalışma İçin Somut Tasarım

Kullanıcının en kritik beklentilerinden biri bu olduğu için ayrı yazıyorum.

## 9.1 Ne yapmamalıyız?

Sadece regex artırmak çözüm değil.  
Sadece keyword listesi büyütmek de çözüm değil.

## 9.2 Ne yapmalıyız?

### Katmanlı intent çözümlemesi

1. deterministic grammar
2. semantic classification
3. repo-grounded capability scoring
4. ambiguity detection
5. explainable plan output
6. verification-aware reroute

### Function selection formatı

```json
{
  "intent": "frontend_review",
  "confidence": 0.94,
  "primary_capability": "ui-review",
  "secondary_capability": "verify-browser",
  "codex_profile": "frontend-ship",
  "verify_plan": ["screenshot_diff", "a11y_audit", "responsive_matrix"],
  "evidence_outputs": ["UI-REVIEW.md", "screenshots", "a11y-report.json"]
}
```

### Gereken test stratejisi

- Türkçe
- İngilizce
- karışık
- kısa komutlar
- uzun doğal dil
- belirsiz istekler
- review/frontend/incident/migration/security senaryoları
- yanlış steering / user correction cases

### Altın metrikler

- top-1 capability accuracy
- top-3 coverage
- unnecessary tool invocations per task
- user correction rate
- reroute success rate

---

## 10) Frontend Differentiator İçin Ekstra Özellikler

Sadece “UI phase ekledik” yetmez. Gerçek fark yaratacak özellikler şunlar:

## 10.1 Component Reuse Intelligence
- benzer component’leri tespit et
- duplicate UI patterns’i bul
- “yeni component mi, mevcut reusable component mi?” öner

## 10.2 Missing State Detector
- loading
- empty
- error
- success
- disabled
- hover/focus/active
- mobile edge cases

## 10.3 Responsive Intent Matrix
- her ekran için breakpoint davranışı
- content collapse / wrap / priority shift
- nav overflow davranışı

## 10.4 Token Drift Audit
- spacing
- radius
- color
- typography
- elevation
- motion

## 10.5 UX Regression Gallery
- before/after screenshots
- diff overlay
- interaction notes
- risk labels

## 10.6 Frontend Experience Score
- görsel tutarlılık
- erişilebilirlik
- hız hissi
- state completeness
- component hygiene
- copy clarity

---

## 11) Ayrı Code Review Mode İçin Ekstra Özellikler

Bu ürünün en büyük differentiator alanlarından biri burası olabilir.

## 11.1 Review Personas
- correctness reviewer
- perf reviewer
- security reviewer
- architecture reviewer
- frontend reviewer
- DX reviewer

## 11.2 Review Outputs
- executive summary
- blockers
- must-fix
- risk heatmap
- file comments
- test gaps
- follow-up tickets
- ship recommendation

## 11.3 Re-review Intelligence
- önceki issue çözülmüş mü?
- başka yerde tekrar oluşmuş mu?
- fix yeni regression üretmiş mi?

## 11.4 Requirement Traceability
- bu diff hangi requirement’i karşılıyor?
- hangi requirement açıkta kaldı?
- hangi test bunu ispatlıyor?

## 11.5 Review Confidence
- low confidence → daha fazla verify iste
- high confidence → ship path öner

---

## 12) Monorepo Performance: En Somut İyileştirme Listesi

Aşağıdaki maddeler doğrudan uygulanmalı.

## 12.1 Sync FS hot path'leri azalt
- `statSync`, `readFileSync`, geniş recursive taramalar hot path’te pahalı
- async/batched FS layer kur

## 12.2 Persistent index store
- JSON tek başına yetmez
- file metadata + package graph + symbol edges persistent tutulmalı

## 12.3 Package-scoped invalidation
- tüm repo yerine sadece etkilenen workspace/package yeniden hesaplanmalı

## 12.4 Git delta-first execution
- changed files / changed packages / changed owners üzerinden çalış

## 12.5 Symbol-aware explore
- grep/path search yerine symbol graph + caller/callee + ownership

## 12.6 Daemonized warm state
- her komutta yeniden ısınan process maliyetini azalt

## 12.7 Log/mailbox retention
- jsonl dosyaları sonsuz büyümesin
- rolling segments + compaction olsun

## 12.8 Ignore strategy
- `.gitignore`
- `.workflowignore`
- custom generated dirs
- user denylist

## 12.9 Large repo fixture tests
- gerçek monorepo workload yoksa performans iddiası anlamlı değil

## 12.10 Review preflight ve intent preflight ayrı optimize edilsin
- review için tüm repo’yu değil diff impact alanını yükle
- frontend task için tüm backend repo’yu tarama

---

## 13) Codex-Specific Geliştirmeler

Bu bölüm doğrudan “Codex deneyimini development süreçlerinde nasıl iyileştiririz?” sorusunun cevabı.

## 13.1 Codex çalışma modları
- Implement
- Review
- Frontend Ship
- Research
- Incident
- Refactor
- Migration
- Security

## 13.2 Dynamic reasoning effort
Task karmaşıklığına göre reasoning effort değişmeli.  
Herkese aynı preset mantığı verimsiz.

## 13.3 Context depth control
- tiny
- delta
- focused
- full

## 13.4 Subagent planner
- ne zaman native subagent?
- ne zaman team runtime?
- ne zaman solo?
- ne zaman hybrid?

## 13.5 Resume cards
Bir task’a tekrar girmek çok daha kolay olmalı.

## 13.6 Session memory
- açık riskler
- user steering tercihleri
- sık tekrar eden hata türleri
- incident cookbook

## 13.7 Prompt adapters
Repo türüne göre prompt scaffolds:
- SaaS app
- frontend-heavy app
- monorepo
- infra tooling
- API server
- library
- migration-heavy repo

## 13.8 Cost/perf governor
- gereksiz derin mod çağrısını azalt
- high-cost paths yalnızca gerçekten gerektiğinde aç

## 13.9 Verify-aware execution
Codex execute modunda giderken, verify yükümlülüğü baştan belli olsun.

## 13.10 Patch packaging
Codex çıktısı yalnız “dosya değişikliği” değil, reviewable patch package olarak üretilsin.

---

## 14) Başarı Metrikleri

Ürün ancak ölçülürse gelişir.

## 14.1 Intent metrikleri
- top-1 route accuracy
- user correction rate
- unnecessary tool count
- reroute success rate

## 14.2 Review metrikleri
- accepted findings rate
- blocker precision
- false positive rate
- re-review closure rate

## 14.3 Frontend metrikleri
- UI regression catch rate
- missing-state catch rate
- a11y issue catch rate
- visual consistency score trend

## 14.4 Monorepo metrikleri
- cold/warm latency
- delta invalidate speed
- explore symbol latency
- review preflight latency

## 14.5 Codex UX metrikleri
- time-to-first-accurate-action
- resume friction
- failed-session recovery time
- average verify completion rate

---

## 15) Non-Negotiable Product Principles

1. **Preview-first**
2. **Explain-why**
3. **Evidence-before-ship**
4. **Delta-first on large repos**
5. **Frontend tasks require UI evidence**
6. **Review is a first-class mode**
7. **Policy is explicit**
8. **Codex profiles are explainable**
9. **Human override always exists**
10. **Quick mode speed sağlarken kalite omurgasını kırmaz**

---

## 16) Bu Roadmap’in En Kritik Kararı

Eğer tek cümlede özetlemem gerekirse:

> Önce “daha fazla komut” eklememeliyiz.  
> Önce **Intent OS + Review OS + Frontend OS + Scale OS** inşa etmeliyiz.

Bunlar çözülmeden:
- doğal dil güvenilir olmaz
- code review differentiator olmaz
- frontend differentiator olmaz
- monorepo ölçeği gelmez
- Codex deneyimi tutarlı hale gelmez

---

## 17) Benim Önerdiğim Uygulama Sırası

Eğer bunu GPT-5.4 Extra High ile geliştiriyorsanız, en doğru sıra şu:

1. **Truth reset + fixtures**
2. **Capability registry**
3. **Intent OS v2**
4. **Codex profile engine**
5. **Code review mode v1**
6. **Frontend OS v1**
7. **Dashboard / product UI**
8. **Persistent index + Scale OS**
9. **Evidence graph + verify-work**
10. **Team runtime v2**
11. **Policy / approvals**
12. **ecosystem polish**

---

## 18) Son Söz

Bu repo’nun en büyük avantajı, temelin zaten atılmış olması.  
En büyük riski ise, mevcut surface varlığını “ürün tamamlandı” zannetmek.

Doğru hamle şudur:

- foundation’ı çöpe atmadan
- ama heuristik ve skeleton yüzeyleri dürüstçe kabul ederek
- ürünü 4 ana differentiator etrafında yeniden konumlandırmak:

### Nihai differentiator set

1. **Doğal dili güvenilir şekilde capability’ye çeviren Intent OS**
2. **Gerçek semantic code review üreten Review OS**
3. **Rakiplerden çok daha güçlü frontend audit ve design workflow üreten Frontend OS**
4. **Büyük monorepolarda gerçekten akışkan çalışan Scale OS**

Bu dört katmanı doğru kurarsak ürün sadece “workflow kit” değil,  
**Codex çağının development operating system’i** olabilir.