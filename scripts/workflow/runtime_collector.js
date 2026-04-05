const fs = require('node:fs');
const path = require('node:path');
const { buildDoctorReport } = require('./doctor');
const { buildHealthReport } = require('./health');
const { buildNextPayload } = require('./next_step');
const { deepMerge, writeStateSurface, buildBaseState } = require('./state_surface');
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
  const adapterStatePath = path.join(cwd, '.workflow', 'orchestration', 'runtime', 'state.json');
  const orchestrationState = readJsonIfExists(orchestrationStatePath);
  const adapterState = readJsonIfExists(adapterStatePath);

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
    };
  }

  return {
    active: true,
    status: orchestrationState.runtime?.status || 'active',
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
    stateFile: relativePath(cwd, orchestrationStatePath),
  };
}

function buildRepairHints(payload) {
  const hints = [];
  if (payload.healthReport.failCount > 0) {
    hints.push({
      level: 'high',
      command: 'cwf health --repair',
      reason: `${payload.healthReport.failCount} health failure(s) are active`,
    });
  }
  if (payload.doctorReport && payload.doctorReport.failCount > 0) {
    hints.push({
      level: 'high',
      command: 'cwf doctor --repair',
      reason: `${payload.doctorReport.failCount} install/runtime failure(s) are active`,
    });
  }
  if (payload.state.drift.count > 0) {
    hints.push({
      level: 'medium',
      command: 'cwf next-prompt --mode full',
      reason: `Packet drift detected in ${payload.state.drift.packets.join(', ')}`,
    });
  }
  if (payload.verifications.shell.latest && payload.verifications.shell.latest.verdict === 'fail') {
    hints.push({
      level: 'medium',
      command: 'cwf verify-shell --cmd "..."',
      reason: 'Latest shell verification failed; re-run with a bounded command',
    });
  }
  if (payload.orchestration.active && payload.orchestration.status === 'blocked') {
    hints.push({
      level: 'medium',
      command: 'cwf team monitor',
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
