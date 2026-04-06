const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs, resolveWorkflowRoot, listGitChanges } = require('./common');
const { buildBaseState } = require('./state_surface');
const { listLatestEntries, readJsonIfExists, runtimePath } = require('./runtime_helpers');

function printHelp() {
  console.log(`
dashboard

Usage:
  node scripts/workflow/dashboard.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --open              Open the generated local dashboard in the default browser
  --json              Print machine-readable output
  `);
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function dashboardDir(cwd) {
  return runtimePath(cwd, 'dashboard');
}

function dashboardHtmlPath(cwd) {
  return path.join(dashboardDir(cwd), 'index.html');
}

function dashboardStatePath(cwd) {
  return path.join(dashboardDir(cwd), 'state.json');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readLatestArtifactMeta(cwd, kind, limit = 6) {
  const baseDir = path.join(cwd, '.workflow', 'verifications', kind);
  return listLatestEntries(baseDir, limit).map((entry) => {
    const meta = readJsonIfExists(path.join(entry.fullPath, 'meta.json')) || {};
    return {
      id: entry.name,
      path: relativePath(cwd, entry.fullPath),
      meta,
    };
  });
}

function compactList(items, limit = 8) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function buildQuickActions(payload) {
  const actions = [];
  const pushAction = (group, label, command, reason, tone = 'neutral') => {
    if (!command || actions.some((item) => item.command === command)) {
      return;
    }
    actions.push({ group, label, command, reason, tone });
  };

  for (const command of payload.route?.verificationPlan || []) {
    pushAction('route', 'Run planned verification', command, 'Chosen route asked for this verification.', 'neutral');
  }
  if (payload.route?.routeEvaluation?.rerouteRecommendation?.command) {
    pushAction('route', 'Re-route if needed', payload.route.routeEvaluation.rerouteRecommendation.command, payload.route.routeEvaluation.rerouteRecommendation.reason, 'warn');
  }
  for (const command of payload.shipReadiness?.nextActions || []) {
    pushAction('ship', 'Clear ship gate', command, 'Ship-readiness flagged this as a next safe action.', 'risk');
  }
  for (const item of payload.verifyWork?.fixPlan || []) {
    const command = item.lane === 'browser'
      ? 'cwf ui-review'
      : item.lane === 'review'
        ? 'cwf review --blockers'
        : item.lane === 'claims'
          ? 'cwf claims check'
          : item.lane === 'requirements'
            ? 'cwf packet explain --step plan'
            : item.lane === 'shell'
              ? 'cwf verify-shell --cmd "npm test"'
              : 'cwf verify-work';
    pushAction('trust', item.action, command, item.evidence || 'Verify-work generated this fix-plan item.', item.priority === 'high' ? 'risk' : 'warn');
  }
  if (payload.frontendReview?.accessibilityAudit?.verdict && payload.frontendReview.accessibilityAudit.verdict !== 'pass') {
    pushAction('frontend', 'Address accessibility audit', 'cwf ui-review', payload.frontendReview.accessibilityAudit.guidance, 'risk');
  }
  if (payload.frontendReview?.journeyAudit?.coverage && payload.frontendReview.journeyAudit.coverage !== 'pass') {
    pushAction('frontend', 'Tighten journey coverage', 'cwf verify-browser --smoke', payload.frontendReview.journeyAudit.guidance, 'warn');
  }
  if (payload.packetContext?.packet?.budgetStatus && payload.packetContext.packet.budgetStatus !== 'ok') {
    pushAction('context', 'Rebuild packet budget', `cwf packet explain --step ${payload.packetContext.packet.step || 'plan'}`, 'Packet budget is no longer in the safe zone.', 'warn');
  }
  if ((payload.review?.traceability?.unlinkedCount || 0) > 0) {
    pushAction('review', 'Close traceability gaps', 'cwf validation-map', 'Changed scope is not fully linked to the validation contract.', 'warn');
  }
  if ((payload.review?.packageGraph?.impactedTests || []).length > 0) {
    pushAction('scale', 'Exercise impacted tests', 'cwf verify-shell --cmd "npm test"', 'Package graph identified impacted test ownership.', 'neutral');
  }
  return actions.slice(0, 12);
}

function readDashboardData(cwd, rootDir) {
  const routeCache = readJsonIfExists(path.join(cwd, '.workflow', 'cache', 'model-routing.json')) || {};
  const latestDo = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'do-latest.json'));
  const reviewFindings = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-findings.json')) || [];
  const reviewHeatmap = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'risk-heatmap.json')) || [];
  const reviewPackageHeatmap = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-package-heatmap.json')) || [];
  const reviewPackageGraph = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-package-graph.json')) || null;
  const reviewPersonas = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-personas.json')) || [];
  const reviewFollowUps = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-follow-ups.json')) || [];
  const reviewTraceability = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-traceability.json')) || null;
  const reviewConcerns = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-concerns.json')) || [];
  const shipReadiness = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'ship-readiness.json'));
  const verifyWork = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'verify-work.json'));
  const benchmark = readJsonIfExists(path.join(cwd, '.workflow', 'benchmarks', 'latest.json'));
  const packetLatest = readJsonIfExists(path.join(cwd, '.workflow', 'packets', 'latest.json'));
  const packetContext = readJsonIfExists(path.join(cwd, '.workflow', 'packets', 'latest-context.json'));
  const frontendReview = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'frontend-review.json'));
  const frontendSpec = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'frontend-spec.json'));
  const state = buildBaseState(cwd, rootDir);
  const browserArtifacts = readLatestArtifactMeta(cwd, 'browser', 6);
  const shellArtifacts = readLatestArtifactMeta(cwd, 'shell', 4);
  const route = routeCache.lastRecommendation || latestDo || null;
  const changedFiles = (() => {
    try {
      return listGitChanges(cwd);
    } catch {
      return [];
    }
  })();

  return {
    generatedAt: new Date().toISOString(),
    state,
    route,
    review: {
      findings: reviewFindings,
      heatmap: reviewHeatmap,
      packageHeatmap: reviewPackageHeatmap,
      packageGraph: reviewPackageGraph,
      personas: reviewPersonas,
      followUps: reviewFollowUps,
      traceability: reviewTraceability,
      concerns: reviewConcerns,
    },
    verifyWork,
    shipReadiness,
    benchmark,
    packetLatest,
    packetContext,
    frontendReview,
    frontendSpec,
    browserArtifacts,
    shellArtifacts,
    changedFiles,
  };
}

