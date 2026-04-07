const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildUiDirection } = require('./design_intelligence');
const { buildUiSpec } = require('./ui_spec');
const { relativePath, writeDoc } = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
ui_recipe

Usage:
  node scripts/workflow/ui_recipe.js

Options:
  --goal <text>    Optional product/UI goal to steer the scaffold
  --taste <id>     Optional explicit taste profile override
  --recipe <id>    Optional explicit recipe id override
  --root <path>    Workflow root. Defaults to active workstream root
  --json           Print machine-readable output
  `);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function sentenceLabel(recipe) {
  const base = recipe.title || recipe.id || 'UI scaffold';
  return base.replace(/[^A-Za-z0-9]+/g, ' ').trim();
}

function pascalCase(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('') || 'UiRecipe';
}

function selectRecipe(direction, goal, explicitRecipe) {
  const recipes = direction.recipePack || [];
  if (recipes.length === 0) {
    throw new Error('No recipe pack is available for the current UI direction.');
  }

  const requested = normalize(explicitRecipe);
  if (requested) {
    const exact = recipes.find((item) => normalize(item.id) === requested || normalize(item.title) === requested);
    if (exact) {
      return exact;
    }
  }

  const goalText = normalize(goal);
  const scored = recipes.map((item, index) => {
    const haystack = normalize([item.id, item.title, item.useWhen, item.structure, item.implementationBias].join(' '));
    let score = 0;
    for (const token of goalText.split(/\s+/).filter(Boolean)) {
      if (haystack.includes(token)) {
        score += token.length > 4 ? 3 : 1;
      }
    }
    if (goalText && goalText.includes('dashboard') && /filter|table|summary|command/.test(item.id)) {
      score += 3;
    }
    if (goalText && goalText.includes('settings') && /form|detail/.test(item.id)) {
      score += 3;
    }
    if (goalText && goalText.includes('landing') && /hero|story/.test(item.id)) {
      score += 3;
    }
    return { item, score, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index);

  return scored[0].item;
}

function relevantNativeRecommendations(direction, recipe) {
  const id = recipe.id || '';
  const ids = new Set(['feedback']);
  if (/filter|table|summary|command/.test(id)) {
    ids.add('table');
    ids.add('menu');
    ids.add('form');
  }
  if (/form|detail/.test(id)) {
    ids.add('form');
    ids.add('dialog');
  }
  if (/hero|story|shell|focus/.test(id)) {
    ids.add('disclosure');
  }
  if (/async|state/.test(id)) {
    ids.add('feedback');
  }
  return (direction.nativeFirstRecommendations || []).filter((item) => ids.has(item.id)).slice(0, 4);
}

function buildSemanticHtml(recipe, direction) {
  const title = sentenceLabel(recipe);
  const heading = direction.archetype.label === 'control-plane' ? 'Operations overview' : title;

  switch (recipe.id) {
    case 'async-state-cluster':
      return `<!-- Prototype the full async contract before polishing the happy path -->
<section aria-labelledby="async-title">
  <header>
    <h2 id="async-title">${title}</h2>
    <p>Use one shared state family for loading, empty, error, and success.</p>
  </header>

  <div data-state="loading" role="status" aria-live="polite">
    <p>Loading recent results...</p>
  </div>

  <div data-state="empty" hidden>
    <h3>Nothing here yet</h3>
    <p>Explain what users can do next.</p>
    <button type="button">Create first item</button>
  </div>

  <div data-state="error" hidden role="status" aria-live="polite">
    <h3>Something went wrong</h3>
    <p>Briefly explain the failure and recovery path.</p>
    <button type="button">Retry</button>
  </div>

  <div data-state="success" hidden>
    <output aria-live="polite">Changes saved.</output>
  </div>
</section>`;
    case 'form-card':
      return `<section aria-labelledby="settings-title">
  <header>
    <h1 id="settings-title">${heading}</h1>
    <p>Keep labels, helper copy, and error messages explicit.</p>
  </header>

  <article>
    <header>
      <h2>Profile settings</h2>
      <p>Update the core account information.</p>
    </header>

    <form>
      <label>
        Name
        <input type="text" name="name" />
      </label>

      <label>
        Email
        <input type="email" name="email" />
      </label>

      <fieldset>
        <legend>Notifications</legend>
        <label><input type="checkbox" /> Email updates</label>
      </fieldset>

      <footer>
        <button type="button">Cancel</button>
        <button type="submit">Save changes</button>
      </footer>
    </form>
  </article>
