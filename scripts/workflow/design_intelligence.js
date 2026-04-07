const path = require('node:path');
const { readIfExists, tryExtractSection } = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const {
  collectComponentInventory,
  collectUiFiles,
  relativePath,
  writeDoc,
} = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

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

function buildPrinciples(profile, archetype, tasteProfile) {
  const shared = [
    'Prefer one dominant visual idea per screen instead of stacking unrelated flourishes.',
    'Use spacing and typography before borders, shadows, or color noise.',
    'Every surface should explain its state: loading, empty, success, partial, destructive, and offline where relevant.',
    'Preserve interaction hierarchy: one obvious primary action, quiet secondary actions, hidden tertiary actions.',
    'Keep layout rhythm stable across breakpoints so Codex can patch confidently without fragile one-off CSS.',
  ];
  const byArchetype = {
    'control-plane': [
      'Favor dense but legible tables, split panes, command bars, and sticky context.',
      'Promote critical metrics into stable summary rails; do not bury risk behind accordions.',
    ],
    'editorial-marketing': [
      'Use restraint with gradients and glassmorphism; typography and composition should carry the taste.',
      'Alternate wide and narrow sections to create narrative pacing without breaking implementation consistency.',
    ],
    'saas-app': [
      'Keep settings/forms predictable: alignment, helper text, destructive actions, and success feedback must be systematic.',
      'Use reusable section cards and inline validation to reduce cognitive load.',
    ],
    commerce: [
      'Price, trust, fulfillment, and product evidence must sit above decorative treatment.',
      'Optimize comparison and decision-making surfaces before adding animation or novelty.',
    ],
    'content-studio': [
      'Creation surfaces need low-noise chrome and obvious autosave/status affordances.',
      'Primary focus should stay on content, with secondary metadata parked in rails or drawers.',
    ],
    'product-generalist': [
      'Bias toward reusable shells, strong defaults, and calm surfaces.',
      'Taste should emerge from consistency, not isolated hero treatments.',
    ],
  };
  return [...shared, ...(byArchetype[archetype.id] || []), ...((tasteProfile.componentCues || []).slice(0, 2))];
}

function buildPatterns(profile, inventory, archetype, tasteProfile) {
  const inventoryNames = uniqueSorted(inventory.map((item) => item.name));
  const patterns = [
    'Shells: sticky page header + context summary + one primary action zone.',
    'States: every async panel gets skeleton + empty + error + success variants.',
    'Lists & tables: reserve compact density for scanning, not for decorative crowding.',
    'Forms: inline validation, progressive disclosure, and clear destructive affordances.',
    'Navigation: consistent active state, location memory, and keyboard-friendly command affordances.',
    `Translate taste into tokens early: ${Object.entries(tasteProfile.designTokens || {}).map(([key, value]) => `${key}=${value}`).join(' | ')}.`,
  ];
  if (profile.uiSystem.primary.toLowerCase().includes('shadcn')) {
    patterns.push('Use shadcn-style primitives as the base layer, then customize density, radius, and typography through tokens instead of ad-hoc overrides.');
  }
  if (profile.styling.detected.includes('Tailwind')) {
    patterns.push('Prefer semantic Tailwind component wrappers over long inline utility piles when a pattern repeats more than twice.');
  }
  if (tasteProfile.id === 'semantic-minimal') {
    patterns.push('Prefer semantic HTML plus thin wrappers before reaching for dependency-heavy component abstractions.');
  }
  if (inventoryNames.length > 0) {
    patterns.push(`Lean on existing component inventory first: ${inventoryNames.slice(0, 8).join(', ')}.`);
  }
  if (archetype.id === 'control-plane') {
    patterns.push('Use multi-row cards sparingly; data-dense screens benefit from stable tabular or split-pane layouts.');
  }
  return patterns;
}

function buildAntiPatterns(archetype, tasteProfile) {
  const shared = [
    'Do not mix multiple visual metaphors on one screen.',
    'Do not hide core actions in tertiary menus when the task is frequent.',
    'Do not use color as the only state signal.',
    'Do not add gradients/shadows/radii without a consistent token story.',
    'Do not let loading/empty/error states regress behind the happy path.',
    ...(tasteProfile.guardrails || []),
  ];
  if (archetype.id === 'editorial-marketing') {
    shared.push('Avoid startup cliché styling: random blobs, neon gradients, and meaningless glass cards.');
  }
  if (archetype.id === 'control-plane') {
    shared.push('Avoid oversized cards that waste vertical space and slow operator scanning.');
  }
  if (tasteProfile.id === 'semantic-minimal') {
    shared.push('Avoid div-click widgets, generic wrapper stacks, and custom JS where native elements already solve the interaction.');
  }
  return shared;
}

