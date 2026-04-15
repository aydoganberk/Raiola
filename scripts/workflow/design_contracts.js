const path = require('node:path');
const { tryExtractSection } = require('./common');
const { readTextIfExists: readIfExists } = require('./io/files');
const {
  buildFrontendProfile,
  collectComponentInventory,
  collectUiFiles,
  relativePath,
  writeDoc,
} = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

const DESIGN_REFERENCE_PRESETS = Object.freeze([
  {
    id: 'linear-precision',
    label: 'Linear Precision',
    source: 'awesome-design-md / linear.app',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/linear.app',
    signature: 'Precise hierarchy, thin borders, disciplined density, and confident restraint.',
    categories: ['analytics-platform', 'b2b-saas', 'developer-tool'],
    archetypes: ['control-plane', 'saas-app'],
    tastes: ['operator-dense', 'premium-minimal'],
    cues: ['precision', 'timeline', 'command', 'dashboard', 'workspace', 'project', 'roadmap'],
    strengths: ['structure', 'density'],
    adopt: [
      'Use crisp containment and obvious hierarchy instead of oversized chrome.',
      'Keep operational lists, tables, and command surfaces tightly aligned.',
      'Let layout rhythm and state clarity do more work than decorative styling.',
    ],
    avoid: [
      'Do not flood the UI with colorful badges or heavy gradients.',
      'Do not replace high-signal list/table patterns with oversized marketing cards.',
    ],
  },
  {
    id: 'cursor-editorial',
    label: 'Cursor Editorial Warmth',
    source: 'awesome-design-md / cursor',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/cursor',
    signature: 'Warm editorial contrast, memorable typography, and premium-but-technical calm.',
    categories: ['developer-tool', 'marketing-site', 'b2b-saas'],
    archetypes: ['editorial-marketing', 'saas-app', 'content-studio'],
    tastes: ['premium-minimal', 'editorial-contrast'],
    cues: ['editorial', 'hero', 'launch', 'product story', 'developer'],
    strengths: ['typography', 'hero'],
    adopt: [
      'Use typography and surface temperature to make technical products feel crafted.',
      'Keep one authored hero or lead section that gives the page a point of view.',
      'Favor warm neutrals and strong type rhythm over generic monochrome SaaS tropes.',
    ],
    avoid: [
      'Do not default to sterile grayscale minimalism.',
      'Do not use startup-cliche blob art or interchangeable feature grids.',
    ],
  },
  {
    id: 'cohere-data-rich',
    label: 'Cohere Data-Rich',
    source: 'awesome-design-md / cohere',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/cohere',
    signature: 'Enterprise credibility, data-forward composition, and restrained gradient energy.',
    categories: ['ai-platform', 'analytics-platform', 'b2b-saas'],
    archetypes: ['control-plane', 'saas-app', 'editorial-marketing'],
    tastes: ['operator-dense', 'premium-minimal', 'glass-soft'],
    cues: ['enterprise', 'model', 'platform', 'infrastructure', 'data'],
    strengths: ['sectioning', 'accent'],
    adopt: [
      'Use clear section framing so sophisticated product claims stay legible.',
      'Reserve richer color or gradient moments for one or two intentional emphasis surfaces.',
      'Make proof and product explanation feel structured rather than decorative.',
    ],
    avoid: [
      'Do not let gradient energy overpower readability or trust.',
      'Do not mix too many accent colors across the same screen family.',
    ],
  },
  {
    id: 'opencode-terminal',
    label: 'OpenCode Terminal Honesty',
    source: 'awesome-design-md / opencode.ai',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/opencode.ai',
    signature: 'Terminal-native sharpness, monospace credibility, and brutally clear interaction cues.',
    categories: ['developer-tool', 'ai-platform', 'content-studio'],
    archetypes: ['content-studio', 'saas-app', 'editorial-marketing'],
    tastes: ['semantic-minimal', 'operator-dense', 'brutalist-utility'],
    cues: ['terminal', 'cli', 'agent', 'code', 'editor', 'repo'],
    strengths: ['voice', 'utility'],
    adopt: [
      'Use mono or technical typography intentionally where product credibility benefits from it.',
      'Keep the palette narrow and functional so actions read instantly.',
      'Make buttons, links, and states explicit instead of atmospheric.',
    ],
    avoid: [
      'Do not add glossy marketing polish that weakens technical trust.',
      'Do not mix multiple font personalities when the product voice should stay tool-like.',
    ],
  },
  {
    id: 'voltagent-command',
    label: 'VoltAgent Command Energy',
    source: 'awesome-design-md / voltagent',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/voltagent',
    signature: 'Dark command-center focus, signal-color discipline, and architecture-first storytelling.',
    categories: ['ai-platform', 'developer-tool', 'analytics-platform'],
    archetypes: ['control-plane', 'editorial-marketing'],
    tastes: ['operator-dense', 'glass-soft', 'premium-minimal'],
    cues: ['agent', 'command center', 'workflow', 'automation', 'orchestration'],
    strengths: ['accent', 'technical-storytelling'],
    adopt: [
      'Use one signal accent color with discipline instead of a rainbow of status hues.',
      'Let code, workflow diagrams, or architecture content act as hero material when relevant.',
      'Use dark surfaces only when they strengthen focus and contrast, not as a default trend choice.',
    ],
    avoid: [
      'Do not turn every surface into a glowing cyberpunk panel.',
      'Do not use generic blue enterprise chrome when the product needs stronger technical character.',
    ],
  },
  {
    id: 'replicate-cleanroom',
    label: 'Replicate Cleanroom',
    source: 'awesome-design-md / replicate',
    sourceUrl: 'https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/replicate',
    signature: 'Clean white canvas, product-forward demos, and code-aware credibility without visual noise.',
    categories: ['ai-platform', 'marketing-site', 'b2b-saas', 'service-business'],
    archetypes: ['editorial-marketing', 'saas-app'],
    tastes: ['premium-minimal', 'semantic-minimal'],
    cues: ['clean', 'demo', 'landing', 'showcase', 'product'],
    strengths: ['surface-calm', 'product-demo'],
    adopt: [
      'Keep the canvas calm so the product and proof points do the talking.',
      'Use screenshots, demos, or concrete outputs as first-class visual material.',
      'Preserve code or technical credibility without making the page feel like an IDE clone.',
    ],
    avoid: [
      'Do not over-dramatize dark mode when the brand signal is clarity.',
      'Do not make the hero more abstract than the product itself.',
    ],
  },
]);

