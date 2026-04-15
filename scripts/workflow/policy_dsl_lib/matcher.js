const path = require('node:path');
const { DECISION_WEIGHTS } = require('./constants');

function valueMatches(expected, actual) {
  const normalizedActual = String(actual || '');
  const normalizedExpected = String(expected || '');

  if (!normalizedExpected || normalizedExpected === '*') {
    return true;
  }

  if (normalizedExpected.startsWith('/') && normalizedExpected.endsWith('/')) {
    try {
      return new RegExp(normalizedExpected.slice(1, -1)).test(normalizedActual);
    } catch {
      return false;
    }
  }

  if (normalizedExpected.includes('*')) {
    const escaped = normalizedExpected
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(normalizedActual);
  }

  return normalizedActual.toLowerCase() === normalizedExpected.toLowerCase();
}

function matchRule(rule, context) {
  if (!valueMatches(rule.operation, context.operation)) {
    return false;
  }

  return Object.entries(rule.filters || {})
    .every(([key, value]) => valueMatches(value, context[key]));
}

function strongestRule(matches) {
  return [...matches]
    .sort((left, right) => {
      const weightDelta = (DECISION_WEIGHTS[right.decision] || 0) - (DECISION_WEIGHTS[left.decision] || 0);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      return left.line - right.line;
    })[0] || null;
}

function resolveDslDecision(dsl, context) {
  const matchedRules = dsl.rules.filter((rule) => matchRule(rule, context));
  const matchingGrants = dsl.grants
    .filter((grant) => (
      valueMatches(grant.target, context.file)
      || valueMatches(grant.target, context.domain)
      || valueMatches(grant.target, context.operation)
    ))
    .map((grant) => ({
      line: grant.line,
      target: grant.target,
      reason: grant.reason,
      source: grant.source,
    }));
  const strongest = strongestRule(matchedRules);

  return {
    file: path.relative(context.cwd, dsl.filePath).replace(/\\/g, '/'),
    issues: dsl.issues || [],
    matchedRules: matchedRules.map((rule) => ({
      line: rule.line,
      decision: rule.decision,
      operation: rule.operation,
      filters: rule.filters,
      note: rule.note,
      source: rule.source,
    })),
    grants: matchingGrants,
    strongestDecision: strongest ? strongest.decision : null,
    strongestRule: strongest
      ? {
        line: strongest.line,
        source: strongest.source,
        note: strongest.note,
      }
      : null,
  };
}

module.exports = {
  matchRule,
  resolveDslDecision,
  strongestRule,
  valueMatches,
};
