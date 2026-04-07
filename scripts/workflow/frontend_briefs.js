const fs = require('node:fs');
const path = require('node:path');
const { relativePath, writeDoc } = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

const PAGE_TYPES = Object.freeze([
  {
    id: 'landing-page',
    label: 'Landing Page',
    cues: ['landing', 'homepage', 'marketing', 'hero', 'launch', 'campaign', 'product page'],
    archetypes: ['editorial-marketing'],
    categories: ['marketing-site', 'developer-tool', 'ai-platform', 'service-business'],
    summary: 'Narrative-first acquisition page with product proof and clear conversion.',
    primaryOutcome: 'Explain value fast and move users toward a primary CTA.',
    sections: [
      {
        id: 'hero',
        title: 'Hero and primary CTA',
        goal: 'State the value proposition, orient the visitor, and make the primary action obvious above the fold.',
        components: ['headline', 'supporting copy', 'primary CTA', 'secondary CTA', 'hero visual or product demo'],
        states: ['loading', 'success', 'mobile-nav'],
      },
      {
        id: 'proof-strip',
        title: 'Trust and proof strip',
        goal: 'Prove the product is real with logos, metrics, or trusted names before feature overload starts.',
        components: ['logo row', 'key metrics', 'supporting proof labels'],
        states: ['loading', 'empty'],
      },
      {
        id: 'product-demo',
        title: 'Product demo section',
        goal: 'Show the product itself, not just abstract claims, using screenshots, code, or workflow visuals.',
        components: ['screenshot frame', 'annotated callouts', 'caption copy'],
        states: ['loading', 'empty', 'error'],
      },
      {
        id: 'feature-architecture',
        title: 'Feature architecture',
        goal: 'Turn major capabilities into a structured narrative with hierarchy and comparison.',
        components: ['feature grid', 'comparison rows', 'supporting illustrations'],
        states: ['loading', 'filtered-empty'],
      },
      {
        id: 'process',
        title: 'Workflow or process block',
        goal: 'Explain how the product fits into the user workflow in 3 to 5 steps.',
        components: ['stepper', 'timeline', 'numbered cards'],
        states: ['loading', 'success'],
      },
      {
        id: 'faq-cta',
        title: 'FAQ and final CTA',
        goal: 'Resolve objections, then repeat the primary conversion path with stronger confidence.',
        components: ['faq disclosure', 'final CTA', 'contact or sign-up prompt'],
        states: ['mobile-nav', 'form-validation', 'success', 'error'],
      },
    ],
    proofSurfaces: [
      'Real product screenshots or code snippets should appear before the page asks for trust.',
      'Use customer logos, usage counts, or workflow proof instead of generic praise.',
    ],
    copyGoals: [
      'Lead with product truth, not adjectives.',
      'Use specific outcomes and product mechanics in section subheads.',
    ],
    responsivePriorities: [
      'Keep the primary CTA and proof visible without scrolling through decorative filler.',
      'Collapse hero layouts into one strong content column before shrinking screenshots too far.',
    ],
    motionMoments: [
      'One authored hero reveal is enough; keep the rest structural.',
      'Use scroll motion only to reinforce section sequencing or product demo clarity.',
    ],
    antiPatterns: [
      'Do not ship an interchangeable feature-grid startup page with no product truth.',
      'Do not hide the real product below abstract brand theater.',
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    cues: ['dashboard', 'analytics', 'admin', 'control plane', 'metrics', 'monitoring', 'ops', 'reporting'],
    archetypes: ['control-plane'],
    categories: ['analytics-platform', 'ai-platform', 'developer-tool', 'b2b-saas'],
    summary: 'High-signal operational workspace with summary rails, filters, and dense but legible detail.',
    primaryOutcome: 'Support fast scanning, decisions, and safe next actions.',
    sections: [
      {
        id: 'summary-rail',
        title: 'Summary rail',
        goal: 'Expose the top metrics, risk, and next action immediately.',
        components: ['hero metrics', 'status badges', 'primary CTA'],
        states: ['loading', 'partial-data', 'success'],
      },
      {
        id: 'filter-bar',
        title: 'Filters and scoped controls',
        goal: 'Let users narrow data without losing orientation.',
        components: ['search', 'segmented filters', 'date range', 'view toggles'],
        states: ['filtered-empty', 'interaction'],
      },
      {
        id: 'main-data',
        title: 'Main data surface',
        goal: 'Support scanning, comparison, and prioritization.',
        components: ['table', 'chart', 'empty state', 'error state'],
        states: ['loading', 'empty', 'filtered-empty', 'error', 'partial-data'],
      },
      {
        id: 'inspector',
        title: 'Detail inspector',
        goal: 'Keep the selected record or panel visible without forcing hard navigation.',
        components: ['side panel', 'metadata stack', 'secondary actions'],
        states: ['loading', 'success', 'destructive-confirmation', 'permissions'],
      },
      {
        id: 'activity',
        title: 'Activity or evidence lane',
        goal: 'Make timeline, logs, or recent changes easy to inspect in context.',
        components: ['timeline', 'event list', 'status outputs'],
        states: ['loading', 'empty', 'error', 'long-running'],
      },
    ],
    proofSurfaces: [
      'Primary metrics should stay anchored, not move around between breakpoints.',
      'Operational trust comes from visible state handling more than decorative polish.',
    ],
    copyGoals: [
      'Keep labels short, directive, and high-signal.',
      'Use helper text only where it reduces ambiguity or risk.',
    ],
    responsivePriorities: [
      'Protect scan order on tablet and mobile before preserving every desktop column.',
      'Collapsed layouts should preserve summary rail, filters, and selected record context.',
    ],
    motionMoments: [
      'Reserve motion for state change, selection, and live status.',
      'Use panel transitions to preserve context rather than announce animation.',
    ],
    antiPatterns: [
      'Do not replace relational data with decorative cards when comparison matters.',
      'Do not bury risk and action behind accordions or hidden secondary tabs.',
    ],
  },
  {
    id: 'settings',
    label: 'Settings Surface',
    cues: ['settings', 'preferences', 'account', 'billing', 'profile', 'configuration', 'member settings'],
    archetypes: ['saas-app', 'control-plane'],
    categories: ['b2b-saas', 'developer-tool', 'content-studio'],
    summary: 'Task-focused settings experience with grouped forms, explicit validation, and safe destructive boundaries.',
    primaryOutcome: 'Help users change configuration without confusion or accidental damage.',
    sections: [
      {
        id: 'header',
        title: 'Settings header',
        goal: 'Orient the user to the surface and current account or workspace scope.',
        components: ['page title', 'scope badge', 'status callout'],
        states: ['loading', 'permissions'],
      },
      {
        id: 'form-groups',
        title: 'Grouped configuration forms',
        goal: 'Group related fields by outcome, not by database schema.',
        components: ['form cards', 'labels', 'helper text', 'save bar'],
        states: ['form-validation', 'success', 'error', 'loading'],
      },
      {
        id: 'integrations',
        title: 'Integrations or connected services',
        goal: 'Show connected systems and the current sync state clearly.',
        components: ['integration list', 'connection status', 'secondary actions'],
        states: ['loading', 'empty', 'error', 'offline'],
      },
      {
        id: 'destructive-zone',
        title: 'Destructive or risky actions',
        goal: 'Separate dangerous actions from routine configuration.',
        components: ['danger card', 'confirmation modal', 'support text'],
        states: ['destructive-confirmation', 'success', 'error', 'permissions'],
      },
    ],
    proofSurfaces: [
      'Explain current state, not just available actions.',
      'Keep audit or last-updated context near high-impact changes.',
    ],
    copyGoals: [
      'Field labels should be plain and specific.',
      'Error and success messages should explain impact and next action.',
    ],
    responsivePriorities: [
      'Avoid two-column forms that collapse into confusing input order on mobile.',
      'Sticky save or status bars should remain visible when the form grows long.',
    ],
    motionMoments: [
      'Use inline validation and save confirmations as the only expressive motion moments.',
    ],
    antiPatterns: [
      'Do not mix routine settings with destructive actions in the same visual weight.',
      'Do not force users to rediscover unsaved changes after validation fails.',
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing Page',
    cues: ['pricing', 'plans', 'subscription', 'compare plans', 'tiers', 'billing page'],
    archetypes: ['editorial-marketing', 'commerce'],
    categories: ['b2b-saas', 'marketing-site', 'commerce', 'ai-platform'],
    summary: 'Conversion-oriented pricing page with clear plan comparison and strong trust cues.',
    primaryOutcome: 'Help users understand plan fit and move into checkout or contact.',
    sections: [
      {
        id: 'pricing-hero',
        title: 'Pricing hero',
        goal: 'Frame value, audience fit, and billing model before the user compares rows.',
        components: ['headline', 'billing toggle', 'primary CTA'],
        states: ['loading', 'success'],
      },
      {
        id: 'plan-grid',
        title: 'Plan grid',
        goal: 'Make the differences between plans clear without forcing a spreadsheet-first read.',
        components: ['plan cards', 'featured tier', 'price callouts'],
        states: ['loading', 'empty', 'error'],
      },
      {
        id: 'comparison',
        title: 'Comparison detail',
        goal: 'Support deeper evaluation with a structured feature matrix.',
        components: ['compare table', 'faq disclosure', 'secondary CTA'],
        states: ['filtered-empty', 'mobile-nav'],
      },
      {
        id: 'trust-cta',
        title: 'Trust and final CTA',
        goal: 'Answer final objections with proof, policy, and a clear handoff.',
        components: ['logos', 'security/compliance notes', 'final CTA'],
        states: ['form-validation', 'success', 'error'],
      },
    ],
    proofSurfaces: [
      'Plan cards should show a real differentiation axis, not just reordered bullets.',
      'Trust cues should sit near price commitment, not hidden at the page footer.',
    ],
    copyGoals: [
      'Make plan labels and usage boundaries concrete.',
      'Avoid vague value fluff in comparison rows.',
    ],
    responsivePriorities: [
      'Featured plan emphasis should survive narrow screens without horizontal chaos.',
      'Comparison matrices should collapse intentionally, not via uncontrolled overflow.',
    ],
    motionMoments: [
      'Keep pricing transitions calm; billing toggles and compare highlights are enough.',
    ],
    antiPatterns: [
      'Do not hide pricing truth behind contact-sales ambiguity unless the business model requires it.',
      'Do not make compare tables unreadable on mobile.',
    ],
  },
  {
    id: 'studio-workspace',
    label: 'Studio Workspace',
    cues: ['studio', 'editor', 'compose', 'draft', 'publish', 'workspace', 'asset library', 'cms'],
    archetypes: ['content-studio', 'saas-app'],
    categories: ['content-studio', 'developer-tool', 'ai-platform'],
    summary: 'Quiet chrome workspace that keeps the creation surface dominant and the surrounding tools readable.',
    primaryOutcome: 'Support focused creation, feedback, and save/publish confidence.',
    sections: [
      {
        id: 'workspace-header',
        title: 'Workspace header',
        goal: 'Expose document or asset identity, status, and key actions.',
        components: ['title row', 'status chip', 'primary action', 'secondary toolbar'],
        states: ['loading', 'success', 'offline'],
      },
      {
        id: 'main-canvas',
        title: 'Main canvas',
        goal: 'Protect the work area as the dominant surface.',
        components: ['editor/canvas', 'inline controls', 'content regions'],
        states: ['loading', 'empty', 'error', 'long-running'],
      },
      {
        id: 'side-rail',
        title: 'Context side rail',
        goal: 'Keep metadata, revisions, prompts, or assets accessible without stealing focus.',
        components: ['tabs', 'inspector', 'asset list', 'activity panel'],
        states: ['loading', 'empty', 'permissions'],
      },
      {
        id: 'publish-flow',
        title: 'Save and publish flow',
        goal: 'Make save state, publish readiness, and recovery paths unmistakable.',
        components: ['save indicator', 'publish CTA', 'confirmation surfaces'],
        states: ['form-validation', 'success', 'error', 'destructive-confirmation'],
      },
    ],
    proofSurfaces: [
      'The work area must stay visually dominant over support rails.',
      'Save and publish state should be visible without forcing deep navigation.',
    ],
    copyGoals: [
      'Use action labels that map cleanly to save, publish, preview, and revert.',
      'Keep meta copy supportive, not chatty.',
    ],
    responsivePriorities: [
      'Collapsed rails should still keep save state and main canvas visible.',
      'Toolbar overflow should prioritize creation actions over tertiary controls.',
    ],
    motionMoments: [
      'Use motion to preserve context when drawers, inspectors, or previews open.',
      'Long-running operations should show progress without blocking the canvas when possible.',
    ],
    antiPatterns: [
      'Do not let the editor feel like one tab among many equal-weight cards.',
      'Do not make publish/save state ambiguous or easy to miss.',
    ],
  },
]);

const ROLE_PALETTES = Object.freeze({
  'developer-tool': { accent: '#2563eb', accentSoft: '#dbeafe', secondary: '#ea580c' },
  'ai-platform': { accent: '#0f766e', accentSoft: '#ccfbf1', secondary: '#2563eb' },
  'analytics-platform': { accent: '#2563eb', accentSoft: '#dbeafe', secondary: '#059669' },
  'b2b-saas': { accent: '#2563eb', accentSoft: '#dbeafe', secondary: '#0f766e' },
  'marketing-site': { accent: '#c2410c', accentSoft: '#ffedd5', secondary: '#0f766e' },
  commerce: { accent: '#b45309', accentSoft: '#fef3c7', secondary: '#0f766e' },
  'service-business': { accent: '#2f855a', accentSoft: '#dcfce7', secondary: '#b76e79' },
  'content-studio': { accent: '#0f766e', accentSoft: '#ccfbf1', secondary: '#4338ca' },
});

const TASTE_SURFACES = Object.freeze({
  'operator-dense': {
    background: '#0b1220',
    surface: '#111a2b',
    text: '#e6edf7',
    muted: '#8a99b2',
    border: '#25324a',
    shadow: 'Subtle downward elevation with crisp borders and low chroma.',
  },
  'semantic-minimal': {
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    muted: '#64748b',
    border: '#cbd5e1',
    shadow: 'Very light or near-flat depth; borders do most of the grouping work.',
  },
  'premium-minimal': {
    background: '#f6f3ee',
    surface: '#ffffff',
    text: '#171717',
    muted: '#6b7280',
    border: '#d6d3d1',
    shadow: 'Low-noise ambient elevation with soft but disciplined edges.',
  },
  'editorial-contrast': {
    background: '#fcfaf7',
    surface: '#ffffff',
    text: '#121212',
    muted: '#57534e',
    border: '#d6d3d1',
    shadow: 'Selective emphasis blocks instead of pervasive shadows.',
  },
  'glass-soft': {
    background: '#edf4f8',
    surface: '#ffffff',
    text: '#102030',
    muted: '#5f7389',
    border: '#c2d2df',
    shadow: 'Soft layered depth with disciplined translucency; readability stays solid.',
  },
  'playful-modern': {
    background: '#fffaf5',
    surface: '#ffffff',
    text: '#1f2937',
    muted: '#6b7280',
    border: '#f1ddcb',
    shadow: 'Friendly soft elevation on interactive zones only.',
  },
  'brutalist-utility': {
    background: '#f5f5f4',
    surface: '#ffffff',
    text: '#111111',
    muted: '#4b5563',
    border: '#111111',
    shadow: 'Nearly flat; rely on hard contrast and geometry over blur.',
  },
});

const TYPOGRAPHY_PROFILES = Object.freeze({
  'Linear Precision': {
    display: 'Manrope',
    body: 'Manrope',
    mono: 'IBM Plex Mono',
    notes: 'Neutral precision with strong UI readability and clean dashboard rhythm.',
  },
  'Cursor Editorial Warmth': {
    display: 'Space Grotesk',
    body: 'Manrope',
    mono: 'IBM Plex Mono',
    notes: 'Warm editorial contrast for premium technical storytelling.',
  },
  'Cohere Data-Rich': {
    display: 'Sora',
    body: 'Manrope',
    mono: 'IBM Plex Mono',
    notes: 'Structured technical polish with strong contrast in section hierarchy.',
  },
  'OpenCode Terminal Honesty': {
    display: 'IBM Plex Sans',
    body: 'IBM Plex Sans',
    mono: 'IBM Plex Mono',
    notes: 'Tool-first typography with explicit monospace support where credibility matters.',
  },
  'VoltAgent Command Energy': {
    display: 'Space Grotesk',
    body: 'Manrope',
    mono: 'JetBrains Mono',
    notes: 'Technical authority with slightly more visual energy in hero and architecture sections.',
  },
  'Replicate Cleanroom': {
    display: 'Sora',
    body: 'Manrope',
    mono: 'JetBrains Mono',
    notes: 'Calm product-forward typography that lets demos and proof carry the page.',
  },
});

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function inferPageType(goal, direction, designDna) {
  const text = normalize(goal);
  const ranked = PAGE_TYPES
    .map((entry) => {
      let score = entry.cues.reduce((sum, cue) => (text.includes(cue) ? sum + 2 : sum), 0);
      if (entry.archetypes.includes(direction.archetype.id)) {
        score += 2;
      }
      if (entry.categories.includes(designDna.productCategory.id)) {
        score += 2;
      }
      if (entry.id === 'landing-page' && direction.archetype.id === 'editorial-marketing') {
        score += 1;
      }
      if (entry.id === 'dashboard' && direction.archetype.id === 'control-plane') {
        score += 2;
      }
      if (entry.id === 'studio-workspace' && direction.archetype.id === 'content-studio') {
        score += 2;
      }
      if (entry.id === 'settings' && /\b(settings|billing|account|profile|preferences)\b/.test(text)) {
        score += 3;
      }
      if (entry.id === 'pricing' && /\b(pricing|plans|tiers|subscription)\b/.test(text)) {
        score += 3;
      }
      return { entry, score };
    })
    .sort((left, right) => right.score - left.score);

  const chosen = ranked[0]?.score > 0
    ? ranked[0].entry
    : PAGE_TYPES.find((entry) => entry.archetypes.includes(direction.archetype.id))
      || PAGE_TYPES[0];
  return {
    ...chosen,
    reason: ranked[0]?.score > 0
      ? `Matched ${chosen.label.toLowerCase()} cues from the current goal plus ${direction.archetype.label} archetype alignment.`
      : `Defaulted to ${chosen.label.toLowerCase()} because it fits the ${direction.archetype.label} archetype best.`,
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function resolveSectionStates(section, stateAtlas) {
  const knownStates = new Set(stateAtlas.states.map((entry) => entry.id));
  return unique((section.states || []).filter((state) => knownStates.has(state)));
}

function buildImplementationSequence(pageType) {
  const ordered = pageType.sections.map((section) => section.title);
  return [
    `Land ${ordered[0]} first so hierarchy and the primary outcome are visible immediately.`,
    `Build ${ordered.slice(1, -1).join(', ')} next with shared primitives and explicit state hooks.`,
    `Close with ${ordered[ordered.length - 1]} and verify responsive behavior plus state coverage in the same pass.`,
  ];
}

function buildPageBlueprintPayload(cwd, rootDir, direction, designDna, stateAtlas, options = {}) {
  const pageType = inferPageType(options.page || options.goal || '', direction, designDna);
  const sections = pageType.sections.map((section) => ({
    id: section.id,
    title: section.title,
    goal: section.goal,
    components: section.components,
    states: resolveSectionStates(section, stateAtlas),
  }));

  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    pageType: {
      id: pageType.id,
      label: pageType.label,
      summary: pageType.summary,
      reason: pageType.reason,
    },
    primaryOutcome: pageType.primaryOutcome,
    sections,
    proofSurfaces: pageType.proofSurfaces,
    copyGoals: pageType.copyGoals,
    responsivePriorities: pageType.responsivePriorities,
    motionMoments: pageType.motionMoments,
    antiPatterns: unique([...pageType.antiPatterns, ...designDna.antiPatterns.slice(0, 4)]),
    implementationSequence: buildImplementationSequence(pageType),
  };
}

function renderPageBlueprintMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Page type: \`${payload.pageType.label}\``,
    `- Why: ${payload.pageType.reason}`,
    `- Primary outcome: ${payload.primaryOutcome}`,
    '',
    '## Section Map',
    '',
    ...payload.sections.flatMap((section) => ([
      `### ${section.title}`,
      '',
      `- Goal: ${section.goal}`,
      `- Components: \`${section.components.join(', ')}\``,
      `- States: \`${section.states.join(', ') || 'none'}\``,
      '',
    ])),
    '## Proof Surfaces',
    '',
    ...payload.proofSurfaces.map((item) => `- ${item}`),
    '',
    '## Copy Goals',
    '',
    ...payload.copyGoals.map((item) => `- ${item}`),
    '',
    '## Responsive Priorities',
    '',
    ...payload.responsivePriorities.map((item) => `- ${item}`),
    '',
    '## Motion Moments',
    '',
    ...payload.motionMoments.map((item) => `- ${item}`),
    '',
    '## Anti-Patterns',
    '',
    ...payload.antiPatterns.map((item) => `- ${item}`),
    '',
    '## Implementation Sequence',
    '',
    ...payload.implementationSequence.map((item) => `- ${item}`),
  ];
  return lines.join('\n');
}

function buildPageBlueprintDoc(cwd, rootDir, direction, designDna, stateAtlas, options = {}) {
  const payload = buildPageBlueprintPayload(cwd, rootDir, direction, designDna, stateAtlas, options);
  const filePath = writeDoc(path.join(rootDir, 'PAGE-BLUEPRINT.md'), 'PAGE BLUEPRINT', renderPageBlueprintMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'page-blueprint.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });
  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function buildColorPalette(direction, designDna) {
  const tasteSurface = TASTE_SURFACES[direction.taste.profile.id] || TASTE_SURFACES['premium-minimal'];
  const rolePalette = ROLE_PALETTES[designDna.productCategory.id] || ROLE_PALETTES['b2b-saas'];
  return {
    primaryAccent: rolePalette.accent,
    accentSoft: rolePalette.accentSoft,
    secondaryAccent: rolePalette.secondary,
    background: tasteSurface.background,
    surface: tasteSurface.surface,
    text: tasteSurface.text,
    muted: tasteSurface.muted,
    border: tasteSurface.border,
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    notes: `Use ${rolePalette.accent} as the main action accent and keep all other chroma subordinate to the ${direction.taste.profile.label.toLowerCase()} surface system.`,
  };
}

function buildTypography(designDna) {
  const lead = designDna.references[0]?.label;
  const chosen = TYPOGRAPHY_PROFILES[lead] || TYPOGRAPHY_PROFILES['Linear Precision'];
  return {
    display: chosen.display,
    body: chosen.body,
    mono: chosen.mono,
    notes: chosen.notes,
    hierarchy: [
      `Display: ${chosen.display} at 48-64px with compressed but readable line-height for hero or primary headers.`,
      `Section heading: ${chosen.display} or ${chosen.body} at 28-36px with strong contrast from body copy.`,
      `Body: ${chosen.body} at 16-18px with calm line-height and no gimmicky letter-spacing.`,
      `Meta/code: ${chosen.mono} for technical labels, snippets, and compact evidence surfaces.`,
    ],
  };
}

function buildComponentStyling(direction, pageBlueprint, palette) {
  return [
    `Buttons: primary actions use ${palette.primaryAccent} with the ${direction.taste.profile.label} surface discipline; secondary actions stay quieter but clearly interactive.`,
    `Cards and sections: follow the token posture (${Object.entries(direction.designTokens).map(([key, value]) => `${key}=${value}`).join(' | ')}) before introducing page-local styling exceptions.`,
    `Inputs and filters: labels and helper copy must stay explicit; validation states should use semantic color plus text, never color alone.`,
    `Navigation: preserve a strong active state and obvious action lane on ${pageBlueprint.pageType.label.toLowerCase()} surfaces.`,
  ];
}

function buildLayoutPrinciples(direction, pageBlueprint) {
  return [
    `Use the ${pageBlueprint.pageType.label.toLowerCase()} section order as the default layout spine.`,
    `Spacing should follow ${direction.designTokens.spacing} and avoid improvised page-local gaps.`,
    `Let section rhythm and hierarchy do more work than visual decoration.`,
    `Keep responsive collapse behavior intentional for ${pageBlueprint.sections[0]?.title || 'the primary section'} and the primary CTA zone.`,
  ];
}

function buildDepthAndElevation(direction) {
  const surface = TASTE_SURFACES[direction.taste.profile.id] || TASTE_SURFACES['premium-minimal'];
  return [
    surface.shadow,
    `Borders and surface layering should reinforce ${direction.taste.hierarchy}.`,
    `Reserve the richest elevation for one emphasis surface per screen family.`,
  ];
}

function renderDesignMdMarkdown(payload) {
  const paletteEntries = [
    ['Primary Accent', payload.palette.primaryAccent, 'Primary CTA, links, selection state'],
    ['Accent Soft', payload.palette.accentSoft, 'Tinted backgrounds, support emphasis'],
    ['Secondary Accent', payload.palette.secondaryAccent, 'Charts, secondary emphasis, comparison cues'],
    ['Background', payload.palette.background, 'Page canvas'],
    ['Surface', payload.palette.surface, 'Cards, panels, raised surfaces'],
    ['Text', payload.palette.text, 'Primary headings and body text'],
    ['Muted', payload.palette.muted, 'Metadata, helper copy, supporting labels'],
    ['Border', payload.palette.border, 'Containment, dividers, input boundaries'],
    ['Success', payload.palette.success, 'Success states and confirmations'],
    ['Warning', payload.palette.warning, 'Warning states'],
    ['Danger', payload.palette.danger, 'Destructive and error states'],
  ];

  const lines = [
    `# Design System: ${payload.title}`,
    '',
    '## 1. Visual Theme & Atmosphere',
    '',
    payload.visualTheme,
    '',
    '## 2. Color Palette & Roles',
    '',
    ...paletteEntries.map(([label, value, role]) => `- **${label}** (\`${value}\`): ${role}`),
    `- Notes: ${payload.palette.notes}`,
    '',
    '## 3. Typography Rules',
    '',
    `- Display family: \`${payload.typography.display}\``,
    `- Body family: \`${payload.typography.body}\``,
    `- Monospace family: \`${payload.typography.mono}\``,
    `- Notes: ${payload.typography.notes}`,
    ...payload.typography.hierarchy.map((item) => `- ${item}`),
    '',
    '## 4. Component Stylings',
    '',
    ...payload.componentStyling.map((item) => `- ${item}`),
    '',
    '## 5. Layout Principles',
    '',
    ...payload.layoutPrinciples.map((item) => `- ${item}`),
    '',
    '## 6. Depth & Elevation',
    '',
    ...payload.depthAndElevation.map((item) => `- ${item}`),
    '',
    "## 7. Do's and Don'ts",
    '',
    ...payload.dos.map((item) => `- Do: ${item}`),
    ...payload.donts.map((item) => `- Don't: ${item}`),
    '',
    '## 8. Responsive Behavior',
    '',
    ...payload.responsiveBehavior.map((item) => `- ${item}`),
    '',
    '## 9. Agent Prompt Guide',
    '',
    ...payload.agentPromptGuide.map((item) => `- ${item}`),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildDesignMdPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options = {}) {
  const palette = buildColorPalette(direction, designDna);
  const typography = buildTypography(designDna);
  const componentStyling = buildComponentStyling(direction, pageBlueprint, palette);
  const layoutPrinciples = buildLayoutPrinciples(direction, pageBlueprint);
  const depthAndElevation = buildDepthAndElevation(direction);
  const title = options.title
    ? String(options.title).trim()
    : `${designDna.productCategory.label} ${pageBlueprint.pageType.label}`;
  const visualTheme = `This product should feel like ${direction.taste.tagline}. Use ${designDna.blend.summary} as the reference blend, keep the ${pageBlueprint.pageType.label.toLowerCase()} goal centered, and let product truth plus state clarity beat generic template polish.`;
  const dos = unique([
    ...designDna.codexRules.slice(0, 4),
    ...pageBlueprint.copyGoals.slice(0, 2),
    ...pageBlueprint.proofSurfaces.slice(0, 2),
  ]);
  const donts = unique([
    ...designDna.antiPatterns.slice(0, 4),
    ...pageBlueprint.antiPatterns.slice(0, 3),
  ]);
  const responsiveBehavior = unique([
    ...pageBlueprint.responsivePriorities,
    `Required state families to preserve across breakpoints: ${stateAtlas.requiredStates.join(', ')}.`,
    'Keep the primary CTA or next action visible before tertiary content on small screens.',
  ]);
  const agentPromptGuide = [
    `Build a ${pageBlueprint.pageType.label.toLowerCase()} that feels "${direction.taste.tagline}".`,
    `Respect this reference blend: ${designDna.blend.summary}.`,
    `Use these sections by default: ${pageBlueprint.sections.map((item) => item.title).join(' -> ')}.`,
    `Do not skip required state families: ${stateAtlas.requiredStates.join(', ')}.`,
    'If the output starts to look generic, tighten hierarchy, typography, and product proof before adding effects.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    title,
    visualTheme,
    palette,
    typography,
    componentStyling,
    layoutPrinciples,
    depthAndElevation,
    dos,
    donts,
    responsiveBehavior,
    agentPromptGuide,
    pageType: pageBlueprint.pageType,
  };
}

function buildDesignMdDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options = {}) {
  const payload = buildDesignMdPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, options);
  const markdown = renderDesignMdMarkdown(payload);
  const filePath = writeDoc(path.join(rootDir, 'DESIGN.md'), 'DESIGN SYSTEM', markdown.replace(/^# Design System: .+\n\n/, ''));
  const runtimeFile = writeRuntimeJson(cwd, 'design-md.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });

  let projectRootFile = null;
  if (options.projectRoot) {
    projectRootFile = path.join(cwd, 'DESIGN.md');
    fs.writeFileSync(projectRootFile, markdown);
  }

  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
    projectRootFile: projectRootFile ? relativePath(cwd, projectRootFile) : null,
  };
}

module.exports = {
  buildDesignMdDoc,
  buildPageBlueprintDoc,
};