function renderMetric(label, value, tone = 'neutral') {
  return `<div class="metric metric-${tone}">
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong class="metric-value">${escapeHtml(value)}</strong>
  </div>`;
}

function renderList(items, renderItem, emptyMessage) {
  if (!items.length) {
    return `<li class="empty">${escapeHtml(emptyMessage)}</li>`;
  }
  return items.map(renderItem).join('');
}

function renderScreenshotCard(cwd, entry) {
  const screenshot = entry.meta?.artifacts?.screenshot
    ? relativePath(dashboardDir(cwd), path.join(cwd, entry.meta.artifacts.screenshot))
    : null;
  return `<article class="gallery-card">
    <div class="gallery-meta">
      <span class="pill">${escapeHtml(entry.meta?.visualVerdict || entry.meta?.verdict || 'unknown')}</span>
      <span class="gallery-url">${escapeHtml(entry.meta?.url || entry.path)}</span>
    </div>
    ${screenshot ? `<img src="${escapeHtml(screenshot)}" alt="${escapeHtml(entry.meta?.summary || entry.path)}" loading="lazy" />` : '<div class="gallery-fallback">No screenshot</div>'}
    <p>${escapeHtml(entry.meta?.summary || 'No summary')}</p>
  </article>`;
}

function renderActionCard(action) {
  return `<button type="button" class="action-card action-${escapeHtml(action.tone)}" data-action-card data-search="${escapeHtml([action.group, action.label, action.command, action.reason].join(' '))}" data-command="${escapeHtml(action.command)}">
    <span class="action-group">${escapeHtml(action.group)}</span>
    <strong>${escapeHtml(action.label)}</strong>
    <span class="action-command mono">${escapeHtml(action.command)}</span>
    <small>${escapeHtml(action.reason)}</small>
  </button>`;
}

