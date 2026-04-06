const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { baseLifecycleContext } = require('./lifecycle_common');
const { blockersFromFindings, findingsBySeverity, heatmapFromFindings, severityScore } = require('./review_findings');
const { buildUiReview } = require('./ui_review');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function reviewReportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function reviewHistoryPath(cwd) {
  return path.join(reviewReportsDir(cwd), 'review-history.json');
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function runGit(cwd, args) {
  const result = childProcess.spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout || '';
}

function loadDiff(cwd, options = {}) {
  if (options.diffFile) {
    return fs.readFileSync(path.resolve(cwd, options.diffFile), 'utf8');
  }
  if (options.range) {
    return runGit(cwd, ['diff', '--no-ext-diff', options.range]);
  }
  if (options.files.length > 0) {
    return runGit(cwd, ['diff', '--no-ext-diff', '--', ...options.files]);
  }
  if (options.staged) {
    return runGit(cwd, ['diff', '--cached', '--no-ext-diff']);
  }
  return runGit(cwd, ['diff', '--no-ext-diff']);
}

function parseDiff(diffText) {
  const files = [];
  let current = null;
  for (const rawLine of String(diffText || '').split('\n')) {
    const line = rawLine.trimEnd();
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      current = {
        file: fileMatch[2],
        oldFile: fileMatch[1],
        added: 0,
        deleted: 0,
        hunks: [],
        addedLines: [],
        deletedLines: [],
      };
      files.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('@@')) {
      current.hunks.push(line);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.added += 1;
      current.addedLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      current.deleted += 1;
      current.deletedLines.push(line.slice(1));
    }
  }
  return files;
}

function fileCategory(filePath) {
  if (/package\.json$|lock\.json$|lock\.yaml$|lock$/.test(filePath)) {
    return 'dependency';
  }
  if (/\.(test|spec)\.[^.]+$/.test(filePath) || /(^|\/)(test|tests|__tests__)\//.test(filePath)) {
    return 'test';
  }
  if (/\.(tsx|jsx|css|scss|sass)$/.test(filePath)) {
    return 'frontend';
  }
  if (/docs\/workflow\//.test(filePath)) {
    return 'workflow';
  }
  return 'source';
}

function createFinding(file, category, severity, title, detail, pass) {
  return {
    file,
    category,
    severity,
    title,
    detail,
    pass,
  };
}

function runPasses(files, context) {
  const findings = [];
  const sourceFiles = files.filter((file) => ['source', 'frontend', 'dependency'].includes(fileCategory(file.file)));
  const testFiles = files.filter((file) => fileCategory(file.file) === 'test');

  for (const file of files) {
    const category = fileCategory(file.file);
    if (category === 'dependency') {
      findings.push(createFinding(
        file.file,
        'regression',
        'should_fix',
        'Dependency or package contract changed',
        'Dependency-level diffs deserve an explicit compatibility and verification note.',
        'fast-triage',
      ));
    }
    if (category === 'frontend' && !context.browserEvidencePresent) {
      findings.push(createFinding(
        file.file,
        'frontend ux/a11y',
        'should_fix',
        'Frontend diff lacks browser evidence',
        'UI changes are present but no browser or screenshot evidence was found in the current workflow state.',
        'fast-triage',
      ));
    }
    if (file.addedLines.some((line) => /\b(console\.log|debugger)\b/.test(line)) && category !== 'test') {
      findings.push(createFinding(
        file.file,
        'maintainability',
        'nice_to_have',
        'Debug logging remains in non-test code',
        'The diff adds debug logging or debugger statements that should be removed before ship.',
        'semantic-correctness',
      ));
    }
    if (file.addedLines.some((line) => /\b(TODO|FIXME|XXX)\b/.test(line))) {
      findings.push(createFinding(
        file.file,
        'maintainability',
        'should_fix',
        'New TODO/FIXME introduced',
        'The diff adds a TODO/FIXME marker; capture the follow-up explicitly or finish the work in this slice.',
        'semantic-correctness',
      ));
    }
    if (file.addedLines.some((line) => /\b(secret|token|password|credential)\b/i.test(line))) {
      findings.push(createFinding(
        file.file,
        'security',
        'must_fix',
        'Sensitive configuration changed',
        'The diff touches secret-like strings or credential-sensitive code; confirm no secrets are hard-coded and update the verification plan.',
        'architecture-security',
      ));
    }
    if (file.addedLines.some((line) => /\b(readFileSync|readdirSync|statSync)\b/.test(line)) && /scripts\/workflow\//.test(file.file)) {
      findings.push(createFinding(
        file.file,
        'performance',
        'should_fix',
        'Sync filesystem call added on a workflow hot path',
        'A workflow script diff adds sync filesystem operations; verify this is outside hot paths or document the performance tradeoff.',
        'architecture-security',
      ));
    }
    if (file.added + file.deleted >= 160) {
      findings.push(createFinding(
        file.file,
        'architecture',
        'should_fix',
        'Large diff in a single file',
        'This file carries a large change surface; splitting or adding focused verification would reduce review risk.',
        'architecture-security',
      ));
    }
  }

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    findings.push(createFinding(
      sourceFiles[0].file,
      'test gap',
      'must_fix',
      'Source changes landed without test coverage deltas',
      'Code changed but no test files changed in the same diff. Add tests or record why existing coverage is sufficient.',
      'verify-gap',
    ));
  }

  if (context.validationRows.length === 0) {
    findings.push(createFinding(
      context.touchedFiles[0] || 'docs/workflow/VALIDATION.md',
      'test gap',
      'should_fix',
      'Validation contract is thin or missing',
      'The workflow validation contract is empty, so review confidence and ship readiness are lower than they should be.',
      'verify-gap',
    ));
  }

  return findingsBySeverity(findings);
}