function buildCodexRecipes(profile, archetype, signature, tasteProfile) {
  const recipes = [
    `Start each frontend task by restating the design direction in one sentence: "${signature.tagline}"`,
    `Lock the token posture early: ${Object.entries(tasteProfile.designTokens || {}).map(([key, value]) => `${key}=${value}`).join(' | ')}.`,
    'When adding a screen, first patch the shell, state model, and responsive layout, then fill in decorative polish last.',
    'Prefer editing existing primitives and tokens over introducing bespoke one-off components.',
    'When a diff changes visuals, also patch empty/loading/error/success states in the same pass if they share the component.',
    'End every UI slice with a concise visual QA checklist and the exact browser review command.',
  ];
  if (profile.styling.detected.includes('Tailwind')) {
    recipes.push('Collapse repeated utility clusters into semantic helpers or shared component wrappers once the pattern stabilizes.');
  }
  if (profile.framework.primary === 'Next') {
    recipes.push('Keep server/client boundaries explicit so design polish does not accidentally bloat client bundles.');
  }
  if (archetype.id === 'control-plane') {
    recipes.push('For operational surfaces, prefer composable table/filter/panel primitives over custom dashboard art direction.');
  }
  if (tasteProfile.id === 'semantic-minimal') {
    recipes.push('Prefer native browser primitives and semantic wrappers before introducing new UI dependencies or div-based interactions.');
  }
  if (profile.uiSystem.primary === 'custom') {
    recipes.push('If the screen is still ambiguous, prototype it in semantic HTML/CSS first and translate only after the shell and state model stabilize.');
  }
  return recipes;
}

function buildAcceptanceChecklist(profile, archetype, tasteProfile) {
  const checklist = [
    'Primary action is obvious within 3 seconds of opening the screen.',
    'Typography, spacing, radius, and shadows feel systematic across touched surfaces.',
    `The implemented tokens match the chosen taste profile (${tasteProfile.label}).`,
    'Loading, empty, error, success, and destructive states exist where the feature needs them.',
    'Responsive behavior keeps hierarchy intact at narrow and wide breakpoints.',
    'Accessibility semantics remain intact for headings, labels, focus, and status messaging.',
  ];
  if (profile.visualVerdict?.required) {
    checklist.push('A browser/UI review artifact is captured before closeout.');
  }
  if (archetype.id === 'control-plane') {
    checklist.push('Dense data views remain scannable without horizontal chaos or oversized chrome.');
  }
  return checklist;
}

function buildDesignTokens(tasteProfile, archetype, profile) {
  return {
    ...tasteProfile.designTokens,
    archetype: archetype.label,
    frameworkBias: profile.framework.primary,
    uiSystem: profile.uiSystem.primary,
  };
}

function buildStyleGuardrails(tasteProfile, archetype) {
  const lines = [
    ...tasteProfile.guardrails,
    'Prefer consistency across all touched surfaces over one standout component that breaks the system.',
  ];
  if (archetype.id === 'control-plane') {
    lines.push('Scan speed beats novelty on operator-critical screens.');
  }
  return lines;
}

function buildExperienceThesis(archetype, tasteProfile, profile) {
  const thesis = {
    title: `${tasteProfile.label} ${archetype.label}`,
    thesis: `Build a ${archetype.label} experience that feels ${tasteProfile.visualTone} while remaining implementation-friendly for ${profile.framework.primary}.`,
    emotionalBar: tasteProfile.visualTone,
    executionBias: `Codex should bias toward reusable shells, tokenized primitives, and repeatable state patterns instead of one-off flourishes.`,
  };
  if (archetype.id === 'control-plane') {
    thesis.signature = 'Fast scanning, anchored context rails, and operator confidence beat decorative novelty.';
  } else if (archetype.id === 'editorial-marketing') {
    thesis.signature = 'Narrative pacing, proof blocks, and typographic contrast should carry the product story.';
  } else if (archetype.id === 'content-studio') {
    thesis.signature = 'Focus mode, content legibility, and low-noise chrome should dominate the editing experience.';
  } else {
    thesis.signature = 'Clarity, consistency, and obvious next actions should feel premium rather than generic.';
  }
  return thesis;
}

