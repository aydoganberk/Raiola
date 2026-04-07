const fs = require('node:fs');
const path = require('node:path');
const { listIndexedRepoFiles } = require('./fs_index');
const { buildFrontendProfile } = require('./map_frontend');
const { listLatestEntries, readJsonIfExists } = require('./runtime_helpers');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function writeDoc(filePath, title, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `# ${title}\n\n${String(body).trim()}\n`);
  return filePath;
}

function collectComponentInventory(cwd) {
  const repo = listIndexedRepoFiles(cwd, { refreshMode: 'incremental' });
  const files = repo.files.filter((filePath) => (
    /(^|\/)(components|ui|app\/components|src\/components)\//.test(filePath)
      || /[A-Z][A-Za-z0-9_-]+\.(tsx|jsx|ts|js)$/.test(path.basename(filePath))
  ));

  return files.slice(0, 60).map((filePath) => {
    const base = path.basename(filePath, path.extname(filePath));
    const kind = /\.(tsx|jsx)$/.test(filePath) ? 'component' : 'module';
    return {
      name: base,
      file: filePath,
      kind,
      shared: /(components|ui)\//.test(filePath),
      responsiveHint: /(grid|layout|container|hero|page)/i.test(base),
    };
  });
}

function collectUiFiles(cwd) {
  const repo = listIndexedRepoFiles(cwd, { refreshMode: 'incremental' });
  return repo.files.filter((filePath) => (
    /\.(tsx|jsx|ts|js|css|scss|sass)$/.test(filePath)
      && /(^|\/)(app|pages|components|src|ui)\//.test(filePath)
  )).slice(0, 80);
}

function readText(cwd, relativeFile) {
  try {
    return fs.readFileSync(path.join(cwd, relativeFile), 'utf8');
  } catch {
    return '';
  }
}

function collectAuditFiles(cwd, inventory = collectComponentInventory(cwd)) {
  return [...new Set([
    ...inventory.map((item) => item.file),
    ...collectUiFiles(cwd),
  ])].slice(0, 80);
}

function countMatches(content, pattern) {
  return [...String(content || '').matchAll(pattern)].length;
}

