
const { normalizeWorkflowControlUtterance } = require('./common');

const LANGUAGE_MARKERS = Object.freeze({
  en: [
    'review', 'code review', 'plan', 'implement', 'fix', 'frontend', 'verify', 'release', 'parallel', 'monorepo',
    'look into', 'take a look', 'go over', 'put together', 'map out', 'double-check', 'smoke test', 'get this out',
  ],
  tr: [
    'incele', 'inceleme', 'arastir', 'araştır', 'gozden gecir', 'gözden geçir', 'duzelt', 'düzelt',
    'uygula', 'dogrula', 'doğrula', 'yayinla', 'yayınla', 'paralel', 'cok paketli', 'çok paketli',
    'analiz', 'degerlendirme', 'değerlendirme', 'degerlendirmesi', 'değerlendirmesi', 'incelemesi',
    'urun degerlendirmesi', 'ürün değerlendirmesi',
    'bir bak', 'goz at', 'göz at', 'elden gecir', 'elden geçir', 'hazirla', 'hazırla',
    'yol haritasini cikar', 'yol haritasını çıkar', 'kontrol et', 'test et',
    'yayina al', 'yayına al', 'parcalara bol', 'parçalara böl', 'paketlere dagit', 'paketlere dağıt',
    'acikla', 'açıkla', 'kok neden', 'kök neden', 'previewu smoke et', 'previewü smoke et',
    'ekran goruntusu al', 'ekran görüntüsü al',
  ],
  es: [
    'revisa', 'revision', 'revisión', 'corrige', 'implementa', 'planifica', 'interfaz', 'frontend', 'verifica',
    'lanzar', 'publica', 'paralelo', 'monorepo',
  ],
  pt: [
    'revisao', 'revisão', 'revisar', 'corrige', 'implemente', 'planeje', 'frontend', 'verifique',
    'publique', 'paralelo', 'monorepo',
  ],
  fr: [
    'revue de code', 'revue', 'corrige', 'implementer', 'planifier', 'interface', 'frontend',
    'verifier', 'vérifier', 'livrer', 'parallele', 'parallèle', 'monorepo',
  ],
  de: [
    'prufe', 'prüfe', 'code review', 'behebe', 'implementiere', 'plane', 'frontend', 'verifiziere',
    'release', 'parallel', 'monorepo',
  ],
  it: [
    'revisione', 'correggi', 'implementa', 'pianifica', 'frontend', 'verifica', 'rilascia', 'parallelo', 'monorepo',
  ],
  nl: [
    'review', 'controleer', 'repareer', 'implementeer', 'plan', 'frontend', 'verifieer', 'release', 'parallel', 'monorepo',
  ],
  ru: [
    'ревью', 'проверь', 'исправь', 'реализуй', 'план', 'фронтенд', 'проверка', 'релиз', 'параллельно', 'монорепо',
  ],
  ar: [
    'مراجعة', 'راجع', 'اصلح', 'أصلح', 'نفذ', 'خطة', 'واجهة', 'تحقق', 'إصدار', 'متوازي', 'مونوريبو',
  ],
  hi: [
    'समीक्षा', 'ठीक', 'लागू', 'योजना', 'फ्रंटएंड', 'सत्यापित', 'रिलीज', 'समानांतर', 'मोनोरेपो',
  ],
  zh: [
    '审查', '代码审查', '修复', '实现', '规划', '前端', '验证', '发布', '并行', 'monorepo', '单仓多包',
  ],
  ja: [
    'レビュー', 'コードレビュー', '修正', '実装', '計画', 'フロントエンド', '検証', 'リリース', '並列', 'モノレポ',
  ],
  ko: [
    '리뷰', '코드 리뷰', '수정', '구현', '계획', '프론트엔드', '검증', '배포', '병렬', '모노레포',
  ],
});