</section>`;
    case 'filter-table-inspector':
      return `<main>
  <header>
    <div>
      <p>Review surface</p>
      <h1>${heading}</h1>
      <p>Keep filters, relational data, and the detail inspector visible at once.</p>
    </div>
    <button type="button">Primary action</button>
  </header>

  <section aria-labelledby="filters-title">
    <h2 id="filters-title">Filters</h2>
    <form>
      <label>
        Search
        <input type="search" name="search" />
      </label>
      <label>
        Status
        <select name="status">
          <option>All</option>
          <option>Open</option>
          <option>Closed</option>
        </select>
      </label>
    </form>
  </section>

  <section aria-labelledby="results-title">
    <h2 id="results-title">Results</h2>
    <table>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Status</th>
          <th scope="col">Updated</th>
          <th scope="col">Owner</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Alpha</td>
          <td><output>Open</output></td>
          <td>Today</td>
          <td>Ops</td>
        </tr>
      </tbody>
    </table>
  </section>

  <aside aria-labelledby="inspector-title">
    <h2 id="inspector-title">Inspector</h2>
    <p>Keep the selected row context and next actions visible here.</p>
    <button type="button">Open detail</button>
  </aside>
</main>`;
    case 'command-summary-rail':
      return `<main>
  <header>
    <div>
      <p>Command center</p>
      <h1>${heading}</h1>
      <p>Use a stable command lane and a fixed summary rail before adding decorative panels.</p>
    </div>
    <button type="button">Run primary action</button>
  </header>

  <nav aria-label="Quick commands">
    <button type="button">Refresh</button>
    <button type="button">Assign</button>
    <button type="button">Escalate</button>
  </nav>

  <section aria-labelledby="summary-title">
    <h2 id="summary-title">Summary</h2>
    <dl>
      <div><dt>Open risks</dt><dd>3</dd></div>
      <div><dt>Queued reviews</dt><dd>12</dd></div>
      <div><dt>Latest sync</dt><dd>2m ago</dd></div>
    </dl>
  </section>

  <section aria-labelledby="main-work-title">
    <h2 id="main-work-title">Main work area</h2>
    <p>Keep the high-signal data surface here.</p>
  </section>
</main>`;
    case 'hero-proof-story':
      return `<main>
  <header>
    <p>Section label</p>
    <h1>${heading}</h1>
    <p>Let hierarchy and proof blocks do the heavy lifting before visual effects.</p>
    <button type="button">Get started</button>
  </header>

  <section aria-labelledby="proof-title">
    <h2 id="proof-title">Proof</h2>
    <ul>
      <li>Trusted by high-signal teams</li>
      <li>Fast implementation path</li>
      <li>Clear operator feedback loops</li>
    </ul>
  </section>

  <section aria-labelledby="story-title">
    <h2 id="story-title">Story</h2>
    <article>
      <h3>Why this workflow feels different</h3>
      <p>Explain the product value with authored, concrete copy.</p>
    </article>
  </section>
</main>`;
    case 'focus-editor-shell':
      return `<main>
  <header>
    <h1>${heading}</h1>
    <output aria-live="polite">Saved 2 minutes ago</output>
  </header>

  <section aria-labelledby="editor-title">
    <h2 id="editor-title">Primary editor</h2>
    <textarea rows="12">Focus on the authoring surface first.</textarea>
  </section>

  <aside aria-labelledby="metadata-title">
    <h2 id="metadata-title">Metadata</h2>
    <details>
      <summary>Publishing settings</summary>
      <p>Park supporting metadata in a quiet secondary rail.</p>
    </details>
  </aside>
</main>`;
    case 'detail-dialog-flow':
      return `<main>
  <header>
    <h1>${heading}</h1>
    <p>Keep the main detail surface calm and let focused edits happen in a dialog.</p>
  </header>

  <section aria-labelledby="detail-title">
    <h2 id="detail-title">Primary detail</h2>
    <p>Show the main content and supporting metadata here.</p>
    <button type="button" commandfor="edit-dialog" command="show-modal">Edit details</button>
  </section>

  <dialog id="edit-dialog">
    <form method="dialog">
      <header>
        <h2>Edit details</h2>
        <p>Use a focused overlay for short, high-confidence edits.</p>
      </header>
      <label>
        Title
        <input type="text" name="title" />
      </label>
      <footer>
        <button type="button" commandfor="edit-dialog" command="close">Cancel</button>
        <button value="save">Save</button>
      </footer>
    </form>
  </dialog>
</main>`;
    default:
      return `<main>
  <header>
    <h1>${heading}</h1>
    <p>${recipe.implementationBias}</p>
  </header>

  <section>
    <h2>${recipe.title}</h2>
    <p>${recipe.structure}</p>
  </section>
</main>`;
  }
}

function buildTsxScaffold(recipe, direction, spec) {
  const componentName = pascalCase(recipe.title);
  const heading = direction.archetype.label === 'control-plane' ? 'Operations overview' : sentenceLabel(recipe);

  switch (recipe.id) {
    case 'async-state-cluster':
      return `type AsyncState = 'loading' | 'empty' | 'error' | 'success';

