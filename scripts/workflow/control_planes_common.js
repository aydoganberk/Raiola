const fs = require('node:fs');
const path = require('node:path');
const { readJsonIfExists, runtimePath, writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const {
  ensureDir,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');

function reportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function exportsDir(cwd) {
  return path.join(cwd, '.workflow', 'exports');
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function setNestedValue(target, fieldPath, value) {
  const segments = String(fieldPath || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return value;
  }

  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
  return value;
}

function uniqueStrings(values = [], limit = 8) {
  return [...new Set((values || [])
    .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))]
    .slice(0, limit);
}

function compactList(values = [], limit = 6) {
  return uniqueStrings(values, limit);
}

function countBy(values = []) {
  return (values || []).reduce((counts, value) => {
    const key = String(value || '').trim() || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function riskLevelFromCounts(input = {}) {
  const fail = Number(input.fail || 0);
  const blockers = Number(input.blockers || 0);
  const warn = Number(input.warn || 0);
  const pendingApprovals = Number(input.pendingApprovals || 0);
  const verificationGaps = Number(input.verificationGaps || 0);
  const unsupportedClaims = Number(input.unsupportedClaims || 0);
  const trustLevel = String(input.trustLevel || 'standard').toLowerCase();

  let score = 0;
  score += fail * 4;
  score += blockers * 4;
  score += pendingApprovals * 2;
  score += verificationGaps * 2;
  score += unsupportedClaims * 3;
  score += warn;
  if (trustLevel === 'strict') {
    score += 1;
  }
  if (score >= 8) {
    return 'high';
  }
  if (score >= 3) {
    return 'medium';
  }
  return 'low';
}

function readinessVerdict(input = {}) {
  const riskLevel = String(input.riskLevel || '').toLowerCase();
  const fail = Number(input.fail || 0);
  const blockers = Number(input.blockers || 0);
  const pendingApprovals = Number(input.pendingApprovals || 0);
  const verificationGaps = Number(input.verificationGaps || 0);
  if (fail > 0 || blockers > 0 || riskLevel === 'high') {
    return 'hold';
  }
  if (pendingApprovals > 0 || verificationGaps > 0 || riskLevel === 'medium') {
    return 'needs-attention';
  }
  return 'ready';
}

function writePlaneArtifacts(cwd, stem, payload, markdown, options = {}) {
  const reportRoot = options.dir === 'runtime' ? path.join(cwd, '.workflow', 'runtime') : reportsDir(cwd);
  ensureDir(reportRoot);
  const jsonPath = path.join(reportRoot, `${stem}.json`);
  const markdownPath = path.join(reportRoot, `${stem}.md`);
  const artifacts = {
    json: relativePath(cwd, jsonPath),
    markdown: relativePath(cwd, markdownPath),
  };
  if (options.runtimeMirror) {
    artifacts.runtimeJson = relativePath(cwd, runtimePath(cwd, `${stem}.json`));
    artifacts.runtimeMarkdown = relativePath(cwd, runtimePath(cwd, `${stem}.md`));
  }
  if (payload && typeof payload === 'object') {
    setNestedValue(payload, options.attachPath || 'artifacts', artifacts);
  }
  writeIfChanged(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeIfChanged(markdownPath, `${String(markdown || '').trimEnd()}\n`);
  if (options.runtimeMirror) {
    writeRuntimeJson(cwd, `${stem}.json`, payload);
    writeRuntimeMarkdown(cwd, `${stem}.md`, markdown);
  }
  return artifacts;
}

function writeExportFile(cwd, name, content) {
  const filePath = path.join(exportsDir(cwd), name);
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${String(content || '').trimEnd()}\n`);
  return {
    path: filePath,
    relative: relativePath(cwd, filePath),
  };
}

function latestFileTimestamp(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

module.exports = {
  compactList,
  countBy,
  exportsDir,
  latestFileTimestamp,
  readJson,
  readinessVerdict,
  relativePath,
  reportsDir,
  riskLevelFromCounts,
  uniqueStrings,
  writeExportFile,
  writePlaneArtifacts,
};