const INTENT_BUCKETS = Object.freeze({
  research: [
    'investigate', 'compare', 'audit', 'analyse', 'analyze', 'deep dive', 'why', 'look into', 'figure out', 'help me understand',
    'incele', 'inceleme', 'arastir', 'araştır', 'neden', 'analiz', 'analizi',
    'bir bak', 'goz at', 'göz at', 'nedenini bul', 'detayli bak', 'detaylı bak',
    'investiga', 'analiza', 'compara', 'audita',
    'pesquise', 'analise', 'compare', 'audite',
    'analyse', 'auditer', 'pourquoi',
    'untersuche', 'analysiere', 'warum',
    'исследуй', 'анализируй', 'почему',
    'حقق', 'استكشف',
    'जांच', 'विश्लेषण',
    '调查', '分析',
    '調査', '分析',
    '조사', '분석',
  ],
  plan: [
    'plan', 'roadmap', 'packet', 'approach', 'milestone', 'strategy', 'spec', 'put together', 'map out', 'lay out', 'execution packet', 'milestone packet',
    'taslak', 'yol haritasi', 'yol haritası', 'planla',
    'hazirla', 'hazırla', 'paketi hazirla', 'paketi hazırla', 'yol haritasini cikar', 'yol haritasını çıkar', 'planini cikar', 'planını çıkar',
    'planifica', 'planificar', 'estrategia', 'hoja de ruta',
    'planeje', 'estrategia',
    'planifier', 'strategie', 'stratégie',
    'plane', 'strategie',
    'pianifica', 'strategia',
    'план', 'стратегия',
    'خطة', 'استراتيجية',
    'योजना', 'रणनीति',
    '规划', '计划',
    '計画',
    '계획',
  ],
  implement: [
    'fix', 'implement', 'build', 'land', 'complete', 'patch', 'wire up', 'clean up', 'tighten', 'make the change',
    'tamamla', 'duzelt', 'düzelt', 'ekle', 'uygula', 'kodla',
    'duzeltmeyi uygula', 'düzeltmeyi uygula', 'toparla', 'iyilestir', 'iyileştir',
    'corrige', 'corregir', 'implementa', 'construye', 'arregla',
    'corrija', 'corrigir', 'implemente', 'construa',
    'corrige', 'implementer', 'construis',
    'behebe', 'implementiere', 'baue',
    'correggi', 'implementa', 'costruisci',
    'исправь', 'реализуй', 'внедри',
    'اصلح', 'نفذ', 'ابن',
    'ठीक', 'लागू', 'बनाओ',
    '修复', '实现', '构建',
    '修正', '実装', '構築',
    '수정', '구현', '빌드',
  ],
  review: [
    'review', 'pr review', 'code review', 'regression', 'risk heatmap', 'blocker', 'inspect', 'go over', 'look over', 'write down the risks', 'call out blockers',
    'gozden gecir', 'gözden geçir', 'review modu', 'review mode', 'inceleme', 'incelemesi',
    'degerlendirme', 'değerlendirme', 'degerlendirmesi', 'değerlendirmesi',
    'urun degerlendirmesi', 'ürün değerlendirmesi',
    'elden gecir', 'elden geçir', 'riskleri yaz', 'bulgulari yaz', 'bulguları yaz',
    'revisa', 'revision de codigo', 'revisión de código', 'revision', 'revisión',
    'revisao', 'revisão', 'revisar',
    'revue', 'revue de code',
    'prufe', 'prüfe', 'code review',
    'revisione', 'controlla',
    'ревью', 'код ревью', 'проверь',
    'مراجعة', 'راجع',
    'समीक्षा',
    '审查', '代码审查',
    'レビュー', 'コードレビュー',
    '리뷰', '코드 리뷰',
  ],
  frontend: [
    'ui', 'ux', 'frontend', 'screen', 'responsive', 'visual', 'a11y', 'accessibility', 'component', 'design', 'make it responsive', 'polish the ui', 'improve the ux',
    'ekran', 'tasarim', 'tasarım', 'bilesen', 'bileşen',
    'arayuz', 'arayüz', 'gorsel', 'görsel', 'responsive yap', 'tasarimi iyilestir', 'tasarımı iyileştir',
    'interfaz', 'frontend', 'diseno', 'diseño', 'componente', 'responsive',
    'interface', 'frontend', 'design', 'componente',
    'interface', 'frontend', 'composant',
    'oberflache', 'oberfläche', 'frontend', 'komponente',
    'interfaccia', 'frontend', 'componente',
    'фронтенд', 'интерфейс', 'дизайн',
    'واجهة', 'تصميم',
    'फ्रंटएंड', 'इंटरफेस', 'डिज़ाइन',
    '前端', '界面', '设计',
    'フロントエンド', '画面', 'デザイン',
    '프론트엔드', '화면', '디자인',
  ],
  verify: [
    'verify', 'verification', 'test', 'tests', 'lint', 'typecheck', 'smoke', 'browser', 'preview',
    'double-check', 'run tests', 'make sure', 'smoke test', 'capture screenshots',
    'assert', 'screenshot', 'snapshot', 'dogrula', 'doğrula', 'dogrulama', 'doğrulama', 'onizleme', 'önizleme',
    'kontrol et', 'test et', 'emin ol', 'smoke et', 'ekran goruntusu al', 'ekran görüntüsü al',
    'verifica', 'prueba', 'pruebas', 'captura',
    'verifique', 'teste', 'captura',
    'verifier', 'vérifier', 'test', 'capture',
    'verifiziere', 'teste', 'vorschau',
    'verifica', 'test', 'anteprima',
    'проверка', 'проверь', 'тест',
    'تحقق', 'اختبار',
    'सत्यापित', 'परीक्षण',
    '验证', '测试', '预览',
    '検証', 'テスト', 'プレビュー',
    '검증', '테스트', '미리보기',
  ],
  ship: [
    'release', 'handoff', 'closeout', 'deploy', 'get this out', 'send it', 'wrap it up',
    'yayinla', 'yayınla', 'surum', 'sürüm',
    'yayina al', 'yayına al', 'teslim et',
    'publica', 'lanzar', 'entrega',
    'publique', 'release', 'lance',
    'livrer', 'deployer', 'déployer',
    'veroffentliche', 'veröffentliche', 'release',
    'rilascia', 'deploy',
    'релиз', 'выпусти', 'деплой',
    'إصدار', 'انشر',
    'रिलीज', 'जारी',
    '发布', '上线',
    'リリース', '公開',
    '배포', '릴리즈',
  ],
  incident: [
    'incident', 'outage', 'hotfix', 'urgent', 'prod', 'production issue', 'sev1', 'sev-1', 'production fire', 'urgent prod issue',
    'olay', 'kritik hata', 'acil',
    'acil prod sorunu', 'kritik prod problemi',
    'incidente', 'urgente', 'produccion', 'producción',
    'incidente', 'urgente', 'producao', 'produção',
    'incident', 'urgence', 'production',
    'vorfall', 'dringend', 'produktion',
    'incidente', 'urgente', 'produzione',
    'инцидент', 'срочно', 'прод',
    'حادث', 'عاجل', 'انتاج',
    'घटना', 'तत्काल', 'प्रोड',
    '事故', '紧急', '生产',
    'インシデント', '緊急', '本番',
    '인시던트', '긴급', '프로덕션',
  ],
  parallel: [
    'parallel', 'parallelize', 'delegate', 'delegation', 'subagent', 'subagents', 'team mode', 'team lite', 'split this up', 'fan out', 'divide the work',
    'paralel', 'dagit', 'dağıt', 'subagent kullan',
    'parcalara bol', 'parçalara böl', 'paketlere dagit', 'paketlere dağıt', 'ayni anda yurut', 'aynı anda yürüt',
    'paralelo', 'delegar', 'subagente',
    'paralelo', 'delegue', 'subagente',
    'parallele', 'parallèle', 'deleguer', 'sous-agent',
    'parallel', 'delegiere', 'unteragent',
    'parallelo', 'delega', 'subagente',
    'параллельно', 'делегируй', 'сабагент',
    'متوازي', 'وكيل فرعي',
    'समानांतर', 'उप-एजेंट',
    '并行', '子代理',
    '並列', 'サブエージェント',
    '병렬', '서브에이전트',
  ],
  monorepo: [
    'workspace', 'monorepo', 'package graph', 'package', 'repo-wide', 'workspace-wide',
    'cok paketli', 'çok paketli',
    'espacio de trabajo', 'monorepo', 'paquete',
    'workspace', 'monorepo', 'pacote',
    'espace de travail', 'monorepo', 'paquet',
    'workspace', 'monorepo', 'paket',
    'workspace', 'monorepo', 'pacchetto',
    'монорепо', 'пакет', 'workspace',
    'مونوريبو', 'حزمة',
    'मोनोरेपो', 'पैकेज',
    '单仓多包', 'monorepo', '包',
    'モノレポ', 'パッケージ',
    '모노레포', '패키지',
  ],
});