function buildReplay(previousFindings, currentFindings) {
  const previousMap = new Map(previousFindings.map((item) => [`${item.file}:${item.title}`, item]));
  const currentMap = new Map(currentFindings.map((item) => [`${item.file}:${item.title}`, item]));
  const resolved = [];
  const persistent = [];
  const introduced = [];

  for (const [key, finding] of previousMap.entries()) {
    if (!currentMap.has(key)) {
      resolved.push(finding);
    } else {
      persistent.push(currentMap.get(key));
    }
  }
  for (const [key, finding] of currentMap.entries()) {
    if (!previousMap.has(key)) {
      introduced.push(finding);
    }
  }

  return {
    resolved,
    persistent,
    introduced,
  };
}

function renderMarkdownReport(payload) {
  return `# REVIEW READY

- Mode: \`${payload.mode}\`
- Ship readiness: \`${payload.outcome.shipReadiness}\`
- Confidence: \`${payload.outcome.confidence}\`
- Files reviewed: \`${payload.files.length}\`
- Findings: \`${payload.findings.length}\`
- Blockers: \`${payload.blockers.length}\`

## Multi-pass Summary

- \`pass 1\` fast triage
- \`pass 2\` semantic correctness
- \`pass 3\` architecture/performance/security
- \`pass 4\` verify/test gap

## Findings

${payload.findings.length > 0
    ? payload.findings.map((finding) => `- [${finding.severity}] \`${finding.category}\` ${finding.file}: ${finding.title} — ${finding.detail}`).join('\n')
    : '- `No review findings were raised by the current heuristics.`'}

## Risk Heatmap

${payload.heatmap.length > 0
    ? payload.heatmap.slice(0, 10).map((item) => `- \`${item.file}\` severity=${item.severityScore} findings=${item.findings} categories=${item.categories.join(', ') || 'none'}`).join('\n')
    : '- `No changed files were available for heatmap generation.`'}

## Blockers

${payload.blockers.length > 0
    ? payload.blockers.map((finding) => `- \`${finding.file}\` ${finding.title}`).join('\n')
    : '- `No blocker or must-fix items were found.`'}
`;
}

function renderBlockersMarkdown(payload) {
  return `# REVIEW BLOCKERS

${payload.blockers.length > 0
    ? payload.blockers.map((finding) => `- [${finding.severity}] \`${finding.file}\` ${finding.title}: ${finding.detail}`).join('\n')
    : '- `No blockers were identified.`'}