const PRODUCT_CATEGORIES = Object.freeze([
  {
    id: 'developer-tool',
    label: 'Developer Tool',
    summary: 'Tooling for builders where technical credibility, scan speed, and product truth beat generic SaaS polish.',
    archetypes: ['control-plane', 'saas-app', 'content-studio'],
    cues: ['developer', 'devtool', 'sdk', 'api', 'cli', 'editor', 'ide', 'repo', 'git', 'debug', 'terminal', 'code'],
    defaultReferences: ['linear-precision', 'opencode-terminal', 'cursor-editorial'],
    stateBias: ['loading', 'empty', 'filtered-empty', 'error', 'success', 'destructive-confirmation', 'long-running', 'offline', 'permissions'],
    antiPatterns: [
      'Do not make a developer product look like a generic B2B template.',
      'Do not sacrifice technical trust for playful marketing decoration.',
    ],
  },
  {
    id: 'ai-platform',
    label: 'AI Platform',
    summary: 'AI-native products need clear system trust, concrete product proof, and one controlled signature energy source.',
    archetypes: ['control-plane', 'editorial-marketing', 'content-studio'],
    cues: ['ai', 'agent', 'copilot', 'model', 'chat', 'llm', 'prompt', 'automation', 'inference'],
    defaultReferences: ['cohere-data-rich', 'voltagent-command', 'replicate-cleanroom'],
    stateBias: ['loading', 'empty', 'error', 'partial-data', 'success', 'destructive-confirmation', 'long-running', 'offline'],
    antiPatterns: [
      'Do not default to purple/pink AI gradients unless the brand explicitly earns them.',
      'Do not make trust-critical product surfaces feel mystical or vague.',
    ],
  },
  {
    id: 'analytics-platform',
    label: 'Analytics Platform',
    summary: 'Data-heavy products need dense but legible hierarchy, evidence rails, and stable state design.',
    archetypes: ['control-plane', 'saas-app'],
    cues: ['analytics', 'dashboard', 'metrics', 'monitoring', 'operations', 'ops', 'reporting', 'admin', 'control plane'],
    defaultReferences: ['linear-precision', 'cohere-data-rich', 'voltagent-command'],
    stateBias: ['loading', 'empty', 'filtered-empty', 'error', 'partial-data', 'success', 'destructive-confirmation', 'offline', 'permissions'],
    antiPatterns: [
      'Do not replace data relationships with oversized decorative cards.',
      'Do not bury status, risk, or primary actions below fold-heavy hero chrome.',
    ],
  },
  {
    id: 'b2b-saas',
    label: 'B2B SaaS',
    summary: 'B2B products should feel trustworthy, composable, and systematic before they feel flashy.',
    archetypes: ['saas-app', 'control-plane'],
    cues: ['saas', 'workspace', 'team', 'billing', 'settings', 'members', 'permissions', 'account', 'projects'],
    defaultReferences: ['linear-precision', 'cursor-editorial', 'replicate-cleanroom'],
    stateBias: ['loading', 'empty', 'error', 'success', 'destructive-confirmation', 'form-validation', 'first-run'],
    antiPatterns: [
      'Do not over-brand routine app surfaces at the cost of clarity.',
      'Do not let marketing hero conventions leak into core task flows.',
    ],
  },
  {
    id: 'mobile-consumer-app',
    label: 'Mobile Consumer App',
    summary: 'Mobile-first consumer products need short task paths, gesture discipline, and trustworthy state handling before visual flourish.',
    archetypes: ['saas-app', 'content-studio', 'commerce'],
    cues: ['mobile', 'flutter', 'ios', 'android', 'consumer app', 'screen flow', 'tab bar', 'bottom sheet', 'swipe', 'gesture'],
    defaultReferences: ['replicate-cleanroom', 'cursor-editorial', 'opencode-terminal'],
    stateBias: ['loading', 'empty', 'error', 'success', 'offline', 'permissions', 'first-run', 'form-validation'],
    antiPatterns: [
      'Do not force desktop information architecture onto a phone-first flow.',
      'Do not hide critical feedback behind gestures users have to rediscover.',
    ],
  },
  {
    id: 'marketing-site',
    label: 'Marketing Site',
    summary: 'Narrative product pages need authored hierarchy, product proof, and unmistakable calls to action.',
    archetypes: ['editorial-marketing'],
    cues: ['marketing', 'landing', 'pricing', 'hero', 'campaign', 'homepage', 'brand', 'story'],
    defaultReferences: ['cursor-editorial', 'replicate-cleanroom', 'cohere-data-rich'],
    stateBias: ['loading', 'success', 'error', 'form-validation', 'mobile-nav'],
    antiPatterns: [
      'Do not ship interchangeable feature-grid startup pages.',
      'Do not make the page more abstract than the product story.',
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    summary: 'Commerce UI should reduce decision friction while preserving trust, product clarity, and conversion focus.',
    archetypes: ['commerce', 'editorial-marketing'],
    cues: ['commerce', 'ecommerce', 'shop', 'store', 'catalog', 'checkout', 'cart', 'product', 'inventory'],
    defaultReferences: ['replicate-cleanroom', 'cursor-editorial', 'linear-precision'],
    stateBias: ['loading', 'empty', 'filtered-empty', 'error', 'success', 'form-validation', 'out-of-stock', 'cart-error', 'checkout-success'],
    antiPatterns: [
      'Do not let visual experimentation weaken trust or purchase clarity.',
      'Do not hide pricing, availability, or checkout recovery paths.',
    ],
  },
  {
    id: 'service-business',
    label: 'Service Business',
    summary: 'Booking and service sites should feel trustworthy, calming, and dead-simple to act on.',
    archetypes: ['editorial-marketing', 'saas-app'],
    cues: ['booking', 'appointment', 'reservation', 'clinic', 'spa', 'salon', 'restaurant', 'hotel', 'service'],
    defaultReferences: ['cursor-editorial', 'replicate-cleanroom', 'linear-precision'],
    stateBias: ['loading', 'empty', 'error', 'success', 'form-validation', 'booking-success', 'booking-error', 'mobile-nav'],
    antiPatterns: [
      'Do not overload service pages with product-style dashboard density.',
      'Do not make booking confirmation or failure states feel generic.',
    ],
  },
  {
    id: 'content-studio',
    label: 'Content Studio',
    summary: 'Creation tools need quiet chrome, resilient states, and strong focus on the work area.',
    archetypes: ['content-studio', 'saas-app'],
    cues: ['studio', 'editor', 'compose', 'publish', 'cms', 'draft', 'media', 'asset', 'library'],
    defaultReferences: ['opencode-terminal', 'cursor-editorial', 'linear-precision'],
    stateBias: ['loading', 'empty', 'error', 'success', 'long-running', 'offline', 'permissions', 'form-validation'],
    antiPatterns: [
      'Do not let navigation chrome compete with the creation surface.',
      'Do not make save/publish feedback ambiguous or easy to miss.',
    ],
  },
]);

const STATE_LIBRARY = Object.freeze({
  loading: {
    id: 'loading',
    label: 'Loading shell',
    priority: 'required',
    appliesTo: 'Any async screen or panel before data lands.',
    evidenceSignals: ['loading'],
    guidance: 'Use skeletons or layout-preserving placeholders so hierarchy does not jump.',
    copyRule: 'If loading may exceed a short beat, explain what is being prepared.',
    recovery: 'Offer passive progress first; avoid spinner-only dead air.',
  },
  empty: {
    id: 'empty',
    label: 'Empty state',
    priority: 'required',
    appliesTo: 'First-use screens, cleared workspaces, or zero-data surfaces.',
    evidenceSignals: ['empty'],
    guidance: 'Explain what the page is for and provide one obvious next step.',
    copyRule: 'Use calm, specific language instead of joke copy.',
    recovery: 'Give users a primary action, sample data, or clear setup path.',
  },
  'filtered-empty': {
    id: 'filtered-empty',
    label: 'Filtered empty',
    priority: 'required',
    appliesTo: 'Search, filters, faceted views, and narrowed result sets.',
    evidenceSignals: ['empty', 'interaction'],
    guidance: 'Differentiate no-results from first-use empty; keep reset actions close.',
    copyRule: 'State which filter or query caused the empty result if possible.',
    recovery: 'Offer clear reset, broaden search, or remove-filter actions.',
  },
  error: {
    id: 'error',
    label: 'Error recovery',
    priority: 'required',
    appliesTo: 'Failed fetches, broken actions, and unavailable downstream systems.',
    evidenceSignals: ['error'],
    guidance: 'Make the failure visible, explain the next safe action, and preserve user context.',
    copyRule: 'Say what failed and what the user can try next.',
    recovery: 'Provide retry, alternative path, or support escalation.',
  },
  'partial-data': {
    id: 'partial-data',
    label: 'Partial data',
    priority: 'important',
    appliesTo: 'Dashboards, multi-panel pages, or degraded-but-usable surfaces.',
    evidenceSignals: ['error', 'loading'],
    guidance: 'Show what is still usable and isolate the degraded area instead of blanking the whole page.',
    copyRule: 'Identify which region is stale, delayed, or unavailable.',
    recovery: 'Offer panel-level retry or refresh without destroying the rest of the view.',
  },
  success: {
    id: 'success',
    label: 'Success confirmation',
    priority: 'required',
    appliesTo: 'Create, save, submit, publish, or complete flows.',
    evidenceSignals: ['success'],
    guidance: 'Confirm completion and surface the next meaningful action.',
    copyRule: 'Prefer specific completion language over a generic “done”.',
    recovery: 'If reversible, pair the confirmation with undo or view-details affordances.',
  },
  'destructive-confirmation': {
    id: 'destructive-confirmation',
    label: 'Destructive confirmation',
    priority: 'required',
    appliesTo: 'Delete, revoke, archive, disconnect, or irreversible actions.',
    evidenceSignals: ['interaction', 'error'],
    guidance: 'Slow users down just enough to confirm impact and recovery options.',
    copyRule: 'Name exactly what will be lost and whether it is reversible.',
    recovery: 'Offer cancel, secondary safeguards, or undo when available.',
  },
  'long-running': {
    id: 'long-running',
    label: 'Long-running task',
    priority: 'important',
    appliesTo: 'Imports, exports, AI generations, builds, or workflow jobs.',
    evidenceSignals: ['loading', 'success'],
    guidance: 'Use progressive status updates and avoid trapping users in a blocking modal when backgrounding is viable.',
    copyRule: 'Communicate progress, latency expectations, and what users can do meanwhile.',
    recovery: 'Provide backgrounding, status history, or resumable follow-up paths.',
  },
  offline: {
    id: 'offline',
    label: 'Offline or reconnecting',
    priority: 'important',
    appliesTo: 'Apps with async sync, live data, or remote saves.',
    evidenceSignals: ['error'],
    guidance: 'Make connection state legible without hijacking the whole interface.',
    copyRule: 'State whether work is queued, stale, or blocked.',
    recovery: 'Offer reconnect guidance and protect unsaved work where possible.',
  },
  permissions: {
    id: 'permissions',
    label: 'Permission or access block',
    priority: 'important',
    appliesTo: 'Admin, billing, settings, and restricted tools.',
    evidenceSignals: ['error'],
    guidance: 'Explain the access boundary and the next escalation path.',
    copyRule: 'State missing permission in plain language.',
    recovery: 'Offer request-access, switch-account, or contact-admin paths.',
  },
  'first-run': {
    id: 'first-run',
    label: 'First-run onboarding',
    priority: 'important',
    appliesTo: 'Fresh accounts, empty workspaces, and setup-required SaaS surfaces.',
    evidenceSignals: ['empty', 'success'],
    guidance: 'Turn first-run from a dead end into a guided starting point.',
    copyRule: 'Explain value before configuration detail overwhelms the user.',
    recovery: 'Offer sample content, guided setup, or one clear initialization action.',
  },
  'form-validation': {
    id: 'form-validation',
    label: 'Form validation',
    priority: 'required',
    appliesTo: 'Lead forms, checkout, settings, auth, and booking flows.',
    evidenceSignals: ['error', 'interaction'],
    guidance: 'Make field issues local, specific, and easy to fix without losing progress.',
    copyRule: 'Attach messages to fields and avoid vague banner-only errors.',
    recovery: 'Keep user input intact and focus the first broken field.',
  },
  'mobile-nav': {
    id: 'mobile-nav',
    label: 'Mobile navigation state',
    priority: 'important',
    appliesTo: 'Landing pages and information-heavy responsive sites.',
    evidenceSignals: ['interaction'],
    guidance: 'Collapsed navigation should feel purposeful, not like a desktop menu squeezed smaller.',
    copyRule: 'Keep labels short and obvious.',
    recovery: 'Preserve active-state clarity and escape paths.',
  },
  'out-of-stock': {
    id: 'out-of-stock',
    label: 'Out of stock',
    priority: 'important',
    appliesTo: 'Commerce catalog, PDP, and checkout-adjacent surfaces.',
    evidenceSignals: ['empty', 'error'],
    guidance: 'Make availability status unmissable without derailing product comparison.',
    copyRule: 'Explain whether restock, waitlist, or alternative options exist.',
    recovery: 'Offer notify-me, related products, or variant switching.',
  },
  'cart-error': {
    id: 'cart-error',
    label: 'Cart or checkout interruption',
    priority: 'required',
    appliesTo: 'Commerce flows with pricing, shipping, or inventory recalculation.',
    evidenceSignals: ['error', 'success'],
    guidance: 'Keep the cart recoverable and preserve trust under pricing or stock changes.',
    copyRule: 'Name the exact issue: payment, stock, address, or shipping.',
    recovery: 'Preserve selections and provide a direct fix path.',
  },
  'checkout-success': {
    id: 'checkout-success',
    label: 'Order confirmed',
    priority: 'required',
    appliesTo: 'Post-purchase confirmation and receipt surfaces.',
    evidenceSignals: ['success'],
    guidance: 'Reassure the user that the purchase completed and what happens next.',
    copyRule: 'Show order details, next steps, and support fallback.',
    recovery: 'Provide receipt, tracking, or account handoff.',
  },
  'booking-success': {
    id: 'booking-success',
    label: 'Booking confirmed',
    priority: 'required',
    appliesTo: 'Appointments, reservations, and service confirmations.',
    evidenceSignals: ['success'],
    guidance: 'Confirmation should feel calm, trustworthy, and calendar-ready.',
    copyRule: 'Include time, place, and what to expect next.',
    recovery: 'Offer reschedule, cancel, or contact paths.',
  },
  'booking-error': {
    id: 'booking-error',
    label: 'Booking failed',
    priority: 'required',
    appliesTo: 'Reservation or appointment submission flows.',
    evidenceSignals: ['error', 'form-validation'],
    guidance: 'Explain whether the slot, payment, or form details caused the issue.',
    copyRule: 'Avoid generic failure language; point users to a fix path.',
    recovery: 'Preserve entered information and suggest alternate slots if possible.',
  },
});

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function cueRegex(cue) {
  return new RegExp(`\\b${escapeRegExp(cue).replace(/\\ /g, '\\s+')}\\b`, 'i');
}

function buildContextText(rootDir, options = {}) {
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  return [
    tryExtractSection(contextDoc, 'User Intent', ''),
    tryExtractSection(contextDoc, 'Problem Frame', ''),
    tryExtractSection(contextDoc, 'Touched Files', ''),
    options.goal || '',
  ].join('\n');
}

function scoreWithCues(cues, text) {
  return cues.reduce((score, cue) => (cueRegex(cue).test(text) ? score + 1 : score), 0);
}

function inferProductCategory(direction, contextText, profile) {
  const text = normalizeText(contextText);
  const scored = PRODUCT_CATEGORIES.map((entry) => {
    let score = scoreWithCues(entry.cues, text);
    if (entry.archetypes.includes(direction.archetype.id)) {
      score += 2;
    }
    if (entry.id === 'mobile-consumer-app' && profile.productSurface?.id === 'mobile-app') {
      score += 6;
    }
    if (entry.id === 'developer-tool' && /\b(codex|workflow|terminal|code|cli)\b/.test(text)) {
      score += 1;
    }
    if (entry.id === 'ai-platform' && /\b(ai|agent|copilot|llm|model|chat)\b/.test(text)) {
      score += 2;
    }
    if (entry.id === 'developer-tool' && direction.archetype.id === 'editorial-marketing' && /\b(developer|code|cli|sdk|api|editor|terminal)\b/.test(text)) {
      score += 2;
    }
    if (entry.id === 'ai-platform' && direction.archetype.id === 'editorial-marketing' && /\b(ai|agent|copilot|llm|model|chat)\b/.test(text)) {
      score += 2;
    }
    if (entry.id === 'analytics-platform' && direction.archetype.id === 'control-plane') {
      score += 1;
    }
    if (entry.id === 'content-studio' && profile.stack.forms.length > 0 && /\b(editor|publish|draft)\b/.test(text)) {
      score += 1;
    }
    if (profile.productSurface?.id === 'mobile-app' && ['marketing-site', 'developer-tool', 'ai-platform'].includes(entry.id)) {
      score -= 2;
    }
    if (entry.id === 'marketing-site' && /\b(developer|ai|agent|dashboard|workspace|platform|saas|editor)\b/.test(text)) {
      score -= 1;
    }
    return { entry, score };
  }).sort((left, right) => right.score - left.score);

  const winner = scored[0]?.score > 0
    ? scored[0].entry
    : PRODUCT_CATEGORIES.find((entry) => entry.archetypes.includes(direction.archetype.id))
      || PRODUCT_CATEGORIES.find((entry) => entry.id === 'b2b-saas')
      || PRODUCT_CATEGORIES[0];
  const reason = scored[0]?.score > 0
    ? `Matched ${winner.label.toLowerCase()} cues in the current goal/context and aligned with the ${direction.archetype.label} archetype.`
    : `Fell back to ${winner.label.toLowerCase()} because it best matches the ${direction.archetype.label} archetype.`;

  return {
    ...winner,
    reason,
  };
}

function scoreReferencePreset(entry, category, direction, contextText) {
  let score = 0;
  if (entry.categories.includes(category.id)) {
    score += 3;
  }
  if (entry.archetypes.includes(direction.archetype.id)) {
    score += 2;
  }
  if (entry.tastes.includes(direction.taste.profile.id)) {
    score += 2;
  }
  score += scoreWithCues(entry.cues, normalizeText(contextText));
  if (category.defaultReferences.includes(entry.id)) {
    score += 1;
  }
  return score;
}

function rankReferencePresets(category, direction, contextText) {
  const ranked = DESIGN_REFERENCE_PRESETS
    .map((entry) => ({ entry, score: scoreReferencePreset(entry, category, direction, contextText) }))
    .sort((left, right) => right.score - left.score);

  const selected = [];
  for (const candidate of ranked) {
    if (candidate.score <= 0 && selected.length >= 3) {
      break;
    }
    if (!selected.some((item) => item.id === candidate.entry.id)) {
      selected.push({
        ...candidate.entry,
        score: candidate.score,
        matchReason: candidate.score > 0
          ? `${candidate.entry.label} matched the current product category, taste, or archetype signals.`
          : 'Selected as a safe fallback reference for the current product type.',
      });
    }
    if (selected.length >= 4) {
      break;
    }
  }

  for (const referenceId of category.defaultReferences) {
    const preset = DESIGN_REFERENCE_PRESETS.find((entry) => entry.id === referenceId);
    if (preset && !selected.some((item) => item.id === preset.id)) {
      selected.push({
        ...preset,
        score: 0,
        matchReason: 'Added as a default benchmark for this product category.',
      });
    }
    if (selected.length >= 4) {
      break;
    }
  }

  return selected.slice(0, 3);
}

function pickReferenceForRole(references, role, fallbackIndex = 0) {
  return references.find((entry) => entry.strengths.includes(role)) || references[Math.min(fallbackIndex, references.length - 1)];
}

function buildBlend(references, direction, category) {
  const structure = pickReferenceForRole(references, 'structure', 0);
  const typography = pickReferenceForRole(references, 'typography', 1);
  const accent = pickReferenceForRole(references, 'accent', 2) || pickReferenceForRole(references, 'surface-calm', 2);
  return {
    summary: `${structure.label} structure + ${typography.label} type cues + ${accent.label} accent restraint`,
    structure: structure.label,
    typography: typography.label,
    accent: accent.label,
    decisionOrder: [
      `Prefer ${structure.label} for hierarchy, rails, density, and section framing.`,
      `Borrow type rhythm and voice cues from ${typography.label} without cloning the entire brand.`,
      `Use ${accent.label} only as a controlled energy source so ${category.label.toLowerCase()} trust stays intact.`,
    ],
    mergeRule: `When references disagree, keep ${direction.taste.profile.label} clarity and ${category.label.toLowerCase()} usability above stylistic novelty.`,
  };
}

function buildNorthStar(category, direction, blend) {
  return {
    title: `${category.label} with ${direction.taste.profile.label} discipline`,
    promise: category.summary,
    executionBias: `Build toward ${blend.summary}.`,
    constraint: `Use the ${direction.archetype.label} archetype as the shell rule and ${direction.taste.profile.label} as the tie-breaker when multiple UI directions seem valid.`,
  };
}

function buildCodexRules(direction, category, blend, references) {
  return [
    `Start from ${blend.structure} hierarchy before adding expressive details.`,
    `Use ${direction.taste.profile.label} tokens and ${category.label.toLowerCase()} expectations as the decision rule for new components.`,
    `Reference ${references.map((entry) => entry.label).join(', ')} for composition cues, not for literal cloning.`,
    'Patch loading, empty, error, and success coverage in the same pass as visual polish whenever possible.',
    'If the screen starts to look like a generic template, tighten type rhythm, section hierarchy, and proof surfaces before adding new effects.',
  ];
}

function buildDesignDnaPayload(cwd, rootDir, direction, options = {}) {
  const profile = direction?.profile || buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const contextText = buildContextText(rootDir, options);
  const category = inferProductCategory(direction, contextText, profile);
  const references = rankReferencePresets(category, direction, contextText);
  const blend = buildBlend(references, direction, category);
  const northStar = buildNorthStar(category, direction, blend);
  const antiPatterns = unique([
    ...category.antiPatterns,
    ...(direction.antiPatterns || []),
    ...references.flatMap((entry) => entry.avoid || []),
  ]);
  const codexRules = buildCodexRules(direction, category, blend, references);

  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    productSurface: profile.productSurface,
    productCategory: {
      id: category.id,
      label: category.label,
      summary: category.summary,
      reason: category.reason,
    },
    northStar,
    blend,
    references: references.map((entry) => ({
      id: entry.id,
      label: entry.label,
      source: entry.source,
      sourceUrl: entry.sourceUrl,
      signature: entry.signature,
      matchReason: entry.matchReason,
      adopt: entry.adopt,
      avoid: entry.avoid,
      strengths: entry.strengths,
    })),
    antiPatterns,
    codexRules,
    stateBias: [...category.stateBias],
  };
}

function renderDesignDnaMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Product surface: \`${payload.productSurface.label}\``,
    `- Surface reason: ${payload.productSurface.reason}`,
    `- Product category: \`${payload.productCategory.label}\``,
    `- Why: ${payload.productCategory.reason}`,
    `- Reference blend: \`${payload.blend.summary}\``,
    '',
    '## North Star',
    '',
    `- Title: \`${payload.northStar.title}\``,
    `- Promise: ${payload.northStar.promise}`,
    `- Execution bias: ${payload.northStar.executionBias}`,
    `- Constraint: ${payload.northStar.constraint}`,
    '',
    '## Reference Blend',
    '',
    `- Structure lead: \`${payload.blend.structure}\``,
    `- Typography lead: \`${payload.blend.typography}\``,
    `- Accent lead: \`${payload.blend.accent}\``,
    ...payload.blend.decisionOrder.map((item) => `- ${item}`),
    `- Merge rule: ${payload.blend.mergeRule}`,
    '',
    '## Reference Presets',
    '',
    ...payload.references.flatMap((entry) => ([
      `### ${entry.label}`,
      '',
      `- Source: [${entry.source}](${entry.sourceUrl})`,
      `- Signature: ${entry.signature}`,
      `- Why chosen: ${entry.matchReason}`,
      ...entry.adopt.map((item) => `- Adopt: ${item}`),
      ...entry.avoid.map((item) => `- Avoid: ${item}`),
      '',
    ])),
    '## Anti-Pattern Bans',
    '',
    ...payload.antiPatterns.map((item) => `- ${item}`),
    '',
    '## Codex Rules',
    '',
    ...payload.codexRules.map((item) => `- ${item}`),
    '',
    '## State Bias',
    '',
    ...payload.stateBias.map((item) => `- \`${item}\``),
  ];
  return lines.join('\n');
}