const STEERING_BUCKETS = Object.freeze({
  preferReview: [
    'review', 'code review', 'review mode', 'review modu', 'gozden gecir', 'gözden geçir', 'go over', 'look over', 'elden gecir', 'elden geçir',
    'revisa', 'revision', 'revisión', 'ревью', 'مراجعة', '审查', 'レビュー', '리뷰',
  ],
  preferBrowser: [
    'browser', 'preview', 'screenshot', 'visual', 'playwright', 'onizleme', 'önizleme', 'smoke test the preview', 'previewu smoke et', 'previewü smoke et',
    'navegador', 'captura', 'vercel', 'tarayici', 'tarayıcı', '浏览器', 'プレビュー', '미리보기',
  ],
  researchFirst: [
    'research first', 'investigate first', 'look into it first', 'once ara', 'once arastir', 'önce araştır', 'önce ara', 'once bir bak', 'önce bir bak',
    'primero investiga', 'pesquise primeiro', 'recherche d abord', "recherche d'abord", 'сначала исследуй',
    'ابحث اولا', 'पहले जांच', '先调研', '先に調査', '먼저 조사',
  ],
  patchFirst: [
    'patch first', 'patch-first', 'just patch it', 'dogrudan patch', 'doğrudan patch', 'direkt patch', 'direkt duzelt', 'direkt düzelt',
    'aplica el parche primero', 'corrige primero', 'faça o patch primeiro', 'corrige d abord',
    "corrige d'abord", 'сначала патч', 'صحح اولا', 'पहले पैच', '先打补丁', '先にパッチ', '먼저 패치',
  ],
  strictVerify: [
    'strict verify', 'strict', 'kati verify', 'katı verify', 'siki verify', 'sıkı verify',
    'verificacion estricta', 'verificación estricta', 'verificacao estrita', 'vérification stricte',
    'strenge verifizierung', 'verifica rigorosamente', 'строгая проверка', 'تحقق صارم', 'सख्त सत्यापन',
    '严格验证', '厳格に検証', '엄격 검증',
  ],
});

