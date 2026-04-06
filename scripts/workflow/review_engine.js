const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { baseLifecycleContext } = require('./lifecycle_common');
const { blockersFromFindings, findingsBySeverity, heatmapFromFindings, severityScore } = require('./review_findings');
const { buildUiReview } = require('./ui_review');
const { buildPackageGraph } = require('./package_graph');
const { buildSemanticAnalysis } = require('./review_semantic');
const { buildSymbolGraph, findSymbolMatches } = require('./symbol_graph');

const REVIEW_PERSONAS = Object.freeze([
  {
    id: 'correctness',
    label: 'correctness reviewer',
    categories: ['correctness', 'API drift', 'test gap', 'data/migration'],
    fileKinds: ['source', 'frontend'],
    focus: 'Behavioral regressions, contract drift, and missing coverage.',
  },
  {
    id: 'performance',
    label: 'perf reviewer',
    categories: ['performance'],
    fileKinds: ['source', 'dependency'],
    focus: 'Hot-path cost, sync I/O, and broad-diff regressions.',
  },
  {
    id: 'security',
    label: 'security reviewer',
    categories: ['security', 'data/migration'],
    fileKinds: ['source', 'dependency'],
    focus: 'Secrets, risky data changes, and release safety.',
  },
  {
    id: 'architecture',
    label: 'architecture reviewer',
    categories: ['architecture', 'API drift', 'dependency'],
    fileKinds: ['source', 'dependency'],
    focus: 'Change surface width, boundaries, and package-level drift.',
  },
  {
    id: 'frontend',
    label: 'frontend reviewer',
    categories: ['frontend ux/a11y'],
    fileKinds: ['frontend'],
    focus: 'Visual evidence, state coverage, and interaction quality.',
  },
  {
    id: 'dx',
    label: 'DX reviewer',
    categories: ['maintainability', 'dependency', 'test gap'],
    fileKinds: ['source', 'frontend', 'dependency'],
    focus: 'Debug residue, TODO debt, and operator friction.',
  },
]);

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
  if (options.diffText) {
    return String(options.diffText);
  }
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

function isMigrationFile(filePath, file) {
  return /(^|\/)(migrations?|prisma\/migrations|db\/migrate|database\/migrations)\//.test(filePath)
    || /\.(sql|prisma)$/i.test(filePath)
    || [...(file.addedLines || []), ...(file.deletedLines || [])].some((line) => /\b(create table|alter table|drop table|create index|drop index)\b/i.test(line));
}

