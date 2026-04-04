# codex-workflow-kit Roadmap

## 1. Belgenin Amacı

Bu belge, `codex-workflow-kit` ürünleşme yolculuğunu tek yerde toplayan ana uygulama planıdır.

Amaç:

- `codex-workflow-kit`i repo içine gömülen bir workflow kernel olmaktan çıkarıp kurulan, kullanılan, güven veren bir ürüne dönüştürmek
- mevcut güçlü omurgayı koruyarak yeni kullanıcı ergonomisini ciddi biçimde iyileştirmek
- refactor, CLI, skill, quick mode, orchestration, lifecycle ve performance işlerini tek bir sıraya bağlamak
- her faz için kapsam, dosya etkisi, test stratejisi, risk ve kabul kriterlerini görünür hale getirmek

Bu belge artık repo için canonical ürün planıdır. [`WORKFLOW_REDESIGN_PLAN.md`](./WORKFLOW_REDESIGN_PLAN.md) ise belirli workflow/control-plane tasarım kararlarını taşıyan yardımcı tasarım belgesi olarak kalır.

## 2. Kuzey Yıldızı

`codex-workflow-kit` şu kimliğe evrilmelidir:

- Codex içinde tek komutla kurulabilen
- günlük kullanımda kısa komutlarla yönetilebilen
- küçük işte hafif, büyük işte güçlü kalabilen
- markdown-canonical state omurgasını bozmayan
- checkpoint-first continuity garantisini kaybetmeyen
- güvenlik, audit ve resume deneyimiyle profesyonel hissettiren
- monorepo dahil büyük reposlarda da hızlı çalışan
- “starter kit” değil “repo-native workflow product” gibi algılanan

## 3. Hedef Farkı Kapatılacak Eksenler

Bu ürünleşme dalgası üç ana farkı kapatmayı hedefler:

### 3.1 OMX'ten alınacak güçlü taraf

- runtime ergonomisi
- kısa komut yüzeyi
- operator-friendly doctor/setup akışı
- install sonrası ilk 5 dakikada yön kaybettirmeyen UX

### 3.2 GSD'den alınacak güçlü taraf

- lifecycle genişliği
- small task ile long-running task arasında doğal geçiş
- review-ready ve ship-ready closeout yüzeyi
- hafif ama güvenli quick-mode deneyimi

### 3.3 Zaten güçlü olduğumuz taraf

- markdown-canonical state
- checkpoint-first continuity
- packet v5 ve section-level state loading
- plan gate ve evidence-first kapanış disiplini

Bu planın ana kuralı şudur:

`codex-workflow-kit`, OMX ve GSD’ye yaklaşırken kendi çekirdeğini zayıflatmayacak.

## 4. Ürün Tanımı

Ürünün hedef hali aşağıdaki yüzeyleri birlikte sunmalıdır:

### 4.1 Kurulum Yüzeyi

- `npx <package> setup`
- `cwf setup`
- `cwf init`
- `cwf doctor`
- `cwf uninstall`
- `cwf update`

### 4.2 Günlük Operasyon Yüzeyi

- `cwf hud`
- `cwf next`
- `cwf checkpoint`
- `cwf quick`
- `cwf team`
- `cwf review`
- `cwf ship`

### 4.3 Codex Skill Yüzeyi

- `$workflow-help`
- `$workflow-next`
- `$workflow-quick`
- `$workflow-checkpoint`
- `$workflow-team`
- `$workflow-review`
- `$workflow-ship`

### 4.4 Güven ve Audit Yüzeyi

- markdown canonical state
- explicit plan gate
- quick mode dahil tüm akışlarda artifact trail
- write-scope güvenliği
- orchestration state visibility
- release note ve session report yüzeyi

## 5. Değişmeyecek Temel İlkeler

Bu ürünleşme boyunca aşağıdaki guardrail'ler değişmez sözleşmedir:

- Markdown canonical state korunacak.
- Gizli SQLite veya opaque runtime state source-of-truth olmayacak.
- `npm run workflow:*` komutları en az iki release boyunca geriye dönük uyumluluk için kalacak.
- Quick mode tam milestone sistemini by-pass etmeyecek; yalnızca hafifletecek.
- Agent orchestration, disjoint write-scope garantisi olmadan write-capable paralellik açmayacak.
- `common.js` refactor'u davranış güvenliği oluşmadan erkene çekilmeyecek.
- CLI katmanı ilk aşamada mevcut çekirdeği saracak; çekirdeği baştan yazmayacak.
- Performans işi önce hot-path cache ve incremental index ile çözülecek; modüler refactor bunun arkasından gelecek.

### 5.1 Yeni Yüzeyler İçin Canonical State Kuralları

Yeni ürün yüzeyleri eklenirken her biri için “canonical markdown nerede, runtime cache nerede” ayrımı açıkça tanımlanmalıdır.

#### Full Workflow

- `docs/workflow/` veya aktif named workstream root altındaki markdown dosyaları canonical source-of-truth olmaya devam eder
- `.workflow/state.json` ve benzeri JSON çıktılar yalnızca hız, indeksleme veya compact/hud kolaylığı içindir

#### Quick Mode

- quick mode altında saklanan markdown artifact'lar canonical kabul edilir
- quick mode için JSON session dosyaları yalnızca resume cache veya index amacı taşır
- quick mode kapanışında özet ve verify izi markdown yüzeyde kalmadan task “done” sayılmaz

#### Team / Orchestration

- orchestration için markdown tabanlı en az bir görünür operator yüzeyi zorunludur
- önerilen canonical dosyalar: `.workflow/orchestration/PLAN.md`, `.workflow/orchestration/STATUS.md`, `.workflow/orchestration/RESULTS.md`, `.workflow/orchestration/WAVES.md`
- `.workflow/orchestration/state.json` gibi dosyalar yalnızca yürütme kolaylığı için tutulur; tek başına source-of-truth olamaz

#### Cache / Index / Perf Surfaces

- `.workflow/cache/*`, `.workflow/fs-index.json`, section hash cache ve packet snapshot cache canonical değildir
- bu dosyalar silinip yeniden üretilebilir olmalıdır
- cache dosyası kaybı workflow semantiğini bozmamalı, yalnızca performansı düşürmelidir