const DETERMINISTIC_CAPABILITIES = Object.freeze([
  {
    id: 'plan.execution_packet',
    phrases: [
      'execution packet', 'milestone packet', 'put together the next execution packet', 'map out the next milestone',
      'bir sonraki milestone paketi', 'paketi hazirla', 'paketi hazırla', 'yol haritasini cikar', 'yol haritasını çıkar',
    ],
  },
  {
    id: 'execute.quick_patch',
    phrases: [
      'wire up the fix', 'focused patch', 'clean up the regression', 'duzeltmeyi uygula', 'düzeltmeyi uygula',
    ],
  },
  {
    id: 'review.re_review',
    phrases: [
      're-review', 'rerun review', 'follow-up review', 'yeniden review', 'review tekrar',
      'revisa de nuevo', 'rerun revisión', 'повторное ревью', '再次审查', '再レビュー', '재리뷰',
    ],
  },
  {
    id: 'review.deep_review',
    phrases: [
      'review mode', 'code review', 'pr review', 'risk heatmap', 'blocker review', 'gözden geçir',
      'go over the diff', 'take a look at the diff', 'write down the risks', 'call out blockers',
      'elden geçir', 'riskleri yaz', 'bulguları yaz',
      'revisión de código', 'revue de code', 'код ревью', '代码审查', 'コードレビュー', '코드 리뷰',
    ],
  },
  {
    id: 'frontend.ui_review',
    phrases: [
      'ui review', 'visual audit', 'responsive audit', 'a11y audit', 'tasarim denetimi', 'tasarım denetimi',
      'auditoria visual', 'auditoría visual', 'audit visuel', '视觉审查', 'UIレビュー', 'UI 리뷰',
    ],
  },
  {
    id: 'frontend.ui_spec',
    phrases: [
      'ui spec', 'design contract', 'ui plan', 'tasarim kontrati', 'tasarım kontratı',
      'especificacion ui', 'especificación ui', 'contrat de conception', '设计规范', 'UI仕様', 'UI 스펙',
    ],
  },
  {
    id: 'verify.browser',
    phrases: [
      'verify browser', 'browser verify', 'preview build', 'smoke the preview', 'tarayici dogrula', 'tarayıcı doğrula',
      'smoke test the preview', 'capture screenshots', 'previewu smoke et', 'previewü smoke et', 'ekran goruntusu al', 'ekran görüntüsü al',
      'verifica navegador', 'verifier le navigateur', 'проверь браузер', '浏览器验证', 'ブラウザ検証', '브라우저 검증',
    ],
  },
  {
    id: 'verify.shell',
    phrases: [
      'verify shell', 'test suite', 'lint and typecheck', 'shell verification', 'kabuk dogrulama',
      'double-check the test suite', 'run the tests', 'kontrol et ve test et',
      'verifica shell', 'vérification shell', 'shell-проверка', '命令行验证', 'シェル検証', '셸 검증',
    ],
  },
  {
    id: 'ship.release',
    phrases: [
      'ship this', 'release this', 'closeout package', 'yayinla bunu', 'yayınla bunu',
      'get this out', 'send it', 'yayina al', 'yayına al',
      'publica esto', 'publique ceci', 'выпусти это', '发布这个', 'これをリリース', '이것을 배포',
    ],
  },
  {
    id: 'team.parallel',
    phrases: [
      'parallelize', 'delegate this', 'subagent plan', 'paralel yurut', 'paralel yürüt',
      'split this up', 'fan out', 'parcalara bol', 'parçalara böl', 'paketlere dagit', 'paketlere dağıt',
      'hazlo en paralelo', 'delegue isso', 'delegue ceci', 'сделай параллельно', '并行处理', '並列で進めて', '병렬로 진행',
    ],
  },
  {
    id: 'incident.triage',
    phrases: [
      'incident triage', 'urgent outage', 'prod regression', 'kritik incident',
      'triage de incidente', 'incident urgent', 'срочный инцидент', '紧急事故', '緊急インシデント', '긴급 인시던트',
    ],
  },
]);

