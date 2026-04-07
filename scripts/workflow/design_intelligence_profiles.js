const TASTE_PROFILES = Object.freeze([
  {
    id: 'operator-dense',
    label: 'Operator Dense',
    cues: ['operator', 'ops', 'dashboard', 'control plane', 'dense', 'enterprise', 'command center', 'kontrol', 'operasyon'],
    visualTone: 'quiet precision with dense information and strong alignment',
    density: 'compact but breathable',
    motion: 'micro-motion only for state change, selection, and live status',
    hierarchy: 'sticky shell, obvious priorities, and stable summary rails',
    designTokens: {
      typeScale: 'tight UI scale with restrained display sizes',
      radius: '8-12px radius with crisp corners on dense controls',
      spacing: '8px grid with 16/24 section rhythm',
      surfaces: 'matte surfaces, thin borders, quiet elevation',
      contrast: 'high information contrast with restrained chroma',
      accentStrategy: 'one action accent plus semantic states',
    },
    componentCues: [
      'Data tables and split panes beat oversized cards.',
      'Command bars, summary rails, and scoped filters should feel native.',
      'Important metrics deserve fixed positions instead of decorative reshuffling.',
    ],
    interactionCues: [
      'Keyboard and hover states must be obvious but not flashy.',
      'Selections and in-progress states should be visible at a glance.',
    ],
    guardrails: [
      'Do not waste vertical space with oversized chrome.',
      'Avoid decorative gradients that reduce scan speed.',
    ],
  },
  {
    id: 'semantic-minimal',
    label: 'Semantic Minimal',
    cues: ['semantic', 'native', 'html', 'html-first', 'lightweight', 'zero dependency', 'progressive enhancement', 'minimal js', 'primitive', 'plain css'],
    visualTone: 'calm utility with semantic structure, native affordances, and very low implementation noise',
    density: 'lean but not sparse',
    motion: 'nearly motionless; only state feedback and structural transitions earn motion',
    hierarchy: 'semantic landmarks, obvious action flow, and stable state treatment beat decorative composition',
    designTokens: {
      typeScale: 'content-led headings with sober body copy and strong monospace support where helpful',
      radius: '6-10px radius with restrained shape language',
      spacing: '8px grid with steady section cadence and low chrome overhead',
      surfaces: 'flat or lightly layered surfaces with clear borders and minimal shadow reliance',
      contrast: 'high readability with limited color variance',
      accentStrategy: 'one restrained accent plus explicit semantic states',
    },
    componentCues: [
      'Prefer semantic shells, native elements, and thin wrappers before large component abstractions.',
      'When a pattern repeats, extract a small named primitive instead of growing utility/class piles forever.',
      'States should look intentional even when the implementation stays extremely small.',
    ],
    interactionCues: [
      'Use native browser affordances where they reduce custom JS and improve resilience.',
      'Keyboard and focus behavior should be explicit before animation or flourish is added.',
    ],
    guardrails: [
      'Do not replace semantic HTML with div soup just to satisfy a visual sketch.',
      'Do not introduce a heavy dependency when a native primitive already solves the interaction.',
    ],
  },
  {
    id: 'premium-minimal',
    label: 'Premium Minimal',
    cues: ['premium', 'minimal', 'clean', 'elegant', 'luxury', 'tasteful', 'sade', 'premium', 'şık', 'sik', 'sofistike'],
    visualTone: 'tailored restraint with confident contrast and calm surfaces',
    density: 'balanced spacing with disciplined whitespace',
    motion: 'subtle motion, no ornamental choreography',
    hierarchy: 'strong typography, clear grouping, and one dominant action lane',
    designTokens: {
      typeScale: 'display-led headings with quiet body copy',
      radius: '12-16px radius with consistent surface rhythm',
      spacing: '8px grid with generous 24/32 spacing for section cadence',
      surfaces: 'layered neutral surfaces with soft borders and low-noise shadows',
      contrast: 'high text contrast, restrained accent usage',
      accentStrategy: 'single premium accent with generous neutral support',
    },
    componentCues: [
      'Let composition and typography carry the brand before visual effects do.',
      'Use one hero gesture per screen, then keep the rest quiet and systematic.',
      'Cards should feel tailored, not inflated.',
    ],
    interactionCues: [
      'Hover and pressed states should feel quick and polished, never loud.',
      'Animations should clarify hierarchy, not advertise themselves.',
    ],
    guardrails: [
      'No random gradients, neon glows, or glass on every surface.',
      'Avoid stacking multiple signature tricks on one screen.',
    ],
  },
  {
    id: 'editorial-contrast',
    label: 'Editorial Contrast',
    cues: ['editorial', 'story', 'magazine', 'campaign', 'hero', 'narrative', 'brand', 'editoryal', 'hikaye'],
    visualTone: 'confident editorial composition with crisp rhythm and typographic authority',
    density: 'airy sections with alternating tight and wide passages',
    motion: 'cinematic but sparse transitions that support reading flow',
    hierarchy: 'large type contrast, strong width discipline, and narrative pacing',
    designTokens: {
      typeScale: 'large display typography with narrow body measure',
      radius: 'minimal radius; rely more on shape and spacing than on rounding',
      spacing: 'alternating wide and narrow section rhythm',
      surfaces: 'flat or near-flat surfaces with selective emphasis blocks',
      contrast: 'high typographic and spatial contrast',
      accentStrategy: 'editorial accent used to direct attention, not decorate every block',
    },
    componentCues: [
      'Hero, story blocks, and proof sections should feel authored, not assembled from random templates.',
      'Strong section rhythm matters more than decorative chrome.',
    ],
    interactionCues: [
      'Scrolling should feel composed; avoid twitchy parallax or gratuitous motion.',
    ],
    guardrails: [
      'Avoid startup-cliche blob art and generic glass cards.',
      'Do not let hero sections overpower product evidence below the fold.',
    ],
  },
  {
    id: 'playful-modern',
    label: 'Playful Modern',
    cues: ['playful', 'friendly', 'fun', 'warm', 'youthful', 'vibrant', 'energetic', 'oyuncu', 'samimi'],
    visualTone: 'friendly modernity with warmth, clarity, and controlled color energy',
    density: 'comfortable spacing with visual softness around interactive zones',
    motion: 'lightweight playful motion only where it improves delight or feedback',
    hierarchy: 'obvious pathing with approachable surfaces and expressive accents',
    designTokens: {
      typeScale: 'friendly medium-large headings with highly readable body',
      radius: '16-20px radius with soft corners',
      spacing: '8px grid with slightly looser control spacing',
      surfaces: 'soft surfaces with selective tint and playful but restrained contrast',
      contrast: 'balanced contrast with color warmth',
      accentStrategy: '2-tone accent palette with clear semantic boundaries',
    },
    componentCues: [
      'Use warmth in empty states and success feedback, not in every surface.',
      'Buttons and controls can feel tactile without becoming toy-like.',
    ],
    interactionCues: [
      'Micro-interactions can be expressive as long as they stay fast and consistent.',
    ],
    guardrails: [
      'Avoid novelty that weakens trust on serious tasks.',
      'Do not mix too many accent colors on the same screen.',
    ],
  },
  {
    id: 'glass-soft',
    label: 'Glass Soft',
    cues: ['glass', 'glassmorphism', 'frosted', 'translucent', 'blur', 'cam', 'camimsi'],
    visualTone: 'soft layered translucency with disciplined edges and contrast',
    density: 'balanced spacing with clear layer separation',
    motion: 'soft depth cues and minimal drift motion',
    hierarchy: 'foreground actions stay crisp even when surfaces use translucency',
    designTokens: {
      typeScale: 'moderate display sizes with high legibility',
      radius: '16px+ radius with consistent glass container treatment',
      spacing: '8px grid with generous internal padding on glass surfaces',
      surfaces: 'selective translucent panels only where depth helps grouping',
      contrast: 'high foreground contrast to survive blur/translucency',
      accentStrategy: 'restrained accent with clear solid states for buttons and inputs',
    },
    componentCues: [
      'Use translucent surfaces sparingly for shells and context panes, not every list row.',
      'Interactive controls still need solid readability and obvious focus states.',
    ],
    interactionCues: [
      'Depth motion should stay subtle and responsive, never floaty or delayed.',
    ],
    guardrails: [
      'Do not blur everything.',
      'Never sacrifice readability for atmosphere.',
    ],
  },
  {
    id: 'brutalist-utility',
    label: 'Brutalist Utility',
    cues: ['brutalist', 'raw', 'utility', 'industrial', 'harsh', 'bold contrast', 'brütalist'],
    visualTone: 'direct utility with raw contrast and unapologetic structure',
    density: 'compact and assertive',
    motion: 'nearly motionless except for clear state feedback',
    hierarchy: 'strong borders, hard sections, and highly visible actions',
    designTokens: {
      typeScale: 'assertive headings with compact body and mono support where useful',
      radius: '0-6px radius; geometry over softness',
      spacing: 'strict grid with tighter section spacing',
      surfaces: 'flat, bordered, and high-contrast blocks',
      contrast: 'very high contrast with deliberate restraint on color count',
      accentStrategy: 'limited accents; rely on contrast and structure first',
    },
    componentCues: [
      'Borders and layout define the system more than shadows do.',
      'Use rawness intentionally; it still needs rhythm and consistency.',
    ],
    interactionCues: [
      'Feedback should feel immediate and decisive.',
    ],
    guardrails: [
      'Do not confuse raw style with visual chaos.',
      'Keep spacing and alignment disciplined or the whole system collapses.',
    ],
  },
]);

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function inferArchetype(profile, inventory, uiFiles, contextText) {
  const text = `${contextText}\n${uiFiles.join('\n')}\n${inventory.map((item) => item.name).join(' ')}`.toLowerCase();
  const signals = [
    {
      id: 'control-plane',
      score: (/\b(dashboard|admin|table|grid|metrics|audit|review|queue|pipeline|timeline|status|command center)\b/.test(text) ? 3 : 0)
        + (profile.stack.data.length > 0 ? 1 : 0),
      label: 'control-plane',
      summary: 'High-signal operational UI with dense data, fast scanning, and powerful states.',
    },
    {
      id: 'saas-app',
      score: (/\b(settings|billing|workspace|project|team|member|permissions|account|auth|profile)\b/.test(text) ? 3 : 0)
        + (profile.stack.forms.length > 0 ? 1 : 0),
      label: 'saas-app',
      summary: 'Trust-building product UI with task-focused flows and clear hierarchy.',
    },
    {
      id: 'editorial-marketing',
      score: (/\b(marketing|landing|hero|pricing|story|blog|content|article|brand|copy|campaign)\b/.test(text) ? 3 : 0)
        + (inventory.some((item) => /hero|section|testimonial/i.test(item.name)) ? 1 : 0),
      label: 'editorial-marketing',
      summary: 'Narrative-first UI with crisp typography, section rhythm, and strong visual framing.',
    },
    {
      id: 'commerce',
      score: (/\b(cart|checkout|product|catalog|price|sku|order|inventory|store)\b/.test(text) ? 3 : 0),
      label: 'commerce',
      summary: 'Merchandising + decision support UI where trust, clarity, and conversion matter.',
    },
    {
      id: 'content-studio',
      score: (/\b(editor|compose|draft|publish|cms|media|asset|library|studio)\b/.test(text) ? 3 : 0),
      label: 'content-studio',
      summary: 'Creation environment with stable rails, quiet chrome, and strong focus modes.',
    },
  ]
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  return signals[0].score > 0 ? signals[0] : {
    id: 'product-generalist',
    label: 'product-generalist',
    summary: 'Balanced application UI prioritizing clarity, coherence, and implementation speed.',
    score: 0,
  };
}