function buildMotionSystem(profile, tasteProfile) {
  return {
    principle: tasteProfile.motion,
    transitions: [
      'Use fast enter/exit transitions to clarify hierarchy and preserve perceived responsiveness.',
      'Reserve richer motion for one signature surface per screen; keep the rest utilitarian.',
      profile.stack.motion?.length > 0
        ? 'Lean on the existing motion primitives instead of inventing custom timing systems per component.'
        : 'Default to CSS-native transitions unless the stack already ships a motion primitive.',
    ],
    timings: [
      'micro: 120-160ms',
      'standard: 180-240ms',
      'large surface changes: 240-320ms',
    ],
  };
}

function buildCopyVoice(archetype, tasteProfile) {
  const base = {
    tone: `${tasteProfile.label} copy: concise, directive, confident, and low-noise.`,
    dos: [
      'Prefer short action labels and concrete status language.',
      'Use helper text to reduce ambiguity, not to narrate obvious UI.',
      'Keep empty and success states useful, not cute for the sake of it.',
    ],
    donts: [
      'Do not over-explain routine interactions.',
      'Do not mix multiple brand voices on the same screen.',
    ],
  };
  if (archetype.id === 'editorial-marketing') {
    base.dos.push('Use sharper contrast between headline proof and supporting body copy.');
  }
  if (archetype.id === 'control-plane') {
    base.dos.push('Operational copy should be brief, high-signal, and easy to scan in dense layouts.');
  }
  return base;
}

function buildSignatureMoments(archetype) {
  const shared = [
    {
      id: 'hero-anchoring',
      title: 'Anchored hero moment',
      description: 'Give each primary screen one unmistakable anchor: a hero metric rail, authored hero block, or command surface.',
    },
    {
      id: 'state-polish',
      title: 'State polish',
      description: 'Loading, empty, success, and destructive states should feel intentionally designed, not leftover scaffolding.',
    },
  ];
  if (archetype.id === 'control-plane') {
    shared.push({
      id: 'ops-rail',
      title: 'Operator summary rail',
      description: 'A fixed summary lane should keep risk, status, and next action visible as users inspect detail panes.',
    });
  }
  if (archetype.id === 'editorial-marketing') {
    shared.push({
      id: 'proof-rhythm',
      title: 'Proof rhythm',
      description: 'Alternate narrative sections with crisp proof modules so the page feels authored instead of template-driven.',
    });
  }
  if (archetype.id === 'content-studio') {
    shared.push({
      id: 'focus-shell',
      title: 'Focus shell',
      description: 'The editor surface should feel calm, with metadata tucked into rails or drawers and obvious save/status signals.',
    });
  }
  return shared;
}

function buildScreenBlueprints(archetype) {
  const defaults = [
    {
      id: 'primary-screen',
      title: 'Primary screen blueprint',
      recipe: 'Header -> summary/hero -> main work area -> secondary rail -> evidence/state zone.',
    },
    {
      id: 'detail-screen',
      title: 'Detail screen blueprint',
      recipe: 'Sticky title row -> content stack -> related actions -> audit/supporting metadata.',
    },
  ];
  if (archetype.id === 'control-plane') {
    defaults.push({
      id: 'split-pane',
      title: 'Split-pane operations view',
      recipe: 'Left filter/table pane -> right detail/inspector pane -> sticky command bar.',
    });
  }
  if (archetype.id === 'editorial-marketing') {
    defaults.push({
      id: 'story-landing',
      title: 'Story landing view',
      recipe: 'Hero -> proof strip -> benefits/story blocks -> testimonial/evidence -> CTA close.',
    });
  }
  return defaults;
}

function buildDifferentiators(archetype, tasteProfile) {
  return [
    `The product should feel like a ${tasteProfile.label.toLowerCase()} system, not a generic component library assembly.`,
    'Signature moments should come from hierarchy, state design, and composition before visual effects.',
    archetype.id === 'control-plane'
      ? 'Dense operational screens should still feel premium through rhythm, typography, and stable rails.'
      : 'Interactive surfaces should feel authored and product-specific, not template-derived.',
  ];
}

