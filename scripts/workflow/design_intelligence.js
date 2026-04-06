
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

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function inferArchetype(profile, inventory, uiFiles, contextText) {
  const text = `${contextText}\n${uiFiles.join('\n')}\n${inventory.map((item) => item.name).join(' ')}`.toLowerCase();
  const signals = [
    {
      id: 'control-plane',
      score: (/\b(dashboard|admin|table|grid|metrics|audit|review|queue|pipeline|timeline|status)\b/.test(text) ? 3 : 0)
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
      score: (/\b(marketing|landing|hero|pricing|story|blog|content|article|brand|copy)\b/.test(text) ? 3 : 0)
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

function inferTasteSignature(profile, archetype) {
  const framework = profile.framework.primary;
  const style = profile.styling.detected[0] || 'custom';
  const uiSystem = profile.uiSystem.primary;
  const visualVerdictRequired = profile.visualVerdict?.required;
  const signature = {
    visualTone: archetype.id === 'editorial-marketing'
      ? 'confident editorial minimalism'
      : archetype.id === 'control-plane'
        ? 'quiet precision with dense information'
        : archetype.id === 'commerce'
          ? 'trust-forward merchandising clarity'
          : 'product-grade clarity with measured personality',
    density: archetype.id === 'control-plane' ? 'compact but breathable' : 'balanced spacing with strong grouping',
    motion: profile.stack.motion?.length > 0 ? 'purposeful motion only around state change' : 'minimal motion; rely on contrast and hierarchy',
    hierarchy: archetype.id === 'editorial-marketing'
      ? 'large type contrast, disciplined width, cinematic section rhythm'
      : 'stable shell, clear section ownership, and obvious primary actions',
    implementationBias: `${framework} + ${style} + ${uiSystem}`,
    reviewRequired: visualVerdictRequired ? 'yes' : 'no',
  };
  signature.tagline = `${signature.visualTone}; ${signature.density}; ${signature.motion}.`;
  return signature;
}

function buildPrinciples(profile, archetype) {
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
  return [...shared, ...(byArchetype[archetype.id] || [])];
}

function buildPatterns(profile, inventory, archetype) {
  const inventoryNames = uniqueSorted(inventory.map((item) => item.name));
  const patterns = [
    'Shells: sticky page header + context summary + one primary action zone.',
    'States: every async panel gets skeleton + empty + error + success variants.',
    'Lists & tables: reserve compact density for scanning, not for decorative crowding.',
    'Forms: inline validation, progressive disclosure, and clear destructive affordances.',
    'Navigation: consistent active state, location memory, and keyboard-friendly command affordances.',
  ];
  if (profile.uiSystem.primary.toLowerCase().includes('shadcn')) {
    patterns.push('Use shadcn-style primitives as the base layer, then customize density, radius, and typography through tokens instead of ad-hoc overrides.');
  }
  if (profile.styling.detected.includes('Tailwind')) {
    patterns.push('Prefer semantic Tailwind component wrappers over long inline utility piles when a pattern repeats more than twice.');
  }
  if (inventoryNames.length > 0) {
    patterns.push(`Lean on existing component inventory first: ${inventoryNames.slice(0, 8).join(', ')}.`);
  }
  if (archetype.id === 'control-plane') {
    patterns.push('Use multi-row cards sparingly; data-dense screens benefit from stable tabular or split-pane layouts.');
  }
  return patterns;
}

function buildAntiPatterns(archetype) {
  const shared = [
    'Do not mix multiple visual metaphors on one screen.',
    'Do not hide core actions in tertiary menus when the task is frequent.',
    'Do not use color as the only state signal.',
    'Do not add gradients/shadows/radii without a consistent token story.',
    'Do not let loading/empty/error states regress behind the happy path.',
  ];
  if (archetype.id === 'editorial-marketing') {
    shared.push('Avoid startup cliché styling: random blobs, neon gradients, and meaningless glass cards.');
  }
  if (archetype.id === 'control-plane') {
    shared.push('Avoid oversized cards that waste vertical space and slow operator scanning.');
  }
  return shared;
}

function buildCodexRecipes(profile, archetype, signature) {
  const recipes = [
    `Start each frontend task by restating the design direction in one sentence: "${signature.tagline}"`,
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
  return recipes;
}

function buildAcceptanceChecklist(profile, archetype) {
  const checklist = [
    'Primary action is obvious within 3 seconds of opening the screen.',
    'Typography, spacing, radius, and shadows feel systematic across touched surfaces.',
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

function renderDirectionMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Archetype: \`${payload.archetype.label}\``,
    `- Framework/UI stack: \`${payload.profile.framework.primary} / ${payload.profile.uiSystem.primary} / ${payload.profile.styling.detected.join(', ')}\``,
    `- Taste signature: \`${payload.taste.tagline}\``,
    '',
    '## Product Direction',
    '',
    `- ${payload.archetype.summary}`,
    '',
    '## Taste Signature',
    '',
    `- Visual tone: \`${payload.taste.visualTone}\``,
    `- Density: \`${payload.taste.density}\``,
    `- Motion: \`${payload.taste.motion}\``,
    `- Hierarchy: \`${payload.taste.hierarchy}\``,
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
    '## Codex Implementation Recipes',
    '',
    ...payload.codexRecipes.map((item) => `- ${item}`),
    '',
    '## Acceptance Checklist',
    '',
    ...payload.acceptanceChecklist.map((item) => `- [ ] ${item}`),
  ];
  return lines.join('\n');
}

function buildUiDirection(cwd, rootDir) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const uiFiles = collectUiFiles(cwd);
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  const intentText = [
    tryExtractSection(contextDoc, 'User Intent', ''),
    tryExtractSection(contextDoc, 'Problem Frame', ''),
    tryExtractSection(contextDoc, 'Touched Files', ''),
  ].join('\n');

  const archetype = inferArchetype(profile, inventory, uiFiles, intentText);
  const taste = inferTasteSignature(profile, archetype);
  const payload = {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    profile,
    archetype,
    taste,
    principles: buildPrinciples(profile, archetype),
    patterns: buildPatterns(profile, inventory, archetype),
    antiPatterns: buildAntiPatterns(archetype),
    codexRecipes: buildCodexRecipes(profile, archetype, taste),
    acceptanceChecklist: buildAcceptanceChecklist(profile, archetype),
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
  buildUiDirection,
};