#### Merge Gate

Her yeni workflow surface merge edilmeden önce şu sorular belge içinde cevaplanmış olmalıdır:

- canonical markdown hangi dosyada
- runtime cache hangi dosyada
- resume için minimum okunacak yüzey hangisi
- silinirse yeniden üretilebilen dosyalar hangileri
- git’e girip girmemesi gereken dosyalar hangileri

## 6. Başarı Ölçütleri

### 6.1 Kullanıcı Deneyimi Ölçütleri

- yeni kullanıcı 5 dakika içinde kurulumu tamamlayıp ilk task'ı başlatabilmeli
- günlük kullanımda kullanıcı `npm run workflow:*` script adlarını bilmek zorunda olmamalı
- Codex içinde ilk görülen işler kısa alias'larla yapılabilmeli
- küçük işlerde quick mode, büyük işlerde full workflow doğal hissettirmeli

### 6.2 Ürün Güveni Ölçütleri

- repo kökü deneysel kit değil, güvenilir açık kaynak ürün hissi vermeli
- install, update, uninstall ve doctor akışları deterministik olmalı
- resume ve checkpoint deneyimi current baseline’dan daha güvenli ya da en az eşdeğer olmalı

### 6.3 Performans Ölçütleri

- `hud <300ms`
- `next <500ms`
- `doctor <1s`
- `health <1s`
- `map-codebase <2s`
- `map-frontend <2s`

Bu hedefler orta büyüklükte repo için CI benchmark ile ölçülmelidir.

### 6.4 Kalite ve Adoption Ölçütleri

- compatibility suite release branch üzerinde `100%` geçmeli
- yeni kullanıcı akışı için blank repo smoke senaryosu her release öncesi yeşil olmalı
- `cwf` yüzeyine açılan her yeni komutun help, doctor story ve migration note'u bulunmalı
- quick mode ve full workflow arasında geçiş yapan en az bir scenario testi bulunmalı
- orchestration yüzeyine açılan her write-capable komut overlap-safe guard testine sahip olmalı
- performans SLO’ları release öncesi en az `3` ardışık CI koşusunda geçmeli

## 7. Non-Goals

İlk büyük ürünleşme dalgasında aşağıdakiler öncelik olmayacak:

- workflow dışında ayrı bir hidden database control plane tasarlamak
- security, threads, backlog, workspace gibi çok geniş operator domain'lerine yayılmak
- GitHub entegrasyonunu ilk dalgada zorunlu hale getirmek
- tüm runtime’ı tek seferde yeniden yazmak
- ilk aşamada her repo tipi için kusursuz adapter yüzeyi açmak

## 8. Release Dalgaları

Ürünleşme çalışması dört dalga halinde yönetilmelidir:

### Dalga 1: Ürüne Geçiş

- `P0 + P1 + P2`
- hedef: kernel’den usable Codex product’a geçmek

### Dalga 2: Günlük Değer ve Lifecycle

- `P3 + P5`
- hedef: kısa işlerin ve kapanış yüzeylerinin günlük kullanıma oturması

### Dalga 3: Hız ve Ölçek

- `P6 + P7 + P8`
- hedef: monorepo ve hot-path performansını ürün seviyesine taşımak

### Dalga 4: Güven ve Adoption

- `P9`
- hedef: onboarding, docs ve release disiplini ile açık kaynak ürün olgunluğunu tamamlamak

### Dalga Geçiş Gate'leri

#### Dalga 1 -> Dalga 2

- `cwf` kabuğu çalışır durumda olmalı
- installer/update/uninstall smoke testleri yeşil olmalı
- skill alias yüzeyi belgelenmiş olmalı
- compatibility baseline stabil olmalı

#### Dalga 2 -> Dalga 3

- quick mode ile full mode arasında net escalation kuralı çalışıyor olmalı
- `review` ve `ship` yüzeyleri en az fixture düzeyinde doğrulanmış olmalı
- orchestration planı ürün sözleşmesine oturmuş olmalı

#### Dalga 3 -> Dalga 4

- hot-path SLO’ları ölçülür hale gelmiş ve hedefe yaklaşmış olmalı
- incremental repo index büyük repo senaryosunda gerçek kazanç üretmeli
- `common.js` facade refactor’u compatibility suite ile güvence altına alınmış olmalı

### Önerilen Release Train

- `Release A`
  - `P0 + P1 + P2`
  - ilk product shell release
- `Release B`
  - `P3 + P5`
  - günlük kullanım ve lifecycle release
- `Release C`
  - `P6 + P7 + P8`
  - performans ve maintainability release
- `Release D`
  - `P9`
  - docs, trust ve OSS polish release

## 9. Faz Bazlı Master Plan

## P0. Compatibility Baseline ve Ürünleşme Zemini

### Amaç

Mevcut workflow çekirdeğini bozmayacak bir compatibility baseline kurmak ve sonraki tüm değişiklikleri contract testleri ile güvence altına almak.

### Neden ilk iş bu

- CLI katmanı, skill alias’ları, cache ve modüler refactor davranış drift riski taşır
- mevcut çekirdeğin en büyük sermayesi davranış güvenidir
- baseline olmadan ürünleşme hızı kısa vadede artsa bile güven kaybı oluşur

### Kapsam

- mevcut behavior surface’leri için golden/contract testleri eklemek
- installer davranışını testlemek
- CLI alias yüzeyi için baseline tanımlamak
- performance baseline ölçüm altyapısının ilk sürümünü kurmak

### Çıktılar

- genişletilmiş golden snapshots
- contract test paketi
- installer baseline testleri
- CLI alias smoke testleri
- perf baseline harness

### Öncelikli Dosyalar

- `scripts/workflow/common.js`
- `scripts/workflow/install_common.js`
- `scripts/workflow/state_surface.js`
- `tests/workflow_phase*.test.js`
- `tests/golden/workflow/*`
- gerekirse `scripts/compare_golden_snapshots.ts`

### Backlog