const EXTRA_LANGUAGE_MARKERS = Object.freeze({
  pl: ['przeglad', 'przegląd', 'napraw', 'wdroz', 'wdróż', 'frontend', 'zweryfikuj', 'rownolegle', 'równolegle', 'monorepo'],
  uk: ['ревʼю', 'ревью', 'виправ', 'реалізуй', 'реализуй', 'перевір', 'фронтенд', 'паралельно', 'монорепо'],
  el: ['ελεγχος', 'έλεγχος', 'διορθωσε', 'διόρθωσε', 'υλοποιησε', 'υλοποίησε', 'frontend', 'επαληθευσε', 'επαλήθευσε', 'παραλληλα', 'παράλληλα'],
  vi: ['kiem tra', 'kiểm tra', 'sua', 'sửa', 'thuc hien', 'thực hiện', 'giao dien', 'giao diện', 'xac minh', 'xác minh', 'song song'],
  id: ['tinjau', 'periksa', 'perbaiki', 'implementasikan', 'rencanakan', 'frontend', 'verifikasi', 'rilis', 'paralel', 'monorepo'],
  th: ['รีวิว', 'ตรวจสอบ', 'แก้ไข', 'พัฒนา', 'วางแผน', 'ฟรอนต์เอนด์', 'ยืนยัน', 'ปล่อย', 'ขนาน'],
  he: ['סקירה', 'בדוק', 'תקן', 'ממש', 'תכנן', 'פרונטאנד', 'אמת', 'שחרר', 'במקביל', 'מונוריפו'],
  fa: ['بررسی', 'بازبینی', 'رفع', 'پیاده', 'پیاده سازی', 'رابط', 'اعتبارسنجی', 'انتشار', 'موازی', 'مونوریپو'],
  ro: ['revizuire', 'verifica', 'verifică', 'repara', 'repară', 'implementeaza', 'implementează', 'frontend', 'lansare', 'paralel'],
  cs: ['revize', 'zkontroluj', 'oprav', 'implementuj', 'naplanuj', 'naplánuj', 'frontend', 'paralelne', 'paralelně'],
  sv: ['granska', 'kodgranskning', 'fixa', 'implementera', 'planera', 'frontend', 'verifiera', 'lansera', 'parallellt', 'monorepo'],
});

