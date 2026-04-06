const PROFILES = Object.freeze([
  {
    id: 'implement-fast',
    mode: 'implement',
    reasoningEffort: 'medium',
    contextDepth: 'delta',
    subagentPolicy: 'off',
    verifyPolicy: 'standard',
    costBudget: 'small',
    riskBudget: 'medium',
    preset: 'fast',
    summary: 'Fastest safe default for narrow implementation slices.',
  },
  {
    id: 'implement-deep',
    mode: 'implement',
    reasoningEffort: 'high',
    contextDepth: 'focused',
    subagentPolicy: 'bounded',
    verifyPolicy: 'standard',
    costBudget: 'medium',
    riskBudget: 'medium',
    preset: 'balanced',
    summary: 'Use for larger implementation or refactor work that still fits one operator.',
  },
  {
    id: 'review-deep',
    mode: 'review',
    reasoningEffort: 'high',
    contextDepth: 'focused',
    subagentPolicy: 'parallel_readonly',
    verifyPolicy: 'strict',
    costBudget: 'medium',
    riskBudget: 'high',
    preset: 'deep',
    summary: 'Bias toward bug finding, regression detection, and test-gap detection.',
  },
  {
    id: 'frontend-ship',
    mode: 'frontend',
    reasoningEffort: 'high',
    contextDepth: 'focused',
    subagentPolicy: 'bounded',
    verifyPolicy: 'strict',
    costBudget: 'medium',
    riskBudget: 'high',
    preset: 'balanced',
    summary: 'Specialized for UI implementation plus browser and scorecard evidence.',
  },
  {
    id: 'monorepo-delta',
    mode: 'refactor',
    reasoningEffort: 'medium',
    contextDepth: 'delta',
    subagentPolicy: 'bounded',
    verifyPolicy: 'standard',
    costBudget: 'medium',
    riskBudget: 'medium',
    preset: 'balanced',
    summary: 'Favor package-scoped context and delta-only execution in large repos.',
  },
  {
    id: 'incident-fast',
    mode: 'incident',
    reasoningEffort: 'medium',
    contextDepth: 'minimal',
    subagentPolicy: 'off',
    verifyPolicy: 'strict',
    costBudget: 'small',
    riskBudget: 'high',
    preset: 'fast',
    summary: 'Optimize for urgent triage, containment, and quick verification.',
  },
  {
    id: 'gpt54-extra-high',
    mode: 'research',
    reasoningEffort: 'extra_high',
    contextDepth: 'full',
    subagentPolicy: 'hybrid',
    verifyPolicy: 'strict',
    costBudget: 'large',
    riskBudget: 'high',
    preset: 'deep',
    summary: 'Use for ambiguous, high-risk, or architecture-heavy work.',
  },
]);

function getCodexProfiles() {
  return PROFILES.map((profile) => ({ ...profile }));
}

function findProfile(profileId) {
  return PROFILES.find((profile) => profile.id === profileId) || null;
}

function selectCodexProfile(input = {}) {
  const analysis = input.analysis || {};
  const chosen = analysis.chosenCapability || {};
  const repoSignals = analysis.repoSignals || {};
  const reasons = [];
  let selected = findProfile('implement-fast');

  if (chosen.domain === 'review' || analysis.intent?.review) {
    selected = findProfile('review-deep');
    reasons.push('Review lane was selected, so the profile shifts to deeper semantic review.');
  } else if (chosen.domain === 'frontend' || repoSignals.frontendActive) {
    selected = findProfile('frontend-ship');
    reasons.push('Frontend signals are active, so browser-backed verification and UI depth are preferred.');
  } else if (chosen.domain === 'incident' || analysis.intent?.incident) {
    selected = findProfile('incident-fast');
    reasons.push('Incident-style language was detected, so fast triage with strict verification wins.');
  } else if (repoSignals.monorepo && ['execute', 'plan'].includes(chosen.domain)) {
    selected = findProfile('monorepo-delta');
    reasons.push('Monorepo signals are active, so delta-focused context packing is preferred.');
  } else if (analysis.risk?.high || analysis.confidence < 0.6) {
    selected = findProfile('gpt54-extra-high');
    reasons.push('Risk is high or routing confidence is low, so the deepest profile is safer.');
  } else if (chosen.domain === 'research' || chosen.domain === 'plan') {
    selected = findProfile('implement-deep');
    reasons.push('Research/plan work benefits from richer context without going full extra-high.');
  } else if (analysis.intent?.implement || analysis.intent?.verify) {
    selected = findProfile('implement-fast');
    reasons.push('Implementation is the hot path, so a fast profile keeps momentum high.');
  }

  if (!reasons.length) {
    reasons.push('Default implementation profile selected because no stronger trigger was present.');
  }

  return {
    ...selected,
    reasons,
  };
}

module.exports = {
  findProfile,
  getCodexProfiles,
  selectCodexProfile,
};
