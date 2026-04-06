
const fs = require('node:fs');
const path = require('node:path');
const { ensureDir } = require('./common');
const { buildPackageGraph } = require('./package_graph');
const { relativePath } = require('./roadmap_os');

function severityWeight(severity) {
  if (severity === 'must_fix') {
    return 4;
  }
  if (severity === 'should_fix') {
    return 3;
  }
  if (severity === 'follow_up') {
    return 2;
  }
  return 1;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function reviewReportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function packageForFile(filePath, graph) {
  return graph.ownership?.[filePath] || '.';
}

function aggregatePackages(review, graph) {
  const packages = new Map();
  const files = review.files || [];
  const findings = review.findings || [];
  const packageMeta = new Map((graph.packages || []).map((pkg) => [pkg.id, pkg]));

  for (const file of files) {
    const packageId = packageForFile(file.file, graph);
    const entry = packages.get(packageId) || {
      packageId,
      packageName: packageMeta.get(packageId)?.name || packageId,
      packagePath: packageMeta.get(packageId)?.path || packageId,
      files: [],
      findings: [],
      severityScore: 0,
      categories: new Set(),
      frontendTouched: false,
      testTouched: false,
    };
    entry.files.push(file.file);
    entry.frontendTouched = entry.frontendTouched || /\.(tsx|jsx|css|scss|sass)$/.test(file.file);
    entry.testTouched = entry.testTouched || /(^|\/)(tests?|__tests__)\/|\.(test|spec)\./.test(file.file);
    packages.set(packageId, entry);
  }

  for (const finding of findings) {
    const packageId = packageForFile(finding.file, graph);
    const entry = packages.get(packageId) || {
      packageId,
      packageName: packageMeta.get(packageId)?.name || packageId,
      packagePath: packageMeta.get(packageId)?.path || packageId,
      files: [],
      findings: [],
      severityScore: 0,
      categories: new Set(),
      frontendTouched: false,
      testTouched: false,
    };
    entry.findings.push(finding);
    entry.severityScore += severityWeight(finding.severity);
    entry.categories.add(finding.category);
    packages.set(packageId, entry);
  }

  return [...packages.values()]
    .map((entry) => ({
      ...entry,
      categories: [...entry.categories],
      fileCount: entry.files.length,
      findingCount: entry.findings.length,
      blockerCount: entry.findings.filter((item) => item.severity === 'must_fix').length,
    }))
    .sort((left, right) => right.severityScore - left.severityScore || right.findingCount - left.findingCount || left.packageName.localeCompare(right.packageName));
}

function buildPersonaShards(review) {
  return (review.personas || [])
    .filter((persona) => persona.verdict !== 'clear' || persona.findingCount > 0)
    .map((persona) => ({
      id: `persona-${slugify(persona.id)}`,
      persona: persona.id,
      label: persona.label,
      focus: persona.focus,
      verdict: persona.verdict,
      files: persona.topFiles || [],
      summary: persona.summary,
    }));
}

function buildPackageShards(packageGroups) {
  return packageGroups.slice(0, 6).map((entry, index) => ({
    id: `package-${slugify(entry.packageId)}`,
    owner: `reviewer-package-${index + 1}`,
    packageId: entry.packageId,
    packageName: entry.packageName,
    packagePath: entry.packagePath,
    readScope: [
      entry.packagePath,
      ...entry.files.slice(0, 10),
    ],
    focus: entry.findingCount > 0
      ? `Review ${entry.packageName} for ${entry.categories.join(', ') || 'correctness'} and convert findings into fix-ready tasks.`
      : `Review ${entry.packageName} for dependency fan-out, test gaps, and hidden regressions.`,
    blockerCount: entry.blockerCount,
    findingCount: entry.findingCount,
  }));
}

function buildVerifyTasks(review, graph, packageGroups) {
  const tasks = [];
  if ((graph.impactedTests || []).length > 0) {
    tasks.push({
      id: 'verify-impacted-tests',
      owner: 'verifier-tests',
      focus: 'Run or inspect impacted tests before escalating to a repo-wide suite.',
      commands: (graph.impactedTests || []).slice(0, 12),
      mode: 'targeted_verify',
    });
  }
  if (review.uiReview) {
    tasks.push({
      id: 'verify-ui-review',
      owner: 'verifier-frontend',
      focus: 'Re-run UI review/browser evidence for touched frontend surfaces after fixes land.',
      commands: ['cwf ui-review', 'cwf verify-browser --url <preview-or-localhost>'],
      mode: 'ui_verify',
    });
  }
  if (review.blockers?.length > 0) {
    tasks.push({
      id: 'verify-reroute-review',
      owner: 'verifier-replay',
      focus: 'After blocker fixes, rerun replay/re-review against the latest diff.',
      commands: ['cwf re-review'],
      mode: 're_review',
    });
  }
  if (tasks.length === 0) {
    tasks.push({
      id: 'verify-closeout',
      owner: 'verifier',
      focus: 'Close the review loop with the fastest targeted verification available for changed packages.',
      commands: ['cwf review --heatmap'],
      mode: 'review_verify',
    });
  }
  return tasks;
}

function buildWaves(review, graph, packageGroups) {
  const packageShards = buildPackageShards(packageGroups);
  const personaShards = buildPersonaShards(review);
  const verifyTasks = buildVerifyTasks(review, graph, packageGroups);

  return [
    {
      wave: 1,
      rationale: 'Package-local and persona-local review work is read-only and parallelizable even for large monorepos.',
      tasks: [
        ...packageShards.map((task) => ({
          ...task,
          mode: 'parallel_readonly',
          checklist: [
            'Confirm the changed package boundary and dependency fan-out.',
            'Convert findings into concrete fix-ready bullets.',
            'Flag tests or browser evidence missing for this package.',
          ],
        })),
        ...personaShards.map((task) => ({
          ...task,
          mode: 'parallel_readonly',
          checklist: [
            'Audit only the files relevant to this persona.',
            'Call out blockers before summarizing.',
            'Avoid package-wide rewrites; stay diff-focused.',
          ],
        })),
      ],
    },
    {
      wave: 2,
      rationale: 'Synthesis should happen after the read-only shards converge.',
      tasks: [
        {
          id: 'synthesize-review',
          owner: 'review-lead',
          mode: 'synthesis',
          focus: 'Deduplicate package/persona findings, rank blockers, and turn them into fix-ready tasks.',
          checklist: [
            'Merge duplicates across package and persona shards.',
            'Rank must-fix items ahead of should-fix and follow-up items.',
            'Attach targeted verify commands to every blocker.',
          ],
        },
      ],
    },
    {
      wave: 3,
      rationale: 'Verify only the changed or impacted surface before a full repo sweep.',
      tasks: verifyTasks.map((task) => ({
        ...task,
        checklist: [
          'Prefer impacted verification first.',
          'Record evidence paths or commands.',
          'Escalate to repo-wide verification only if package-local checks are insufficient.',
        ],
      })),
    },
  ];
}

function renderTask(task) {
  return [
    `### ${task.id}`,
    '',
    `- Owner: \`${task.owner}\``,
    `- Mode: \`${task.mode}\``,
    `- Focus: ${task.focus}`,
    ...(task.packagePath ? [`- Package path: \`${task.packagePath}\``] : []),
    ...(task.readScope?.length ? [`- Read scope: \`${task.readScope.join(', ')}\``] : []),
    ...(task.commands?.length ? ['- Commands:', ...task.commands.map((command) => `  - \`${command}\``)] : []),
    '',
    'Checklist:',
    ...((task.checklist || []).map((item) => `- [ ] ${item}`)),
    '',
  ].join('\n');
}

function renderMarkdown(payload) {
  const lines = [
    '# REVIEW ORCHESTRATION',
    '',
    `- Generated at: \`${payload.generatedAt}\``,
    `- Ship readiness: \`${payload.outcome.shipReadiness}\``,
    `- Confidence: \`${payload.outcome.confidence}\``,
    `- Packages in play: \`${payload.packageGroups.length}\``,
    `- Personas in play: \`${payload.personaShards.length}\``,
    `- Findings: \`${payload.findings.length}\``,
    `- Blockers: \`${payload.blockers.length}\``,
    '',
    '## Review Strategy',
    '',
    '- Start with parallel read-only package shards so large monorepos stay context-light.',
    '- Add persona shards to catch cross-cutting concerns that packages alone miss.',
    '- Synthesize once, then verify only the changed or impacted surface before considering a full repo sweep.',
    '',
  ];

  for (const wave of payload.waves) {
    lines.push(`## Wave ${wave.wave}`);
    lines.push('');
    lines.push(`- ${wave.rationale}`);
    lines.push('');
    for (const task of wave.tasks) {
      lines.push(renderTask(task));
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function writeArtifacts(cwd, payload) {
  const reportsDir = reviewReportsDir(cwd);
  ensureDir(reportsDir);
  const jsonPath = path.join(reportsDir, 'review-orchestration.json');
  const markdownPath = path.join(reportsDir, 'review-orchestration.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(payload));
  return {
    jsonPath,
    markdownPath,
  };
}

function buildReviewOrchestration(cwd, rootDir, reviewPayload) {
  const graph = buildPackageGraph(cwd, {
    writeFiles: true,
    changedFiles: (reviewPayload.files || []).map((file) => file.file),
  });
  const packageGroups = aggregatePackages(reviewPayload, graph);
  const personaShards = buildPersonaShards(reviewPayload);
  const waves = buildWaves(reviewPayload, graph, packageGroups);
  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: relativePath(cwd, rootDir),
    outcome: reviewPayload.outcome,
    findings: reviewPayload.findings || [],
    blockers: reviewPayload.blockers || [],
    packageGraph: {
      repoShape: graph.repoShape,
      packageCount: graph.packageCount,
      changedPackages: graph.changedPackages || [],
      impactedPackages: graph.impactedPackages || [],
      impactedTests: graph.impactedTests || [],
    },
    packageGroups,
    personaShards,
    waves,
  };
  const artifacts = writeArtifacts(cwd, payload);
  payload.jsonFile = relativePath(cwd, artifacts.jsonPath);
  payload.markdownFile = relativePath(cwd, artifacts.markdownPath);
  return payload;
}

module.exports = {
  buildReviewOrchestration,
};