function buildDesignSystemActions(profile, tasteProfile) {
  const actions = [
    `Encode ${tasteProfile.label} through tokens first: ${Object.entries(tasteProfile.designTokens || {}).map(([key, value]) => `${key}=${value}`).join(' | ')}.`,
    'Refactor repeated utility piles into semantic wrappers or shared primitives once patterns repeat.',
    `Keep ${profile.uiSystem.primary} primitives, but restyle density, radius, spacing, and typography systematically.`,
  ];
  if (tasteProfile.id === 'semantic-minimal') {
    actions.push('Write the semantic/native interaction contract first, then translate it into the active UI layer with the smallest practical wrapper.');
  }
  return actions;
}

function translatePrimitive(profile, primitive) {
  const uiSystem = normalizeText(profile.uiSystem.primary);
  const family = uiSystem.includes('shadcn') || uiSystem.includes('radix')
    ? 'shadcn'
    : uiSystem.includes('mui')
      ? 'mui'
      : uiSystem.includes('chakra')
        ? 'chakra'
        : 'custom';
  const map = {
    dialog: {
      shadcn: 'Translate the approved shell into Dialog/Sheet primitives without losing the explicit close and focus contract.',
      mui: 'Translate into MUI Dialog/Drawer while preserving native-like focus, dismissal, and return-state behavior.',
      chakra: 'Translate into Chakra Dialog/Drawer after the semantic open/close rules are settled.',
      custom: 'Start from <dialog> or a very thin wrapper before introducing custom portal choreography.',
    },
    disclosure: {
      shadcn: 'Map to Accordion/Collapsible after the details/summary behavior is explicit.',
      mui: 'Map to Accordion once summary/content semantics and keyboard behavior are clear.',
      chakra: 'Map to Accordion/Collapse only after the disclosure contract is documented.',
      custom: 'Use <details>/<summary> for first-pass behavior, then wrap only if the repo needs extra control.',
    },
    menu: {
      shadcn: 'Translate to DropdownMenu/Popover primitives while keeping trigger, focus, and dismissal behavior simple.',
      mui: 'Translate to Menu/Popover after the action grouping and target semantics are explicit.',
      chakra: 'Translate to Menu/Popover after trigger, focus, and dismissal behavior are defined.',
      custom: 'Start with button + popover/menu semantics rather than bespoke trays and invisible div click zones.',
    },
    table: {
      shadcn: 'Keep real table semantics underneath shared table wrappers or data-grid polish.',
      mui: 'Translate to MUI Table/DataGrid only after the header/body/row contract is written semantically.',
      chakra: 'Translate to Chakra Table once header/body semantics are stable.',
      custom: 'Prefer <table>/<thead>/<tbody> before composing custom grid chrome.',
    },
    feedback: {
      shadcn: 'Use Toast/Alert rendering primitives, but keep output/aria-live and recovery messaging explicit.',
      mui: 'Translate to Snackbar/Alert after the status message contract is explicit.',
      chakra: 'Translate to Toast/Alert once the feedback contract and recovery copy are stable.',
      custom: 'Use output/aria-live plus one shared toast helper instead of page-local success banners.',
    },
    form: {
      shadcn: 'Keep form primitives thin and preserve label/fieldset/help/error semantics under the styled wrappers.',
      mui: 'Translate to MUI form controls while keeping labels, hints, and validation ownership explicit.',
      chakra: 'Translate to Chakra form controls only after label/help/error semantics are locked.',
      custom: 'Start with label/input/select/fieldset semantics and add wrappers only when repeated patterns emerge.',
    },
  };
  return map[primitive]?.[family] || map[primitive]?.custom || 'Preserve the semantic contract first, then translate it into the active UI stack.';
}