const LANGUAGE_BUCKETS = Object.freeze(mergedBuckets(LANGUAGE_MARKERS, EXTRA_LANGUAGE_MARKERS));

const EXTRA_INTENT_BUCKETS = Object.freeze({
  research: ['zbadaj', 'досліди', 'ερευνα', 'έρευνα', 'nghien cuu', 'nghiên cứu', 'selidiki', 'วิจัย', 'חקור', 'تحقیق', 'investigheaza', 'investighează', 'prozkoumej', 'undersok', 'undersök'],
  plan: ['zaplanuj', 'сплануй', 'σχεδιασε', 'σχεδίασε', 'lap ke hoach', 'lập kế hoạch', 'rencana', 'วางแผน', 'תכנן', 'برنامه', 'planifica', 'naplanuj', 'planera'],
  implement: ['napraw', 'виправ', 'διορθωσε', 'διόρθωσε', 'sua', 'sửa', 'perbaiki', 'แก้ไข', 'תקן', 'اصلاح', 'repara', 'oprav', 'fixa'],
  review: ['przeglad kodu', 'przegląd kodu', 'код ревю', 'code review', 'ανασκοπηση κωδικα', 'ανασκόπηση κώδικα', 'review ma', 'review mã', 'tinjau kode', 'รีวิวโค้ด', 'סקירת קוד', 'بازبینی کد', 'revizuire cod', 'revize kodu', 'kodgranskning'],
  frontend: ['interfejs', 'інтерфейс', 'διεπαφη', 'διεπαφή', 'giao dien', 'giao diện', 'antarmuka', 'ส่วนติดต่อ', 'ממשק', 'رابط کاربری', 'interfata', 'interfață', 'rozhrani', 'rozhraní', 'granssnitt', 'gränssnitt'],
  verify: ['zweryfikuj', 'перевір', 'epalitheuse', 'επαλήθευσε', 'xac minh', 'xác minh', 'verifikasi', 'ยืนยัน', 'אמת', 'اعتبارسنجی', 'verifica', 'over', 'ověř', 'verifiera'],
  ship: ['wdroz', 'wdróż', 'випусти', 'κυκλοφορησε', 'κυκλοφόρησε', 'phat hanh', 'phát hành', 'rilis', 'ปล่อย', 'שחרר', 'منتشر', 'lanseaza', 'lansează', 'nasad', 'lansera'],
  incident: ['awaria', 'інцидент', 'συμβαν', 'συμβάν', 'su co', 'sự cố', 'insiden', 'เหตุขัดข้อง', 'תקלה', 'حادثه', 'incident critic', 'incident'],
  parallel: ['rownolegle', 'równolegle', 'паралельно', 'παραλληλα', 'παράλληλα', 'song song', 'song song', 'paralel', 'ขนาน', 'במקביל', 'موازی', 'paralel', 'paralelne', 'paralelně', 'parallellt'],
  monorepo: ['wiele pakietow', 'wiele pakietów', 'монорепо', 'μονορεπο', 'monorepo', 'หลายแพ็กเกจ', 'מונוריפו', 'مونوریپو', 'monorepo'],
});

const EXTRA_STEERING_BUCKETS = Object.freeze({
  preferReview: ['przeglad', 'ревʼю', 'έλεγχος', 'tinjau', 'รีวิว', 'סקירה', 'بررسی', 'revizuire', 'revize', 'granska'],
  preferBrowser: ['przegladarka', 'przeglądarka', 'браузер', 'φυλλομετρητης', 'φυλλομετρητής', 'trinh duyet', 'trình duyệt', 'browser', 'เบราว์เซอร์', 'דפדפן', 'مرورگر', 'browser', 'prohlizec', 'prohlížeč'],
  researchFirst: ['najpierw zbadaj', 'спочатку досліди', 'πρωτα ερευνα', 'πρώτα έρευνα', 'nghien cuu truoc', 'nghiên cứu trước', 'riset dulu', 'วิจัยก่อน', 'קודם תחקור', 'اول تحقیق', 'cerceteaza mai intai', 'cercetează mai întâi', 'nejdriv prozkoumej', 'nejdřív prozkoumej', 'undersok forst', 'undersök först'],
  patchFirst: ['najpierw popraw', 'спочатку патч', 'πρωτα διορθωσε', 'đắp patch trước', 'tambal dulu', 'แพตช์ก่อน', 'קודם תקן', 'اول پچ', 'întâi patch', 'nejdriv patch', 'patch först'],
  strictVerify: ['scisla weryfikacja', 'ścisła weryfikacja', 'сувора перевірка', 'ayστηρη επαληθευση', 'αυστηρή επαλήθευση', 'xac minh nghiem ngat', 'xác minh nghiêm ngặt', 'verifikasi ketat', 'ตรวจสอบเข้มงวด', 'אימות קפדני', 'اعتبارسنجی سختگیرانه', 'verificare stricta', 'verificare strictă', 'prisne overeni', 'přísné ověření', 'strikt verifiering'],
});

