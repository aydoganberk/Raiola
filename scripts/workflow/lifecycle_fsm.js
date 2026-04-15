const STATES = ['discuss', 'plan', 'execute', 'audit', 'closeout'];

const TRANSITIONS = {
  discuss: ['plan'],
  plan: ['execute', 'discuss'],
  execute: ['audit', 'plan'],
  audit: ['closeout', 'execute', 'plan'],
  closeout: [],
};

function normalizeState(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return STATES.includes(candidate) ? candidate : 'discuss';
}

function buildGuards(context = {}) {
  return {
    scopeReady: Boolean(context.scopeReady || context.hasGoal || context.hasValidation),
    planReady: Boolean(context.hasPlan && context.hasValidation),
    executionReady: Boolean(context.hasExecutionEvidence || context.hasCodeChanges || context.hasCheckpoint),
    auditReady: Boolean(context.hasVerification && !context.hasBlockingFailures),
  };
}

function transitionAllowed(current, next, guards) {
  if (!TRANSITIONS[current] || !TRANSITIONS[current].includes(next)) {
    return {
      allowed: false,
      reason: `Invalid transition from ${current} to ${next}.`,
    };
  }
  if (current === 'discuss' && next === 'plan' && !guards.scopeReady) {
    return { allowed: false, reason: 'Discuss cannot advance to plan until scope/goal is explicit.' };
  }
  if (current === 'plan' && next === 'execute' && !guards.planReady) {
    return { allowed: false, reason: 'Plan cannot advance to execute without plan and validation contract.' };
  }
  if (current === 'execute' && next === 'audit' && !guards.executionReady) {
    return { allowed: false, reason: 'Execute cannot advance to audit without evidence, code changes, or checkpoint.' };
  }
  if (current === 'audit' && next === 'closeout' && !guards.auditReady) {
    return { allowed: false, reason: 'Audit cannot advance to closeout until verification passes and blockers are clear.' };
  }
  return { allowed: true, reason: '' };
}

function evaluateLifecycleState(input = {}) {
  const current = normalizeState(input.current || input.step);
  const guards = buildGuards(input);
  const transitions = (TRANSITIONS[current] || []).map((next) => {
    const verdict = transitionAllowed(current, next, guards);
    return {
      next,
      allowed: verdict.allowed,
      reason: verdict.reason,
    };
  });
  const recommended = transitions.find((entry) => entry.allowed)?.next || current;
  return {
    type: 'LifecycleStateMachine',
    current,
    guards,
    validTransitions: transitions.filter((entry) => entry.allowed).map((entry) => entry.next),
    blockedTransitions: transitions.filter((entry) => !entry.allowed),
    recommendedNext: recommended,
    impossibleState: current === 'closeout' && !guards.auditReady,
  };
}

module.exports = {
  STATES,
  TRANSITIONS,
  buildGuards,
  evaluateLifecycleState,
  normalizeState,
  transitionAllowed,
};