function buildNativeFirstRecommendations(profile, archetype) {
  const recommendations = [
    {
      id: 'table',
      title: 'Relational data views',
      native: 'table + thead + tbody',
      useWhen: archetype.id === 'control-plane'
        ? 'Use for operator lists, audit logs, comparison screens, and anything row/column driven.'
        : 'Use whenever users compare rows, scan columns, or sort/filter structured data.',
      why: 'Real table semantics preserve scan speed, keyboard expectations, and accessible structure.',
      stackTranslation: translatePrimitive(profile, 'table'),
    },
    {
      id: 'dialog',
      title: 'Confirm, edit, or drill-in overlays',
      native: 'dialog',
      useWhen: 'Use for confirm flows, inline editing overlays, inspectors, and focused task interruptions.',
      why: 'A dialog contract keeps dismissal, focus return, and escape behavior predictable.',
      stackTranslation: translatePrimitive(profile, 'dialog'),
    },
    {
      id: 'disclosure',
      title: 'Advanced settings and expandable sections',
      native: 'details + summary',
      useWhen: 'Use when secondary metadata, FAQs, advanced filters, or low-frequency settings expand inline.',
      why: 'Disclosure primitives reduce custom JS and make collapsed vs expanded state explicit.',
      stackTranslation: translatePrimitive(profile, 'disclosure'),
    },
    {
      id: 'form',
      title: 'Forms and inline validation',
      native: 'label + input/select/textarea + fieldset',
      useWhen: 'Use for settings, onboarding, account flows, and any form that needs clear helper and error copy.',
      why: 'Native form semantics keep labels, validation, and keyboard flow resilient before styling decisions compound.',
      stackTranslation: translatePrimitive(profile, 'form'),
    },
    {
      id: 'menu',
      title: 'Secondary actions and contextual menus',
      native: 'button + popover/menu',
      useWhen: 'Use for row actions, filter menus, split buttons, and compact secondary command surfaces.',
      why: 'Button-targeted menus make trigger ownership and dismissal rules easier to standardize.',
      stackTranslation: translatePrimitive(profile, 'menu'),
    },
    {
      id: 'feedback',
      title: 'Status, success, and recovery messaging',
      native: 'output + aria-live + progress/meter where relevant',
      useWhen: 'Use for save/delete/retry flows, async jobs, uploads, and transient result messaging.',
      why: 'Status feedback becomes easier to reuse when message semantics are explicit before the toast/banner styling layer.',
      stackTranslation: translatePrimitive(profile, 'feedback'),
    },
  ];
  return archetype.id === 'control-plane'
    ? recommendations
    : recommendations.filter((item) => item.id !== 'table' || profile.stack.data.length > 0 || profile.framework.primary === 'Next');
}

function buildRecipePack(profile, archetype) {
  const recipes = [
    {
      id: 'semantic-shell',
      title: 'Semantic page shell',
      useWhen: 'Use for any new page, dashboard, settings screen, or content workspace.',
      structure: 'header/nav -> main -> primary action lane -> secondary rail or footer',
      implementationBias: 'Start with landmarks and one obvious primary action before decorative treatment.',
    },
    {
      id: 'async-state-cluster',
      title: 'Async state cluster',
      useWhen: 'Use whenever a screen loads remote data, saves, retries, or can become empty.',
      structure: 'loading skeleton -> empty state -> error/recovery state -> success confirmation',
      implementationBias: 'Implement all four states together so the happy path does not monopolize polish.',
    },
    {
      id: 'form-card',
      title: 'Form card / settings section',
      useWhen: 'Use for settings, onboarding, account forms, and edit panels.',
      structure: 'section header -> labeled fields -> helper/error copy -> action row',
      implementationBias: 'Keep labels, helper text, and validation semantics explicit before spacing polish.',
    },
  ];

  if (archetype.id === 'control-plane') {
    recipes.push(
      {
        id: 'filter-table-inspector',
        title: 'Filter -> table -> inspector',
        useWhen: 'Use for admin, ops, queues, audit, or review-heavy surfaces.',
        structure: 'filter bar -> relational table -> sticky detail/inspector pane -> action/status rail',
        implementationBias: 'Favor true table semantics and predictable inspector behavior over oversized summary cards.',
      },
      {
        id: 'command-summary-rail',
        title: 'Command + summary rail',
        useWhen: 'Use when operators need risk, next action, and status visible while scanning detail.',
        structure: 'top command lane -> summary metrics -> main work area -> evidence/status rail',
        implementationBias: 'Keep scan speed ahead of novelty and let the summary rail anchor decision-making.',
      },
    );
  } else if (archetype.id === 'editorial-marketing') {
    recipes.push({
      id: 'hero-proof-story',
      title: 'Hero -> proof -> story stack',
      useWhen: 'Use for landing pages, campaigns, and narrative product surfaces.',
      structure: 'hero -> proof strip -> benefits/story blocks -> testimonial/evidence -> CTA close',
      implementationBias: 'Prototype in semantic HTML first so hierarchy and pacing land before visual flourishes.',
    });
  } else if (archetype.id === 'content-studio') {
    recipes.push({
      id: 'focus-editor-shell',
      title: 'Focus editor shell',
      useWhen: 'Use for CMS, editor, studio, or media-management experiences.',
      structure: 'quiet top bar -> main authoring area -> secondary metadata rail -> autosave/status zone',
      implementationBias: 'Keep chrome low-noise and preserve focus on the primary content area.',
    });
  } else {
    recipes.push({
      id: 'detail-dialog-flow',
      title: 'Detail + dialog flow',
      useWhen: 'Use for CRUD/detail flows where a list or page launches focused edits and confirmations.',
      structure: 'primary content -> supporting metadata -> focused dialog/drawer -> inline status feedback',
      implementationBias: 'Keep the semantic contract simple enough to prototype before translating to the final component system.',
    });
  }

  if (profile.uiSystem.primary === 'custom') {
    recipes.push({
      id: 'prototype-translation-lane',
      title: 'Prototype -> translation lane',
      useWhen: 'Use when the repo lacks a strong shared UI system or a new surface is still ambiguous.',
      structure: 'semantic HTML prototype -> approval snapshot -> thin shared primitive extraction -> stack translation',
      implementationBias: 'Reduce churn by settling hierarchy and state semantics before framework-specific styling expands.',
    });
  }

  return recipes;
}