function renderDashboardHtml(cwd, payload) {
  const route = payload.route || {};
  const routeProfile = route.suggestedCodexProfile || route.profile || {};
  const packetContext = payload.packetContext || {};
  const frontendReview = payload.frontendReview || {};
  const quickActions = buildQuickActions(payload);
  const summaryMetrics = [
    renderMetric('milestone', payload.state.workflow.milestone, 'neutral'),
    renderMetric('step', payload.state.workflow.step, 'neutral'),
    renderMetric('route', route.recommendedCapability || route.capability || 'n/a', 'neutral'),
    renderMetric('confidence', route.confidence != null ? String(route.confidence) : 'n/a', route.confidence >= 0.8 ? 'good' : route.confidence >= 0.6 ? 'warn' : 'risk'),
    renderMetric('cost', routeProfile.costBudget || 'n/a', 'neutral'),
    renderMetric('risk', routeProfile.riskBudget || payload.shipReadiness?.verdict || 'n/a', payload.shipReadiness?.verdict === 'blocked' ? 'risk' : 'warn'),
    renderMetric('review findings', String(payload.review.findings.length), payload.review.findings.length === 0 ? 'good' : 'warn'),
    renderMetric('changed files', String(payload.changedFiles.length), payload.changedFiles.length <= 3 ? 'good' : 'warn'),
    renderMetric('quick actions', String(quickActions.length), quickActions.length >= 1 ? 'good' : 'warn'),
  ].join('');

  const benchmarkRows = (payload.benchmark?.results || []).slice(0, 6).map((result) => (
    `<li><span>${escapeHtml(result.command)}</span><strong>${escapeHtml(`${result.warmMedianMs}ms`)}</strong></li>`
  )).join('');

  const verificationPlan = (route.verificationPlan || [])
    .concat(payload.shipReadiness?.nextActions || [])
    .slice(0, 8);
  const whyReasons = route.why?.chosenReasons || route.routeRationale || [];
  const rejectedAlternatives = route.why?.rejectedAlternatives || route.rejectedAlternatives || [];
  const packetSummary = packetContext.packet || payload.packetLatest || {};
  const frontendScorecard = frontendReview.scorecard || {};
  const accessibilityAudit = frontendReview.accessibilityAudit || frontendReview.accessibility || {};
  const journeyAudit = frontendReview.journeyAudit || frontendReview.journey || {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Workflow Dashboard</title>
  <style>
    :root {
      --bg: #f7f1e3;
      --bg-strong: #efe4ca;
      --panel: rgba(255, 251, 241, 0.88);
      --panel-strong: rgba(255, 247, 232, 0.96);
      --line: rgba(63, 46, 28, 0.16);
      --text: #2e2318;
      --muted: #705841;
      --accent: #b3541e;
      --accent-soft: #ffd8b8;
      --good: #1f7a4d;
      --warn: #9d6800;
      --risk: #b3261e;
      --shadow: 0 18px 48px rgba(73, 49, 21, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(255, 216, 184, 0.7), transparent 38%),
        radial-gradient(circle at top right, rgba(179, 84, 30, 0.14), transparent 24%),
        linear-gradient(180deg, var(--bg) 0%, #fbf7ee 100%);
      color: var(--text);
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
      padding: 32px;
    }
    .shell {
      max-width: 1440px;
      margin: 0 auto;
      display: grid;
      gap: 22px;
    }
    .hero {
      display: grid;
      gap: 16px;
      grid-template-columns: 1.5fr 1fr;
      background: linear-gradient(135deg, rgba(255, 247, 232, 0.98), rgba(239, 228, 202, 0.92));
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      padding: 26px;
    }
    .hero h1, .panel h2 {
      margin: 0;
      font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .hero h1 {
      font-size: clamp(2rem, 4vw, 3.4rem);
      line-height: 0.95;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 68ch;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: var(--panel);
      border: 1px solid var(--line);
      color: var(--text);
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 12px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 14px;
      min-height: 88px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .metric-good { border-color: rgba(31, 122, 77, 0.28); }
    .metric-warn { border-color: rgba(157, 104, 0, 0.28); }
    .metric-risk { border-color: rgba(179, 38, 30, 0.28); }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    }
    .metric-value {
      font-size: 1.25rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 18px;
    }
    .panel {
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 20px;
      min-height: 180px;
    }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    ul {
      list-style: none;
      padding: 0;
      margin: 14px 0 0;
      display: grid;
      gap: 10px;
    }
    li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 1px dashed rgba(63, 46, 28, 0.14);
      font-size: 0.96rem;
    }
    li.empty {
      display: block;
      color: var(--muted);
      border-bottom: 0;
      padding-bottom: 0;
    }
    .mono {
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 0.9rem;
    }
    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }
    .gallery-card {
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.72);
    }
    .gallery-card img,
    .gallery-fallback {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: linear-gradient(135deg, #fbe9d7, #f3dfc1);
    }
    .gallery-fallback {
      display: grid;
      place-items: center;
      color: var(--muted);
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    }
    .gallery-meta,
    .gallery-card p {
      padding: 12px 14px;
      margin: 0;
    }
    .gallery-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid var(--line);
    }
    .gallery-url {
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 12px;
      color: var(--muted);
      word-break: break-all;
    }
    .action-toolbar {
      display: grid;
      gap: 14px;
    }
    .action-search {
      width: 100%;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.82);
      padding: 14px 16px;
      color: var(--text);
      font: inherit;
    }
    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .action-card {
      text-align: left;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.78);
      padding: 14px;
      display: grid;
      gap: 8px;
      color: inherit;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .action-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(73, 49, 21, 0.1);
    }
    .action-risk { border-color: rgba(179, 38, 30, 0.28); }
    .action-warn { border-color: rgba(157, 104, 0, 0.28); }
    .action-group {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    }
    .action-card small {
      color: var(--muted);
    }
    .split-copy {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .board-copy {
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.78);
      color: var(--text);
      border-radius: 999px;
      padding: 8px 12px;
      font: inherit;
      cursor: pointer;
    }
    .board-copy:hover {
      background: rgba(255,255,255,0.98);
    }
    @media (max-width: 980px) {
      body { padding: 18px; }
      .hero { grid-template-columns: 1fr; }
      .span-4, .span-5, .span-6, .span-7, .span-8, .span-12 { grid-column: span 12; }
      .metrics { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      .metrics { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <span class="pill">workflow dashboard</span>
        <h1>${escapeHtml(payload.state.activeWorkstream.name)} control surface</h1>
        <p>Local operator view backed by repo-native runtime state. It composes route confidence, verify evidence, review outputs, package heatmaps, and browser artifacts into a single resumable surface.</p>
        <div class="hero-meta">
          <span class="pill">phase ${escapeHtml(payload.state.workflow.phase)}</span>
          <span class="pill">step ${escapeHtml(payload.state.workflow.step)}</span>
          <span class="pill">updated ${escapeHtml(payload.generatedAt)}</span>
          <span class="pill">profile ${escapeHtml(routeProfile.id || payload.state.workflow.profile || 'n/a')}</span>
        </div>
      </div>
      <div class="metrics">${summaryMetrics}</div>
    </section>

    <section class="grid">
      <article class="panel span-5">
        <h2>Route</h2>
        <ul>
          ${renderList([
            ['capability', route.recommendedCapability || route.capability || 'n/a'],
            ['preset', route.recommendedPreset || route.preset || 'n/a'],
            ['confidence', route.confidence != null ? route.confidence : 'n/a'],
            ['fallback', route.why?.fallbackCapability || route.fallbackCapability || 'n/a'],
            ['packet', packetSummary.primaryDoc || route.packet || 'n/a'],
            ['ambiguity', route.why?.ambiguityClass || route.ambiguityClass || 'n/a'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No route data yet.')}
        </ul>
      </article>

      <article class="panel span-7">
        <h2>Next Safe Actions</h2>
        <ul>
          ${renderList(verificationPlan, (item) => `<li><span>${escapeHtml(item)}</span><strong class="mono">queued</strong></li>`, 'No queued next actions yet.')}
        </ul>
      </article>

      <article class="panel span-12">
        <h2>Command Palette</h2>
        <div class="action-toolbar">
          <input id="command-search" class="action-search" type="search" placeholder="Filter actions, commands, or reasons..." />
          <div class="action-grid" id="action-grid">
            ${quickActions.length > 0
              ? quickActions.map((action) => renderActionCard(action)).join('')
              : '<div class="gallery-card"><div class="gallery-fallback">No quick actions yet</div><p>Run route, review, verify-work, or ship-readiness to populate command suggestions.</p></div>'}
          </div>
        </div>
      </article>

      <article class="panel span-6">
        <h2>Why This Tool</h2>
        <ul>
          ${renderList(whyReasons.slice(0, 6), (item) => `<li><span>${escapeHtml(item)}</span><strong class="mono">chosen</strong></li>`, 'No route rationale recorded yet.')}
        </ul>
        <div class="split-copy">
          <span>Rejected alternatives and ambiguity stay visible so manual override is easier.</span>
          ${route.recommendedCapability ? `<button type="button" class="board-copy" data-copy-command="${escapeHtml(`cwf route --goal "${route.goal || ''}" --why`)}">copy route probe</button>` : ''}
        </div>
      </article>

      <article class="panel span-6">
        <h2>Rejected Alternatives</h2>
        <ul>
          ${renderList(rejectedAlternatives.slice(0, 6), (item) => `<li><span>${escapeHtml(item.id)}</span><strong class="mono">${escapeHtml(`score ${item.score}`)}</strong></li>`, 'No rejected alternatives were recorded.')}
        </ul>
      </article>

      <article class="panel span-4">
        <h2>Review Personas</h2>
        <ul>
          ${renderList(payload.review.personas.slice(0, 6), (persona) => `<li><span>${escapeHtml(persona.label)}</span><strong class="mono">${escapeHtml(persona.verdict)}</strong></li>`, 'No review persona data yet.')}
        </ul>
      </article>

      <article class="panel span-4">
        <h2>Package Heatmap</h2>
        <ul>
          ${renderList(payload.review.packageHeatmap.slice(0, 6), (item) => `<li><span>${escapeHtml(item.package)}</span><strong class="mono">${escapeHtml(`${item.findings} findings / ${item.fileCount} files`)}</strong></li>`, 'No package heatmap yet.')}
        </ul>
      </article>

      <article class="panel span-4">
        <h2>Verification</h2>
        <ul>
          ${renderList([
            ['verify-work', payload.verifyWork?.verdict || 'n/a'],
            ['ship-readiness', payload.shipReadiness?.verdict || 'n/a'],
            ['browser artifacts', payload.browserArtifacts.length],
            ['shell artifacts', payload.shellArtifacts.length],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No verification data yet.')}
        </ul>
      </article>

      <article class="panel span-8">
        <h2>Context Compiler</h2>
        <ul>
          ${renderList([
            ['task brief', (packetContext.taskBrief || []).join(' | ') || 'n/a'],
            ['primary doc', packetSummary.primaryDoc || packetSummary.primary?.key || 'n/a'],
            ['budget', packetSummary.budgetStatus || 'n/a'],
            ['touched packages', (packetContext.scope?.changedPackages || []).join(', ') || 'none'],
            ['impacted packages', (packetContext.scope?.impactedPackages || []).join(', ') || 'none'],
            ['impacted tests', (packetContext.scope?.impactedTests || []).join(', ') || 'none'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No packet compiler context yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Changed Files</h2>
        <ul>
          ${renderList(payload.changedFiles.slice(0, 10), (item) => `<li><span class="mono">${escapeHtml(item)}</span><strong class="mono">changed</strong></li>`, 'Working tree is clean.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Follow-up Tickets</h2>
        <ul>
          ${renderList(payload.review.followUps.slice(0, 8), (item) => `<li><span>${escapeHtml(item.title)}</span><strong class="mono">${escapeHtml(item.ownerLane)}</strong></li>`, 'No follow-up tickets were generated.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Traceability</h2>
        <ul>
          ${renderList([
            ['validation rows', payload.review.traceability?.validationRows?.length || 0],
            ['linked rows', payload.review.traceability?.linkedCount || 0],
            ['unlinked rows', payload.review.traceability?.unlinkedCount || 0],
            ['unmapped files', payload.review.traceability?.unmappedFiles?.length || 0],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No traceability data yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Frontend Board</h2>
        <ul>
          ${renderList([
            ['overall score', frontendScorecard.overall ? `${frontendScorecard.overall}/5` : 'n/a'],
            ['accessibility', accessibilityAudit.verdict || 'n/a'],
            ['journey', journeyAudit.coverage || 'n/a'],
            ['debt items', frontendReview.debt?.length || 0],
            ['browser evidence', payload.browserArtifacts.length],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No frontend review data yet.')}
        </ul>
      </article>

      <article class="panel span-12">
        <h2>Browser Gallery</h2>
        <div class="gallery">
          ${payload.browserArtifacts.length > 0
            ? payload.browserArtifacts.map((entry) => renderScreenshotCard(cwd, entry)).join('')
            : '<div class="gallery-card"><div class="gallery-fallback">No browser screenshots yet</div><p>Run <span class="mono">cwf ui-review --url ...</span> or <span class="mono">cwf verify-browser</span> to populate the gallery.</p></div>'}
        </div>
      </article>

      <article class="panel span-6">
        <h2>Benchmark Snapshot</h2>
        <ul>
          ${benchmarkRows || '<li class="empty">No benchmark snapshot yet.</li>'}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Top Findings</h2>
        <ul>
          ${renderList(payload.review.findings.slice(0, 8), (finding) => `<li><span>${escapeHtml(finding.title)}</span><strong class="mono">${escapeHtml(finding.severity)}</strong></li>`, 'No review findings yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Trust Board</h2>
        <ul>
          ${renderList([
            ['pending approvals', payload.shipReadiness?.approvalPlan?.pending?.length || 0],
            ['verify reasons', payload.verifyWork?.reasons?.length || 0],
            ['open questions', packetContext.context?.openQuestions?.length || 0],
            ['active assumptions', packetContext.context?.assumptions?.length || 0],
            ['evidence slots', packetContext.context?.evidenceSlots?.length || 0],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No trust data yet.')}
        </ul>
      </article>
    </section>
  </main>
  <script>
    const search = document.getElementById('command-search');
    const actionCards = Array.from(document.querySelectorAll('[data-action-card]'));
    const copyButtons = Array.from(document.querySelectorAll('[data-copy-command]'));
    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        for (const card of actionCards) {
          const haystack = (card.dataset.search || '').toLowerCase();
          card.hidden = query ? !haystack.includes(query) : false;
        }
      });
    }
    async function copyCommand(value, element) {
      const label = element.textContent;
      try {
        await navigator.clipboard.writeText(value);
        element.textContent = 'copied';
        setTimeout(() => { element.textContent = label; }, 1200);
      } catch {
        element.textContent = 'copy failed';
        setTimeout(() => { element.textContent = label; }, 1200);
      }
    }
    for (const button of copyButtons) {
      button.addEventListener('click', () => copyCommand(button.dataset.copyCommand || '', button));
    }
    for (const card of actionCards) {
      card.addEventListener('click', () => copyCommand(card.dataset.command || '', card));
    }
  </script>
</body>
</html>`;
}

function writeDashboard(cwd, payload) {
  fs.mkdirSync(dashboardDir(cwd), { recursive: true });
  const htmlPath = dashboardHtmlPath(cwd);
  const statePath = dashboardStatePath(cwd);
  fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(htmlPath, `${renderDashboardHtml(cwd, payload)}\n`);
  return {
    htmlPath,
    statePath,
  };
}

function maybeOpenDashboard(filePath) {
  const openers = {
    darwin: { command: 'open', args: [filePath] },
    linux: { command: 'xdg-open', args: [filePath] },
    win32: { command: 'cmd', args: ['/c', 'start', '', filePath] },
  };
  const opener = openers[process.platform];
  if (!opener) {
    return false;
  }
  const result = childProcess.spawnSync(opener.command, opener.args, {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = readDashboardData(cwd, rootDir);
  const written = writeDashboard(cwd, payload);
  const quickActions = buildQuickActions(payload);
  const opened = args.open ? maybeOpenDashboard(written.htmlPath) : false;
  const result = {
    generatedAt: payload.generatedAt,
    file: relativePath(cwd, written.htmlPath),
    stateFile: relativePath(cwd, written.statePath),
    opened,
    summary: {
      reviewFindings: payload.review.findings.length,
      browserArtifacts: payload.browserArtifacts.length,
      changedFiles: payload.changedFiles.length,
      shipVerdict: payload.shipReadiness?.verdict || 'n/a',
      quickActions: quickActions.length,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('# DASHBOARD\n');
  console.log(`- File: \`${result.file}\``);
  console.log(`- State: \`${result.stateFile}\``);
  console.log(`- Review findings: \`${result.summary.reviewFindings}\``);
  console.log(`- Browser artifacts: \`${result.summary.browserArtifacts}\``);
  console.log(`- Ship verdict: \`${result.summary.shipVerdict}\``);
  console.log(`- Quick actions: \`${result.summary.quickActions}\``);
  if (args.open) {
    console.log(`- Opened: \`${opened ? 'yes' : 'no'}\``);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  dashboardHtmlPath,
  dashboardStatePath,
  readDashboardData,
  renderDashboardHtml,
  writeDashboard,
};