`;
}

function renderPatchSuggestions(payload) {
  return payload.findings.map((finding) => ({
    file: finding.file,
    severity: finding.severity,
    suggestion: finding.category === 'test gap'
      ? 'Add or extend focused tests for the changed behavior.'
      : finding.category === 'frontend ux/a11y'
        ? 'Capture browser evidence and audit empty/loading/error/success states.'
        : finding.category === 'security'
          ? 'Remove or externalize sensitive values and add an explicit security note.'
          : 'Tighten the diff and add verification or documentation for the risk.',
  }));
}

async function runReviewEngine(cwd, rootDir, options = {}) {
  const context = baseLifecycleContext(cwd, rootDir);
  const diffText = loadDiff(cwd, {
    diffFile: options.diffFile,
    range: options.range,
    staged: options.staged,
    files: options.files || [],
  });
  const files = parseDiff(diffText);
  const browserEvidencePresent = fs.existsSync(path.join(cwd, '.workflow', 'verifications', 'browser'));
  const findings = runPasses(files, {
    ...context,
    browserEvidencePresent,
  });
  const heatmap = heatmapFromFindings(files, findings);
  const blockers = blockersFromFindings(findings);
  const outcome = {
    confidence: Number((Math.max(0.45, Math.min(0.98, 0.62 + (files.length * 0.02) - (blockers.length * 0.05))).toFixed(2))),
    severityWeightedScore: findings.reduce((sum, finding) => sum + severityScore(finding.severity), 0),
    shipReadiness: blockers.length > 0 ? 'blocked' : findings.length > 0 ? 'needs_follow_up' : 'ready',
  };

  const previousHistory = readJson(reviewHistoryPath(cwd), {
    runs: [],
  });
  const replay = buildReplay(previousHistory.runs[0]?.findings || [], findings);
  const frontendTouched = files.some((file) => fileCategory(file.file) === 'frontend');
  const uiReview = frontendTouched
    ? await buildUiReview(cwd, rootDir, {})
    : null;

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: options.mode || 'review',
    context: {
      milestone: context.milestone,
      step: context.step,
      workflowRootRelative: context.workflowRootRelative,
    },
    files,
    findings,
    heatmap,
    blockers,
    replay,
    outcome,
    patchSuggestions: renderPatchSuggestions({ findings }),
    uiReview,
  };

  const reportsDir = reviewReportsDir(cwd);
  fs.mkdirSync(reportsDir, { recursive: true });
  const markdownPath = path.join(reportsDir, 'review.md');
  const findingsPath = path.join(reportsDir, 'review-findings.json');
  const heatmapPath = path.join(reportsDir, 'risk-heatmap.json');
  const blockersPath = path.join(reportsDir, 'review-blockers.md');
  const replayPath = path.join(reportsDir, 'review-replay.json');
  const suggestionsPath = path.join(reportsDir, 'review-patch-suggestions.json');
  fs.writeFileSync(markdownPath, `${renderMarkdownReport(payload).trimEnd()}\n`);
  writeJson(findingsPath, payload.findings);
  writeJson(heatmapPath, payload.heatmap);
  fs.writeFileSync(blockersPath, `${renderBlockersMarkdown(payload).trimEnd()}\n`);
  writeJson(replayPath, payload.replay);
  writeJson(suggestionsPath, payload.patchSuggestions);
  writeJson(reviewHistoryPath(cwd), {
    generatedAt: payload.generatedAt,
    runs: [
      {
        at: payload.generatedAt,
        mode: payload.mode,
        findings: payload.findings,
      },
      ...(previousHistory.runs || []),
    ].slice(0, 10),
  });

  payload.artifacts = {
    markdown: relativePath(cwd, markdownPath),
    findings: relativePath(cwd, findingsPath),
    heatmap: relativePath(cwd, heatmapPath),
    blockers: relativePath(cwd, blockersPath),
    replay: relativePath(cwd, replayPath),
    patchSuggestions: relativePath(cwd, suggestionsPath),
  };
  payload.outputPath = markdownPath;
  payload.outputPathRelative = payload.artifacts.markdown;

  return payload;
}

module.exports = {
  runReviewEngine,
};
