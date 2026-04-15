const REVIEW_SEVERITY_ORDER = Object.freeze({
  blocker: 4,
  must_fix: 3,
  should_fix: 2,
  nice_to_have: 1,
});

const AUDIT_SEVERITY_ORDER = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
});

function uniqueSorted(values) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))].sort();
}

function clamp01(value, fallback = 0.7) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function normalizeEvidence(value, fallback = []) {
  if (!value) {
    return uniqueSorted(fallback);
  }
  if (Array.isArray(value)) {
    return uniqueSorted(value);
  }
  return uniqueSorted([value]);
}

function normalizeFileRefs(primary, evidence = []) {
  return uniqueSorted([
    ...(primary ? [primary] : []),
    ...normalizeEvidence(evidence),
  ]);
}

function reviewConfidenceForSeverity(severity) {
  const normalized = String(severity || '').toLowerCase();
  if (normalized === 'blocker') {
    return 0.93;
  }
  if (normalized === 'must_fix') {
    return 0.87;
  }
  if (normalized === 'should_fix') {
    return 0.76;
  }
  return 0.62;
}

function normalizeReviewFinding(finding = {}) {
  const file = String(finding.file || '').trim();
  const category = String(finding.category || finding.classification || 'general').trim();
  const evidence = normalizeEvidence(finding.evidence, [file]);
  const fileRefs = normalizeFileRefs(file, finding.fileRefs || evidence);
  const payload = {
    ...finding,
    file,
    category,
    classification: category,
    whyFound: String(finding.whyFound || finding.detail || '').trim(),
    evidence,
    fileRefs,
    confidence: clamp01(finding.confidence, reviewConfidenceForSeverity(finding.severity)),
    suggestedNextAction: String(finding.suggestedNextAction || '').trim(),
    sourceMode: String(finding.sourceMode || 'review-mode').trim(),
    sourcePass: String(finding.sourcePass || finding.pass || '').trim(),
  };
  payload.fingerprint = findingFingerprint(payload);
  return payload;
}

function createReviewFinding({
  file,
  category,
  severity,
  title,
  detail,
  pass,
  evidence,
  confidence,
  whyFound,
  suggestedNextAction,
}) {
  return normalizeReviewFinding({
    file,
    category,
    severity,
    title,
    detail,
    pass,
    evidence,
    confidence,
    whyFound,
    suggestedNextAction,
    sourceMode: 'review-mode',
    sourcePass: pass,
  });
}

function normalizeAuditFinding(finding = {}) {
  const area = String(finding.area || 'repo').trim();
  const evidence = normalizeEvidence(finding.evidence);
  const fileRefs = normalizeFileRefs(area === 'repo' ? '' : area, finding.fileRefs || evidence);
  const payload = {
    ...finding,
    area,
    classification: String(finding.classification || 'probable').trim(),
    whyFound: String(finding.whyFound || finding.detail || '').trim(),
    evidence,
    fileRefs,
    confidence: clamp01(finding.confidence, 0.74),
    suggestedNextAction: String(finding.suggestedNextAction || '').trim(),
    sourceMode: String(finding.sourceMode || 'audit-repo').trim(),
  };
  payload.fingerprint = findingFingerprint(payload);
  return payload;
}

function createAuditFinding({
  classification,
  severity,
  title,
  detail,
  area,
  evidence,
  confidence,
  whyFound,
  suggestedNextAction,
}) {
  return normalizeAuditFinding({
    classification,
    severity,
    title,
    detail,
    area,
    evidence,
    confidence,
    whyFound,
    suggestedNextAction,
    sourceMode: 'audit-repo',
  });
}

function findingFingerprint(finding = {}) {
  const locus = String(finding.file || finding.area || 'repo').trim();
  const kind = String(finding.category || finding.classification || 'general').trim();
  const title = String(finding.title || '').trim();
  return [String(finding.sourceMode || '').trim(), locus, kind, title].join('::');
}

function normalizeFindingList(findings = [], mode = 'auto') {
  return (findings || []).map((finding) => {
    if (mode === 'review' || finding.file || finding.category) {
      return normalizeReviewFinding(finding);
    }
    return normalizeAuditFinding(finding);
  });
}

function compareFindingSeverity(left, right) {
  const leftValue = REVIEW_SEVERITY_ORDER[String(left.severity || '').toLowerCase()]
    || AUDIT_SEVERITY_ORDER[String(left.severity || '').toLowerCase()]
    || 0;
  const rightValue = REVIEW_SEVERITY_ORDER[String(right.severity || '').toLowerCase()]
    || AUDIT_SEVERITY_ORDER[String(right.severity || '').toLowerCase()]
    || 0;
  return rightValue - leftValue || right.confidence - left.confidence || String(left.title || '').localeCompare(String(right.title || ''));
}

function buildFindingReplay(previousFindings = [], currentFindings = []) {
  const previous = normalizeFindingList(previousFindings);
  const current = normalizeFindingList(currentFindings);
  const previousMap = new Map(previous.map((item) => [item.fingerprint, item]));
  const currentMap = new Map(current.map((item) => [item.fingerprint, item]));
  const resolved = [];
  const persistent = [];
  const introduced = [];
  const confidenceChanged = [];

  for (const [fingerprint, finding] of previousMap.entries()) {
    if (!currentMap.has(fingerprint)) {
      resolved.push(finding);
      continue;
    }
    const currentFinding = currentMap.get(fingerprint);
    persistent.push(currentFinding);
    if (Math.abs((currentFinding.confidence || 0) - (finding.confidence || 0)) >= 0.05) {
      confidenceChanged.push({
        fingerprint,
        previous: finding.confidence,
        current: currentFinding.confidence,
        title: currentFinding.title,
        area: currentFinding.area || currentFinding.file,
      });
    }
  }

  for (const [fingerprint, finding] of currentMap.entries()) {
    if (!previousMap.has(fingerprint)) {
      introduced.push(finding);
    }
  }

  return {
    resolved: resolved.sort(compareFindingSeverity),
    persistent: persistent.sort(compareFindingSeverity),
    introduced: introduced.sort(compareFindingSeverity),
    confidenceChanged,
  };
}

module.exports = {
  AUDIT_SEVERITY_ORDER,
  REVIEW_SEVERITY_ORDER,
  buildFindingReplay,
  compareFindingSeverity,
  createAuditFinding,
  createReviewFinding,
  findingFingerprint,
  normalizeAuditFinding,
  normalizeEvidence,
  normalizeFindingList,
  normalizeReviewFinding,
  uniqueSorted,
};
