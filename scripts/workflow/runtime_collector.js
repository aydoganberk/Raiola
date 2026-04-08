const fs = require('node:fs');
const path = require('node:path');
const { buildDoctorReport } = require('./doctor');
const { buildHealthReport } = require('./health');
const { buildNextPayload } = require('./next_step');
const { deepMerge, writeStateSurface, buildBaseState } = require('./state_surface');
const { getLogSnapshot } = require('./team_runtime_log_index');
const { listLatestEntries, readJsonIfExists } = require('./runtime_helpers');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function summarizeVerificationKind(cwd, kind) {
  const baseDir = path.join(cwd, '.workflow', 'verifications', kind);
  const entries = listLatestEntries(baseDir, 5);
  const records = entries
    .map((entry) => {
      const meta = readJsonIfExists(path.join(entry.fullPath, 'meta.json'));
      if (!meta) {
        return null;
      }
      return {
        id: entry.name,
        verdict: meta.verdict || 'inconclusive',
        target: meta.command || meta.target || meta.url || 'unknown',
        durationMs: meta.durationMs || 0,
        startedAt: meta.startedAt || null,
        finishedAt: meta.finishedAt || null,
        artifactDir: relativePath(cwd, entry.fullPath),
        summary: meta.summary || '',
      };
    })
    .filter(Boolean);

  const verdictCounts = records.reduce((counts, item) => {
    counts[item.verdict] = (counts[item.verdict] || 0) + 1;
    return counts;
  }, {});

  return {
    total: records.length,
    latest: records[0] || null,
    verdictCounts,
    recent: records,
  };
}

function summarizeVerifications(cwd) {
  return {
    shell: summarizeVerificationKind(cwd, 'shell'),
    browser: summarizeVerificationKind(cwd, 'browser'),
  };
}

function summarizeOrchestration(cwd) {
  const orchestrationStatePath = path.join(cwd, '.workflow', 'orchestration', 'state.json');
  const runtimeRoot = path.join(cwd, '.workflow', 'orchestration', 'runtime');
  const adapterStatePath = path.join(runtimeRoot, 'state.json');
  const supervisorStatePath = path.join(runtimeRoot, 'supervisor.json');
  const mergeQueueStatePath = path.join(runtimeRoot, 'merge-queue.json');
  const conflictsStatePath = path.join(runtimeRoot, 'conflicts.json');
  const qualityStatePath = path.join(runtimeRoot, 'quality.json');
  const prFeedbackStatePath = path.join(runtimeRoot, 'pr-feedback.json');
  const reviewLoopStatePath = path.join(runtimeRoot, 'review-loop.json');
  const mailboxPath = path.join(runtimeRoot, 'mailbox.jsonl');
  const orchestrationState = readJsonIfExists(orchestrationStatePath);
  const adapterState = readJsonIfExists(adapterStatePath);
  const supervisorState = readJsonIfExists(supervisorStatePath);
  const mergeQueueState = readJsonIfExists(mergeQueueStatePath);
  const conflictsState = readJsonIfExists(conflictsStatePath);
  const qualityState = readJsonIfExists(qualityStatePath);
  const prFeedbackState = readJsonIfExists(prFeedbackStatePath);
  const reviewLoopState = readJsonIfExists(reviewLoopStatePath);
  const mailboxEntries = getLogSnapshot(cwd, 'mailbox').count;

  if (!orchestrationState) {
    return {
      active: false,
      status: 'idle',
      activeWave: null,
      route: null,
      counts: {
        queued: 0,
        ready: 0,
        inProgress: 0,
        completed: 0,
        blocked: 0,
        skipped: 0,
      },
      adapter: null,
      supervisor: supervisorState ? {
        status: supervisorState.status || 'idle',
        cycleCount: supervisorState.cycleCount || 0,
        watch: Boolean(supervisorState.watch),
        background: Boolean(supervisorState.background),
      } : null,
      mergeQueue: mergeQueueState ? {
        nextTaskId: mergeQueueState.nextTaskId || null,
        counts: mergeQueueState.counts || {},
        queueLength: Array.isArray(mergeQueueState.queue) ? mergeQueueState.queue.length : 0,
      } : null,
      conflicts: conflictsState ? {
        blockerCount: conflictsState.blockerCount || 0,
        warnCount: conflictsState.warnCount || 0,
      } : null,
      quality: qualityState ? {
        averageScore: qualityState.averageScore || 0,
        verdictCounts: qualityState.verdictCounts || {},
      } : null,
      prFeedback: prFeedbackState ? {
        openCount: prFeedbackState.openCount || 0,
        resolvedCount: prFeedbackState.resolvedCount || 0,
        source: prFeedbackState.source || null,
      } : null,
      reviewLoop: reviewLoopState ? {
        verdict: reviewLoopState.verdict || 'noop',
        findingsCount: reviewLoopState.findingsCount || 0,
        blockerCount: reviewLoopState.blockerCount || 0,
      } : null,
      mailboxEntries,
    };
  }

  return {
    active: true,
    status: orchestrationState.runtime?.status || adapterState?.status || 'active',
    activeWave: orchestrationState.activeWave || null,
    route: orchestrationState.runtime?.route || null,
    counts: orchestrationState.runtime?.counts || {
      queued: 0,
      ready: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      skipped: 0,
    },
    adapter: adapterState ? {
      name: adapterState.adapter || 'plan-only',
      status: adapterState.status || 'prepared',
      dispatchedTasks: adapterState.dispatchedTasks || [],
      workspaces: adapterState.workspaces || {},
      collectedTasks: adapterState.collectedTasks || [],
      runtimeFile: relativePath(cwd, adapterStatePath),
    } : null,
    supervisor: supervisorState ? {
      status: supervisorState.status || 'idle',
      cycleCount: supervisorState.cycleCount || 0,
      watch: Boolean(supervisorState.watch),
      background: Boolean(supervisorState.background),
      lastCycleAt: supervisorState.lastCycleAt || null,
      runtimeFile: relativePath(cwd, supervisorStatePath),
    } : null,
    mergeQueue: mergeQueueState ? {
      nextTaskId: mergeQueueState.nextTaskId || null,
      counts: mergeQueueState.counts || {},
      queueLength: Array.isArray(mergeQueueState.queue) ? mergeQueueState.queue.length : 0,
      runtimeFile: relativePath(cwd, mergeQueueStatePath),
    } : null,
    conflicts: conflictsState ? {
      blockerCount: conflictsState.blockerCount || 0,
      warnCount: conflictsState.warnCount || 0,
      runtimeFile: relativePath(cwd, conflictsStatePath),
    } : null,
    quality: qualityState ? {
      averageScore: qualityState.averageScore || 0,
      verdictCounts: qualityState.verdictCounts || {},
      runtimeFile: relativePath(cwd, qualityStatePath),
    } : null,
    prFeedback: prFeedbackState ? {
      openCount: prFeedbackState.openCount || 0,
      resolvedCount: prFeedbackState.resolvedCount || 0,
      source: prFeedbackState.source || null,
      runtimeFile: relativePath(cwd, prFeedbackStatePath),
    } : null,
    reviewLoop: reviewLoopState ? {
      verdict: reviewLoopState.verdict || 'noop',
      findingsCount: reviewLoopState.findingsCount || 0,
      blockerCount: reviewLoopState.blockerCount || 0,
      runtimeFile: relativePath(cwd, reviewLoopStatePath),
    } : null,
    mailboxEntries,
    stateFile: relativePath(cwd, orchestrationStatePath),
  };
}