function isApiSurface(filePath, file) {
  if (/(^|\/)(app\/api|api|routes?|controllers?)\//.test(filePath) || /(route|controller|handler|schema)\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return true;
  }
  return [...(file.addedLines || []), ...(file.deletedLines || [])].some((line) => (
    /\b(export async function (GET|POST|PUT|PATCH|DELETE)|router\.(get|post|put|patch|delete)|app\.(get|post|put|patch|delete)|graphql|openapi)\b/i.test(line)
  ));
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

function semanticSignalSummary(filePath, analysis) {
  return {
    file: filePath,
    source: analysis.source,
    removedExports: analysis.diff.removedExports,
    addedExports: analysis.diff.addedExports,
    changedSignatures: analysis.diff.changedSignatures,
    removedRouteHandlers: analysis.diff.removedRouteHandlers,
    addedRouteHandlers: analysis.diff.addedRouteHandlers,
    authSignalsDropped: analysis.diff.authSignalsDropped,
    errorSignalsDropped: analysis.diff.errorSignalsDropped,
    accessibilitySignalsAdded: analysis.diff.addedImageAltIssues || analysis.diff.addedButtonLabelIssues,
  };
}

function semanticFindingsForFile(cwd, file, symbolGraph) {
  const findings = [];
  const analysis = buildSemanticAnalysis(cwd, file);
  const diff = analysis.diff;
  const details = [];
  if (diff.removedExports.length > 0) {
    details.push(`removed exports: ${diff.removedExports.join(', ')}`);
  }
  if (diff.changedSignatures.length > 0) {
    details.push(`changed signatures: ${diff.changedSignatures.join(', ')}`);
  }
  if (diff.addedRouteHandlers.length > 0 || diff.removedRouteHandlers.length > 0) {
    details.push(`route handlers changed: +${diff.addedRouteHandlers.join(', ') || 'none'} -${diff.removedRouteHandlers.join(', ') || 'none'}`);
  }

  if (details.length > 0) {
    const impactedCallers = uniqueSorted([
      ...diff.removedExports.flatMap((symbol) => findSymbolMatches(symbolGraph, symbol).importers),
      ...diff.changedSignatures.flatMap((symbol) => findSymbolMatches(symbolGraph, symbol).references),
    ]).filter((entry) => entry !== file.file).slice(0, 4);
    findings.push(createFinding(
      file.file,
      'correctness',
      'should_fix',
      'Public behavior changed in a semantically meaningful way',
      `${details.join('; ')}.${impactedCallers.length > 0 ? ` Likely downstream files: ${impactedCallers.join(', ')}.` : ''}`,
      'semantic-contract',
    ));
  }

  if (diff.authSignalsDropped && file.deletedLines.some((line) => /\b(auth|session|permission|authorize|middleware)\b/i.test(line))) {
    findings.push(createFinding(
      file.file,
      'security',
      'must_fix',
      'Auth or permission guard appears to be reduced',
      'Authentication or authorization-related signals decreased across the diff. Confirm this was intentional and preserve route or component guards.',
      'semantic-security',
    ));
  }

  if (diff.errorSignalsDropped && [...file.addedLines, ...file.deletedLines].some((line) => /\b(fetch|await|Response\.json|db\.|query|mutation)\b/.test(line))) {
    findings.push(createFinding(
      file.file,
      'correctness',
      'should_fix',
      'Error-handling signals decreased on an active code path',
      'The diff appears to remove error-handling cues while keeping async or data-path logic active. Re-check failure behavior and recovery semantics.',
      'semantic-correctness',
    ));
  }

  if (diff.addedInlineStyles || diff.addedImageAltIssues || diff.addedButtonLabelIssues) {
    findings.push(createFinding(
      file.file,
      'frontend ux/a11y',
      'should_fix',
      'Semantic frontend review found accessibility or token-drift risk',
      [
        diff.addedInlineStyles ? 'Inline style usage increased.' : '',
        diff.addedImageAltIssues ? 'Image alt coverage regressed.' : '',
        diff.addedButtonLabelIssues ? 'Button accessible naming regressed.' : '',
      ].filter(Boolean).join(' '),
      'semantic-frontend',
    ));
  }

  return {
    analysis,
    findings,
  };
}

function normalizeTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function packageForFile(filePath, packageGraph) {
  if (!packageGraph) {
    return '.';
  }
  if (packageGraph.ownership?.[filePath]) {
    return packageGraph.ownership[filePath];
  }
  const normalized = String(filePath || '');
  const owner = (packageGraph.packages || [])
    .filter((pkg) => pkg.path === '.' || normalized === pkg.path || normalized.startsWith(`${pkg.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
  return owner?.id || '.';
}

function buildConcernSummary(findings) {
  const buckets = new Map();
  for (const finding of findings) {
    const bucket = buckets.get(finding.category) || {
      category: finding.category,
      count: 0,
      files: new Set(),
      maxSeverity: 'nice_to_have',
    };
    bucket.count += 1;
    bucket.files.add(finding.file);
    if (severityScore(finding.severity) > severityScore(bucket.maxSeverity)) {
      bucket.maxSeverity = finding.severity;
    }
    buckets.set(finding.category, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      category: bucket.category,
      count: bucket.count,
      maxSeverity: bucket.maxSeverity,
      files: [...bucket.files].sort(),
    }))
    .sort((left, right) => (
      severityScore(right.maxSeverity) - severityScore(left.maxSeverity)
      || right.count - left.count
      || left.category.localeCompare(right.category)
    ));
}

function buildPackageHeatmap(files, fileHeatmap, packageGraph) {
  const buckets = new Map();
  for (const file of files) {
    const packageId = packageForFile(file.file, packageGraph);
    const heat = fileHeatmap.find((entry) => entry.file === file.file) || {
      severityScore: 0,
      findings: 0,
      categories: [],
    };
    const bucket = buckets.get(packageId) || {
      package: packageId,
      files: new Set(),
      findings: 0,
      severityScore: 0,
      added: 0,
      deleted: 0,
      categories: new Set(),
    };
    bucket.files.add(file.file);
    bucket.findings += heat.findings || 0;
    bucket.severityScore += heat.severityScore || 0;
    bucket.added += file.added || 0;
    bucket.deleted += file.deleted || 0;
    for (const category of heat.categories || []) {
      bucket.categories.add(category);
    }
    buckets.set(packageId, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      package: bucket.package,
      files: [...bucket.files].sort(),
      fileCount: bucket.files.size,
      findings: bucket.findings,
      severityScore: bucket.severityScore,
      added: bucket.added,
      deleted: bucket.deleted,
      categories: [...bucket.categories].sort(),
    }))
    .sort((left, right) => (
      right.severityScore - left.severityScore
      || right.findings - left.findings
      || left.package.localeCompare(right.package)
    ));
}

function buildReviewPersonas(findings, files, uiReview = null) {
  return REVIEW_PERSONAS.map((persona) => {
    const relevantFindings = findings.filter((finding) => persona.categories.includes(finding.category));
    const relevantFiles = files
      .filter((file) => persona.fileKinds.includes(fileCategory(file.file)))
      .map((file) => file.file);
    const highSeverity = relevantFindings.some((finding) => severityScore(finding.severity) >= severityScore('must_fix'));
    const verdict = highSeverity
      ? 'blocked'
      : relevantFindings.length > 0
        ? 'attention'
        : uiReview && persona.id === 'frontend' && uiReview.debt?.length > 0
          ? 'attention'
          : 'clear';
    return {
      id: persona.id,
      label: persona.label,
      focus: persona.focus,
      verdict,
      findingCount: relevantFindings.length,
      categories: [...new Set(relevantFindings.map((finding) => finding.category))],
      topFiles: [...new Set(relevantFindings.map((finding) => finding.file).concat(relevantFiles))].slice(0, 6),
      summary: relevantFindings.length > 0
        ? `Raised ${relevantFindings.length} relevant finding(s) for ${persona.label}.`
        : verdict === 'attention'
          ? `${persona.label} stays active because frontend debt remains visible.`
          : `No active findings for ${persona.label}.`,
    };
  });
}

function overlapCount(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return [...left].filter((token) => rightSet.has(token)).length;
}

function buildTraceability(context, files, packageGraph) {
  const fileEntries = files.map((file) => {
    const packageId = packageForFile(file.file, packageGraph);
    return {
      file: file.file,
      package: packageId,
      fileTokens: new Set([
        ...normalizeTokens(file.file),
        ...normalizeTokens(path.basename(file.file)),
        ...normalizeTokens(packageId),
      ]),
    };
  });

  const rows = (context.validationRows || []).map((row, index) => {
    const rowText = [
      row.deliverable,
      row.verify_command,
      row.expected_signal,
      row.manual_check,
      row.evidence,
      row.audit_owner,
      row.status,
    ].join(' ');
    const rowTokens = new Set(normalizeTokens(rowText));
    const matchedFiles = fileEntries.filter((entry) => {
      if (String(row.evidence || '').includes(entry.file)) {
        return true;
      }
      if (entry.package !== '.' && String(row.evidence || '').includes(entry.package)) {
        return true;
      }
      return overlapCount(entry.fileTokens, rowTokens) >= 2;
    });
    return {
      id: row.deliverable || `validation-row-${index + 1}`,
      deliverable: row.deliverable || `validation-row-${index + 1}`,
      status: row.status || 'unknown',
      verifyCommand: row.verify_command || '',
      evidence: row.evidence || '',
      matchedFiles: matchedFiles.map((entry) => entry.file),
      matchedPackages: [...new Set(matchedFiles.map((entry) => entry.package))],
      coverage: matchedFiles.length > 0 ? 'linked' : 'unlinked',
    };
  });

  const linkedFiles = new Set(rows.flatMap((row) => row.matchedFiles));
  const unmappedFiles = fileEntries
    .filter((entry) => !linkedFiles.has(entry.file))
    .map((entry) => ({
      file: entry.file,
      package: entry.package,
    }));

  return {
    validationRows: rows,
    linkedCount: rows.filter((row) => row.coverage === 'linked').length,
    unlinkedCount: rows.filter((row) => row.coverage === 'unlinked').length,
    unmappedFiles,
    openRequirements: context.openRequirements || [],
  };
}

function buildFollowUpTickets(findings, traceability, personas) {
  const tickets = [];
  const blockers = findings.filter((finding) => severityScore(finding.severity) >= severityScore('must_fix'));
  for (const finding of blockers.slice(0, 5)) {
    tickets.push({
      title: finding.title,
      severity: finding.severity,
      ownerLane: finding.category === 'frontend ux/a11y' ? 'frontend' : finding.category === 'security' ? 'security' : 'review',
      rationale: finding.detail,
      file: finding.file,
    });
  }
  if (traceability.unmappedFiles.length > 0) {
    tickets.push({
      title: 'Align validation contract with changed scope',
      severity: 'should_fix',
      ownerLane: 'review',
      rationale: `${traceability.unmappedFiles.length} changed file(s) are not linked to the validation contract.`,
      file: traceability.unmappedFiles[0].file,
    });
  }
  const personaWatch = personas.filter((persona) => persona.verdict === 'attention');
  if (personaWatch.length > 0) {
    tickets.push({
      title: `Resolve ${personaWatch[0].label} concerns`,
      severity: 'nice_to_have',
      ownerLane: personaWatch[0].id,
      rationale: personaWatch[0].summary,
      file: personaWatch[0].topFiles[0] || '',
    });
  }
  return tickets.slice(0, 8);
}

function buildOutcome(files, findings, blockers, traceability, packageHeatmap, uiReview) {
  const validationCoverage = traceability.validationRows.length > 0
    ? traceability.linkedCount / traceability.validationRows.length
    : 0.6;
  const packagePenalty = Math.max(0, packageHeatmap.length - 2) * 0.03;
  const unmappedPenalty = Math.min(0.18, traceability.unmappedFiles.length * 0.03);
  const blockerPenalty = blockers.length * 0.06;
  const uiBonus = uiReview ? 0.04 : 0;
  const confidence = Number(Math.max(
    0.4,
    Math.min(
      0.98,
      0.62
      + Math.min(files.length, 6) * 0.02
      + (validationCoverage * 0.08)
      + uiBonus
      - blockerPenalty
      - packagePenalty
      - unmappedPenalty,
    ),
  ).toFixed(2));

  return {
    confidence,
    severityWeightedScore: findings.reduce((sum, finding) => sum + severityScore(finding.severity), 0),
    shipReadiness: blockers.length > 0
      ? 'blocked'
      : findings.length > 0 || traceability.unmappedFiles.length > 0
        ? 'needs_follow_up'
        : 'ready',
    confidenceFactors: [
      `validation_coverage=${traceability.linkedCount}/${traceability.validationRows.length || 0}`,
      `unmapped_files=${traceability.unmappedFiles.length}`,
      `packages_touched=${packageHeatmap.length}`,
      `ui_review=${uiReview ? 'yes' : 'no'}`,
    ],
    shipRecommendation: blockers.length > 0
      ? 'hold_for_fixes'
      : confidence >= 0.8 && traceability.unmappedFiles.length === 0
        ? 'ship_with_standard_checks'
        : 'ship_after_follow_up',
  };
}

function runPasses(files, context, packageGraph, symbolGraph, cwd) {
  const findings = [];
  const semanticSignals = [];
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
    if (isMigrationFile(file.file, file)) {
      findings.push(createFinding(
        file.file,
        'data/migration',
        'must_fix',
        'Migration diff needs rollback and verification notes',
        'Schema or migration changes should record rollback expectations and targeted verification before ship.',
        'architecture-security',
      ));
    }
    if (isApiSurface(file.file, file)) {
      findings.push(createFinding(
        file.file,
        'API drift',
        'should_fix',
        'API-facing diff needs contract review',
        'An API or route surface changed; confirm downstream callers, schema expectations, and verification coverage stay aligned.',
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
    if (cwd && ['source', 'frontend'].includes(category)) {
      const semantic = semanticFindingsForFile(cwd, file, symbolGraph);
      semanticSignals.push(semanticSignalSummary(file.file, semantic.analysis));
      findings.push(...semantic.findings);
    }
  }

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    const suggestedTests = (packageGraph?.impactedTests || []).slice(0, 5);
    findings.push(createFinding(
      sourceFiles[0].file,
      'test gap',
      'must_fix',
      'Source changes landed without test coverage deltas',
      suggestedTests.length > 0
        ? `Code changed but no test files changed in the same diff. Add or exercise impacted tests such as: ${suggestedTests.join(', ')}.`
        : 'Code changed but no test files changed in the same diff. Add tests or record why existing coverage is sufficient.',
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

  return {
    findings: findingsBySeverity(findings),
    semanticSignals,
  };
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
- Ship recommendation: \`${payload.outcome.shipRecommendation}\`
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

## Package Heatmap

${payload.packageHeatmap.length > 0
    ? payload.packageHeatmap.slice(0, 8).map((item) => `- \`${item.package}\` severity=${item.severityScore} findings=${item.findings} files=${item.fileCount}`).join('\n')
    : '- `No package ownership signals were available.`'}

## Review Personas

${payload.personas.length > 0
    ? payload.personas.map((persona) => `- [${persona.verdict}] \`${persona.label}\` findings=${persona.findingCount} ${persona.summary}`).join('\n')
    : '- `No persona summary was generated.`'}

## Traceability

${payload.traceability.validationRows.length > 0
    ? payload.traceability.validationRows.slice(0, 10).map((row) => `- [${row.coverage}] \`${row.deliverable}\` files=${row.matchedFiles.length}`).join('\n')
    : '- `No validation contract rows were available for traceability.`'}

## Blockers

${payload.blockers.length > 0
    ? payload.blockers.map((finding) => `- \`${finding.file}\` ${finding.title}`).join('\n')
    : '- `No blocker or must-fix items were found.`'}

## Follow-up Tickets

${payload.followUpTickets.length > 0
    ? payload.followUpTickets.map((ticket) => `- [${ticket.severity}] \`${ticket.ownerLane}\` ${ticket.title}: ${ticket.rationale}`).join('\n')
    : '- `No follow-up tickets were generated.`'}

## Semantic Signals

${payload.semanticSignals.length > 0
    ? payload.semanticSignals.slice(0, 10).map((item) => `- \`${item.file}\` removedExports=${item.removedExports.length} changedSignatures=${item.changedSignatures.length} authDrop=${item.authSignalsDropped ? 'yes' : 'no'} a11yRisk=${item.accessibilitySignalsAdded ? 'yes' : 'no'}`).join('\n')
    : '- `No semantic review signals were collected for the changed files.`'}
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
    diffText: options.diffText,
    diffFile: options.diffFile,
    range: options.range,
    staged: options.staged,
    files: options.files || [],
  });
  const files = parseDiff(diffText);
  const browserEvidencePresent = fs.existsSync(path.join(cwd, '.workflow', 'verifications', 'browser'));
  const packageGraph = buildPackageGraph(cwd, { writeFiles: true });
  const symbolGraph = buildSymbolGraph(cwd, { writeFiles: true, refreshMode: 'incremental' });
  const reviewPass = runPasses(files, {
    ...context,
    browserEvidencePresent,
  }, packageGraph, symbolGraph, cwd);
  const findings = reviewPass.findings;
  const heatmap = heatmapFromFindings(files, findings);
  const blockers = blockersFromFindings(findings);
  const recordHistory = options.recordHistory !== false;
  const writeArtifacts = options.writeArtifacts !== false;
  const previousHistory = recordHistory
    ? readJson(reviewHistoryPath(cwd), { runs: [] })
    : { runs: [] };
  const replay = buildReplay(previousHistory.runs[0]?.findings || [], findings);
  const frontendTouched = files.some((file) => fileCategory(file.file) === 'frontend');
  const uiReview = frontendTouched && options.includeUiReview !== false
    ? await buildUiReview(cwd, rootDir, {})
    : null;
  const packageHeatmap = buildPackageHeatmap(files, heatmap, packageGraph);
  const concernSummary = buildConcernSummary(findings);
  const traceability = buildTraceability(context, files, packageGraph);
  const personas = buildReviewPersonas(findings, files, uiReview);
  const followUpTickets = buildFollowUpTickets(findings, traceability, personas);
  const outcome = buildOutcome(files, findings, blockers, traceability, packageHeatmap, uiReview);

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
    packageHeatmap,
    concernSummary,
    blockers,
    replay,
    outcome,
    patchSuggestions: renderPatchSuggestions({ findings }),
    semanticSignals: reviewPass.semanticSignals,
    personas,
    traceability,
    followUpTickets,
    packageGraph: {
      repoShape: packageGraph.repoShape,
      packageCount: packageGraph.packageCount,
      changedPackages: packageGraph.changedPackages || [],
      impactedPackages: packageGraph.impactedPackages || [],
      impactedTests: packageGraph.impactedTests || [],
    },
    symbolGraph: {
      symbolCount: symbolGraph.symbolCount,
      importEdgeCount: symbolGraph.importEdgeCount,
      refreshStatus: symbolGraph.refreshStatus,
    },
    uiReview,
  };

  if (writeArtifacts) {
    const reportsDir = reviewReportsDir(cwd);
    fs.mkdirSync(reportsDir, { recursive: true });
    const markdownPath = path.join(reportsDir, 'review.md');
    const findingsPath = path.join(reportsDir, 'review-findings.json');
    const heatmapPath = path.join(reportsDir, 'risk-heatmap.json');
    const packageHeatmapPath = path.join(reportsDir, 'review-package-heatmap.json');
    const concernSummaryPath = path.join(reportsDir, 'review-concerns.json');
    const packageGraphPath = path.join(reportsDir, 'review-package-graph.json');
    const blockersPath = path.join(reportsDir, 'review-blockers.md');
    const replayPath = path.join(reportsDir, 'review-replay.json');
    const suggestionsPath = path.join(reportsDir, 'review-patch-suggestions.json');
    const semanticPath = path.join(reportsDir, 'review-semantic-signals.json');
    const personasPath = path.join(reportsDir, 'review-personas.json');
    const traceabilityPath = path.join(reportsDir, 'review-traceability.json');
    const followUpsPath = path.join(reportsDir, 'review-follow-ups.json');
    fs.writeFileSync(markdownPath, `${renderMarkdownReport(payload).trimEnd()}\n`);
    writeJson(findingsPath, payload.findings);
    writeJson(heatmapPath, payload.heatmap);
    writeJson(packageHeatmapPath, payload.packageHeatmap);
    writeJson(concernSummaryPath, payload.concernSummary);
    writeJson(packageGraphPath, payload.packageGraph);
    fs.writeFileSync(blockersPath, `${renderBlockersMarkdown(payload).trimEnd()}\n`);
    writeJson(replayPath, payload.replay);
    writeJson(suggestionsPath, payload.patchSuggestions);
    writeJson(semanticPath, payload.semanticSignals);
    writeJson(personasPath, payload.personas);
    writeJson(traceabilityPath, payload.traceability);
    writeJson(followUpsPath, payload.followUpTickets);
    if (recordHistory) {
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
    }

    payload.artifacts = {
      markdown: relativePath(cwd, markdownPath),
      findings: relativePath(cwd, findingsPath),
      heatmap: relativePath(cwd, heatmapPath),
      packageHeatmap: relativePath(cwd, packageHeatmapPath),
      concerns: relativePath(cwd, concernSummaryPath),
      packageGraph: relativePath(cwd, packageGraphPath),
      blockers: relativePath(cwd, blockersPath),
      replay: relativePath(cwd, replayPath),
      patchSuggestions: relativePath(cwd, suggestionsPath),
      semantic: relativePath(cwd, semanticPath),
      personas: relativePath(cwd, personasPath),
      traceability: relativePath(cwd, traceabilityPath),
      followUps: relativePath(cwd, followUpsPath),
    };
    payload.outputPath = markdownPath;
    payload.outputPathRelative = payload.artifacts.markdown;
  } else {
    payload.artifacts = null;
    payload.outputPath = null;
    payload.outputPathRelative = null;
  }

  return payload;
}

module.exports = {
  fileCategory,
  parseDiff,
  runReviewEngine,
  runPasses,
};
