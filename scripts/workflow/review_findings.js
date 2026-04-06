const SEVERITY_ORDER = Object.freeze({
  blocker: 4,
  must_fix: 3,
  should_fix: 2,
  nice_to_have: 1,
});

function severityScore(severity) {
  return SEVERITY_ORDER[String(severity || '').toLowerCase()] || 1;
}

function findingsBySeverity(findings) {
  return [...findings].sort((left, right) => (
    severityScore(right.severity) - severityScore(left.severity)
      || left.category.localeCompare(right.category)
      || left.file.localeCompare(right.file)
  ));
}

function heatmapFromFindings(files, findings) {
  const grouped = new Map(files.map((file) => [file.file, {
    file: file.file,
    added: file.added,
    deleted: file.deleted,
    categories: [],
    severityScore: 0,
    findings: 0,
  }]));

  for (const finding of findings) {
    const bucket = grouped.get(finding.file) || {
      file: finding.file,
      added: 0,
      deleted: 0,
      categories: [],
      severityScore: 0,
      findings: 0,
    };
    if (!bucket.categories.includes(finding.category)) {
      bucket.categories.push(finding.category);
    }
    bucket.severityScore += severityScore(finding.severity);
    bucket.findings += 1;
    grouped.set(finding.file, bucket);
  }

  return [...grouped.values()]
    .sort((left, right) => right.severityScore - left.severityScore || right.findings - left.findings || left.file.localeCompare(right.file));
}

function blockersFromFindings(findings) {
  return findings.filter((finding) => severityScore(finding.severity) >= severityScore('must_fix'));
}

module.exports = {
  blockersFromFindings,
  findingsBySeverity,
  heatmapFromFindings,
  severityScore,
};