- `P0-01` mevcut `45/45` test yüzeyini dökümante et ve baseline matrisi çıkar
- `P0-02` contract test kapsamını script bazında sınıflandır
- `P0-03` `common.js` kritik helper behavior’ları için golden veya fixture-level test ekle
- `P0-04` `install_common.js` için install/patch/idempotency fixture testleri ekle
- `P0-05` `state_surface.js` çıktıları için snapshot testleri ekle
- `P0-06` gelecekteki `cwf` alias’ları için old-to-new command equivalence baseline oluştur
- `P0-07` `hud`, `next`, `doctor`, `health`, `map-*` için ilk perf benchmark komutlarını sabitle
- `P0-08` test sonuçlarını “compatibility baseline” olarak belgede kaydet

### Test Stratejisi

- mevcut phase testleri korunacak
- yeni golden testler CLI çıktı formatı drift’ini yakalayacak
- installer fixture’ları blank repo ve already-installed repo için ayrı çalışacak
- perf baseline ilk aşamada sadece ölçüm yapacak, fail threshold sonraki fazda sıkılaştırılacak

### Riskler

- mevcut test seti behavior’ın tamamını temsil etmiyor olabilir
- golden snapshot’lar fazla kırılgan yazılırsa refactor hızını düşürebilir
- installer fixture senaryoları gerçek kullanıcı repo çeşitliliğini eksik yansıtabilir

### Risk Azaltma

- output biçimi yerine davranış sözleşmesi odaklı assertion’lar tercih edilecek
- her golden test için “neden önemli” notu tutulacak
- blank repo, existing repo ve dirty repo fixture’ları ayrıştırılacak

### Exit Criteria

- mevcut `45/45` test korunur
- installer, CLI alias ve perf baseline testleri eklenir
- P1 sonrası yapılacak wrapper katmanı için güvenli baseline oluşur

## P1. Gerçek Ürün Kabuğu ve Dağıtım Yüzeyi

### Amaç

`codex-workflow-kit`i script koleksiyonu olmaktan çıkarıp gerçek CLI giriş noktasına sahip bir ürün haline getirmek.

### Temel Ürün Kararı

Yeni kullanıcı `npm run workflow:*` bilmek zorunda kalmamalı. Esas yüzey:

- `cwf setup`
- `cwf init`
- `cwf doctor`
- `cwf hud`
- `cwf next`
- `cwf update`
- `cwf uninstall`

### Kapsam

- `package.json` içine gerçek `bin` entry eklemek
- `cwf` veya `codex-workflow` alias’ını ürün komutu olarak açmak
- setup/init/update/uninstall komutlarını CLI wrapper katmanında toplamak
- local/global install ve `npx` deneyimini netleştirmek

### Çıktılar

- CLI entrypoint
- subcommand router
- help çıktısı
- kurulum ve upgrade akışı
- uninstall temizliği
- doctor-first onboarding deneyimi

### Komut Sözleşmesi

#### `cwf setup`

- boş repo veya mevcut repo için bootstrap yapar
- workflow runtime yüzeyini kurar veya günceller
- package manager surface’ini patch eder
- kurulum sonunda doctor ve ilk next-step yönlendirmesi verir

#### `cwf init`

- aktif repo içinde workflow control plane’i başlatır
- mevcut kurulum varsa tekrar kurmak yerine init/migrate kararı verir
- named workstream veya default root oluşturma yolunu açıkça gösterir

#### `cwf doctor`

- install surface, script mapping, skill kurulum ve temel dosya bütünlüğünü kontrol eder
- error yanında önerilen fix komutunu da verir

#### `cwf hud`

- mevcut state’i kısa, güven veren, günlük kullanılabilir biçimde özetler
- yavaş veya kirli durumu da görünür kılar

#### `cwf next`

- mevcut milestone ya da quick session için bir sonraki güvenli aksiyonu önerir
- gerekiyorsa checkpoint, doctor veya plan gate ihtiyacını öne çıkarır

#### `cwf update`

- güvenli migrate akışıdır
- user-authored markdown’ı koruyarak şema, template ve script refresh yapar
- upgrade sonrası değişen davranışı kısa changelog olarak özetler

#### `cwf uninstall`

- varsayılan olarak güvenli modda çalışır
- yalnızca ürünün kurduğu runtime yüzeyini kaldırır
- user-authored milestone history ve canonical docs için explicit purge bayrağı olmadan yıkıcı temizlik yapmaz

### CLI Standartları

- her subcommand `--help` desteklemeli
- destructive veya geniş etkili komutlar `--dry-run` desteğine sahip olmalı
- insan-okunur çıktı varsayılan, `--json` ise mümkün olan yüzeylerde desteklenmeli
- exit code sözleşmesi tutarlı olmalı
- help metni önce intent, sonra örnek komut göstermeli

### Öncelikli Dosyalar

- `package.json`
- yeni `bin/` veya `scripts/cli/` yüzeyi
- `scripts/workflow/init.js`
- `scripts/workflow/install_common.js`
- `scripts/workflow/doctor.js`
- `README.md`
- `skill/README.md`

### Backlog

- `P1-01` CLI surface naming kararını dondur: `cwf` primary alias, `codex-workflow` secondary alias
- `P1-02` `package.json` içine `bin` entry ekle
- `P1-03` argument router ve subcommand dispatch katmanını yaz
- `P1-04` `cwf setup` komutunu installer ile bağla
- `P1-05` `cwf init` komutunu mevcut workflow init akışına bağla
- `P1-06` `cwf doctor`, `cwf hud`, `cwf next` komutlarını mevcut runtime script’lere map et
- `P1-07` `cwf update` için migration ve runtime refresh davranışını tanımla
- `P1-08` `cwf uninstall` için geri alma ve cleanup davranışını tanımla
- `P1-09` global install, local install ve `npx` kullanım metinlerini yaz
- `P1-10` backward compatibility matrix oluştur: her yeni komutun eski `workflow:*` karşılığı belgelenmiş olsun

### UX Kararları

- ilk aşamada CLI yalnızca wrapper olacak
- mevcut script adları içeride korunacak
- help çıktısı niyet merkezli olacak
- subcommand isimleri kısa ve günlük kullanıma uygun olacak