function defaultTasteForArchetype(archetype) {
  if (archetype.id === 'control-plane') {
    return 'operator-dense';
  }
  if (archetype.id === 'editorial-marketing') {
    return 'editorial-contrast';
  }
  if (archetype.id === 'content-studio') {
    return 'premium-minimal';
  }
  if (archetype.id === 'commerce') {
    return 'premium-minimal';
  }
  return 'premium-minimal';
}

function scoreTasteProfile(profile, text, archetype) {
  let score = 0;
  for (const cue of profile.cues || []) {
    if (text.includes(cue.toLowerCase())) {
      score += cue.includes(' ') ? 3 : 2;
    }
  }
  if (profile.id === defaultTasteForArchetype(archetype)) {
    score += 2;
  }
  if (profile.id === 'operator-dense' && archetype.id === 'control-plane') {
    score += 2;
  }
  if (profile.id === 'editorial-contrast' && archetype.id === 'editorial-marketing') {
    score += 2;
  }
  if (profile.id === 'semantic-minimal' && /\b(semantic|native|primitive|lightweight|zero dependency|progressive enhancement)\b/.test(text)) {
    score += 3;
  }
  return score;
}

function resolveTasteProfile(archetype, contextText, options = {}) {
  const text = normalizeText([contextText, options.goal || '', options.taste || ''].join('\n'));
  const explicitTaste = String(options.taste || '').trim().toLowerCase();
  const explicitMatch = TASTE_PROFILES.find((entry) => entry.id === explicitTaste || entry.label.toLowerCase() === explicitTaste);
  if (explicitMatch) {
    return {
      ...explicitMatch,
      source: 'explicit',
    };
  }
  const ranked = TASTE_PROFILES
    .map((entry) => ({ entry, score: scoreTasteProfile(entry, text, archetype) }))
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
  if (ranked[0].score > 0) {
    return {
      ...ranked[0].entry,
      source: 'inferred',
    };
  }
  const fallback = TASTE_PROFILES.find((entry) => entry.id === defaultTasteForArchetype(archetype)) || TASTE_PROFILES[0];
  return {
    ...fallback,
    source: 'fallback',
  };
}