function buildDesignDnaDoc(cwd, rootDir, direction, options = {}) {
  const payload = buildDesignDnaPayload(cwd, rootDir, direction, options);
  const filePath = writeDoc(path.join(rootDir, 'DESIGN-DNA.md'), 'DESIGN DNA', renderDesignDnaMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'design-dna.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });
  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function buildStateIds(category, direction, profile, contextText, surfaceSignals = {}) {
  const selected = new Set(category.stateBias);
  if (profile.stack.forms.length > 0 || surfaceSignals.hasFormSurface || /\b(form|submit|signup|contact|settings|lead)\b/i.test(contextText)) {
    selected.add('form-validation');
  }
  if (profile.productSurface?.id === 'mobile-app') {
    selected.add('offline');
    selected.add('permissions');
    selected.add('first-run');
  }
  if (direction.archetype.id === 'editorial-marketing') {
    selected.add('mobile-nav');
  }
  if (direction.archetype.id === 'control-plane') {
    selected.add('filtered-empty');
    selected.add('partial-data');
    selected.add('permissions');
  }
  if (direction.archetype.id === 'content-studio') {
    selected.add('long-running');
    selected.add('offline');
  }
  if (category.id === 'commerce') {
    selected.add('out-of-stock');
    selected.add('cart-error');
    selected.add('checkout-success');
  }
  if (category.id === 'service-business') {
    selected.add('booking-success');
    selected.add('booking-error');
  }
  return [...selected].filter((id) => STATE_LIBRARY[id]);
}

function buildScreenCoverage(direction, states) {
  const essential = states.filter((item) => item.priority === 'required').map((item) => item.id);
  return direction.screenBlueprints.map((entry, index) => {
    const row = {
      screen: entry.title,
      recipe: entry.recipe,
      states: essential.slice(0, index === 0 ? 4 : 5),
    };
    if (/split-pane|table|operations/i.test(entry.title)) {
      row.states = unique([...row.states, 'filtered-empty', 'partial-data', 'permissions']);
    }
    if (/detail/i.test(entry.title)) {
      row.states = unique([...row.states, 'error', 'success', 'destructive-confirmation']);
    }
    return row;
  });
}

function buildStateAtlasPayload(cwd, rootDir, direction, designDna, options = {}) {
  const profile = direction?.profile || buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const contextText = buildContextText(rootDir, options);
  const hasFormSurface = collectUiFiles(cwd).some((file) => /<(form|input|select|textarea)\b/i.test(readIfExists(path.join(cwd, file))));
  const category = (designDna?.productCategory?.id
    ? PRODUCT_CATEGORIES.find((entry) => entry.id === designDna.productCategory.id)
    : null)
    || inferProductCategory(direction, contextText, profile);
  const stateIds = buildStateIds(category, direction, profile, contextText, { hasFormSurface });
  const states = stateIds.map((id) => ({ ...STATE_LIBRARY[id] }));
  const required = states.filter((entry) => entry.priority === 'required').map((entry) => entry.id);
  const screenCoverage = buildScreenCoverage(direction, states);
  const atlasGuidance = [
    'First pass should land all required states before decorative polish.',
    'When a state belongs to one panel, isolate it there instead of blanking the entire screen.',
    'Every success or failure state should point users to the next safe action.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    productSurface: profile.productSurface,
    productCategory: {
      id: category.id,
      label: category.label,
    },
    stateCount: states.length,
    requiredStates: required,
    states,
    screenCoverage,
    atlasGuidance,
  };
}

function renderStateAtlasMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Product surface: \`${payload.productSurface.label}\``,
    `- Product category: \`${payload.productCategory.label}\``,
    `- State families: \`${payload.stateCount}\``,
    `- Required in first pass: \`${payload.requiredStates.join(', ')}\``,
    '',
    '## State Families',
    '',
    ...payload.states.flatMap((entry) => ([
      `### ${entry.label}`,
      '',
      `- Id: \`${entry.id}\``,
      `- Priority: \`${entry.priority}\``,
      `- Applies to: ${entry.appliesTo}`,
      `- Evidence signals: \`${entry.evidenceSignals.join(', ')}\``,
      `- Guidance: ${entry.guidance}`,
      `- Copy rule: ${entry.copyRule}`,
      `- Recovery: ${entry.recovery}`,
      '',
    ])),
    '## Screen Coverage',
    '',
    ...payload.screenCoverage.flatMap((entry) => ([
      `### ${entry.screen}`,
      '',
      `- Blueprint: ${entry.recipe}`,
      `- States: \`${entry.states.join(', ')}\``,
      '',
    ])),
    '## Atlas Guidance',
    '',
    ...payload.atlasGuidance.map((item) => `- ${item}`),
  ];
  return lines.join('\n');
}

