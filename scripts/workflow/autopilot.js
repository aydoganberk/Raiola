const fs = require('node:fs');
const path = require('node:path');
const { currentBranch, parseArgs, resolveWorkflowRoot } = require('./common');
const { buildNextPayload } = require('./next_step');
const { buildDoPayload } = require('./do');
const { buildHealthReport } = require('./health');
const { ensureRepoConfig, summarizeRepoConfig } = require('./repo_config');
const { summarizeOrchestration, summarizeVerifications } = require('./runtime_collector');
const { latestVerifyWork, latestReleaseControl } = require('./trust_os');
const { compactList, readJson, relativePath, writePlaneArtifacts } = require('./control_planes_common');
const { getLogSnapshot } = require('./team_runtime_log_index');

function readActiveThread(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, '.workflow', 'runtime', 'thread.json'), 'utf8'));
  } catch {
    return null;
  }
}

function listThreadFiles(cwd) {
  const dirPath = path.join(cwd, 'docs', 'workflow', 'THREADS');
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return {
        name: name.replace(/\.md$/, ''),
        file: relativePath(cwd, fullPath),
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
}

function buildEventContext(branch) {
  return {
    active: Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
    provider: process.env.GITHUB_ACTIONS ? 'github-actions' : process.env.CI ? 'ci' : 'local',
    eventName: process.env.GITHUB_EVENT_NAME || null,
    actor: process.env.GITHUB_ACTOR || null,
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || branch,
    runId: process.env.GITHUB_RUN_ID || null,
    workflow: process.env.GITHUB_WORKFLOW || null,
  };
}

function renderAutopilotMarkdown(payload) {
  return `# AUTOPILOT

- Verdict: \`${payload.verdict}\`
- Branch: \`${payload.branch}\`
- Automation mode: \`${payload.automation.mode}\`
- Automation status: \`${payload.automation.status}\`
- Event: \`${payload.eventContext.eventName || payload.eventContext.provider}\`
- Suggested routines: \`${payload.routines.length}\`

## Routine Layers

${payload.routines.map((item) => `- [${item.priority}] ${item.title}${item.command ? ` -> \`${item.command}\`` : ''}`).join('\n')}

## Morning Summary

- Milestone: \`${payload.morningSummary.milestone}\`
- Step: \`${payload.morningSummary.step}\`
- Next action: \`${payload.morningSummary.nextCommand}\`
- Release gate: \`${payload.morningSummary.releaseVerdict}\`
- Runtime: \`${payload.morningSummary.teamRuntime}\`

## Publish Surface

- Change-control present: \`${payload.publishSurface.changeControlPresent ? 'yes' : 'no'}\`
- GitHub ready: \`${payload.publishSurface.githubReady ? 'yes' : 'no'}\`
- CI ready: \`${payload.publishSurface.ciReady ? 'yes' : 'no'}\`
- Export coverage: \`${payload.publishSurface.coverageRatio}\`%
- Export manifest: \`${payload.publishSurface.exportManifest || 'n/a'}\`

## Team Activity

- Mailbox entries: \`${payload.teamActivity.mailboxEntries}\`
- Timeline entries: \`${payload.teamActivity.timelineEntries}\`
- Mailbox kinds: \`${payload.teamActivity.mailboxKinds.join(', ') || 'none'}\`
- Timeline events: \`${payload.teamActivity.timelineEvents.join(', ') || 'none'}\`

## Recovery Signals

${payload.recoverySignals.length > 0
    ? payload.recoverySignals.map((item) => `- ${item}`).join('\n')
    : '- `No recovery signal is active.`'}
`;
}

function buildAutopilotPayload(cwd, rootDir, options = {}) {
  const repoConfigPayload = ensureRepoConfig(cwd, rootDir, { writeIfMissing: false });
  const nextPayload = buildNextPayload(cwd, rootDir);
  const doPayload = buildDoPayload(cwd, rootDir, options.goal || nextPayload.recommendation?.title || 'continue the active milestone safely');
  const health = buildHealthReport(cwd, rootDir);
  const verifications = summarizeVerifications(cwd);
  const orchestration = summarizeOrchestration(cwd);
  const verifyWork = latestVerifyWork(cwd);
  const releaseControl = latestReleaseControl(cwd);
  const changeControl = readJson(path.join(cwd, '.workflow', 'reports', 'change-control.json'), null);
  const exportManifest = readJson(path.join(cwd, '.workflow', 'exports', 'export-manifest.json'), null);
  const activeThread = readActiveThread(cwd);
  const threadFiles = listThreadFiles(cwd);
  const mailboxSnapshot = getLogSnapshot(cwd, 'mailbox');
  const timelineSnapshot = getLogSnapshot(cwd, 'timeline');
  const branch = (() => {
    try {
      return currentBranch(cwd) || 'unknown';
    } catch {
      return 'unknown';
    }
  })();
  const eventContext = buildEventContext(branch);

  const routines = [];
  const recoverySignals = [];
  const pushRoutine = (priority, title, command, reason, lane) => {
    if (!title || routines.some((item) => item.title === title && item.command === command)) {
      return;
    }
    routines.push({ priority, title, command, reason, lane });
  };

  pushRoutine(
    'medium',
    'Open the day with the current safe next action',
    nextPayload.recommendation?.command || 'rai next',
    nextPayload.recommendation?.note || 'Start from the current milestone-safe recommendation.',
    'morning-summary',
  );

  if (!['main', 'master', 'unknown'].includes(branch) && repoConfigPayload.activeConfig.automation?.branchStartAdvice !== false) {
    pushRoutine(
      'medium',
      'Use a branch-aware start bundle',
      doPayload.commandPlan?.recommendedExpandedStartCommand || doPayload.commandPlan?.recommendedStartCommand || `rai start ${doPayload.commandPlan?.bundleId || 'slice'} --goal ${JSON.stringify(doPayload.goal)}`,
      `Branch ${branch} is active, so route work through a named lane instead of ad hoc commands.`,
      'branch-flow',
    );
  }

  if ((releaseControl?.shipReadinessBoard?.shipBlockerCount || 0) > 0 || (verifyWork?.review?.blockerCount || 0) > 0) {
    pushRoutine(
      'high',
      'Open the PR / release review lane',
      'rai release-control --json',
      'Ship blockers or review blockers are already present, so the next lane should be release-aware.',
      'pr-review',
    );
    recoverySignals.push('review-or-ship-blocker-active');
  }

  if (verifications.shell.latest?.verdict === 'fail' || verifications.browser.latest?.verdict === 'fail' || verifyWork?.verdict === 'fail') {
    const command = verifications.browser.latest?.verdict === 'fail'
      ? 'rai start correction --goal "fix the failing browser verification" --with repair|regression'
      : 'rai fix --goal "address the current failing verification" --json';
    pushRoutine(
      'high',
      'Open a correction lane from failing verification',
      command,
      'Verification failed, so autopilot should suggest the bounded correction lane instead of a fresh build lane.',
      'correction-lane',
    );
    recoverySignals.push('verification-failure-active');
  }

  if (health.failCount > 0 || health.warnCount > 3) {
    pushRoutine(
      health.failCount > 0 ? 'high' : 'medium',
      'Repair milestone drift before starting a new wave',
      health.failCount > 0 ? 'rai health --repair' : 'rai health --json',
      `${health.failCount} fail and ${health.warnCount} warn health checks are active.`,
      'milestone-drift',
    );
    recoverySignals.push('workflow-drift');
  }

  if (orchestration.active && ['blocked', 'paused'].includes(orchestration.status)) {
    pushRoutine(
      'high',
      'Recover the team runtime before dispatching new work',
      'rai team-control --json',
      `Team runtime is ${orchestration.status} with active wave ${orchestration.activeWave || 'none'}.`,
      'team-recovery',
    );
    recoverySignals.push('team-runtime-recovery');
  }

  if (eventContext.eventName === 'pull_request' && repoConfigPayload.activeConfig.automation?.reviewLaneOnPr !== false) {
    pushRoutine(
      'medium',
      'Refresh the PR review lane and change-control gate',
      'rai release-control --json',
      'Pull request events should keep change-control, trust, and review surfaces refreshed together.',
      'pr-event',
    );
  }

  if (eventContext.eventName === 'pull_request' && repoConfigPayload.activeConfig.automation?.pullRequestPublish !== false) {
    pushRoutine(
      changeControl?.publishPlan?.github?.ready ? 'low' : 'medium',
      'Publish sticky PR comment and GitHub step summary',
      'node scripts/workflow/control_plane_publish.js --apply-github-env --json',
      'PR events benefit from sticky PR comments, step summaries, and GitHub outputs.',
      'pr-publish',
    );
    if (!changeControl?.publishPlan?.github?.ready) {
      recoverySignals.push('github-publish-pending');
    }
  }

  if (eventContext.active && repoConfigPayload.activeConfig.automation?.ciFailureRecovery !== false && (changeControl?.verdict === 'blocked' || verifications.shell.latest?.verdict === 'fail' || verifications.browser.latest?.verdict === 'fail')) {
    pushRoutine(
      'high',
      'Treat the current CI run as bounded failure recovery',
      'rai fix --goal "recover the current failing CI lane" --json',
      'CI is active and release or verification signals are failing, so the next move should be bounded recovery.',
      'ci-recovery',
    );
    recoverySignals.push('ci-failure-recovery');
  }

  if ((exportManifest?.publishPlan?.exportCoverage?.coverageRatio || 0) < 100 && repoConfigPayload.activeConfig.automation?.releaseWaveRefresh !== false) {
    pushRoutine(
      'medium',
      'Refresh missing control-plane exports',
      'rai release-control --json',
      'The current export manifest shows missing GitHub / CI / Slack bridge artifacts.',
      'publish-refresh',
    );
    recoverySignals.push('export-coverage-gap');
  }

  if (activeThread?.activeThread) {
    pushRoutine(
      'low',
      'Resume the active thread explicitly',
      `rai thread resume ${activeThread.activeThread}`,
      'A named thread is already active, so recovery can stay anchored to that thread.',
      'thread-recovery',
    );
  } else if (threadFiles[0]) {
    pushRoutine(
      'low',
      'Recover the most recent inactive thread',
      `rai thread resume ${threadFiles[0].name}`,
      'No active thread marker exists, but a recent thread file is available for recovery.',
      'thread-recovery',
    );
    recoverySignals.push('inactive-thread-recovery');
  }

  if (repoConfigPayload.activeConfig.automation?.teamMailboxRecovery !== false && (mailboxSnapshot.count > 0 || timelineSnapshot.count > 0)) {
    pushRoutine(
      'low',
      'Review mailbox and timeline continuity before parallel work',
      'rai team-control --json',
      'Recent mailbox or timeline activity exists, so continuity should be refreshed before more delegation.',
      'team-activity',
    );
  }

  if (repoConfigPayload.activeConfig.automation?.dailySummary !== false) {
    pushRoutine(
      'low',
      'Refresh dashboard and trust surfaces together',
      'rai dashboard --json',
      'Repo config enables morning-summary behavior, so dashboard refresh is part of the default routine.',
      'dashboard',
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'autopilot',
    workflowRoot: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    branch,
    verdict: routines.some((item) => item.priority === 'high')
      ? 'action-required'
      : routines.length > 0
        ? 'ready'
        : 'idle',
    repoConfig: summarizeRepoConfig(repoConfigPayload),
    automation: {
      mode: nextPayload.automation.mode,
      status: nextPayload.automation.status,
      windowPolicy: nextPayload.automation.windowPolicy,
      recommendation: nextPayload.windowStatus.automationRecommendation,
    },
    eventContext,
    publishSurface: {
      changeControlPresent: Boolean(changeControl),
      githubReady: Boolean(changeControl?.publishPlan?.github?.ready),
      ciReady: Boolean(changeControl?.publishPlan?.ci?.ready),
      coverageRatio: Number(exportManifest?.publishPlan?.exportCoverage?.coverageRatio || changeControl?.publishPlan?.exportCoverage?.coverageRatio || 0),
      exportManifest: exportManifest ? '.workflow/exports/export-manifest.json' : null,
    },
    morningSummary: {
      milestone: nextPayload.milestone,
      step: nextPayload.step,
      nextCommand: nextPayload.recommendation?.command || 'rai next',
      nextTitle: nextPayload.recommendation?.title || 'Continue safely',
      releaseVerdict: changeControl?.verdict || (releaseControl?.shipReadinessBoard?.shipBlockerCount > 0 ? 'blocked' : verifyWork?.verdict || 'unknown'),
      teamRuntime: orchestration.status,
      packetBudget: nextPayload.budgetStatus,
    },
    branchFlow: {
      lane: doPayload.lane,
      bundleId: doPayload.commandPlan?.bundleId || null,
      recommendedStartCommand: doPayload.commandPlan?.recommendedExpandedStartCommand || doPayload.commandPlan?.recommendedStartCommand || null,
    },
    verifications: {
      shell: verifications.shell.latest || null,
      browser: verifications.browser.latest || null,
    },
    teamRuntime: orchestration,
    teamActivity: {
      mailboxEntries: mailboxSnapshot.count,
      timelineEntries: timelineSnapshot.count,
      mailboxKinds: compactList((mailboxSnapshot.recent || []).map((entry) => entry.kind), 8),
      timelineEvents: compactList((timelineSnapshot.recent || []).map((entry) => entry.event), 8),
    },
    threadRecovery: {
      active: activeThread?.activeThread || null,
      knownThreads: threadFiles.slice(0, 8),
    },
    recoverySignals: compactList(recoverySignals, 12),
    routines,
    artifacts: null,
  };

  payload.artifacts = writePlaneArtifacts(cwd, 'autopilot', payload, renderAutopilotMarkdown(payload), { runtimeMirror: true });
  return payload;
}

function printHelp() {
  console.log(`
autopilot

Usage:
  node scripts/workflow/autopilot.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --goal <text>       Optional goal text used to shape the suggested branch flow
  --json              Print machine-readable output
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildAutopilotPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# AUTOPILOT\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- Branch: \`${payload.branch}\``);
  console.log(`- Automation: \`${payload.automation.mode}\` (\`${payload.automation.status}\`)`);
  console.log(`- Event: \`${payload.eventContext.eventName || payload.eventContext.provider}\``);
  console.log(`- Next action: \`${payload.morningSummary.nextCommand}\``);
  console.log(`- Output: \`${payload.artifacts.markdown}\``);
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
  buildAutopilotPayload,
};