function inferTasteSignature(profile, archetype, tasteProfile) {
  const framework = profile.framework.primary;
  const style = profile.styling.detected[0] || 'custom';
  const uiSystem = profile.uiSystem.primary;
  const visualVerdictRequired = profile.visualVerdict?.required;
  const signature = {
    profile: {
      id: tasteProfile.id,
      label: tasteProfile.label,
      source: tasteProfile.source,
    },
    visualTone: tasteProfile.visualTone,
    density: tasteProfile.density,
    motion: profile.stack.motion?.length > 0 ? tasteProfile.motion : `${tasteProfile.motion}; default to even less motion if the stack lacks dedicated motion primitives`,
    hierarchy: tasteProfile.hierarchy,
    implementationBias: `${framework} + ${style} + ${uiSystem}`,
    reviewRequired: visualVerdictRequired ? 'yes' : 'no',
  };
  signature.tagline = `${signature.visualTone}; ${signature.density}; ${signature.motion}.`;
  if (archetype.id === 'control-plane' && tasteProfile.id !== 'operator-dense') {
    signature.tagline = `${signature.tagline} Keep scan speed ahead of novelty.`;
  }
  return signature;
}

module.exports = {
  TASTE_PROFILES,
  defaultTasteForArchetype,
  inferArchetype,
  inferTasteSignature,
  normalizeText,
  resolveTasteProfile,
  scoreTasteProfile,
  uniqueSorted,
};