const EXTRA_DETERMINISTIC_CAPABILITIES = Object.freeze([
  {
    id: 'review.deep_review',
    phrases: ['przeglad kodu', 'ревʼю коду', 'ανασκόπηση κώδικα', 'review mã', 'tinjau kode', 'รีวิวโค้ด', 'סקירת קוד', 'بازبینی کد', 'revizuire cod', 'revize kodu', 'kodgranskning'],
  },
  {
    id: 'frontend.ui_spec',
    phrases: ['specyfikacja ui', 'специфікація ui', 'προδιαγραφη ui', 'προδιαγραφή ui', 'dac ta ui', 'đặc tả ui', 'spesifikasi ui', 'สเปก ui', 'מפרט ui', 'مشخصات ui', 'specificatie ui', 'specificație ui', 'specifikace ui', 'ui-spec'],
  },
  {
    id: 'team.parallel',
    phrases: ['rownolegle', 'паралельно', 'παράλληλα', 'song song', 'paralel', 'ขนาน', 'במקביל', 'موازی', 'paralelne', 'parallellt'],
  },
]);

function mergedBuckets(base, extra) {
  const merged = {};
  for (const [key, value] of Object.entries(base || {})) {
    merged[key] = [...(value || []), ...((extra || {})[key] || [])];
  }
  for (const [key, value] of Object.entries(extra || {})) {
    if (!merged[key]) {
      merged[key] = [...(value || [])];
    }
  }
  return merged;
}

const NON_LATIN_PATTERN = /[\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMultilingualText(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”‘’`"'´]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    raw,
    normalized: normalizeWorkflowControlUtterance(value),
  };
}

function containsPhrase(forms, phrase) {
  const rawPhrase = String(phrase || '').trim().toLowerCase();
  if (!rawPhrase) {
    return false;
  }
  const normalizedPhrase = normalizeWorkflowControlUtterance(rawPhrase);
  if (!normalizedPhrase && !NON_LATIN_PATTERN.test(rawPhrase)) {
    return false;
  }

  if (NON_LATIN_PATTERN.test(rawPhrase)) {
    return forms.raw.includes(rawPhrase);
  }

  if (rawPhrase.includes(' ') && forms.raw.includes(rawPhrase)) {
    return true;
  }

  if (normalizedPhrase.includes(' ')) {
    return forms.normalized.includes(normalizedPhrase);
  }

  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(normalizedPhrase)}(?=\\s|$)`, 'i');
  return pattern.test(forms.normalized);
}

function collectMatches(text, phrases) {
  const forms = typeof text === 'string' ? normalizeMultilingualText(text) : text;
  const matches = [];
  for (const phrase of phrases || []) {
    if (containsPhrase(forms, phrase)) {
      matches.push(phrase);
    }
  }
  return [...new Set(matches)];
}

function languageMarkerKey(phrase) {
  const rawPhrase = String(phrase || '').trim().toLowerCase();
  if (!rawPhrase) {
    return '';
  }
  if (NON_LATIN_PATTERN.test(rawPhrase)) {
    return `raw:${rawPhrase}`;
  }
  const normalizedPhrase = normalizeWorkflowControlUtterance(rawPhrase);
  return normalizedPhrase ? `norm:${normalizedPhrase}` : `raw:${rawPhrase}`;
}