function buildPrototypeMode(profile, archetype, inventory, options = {}) {
  const goalText = normalizeText(options.goal || '');
  const sharedCount = inventory.filter((item) => item.shared).length;
  const recommended = profile.uiSystem.primary === 'custom'
    || sharedCount < 3
    || ['control-plane', 'editorial-marketing', 'content-studio'].includes(archetype.id)
    || /\b(prototype|landing|hero|dashboard|new screen|new page|new view|shell)\b/.test(goalText);
  const mode = recommended ? 'semantic-html-first' : 'stack-native-direct';

  return {
    recommended,
    mode,
    rationale: recommended
      ? 'Start with a semantic HTML/CSS prototype to settle hierarchy, state coverage, and native interaction contracts before stack translation.'
      : 'The repo already has enough structure to build directly in the native component stack without a separate prototype-first pass.',
    entryStrategy: recommended
      ? 'Prototype the shell, state variants, and one primary flow with low-JS semantic primitives, then translate only after the structure feels stable.'
      : 'Implement directly in the repo stack, but still write the semantic/native contract before polishing page-local abstractions.',
    deliverables: recommended
      ? [
        'Prototype shell with semantic landmarks and one primary action lane.',
        'Loading, empty, error, and success states captured before visual polish.',
        'Translation notes that map each native primitive to the target stack equivalent.',
      ]
      : [
        'Direct stack implementation with semantic landmarks preserved.',
        'Shared primitive or wrapper decisions recorded before bespoke components multiply.',
      ],
    handoffSteps: [
      'Freeze hierarchy and state behavior before translating to repo-local components.',
      'Map native primitives to the target UI stack deliberately instead of re-inventing them page by page.',
      'Re-run browser/UI review after translation so the semantic contract survives the final polish layer.',
    ],
  };
}

function buildSemanticGuardrails(profile, archetype) {
  const lines = [
    'Prefer semantic landmarks (`header`, `nav`, `main`, `section`, `article`, `footer`) before anonymous wrapper stacks.',
    'Reach for `button`, `a`, `label`, `fieldset`, `dialog`, `details`, `table`, `progress`, `meter`, and `output` before custom div-based interactions.',
    'If a pattern repeats more than twice, extract a small named primitive or semantic wrapper instead of cloning utility piles.',
    'Write the state contract first: loading, empty, error, success, disabled, and recovery paths are first-class UI.',
    'Preserve keyboard, focus, and dismissal behavior as part of the design contract, not as post-polish cleanup.',
  ];
  if (profile.styling.detected.includes('Tailwind')) {
    lines.push('Keep utility strings from becoming the design system; graduate repeated clusters into semantic wrappers or shared components.');
  }
  if (archetype.id === 'control-plane') {
    lines.push('When data is relational, real table semantics and stable summary rails beat decorative card farms.');
  }
  return lines;
}

