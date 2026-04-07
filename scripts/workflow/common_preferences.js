const fileIo = require('./io/files');
const markdown = require('./markdown/sections');
const {
  parseBoolean,
  parseNumber,
} = require('./common_args');

function normalizeWorkflowProfile(value, fallback = 'standard') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['lite', 'standard', 'full'].includes(normalized) ? normalized : fallback;
}

function normalizeAutomationMode(value, fallback = 'manual') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['manual', 'phase', 'full'].includes(normalized) ? normalized : fallback;
}

function normalizeAutomationStatus(value, fallback = 'idle') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['idle', 'active', 'paused', 'handoff', 'complete'].includes(normalized) ? normalized : fallback;
}

function normalizeAutomationWindowPolicy(value, fallback = 'handoff_then_compact') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['handoff_then_compact', 'compact_then_continue'].includes(normalized) ? normalized : fallback;
}

function normalizeWorkflowMode(value, fallback = 'solo') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['solo', 'team'].includes(normalized) ? normalized : fallback;
}

function normalizeCommitGranularity(value, fallback = 'manual') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['manual', 'phase', 'chunk'].includes(normalized) ? normalized : fallback;
}

function normalizeTokenEfficiencyMeasures(value, fallback = 'auto') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['auto', 'on', 'off'].includes(normalized) ? normalized : fallback;
}

function normalizeReasoningProfile(value, fallback = 'balanced') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['fast', 'balanced', 'deep', 'critical'].includes(normalized) ? normalized : fallback;
}

function normalizePlanGateStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['pending', 'pass', 'fail'].includes(normalized) ? normalized : fallback;
}

function defaultReasoningProfileForStep(step, preferences = {}) {
  const normalizedStep = String(step || '').trim().toLowerCase();
  const discussMode = String(preferences.discussMode || '').trim().toLowerCase();

  if (['plan', 'audit', 'complete'].includes(normalizedStep)) {
    return 'deep';
  }

  if (normalizedStep === 'discuss' && discussMode === 'assumptions') {
    return 'balanced';
  }

  if (['research', 'execute'].includes(normalizedStep)) {
    return 'balanced';
  }

  return 'balanced';
}

function profileDefaultsFor(workflowProfile) {
  return {
    lite: {
      budgetProfile: 'lean',
      healthStrictRequired: false,
      tokenReserve: 6000,
      discussBudget: 4000,
      planBudget: 8000,
      auditBudget: 6000,
      compactionThreshold: 0.75,
      maxCanonicalRefsPerStep: 6,
      windowBudgetMode: 'estimated',
      windowSizeTokens: 128000,
      reserveFloorTokens: 12000,
      stopStartingNewWorkThreshold: 20000,
      mustHandoffThreshold: 10000,
      minimumNextStepBudget: 7000,
      compactionTarget: 0.5,
    },
    standard: {
      budgetProfile: 'normal',
      healthStrictRequired: false,
      tokenReserve: 8000,
      discussBudget: 6000,
      planBudget: 12000,
      auditBudget: 9000,
      compactionThreshold: 0.8,
      maxCanonicalRefsPerStep: 10,
      windowBudgetMode: 'estimated',
      windowSizeTokens: 128000,
      reserveFloorTokens: 16000,
      stopStartingNewWorkThreshold: 24000,
      mustHandoffThreshold: 12000,
      minimumNextStepBudget: 10000,
      compactionTarget: 0.55,
    },
    full: {
      budgetProfile: 'deep',
      healthStrictRequired: true,
      tokenReserve: 10000,
      discussBudget: 8000,
      planBudget: 16000,
      auditBudget: 12000,
      compactionThreshold: 0.8,
      maxCanonicalRefsPerStep: 14,
      windowBudgetMode: 'estimated',
      windowSizeTokens: 128000,
      reserveFloorTokens: 20000,
      stopStartingNewWorkThreshold: 30000,
      mustHandoffThreshold: 16000,
      minimumNextStepBudget: 14000,
      compactionTarget: 0.6,
    },
  }[workflowProfile] || {
    budgetProfile: 'normal',
    healthStrictRequired: false,
    tokenReserve: 8000,
    discussBudget: 6000,
    planBudget: 12000,
    auditBudget: 9000,
    compactionThreshold: 0.8,
    maxCanonicalRefsPerStep: 10,
    windowBudgetMode: 'estimated',
    windowSizeTokens: 128000,
    reserveFloorTokens: 16000,
    stopStartingNewWorkThreshold: 24000,
    mustHandoffThreshold: 12000,
    minimumNextStepBudget: 10000,
    compactionTarget: 0.55,
  };
}