const LANGUAGE_MARKER_FREQUENCIES = (() => {
  const frequencies = new Map();
  for (const phrases of Object.values(LANGUAGE_BUCKETS)) {
    const uniqueKeys = new Set((phrases || []).map((phrase) => languageMarkerKey(phrase)).filter(Boolean));
    for (const key of uniqueKeys) {
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
    }
  }
  return frequencies;
})();

function scoreLanguageMatches(matches) {
  return matches.reduce((total, phrase) => {
    const key = languageMarkerKey(phrase);
    const overlap = LANGUAGE_MARKER_FREQUENCIES.get(key) || 1;
    return total + (1 / overlap);
  }, 0);
}

function compareLanguageEntries(left, right) {
  return right.score - left.score
    || right.count - left.count
    || left.language.localeCompare(right.language);
}

function resolveMatchedLanguages(scores, counts) {
  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .map(([language, score]) => ({
      language,
      score,
      count: counts[language] || 0,
    }))
    .sort(compareLanguageEntries);

  if (ranked.length === 0) {
    return [];
  }

  const maxScore = ranked[0].score;
  const strongMatches = ranked.filter((entry) => entry.score >= 1 && entry.score >= maxScore * 0.55);
  if (strongMatches.length > 0) {
    return strongMatches.map((entry) => entry.language);
  }

  if ((scores.en || 0) > 0) {
    return ['en'];
  }

  return [ranked[0].language];
}

function detectBucketMatches(text, buckets) {
  const forms = typeof text === 'string' ? normalizeMultilingualText(text) : text;
  return Object.fromEntries(Object.entries(buckets).map(([key, phrases]) => {
    const matches = collectMatches(forms, phrases);
    return [key, {
      active: matches.length > 0,
      count: matches.length,
      matches,
    }];
  }));
}

function detectIntentSignals(text) {
  const forms = normalizeMultilingualText(text);
  const buckets = detectBucketMatches(forms, mergedBuckets(INTENT_BUCKETS, EXTRA_INTENT_BUCKETS));
  return {
    research: buckets.research.active,
    plan: buckets.plan.active,
    implement: buckets.implement.active,
    review: buckets.review.active,
    frontend: buckets.frontend.active,
    verify: buckets.verify.active,
    ship: buckets.ship.active,
    incident: buckets.incident.active,
    parallel: buckets.parallel.active,
    monorepo: buckets.monorepo.active,
    buckets,
  };
}

function detectSteeringSignals(text) {
  const forms = normalizeMultilingualText(text);
  const buckets = detectBucketMatches(forms, mergedBuckets(STEERING_BUCKETS, EXTRA_STEERING_BUCKETS));
  return {
    preferReview: buckets.preferReview.active,
    preferBrowser: buckets.preferBrowser.active,
    researchFirst: buckets.researchFirst.active,
    patchFirst: buckets.patchFirst.active,
    strictVerify: buckets.strictVerify.active,
    buckets,
  };
}

function detectLanguageSignals(text) {
  const forms = normalizeMultilingualText(text);
  const matches = Object.fromEntries(Object.entries(LANGUAGE_BUCKETS).map(([language, phrases]) => [
    language,
    collectMatches(forms, phrases),
  ]));
  const counts = Object.fromEntries(Object.entries(matches).map(([language, languageMatches]) => [
    language,
    languageMatches.length,
  ]));
  const scores = Object.fromEntries(Object.entries(matches).map(([language, languageMatches]) => [
    language,
    Number(scoreLanguageMatches(languageMatches).toFixed(3)),
  ]));
  const matchedLanguages = resolveMatchedLanguages(scores, counts);

  return {
    matchedLanguages,
    counts,
    scores,
    matches,
    turkishSignals: matchedLanguages.includes('tr'),
    englishSignals: matchedLanguages.includes('en'),
    multilingual: matchedLanguages.length > 1,
  };
}

function deterministicCapabilityMatches(text) {
  const forms = normalizeMultilingualText(text);
  return [...DETERMINISTIC_CAPABILITIES, ...EXTRA_DETERMINISTIC_CAPABILITIES]
    .filter((entry) => collectMatches(forms, entry.phrases).length > 0)
    .map((entry) => entry.id);
}

module.exports = {
  detectIntentSignals,
  detectLanguageSignals,
  detectSteeringSignals,
  deterministicCapabilityMatches,
  normalizeMultilingualText,
};
