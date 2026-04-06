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

function buildMissingStateAudit(cwd, inventory = collectComponentInventory(cwd)) {
  const files = [...new Set([
    ...inventory.map((item) => item.file),
    ...collectUiFiles(cwd),
  ])].slice(0, 80);
  const definitions = {
    loading: /\b(loading|spinner|skeleton|pending)\b/i,
    empty: /\b(empty state|no results|no items|nothing here|empty)\b/i,
    error: /\b(error|retry|failed|try again)\b/i,
    success: /\b(success|done|saved|completed)\b/i,
    disabled: /\b(disabled|aria-disabled|isDisabled)\b/i,
    interaction: /\b(hover|focus|active|focus-visible)\b/i,
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
  const files = [...new Set([
    ...inventory.map((item) => item.file),
    ...collectUiFiles(cwd),
  ])].slice(0, 80);
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

function buildDesignDebt(profile, inventory, browserArtifacts, audits = {}) {
  const debt = [];
  const missingStateAudit = audits.missingStateAudit || { missing: [] };
  const tokenDriftAudit = audits.tokenDriftAudit || { totalIssues: 0, issues: [] };
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
  return debt;
}

function buildScorecard(profile, inventory, debt, browserArtifacts) {
  const penalty = debt.reduce((sum, item) => sum + (item.severity === 'high' ? 1.2 : item.severity === 'medium' ? 0.7 : 0.3), 0);
  const browserPass = browserArtifacts.find((entry) => entry.meta?.visualVerdict === 'pass');
  const base = {
    visualConsistency: 4.2,
    interactionClarity: 4.0,
    responsiveCorrectness: 4.0,
    accessibility: 3.8,
    componentHygiene: inventory.filter((item) => item.shared).length >= 3 ? 4.2 : 3.6,
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
  buildMissingStateAudit,
  buildResponsiveMatrix,
  buildScorecard,
  buildFrontendProfile,
  buildTokenDriftAudit,
  collectUiFiles,
  collectComponentInventory,
  latestBrowserArtifacts,
  relativePath,
  writeDoc,
};