### Test Stratejisi

- CLI parser testleri
- command equivalence smoke testleri
- blank repo setup fixture
- existing repo upgrade fixture
- uninstall idempotency testi
- help output snapshot testi

### Riskler

- wrapper katmanı ile eski scriptlerin davranışı ayrışabilir
- setup ve init ayrımı kullanıcıyı şaşırtabilir
- uninstall beklenenden daha fazla dosyaya dokunursa güven kaybı yaratır

### Risk Azaltma

- P0 contract suite her subcommand mapping için çalıştırılacak
- uninstall sadece workflow yüzeyine dokunacak şekilde sınırlanacak
- CLI help içine old-to-new eşlemeyi görünür eklemek değerlendirilecek

### Exit Criteria

- yeni kullanıcı `npx ... setup` ile kurulumu başlatabilir
- repo içinde `cwf init` sonrası script adı ezberlemeden ilerleyebilir
- `npm run workflow:*` komutları çalışmaya devam eder

## P2. Codex-Native Komut Yüzeyi ve Skill Deneyimi

### Amaç

Skill deneyimini uzun sözleşme belgesi olmaktan çıkarıp ilk 5 dakikada öğrenilen kısa komut yüzeyine dönüştürmek.

### Temel Ürün Kararı

Teknik fiil değil niyet merkezli alias’lar öne çıkacak.

Önerilen alias ailesi:

- `$workflow-help`
- `$workflow-next`
- `$workflow-quick`
- `$workflow-checkpoint`
- `$workflow-team`
- `$workflow-review`
- `$workflow-ship`

### Kapsam

- `skill/SKILL.md` içinde kısa günlük komut yüzeyi tanımlamak
- mevcut `workflow:control` altyapısını user-facing dil ile rafine etmek
- alias komutları ile CLI yüzeyi arasında net eşleme kurmak
- first-session UX metinlerini kısaltmak

### Çıktılar

- skill quick reference
- command intent mapping tablosu
- Codex-friendly startup pattern
- daily loop docs

### Öncelikli Dosyalar

- `skill/SKILL.md`
- `skill/README.md`
- `README.md`
- `scripts/workflow/control.js`
- `scripts/workflow/next_step.js`
- `scripts/workflow/checkpoint.js`
- gerekirse yeni kısa komut helper dosyaları

### Backlog

- `P2-01` skill içindeki “first 60 seconds” akışını kısa komut yüzeyiyle yeniden yaz
- `P2-02` short alias -> CLI command -> underlying script eşleme tablosu oluştur
- `P2-03` `$workflow-help` için hızlı onboarding yüzeyi yaz
- `P2-04` `$workflow-next` ve `$workflow-checkpoint` davranışlarını netleştir
- `P2-05` `$workflow-team` alias’ını delegation plan runtime’ına bağlayan language contract yaz
- `P2-06` `$workflow-review` ve `$workflow-ship` için placeholder contract’ı P5’e hazırlanacak şekilde tanımla
- `P2-07` `workflow:control` intent çözümleyicisinin user-facing resolution cümlelerini rafine et
- `P2-08` günlük kullanım rehberini “tek ekranda öğrenilebilir” hale getir

### Alias Sözleşmesi

#### `$workflow-help`

- aktif yüzeyi, kısa komutları ve ne zaman quick/full/team kullanılacağını gösterir

#### `$workflow-next`

- mevcut state’e göre tek cümlelik sonraki güvenli hareketi öne çıkarır

#### `$workflow-quick`

- küçük işlerde quick mode başlatır veya mevcut quick session’ı sürdürür
- riskli veya büyük işte gerekirse full workflow’a yönlendirir

#### `$workflow-checkpoint`

- compact, handoff veya phase boundary öncesi taze checkpoint üretir

#### `$workflow-team`

- parallel/team/orchestration yüzeyini niyet merkezli biçimde açar
- safety gate varsa bunu görünür söyleyerek ilerler

#### `$workflow-review`

- review-ready closeout paketini üretir veya eksiklerini söyler

#### `$workflow-ship`

- ship-ready package üretir veya eksik closeout alanlarını gösterir

Bu alias’ların hiçbiri safety gate’i gizlice by-pass etmez; her biri altında açık bir CLI veya workflow command mapping’i bulunur.

### UX İlkeleri

- teknik fiil yerine niyet konuşulsun
- kısa komut adı, altında açık eşleme olsun
- ilk 5 dakikada görülen işler tek bakışta anlaşılmalı
- skill belgesi hem sözleşme hem hızlı kullanım kılavuzu rolünü taşımalı

### Test Stratejisi

- skill doc lint veya snapshot testi
- alias resolution ve suggested command snapshot testleri
- help output ve short command examples için golden testler

### Riskler

- skill çok kısa yazılırsa güvenlik kuralları görünmez olabilir
- alias sayısı artarsa öğrenme yükü yine büyüyebilir

### Risk Azaltma

- “quick commands” ve “full contract” bölümlerini ayır
- günlük yüzey ile derin sözleşmeyi aynı belgede ama farklı katmanda sun

### Exit Criteria

- “Codex aç ve kullan” deneyiminde ilk 5 dakikadaki işler kısa alias’larla yapılabilir
- skill belgesi niyet merkezli ve günlük kullanım dostu hale gelir

## P3. Quick Mode

### Amaç

15-60 dakikalık işler için full milestone ritüelini hafifletmek ama güvenlik omurgasını korumak.

### Temel Ürün Kararı

Yeni yüzey:

- `workflow:quick`
- veya `workflow:fast`
- tercihen CLI tarafında `cwf quick`

### Kapsam

- `.workflow/quick/` altında minimal artifact set tasarlamak
- mini plan, verify, handoff ve audit izi tutmak
- full workflow ile aynı plan omurgasına uyumlu kalmak

### Çıktılar

- quick artifact şeması
- quick init / quick resume yüzeyi
- quick verify sözleşmesi
- quick-to-full escalation kuralı

### Önerilen Artifact Set