function buildImplementationPrompts(archetype, signature, tasteProfile) {
  return [
    `Build the shell so it reads as "${signature.tagline}" before adding decorative polish.`,
    `Land at least one signature moment from the chosen archetype (${archetype.label}) in the first pass.`,
    `Use ${tasteProfile.label} tokens as the decision rule whenever multiple UI options appear valid.`,
    'Patch state coverage and responsive behavior in the same diff as visual changes whenever possible.',
  ];
}

function renderDirectionMarkdown(payload) {
  const tokenLines = Object.entries(payload.designTokens).map(([key, value]) => `- ${key}: \`${value}\``);
  const componentCues = payload.componentCues.map((item) => `- ${item}`);
  const interactionCues = payload.interactionCues.map((item) => `- ${item}`);
  const guardrails = payload.styleGuardrails.map((item) => `- ${item}`);
  const semanticGuardrails = payload.semanticGuardrails.map((item) => `- ${item}`);
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Archetype: \`${payload.archetype.label}\``,
    `- Framework/UI stack: \`${payload.profile.framework.primary} / ${payload.profile.uiSystem.primary} / ${payload.profile.styling.detected.join(', ')}\``,
    `- Taste profile: \`${payload.taste.profile.label}\` (source: \`${payload.taste.profile.source}\`)`,
    `- Taste signature: \`${payload.taste.tagline}\``,
    '',
    '## Product Direction',
    '',
    `- ${payload.archetype.summary}`,
    '',
    '## Experience Thesis',
    '',
    `- Title: \`${payload.experienceThesis.title}\``,
    `- Thesis: ${payload.experienceThesis.thesis}`,
    `- Signature: ${payload.experienceThesis.signature}`,
    `- Execution bias: ${payload.experienceThesis.executionBias}`,
    '',
    '## Taste Signature',
    '',
    `- Visual tone: \`${payload.taste.visualTone}\``,
    `- Density: \`${payload.taste.density}\``,
    `- Motion: \`${payload.taste.motion}\``,
    `- Hierarchy: \`${payload.taste.hierarchy}\``,
    '',
    '## Signature Moments',
    '',
    ...payload.signatureMoments.flatMap((item) => ([
      `### ${item.title}`,
      '',
      `- ${item.description}`,
      '',
    ])),
    '## Screen Blueprints',
    '',
    ...payload.screenBlueprints.flatMap((item) => ([
      `### ${item.title}`,
      '',
      `- ${item.recipe}`,
      '',
    ])),
    '## Motion System',
    '',
    `- Principle: ${payload.motionSystem.principle}`,
    ...(payload.motionSystem.transitions || []).map((item) => `- ${item}`),
    ...(payload.motionSystem.timings || []).map((item) => `- Timing: \`${item}\``),
    '',
    '## Copy Voice',
    '',
    `- Tone: ${payload.copyVoice.tone}`,
    ...(payload.copyVoice.dos || []).map((item) => `- Do: ${item}`),
    ...(payload.copyVoice.donts || []).map((item) => `- Avoid: ${item}`),
    '',
    '## Design Tokens',
    '',
    ...tokenLines,
    '',
    '## Component Cues',
    '',
    ...componentCues,
    '',
    '## Interaction Cues',
    '',
    ...interactionCues,
    '',
    '## Design Principles',
    '',
    ...payload.principles.map((item) => `- ${item}`),
    '',
    '## Preferred Patterns',
    '',
    ...payload.patterns.map((item) => `- ${item}`),
    '',
    '## Anti-Patterns',
    '',
    ...payload.antiPatterns.map((item) => `- ${item}`),
    '',
    '## Style Guardrails',
    '',
    ...guardrails,
    '',
    '## Differentiators',
    '',
    ...payload.differentiators.map((item) => `- ${item}`),
    '',
    '## Design System Actions',
    '',
    ...payload.designSystemActions.map((item) => `- ${item}`),
    '',
    '## Semantic Guardrails',
    '',
    ...semanticGuardrails,
    '',
    '## Native-First Decision Matrix',
    '',
    ...payload.nativeFirstRecommendations.flatMap((item) => ([
      `### ${item.title}`,
      '',
      `- Native first: \`${item.native}\``,
      `- Use when: ${item.useWhen}`,
      `- Why: ${item.why}`,
      `- Stack translation: ${item.stackTranslation}`,
      '',
    ])),
    '## Recipe Pack',
    '',
    ...payload.recipePack.flatMap((item) => ([
      `### ${item.title}`,
      '',
      `- Use when: ${item.useWhen}`,
      `- Structure: ${item.structure}`,
      `- Implementation bias: ${item.implementationBias}`,
      '',
    ])),
    '## Prototype Mode',
    '',
    `- Recommended: \`${payload.prototypeMode.recommended ? 'yes' : 'no'}\``,
    `- Mode: \`${payload.prototypeMode.mode}\``,
    `- Rationale: ${payload.prototypeMode.rationale}`,
    `- Entry strategy: ${payload.prototypeMode.entryStrategy}`,
    ...(payload.prototypeMode.deliverables || []).map((item) => `- Deliverable: ${item}`),
    ...(payload.prototypeMode.handoffSteps || []).map((item) => `- Handoff: ${item}`),
    '',
    '## Codex Implementation Recipes',
    '',
    ...payload.codexRecipes.map((item) => `- ${item}`),
    '',
    '## Codex Implementation Prompts',
    '',
    ...payload.implementationPrompts.map((item) => `- ${item}`),
    '',
    '## Acceptance Checklist',
    '',
    ...payload.acceptanceChecklist.map((item) => `- [ ] ${item}`),
  ];
  return lines.join('\n');
}

