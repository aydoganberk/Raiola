const fs = require('node:fs');
const path = require('node:path');
const { buildBaseState } = require('./state_surface');
const {
  normalizeWorkflowControlUtterance,
  readIfExists,
  workflowPaths,
} = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const { listCapabilities } = require('./capability_registry');
const { buildPackageGraph } = require('./package_graph');
const { selectCodexProfile } = require('./codex_profile_engine');
const {
  detectIntentSignals,
  detectLanguageSignals,
  detectSteeringSignals,
  deterministicCapabilityMatches,
} = require('./intent_lexicon');

function steeringPath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'intent-steering.json');
}

function routeHistoryPath(cwd) {
  return path.join(cwd, '.workflow', 'cache', 'intent-route-history.json');
}

function readJson(filePath, fallback) {
  const content = readIfExists(filePath);
  if (!content) {
    return fallback;
  }
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function detectSteering(text) {
  const lexical = detectSteeringSignals(text);
  return {
    preferReview: lexical.preferReview || /\b(review|code review|review mode|review modu|gozden gecir|gözden geçir|go over|look over|elden gecir|elden geçir)\b/i.test(text),
    preferBrowser: lexical.preferBrowser || /\b(browser|preview|screenshot|visual|playwright|onizleme|önizleme|smoke test)\b/i.test(text),
    researchFirst: lexical.researchFirst || /\b(research first|once ara|once arastir|önce araştır|önce ara|investigate first|araştır sonra uygula|look into it first|once bir bak|önce bir bak)\b/i.test(text),
    patchFirst: lexical.patchFirst || /\b(patch first|patch-first|dogrudan patch|doğrudan patch|direkt patch|just patch it|direkt duzelt|direkt düzelt)\b/i.test(text),
    strictVerify: lexical.strictVerify || /\b(strict verify|strict|kati verify|katı verify|siki verify|sıkı verify)\b/i.test(text),
    matches: lexical.buckets,
  };
}

function inferIntent(text) {
  const lexical = detectIntentSignals(text);
  return {
    research: lexical.research || /(why|investigate|compare|audit|analyse|analyze|deep dive|look into|figure out|incele|inceleme|arastir|araştır|neden|bir bak|goz at|göz at)/i.test(text),
    plan: lexical.plan || /(plan|roadmap|packet|approach|milestone|strategy|spec|put together|map out|execution packet|milestone packet|taslak|yol haritasi|yol haritası|hazirla|hazırla)/i.test(text),
    implement: lexical.implement || /(fix|implement|build|land|wire up|clean up|tamamla|duzelt|düzelt|ekle|uygula|kodla|toparla|iyilestir|iyileştir)/i.test(text),
    review: lexical.review || /(review|pr review|code review|regression|risk heatmap|blocker|go over|look over|gozden gecir|gözden geçir|elden gecir|elden geçir)/i.test(text),
    frontend: lexical.frontend || /(ui|frontend|screen|ekran|responsive|visual|a11y|accessibility|component|design|tasarim|tasarım|arayuz|arayüz|gorsel|görsel)/i.test(text),
    verify: lexical.verify || /(verify|verification|test|tests|lint|typecheck|smoke|smoke test|browser|preview|assert|screenshot|snapshot|double-check|dogrula|doğrula|dogrulama|doğrulama|kontrol et|test et)/i.test(text),
    ship: lexical.ship || /(release|handoff|closeout|deploy|get this out|send it|yayinla|yayınla|yayina al|yayına al|surum|sürüm|teslim et)/i.test(text),
    incident: lexical.incident || /(incident|outage|hotfix|urgent|prod|production issue|production fire|urgent prod issue|olay|kritik hata|acil prod sorunu|kritik prod problemi|sev1|sev-1)/i.test(text),
    parallel: lexical.parallel || /(parallel|paralel|delegate|delegation|subagent|team|split this up|fan out|dagit|dağıt|parcalara bol|parçalara böl)/i.test(text),
    monorepo: lexical.monorepo || /(workspace|monorepo|package graph|package|repo-wide|workspace-wide|cok paketli|çok paketli)/i.test(text),
    matches: lexical.buckets,
  };
}

function inferRisk(text) {
  const high = /(migration|delete|drop|reset --hard|rollback|auth|credential|security|production|ship|release)/i.test(text);
  const medium = high || /(config|refactor|package\.json|workflow|review|frontend)/i.test(text);
  return {
    high,
    medium,
    level: high ? 'high' : medium ? 'medium' : 'low',
  };
}

function inferLanguageMix(text) {
  const lexical = detectLanguageSignals(text);
  return {
    turkishSignals: lexical.turkishSignals,
    englishSignals: lexical.englishSignals,
    matchedLanguages: lexical.matchedLanguages,
    multilingual: lexical.multilingual,
    counts: lexical.counts,
  };
}

function loadSteeringMemory(cwd) {
  return readJson(steeringPath(cwd), {
    updatedAt: null,
    preferences: {},
    history: [],
  });
}

function persistSteeringMemory(cwd, goal, steering) {
  const previous = loadSteeringMemory(cwd);
  const next = {
    updatedAt: new Date().toISOString(),
    preferences: {
      ...previous.preferences,
      ...Object.fromEntries(Object.entries(steering).filter(([, value]) => value)),
    },
    history: [
      {
        at: new Date().toISOString(),
        goal,
        steering,
      },
      ...(previous.history || []),
    ].slice(0, 25),
  };
  writeJson(steeringPath(cwd), next);
  return next;
}

function buildEphemeralSteeringMemory(goal, steering, seedPreferences = {}) {
  return {
    updatedAt: null,
    preferences: {
      ...seedPreferences,
      ...Object.fromEntries(Object.entries(steering).filter(([, value]) => value)),
    },
    history: [
      {
        at: null,
        goal,
        steering,
      },
    ],
  };
}

function buildRepoSignals(cwd, rootDir) {
  const workflowState = buildBaseState(cwd, rootDir).workflow;
  const paths = workflowPaths(rootDir, cwd);
  let frontend = null;
  try {
    frontend = buildFrontendProfile(cwd, rootDir, {
      scope: 'workstream',
      refresh: 'incremental',
    });
  } catch {
    frontend = null;
  }
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const changedContext = readIfExists(paths.context) || '';
  return {
    workflowStep: workflowState.step,
    workflowMilestone: workflowState.milestone,
    workflowActive: workflowState.milestone !== 'NONE',
    frontendActive: Boolean(frontend?.frontendMode?.active),
    frontendFramework: frontend?.framework?.primary || 'unknown',
    browserNeeded: Boolean(frontend?.signals?.previewNeed),
    monorepo: packageGraph.repoShape === 'monorepo',
    packageCount: packageGraph.packageCount,
    changedPackages: packageGraph.changedPackages || [],
    impactedPackages: packageGraph.impactedPackages || [],
    repoShape: packageGraph.repoShape,
    changedContextMentionsBrowser: /\b(browser|preview|screenshot|responsive)\b/i.test(changedContext),
  };
}

function deterministicMatches(goalText) {
  const lexicalMatches = deterministicCapabilityMatches(goalText);
  const normalizedGoal = String(goalText || '');
  const rules = [
    ['plan.execution_packet', /(?:^|\b)(execution packet|milestone packet|put together the next execution packet|map out the next milestone|bir sonraki milestone paketi|paketi hazirla|paketi hazırla|yol haritasini cikar|yol haritasını çıkar)(?:\b|$)/i],
    ['execute.quick_patch', /(?:^|\b)(wire up the fix|focused patch|clean up the regression|duzeltmeyi uygula|düzeltmeyi uygula)(?:\b|$)/i],
    ['review.re_review', /(?:^|\b)(re-review|rerun review|follow-up review|yeniden review|review tekrar)(?:\b|$)/i],
    ['review.deep_review', /(?:^|\b)(review mode|code review|pr review|risk heatmap|blocker review|gözden geçir|go over the diff|take a look at the diff|elden geçir|riskleri yaz|bulgulari yaz|bulguları yaz)(?:\b|$)/i],
    ['frontend.ui_review', /(?:^|\b)(ui review|visual audit|responsive audit|a11y audit|tasarim denetimi)(?:\b|$)/i],
    ['frontend.ui_spec', /(?:^|\b)(ui spec|design contract|ui plan|tasarim kontrati)(?:\b|$)/i],
    ['verify.browser', /(?:^|\b)(verify browser|browser verify|preview build|smoke the preview|smoke test the preview|capture screenshots|tarayici doğrula|previewu smoke et|previewü smoke et|ekran goruntusu al|ekran görüntüsü al)(?:\b|$)/i],
    ['verify.shell', /(?:^|\b)(verify shell|test suite|lint and typecheck|shell verification|double-check the test suite|run the tests|kontrol et ve test et)(?:\b|$)/i],
    ['ship.release', /(?:^|\b)(ship this|release this|closeout package|get this out|send it|yayinla bunu|yayina al|yayına al)(?:\b|$)/i],
    ['team.parallel', /(?:^|\b)(parallelize|delegate this|subagent plan|split this up|fan out|paralel yurut|parçalara böl|parcalara bol|paketlere dagit|paketlere dağıt)(?:\b|$)/i],
    ['incident.triage', /(?:^|\b)(incident triage|urgent outage|prod regression|kritik incident)(?:\b|$)/i],
  ];

  return [...new Set([
    ...lexicalMatches,
    ...rules
      .filter(([, pattern]) => pattern.test(normalizedGoal))
      .map(([capabilityId]) => capabilityId),
  ])];
}

function scoreCapability(capability, normalizedGoal, intent, repoSignals, steeringPreferences, originalGoal = normalizedGoal) {
  let score = 0;
  const reasons = [];
  const tokens = new Set(normalizedGoal.split(' ').filter(Boolean));
  const hasPhrase = (phrase) => {
    const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'i').test(normalizedGoal);
  };
  const startsWithPhrase = (phrase) => {
    const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}(?=\\s|$)`, 'i').test(normalizedGoal);
  };
  const aliases = (capability.aliases || []).map((entry) => normalizeWorkflowControlUtterance(entry)).filter(Boolean);
  const keywords = (capability.keywords || [])
    .map((entry) => normalizeWorkflowControlUtterance(entry))
    .filter((entry) => entry && !aliases.includes(entry));
  const deterministic = deterministicMatches(originalGoal || normalizedGoal);

  if (deterministic.includes(capability.id)) {
    score += 18;
    reasons.push('Deterministic grammar matched an explicit command-like intent.');
  }

  for (const alias of aliases) {
    const aliasTokens = alias.split(' ').filter(Boolean);
    if (hasPhrase(alias)) {
      score += aliasTokens.length > 1 ? 7 : (startsWithPhrase(alias) ? 5 : 3);
      reasons.push(`Matched alias phrase: ${alias}`);
      if (startsWithPhrase(alias)) {
        score += 2;
        reasons.push(`Matched leading alias: ${alias}`);
      }
    } else if (aliasTokens.every((token) => tokens.has(token))) {
      score += aliasTokens.length > 1 ? 4 : 3;
      reasons.push(`Matched alias tokens: ${alias}`);
    } else if (aliasTokens.some((token) => tokens.has(token))) {
      score += 1;
      reasons.push(`Partial alias hit: ${alias}`);
    }
  }

  for (const keyword of keywords) {
    const keywordTokens = keyword.split(' ').filter(Boolean);
    if (hasPhrase(keyword)) {
      score += keywordTokens.length > 1 ? 3 : 2;
      reasons.push(`Matched keyword: ${keyword}`);
    } else if (keywordTokens.every((token) => tokens.has(token))) {
      score += 1;
      reasons.push(`Matched keyword tokens: ${keyword}`);
    }
  }

  if (capability.domain === 'review' && intent.review) {
    score += 8;
    reasons.push('Review intent detected.');
    if (/^(review|audit|inspect|re-review|rerun review|follow-up review)\b/i.test(normalizedGoal)) {
      score += 4;
      reasons.push('Review-oriented opener detected.');
    }
    if (/^(ship|release|deploy|handoff|closeout|yayinla|yayınla|surum|sürüm)\b/i.test(normalizedGoal)) {
      score -= 6;
      reasons.push('Review language appears secondary to an explicit ship request.');
    }
  }
  if (capability.domain === 'review' && /\b(urun degerlendirmesi|degerlendirme|degerlendirmesi|inceleme|incelemesi)\b/i.test(normalizedGoal)) {
    score += 6;
    reasons.push('Evaluation or review language detected.');
  }
  if (capability.id === 'research.discuss' && /\b(look into|figure out|help me understand|bir bak|goz at|göz at|nedenini bul)\b/i.test(normalizedGoal)) {
    score += 7;
    reasons.push('Exploration-first language detected.');
  }
  if (capability.id === 'plan.execution_packet' && /\b(execution packet|milestone packet|put together|map out|lay out|hazirla|hazırla|paketi hazirla|paketi hazırla|yol haritasini cikar|yol haritasını çıkar|planini cikar|planını çıkar)\b/i.test(normalizedGoal)) {
    score += 8;
    reasons.push('Plan-packet language detected.');
  }
  if (capability.id === 'review.deep_review' && /\b(go over|look over|write down the risks|call out blockers|elden gecir|elden geçir|riskleri yaz|bulgulari yaz|bulguları yaz)\b/i.test(normalizedGoal)) {
    score += 7;
    reasons.push('Review-and-findings language detected.');
  }
  if (capability.domain === 'frontend' && (intent.frontend || repoSignals.frontendActive)) {
    score += 8;
    reasons.push('Frontend intent or repo signal detected.');
  }
  if (capability.domain === 'execute' && intent.implement) {
    score += 7;
    reasons.push('Implementation intent detected.');
  }
  if (capability.domain === 'research' && intent.research) {
    score += 7;
    reasons.push('Research intent detected.');
    if (/^(investigate|analyze|analyse|audit|incele|arastir|araştır)\b/i.test(normalizedGoal)) {
      score += 4;
      reasons.push('Research-oriented opener detected.');
    }
  }
  if (capability.domain === 'research' && /\b(analiz|analizi)\b/i.test(normalizedGoal)) {
    score += 5;
    reasons.push('Analysis language detected.');
  }
  if (capability.domain === 'plan' && intent.plan) {
    score += 7;
    reasons.push('Planning intent detected.');
  }
  if (capability.domain === 'verify' && intent.verify) {
    score += 6;
    reasons.push('Verification intent detected.');
  }
  if (capability.id === 'team.parallel' && intent.parallel) {
    score += 10;
    reasons.push('Explicit parallel/delegation request detected.');
  }
  if (capability.id === 'execute.quick_patch' && /^(fix|implement|patch|build|land|tamamla|duzelt|düzelt|ekle|uygula|kodla)\b/i.test(normalizedGoal)) {
    score += 8;
    reasons.push('Execution-oriented opener detected.');
  }
  if (capability.id === 'review.re_review' && /^(re-review|rerun review|follow-up review)\b/i.test(normalizedGoal)) {
    score += 10;
    reasons.push('Re-review specific opener detected.');
  }
  if (capability.id === 'review.deep_review' && /\b(write findings|risk heatmap|blockers?)\b/i.test(normalizedGoal)) {
    score += 4;
    reasons.push('Review findings language detected.');
  }
  if (capability.id === 'verify.shell' && /^(verify|run|check)\b/i.test(normalizedGoal) && /\b(test suite|shell verification|lint|typecheck|tests?)\b/i.test(normalizedGoal)) {
    score += 12;
    reasons.push('Shell verification opener detected.');
  }
  if (capability.id === 'verify.shell' && /\b(double-check|run tests|make sure|kontrol et|test et|emin ol)\b/i.test(normalizedGoal) && /\b(test suite|tests?|lint|typecheck|verify)\b/i.test(normalizedGoal)) {
    score += 8;
    reasons.push('Conversational shell verification language detected.');
  }
  if (capability.id === 'verify.browser' && /\b(smoke test|capture screenshots?|previewu smoke et|previewü smoke et|ekran goruntusu al|ekran görüntüsü al)\b/i.test(normalizedGoal)) {
    score += 9;
    reasons.push('Browser smoke or screenshot language detected.');
  }
  if (capability.id === 'ship.release' && /^(ship|release|deploy|handoff|closeout|yayinla|yayınla|surum|sürüm)\b/i.test(normalizedGoal)) {
    score += 14;
    reasons.push('Ship-oriented opener detected.');
    if (/\b(after|sonra)\s+(final\s+)?review\b/i.test(normalizedGoal)) {
      score += 4;
      reasons.push('Ship request explicitly names review as a prerequisite, not the primary lane.');
    }
  }
  if (capability.id === 'ship.release' && /\b(get this out|send it|wrap it up|yayina al|yayına al|teslim et)\b/i.test(normalizedGoal)) {
    score += 12;
    reasons.push('Conversational ship language detected.');
  }
  if (capability.id === 'ship.release' && intent.ship && !intent.review && !intent.verify) {
    score += 8;
    reasons.push('Ship/release language detected.');
  }
  if (capability.id === 'incident.triage' && intent.incident) {
    score += 9;
    reasons.push('Incident/regression language detected.');
  }
  if (capability.id === 'team.parallel' && /\b(split this up|fan out|divide the work|parcalara bol|parçalara böl|paketlere dagit|paketlere dağıt|ayni anda yurut|aynı anda yürüt)\b/i.test(normalizedGoal)) {
    score += 10;
    reasons.push('Fan-out language detected.');
  }
  if (
    capability.id === 'verify.browser'
    && (
      repoSignals.browserNeeded
      || (steeringPreferences.preferBrowser && (intent.verify || intent.frontend))
    )
  ) {
    score += 5;
    reasons.push('Browser evidence is preferred or required.');
  }
  if (capability.id.startsWith('review.') && steeringPreferences.preferReview) {
    score += 4;
    reasons.push('Steering memory prefers review mode.');
  }
  if (capability.id === 'research.discuss' && steeringPreferences.researchFirst) {
    score += 4;
    reasons.push('Steering memory prefers research-first.');
  }
  if (capability.id === 'execute.quick_patch' && steeringPreferences.patchFirst) {
    score += 4;
    reasons.push('Steering memory prefers patch-first execution.');
  }
  if (repoSignals.monorepo && capability.supportsMonorepo) {
    score += 1;
  }
  if (repoSignals.frontendActive && capability.supportsFrontend) {
    score += 1;
  }

  return { score, reasons };
}

function verificationPlanFor(capability, repoSignals, steeringPreferences) {
  const plan = [];
  if (capability.domain === 'research') {
    plan.push('cwf explore --repo');
    plan.push('cwf packet compile --step plan');
  }
  if (capability.domain === 'plan') {
    plan.push('cwf packet compile --step plan');
    plan.push('cwf next');
  }
  if (capability.domain === 'execute') {
    plan.push('cwf verify-shell --cmd "npm test"');
    if (repoSignals.frontendActive || steeringPreferences.preferBrowser) {
      plan.push('cwf ui-review');
    }
  }
  if (capability.domain === 'review') {
    plan.push('cwf review --heatmap');
    plan.push('cwf review --blockers');
  }
  if (capability.domain === 'frontend') {
    plan.push('cwf ui-spec');
    plan.push('cwf responsive-matrix');
    plan.push('cwf ui-review');
    plan.push('cwf verify-browser --smoke');
  }
  if (capability.domain === 'verify' && capability.id === 'verify.browser') {
    plan.push('cwf verify-browser --smoke');
    plan.push('cwf preview');
  }
  if (capability.domain === 'verify' && capability.id === 'verify.shell') {
    plan.push('cwf verify-shell --cmd "npm test"');
  }
  if (capability.id === 'team.parallel') {
    plan.push('cwf team run --adapter hybrid');
    plan.push('cwf team collect --patch-first');
  }
  if (capability.id === 'ship.release') {
    plan.push('cwf review');
    plan.push('cwf ship');
  }
  if (capability.id === 'incident.triage') {
    plan.push('cwf incident open');
    plan.push('cwf verify-shell --cmd "npm test"');
  }
  if (steeringPreferences.strictVerify && !plan.some((item) => item.includes('verify'))) {
    plan.push('cwf verify-shell --cmd "npm test"');
  }
  return [...new Set(plan)];
}

function laneForCapability(capability) {
  if (capability.id === 'team.parallel') {
    return 'team';
  }
  if (capability.domain === 'frontend') {
    return 'frontend';
  }
  if (capability.domain === 'review') {
    return 'review';
  }
  if (capability.domain === 'execute' || capability.domain === 'verify') {
    return 'quick';
  }
  return 'full';
}

function confidenceForCandidates(candidates) {
  if (!candidates.length) {
    return 0.25;
  }
  const top = candidates[0].score;
  const second = candidates[1]?.score || 0;
  const diff = Math.max(0, top - second);
  return Math.max(0.35, Math.min(0.98, Number((0.55 + (diff * 0.06) + (top * 0.01)).toFixed(2))));
}

function ambiguityReasons(candidates, intent) {
  const reasons = [];
  if ((candidates[0]?.score || 0) - (candidates[1]?.score || 0) <= 2) {
    reasons.push('Top capability and fallback are close in score.');
  }
  const activeDomains = Object.entries(intent).filter(([, value]) => value).map(([key]) => key);
  if (activeDomains.length >= 3) {
    reasons.push(`Multiple intent families are active: ${activeDomains.join(', ')}.`);
  }
  return reasons;
}

function ambiguityClass(candidates, intent, confidence) {
  const activeDomains = Object.entries(intent).filter(([, value]) => value).map(([key]) => key);
  if (confidence < 0.65) {
    return 'low-confidence';
  }
  if ((candidates[0]?.score || 0) - (candidates[1]?.score || 0) <= 2) {
    return 'close-call';
  }
  if (activeDomains.length >= 3) {
    return 'mixed-intent';
  }
  return confidence >= 0.8 ? 'clear' : 'moderate';
}

function buildRejectedAlternatives(candidates, chosenCapability) {
  return candidates
    .filter((candidate) => candidate.id !== chosenCapability.id)
    .slice(0, 3)
    .map((candidate) => ({
      id: candidate.id,
      domain: candidate.domain,
      risk: candidate.risk,
      score: candidate.score,
      reasons: candidate.reasons,
    }));
}

function chooseSecondaryCapability(candidates, chosenCapability, repoSignals, steeringPreferences) {
  if (!chosenCapability) {
    return null;
  }
  const fallback = candidates.find((candidate) => candidate.id !== chosenCapability.id) || null;
  if (chosenCapability.id === 'review.deep_review') {
    return candidates.find((candidate) => candidate.id === 'verify.browser')
      || candidates.find((candidate) => candidate.id === 'frontend.ui_review')
      || fallback;
  }
  if (chosenCapability.id === 'frontend.ui_review' || chosenCapability.id === 'frontend.ui_spec') {
    return candidates.find((candidate) => candidate.id === 'verify.browser')
      || candidates.find((candidate) => candidate.id === 'review.deep_review')
      || fallback;
  }
  if (chosenCapability.id === 'ship.release') {
    return candidates.find((candidate) => candidate.id === 'review.deep_review')
      || fallback;
  }
  if (chosenCapability.id === 'execute.quick_patch' && (repoSignals.frontendActive || steeringPreferences.preferBrowser)) {
    return candidates.find((candidate) => candidate.id === 'verify.browser')
      || candidates.find((candidate) => candidate.id === 'frontend.ui_review')
      || fallback;
  }
  if (chosenCapability.id === 'verify.shell' && repoSignals.frontendActive) {
    return candidates.find((candidate) => candidate.id === 'frontend.ui_review')
      || fallback;
  }
  return fallback;
}

function buildRerouteRecommendation(payload) {
  if (payload.repoSignals.frontendActive && !payload.verificationPlan.some((item) => item.includes('ui-review'))) {
    return {
      capability: 'frontend.ui_review',
      command: 'cwf ui-review',
      reason: 'Frontend-active work should escalate into the UI review lane.',
    };
  }
  if (payload.risk.level === 'high' && !payload.verificationPlan.some((item) => item.includes('review'))) {
    return {
      capability: 'review.deep_review',
      command: 'cwf review --heatmap',
      reason: 'High-risk work should add a deep review pass before ship or release.',
    };
  }
  if (payload.confidence < 0.65) {
    return {
      capability: payload.fallbackCapability.id,
      command: `cwf do --explain "${payload.goal}"`,
      reason: 'Routing confidence is low, so the fallback capability should be rechecked with explanation.',
    };
  }
  return null;
}

function recordRouteHistory(cwd, payload) {
  const previous = readJson(routeHistoryPath(cwd), {
    generatedAt: null,
    history: [],
  });
  const next = {
    generatedAt: new Date().toISOString(),
    history: [
      payload,
      ...(previous.history || []),
    ].slice(0, 50),
  };
  writeJson(routeHistoryPath(cwd), next);
  return next;
}

function readRouteHistory(cwd) {
  return readJson(routeHistoryPath(cwd), {
    generatedAt: null,
    history: [],
  });
}

function evaluateRoutePayload(payload) {
  const warnings = [];
  if (payload.confidence < 0.65) {
    warnings.push('Confidence is below the preferred threshold.');
  }
  if (payload.risk.level === 'high' && !payload.verificationPlan.some((item) => item.includes('review'))) {
    warnings.push('High-risk work should include a review pass.');
  }
  if (payload.repoSignals.frontendActive && !payload.verificationPlan.some((item) => item.includes('ui-review'))) {
    warnings.push('Frontend-active tasks should include UI review evidence.');
  }
  return {
    verdict: warnings.length === 0 ? 'pass' : 'warn',
    warnings,
    rerouteSuggested: warnings.length > 0,
    rerouteRecommendation: warnings.length > 0 ? buildRerouteRecommendation(payload) : null,
  };
}

function analyzeIntent(cwd, rootDir, goal, options = {}) {
  const normalizedGoal = normalizeWorkflowControlUtterance(goal);
  const intent = inferIntent(goal);
  const risk = inferRisk(goal);
  const steering = detectSteering(goal);
  const steeringMemory = options.persistSteering === false
    ? buildEphemeralSteeringMemory(goal, steering, options.seedSteeringPreferences || {})
    : persistSteeringMemory(cwd, goal, steering);
  const repoSignals = buildRepoSignals(cwd, rootDir);
  const capabilities = listCapabilities();
  const scored = capabilities
    .map((capability) => {
      const result = scoreCapability(capability, normalizedGoal, intent, repoSignals, steeringMemory.preferences || {}, goal);
      return {
        ...capability,
        score: result.score,
        reasons: result.reasons,
      };
    })
    .filter((capability) => capability.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const candidates = scored.length > 0 ? scored : capabilities.slice(0, 3).map((capability) => ({ ...capability, score: 0, reasons: ['Fallback candidate.'] }));
  const chosenCapability = candidates[0];
  const fallbackCapability = candidates[1] || candidates[0];
  const secondaryCapability = chooseSecondaryCapability(candidates, chosenCapability, repoSignals, steeringMemory.preferences || {});
  const confidence = confidenceForCandidates(candidates);
  const profile = selectCodexProfile({
    analysis: {
      chosenCapability,
      intent,
      risk,
      confidence,
      repoSignals,
    },
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    goal,
    normalizedGoal,
    lane: laneForCapability(chosenCapability),
    chosenCapability,
    fallbackCapability,
    secondaryCapability,
    candidates: candidates.slice(0, 6).map((item) => ({
      id: item.id,
      domain: item.domain,
      risk: item.risk,
      score: item.score,
      reasons: item.reasons,
    })),
    confidence,
    ambiguityReasons: ambiguityReasons(candidates, intent),
    ambiguityClass: ambiguityClass(candidates, intent, confidence),
    intent,
    risk,
    languageMix: inferLanguageMix(goal),
    rejectedAlternatives: buildRejectedAlternatives(candidates, chosenCapability),
    repoSignals,
    steering: steeringMemory.preferences || {},
    verificationPlan: verificationPlanFor(chosenCapability, repoSignals, steeringMemory.preferences || {}),
    evidenceOutputs: chosenCapability.evidenceOutputs,
    profile,
  };
  payload.evaluation = evaluateRoutePayload(payload);
  recordRouteHistory(cwd, payload);
  return payload;
}

module.exports = {
  analyzeIntent,
  evaluateRoutePayload,
  loadSteeringMemory,
  readRouteHistory,
  routeHistoryPath,
  steeringPath,
};