function buildStateAtlasDoc(cwd, rootDir, direction, designDna, options = {}) {
  const payload = buildStateAtlasPayload(cwd, rootDir, direction, designDna, options);
  const filePath = writeDoc(path.join(rootDir, 'STATE-ATLAS.md'), 'STATE ATLAS', renderStateAtlasMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'state-atlas.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });
  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function buildDesignContractAudit(designDna, stateAtlas, audits = {}) {
  const missingStates = audits.missingStateAudit?.missing || [];
  const tokenDriftAudit = audits.tokenDriftAudit || { totalIssues: 0 };
  const browserArtifacts = audits.browserArtifacts || [];
  const missingRequiredStates = stateAtlas.states
    .filter((entry) => entry.priority === 'required')
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      missingSignals: entry.evidenceSignals.filter((signal) => missingStates.includes(signal)),
    }))
    .filter((entry) => entry.missingSignals.length > 0);

  const concerns = [];
  if (browserArtifacts.length === 0) {
    concerns.push({
      area: 'visual evidence',
      severity: 'medium',
      detail: 'No browser evidence exists yet, so design-reference alignment stays unverified.',
    });
  }
  if (missingRequiredStates.length > 0) {
    concerns.push({
      area: 'state atlas coverage',
      severity: missingRequiredStates.some((entry) => ['loading', 'empty', 'error', 'success'].includes(entry.id)) ? 'high' : 'medium',
      detail: `Required atlas states are still missing evidence for: ${missingRequiredStates.map((entry) => entry.id).join(', ')}.`,
    });
  }
  if (tokenDriftAudit.totalIssues > 0) {
    concerns.push({
      area: 'reference fidelity',
      severity: tokenDriftAudit.totalIssues >= 3 ? 'medium' : 'low',
      detail: `${tokenDriftAudit.totalIssues} token drift signal(s) weaken the consistency promised by the current design DNA.`,
    });
  }

  const verdict = concerns.some((entry) => entry.severity === 'high')
    ? 'fail'
    : concerns.some((entry) => entry.severity === 'medium')
      ? 'warn'
      : 'pass';
  const score = Math.max(
    1,
    Number((5
      - (concerns.some((entry) => entry.severity === 'high') ? 1.8 : 0)
      - (concerns.filter((entry) => entry.severity === 'medium').length * 0.6)
      - (concerns.filter((entry) => entry.severity === 'low').length * 0.2)).toFixed(1)),
  );

  return {
    verdict,
    score,
    referenceBlend: designDna.blend.summary,
    primaryReferences: designDna.references.map((entry) => entry.label),
    requiredStates: stateAtlas.requiredStates,
    missingRequiredStates,
    concerns,
    guidance: verdict === 'pass'
      ? 'The current review surface matches the active design DNA and required state atlas at a contract level.'
      : verdict === 'warn'
        ? 'Tighten state coverage and visual consistency before treating the design contract as met.'
        : 'Fix the missing required states before trusting the current frontend as design-complete.',
  };
}

module.exports = {
  buildDesignContractAudit,
  buildDesignDnaDoc,
  buildDesignDnaPayload,
  buildStateAtlasDoc,
  buildStateAtlasPayload,
};
