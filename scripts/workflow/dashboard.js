const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs, resolveWorkflowRoot, listGitChanges } = require('./common');
const { buildBaseState } = require('./state_surface');
const { listLatestEntries, readJsonIfExists, runtimePath } = require('./runtime_helpers');
const { buildOperatingCenterPayload } = require('./operate');
const { buildSupervisorPayload, renderTui } = require('./runtime_supervisor');

function printHelp() {
  console.log(`
dashboard

Usage:
  node scripts/workflow/dashboard.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --open              Open the generated local dashboard in the default browser
  --refresh-planes    Refresh the unified operating-center surface before reading dashboard state
  --tui               Render a terminal control room summary instead of HTML metadata
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

function compactValueList(items, limit = 8, accessor = (item) => item) {
  return compactList((items || []).map((item) => accessor(item)).filter(Boolean), limit);
}

function buildQuickActions(payload) {
  const actions = [];
  const pushAction = (group, label, command, reason, tone = 'neutral') => {
    if (!command || actions.some((item) => item.command === command)) {
      return;
    }
    actions.push({ group, label, command, reason, tone });
  };

  if (payload.startPlan?.entryCommand) {
    pushAction('bundle', 'Open structured start bundle', payload.startPlan.entryCommand, 'The latest start plan grouped overlapping commands into one operator entry.', 'good');
  } else if (payload.route?.commandPlan?.recommendedExpandedStartCommand || payload.route?.commandPlan?.recommendedStartCommand) {
    pushAction(
      'bundle',
      'Open structured start bundle',
      payload.route.commandPlan.recommendedExpandedStartCommand || payload.route.commandPlan.recommendedStartCommand,
      'Route planning suggests a packaged start bundle for this work.',
      'good',
    );
  }

  const frontendStart = payload.startPlan?.frontend || payload.route?.frontendStart || null;
  const controlPlane = payload.controlPlane || {};
  const operatingCenter = payload.operatingCenter || {};
  const releaseControl = payload.releaseControl || {};
  const trustCenter = payload.trustCenter || {};
  const changeControl = payload.changeControl || {};
  if (frontendStart?.workflowIntent?.lane === 'refactor') {
    pushAction('frontend', 'Map shared components', 'rai component-map --json', 'Frontend refactor lane benefits from an explicit component inventory.', 'good');
  }
  if ((frontendStart?.suggestedAddOns || []).includes('surface')) {
    pushAction('frontend', 'Expand surface inventory', 'rai page-blueprint --json', 'Surface add-on is recommended for this UI lane.', 'neutral');
  }
  if ((frontendStart?.suggestedAddOns || []).includes('design-system')) {
    pushAction('frontend', 'Align design system', 'rai design-debt --json', 'Design-system add-on is recommended for this UI lane.', 'warn');
  }
  if ((frontendStart?.suggestedAddOns || []).includes('state')) {
    pushAction('frontend', 'Map UX states', 'rai state-atlas --json', 'State add-on is recommended for this UI lane.', 'warn');
  }
  if (frontendStart?.workflowIntent?.lane === 'ship-readiness') {
    pushAction('frontend', 'Run UI release gate', 'rai ship-readiness', 'Frontend ship-readiness lanes should keep the release gate visible.', 'risk');
    pushAction('frontend', 'Run browser signoff', 'rai verify-browser --url http://localhost:3000 --json', 'Browser proof is part of the selected frontend closeout lane.', 'warn');
  }

  if (operatingCenter.primaryCommand) {
    pushAction('operate', `Open ${operatingCenter.activePlane?.title || 'active plane'}`, operatingCenter.primaryCommand, `Operating Center ranked ${operatingCenter.activePlane?.title || 'the current plane'} first.`, operatingCenter.verdict === 'action-required' ? 'risk' : operatingCenter.verdict === 'attention-required' ? 'warn' : 'good');
  }
  if (operatingCenter.operatorSequence?.[0]?.command) {
    pushAction('operate', 'Refresh the operating center', 'rai operate --refresh --json', 'Refresh the ranked plane board and publish surface in one pass.', 'neutral');
  }

  if (controlPlane.correctionBoard?.recommendedStarterCommand) {
    pushAction('correction', 'Open correction bundle', controlPlane.correctionBoard.recommendedStarterCommand, 'The correction board already knows the fastest safe structured entry for the next wave.', 'good');
  }
  if (controlPlane.correctionPlanner?.recommendedNextCommand) {
    pushAction('correction', 'Run next correction wave', controlPlane.correctionPlanner.recommendedNextCommand, 'Use the deduped findings registry and current wave plan instead of guessing the next fix command.', controlPlane.correctionBoard?.readyToPatchCount > 0 ? 'good' : 'warn');
  }
  if ((controlPlane.correctionBoard?.verifyQueue || [])[0]) {
    pushAction('correction', 'Run correction verify queue', controlPlane.correctionBoard.verifyQueue[0], 'Correction planning already assembled a concrete verify queue for the current wave.', 'warn');
  }
  if (controlPlane.largeRepoBoard?.currentShard?.area) {
    pushAction('scale', 'Open current shard', `rai start monorepo --goal ${JSON.stringify(`review ${controlPlane.largeRepoBoard.currentShard.area}`)} --with shard|ownership`, 'Large-repo board ranked a current shard so the next read/write wave is explicit.', 'neutral');
  }

  if (releaseControl.verifyStatusBoard?.primaryCommand) {
    pushAction('trust', 'Run release verify queue', releaseControl.verifyStatusBoard.primaryCommand, 'Release control already narrowed the next verification command.', releaseControl.verifyStatusBoard.failedVerificationCount > 0 ? 'risk' : 'warn');
  }
  if (releaseControl.shipReadinessBoard?.releaseWave?.primaryCommand) {
    pushAction('ship', 'Open release wave', releaseControl.shipReadinessBoard.releaseWave.primaryCommand, 'Ship-readiness and verify-work now share the same release-control wave.', releaseControl.shipReadinessBoard.shipBlockerCount > 0 ? 'risk' : 'good');
  }
  if (trustCenter.priorityActions?.[0]?.command) {
    pushAction('trust', 'Clear trust-center priority action', trustCenter.priorityActions[0].command, trustCenter.priorityActions[0].reason || 'Trust Center already captured the next governance action.', trustCenter.verdict === 'hold' ? 'risk' : 'warn');
  }
  if (changeControl.nextActions?.[0]?.command) {
    pushAction('ship', 'Follow the current change-control action', changeControl.nextActions[0].command, changeControl.nextActions[0].title || 'Change Control already has a concrete next step.', changeControl.verdict === 'blocked' ? 'risk' : 'warn');
  }

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
      ? 'rai ui-review'
      : item.lane === 'review'
        ? 'rai review --blockers'
        : item.lane === 'claims'
          ? 'rai claims check'
          : item.lane === 'requirements'
            ? 'rai packet explain --step plan'
            : item.lane === 'shell'
              ? 'rai verify-shell --cmd "npm test"'
              : 'rai verify-work';
    pushAction('trust', item.action, command, item.evidence || 'Verify-work generated this fix-plan item.', item.priority === 'high' ? 'risk' : 'warn');
  }
  if (payload.frontendReview?.accessibilityAudit?.verdict && payload.frontendReview.accessibilityAudit.verdict !== 'pass') {
    pushAction('frontend', 'Address accessibility audit', 'rai ui-review', payload.frontendReview.accessibilityAudit.guidance, 'risk');
  }
  if (payload.frontendReview?.journeyAudit?.coverage && payload.frontendReview.journeyAudit.coverage !== 'pass') {
    pushAction('frontend', 'Tighten journey coverage', 'rai verify-browser --smoke', payload.frontendReview.journeyAudit.guidance, 'warn');
  }
  if (payload.packetContext?.packet?.budgetStatus && payload.packetContext.packet.budgetStatus !== 'ok') {
    pushAction('context', 'Rebuild packet budget', `rai packet explain --step ${payload.packetContext.packet.step || 'plan'}`, 'Packet budget is no longer in the safe zone.', 'warn');
  }
  if ((payload.review?.traceability?.unlinkedCount || 0) > 0) {
    pushAction('review', 'Close traceability gaps', 'rai validation-map', 'Changed scope is not fully linked to the validation contract.', 'warn');
  }
  if ((payload.review?.packageGraph?.impactedTests || []).length > 0) {
    pushAction('scale', 'Exercise impacted tests', 'rai verify-shell --cmd "npm test"', 'Package graph identified impacted test ownership.', 'neutral');
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
  const releaseControl = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'release-control.json'));
  const benchmark = readJsonIfExists(path.join(cwd, '.workflow', 'benchmarks', 'latest.json'));
  const packetLatest = readJsonIfExists(path.join(cwd, '.workflow', 'packets', 'latest.json'));
  const packetContext = readJsonIfExists(path.join(cwd, '.workflow', 'packets', 'latest-context.json'));
  const frontendReview = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'frontend-review.json'));
  const frontendSpec = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'frontend-spec.json'));
  const frontendProfile = readJsonIfExists(path.join(cwd, '.workflow', 'frontend-profile.json'));
  const startPlan = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'start-plan.json'));
  const repoConfig = readJsonIfExists(path.join(cwd, '.workflow', 'runtime', 'repo-config.json'))
    || readJsonIfExists(path.join(cwd, '.workflow', 'repo-config.json'))
    || null;
  const trustCenter = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'trust-center.json')) || null;
  const changeControl = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'change-control.json')) || null;
  const autopilot = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'autopilot.json')) || null;
  const handoffOs = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'handoff-os.json')) || null;
  const teamControlRoom = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'team-control-room.json')) || null;
  const measurement = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'measurement.json')) || null;
  const explainability = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'explainability.json')) || null;
  const lifecycleCenter = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'lifecycle-center.json')) || null;
  const operatingCenter = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'operating-center.json')) || null;
  const findingsRegistry = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'findings-registry.json')) || null;
  const correctionControl = readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'correction-control.json')) || null;
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
    releaseControl,
    benchmark,
    packetLatest,
    packetContext,
    frontendReview,
    frontendSpec,
    frontendProfile,
    startPlan,
    repoConfig,
    trustCenter,
    changeControl,
    autopilot,
    handoffOs,
    teamControlRoom,
    measurement,
    explainability,
    lifecycleCenter,
    operatingCenter,
    controlPlane: correctionControl || (findingsRegistry ? { findingsRegistry } : null),
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
  const frontendStart = payload.startPlan?.frontend || payload.route?.frontendStart || null;
  const controlPlane = payload.controlPlane || {};
  const releaseControl = payload.releaseControl || {};
  const repoConfig = payload.repoConfig || {};
  const trustCenter = payload.trustCenter || {};
  const changeControl = payload.changeControl || {};
  const autopilot = payload.autopilot || {};
  const handoffOs = payload.handoffOs || {};
  const teamControlRoom = payload.teamControlRoom || {};
  const measurement = payload.measurement || {};
  const explainability = payload.explainability || {};
  const lifecycleCenter = payload.lifecycleCenter || {};
  const operatingCenter = payload.operatingCenter || {};
  const rawFrontendProfile = payload.frontendProfile || {};
  const workflowBundle = payload.startPlan?.bundle || (route.commandPlan?.bundleHint
    ? {
      id: route.commandPlan.bundleHint.id || route.commandPlan?.bundleId || 'n/a',
      label: route.commandPlan.bundleHint.label || route.commandPlan?.bundleLabel || 'n/a',
    }
    : {
      id: route.commandPlan?.bundleId || 'n/a',
      label: route.commandPlan?.bundleLabel || 'n/a',
    });
  const bundleStarterCommand = payload.startPlan?.entryCommand || route.commandPlan?.recommendedStartCommand || 'n/a';
  const bundleExpandedStarter = payload.startPlan?.recommendedStarterCommand || route.commandPlan?.recommendedExpandedStartCommand || bundleStarterCommand;
  const bundleFamilies = payload.startPlan?.commandFamilies || route.commandPlan?.commandFamilies || [];
  const bundlePhases = payload.startPlan?.phases || route.commandPlan?.phases || [];
  const bundleProfile = payload.startPlan?.profile || route.commandPlan?.startProfile || null;
  const bundleAddOns = payload.startPlan?.addOns || route.commandPlan?.startAddOns || [];
  const bundleRecommendedAddOns = payload.startPlan?.recommendedAddOns || route.commandPlan?.recommendedAddOns || route.commandPlan?.startAddOns || [];
  const bundleCandidateBundles = payload.startPlan?.candidateBundles || route.commandPlan?.candidateBundles || [];
  const bundleOperatorTips = payload.startPlan?.operatorTips || [];
  const findingsRegistry = controlPlane.findingsRegistry || {};
  const findingsSummary = findingsRegistry.summary || {};
  const reviewControlRoom = controlPlane.reviewControlRoom || {};
  const correctionBoard = controlPlane.correctionBoard || {};
  const correctionPlanner = controlPlane.correctionPlanner || {};
  const largeRepoBoard = controlPlane.largeRepoBoard || {};
  const verifyStatusBoard = releaseControl.verifyStatusBoard || {};
  const shipReadinessBoard = releaseControl.shipReadinessBoard || {};
  const topHotspots = reviewControlRoom.topHotspots || [];
  const correctionWaves = correctionPlanner.waves || [];
  const rankedPackages = largeRepoBoard.rankedPackages || [];
  const reviewFindingsCount = findingsSummary.open != null ? findingsSummary.open : payload.review.findings.length;
  const quickActions = buildQuickActions(payload);
  const summaryMetrics = [
    renderMetric('milestone', payload.state.workflow.milestone, 'neutral'),
    renderMetric('step', payload.state.workflow.step, 'neutral'),
    renderMetric('route', route.recommendedCapability || route.capability || 'n/a', 'neutral'),
    renderMetric('bundle', workflowBundle.label || 'n/a', bundlePhases.length > 0 ? 'good' : 'neutral'),
    renderMetric('bundle profile', bundleProfile?.label || 'n/a', bundleProfile?.id === 'deep' ? 'good' : bundleProfile?.id === 'speed' ? 'warn' : 'neutral'),
    renderMetric('confidence', route.confidence != null ? String(route.confidence) : 'n/a', route.confidence >= 0.8 ? 'good' : route.confidence >= 0.6 ? 'warn' : 'risk'),
    renderMetric('cost', routeProfile.costBudget || 'n/a', 'neutral'),
    renderMetric('risk', routeProfile.riskBudget || payload.shipReadiness?.verdict || 'n/a', payload.shipReadiness?.verdict === 'blocked' ? 'risk' : 'warn'),
    renderMetric('open findings', String(reviewFindingsCount), reviewFindingsCount === 0 ? 'good' : 'warn'),
    renderMetric('open blockers', String(reviewControlRoom.openBlockerCount || 0), (reviewControlRoom.openBlockerCount || 0) === 0 ? 'good' : 'risk'),
    renderMetric('queued verify', String(verifyStatusBoard.queuedForVerifyCount || 0), (verifyStatusBoard.queuedForVerifyCount || 0) > 0 ? 'warn' : 'good'),
    renderMetric('ship blockers', String(shipReadinessBoard.shipBlockerCount || 0), (shipReadinessBoard.shipBlockerCount || 0) === 0 ? 'good' : 'risk'),
    renderMetric('ready to patch', String(correctionBoard.readyToPatchCount || 0), (correctionBoard.readyToPatchCount || 0) > 0 ? 'good' : 'neutral'),
    renderMetric('ranked shards', String(rankedPackages.length), rankedPackages.length > 0 ? 'good' : 'neutral'),
    renderMetric('operating verdict', operatingCenter.verdict || 'n/a', operatingCenter.verdict === 'action-required' ? 'risk' : operatingCenter.verdict === 'attention-required' ? 'warn' : operatingCenter.verdict ? 'good' : 'neutral'),
    renderMetric('active plane', operatingCenter.activePlane?.title || 'n/a', operatingCenter.activePlane?.id ? 'good' : 'neutral'),
  ].join('');

  const benchmarkRows = (payload.benchmark?.results || []).slice(0, 6).map((result) => (
    `<li><span>${escapeHtml(result.command)}</span><strong>${escapeHtml(`${result.warmMedianMs}ms`)}</strong></li>`
  )).join('');

  const verificationPlan = (route.verificationPlan || [])
    .concat(verifyStatusBoard.verifyQueue || [])
    .concat(payload.shipReadiness?.nextActions || [])
    .slice(0, 8);
  const whyReasons = route.why?.chosenReasons || route.routeRationale || [];
  const rejectedAlternatives = route.why?.rejectedAlternatives || route.rejectedAlternatives || [];
  const packetSummary = packetContext.packet || payload.packetLatest || {};
  const frontendScorecard = frontendReview.scorecard || {};
  const accessibilityAudit = frontendReview.accessibilityAudit || frontendReview.accessibility || {};
  const journeyAudit = frontendReview.journeyAudit || frontendReview.journey || {};
  const frontendFocus = compactList(frontendStart?.focusAreas || [], 4).join(', ') || 'none';
  const frontendSuggestedAddOns = compactList(frontendStart?.suggestedAddOns || [], 6).join(', ') || 'none';
  const frontendFramework = frontendStart?.framework || rawFrontendProfile.framework?.primary || 'n/a';
  const frontendRouting = frontendStart?.routing || rawFrontendProfile.routing?.primary || rawFrontendProfile.routing?.label || 'n/a';
  const frontendSurface = frontendStart?.productSurface || rawFrontendProfile.productSurface?.label || 'n/a';
  const frontendUiSystem = frontendStart?.uiSystem || rawFrontendProfile.uiSystem?.primary || 'n/a';
  const frontendCommandPack = frontendStart?.commandPack || rawFrontendProfile.recommendedCommandPack?.id || rawFrontendProfile.commandPack || 'n/a';
  const frontendLane = frontendStart?.workflowIntent?.lane || 'n/a';
  const repoConfigSummary = repoConfig.summary || repoConfig.repoConfig || {};
  const repoConfigActive = repoConfig.activeConfig || repoConfig || {};

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
    .action-good { border-color: rgba(31, 122, 77, 0.28); }
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
        <p>Local operator view backed by repo-native runtime state. It now composes route confidence, the review-correction control plane, findings registry, verify evidence, package heatmaps, and browser artifacts into a single resumable surface.</p>
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
            ['bundle', workflowBundle.label || 'n/a'],
            ['start', bundleStarterCommand || 'n/a'],
            ['expanded start', bundleExpandedStarter || 'n/a'],
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

      <article class="panel span-6">
        <h2>Workflow Bundle</h2>
        <ul>
          ${renderList([
            ['bundle', workflowBundle.label || 'n/a'],
            ['starter', bundleStarterCommand || 'n/a'],
            ['expanded starter', bundleExpandedStarter || 'n/a'],
            ['profile', bundleProfile ? `${bundleProfile.label} (${bundleProfile.reason || bundleProfile.id || 'auto'})` : 'n/a'],
            ['add-ons', compactValueList(bundleAddOns, 6, (entry) => entry.id).join(', ') || 'none'],
            ['recommended add-ons', compactValueList(bundleRecommendedAddOns, 6, (entry) => entry.id).join(', ') || 'none'],
            ['candidate bundles', bundleCandidateBundles.length],
            ['families', bundleFamilies.length],
            ['phases', bundlePhases.length],
            ['selection', payload.startPlan?.selectionReason || route.commandPlan?.bundleHint?.reason || 'route-derived'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No workflow bundle data yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Bundled Phases</h2>
        <ul>
          ${renderList(bundlePhases.slice(0, 8), (phase) => `<li><span>${escapeHtml(phase.label)}</span><strong class="mono">${escapeHtml(phase.commands.length > 0 ? (phase.commands[0].cli || phase.commands[0].label || 'phase ready') : 'phase ready')}</strong></li>`, 'No structured bundle phases yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Bundle Tips</h2>
        <ul>
          ${renderList(bundleOperatorTips.slice(0, 6), (item) => `<li><span>${escapeHtml(item)}</span><strong class="mono">tip</strong></li>`, 'No bundle tips recorded yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Candidate Bundles</h2>
        <ul>
          ${renderList(bundleCandidateBundles.slice(0, 5), (candidate) => `<li><span>${escapeHtml(candidate.label || candidate.id || 'bundle')}</span><strong class="mono">${escapeHtml(`score ${candidate.score}`)}</strong></li>`, 'No alternate bundle candidates were recorded.')}
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

      <article class="panel span-4">
        <h2>Review Control Room</h2>
        <ul>
          ${renderList([
            ['active lane', reviewControlRoom.activeLane || 'n/a'],
            ['open blockers', reviewControlRoom.openBlockerCount || 0],
            ['high-confidence fixes', reviewControlRoom.highConfidenceFixes || 0],
            ['risky refactors', reviewControlRoom.riskyRefactors || 0],
            ['verify queue', (reviewControlRoom.verifyQueue || []).length],
            ['re-review needed', (reviewControlRoom.rereviewNeededItems || []).length],
            ['top hotspot', topHotspots[0]?.path || 'none'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No review control-room data yet.')}
        </ul>
      </article>

      <article class="panel span-4">
        <h2>Correction Board</h2>
        <ul>
          ${renderList([
            ['ready to patch', correctionBoard.readyToPatchCount || 0],
            ['needs human decision', correctionBoard.needsHumanDecisionCount || 0],
            ['risky refactors', correctionBoard.riskyRefactorCount || 0],
            ['patched / unverified', correctionBoard.patchedButUnverifiedCount || 0],
            ['failed verification', correctionBoard.failedVerificationCount || 0],
            ['closed findings', correctionBoard.closedFindingCount || 0],
            ['starter', correctionBoard.recommendedStarterCommand || 'n/a'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No correction-board data yet.')}
        </ul>
      </article>

      <article class="panel span-4">
        <h2>Large Repo Board</h2>
        <ul>
          ${renderList([
            ['repo shape', largeRepoBoard.repoShape || 'n/a'],
            ['coverage depth', largeRepoBoard.coverageDepth || 'n/a'],
            ['current shard', largeRepoBoard.currentShard?.area || 'none'],
            ['next shard', largeRepoBoard.nextShard?.area || 'none'],
            ['active wave', largeRepoBoard.correctionWaveProgress?.activeWave || 'none'],
            ['ready in active wave', largeRepoBoard.correctionWaveProgress?.readyToPatchCount || 0],
            ['ranked packages', rankedPackages.length],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No large-repo board data yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Why This Tool</h2>
        <ul>
          ${renderList(whyReasons.slice(0, 6), (item) => `<li><span>${escapeHtml(item)}</span><strong class="mono">chosen</strong></li>`, 'No route rationale recorded yet.')}
        </ul>
        <div class="split-copy">
          <span>Rejected alternatives and ambiguity stay visible so manual override is easier.</span>
          ${route.recommendedCapability ? `<button type="button" class="board-copy" data-copy-command="${escapeHtml(`rai route --goal "${route.goal || ''}" --why`)}">copy route probe</button>` : ''}
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
        <h2>Review Hotspots</h2>
        <ul>
          ${renderList((topHotspots.length > 0 ? topHotspots : payload.review.packageHeatmap.slice(0, 6)), (item) => `<li><span>${escapeHtml(item.path || item.package || item.area || 'hotspot')}</span><strong class="mono">${escapeHtml(item.findings != null ? `${item.findings} findings / score ${item.severityScore || item.riskScore || 'n/a'}` : `${item.findings || 0} findings / ${item.fileCount || 0} files`)}</strong></li>`, 'No review hotspots yet.')}
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
        <h2>Correction Waves</h2>
        <ul>
          ${renderList((correctionWaves.length > 0 ? correctionWaves : payload.review.followUps.slice(0, 8)), (item) => `<li><span>${escapeHtml(item.label || item.title || 'wave')}</span><strong class="mono">${escapeHtml(item.itemCount != null ? `${item.itemCount} items / ${item.mode}` : (item.ownerLane || 'queued'))}</strong></li>`, 'No correction waves were generated yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Ranked Packages</h2>
        <ul>
          ${renderList((rankedPackages.length > 0 ? rankedPackages.slice(0, 8) : [
            { area: 'validation rows', detail: payload.review.traceability?.validationRows?.length || 0 },
            { area: 'linked rows', detail: payload.review.traceability?.linkedCount || 0 },
            { area: 'unlinked rows', detail: payload.review.traceability?.unlinkedCount || 0 },
            { area: 'unmapped files', detail: payload.review.traceability?.unmappedFiles?.length || 0 },
          ]), (item) => `<li><span>${escapeHtml(item.area || item.label || 'area')}</span><strong class="mono">${escapeHtml(item.riskScore != null ? `score ${item.riskScore} / ${item.severity || 'n/a'}` : String(item.detail ?? 'n/a'))}</strong></li>`, 'No ranked packages yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Frontend Control Room</h2>
        <ul>
          ${renderList([
            ['lane', frontendLane],
            ['framework', frontendFramework],
            ['routing', frontendRouting],
            ['surface', frontendSurface],
            ['ui system', frontendUiSystem],
            ['command pack', frontendCommandPack],
            ['routes', frontendStart?.routeCount || 0],
            ['route families', frontendStart?.routeFamilyCount || 0],
            ['shared components', frontendStart?.sharedComponentCount || 0],
            ['local components', frontendStart?.localComponentCount || 0],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No frontend identification data yet.')}
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
            ['suggested add-ons', frontendSuggestedAddOns],
            ['focus areas', frontendFocus],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No frontend review data yet.')}
        </ul>
      </article>

      <article class="panel span-12">
        <h2>Browser Gallery</h2>
        <div class="gallery">
          ${payload.browserArtifacts.length > 0
            ? payload.browserArtifacts.map((entry) => renderScreenshotCard(cwd, entry)).join('')
            : '<div class="gallery-card"><div class="gallery-fallback">No browser screenshots yet</div><p>Run <span class="mono">rai ui-review --url ...</span> or <span class="mono">rai verify-browser</span> to populate the gallery.</p></div>'}
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
        <h2>Verify Status Board</h2>
        <ul>
          ${renderList([
            ['shell gate', verifyStatusBoard.shellGate || 'n/a'],
            ['browser gate', verifyStatusBoard.browserGate || 'n/a'],
            ['open blockers', verifyStatusBoard.openBlockerCount || 0],
            ['queued for verify', verifyStatusBoard.queuedForVerifyCount || 0],
            ['failed verification', verifyStatusBoard.failedVerificationCount || 0],
            ['pending re-review', verifyStatusBoard.pendingRereviewCount || 0],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No verify-status data yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Ship Readiness Board</h2>
        <ul>
          ${renderList([
            ['verdict', shipReadinessBoard.verdict || payload.shipReadiness?.verdict || 'n/a'],
            ['score', shipReadinessBoard.score ?? payload.shipReadiness?.score ?? 'n/a'],
            ['ship blockers', shipReadinessBoard.shipBlockerCount || 0],
            ['pending approvals', shipReadinessBoard.pendingApprovalCount || payload.shipReadiness?.approvalPlan?.pending?.length || 0],
            ['pending verification', shipReadinessBoard.pendingVerificationCount || 0],
            ['release wave', shipReadinessBoard.releaseWave?.label || 'n/a'],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No ship-readiness status yet.')}
        </ul>
      </article>

      <article class="panel span-6">
        <h2>Trust Board</h2>
        <ul>
          ${renderList([
            ['release control', payload.releaseControl?.artifacts?.markdown || 'n/a'],
            ['verify reasons', payload.verifyWork?.reasons?.length || 0],
            ['open questions', packetContext.context?.openQuestions?.length || 0],
            ['active assumptions', packetContext.context?.assumptions?.length || 0],
            ['evidence slots', packetContext.context?.evidenceSlots?.length || 0],
          ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No trust data yet.')}
        </ul>
      </article>


<article class="panel span-12">
  <h2>Operating Center</h2>
  <ul>
    ${renderList([
      ['verdict', operatingCenter.verdict || 'n/a'],
      ['active plane', operatingCenter.activePlane?.title || 'n/a'],
      ['active question', operatingCenter.activePlane?.question || 'n/a'],
      ['primary command', operatingCenter.primaryCommand || 'n/a'],
      ['compression', operatingCenter.compression?.summary || 'n/a'],
      ['publish coverage', operatingCenter.publishSurface?.coverageRatio != null ? `${operatingCenter.publishSurface.coverageRatio}%` : 'n/a'],
      ['github ready', operatingCenter.publishSurface?.githubReady != null ? (operatingCenter.publishSurface.githubReady ? 'yes' : 'no') : 'n/a'],
      ['ci ready', operatingCenter.publishSurface?.ciReady != null ? (operatingCenter.publishSurface.ciReady ? 'yes' : 'no') : 'n/a'],
      ['focus questions', operatingCenter.focusQuestions?.length || 0],
      ['stack packs', operatingCenter.stackPacks?.map((pack) => pack.label).join(', ') || 'none'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No operating-center artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Repo Config</h2>
  <ul>
    ${renderList([
      ['default profile', repoConfigSummary.defaultProfile || repoConfigActive.defaultProfile || 'n/a'],
      ['trust level', repoConfigSummary.trustLevel || repoConfigActive.trustLevel || 'n/a'],
      ['handoff standard', repoConfigSummary.handoffStandard || repoConfigActive.handoffStandard || 'n/a'],
      ['detected profiles', (repoConfigSummary.detectedProfiles || repoConfigActive.detectedProfiles || []).join(', ') || 'none'],
      ['preferred bundles', (repoConfigSummary.preferredBundles || repoConfigActive.preferredBundles || []).join(', ') || 'none'],
      ['required verifications', (repoConfigSummary.requiredVerifications || repoConfigActive.requiredVerifications || []).join(', ') || 'none'],
      ['external exports', (repoConfigSummary.externalExports || repoConfigActive.externalExports || []).length],
      ['publish defaults', repoConfigSummary.releaseControl?.publishStepSummary != null ? (repoConfigSummary.releaseControl.publishStepSummary ? 'on' : 'off') : 'n/a'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No repo-config artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Trust Center</h2>
  <ul>
    ${renderList([
      ['verdict', trustCenter.verdict || 'n/a'],
      ['risk level', trustCenter.risk?.level || 'n/a'],
      ['start gate', trustCenter.decisions?.start || 'n/a'],
      ['merge gate', trustCenter.decisions?.merge || 'n/a'],
      ['ship gate', trustCenter.decisions?.ship || 'n/a'],
      ['pending approvals', trustCenter.approvals?.pending?.length || 0],
      ['missing evidence', trustCenter.evidence?.gaps?.length || 0],
      ['verification gaps', trustCenter.governance?.verificationGapCount || 0],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No trust-center artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Change Control</h2>
  <ul>
    ${renderList([
      ['verdict', changeControl.verdict || 'n/a'],
      ['risk level', changeControl.riskLevel || 'n/a'],
      ['safe to merge', changeControl.gates?.merge?.allowed != null ? (changeControl.gates.merge.allowed ? 'yes' : 'no') : 'n/a'],
      ['safe to ship', changeControl.gates?.ship?.allowed != null ? (changeControl.gates.ship.allowed ? 'yes' : 'no') : 'n/a'],
      ['verify queue', changeControl.gates?.verify?.queue || 0],
      ['ship blockers', changeControl.gates?.ship?.blockers || 0],
      ['rollback ready', changeControl.rollback?.ready != null ? (changeControl.rollback.ready ? 'yes' : 'no') : 'n/a'],
      ['export coverage', changeControl.publishPlan?.exportCoverage?.coverageRatio != null ? `${changeControl.publishPlan.exportCoverage.coverageRatio}%` : 'n/a'],
      ['github ready', changeControl.publishPlan?.github?.ready != null ? (changeControl.publishPlan.github.ready ? 'yes' : 'no') : 'n/a'],
      ['ci ready', changeControl.publishPlan?.ci?.ready != null ? (changeControl.publishPlan.ci.ready ? 'yes' : 'no') : 'n/a'],
      ['issue tracker open', changeControl.integrationSurface?.issueTrackerOpenItems || 0],
      ['exports', Object.keys(changeControl.externalExports || {}).length],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No change-control artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Autopilot</h2>
  <ul>
    ${renderList([
      ['verdict', autopilot.verdict || 'n/a'],
      ['branch', autopilot.branch || 'n/a'],
      ['event', autopilot.eventContext?.eventName || autopilot.eventContext?.provider || 'n/a'],
      ['mode', autopilot.automation?.mode || 'n/a'],
      ['status', autopilot.automation?.status || 'n/a'],
      ['next command', autopilot.morningSummary?.nextCommand || 'n/a'],
      ['routines', autopilot.routines?.length || 0],
      ['export coverage', autopilot.publishSurface?.coverageRatio != null ? `${autopilot.publishSurface.coverageRatio}%` : 'n/a'],
      ['mailbox entries', autopilot.teamActivity?.mailboxEntries || 0],
      ['recovery signals', autopilot.recoverySignals?.join(', ') || 'none'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No autopilot artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Handoff OS</h2>
  <ul>
    ${renderList([
      ['verdict', handoffOs.verdict || 'n/a'],
      ['next action', handoffOs.nextAction?.command || handoffOs.nextAction?.title || 'n/a'],
      ['resume anchor', handoffOs.resumeAnchor || 'n/a'],
      ['open decisions', handoffOs.openDecisions?.length || 0],
      ['unresolved risks', handoffOs.unresolvedRisks?.length || 0],
      ['open loops', handoffOs.continuity?.openLoopCount || 0],
      ['verification ready', handoffOs.continuity?.verificationReady != null ? (handoffOs.continuity.verificationReady ? 'yes' : 'no') : 'n/a'],
      ['continuity bundle', handoffOs.exports?.continuityBundle || 'n/a'],
      ['compact export', handoffOs.exports?.compact || 'n/a'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No handoff artifact yet.')}
  </ul>
</article>

<article class="panel span-4">
  <h2>Team Control Room</h2>
  <ul>
    ${renderList([
      ['verdict', teamControlRoom.verdict || 'n/a'],
      ['runtime', teamControlRoom.runtime?.status || 'n/a'],
      ['active wave', teamControlRoom.runtime?.activeWave || 'n/a'],
      ['roles', teamControlRoom.ownership?.length || 0],
      ['lanes', teamControlRoom.lanes?.length || 0],
      ['waiting roles', teamControlRoom.waitingRoles?.length || 0],
      ['handoff queue', teamControlRoom.handoffQueue?.length || 0],
      ['mailbox entries', teamControlRoom.activity?.mailboxEntries ?? teamControlRoom.runtime?.mailboxEntries ?? 0],
      ['ownership gaps', teamControlRoom.ownershipGaps?.length || 0],
      ['conflict blockers', teamControlRoom.conflicts?.blockerCount || 0],
      ['merge queue next', teamControlRoom.mergeQueue?.nextTaskId || 'none'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No team-control artifact yet.')}
  </ul>
</article>

<article class="panel span-6">
  <h2>Measurement / ROI</h2>
  <ul>
    ${renderList([
      ['findings total', measurement.metrics?.findings?.total || 0],
      ['findings closed', measurement.metrics?.findings?.closed || 0],
      ['automated corrections', measurement.metrics?.corrections?.automated || 0],
      ['verify pass rate', measurement.metrics?.verification?.passRate != null ? `${measurement.metrics.verification.passRate}%` : 'n/a'],
      ['merge-ready ratio', measurement.metrics?.mergeReadiness?.ratio != null ? `${measurement.metrics.mergeReadiness.ratio}%` : 'n/a'],
      ['export coverage', measurement.metrics?.exports?.coverageRatio != null ? `${measurement.metrics.exports.coverageRatio}%` : 'n/a'],
      ['handoff loops', measurement.metrics?.handoffContinuity?.openLoops || 0],
      ['team mailbox', measurement.metrics?.teamOps?.mailboxEntries || 0],
      ['design debt', measurement.metrics?.frontendPolishDebt?.current || 0],
      ['open findings delta', measurement.trend?.openFindingsDelta != null ? measurement.trend.openFindingsDelta : 'n/a'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No measurement artifact yet.')}
  </ul>
</article>

<article class="panel span-3">
  <h2>Explainability</h2>
  <ul>
    ${renderList([
      ['goal', explainability.goal || 'n/a'],
      ['lane', explainability.route?.lane || 'n/a'],
      ['bundle', explainability.start?.bundle?.id || 'n/a'],
      ['confidence', explainability.route?.confidence != null ? explainability.route.confidence : 'n/a'],
      ['confidence tier', explainability.confidenceBreakdown?.tier || 'n/a'],
      ['coverage', explainability.surfaceCoverage?.ratio != null ? `${explainability.surfaceCoverage.ratio}%` : 'n/a'],
      ['deep delta', explainability.deepMode?.addedCommands?.length || 0],
      ['unsurveyed', explainability.unsurveyedSurfaces?.length || 0],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No explainability artifact yet.')}
  </ul>
</article>

<article class="panel span-3">
  <h2>Lifecycle Center</h2>
  <ul>
    ${renderList([
      ['verdict', lifecycleCenter.verdict || 'n/a'],
      ['installed version', lifecycleCenter.version?.installed || 'n/a'],
      ['expected version', lifecycleCenter.version?.expected || 'n/a'],
      ['doctor', lifecycleCenter.doctor ? `${lifecycleCenter.doctor.failCount}/${lifecycleCenter.doctor.warnCount}` : 'n/a'],
      ['health', lifecycleCenter.health ? `${lifecycleCenter.health.failCount}/${lifecycleCenter.health.warnCount}` : 'n/a'],
      ['safe actions', lifecycleCenter.selfHealing?.safeActions || 0],
      ['upgrade drift', lifecycleCenter.upgrade?.drift != null ? (lifecycleCenter.upgrade.drift ? 'yes' : 'no') : 'n/a'],
      ['config drift', lifecycleCenter.drift?.config?.present != null ? (lifecycleCenter.drift.config.present ? 'yes' : 'no') : 'n/a'],
      ['export drift', lifecycleCenter.drift?.exports?.present != null ? (lifecycleCenter.drift.exports.present ? 'yes' : 'no') : 'n/a'],
      ['runtime drift', lifecycleCenter.runtimeDrift?.present != null ? (lifecycleCenter.runtimeDrift.present ? 'yes' : 'no') : 'n/a'],
    ], ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong class="mono">${escapeHtml(String(value))}</strong></li>`, 'No lifecycle artifact yet.')}
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
  if (args.refreshPlanes || args['refresh-planes']) {
    buildOperatingCenterPayload(cwd, rootDir, { refresh: true });
  }
  const payload = readDashboardData(cwd, rootDir);
  const written = writeDashboard(cwd, payload);
  const quickActions = buildQuickActions(payload);
  const opened = args.open ? maybeOpenDashboard(written.htmlPath) : false;
  const controlPlane = payload.controlPlane || {};
  const releaseControl = payload.releaseControl || {};
  const findingsSummary = controlPlane.findingsRegistry?.summary || {};
  const reviewControlRoom = controlPlane.reviewControlRoom || {};
  const correctionBoard = controlPlane.correctionBoard || {};
  const rankedPackages = controlPlane.largeRepoBoard?.rankedPackages || [];
  const result = {
    generatedAt: payload.generatedAt,
    file: relativePath(cwd, written.htmlPath),
    stateFile: relativePath(cwd, written.statePath),
    opened,
    summary: {
      reviewFindings: findingsSummary.open != null ? findingsSummary.open : payload.review.findings.length,
      openBlockers: reviewControlRoom.openBlockerCount || 0,
      readyToPatch: correctionBoard.readyToPatchCount || 0,
      rankedShards: rankedPackages.length,
      browserArtifacts: payload.browserArtifacts.length,
      changedFiles: payload.changedFiles.length,
      verifyQueued: releaseControl.verifyStatusBoard?.queuedForVerifyCount || 0,
      shipBlockers: releaseControl.shipReadinessBoard?.shipBlockerCount || 0,
      shipVerdict: payload.shipReadiness?.verdict || releaseControl.shipReadinessBoard?.verdict || 'n/a',
      operatingVerdict: payload.operatingCenter?.verdict || 'n/a',
      activePlane: payload.operatingCenter?.activePlane?.id || 'n/a',
      quickActions: quickActions.length,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.tui) {
    const supervisor = buildSupervisorPayload(cwd, rootDir, args);
    console.log(renderTui(supervisor));
    return;
  }

  console.log('# DASHBOARD\n');
  console.log(`- File: \`${result.file}\``);
  console.log(`- State: \`${result.stateFile}\``);
  console.log(`- Review findings: \`${result.summary.reviewFindings}\``);
  console.log(`- Open blockers: \`${result.summary.openBlockers}\``);
  console.log(`- Ready to patch: \`${result.summary.readyToPatch}\``);
  console.log(`- Ranked shards: \`${result.summary.rankedShards}\``);
  console.log(`- Queued verify: \`${result.summary.verifyQueued}\``);
  console.log(`- Ship blockers: \`${result.summary.shipBlockers}\``);
  console.log(`- Browser artifacts: \`${result.summary.browserArtifacts}\``);
  console.log(`- Ship verdict: \`${result.summary.shipVerdict}\``);
  console.log(`- Operating verdict: \`${result.summary.operatingVerdict}\``);
  console.log(`- Active plane: \`${result.summary.activePlane}\``);
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