function buildRepairHints(payload) {
  const hints = [];
  if (payload.healthReport.failCount > 0) {
    hints.push({
      level: 'high',
      command: 'rai health --repair',
      reason: `${payload.healthReport.failCount} health failure(s) are active`,
    });
  }
  if (payload.doctorReport && payload.doctorReport.failCount > 0) {
    hints.push({
      level: 'high',
      command: 'rai doctor --repair',
      reason: `${payload.doctorReport.failCount} install/runtime failure(s) are active`,
    });
  }
  if (payload.state.drift.count > 0) {
    hints.push({
      level: 'medium',
      command: 'rai next-prompt --mode full',
      reason: `Packet drift detected in ${payload.state.drift.packets.join(', ')}`,
    });
  }
  if (payload.verifications.shell.latest && payload.verifications.shell.latest.verdict === 'fail') {
    hints.push({
      level: 'medium',
      command: 'rai verify-shell --cmd "..."',
      reason: 'Latest shell verification failed; re-run with a bounded command',
    });
  }
  if (payload.orchestration.active && payload.orchestration.status === 'blocked') {
    hints.push({
      level: 'medium',
      command: 'rai team monitor',
      reason: 'Team runtime is blocked and needs operator attention',
    });
  }
  return hints;
}

function collectRuntimeState(cwd, rootDir, options = {}) {
  const nextPayload = buildNextPayload(cwd, rootDir);
  const healthReport = buildHealthReport(cwd, rootDir);
  const doctorReport = options.includeDoctor ? buildDoctorReport(cwd, rootDir) : null;
  const orchestration = summarizeOrchestration(cwd);
  const verifications = summarizeVerifications(cwd);
  const baseState = buildBaseState(cwd, rootDir);

  const patch = {
    health: {
      status: healthReport.failCount > 0 ? 'fail' : healthReport.warnCount > 0 ? 'warn' : 'pass',
      failCount: healthReport.failCount,
      warnCount: healthReport.warnCount,
      topChecks: healthReport.checks.slice(0, 5).map((check) => ({
        status: check.status,
        message: check.message,
      })),
    },
    window: {
      decision: nextPayload.windowStatus.decision,
      remainingBudget: nextPayload.windowStatus.remainingBudget,
      canStartNextStep: nextPayload.windowStatus.canStartNextStep,
      canFinishCurrentChunk: nextPayload.windowStatus.canFinishCurrentChunk,
      automationRecommendation: nextPayload.windowStatus.automationRecommendation,
      packetHash: nextPayload.packetHash,
      estimatedTokens: nextPayload.estimatedTokens,
      budgetStatus: nextPayload.budgetStatus,
    },
    next: {
      title: nextPayload.recommendation.title,
      command: nextPayload.recommendation.command,
      note: nextPayload.recommendation.note,
      checklist: nextPayload.recommendation.checklist,
    },
    frontend: nextPayload.frontend,
    orchestration,
    verifications,
  };

  if (doctorReport) {
    patch.doctor = {
      failCount: doctorReport.failCount,
      warnCount: doctorReport.warnCount,
      checks: doctorReport.checks.slice(0, 10),
      rootDir: doctorReport.rootDirRelative,
      risk: doctorReport.risk,
    };
  }

  const repairHints = buildRepairHints({
    healthReport,
    doctorReport,
    orchestration,
    state: deepMerge(baseState, patch),
    verifications,
  });
  patch.repair = {
    hintCount: repairHints.length,
    hints: repairHints,
  };

  const state = options.writeState === false
    ? deepMerge(baseState, patch)
    : writeStateSurface(cwd, rootDir, patch, { updatedBy: options.updatedBy || 'collector' });

  return {
    state,
    patch,
    healthReport,
    doctorReport,
    nextPayload,
    orchestration,
    verifications,
    repairHints,
  };
}

module.exports = {
  collectRuntimeState,
  summarizeOrchestration,
  summarizeVerifications,
};