function buildSemanticAudit(cwd, inventory = collectComponentInventory(cwd)) {
  const files = collectAuditFiles(cwd, inventory);
  const issues = [];
  const seen = new Set();

  const pushIssue = (rule, file, detail, severity = 'medium') => {
    if (issues.length >= 24) {
      return;
    }
    const key = `${rule}:${file}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    issues.push({
      rule,
      file,
      detail,
      severity,
    });
  };

  for (const file of files) {
    const content = readText(cwd, file);
    if (!content) {
      continue;
    }

    if (/<table\b/i.test(content) && (!/<thead\b/i.test(content) || !/<tbody\b/i.test(content))) {
      pushIssue('table-structure', file, 'Table markup should include both <thead> and <tbody> so relational data stays understandable to users and assistive tech.', 'high');
    }

    const interactiveContainers = content.match(/<(div|span)([^>]*)onClick=\{[^}]+\}([^>]*)>/g) || [];
    if (interactiveContainers.some((tag) => !/\brole=/.test(tag) && !/\btabIndex=/.test(tag) && !/onKey(?:Down|Up|Press)=/.test(tag))) {
      pushIssue('non-semantic-click', file, 'A clickable div/span was detected without keyboard or role semantics; prefer a button/link or add the missing semantic contract.', 'high');
    }

    const isPageSurface = /(?:^|\/)(page|screen|view)\.(tsx|jsx|ts|js)$/.test(file);
    if (isPageSurface && !/<main\b/i.test(content) && !/role=["']main["']/i.test(content) && !/<Main\b/.test(content)) {
      pushIssue('missing-main-landmark', file, 'Page-level UI appears to be missing a main landmark, which weakens navigation and review clarity.', 'medium');
    }

    if (/<(?:input|select|textarea)\b/i.test(content) && !/<label\b/i.test(content) && !/aria-label=|aria-labelledby=/i.test(content)) {
      pushIssue('form-labeling', file, 'Form controls were detected without obvious label semantics. Confirm labels or accessible names exist before shipping.', 'medium');
    }

    if (/<form\b/i.test(content) && /<button\b(?![^>]*\btype=)/i.test(content)) {
      pushIssue('button-type', file, 'A button inside a form is missing an explicit type attribute; default submit behavior can create accidental actions.', 'low');
    }

    const divCount = countMatches(content, /<div\b/gi);
    const semanticCount = countMatches(content, /<(main|section|article|nav|header|footer|aside|form|table|button|label|ul|ol|li)\b/gi);
    if (divCount >= 10 && semanticCount <= 2) {
      pushIssue('wrapper-heavy', file, 'The component appears wrapper-heavy relative to its semantic landmarks; consider simplifying structure before polish work compounds it.', 'low');
    }
  }

  const counts = issues.reduce((accumulator, issue) => {
    accumulator[issue.rule] = (accumulator[issue.rule] || 0) + 1;
    return accumulator;
  }, {});
  const verdict = issues.some((issue) => issue.severity === 'high')
    ? 'fail'
    : issues.length > 0
      ? 'warn'
      : 'pass';

  return {
    filesScanned: files.length,
    verdict,
    issueCount: issues.length,
    counts,
    issues,
    guidance: verdict === 'pass'
      ? 'Core semantic structure looks healthy in the scanned UI files.'
      : verdict === 'warn'
        ? 'Tighten semantic structure before the UI patterns spread further across the surface.'
        : 'Fix the high-severity semantic issues before trusting polish or accessibility claims.',
  };
}

function primitiveTranslation(profile, primitive) {
  const uiSystem = String(profile?.uiSystem?.primary || '').toLowerCase();
  const variants = {
    dialog: {
      shadcn: 'Translate the final surface to the repo Dialog primitive, but keep the open/close/focus contract as if it were a native <dialog>.',
      mui: 'Translate to MUI Dialog while preserving native-like close, focus, and return-state semantics.',
      chakra: 'Translate to Chakra Dialog/Modal only after the semantic close/focus rules are explicit.',
      custom: 'Start with a native <dialog> or a very thin wrapper before introducing custom portal choreography.',
    },
    disclosure: {
      shadcn: 'Use Accordion/Collapsible only after the details/summary interaction contract is clear.',
      mui: 'Translate to Accordion once summary/content semantics are explicit.',
      chakra: 'Use Accordion/Collapse after the disclosure semantics and keyboard path are settled.',
      custom: 'Prefer <details>/<summary> for first-pass prototypes, then wrap only if the repo truly needs a custom primitive.',
    },
    menu: {
      shadcn: 'Map this to DropdownMenu/Popover primitives, but keep trigger, focus, and dismissal behavior native-first.',
      mui: 'Translate to Menu/Popover while preserving clear trigger + target semantics.',
      chakra: 'Translate to Menu/Popover after the action grouping and dismissal rules are explicit.',
      custom: 'Start from button + popover/menu semantics instead of bespoke action trays.',
    },
    'data-table': {
      shadcn: 'Keep shared table wrappers if they exist, but preserve real table semantics and row/header structure underneath.',
      mui: 'Translate to MUI Table/DataGrid only after the data relationship model is written against table semantics.',
      chakra: 'Translate to Chakra Table once header/body semantics are fixed.',
      custom: 'Prefer real <table>/<thead>/<tbody> semantics before composing custom grid chrome.',
    },
    feedback: {
      shadcn: 'Use Toast/Alert primitives as the rendering layer, but keep output/aria-live semantics explicit.',
      mui: 'Translate to Snackbar/Alert once the status message contract is explicit.',
      chakra: 'Translate to Toast/Alert after the status and recovery language are stable.',
      custom: 'Prefer output/aria-live plus a shared toast helper over one-off success banners.',
    },
    states: {
      shadcn: 'Keep shared skeleton/empty/error wrappers and make the state contract reusable across the stack.',
      mui: 'Translate the state contract into MUI Skeleton/Alert/Empty placeholders consistently.',
      chakra: 'Translate the state contract into Chakra Skeleton/Alert primitives consistently.',
      custom: 'Standardize loading/empty/error/success patterns before polishing page-local variants.',
    },
  };
  const family = uiSystem.includes('shadcn') || uiSystem.includes('radix')
    ? 'shadcn'
    : uiSystem.includes('mui')
      ? 'mui'
      : uiSystem.includes('chakra')
        ? 'chakra'
        : 'custom';
  return variants[primitive]?.[family] || variants[primitive]?.custom || 'Preserve the semantic contract first, then translate it into the active UI stack.';
}

function buildPrimitiveOpportunityAudit(cwd, profile, inventory = collectComponentInventory(cwd)) {
  const files = collectAuditFiles(cwd, inventory);
  const evidence = {
    dialog: [],
    disclosure: [],
    menu: [],
    'data-table': [],
    feedback: [],
    states: [],
  };

  for (const file of files) {
    const content = readText(cwd, file);
    const haystack = `${file}\n${content}`;
    if (/\b(modal|dialog|drawer|sheet|confirm)\b/i.test(haystack)) {
      evidence.dialog.push(file);
    }
    if (/\b(accordion|collapse|collapsible|details|summary|faq|expand)\b/i.test(haystack)) {
      evidence.disclosure.push(file);
    }
    if (/\b(dropdown|popover|menu|context menu|more actions|actions menu)\b/i.test(haystack)) {
      evidence.menu.push(file);
    }
    if (/\b(table|datatable|data table|grid|row|column)\b/i.test(haystack) || /<table\b/i.test(content)) {
      evidence['data-table'].push(file);
    }
    if (/\b(toast|snackbar|alert|status|aria-live|output|success message|error message)\b/i.test(haystack)) {
      evidence.feedback.push(file);
    }
    if (/\b(loading|spinner|skeleton|empty state|no results|nothing here|try again|retry|saved|completed)\b/i.test(haystack)) {
      evidence.states.push(file);
    }
  }

  const opportunities = [];
  const pushOpportunity = (id, title, primitive, useWhen, recommendation, priority = 'medium') => {
    const hits = [...new Set(evidence[id] || [])].slice(0, 6);
    if (hits.length === 0) {
      return;
    }
    opportunities.push({
      id,
      title,
      primitive,
      priority,
      useWhen,
      evidence: hits,
      recommendation,
      stackTranslation: primitiveTranslation(profile, id),
    });
  };

  pushOpportunity(
    'dialog',
    'Normalize modal and confirm flows',
    'dialog',
    'Use when the surface opens confirmation, edit, or drill-in overlays.',
    'Unify overlays around one dialog contract so focus handling, dismissal, and return states stop fragmenting across pages.',
    evidence.dialog.length >= 2 ? 'high' : 'medium',
  );
  pushOpportunity(
    'disclosure',
    'Standardize disclosure sections',
    'details/summary',
    'Use when sections expand inline for advanced settings, FAQs, or secondary metadata.',
    'Prefer one shared disclosure pattern instead of ad hoc expandable cards and manual chevron logic.',
    'medium',
  );
  pushOpportunity(
    'menu',
    'Consolidate action menus and popovers',
    'button + popover/menu',
    'Use when secondary actions or filter menus appear in repeated lists and cards.',
    'Treat contextual actions as a shared primitive so trigger, focus, and dismissal rules stay predictable.',
    evidence.menu.length >= 2 ? 'high' : 'medium',
  );
  pushOpportunity(
    'data-table',
    'Clarify relational data surfaces',
    'table',
    'Use when users compare rows, scan columns, or sort/filter operational data.',
    'Model relational data with real table semantics first, then apply visual wrappers or advanced behaviors second.',
    evidence['data-table'].length >= 2 ? 'high' : 'medium',
  );
  pushOpportunity(
    'feedback',
    'Unify status and toast feedback',
    'output + aria-live',
    'Use when save/delete/retry flows need transient or inline status messaging.',
    'Shared status feedback keeps success, warning, and recovery copy consistent across the product.',
    'medium',
  );
  pushOpportunity(
    'states',
    'Create one async-state recipe family',
    'loading / empty / error / success cluster',
    'Use when screens fetch data, save forms, or show conditional result sets.',
    'A reusable state family prevents each screen from inventing its own loading, empty, and recovery behavior.',
    evidence.states.length >= 2 ? 'high' : 'medium',
  );

  return {
    filesScanned: files.length,
    opportunityCount: opportunities.length,
    opportunities,
  };
}

function buildPrimitiveContractAudit(cwd, profile, inventory = collectComponentInventory(cwd)) {
  const files = collectAuditFiles(cwd, inventory);
  const issues = [];

  const pushIssue = (primitive, file, detail, severity = 'medium') => {
    if (issues.length >= 20 || issues.some((item) => item.primitive === primitive && item.file === file)) {
      return;
    }
    issues.push({
      primitive,
      file,
      detail,
      severity,
    });
  };

  for (const file of files) {
    const content = readText(cwd, file);
    if (!content) {
      continue;
    }
    const haystack = `${file}\n${content}`;

    if (/\b(modal|dialog|drawer|sheet|confirm)\b/i.test(haystack)
      && !/<dialog\b/i.test(content)
      && !/role=["']dialog["']/i.test(content)
      && !/\b(Dialog|Drawer|Sheet)\b/.test(content)) {
      pushIssue('dialog', file, 'Overlay-like UI was detected without an obvious dialog/drawer primitive contract.', 'medium');
    }

    if (/\b(dropdown|menu|popover|actions menu|context menu)\b/i.test(haystack)
      && !/<menu\b/i.test(content)
      && !/\bpopover\b/i.test(content)
      && !/role=["']menuitem["']/i.test(content)
      && !/\b(DropdownMenu|Popover|MenuItem)\b/.test(content)) {
      pushIssue('menu', file, 'Contextual actions appear without an obvious menu/popover primitive contract.', 'medium');
    }

    if (/\b(table|datatable|data table|grid)\b/i.test(haystack)
      && !/<table\b/i.test(content)
      && !/\b(DataGrid|Table)\b/.test(content)) {
      pushIssue('table', file, 'Relational data UI was detected without a table/data-grid primitive, which may weaken scan and a11y semantics.', 'medium');
    }

    if (/\b(accordion|collapse|collapsible|expand|disclosure)\b/i.test(haystack)
      && !/<details\b/i.test(content)
      && !/\b(Accordion|Collapsible)\b/.test(content)) {
      pushIssue('disclosure', file, 'Expandable UI appears without an obvious disclosure primitive contract.', 'low');
    }

    if (/\b(toast|snackbar|alert|status message|success message|error message)\b/i.test(haystack)
      && !/aria-live=|role=["']status["']/i.test(content)
      && !/<output\b/i.test(content)
      && !/\b(Alert|Toast)\b/.test(content)) {
      pushIssue('feedback', file, 'Status feedback appears without an obvious output/aria-live/status primitive.', 'low');
    }

    if (/\b(progress|meter|upload progress|completion)\b/i.test(haystack)
      && !/<progress\b/i.test(content)
      && !/<meter\b/i.test(content)
      && !/\b(Progress|Meter)\b/.test(content)) {
      pushIssue('progress', file, 'Progress-like UI appears without a progress/meter primitive contract.', 'low');
    }
  }

  const counts = issues.reduce((accumulator, issue) => {
    accumulator[issue.primitive] = (accumulator[issue.primitive] || 0) + 1;
    return accumulator;
  }, {});
  const verdict = issues.some((issue) => issue.severity === 'medium' || issue.severity === 'high')
    ? 'warn'
    : issues.length > 0
      ? 'note'
      : 'pass';

  return {
    filesScanned: files.length,
    verdict,
    issueCount: issues.length,
    counts,
    issues,
    guidance: verdict === 'pass'
      ? 'Primitive contracts look explicit in the scanned UI files.'
      : 'Review repeated UI patterns and align them to explicit dialog/menu/table/disclosure/feedback primitives before they spread.',
  };
}

function buildMissingStateAudit(cwd, inventory = collectComponentInventory(cwd)) {
  const files = collectAuditFiles(cwd, inventory);
  const definitions = {
    loading: /\b(loading|spinner|skeleton|pending)\b/i,
    empty: /\b(empty state|no results|no items|nothing here|empty)\b/i,
    error: /\b(error|retry|failed|try again)\b/i,
    success: /\b(success|done|saved|completed)\b/i,
    disabled: /\b(disabled|aria-disabled|isDisabled)\b/i,
    interaction: /\b(hover|focus|active|focus-visible)\b/i,
    'form-validation': /\b(validation|invalid|required field|field error|helper text|aria-invalid)\b/i,
    'mobile-nav': /\b(hamburger|mobile nav|mobile menu|drawer navigation|menu open)\b/i,
  };
  const evidence = Object.fromEntries(Object.keys(definitions).map((key) => [key, []]));

  for (const file of files) {
    const content = readText(cwd, file);
    for (const [state, pattern] of Object.entries(definitions)) {
      if (pattern.test(content)) {
        evidence[state].push(file);
      }
    }
  }

  const missing = Object.entries(evidence)
    .filter(([, hits]) => hits.length === 0)
    .map(([state]) => state);

  return {
    filesScanned: files.length,
    evidence: Object.fromEntries(Object.entries(evidence).map(([state, hits]) => [state, hits.slice(0, 5)])),
    missing,
  };
}

function buildTokenDriftAudit(cwd, inventory = collectComponentInventory(cwd)) {
  const files = collectAuditFiles(cwd, inventory);
  const issues = [];

  for (const file of files) {
    const content = readText(cwd, file);
    const pushIssue = (kind, detail, severity = 'medium') => {
      if (issues.length >= 20) {
        return;
      }
      issues.push({
        kind,
        file,
        detail,
        severity,
      });
    };

    if (/style=\{\{/.test(content)) {
      pushIssue('inline-style', 'Inline style objects can bypass the shared token layer.', 'high');
    }
    if (/#[0-9a-fA-F]{3,8}\b/.test(content) || /\brgba?\(/.test(content)) {
      pushIssue('hardcoded-color', 'Hard-coded color values were detected instead of shared tokens.', 'medium');
    }
    if (/\b\d+px\b/.test(content)) {
      pushIssue('raw-px', 'Raw pixel values were detected; verify spacing and radius stay token-driven.', 'medium');
    }
    if (/\[[^\]]+\]/.test(content) && /class(Name)?=/.test(content)) {
      pushIssue('arbitrary-tailwind', 'Arbitrary utility values were detected; review whether a shared token should exist.', 'low');
    }
  }

  const counts = issues.reduce((accumulator, issue) => {
    accumulator[issue.kind] = (accumulator[issue.kind] || 0) + 1;
    return accumulator;
  }, {});

  return {
    filesScanned: files.length,
    totalIssues: issues.length,
    counts,
    issues,
  };
}

function buildResponsiveMatrix(profile, inventory) {
  const breakpoints = profile.styling.detected.includes('Tailwind')
    ? [
      { viewport: 'mobile', width: '375px', expectation: 'Content stacks cleanly and preserves primary actions.' },
      { viewport: 'tablet', width: '768px', expectation: 'Navigation and secondary actions remain discoverable.' },
      { viewport: 'desktop', width: '1280px', expectation: 'Layout uses whitespace and hierarchy without sparse gaps.' },
    ]
    : [
      { viewport: 'small', width: '360px', expectation: 'No overflow, clipped text, or unreachable controls.' },
      { viewport: 'medium', width: '768px', expectation: 'Adaptive layout still matches the intended information architecture.' },
      { viewport: 'large', width: '1440px', expectation: 'Components align consistently and avoid over-stretching.' },
    ];

  return breakpoints.map((entry) => ({
    ...entry,
    components: inventory.filter((item) => item.responsiveHint).slice(0, 4).map((item) => item.name),
    evidence: 'screenshot pair or browser verify trace',
  }));
}

function latestBrowserArtifacts(cwd) {
  const entries = listLatestEntries(path.join(cwd, '.workflow', 'verifications', 'browser'), 6);
  return entries.map((entry) => ({
    id: entry.name,
    path: relativePath(cwd, entry.fullPath),
    meta: readJsonIfExists(path.join(entry.fullPath, 'meta.json')),
  }));
}

function buildAccessibilityAudit(profile, browserArtifacts = []) {
  const issues = browserArtifacts.flatMap((entry) => (
    entry.meta?.accessibility?.issues || []
  )).slice(0, 20);
  const failingArtifacts = browserArtifacts.filter((entry) => (
    entry.meta?.accessibility?.verdict === 'fail'
  )).length;
  const warningArtifacts = browserArtifacts.filter((entry) => (
    entry.meta?.accessibility?.verdict === 'warn'
  )).length;
  const verdict = failingArtifacts > 0
    ? 'fail'
    : warningArtifacts > 0
      ? 'warn'
      : browserArtifacts.length > 0
        ? 'pass'
        : 'inconclusive';
  return {
    verdict,
    artifactCount: browserArtifacts.length,
    failingArtifacts,
    warningArtifacts,
    issueCount: issues.length,
    issues,
    guidance: verdict === 'inconclusive'
      ? 'Capture browser evidence to validate landmarks, labels, and accessible names.'
      : verdict === 'pass'
        ? 'No browser-level accessibility issues were detected in the latest evidence.'
        : 'Address the browser-level accessibility issues before ship.',
    framework: profile.framework.primary,
  };
}

function buildJourneyAudit(profile, browserArtifacts = [], inventory = []) {
  const signalCounts = {
    nav: 0,
    main: 0,
    heading: 0,
    primaryAction: 0,
    form: 0,
    feedback: 0,
  };
  for (const artifact of browserArtifacts) {
    const signals = artifact.meta?.journey?.signals || {};
    for (const key of Object.keys(signalCounts)) {
      if (signals[key]) {
        signalCounts[key] += 1;
      }
    }
  }
  const missing = Object.entries(signalCounts)
    .filter(([, count]) => count === 0)
    .map(([key]) => key)
    .filter((key) => !(key === 'form' && !inventory.some((item) => /Form|Field|Input/i.test(item.name))));
  const coverage = browserArtifacts.length === 0
    ? 'inconclusive'
    : missing.length === 0
      ? 'pass'
      : missing.length <= 2
        ? 'warn'
        : 'incomplete';
  return {
    coverage,
    artifactCount: browserArtifacts.length,
    missing,
    signalCounts,
    expectedSurface: profile.framework.primary,
    guidance: coverage === 'pass'
      ? 'Core user-journey signals are represented in the latest preview evidence.'
      : coverage === 'inconclusive'
        ? 'Capture preview evidence to validate headings, landmarks, and primary actions.'
        : `Review journey coverage for: ${missing.join(', ')}.`,
  };
}

function buildDesignDebt(profile, inventory, browserArtifacts, audits = {}) {
  const debt = [];
  const missingStateAudit = audits.missingStateAudit || { missing: [] };
  const tokenDriftAudit = audits.tokenDriftAudit || { totalIssues: 0, issues: [] };
  const accessibilityAudit = audits.accessibilityAudit || { verdict: 'inconclusive', issueCount: 0 };
  const journeyAudit = audits.journeyAudit || { coverage: 'inconclusive', missing: [] };
  const semanticAudit = audits.semanticAudit || { verdict: 'pass', issueCount: 0 };
  const primitiveContractAudit = audits.primitiveContractAudit || { verdict: 'pass', issueCount: 0 };
  const primitiveOpportunities = audits.primitiveOpportunities || [];
  if (!profile.stack.presence.storybook) {
    debt.push({
      area: 'component preview',
      severity: 'medium',
      detail: 'Storybook surface is missing, so component-level visual regression review depends on ad hoc previews.',
    });
  }
  if (!profile.stack.presence.playwright) {
    debt.push({
      area: 'browser automation',
      severity: 'medium',
      detail: 'Playwright is not detected, so visual verification stays smoke-level by default.',
    });
  }
  if (!profile.uiSystem.detected.includes('shadcn') && inventory.filter((item) => item.shared).length < 3) {
    debt.push({
      area: 'component reuse',
      severity: 'medium',
      detail: 'Shared component inventory is thin; UI work may fragment into page-local primitives.',
    });
  }
  if (browserArtifacts.length === 0) {
    debt.push({
      area: 'evidence',
      severity: 'high',
      detail: 'No browser artifacts are available, so before/after visual evidence is missing.',
    });
  }
  if (!profile.figma.present) {
    debt.push({
      area: 'design contract',
      severity: 'low',
      detail: 'No Figma or external design reference was linked into the workflow surface.',
    });
  }
  if (missingStateAudit.missing.length > 0) {
    debt.push({
      area: 'missing states',
      severity: missingStateAudit.missing.some((state) => ['loading', 'error', 'success'].includes(state)) ? 'high' : 'medium',
      detail: `State coverage is incomplete for: ${missingStateAudit.missing.join(', ')}.`,
    });
  }
  if (tokenDriftAudit.totalIssues > 0) {
    debt.push({
      area: 'token drift',
      severity: tokenDriftAudit.issues.some((issue) => issue.severity === 'high') ? 'high' : 'medium',
      detail: `${tokenDriftAudit.totalIssues} token drift signal(s) were detected across UI files.`,
    });
  }
  if (accessibilityAudit.verdict !== 'pass') {
    debt.push({
      area: 'a11y',
      severity: accessibilityAudit.verdict === 'fail' ? 'high' : 'medium',
      detail: accessibilityAudit.issueCount > 0
        ? `${accessibilityAudit.issueCount} accessibility issue(s) were detected in browser evidence.`
        : 'No browser evidence is available to validate accessibility expectations.',
    });
  }
  if (journeyAudit.coverage !== 'pass') {
    debt.push({
      area: 'journey coverage',
      severity: journeyAudit.coverage === 'incomplete' ? 'high' : 'medium',
      detail: journeyAudit.missing?.length > 0
        ? `Journey evidence is missing for: ${journeyAudit.missing.join(', ')}.`
        : 'User-journey evidence is still incomplete.',
    });
  }
  if (semanticAudit.verdict !== 'pass') {
    debt.push({
      area: 'semantic structure',
      severity: semanticAudit.verdict === 'fail' ? 'high' : 'medium',
      detail: `${semanticAudit.issueCount} semantic structure issue(s) were detected across the scanned UI files.`,
    });
  }
  if (primitiveOpportunities.length > 0) {
    debt.push({
      area: 'primitive normalization',
      severity: primitiveOpportunities.length >= 3 ? 'medium' : 'low',
      detail: `${primitiveOpportunities.length} shared primitive opportunity/opportunities were detected; repeated UI patterns may still be page-local.`,
    });
  }
  if (primitiveContractAudit.issueCount > 0) {
    debt.push({
      area: 'primitive contracts',
      severity: primitiveContractAudit.issues.some((issue) => issue.severity === 'medium' || issue.severity === 'high') ? 'medium' : 'low',
      detail: `${primitiveContractAudit.issueCount} primitive contract gap(s) were detected across repeated UI patterns.`,
    });
  }
  return debt;
}

function buildScorecard(profile, inventory, debt, browserArtifacts, audits = {}) {
  const accessibilityAudit = audits.accessibilityAudit || { verdict: 'inconclusive', issueCount: 0 };
  const journeyAudit = audits.journeyAudit || { coverage: 'inconclusive', missing: [] };
  const semanticAudit = audits.semanticAudit || { verdict: 'pass', issueCount: 0 };
  const penalty = debt.reduce((sum, item) => sum + (item.severity === 'high' ? 1.2 : item.severity === 'medium' ? 0.7 : 0.3), 0);
  const browserPass = browserArtifacts.find((entry) => entry.meta?.visualVerdict === 'pass');
  const base = {
    visualConsistency: 4.2,
    interactionClarity: semanticAudit.verdict === 'fail'
      ? 3.2
      : journeyAudit.coverage === 'pass'
        ? 4.3
        : journeyAudit.coverage === 'warn'
          ? 3.9
          : 3.4,
    responsiveCorrectness: 4.0,
    accessibility: accessibilityAudit.verdict === 'pass' ? 4.2 : accessibilityAudit.verdict === 'warn' ? 3.5 : accessibilityAudit.verdict === 'fail' ? 2.8 : 3.2,
    componentHygiene: semanticAudit.issueCount > 0
      ? (inventory.filter((item) => item.shared).length >= 3 ? 3.7 : 3.2)
      : inventory.filter((item) => item.shared).length >= 3
        ? 4.2
        : 3.6,
    copyConsistency: 4.0,
  };
  const adjusted = Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    Math.max(1, Math.min(5, Number((value - (penalty * 0.2) + (browserPass ? 0.3 : 0)).toFixed(1)))),
  ]));
  adjusted.overall = Number((Object.values(adjusted).reduce((sum, value) => sum + value, 0) / Object.keys(adjusted).length).toFixed(1));
  return adjusted;
}

module.exports = {
  buildDesignDebt,
  buildAccessibilityAudit,
  buildJourneyAudit,
  buildMissingStateAudit,
  buildPrimitiveContractAudit,
  buildPrimitiveOpportunityAudit,
  buildResponsiveMatrix,
  buildScorecard,
  buildSemanticAudit,
  buildFrontendProfile,
  buildTokenDriftAudit,
  collectUiFiles,
  collectComponentInventory,
  latestBrowserArtifacts,
  relativePath,
  writeDoc,
};