function packetLoadingModeFor(preferences = {}) {
  const tokenEfficiencyMeasures = normalizeTokenEfficiencyMeasures(preferences.tokenEfficiencyMeasures, 'auto');

  if (tokenEfficiencyMeasures === 'on') {
    return 'delta';
  }

  if (tokenEfficiencyMeasures === 'off') {
    return 'continuity_first';
  }

  if (preferences.workflowProfile === 'full' || preferences.automationMode === 'phase' || preferences.automationMode === 'full') {
    return 'continuity_first';
  }

  return 'delta';
}

function readPlanGateStatus(paths) {
  const execplan = fileIo.readTextIfExists(paths.execplan);
  if (!execplan) {
    return 'pending';
  }

  return normalizePlanGateStatus(markdown.getFieldValue(execplan, 'Plan-ready gate'), 'pending');
}

function loadPreferences(paths) {
  const content = fileIo.readTextIfExists(paths.preferences);
  const statusContent = fileIo.readTextIfExists(paths.status);
  const contextContent = fileIo.readTextIfExists(paths.context);
  const milestone = String((statusContent && markdown.getFieldValue(statusContent, 'Current milestone')) || 'NONE').trim();
  const modeRaw = String((content && markdown.getFieldValue(content, 'Workflow mode')) || 'solo').trim();
  const mode = normalizeWorkflowMode(modeRaw, 'solo');
  const repoWorkflowProfileRaw = String((content && markdown.getFieldValue(content, 'Workflow profile')) || 'standard').trim();
  const repoWorkflowProfile = normalizeWorkflowProfile(repoWorkflowProfileRaw, 'standard');
  const milestoneProfileOverrideRaw = milestone !== 'NONE'
    ? String((contextContent && markdown.getFieldValue(contextContent, 'Milestone profile override')) || 'none').trim()
    : 'none';
  const milestoneProfileOverride = normalizeWorkflowProfile(milestoneProfileOverrideRaw, 'none');
  const workflowProfileRaw = milestoneProfileOverride === 'none'
    ? repoWorkflowProfileRaw
    : milestoneProfileOverrideRaw;
  const workflowProfile = milestoneProfileOverride === 'none'
    ? repoWorkflowProfile
    : milestoneProfileOverride;
  const repoAutomationModeRaw = String((content && markdown.getFieldValue(content, 'Automation mode')) || 'manual').trim();
  const repoAutomationMode = normalizeAutomationMode(repoAutomationModeRaw, 'manual');
  const milestoneAutomationModeRaw = milestone !== 'NONE'
    ? String((contextContent && markdown.getFieldValue(contextContent, 'Automation mode')) || repoAutomationModeRaw).trim()
    : repoAutomationModeRaw;
  const automationModeRaw = milestoneAutomationModeRaw || repoAutomationModeRaw;
  const automationMode = normalizeAutomationMode(automationModeRaw, repoAutomationMode);
  const automationStatusRaw = String(
    (statusContent && markdown.getFieldValue(statusContent, 'Automation status'))
    || (contextContent && markdown.getFieldValue(contextContent, 'Automation status'))
    || (automationMode === 'manual' ? 'idle' : 'active'),
  ).trim();
  const automationWindowPolicyRaw = String((content && markdown.getFieldValue(content, 'Automation window policy')) || 'handoff_then_compact').trim();
  const automationWindowPolicy = normalizeAutomationWindowPolicy(automationWindowPolicyRaw, 'handoff_then_compact');
  const tokenEfficiencyMeasuresRaw = String((content && markdown.getFieldValue(content, 'Token efficiency measures')) || 'auto').trim();
  const tokenEfficiencyMeasures = normalizeTokenEfficiencyMeasures(tokenEfficiencyMeasuresRaw, 'auto');
  const profileDefaults = profileDefaultsFor(workflowProfile);
  const modeDefaults = mode === 'team'
    ? {
      discussMode: 'assumptions',
      gitIsolation: 'branch',
      teamLiteDelegation: 'suggest',
      autoPush: false,
      autoCheckpoint: true,
      commitGranularity: 'phase',
      commitDocs: true,
      uniqueMilestoneIds: true,
      preMergeCheck: true,
    }
    : {
      discussMode: 'assumptions',
      gitIsolation: 'none',
      teamLiteDelegation: 'explicit_only',
      autoPush: true,
      autoCheckpoint: true,
      commitGranularity: 'manual',
      commitDocs: true,
      uniqueMilestoneIds: false,
      preMergeCheck: false,
    };
  const defaults = {
    ...modeDefaults,
    ...profileDefaults,
    healthStrictRequired: mode === 'team' ? true : profileDefaults.healthStrictRequired,
  };

  let gitIsolation = String((content && markdown.getFieldValue(content, 'Git isolation')) || defaults.gitIsolation).trim();
  let autoPush = parseBoolean(content && markdown.getFieldValue(content, 'Auto push'), defaults.autoPush);
  let uniqueMilestoneIds = parseBoolean(content && markdown.getFieldValue(content, 'Unique milestone ids'), defaults.uniqueMilestoneIds);
  let healthStrictRequired = parseBoolean(content && markdown.getFieldValue(content, 'Health strict required'), defaults.healthStrictRequired);

  if (mode === 'team') {
    gitIsolation = 'branch';
    autoPush = false;
    uniqueMilestoneIds = true;
    healthStrictRequired = true;
  }

  const packetLoadingMode = packetLoadingModeFor({
    workflowProfile,
    automationMode,
    tokenEfficiencyMeasures,
  });

  return {
    mode,
    modeRaw,
    milestone,
    workflowProfile,
    workflowProfileRaw,
    repoWorkflowProfile,
    repoWorkflowProfileRaw,
    milestoneProfileOverride,
    milestoneProfileOverrideRaw,
    discussMode: String((content && markdown.getFieldValue(content, 'Discuss mode')) || defaults.discussMode).trim(),
    repoAutomationMode,
    repoAutomationModeRaw,
    automationMode,
    automationModeRaw,
    milestoneAutomationMode: automationMode,
    milestoneAutomationModeRaw,
    automationStatus: normalizeAutomationStatus(automationStatusRaw, automationMode === 'manual' ? 'idle' : 'active'),
    automationWindowPolicy,
    automationWindowPolicyRaw,
    tokenEfficiencyMeasures,
    tokenEfficiencyMeasuresRaw,
    packetLoadingMode,
    gitIsolation,
    teamLiteDelegation: String((content && markdown.getFieldValue(content, 'Team Lite delegation')) || defaults.teamLiteDelegation).trim(),
    autoPush,
    autoCheckpoint: parseBoolean(content && markdown.getFieldValue(content, 'Auto checkpoint'), defaults.autoCheckpoint),
    commitGranularity: normalizeCommitGranularity(content && markdown.getFieldValue(content, 'Commit granularity'), defaults.commitGranularity),
    commitDocs: parseBoolean(content && markdown.getFieldValue(content, 'Commit docs'), defaults.commitDocs),
    uniqueMilestoneIds,
    preMergeCheck: parseBoolean(content && markdown.getFieldValue(content, 'Pre-merge check'), defaults.preMergeCheck),
    healthStrictRequired,
    budgetProfile: String((content && markdown.getFieldValue(content, 'Budget profile')) || defaults.budgetProfile).trim(),
    tokenReserve: parseNumber(content && markdown.getFieldValue(content, 'Token reserve'), defaults.tokenReserve),
    discussBudget: parseNumber(content && markdown.getFieldValue(content, 'Discuss budget'), defaults.discussBudget),
    planBudget: parseNumber(content && markdown.getFieldValue(content, 'Plan budget'), defaults.planBudget),
    auditBudget: parseNumber(content && markdown.getFieldValue(content, 'Audit budget'), defaults.auditBudget),
    compactionThreshold: parseNumber(content && markdown.getFieldValue(content, 'Compaction threshold'), defaults.compactionThreshold),
    maxCanonicalRefsPerStep: parseNumber(content && markdown.getFieldValue(content, 'Max canonical refs per step'), defaults.maxCanonicalRefsPerStep),
    windowBudgetMode: String((content && markdown.getFieldValue(content, 'Window budget mode')) || defaults.windowBudgetMode).trim(),
    windowSizeTokens: parseNumber(content && markdown.getFieldValue(content, 'Window size tokens'), defaults.windowSizeTokens),
    reserveFloorTokens: parseNumber(content && markdown.getFieldValue(content, 'Reserve floor tokens'), defaults.reserveFloorTokens),
    stopStartingNewWorkThreshold: parseNumber(content && markdown.getFieldValue(content, 'Stop-starting-new-work threshold'), defaults.stopStartingNewWorkThreshold),
    mustHandoffThreshold: parseNumber(content && markdown.getFieldValue(content, 'Must-handoff threshold'), defaults.mustHandoffThreshold),
    minimumNextStepBudget: parseNumber(content && markdown.getFieldValue(content, 'Minimum next-step budget'), defaults.minimumNextStepBudget),
    compactionTarget: parseNumber(content && markdown.getFieldValue(content, 'Compaction target'), defaults.compactionTarget),
  };
}

module.exports = {
  defaultReasoningProfileForStep,
  loadPreferences,
  normalizeAutomationMode,
  normalizeAutomationStatus,
  normalizeAutomationWindowPolicy,
  normalizePlanGateStatus,
  normalizeReasoningProfile,
  normalizeTokenEfficiencyMeasures,
  normalizeWorkflowMode,
  normalizeWorkflowProfile,
  packetLoadingModeFor,
  profileDefaultsFor,
  readPlanGateStatus,
};
