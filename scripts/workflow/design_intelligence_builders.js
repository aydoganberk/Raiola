const { normalizeText, uniqueSorted } = require('./design_intelligence_profiles');

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
    executionBias: 'Codex should bias toward reusable shells, tokenized primitives, and repeatable state patterns instead of one-off flourishes.',
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
  const dnaReferences = (payload.designDna?.references || []).map((item) => `- \`${item.label}\` -> ${item.signature}`);
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
    '## External Design DNA',
    '',
    `- Product category: \`${payload.designDna.productCategory.label}\``,
    `- Reference blend: \`${payload.designDna.blend.summary}\``,
    `- North star: ${payload.designDna.northStar.promise}`,
    ...dnaReferences,
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
    ...(payload.designDna?.antiPatterns || []).slice(0, 4).map((item) => `- Contract ban: ${item}`),
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

module.exports = {
  buildAcceptanceChecklist,
  buildAntiPatterns,
  buildCodexRecipes,
  buildCopyVoice,
  buildDesignSystemActions,
  buildDesignTokens,
  buildDifferentiators,
  buildExperienceThesis,
  buildImplementationPrompts,
  buildMotionSystem,
  buildNativeFirstRecommendations,
  buildPatterns,
  buildPrinciples,
  buildPrototypeMode,
  buildRecipePack,
  buildScreenBlueprints,
  buildSemanticGuardrails,
  buildSignatureMoments,
  buildStyleGuardrails,
  renderDirectionMarkdown,
};