- `.workflow/quick/context.md`
- `.workflow/quick/plan.md`
- `.workflow/quick/verify.md`
- `.workflow/quick/handoff.md`
- `.workflow/quick/session.json` veya benzeri yalnızca cache amaçlı runtime dosyası

### Quick Mode Kullanım Heuristiği

Quick mode aşağıdaki durumlarda tercih edilmelidir:

- tahmini iş süresi `15-60` dakika ise
- tek kullanıcı tarafından yürütülecekse
- dar bir kod yüzeyi etkileniyorsa
- full milestone overhead’i değerden büyük görünüyorsa

Quick mode aşağıdaki durumlarda tercih edilmemelidir:

- birden fazla dalga veya geniş entegrasyon gerekiyorsa
- multi-session koordinasyon ihtimali yüksekse
- riskli migration, schema değişimi veya production closeout bekleniyorsa
- paralel worker ihtiyacı varsa

### Canonical State ve Saklama Kuralları

- `.workflow/quick/*.md` altındaki markdown belgeleri quick session’ın canonical izi sayılır
- `.workflow/quick/session.json` yalnızca hız ve resume kolaylığı sağlar
- quick session kapanışında en az `scope`, `plan`, `verify`, `handoff/summary` alanları markdown olarak kalmalıdır
- quick session full milestone’a terfi ederse özet, kalan işler ve verify contract full workflow root’una taşınır

### Backlog

- `P3-01` quick mode tasarım kontratını yaz
- `P3-02` quick artifact set ve klasör yapısını belirle
- `P3-03` quick init, quick status, quick closeout akışlarını yaz
- `P3-04` full workflow ile escalation yolu tanımla
- `P3-05` quick mode için minimum done checklist yaz
- `P3-06` skill ve CLI yüzeyine `quick` komutunu ekle
- `P3-07` small-task acceptance testleri yaz

### Kurallar

- quick mode plan gate'i tamamen atlamaz
- quick mode minimum verify contract üretir
- quick handoff, next action ve touched scope bilgisini tutar
- quick task büyürse full milestone’a terfi edebilir

### Test Stratejisi

- 15-60 dakikalık task fixture testleri
- quick init -> execute -> verify -> handoff -> resume senaryosu
- quick-to-full escalation testi

### Riskler

- quick mode “workflow’süz workflow” gibi algılanabilir
- artifact set fazla küçülürse audit izi zayıflar

### Exit Criteria

- küçük iş tam milestone açmadan güvenli plan/checkpoint/audit yolundan geçebilir

## P4. Delegation Plan'dan Gerçek Orchestration'a Geçiş

### Amaç

Mevcut planner’ı gerçek Codex orchestration katmanına dönüştürmek.

### Temel Ürün Kararı

Delegation artık yalnızca plan önerisi değil, güvenli çalışma runtime’ı olacak.

### Kapsam

- task packet’leri gerçek agent ownership brief’lerine dönüştürmek
- rol, write-scope, wave, dependency ve integration sırasını kalıcı halde tutmak
- orchestration state yüzeyi eklemek

### Yeni Komutlar

- `workflow:team`
- `workflow:team-status`
- `workflow:team-resume`
- `workflow:team-stop`
- CLI tarafında `cwf team ...`

### Çıktılar

- orchestration state modeli
- safe fan-out/fan-in döngüsü
- task packet formatı
- agent ownership brief şablonu
- integration order kuralları

### Canonical Orchestration Artifacts

- `.workflow/orchestration/PLAN.md`
  - wave planı, owner atamaları, write scope, dependency tablosu
- `.workflow/orchestration/STATUS.md`
  - aktif wave, çalışan task’lar, blocker’lar, next integrate action
- `.workflow/orchestration/RESULTS.md`
  - task sonuçları, evidence refs, unresolved items, retry kararları
- `.workflow/orchestration/WAVES.md`
  - dalga sırası, geçiş koşulları ve integration sırası
- `.workflow/orchestration/state.json`
  - cache/resume metadata, canonical olmayan runtime yardımcı yüzeyi

### Orchestration Safety Kuralları

- write-capable wave başlatılmadan önce overlap validator temiz olmalı
- owner belirtilmemiş task çalıştırılmamalı
- task packet, start anından sonra versiyonlanmadan sessizce değişmemeli
- integration yalnızca orchestrator/main agent tarafından finalize edilmeli
- blocked veya failed task, evidence ve next action kaydı olmadan kapanmamalı

### Öncelikli Dosyalar

- `scripts/workflow/delegation_plan.js`
- `.workflow/orchestration/*`
- `scripts/workflow/common.js`
- gerekirse yeni `team_*.js` entrypoint’leri

### Backlog

- `P4-01` orchestration state schema’sını dondur
- `P4-02` delegation plan output’unu execution-ready task packet haline getir
- `P4-03` task ownership brief formatını tasarla
- `P4-04` start/status/resume/stop yüzeyini ekle
- `P4-05` disjoint write-scope validator’ını sıkılaştır
- `P4-06` wave complete -> integrate -> advance döngüsünü state machine olarak yaz
- `P4-07` blocked/failed task recovery akışını tanımla
- `P4-08` orchestration audit trail ve evidence kaydını ekle

### Test Stratejisi

- wave lifecycle integration testleri
- overlapping write-scope rejection testleri
- paused orchestration resume testleri
- blocked task escalation testleri

### Riskler

- gerçek orchestration runtime’ı state karmaşıklığını artırır
- parallelism yanlış açılırsa temel güven vaadi zedelenir

### Exit Criteria

- kullanıcı tek komutla güvenli paralel çalışma başlatabilir
- aynı dosyaya çakışan worker spawn edilmez

## P5. Lifecycle Genişletme

### Amaç

Milestone kapanışını “done” seviyesinden “review-ready” ve “ship-ready” seviyesine çıkarmak.

### Kapsam

- review, ship, PR brief, release notes, session report ve update yüzeylerini eklemek
- GitHub entegrasyonunu opsiyonel tutmak ama üretim çıktısını standartlaştırmak

### Yeni Komutlar

- `workflow:review`
- `workflow:ship`
- `workflow:pr-brief`
- `workflow:release-notes`
- `workflow:session-report`
- `workflow:update`