export function ${componentName}({ state = 'loading' }: { state?: AsyncState }) {
  if (state === 'loading') {
    return (
      <section aria-labelledby="async-title">
        <h2 id="async-title">${sentenceLabel(recipe)}</h2>
        <p role="status">Loading recent results...</p>
      </section>
    );
  }

  if (state === 'empty') {
    return (
      <section aria-labelledby="async-title">
        <h2 id="async-title">${sentenceLabel(recipe)}</h2>
        <p>Explain what users can do next.</p>
        <button type="button">Create first item</button>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section aria-labelledby="async-title">
        <h2 id="async-title">${sentenceLabel(recipe)}</h2>
        <p role="status">Something went wrong. Provide a recovery path.</p>
        <button type="button">Retry</button>
      </section>
    );
  }

  return <output aria-live="polite">Changes saved.</output>;
}`;
    case 'form-card':
      return `export default function ${componentName}Page() {
  return (
    <main>
      <header>
        <h1>${heading}</h1>
        <p>Bind spacing, radius, and button treatment to shared tokens before page-local styling.</p>
      </header>

      <section aria-labelledby="profile-settings-title">
        <header>
          <h2 id="profile-settings-title">Profile settings</h2>
          <p>Keep labels, hints, and validation semantics explicit.</p>
        </header>

        <form>
          <label>
            Name
            <input type="text" name="name" />
          </label>

          <label>
            Email
            <input type="email" name="email" />
          </label>

          <fieldset>
            <legend>Notifications</legend>
            <label><input type="checkbox" /> Email updates</label>
          </fieldset>

          <footer>
            <button type="button">Cancel</button>
            <button type="submit">Save changes</button>
          </footer>
        </form>
      </section>
    </main>
  );
}`;
    case 'filter-table-inspector':
      return `export default function ${componentName}Page() {
  return (
    <main>
      <header>
        <div>
          <p>Review surface</p>
          <h1>${heading}</h1>
          <p>Keep filters, relational data, and the detail inspector visible at once.</p>
        </div>
        <button type="button">Primary action</button>
      </header>

      <section aria-labelledby="filters-title">
        <h2 id="filters-title">Filters</h2>
        <form>
          <label>
            Search
            <input type="search" name="search" />
          </label>
          <label>
            Status
            <select name="status">
              <option>All</option>
              <option>Open</option>
              <option>Closed</option>
            </select>
          </label>
        </form>
      </section>

      <section aria-labelledby="results-title">
        <h2 id="results-title">Results</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
              <th scope="col">Owner</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alpha</td>
              <td><output>Open</output></td>
              <td>Today</td>
              <td>Ops</td>
            </tr>
          </tbody>
        </table>
      </section>

      <aside aria-labelledby="inspector-title">
        <h2 id="inspector-title">Inspector</h2>
        <p>Keep the selected row context and next actions visible here.</p>
        <button type="button">Open detail</button>
      </aside>
    </main>
  );
}`;
    case 'detail-dialog-flow':
      return `export default function ${componentName}Page() {
  return (
    <main>
      <header>
        <h1>${heading}</h1>
        <p>Translate the semantic dialog contract into the repo stack after the main surface is stable.</p>
      </header>

      <section aria-labelledby="detail-title">
        <h2 id="detail-title">Primary detail</h2>
        <p>Show the main content and supporting metadata here.</p>
        <button type="button">Edit details</button>
      </section>

      {/* Map this block to the repo dialog primitive while preserving title, description, close, and save flows. */}
      <section aria-labelledby="dialog-contract-title">
        <h2 id="dialog-contract-title">Dialog contract</h2>
        <p>Title, helper text, focused form fields, cancel, and save actions belong here.</p>
      </section>
    </main>
  );
}`;
    default:
      return `export default function ${componentName}Page() {
  return (
    <main>
      <header>
        <h1>${heading}</h1>
        <p>${recipe.implementationBias}</p>
      </header>

      <section aria-labelledby="recipe-title">
        <h2 id="recipe-title">${recipe.title}</h2>
        <p>${recipe.structure}</p>
      </section>
    </main>
  );
}`;
  }
}

function buildTargetFiles(profile, recipe) {
  const files = [];
  const componentName = pascalCase(recipe.title);
  const pageFile = profile.framework.primary === 'Next'
    ? 'app/page.tsx'
    : profile.framework.primary === 'Remix'
      ? 'app/routes/_index.tsx'
      : 'src/pages/index.tsx';
  files.push(pageFile);

  if (/async|form|detail|filter|command/.test(recipe.id)) {
    files.push(`components/${componentName}.tsx`);
  }
  if (profile.styling.detected.includes('Tailwind')) {
    files.push('components/ui-shell.tsx');
  } else {
    files.push(`components/${componentName}.module.css`);
  }
  return files;
}

function buildVerificationPlan(recipe) {
  const plan = [
    'cwf ui-review',
    'cwf verify-browser --smoke',
  ];
  if (/filter|table|command/.test(recipe.id)) {
    plan.unshift('Check table semantics, filter labels, and scan speed on narrow and wide widths.');
  }
  if (/form|detail/.test(recipe.id)) {
    plan.unshift('Check labels, error/help copy, submit/cancel behavior, and focused edit flow.');
  }
  if (/async|state/.test(recipe.id)) {
    plan.unshift('Capture loading, empty, error, and success states in one review pass.');
  }
  return plan;
}

function buildTranslationNotes(profile, direction, spec, recipe) {
  return [
    `Start from the ${direction.taste.profile.label} taste signature: ${direction.taste.tagline}`,
    `Keep the semantic contract explicit before translating to ${profile.uiSystem.primary} primitives.`,
    `Prefer shared components from the detected inventory (${spec.inventory.slice(0, 4).map((item) => item.name).join(', ') || 'none yet'}) before adding page-local abstractions.`,
    ...relevantNativeRecommendations(direction, recipe).map((item) => `${item.title}: ${item.stackTranslation}`),
  ];
}

function renderRecipeMarkdown(payload) {
  return `
