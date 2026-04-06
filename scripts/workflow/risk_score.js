const HIGH_SIGNAL_PATTERNS = [
  /\bsecurity\b/i,
  /\bship\b/i,
  /\bexecute\/audit\b/i,
  /\bplan gate\b/i,
  /\bapproval\b/i,
  /\bclaim\b/i,
  /\bevidence\b/i,
  /\bhash\b/i,
  /\bstale\b/i,
  /\bdestructive\b/i,
  /\brollback\b/i,
];

const LOW_SIGNAL_PATTERNS = [
  /\bversion marker\b/i,
  /\bskill surface\b/i,
  /\bworkstreams\b/i,
  /\bagents size\b/i,
];

function impactForCheck(check) {
  const status = String(check?.status || '').toLowerCase();
  if (status === 'pass') {
    return 0;
  }

  let impact = status === 'fail' ? 24 : 7;
  const message = String(check?.message || '');

  if (HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(message))) {
    impact += status === 'fail' ? 8 : 4;
  }
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(message))) {
    impact = Math.max(1, impact - 3);
  }

  return impact;
}

function levelForScore(score) {
  if (score <= 35) {
    return 'critical';
  }
  if (score <= 60) {
    return 'high';
  }
  if (score <= 82) {
    return 'medium';
  }
  return 'low';
}

function statusForLevel(level, failCount, warnCount) {
  if (failCount > 0) {
    return level === 'critical' ? 'blocking' : 'attention';
  }
  if (warnCount > 0) {
    return 'watch';
  }
  return 'healthy';
}

function buildRiskSummary(checks = []) {
  const factors = checks
    .filter((check) => String(check?.status || '').toLowerCase() !== 'pass')
    .map((check) => ({
      status: check.status,
      message: check.message,
      impact: impactForCheck(check),
    }))
    .sort((left, right) => right.impact - left.impact || String(left.message).localeCompare(String(right.message)));

  const failCount = factors.filter((factor) => String(factor.status).toLowerCase() === 'fail').length;
  const warnCount = factors.filter((factor) => String(factor.status).toLowerCase() === 'warn').length;
  const score = Math.max(0, 100 - factors.reduce((sum, factor) => sum + factor.impact, 0));
  const level = levelForScore(score);

  return {
    score,
    level,
    status: statusForLevel(level, failCount, warnCount),
    failCount,
    warnCount,
    factors: factors.slice(0, 5),
  };
}

module.exports = {
  buildRiskSummary,
};