### Çıktılar

- operator closeout surfaces
- review checklist üretimi
- PR body taslağı
- release summary taslağı
- session report özeti

### Üretilecek Çıkış Paketleri

#### Review Paketi

- milestone özeti
- scope ve touched files özeti
- verify çıktıları
- residual risks
- reviewer checklist

#### Ship Paketi

- PR body taslağı
- release notes özeti
- migration note
- rollback note
- deploy veya handoff öncesi son kontrol listesi

#### Session Report

- bu oturumda ne yapıldı
- ne kaldı
- nerede devam edilecek
- hangi riskler açık
- hangi verify adımları çalıştı veya bekliyor

### Öncelikli Dosyalar

- yeni lifecycle script entrypoint’leri
- `templates/workflow/VALIDATION.md`
- `templates/workflow/HANDOFF.md`
- `templates/workflow/RETRO.md`
- `README.md`
- `skill/SKILL.md`

### Backlog

- `P5-01` review-ready contract’ı tanımla
- `P5-02` ship-ready contract’ı tanımla
- `P5-03` PR brief output formatını yaz
- `P5-04` release notes üretim şablonunu ekle
- `P5-05` session report yüzeyini tasarla
- `P5-06` lifecycle komutlarını CLI ve skill alias yüzeyine bağla
- `P5-07` closeout acceptance testlerini ekle

### Test Stratejisi

- milestone closeout senaryoları
- review output snapshot testleri
- ship checklist testleri
- release notes golden testleri

### Exit Criteria

- milestone yalnızca “done” değil, “review-ready” ve “ship-ready” kapatılabilir

## P6. Hot-Path Cache Dalgası

### Amaç

En kritik darboğazları invocation-scope memoization ile düşürmek.

### Kritik Noktalar

- `scripts/workflow/common.js` line 2152
- `scripts/workflow/common.js` line 2404
- `scripts/workflow/map_codebase.js` line 793
- `scripts/workflow/map_frontend.js` line 509

### Kapsam

- file read cache
- parsed markdown section cache
- packet snapshot cache
- token estimate cache
- repo file list cache
- `package.json` parse cache
- git status cache
- ortak precomputed runtime bundle

### Çıktılar

- invocation-scope cache layer
- perf metrics hooks
- shared runtime bundle for `doctor`, `health`, `hud`, `next`, `state_surface`, `workstreams`

### Benchmark Yöntemi

- ölçümler cold ve warm run olarak ayrı tutulmalı
- her komut en az `5` kez koşturulup median değer raporlanmalı
- küçük repo, orta repo ve monorepo fixture’ları ayrı benchmark grubuna sahip olmalı
- wall-clock süre yanında okunan dosya sayısı ve cache hit oranı da raporlanmalı
- threshold’lar ilk ölçümde değil, baseline stabil olduktan sonra fail gate haline getirilmeli

### Backlog

- `P6-01` hot-path ölçümlerini profiler veya benchmark ile doğrula
- `P6-02` invocation-scope cache abstraction’ını ekle
- `P6-03` file read ve parsed markdown cache’ini uygula
- `P6-04` packet snapshot ve token estimate cache’ini ekle
- `P6-05` repo file list ve git status cache’ini ekle
- `P6-06` shared runtime bundle builder yaz
- `P6-07` perf benchmark CI threshold’larını etkinleştir

### Test Stratejisi

- perf regression benchmark’ları
- cache hit/miss unit testleri
- unchanged input için duplicate work yapılmadığını doğrulayan testler

### Riskler

- cache invalidation bug’ları stale state üretebilir
- perf kazanımı davranış değişikliği pahasına gelmemeli

### Exit Criteria

- `hud <300ms`
- `next <500ms`
- `doctor/health <1s`
- `map-* <2s`

## P7. Artımlı Repo Index ve Büyük Repo Optimizasyonu

### Amaç

Büyük repo ve monorepo senaryosunda full-scan davranışını kırmak.

### Kapsam

- `.workflow/fs-index.json` veya `.workflow/cache/fs-index.json`
- mtime, size, short hash, git diff, ignore rules takibi
- `map_codebase` ve `map_frontend` için incremental scan
- section hash tabanlı disk cache

### Çıktılar

- repo index builder
- incremental refresh policy
- section-hash disk cache

### Backlog

- `P7-01` fs-index schema tasarla
- `P7-02` index build ve refresh kararlarını yaz
- `P7-03` `map_codebase` incremental mode ekle
- `P7-04` `map_frontend` incremental mode ekle
- `P7-05` packet snapshot için disk-backed section hash cache ekle
- `P7-06` monorepo benchmark senaryolarını CI’a ekle

### Test Stratejisi

- unchanged repo incremental speed testi
- changed subset refresh testi
- ignore rules doğruluk testi
- large repo fixture benchmark testi

### Exit Criteria

- büyük monorepo’da her komutta tam repo tarama davranışı ortadan kalkar

## P8. `common.js` Modüler Çekirdeğe Bölünmesi

### Amaç

Davranış değişmeden bakım ve test edilebilirlik kazanmak.

### Temel Ürün Kararı

Bu faz, cache ve benchmark güvenliği geldikten sonra yapılacak. Erken yapılmayacak.

### Hedef Modüller

- `io/files.js`
- `markdown/sections.js`
- `packet/build.js`
- `packet/cache.js`
- `window/budget.js`
- `workflow/control.js`
- `workflow/checkpoint.js`
- `workflow/state.js`
- `git/isolation.js`
- `perf/metrics.js`

### Kapsam

- `common.js` facade olarak kalacak
- dış API kırılmayacak
- hot-path hesaplamaları modül bazında izole edilecek

### Backlog

- `P8-01` `common.js` responsibility map çıkar
- `P8-02` modül taşıma sırasını belirle
- `P8-03` facade ve adapter layer kur
- `P8-04` file I/O ve markdown helpers’ı ayır
- `P8-05` packet ve cache logic’ini ayır
- `P8-06` workflow control/state logic’ini ayır
- `P8-07` git isolation ve perf metric logic’ini ayır
- `P8-08` her modül için ayrı test dosyası ekle