- UI direction: \`${payload.uiDirection}\`
- UI spec: \`${payload.uiSpec}\`
- Recipe: \`${payload.recipe.id}\`
- Recipe title: \`${payload.recipe.title}\`
- Framework: \`${payload.profile.framework.primary}\`
- UI system: \`${payload.profile.uiSystem.primary}\`
- Prototype mode: \`${payload.prototypeMode.mode}\`

## Why This Recipe

- \`${payload.recipe.useWhen}\`
- \`${payload.recipe.structure}\`
- \`${payload.recipe.implementationBias}\`

## Semantic Prototype

\`\`\`${payload.semanticPrototype.language}
${payload.semanticPrototype.code}
\`\`\`

## Stack Scaffold

\`\`\`${payload.stackScaffold.language}
${payload.stackScaffold.code}
\`\`\`

## Target Files

${payload.targetFiles.map((item) => `- \`${item}\``).join('\n')}

## Translation Notes

${payload.translationNotes.map((item) => `- \`${item}\``).join('\n')}

## Native-First Recommendations

${payload.nativeFirst.map((item) => `- \`${item.title}\` -> ${item.native} -> ${item.stackTranslation}`).join('\n')}

## Verification Plan

${payload.verificationPlan.map((item) => `- \`${item}\``).join('\n')}

## Acceptance Checklist

${payload.acceptanceChecklist.map((item) => `- [ ] ${item}`).join('\n')}
`;
}

function buildUiRecipeScaffold(cwd, rootDir, options = {}) {
  const direction = buildUiDirection(cwd, rootDir, options);
  const spec = buildUiSpec(cwd, rootDir, options);
  const recipe = selectRecipe(direction, options.goal || '', options.recipe || '');
  const semanticPrototype = {
    language: 'html',
    code: buildSemanticHtml(recipe, direction),
  };
  const stackScaffold = {
    language: ['Next', 'Vite', 'Remix'].includes(spec.profile.framework.primary) ? 'tsx' : 'html',
    code: buildTsxScaffold(recipe, direction, spec),
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    file: '',
    runtimeFile: '',
    uiDirection: direction.file,
    uiSpec: spec.file,
    recipe,
    profile: spec.profile,
    prototypeMode: direction.prototypeMode,
    semanticPrototype,
    stackScaffold,
    targetFiles: buildTargetFiles(spec.profile, recipe),
    translationNotes: buildTranslationNotes(spec.profile, direction, spec, recipe),
    nativeFirst: relevantNativeRecommendations(direction, recipe),
    verificationPlan: buildVerificationPlan(recipe),
    acceptanceChecklist: [
      ...direction.acceptanceChecklist.slice(0, 4),
      'The selected recipe can be translated to the repo UI stack without losing the semantic contract.',
      'The scaffold covers the primary path plus the state variants this surface needs.',
    ],
  };

  const filePath = writeDoc(path.join(rootDir, 'UI-RECIPE.md'), 'UI RECIPE', renderRecipeMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'ui-recipe.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });

  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildUiRecipeScaffold(cwd, rootDir, {
    goal: args.goal ? String(args.goal).trim() : '',
    taste: args.taste ? String(args.taste).trim() : '',
    recipe: args.recipe ? String(args.recipe).trim() : '',
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# UI RECIPE\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Recipe: \`${payload.recipe.title}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildUiRecipeScaffold,
  main,
};