function buildUiDirection(cwd, rootDir, options = {}) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const uiFiles = collectUiFiles(cwd);
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  const intentText = [
    tryExtractSection(contextDoc, 'User Intent', ''),
    tryExtractSection(contextDoc, 'Problem Frame', ''),
    tryExtractSection(contextDoc, 'Touched Files', ''),
    options.goal || '',
  ].join('\n');

  const archetype = inferArchetype(profile, inventory, uiFiles, intentText);
  const tasteProfile = resolveTasteProfile(archetype, intentText, options);
  const taste = inferTasteSignature(profile, archetype, tasteProfile);
  const designTokens = buildDesignTokens(tasteProfile, archetype, profile);
  const experienceThesis = buildExperienceThesis(archetype, tasteProfile, profile);
  const motionSystem = buildMotionSystem(profile, tasteProfile);
  const copyVoice = buildCopyVoice(archetype, tasteProfile);
  const signatureMoments = buildSignatureMoments(archetype);
  const screenBlueprints = buildScreenBlueprints(archetype);
  const differentiators = buildDifferentiators(archetype, tasteProfile);
  const designSystemActions = buildDesignSystemActions(profile, tasteProfile);
  const semanticGuardrails = buildSemanticGuardrails(profile, archetype);
  const nativeFirstRecommendations = buildNativeFirstRecommendations(profile, archetype);
  const recipePack = buildRecipePack(profile, archetype);
  const prototypeMode = buildPrototypeMode(profile, archetype, inventory, options);
  const implementationPrompts = buildImplementationPrompts(archetype, taste, tasteProfile);
  const payload = {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    profile,
    archetype,
    taste,
    experienceThesis,
    motionSystem,
    copyVoice,
    signatureMoments,
    screenBlueprints,
    differentiators,
    designSystemActions,
    semanticGuardrails,
    nativeFirstRecommendations,
    recipePack,
    prototypeMode,
    implementationPrompts,
    designTokens,
    componentCues: [...(tasteProfile.componentCues || [])],
    interactionCues: [...(tasteProfile.interactionCues || [])],
    styleGuardrails: buildStyleGuardrails(tasteProfile, archetype),
    principles: buildPrinciples(profile, archetype, tasteProfile),
    patterns: buildPatterns(profile, inventory, archetype, tasteProfile),
    antiPatterns: buildAntiPatterns(archetype, tasteProfile),
    codexRecipes: buildCodexRecipes(profile, archetype, taste, tasteProfile),
    acceptanceChecklist: buildAcceptanceChecklist(profile, archetype, tasteProfile),
    inventoryPreview: inventory.slice(0, 12).map((item) => item.file),
    uiFilePreview: uiFiles.slice(0, 12),
  };

  const filePath = writeDoc(path.join(rootDir, 'UI-DIRECTION.md'), 'UI DIRECTION', renderDirectionMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'ui-direction.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });

  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

module.exports = {
  TASTE_PROFILES,
  buildUiDirection,
};