### Test Stratejisi

- contract suite tam çalışacak
- modül bazlı unit testler eklenecek
- facade üzerinden backwards compatibility testleri korunacak

### Exit Criteria

- davranış değişmeden modüler çekirdek elde edilir
- her modülün kendi test dosyası vardır

## P9. Güven, Dokümantasyon ve Release Disiplini

### Amaç

Repo’nun ilk bakışta deneysel araç değil, güvenilir ürün gibi görünmesini sağlamak.

### Yeni Belgeler

- `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `DEMO.md`
- `docs/getting-started.md`
- `docs/commands.md`
- `docs/architecture.md`
- `docs/performance.md`

### README Hedefi

`README.md` artık “starter kit açıklaması” değil şu soruların cevabı olmalı:

- bu ürün neden var
- kim için
- 5 dakikada nasıl başlarım
- günlük akış nasıl
- quick mode ne zaman, full workflow ne zaman
- güven ve audit omurgası ne

### Backlog

- `P9-01` lisans ve katkı belgelerini ekle
- `P9-02` changelog sürecini tanımla
- `P9-03` demo akışını belgeye dök
- `P9-04` getting started rehberi yaz
- `P9-05` commands reference yaz
- `P9-06` architecture belgesi yaz
- `P9-07` performance ve SLO belgesi yaz
- `P9-08` README’yi ürün odaklı baştan yapılandır

### Test ve Quality Gate

- docs lint
- README command accuracy review
- install path smoke verification

### Exit Criteria

- repo kökü açık kaynak ürün güveni verir
- onboarding ve operator surfaces net, kısa ve örnekli görünür

## 10. Fazlar Arası Bağımlılık Haritası

- `P0`, tüm diğer fazların ön koşuludur
- `P1`, `P2` için gerekli ürün kabuğunu sağlar
- `P2`, `P3` ve `P5` için user-facing dil zeminini hazırlar
- `P3`, lifecycle genişlemesinin küçük task yüzeyini açar
- `P4`, orchestration ürünü için kritik bağımlılıktır ama ilk release dalgasına alınmak zorunda değildir
- `P5`, `P2` alias’larının tam değer üretmesini sağlar
- `P6` ve `P7`, `P8` öncesi güvenli performans zeminidir
- `P9`, önceki fazların ürün güvenini paketler

## 11. Sprint Bazlı Uygulama Planı

### Hafta 1

- contract/golden testleri
- installer baseline
- CLI kabuk tasarımı

### Hafta 2

- `cwf` CLI
- global/local setup
- uninstall/update
- ilk-run doctor

### Hafta 3

- Codex skill alias’ları
- kısa komut UX’i

### Hafta 4

- quick mode artifact modeli
- quick mode testleri

### Hafta 5-6

- gerçek team/orchestration akışı

### Hafta 7

- review/ship/operator surfaces

### Hafta 8-9

- cache
- fs-index
- benchmark CI
- hot-path SLO

### Hafta 10

- `common.js` modüler refactor
- release docs

## 12. İlk Release Dalgası İçin Epic Yapısı

İlk release dalgası doğrudan aşağıdaki epikler halinde planlanmalıdır:

### Epic A: Compatibility Baseline

- sahibi: core runtime
- faz: `P0`
- çıktı: golden/contract/perf baseline

### Epic B: CLI Product Shell

- sahibi: install + runtime UX
- faz: `P1`
- çıktı: `cwf` komut yüzeyi

### Epic C: Codex-Native Skill Experience

- sahibi: skill + docs UX
- faz: `P2`
- çıktı: kısa komutlar, alias yüzeyi, onboarding kısalığı

Bu üç epic birlikte ilk kullanılabilir ürün dalgasını oluşturur.

## 12A. İlk Release Dalgasının Kritik Yolu

İlk release dalgası için önerilen uygulama sırası aşağıdaki gibi olmalıdır:

### Slice 1: Test Freeze

- compatibility baseline en başta dondurulur
- golden snapshot ve fixture altyapısı genişletilir
- mevcut davranış için “korunacak yüzey” listesi yazılır

### Slice 2: CLI Skeleton

- `bin` entry
- subcommand router
- help ve exit-code sözleşmesi

### Slice 3: Setup / Init / Update / Uninstall

- installer wrapper
- safe uninstall
- migrate/update flow
- blank repo ve existing repo smoke senaryoları

### Slice 4: Günlük Operasyon Komutları

- `cwf doctor`
- `cwf hud`
- `cwf next`
- command equivalence testleri

### Slice 5: Skill Alias ve Codex UX

- `$workflow-help`
- `$workflow-next`
- `$workflow-checkpoint`
- kısa kullanım tablosu

### Slice 6: Release Hardening

- README ve getting-started yüzeyi
- first-run demo akışı
- final smoke verification

## 13. Backward Compatibility Planı

En az iki release boyunca aşağıdaki eski yüzeyler korunacaktır:

- `npm run workflow:init`
- `npm run workflow:migrate`
- `npm run workflow:hud`
- `npm run workflow:next`
- `npm run workflow:doctor`
- `npm run workflow:health`
- diğer tüm `workflow:*` scriptleri

Yeni yüzey eski yüzeyi sarar; eski yüzey yeni yüzeyin içine gömülmez. Bu ayrım önemlidir çünkü compatibility yönü hep içeriye doğru korunmalıdır.

## 14. Komut Eşleme Politikası

### Kurulum ve Yönetim

- `cwf setup` -> installer bootstrap
- `cwf init` -> workflow init
- `cwf update` -> migrate + runtime refresh
- `cwf uninstall` -> workflow cleanup

### Günlük Kullanım

- `cwf hud` -> `workflow:hud`
- `cwf next` -> `workflow:next`
- `cwf doctor` -> `workflow:doctor`
- `cwf checkpoint` -> `workflow:checkpoint`
- `cwf quick` -> yeni quick runtime
- `cwf team` -> delegation/orchestration runtime

### Closeout

- `cwf review` -> `workflow:review`
- `cwf ship` -> `workflow:ship`

## 15. Test Matrisi

Her faz aşağıdaki test katmanlarından en az birini genişletmelidir:

### Unit

- parser davranışları
- helper logic
- cache invalidation logic
- index freshness logic

### Integration

- CLI subcommand dispatch
- install/update/uninstall lifecycle
- quick mode lifecycle
- orchestration wave lifecycle

### Golden

- help output
- compact HUD
- state surface
- review/release notes gibi metinsel yüzeyler

### Scenario

- blank repo onboarding
- existing repo migration
- quick task flow
- full milestone flow
- team orchestration flow

### Performance

- hot-path benchmark
- large repo benchmark
- incremental refresh benchmark

## 15A. Migration, Versioning ve Rollback Politikası

### Versioning Prensibi

- additive user-facing surfaces minor release ile gelebilir
- compatibility kıran veya migration gerektiren değişiklikler major-level ciddiyetle ele alınmalıdır
- deprecation duyurusu en az iki release boyunca görünür kalmalıdır

### Schema ve Template Versiyonlama

- workflow templates veya runtime surface için görünür bir version marker eklenmelidir
- `cwf update` bu marker üzerinden migrate gerekip gerekmediğini anlamalıdır
- marker canonical markdown veya görünür runtime surface içinde bulunmalı; gizli bir source-of-truth olmamalıdır

### Migration Politikası

- upgrade sırasında user-authored markdown korunur
- eksik section ekleme güvenli default olmalıdır
- overwrite gerektiren davranışlar explicit onay veya açık flag istemelidir
- migration sonunda ne değiştiği özetlenmelidir

### Rollback Politikası

- migrate öncesi etkilenecek kritik dosyalar için backup veya diff özeti oluşturulmalıdır
- rollback story docs seviyesinde yazılı olmalıdır
- uninstall ve update komutları geri dönüşsüz hissettirmemelidir

### Compatibility Penceresi

- eski `workflow:*` script yüzeyi en az iki release korunur
- alias değişirse eski alias aynı süre boyunca warning ile yaşamaya devam eder
- breaking değişiklikler changelog ve getting-started belgelerinde açıkça işaretlenir

## 16. Risk Kaydı

### Risk 1: Ürünleşme sırasında çekirdek drift

- etki: yüksek
- olasılık: orta
- azaltma: `P0` contract suite ve eski komutların korunması

### Risk 2: CLI yüzeyi ile script yüzeyi ayrışması

- etki: yüksek
- olasılık: orta
- azaltma: subcommand equivalence testleri ve tek mapping tablosu

### Risk 3: Quick mode’un disiplini sulandırması

- etki: yüksek
- olasılık: orta
- azaltma: minimum artifact contract ve escalation kuralı

### Risk 4: Paralel orchestration’da write-scope çakışması

- etki: çok yüksek
- olasılık: orta
- azaltma: strict overlap validator ve explicit ownership brief

### Risk 5: Cache invalidation ve stale output

- etki: yüksek
- olasılık: orta-yüksek
- azaltma: freshness metadata, hash-based invalidation ve scenario testleri

### Risk 6: Modüler refactor’un erken yapılması

- etki: yüksek
- olasılık: orta
- azaltma: `P8`’i cache sonrası konumlandırmak

### Risk 7: Dokümantasyonun ürün gerçekliğiyle drift etmesi

- etki: orta
- olasılık: orta
- azaltma: docs review checklist ve release gate’e command accuracy kontrolü eklemek

## 17. Operasyonel Kararlar

### Karar 1

İlk kullanıcı deneyimi “install -> doctor -> init -> next” akışına dayanmalı.

### Karar 2

İlk release dalgasında CLI wrapper katmanı kurulacak; çekirdek behavior agresif biçimde yeniden yazılmayacak.

### Karar 3

Quick mode ve full workflow aynı marka altında sunulacak; ayrı ürünler gibi davranmayacak.

### Karar 4

Team/orchestration gerçek runtime olacaksa state ve safety görünür olmak zorunda.

### Karar 5

Performans işi refactor’dan önce kullanıcıya hissedilen hız kazancı üretmeli.

## 18. Done Tanımı

Her epic veya issue aşağıdaki sorulara cevap vermeden “done” sayılmamalı:

- user-facing davranış net mi
- eski sözleşmeye uyum kanıtlandı mı
- test eklendi mi
- docs güncellendi mi
- residual risk yazıldı mı
- benchmark veya smoke verification yapıldı mı

## 19. Önerilen Issue Şablonu

Her implementasyon işi aşağıdaki alanlarla açılmalıdır:

- Problem
- User-facing outcome
- Scope
- Out of scope
- Files to touch
- Tests to add
- Risks
- Acceptance criteria
- Migration or compatibility note

## 19A. Açık Sorular ve Karara Bağlanacak Noktalar

Bu planın uygulamaya başlamadan önce dondurması gereken bazı kararlar vardır:

- npm package adı ve publish scope ne olacak
- primary kullanıcı komutu kesin olarak `cwf` mi, yoksa çift komut mu desteklenecek
- quick canonical path kesin olarak `.workflow/quick/` mı olacak, yoksa `docs/workflow/quick/` alternatifi mi açılacak
- orchestration için canonical markdown seti tam olarak hangi dosyalardan oluşacak
- `cwf uninstall` varsayılan güvenli mod ve explicit purge modu nasıl ayrılacak
- `cwf setup` current repo default mu olacak, yoksa `--target` gerektiren bir model mi seçilecek
- hangi generated dosyalar default olarak commit edilir, hangileri `.gitignore` altında kalır
- version marker hangi dosyada tutulacak

Bu sorular implementation öncesi netleşirse issue backlog daha az churn ile ilerler.

## 20. Bir Sonraki Operasyonel Adım

Bu master planın doğal devamı şudur:

- `P0/P1/P2` için ayrı epic backlog dosyaları açmak
- her epic altında issue listesi, dosya listesi, test listesi ve risk listesini çıkarmak
- ilk release dalgası için acceptance checklist ve milestone board oluşturmak

Bu belge stratejik ve uygulamaya dönük ana plan olarak kalmalı; issue-level ayrıştırma bunun üzerine kurulmalıdır.
