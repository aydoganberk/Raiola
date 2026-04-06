const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveWorkflowRoot, ensureDir } = require('./common');
const { runReviewEngine } = require('./review_engine');
const { buildReviewOrchestration } = require('./review_orchestration');
const { buildReviewTaskGraph } = require('./review_task_graph');
const { buildMonorepoIntelligence } = require('./monorepo');
const { buildCodexContextPack } = require('./context_pack');
const { selectCodexProfile } = require('./codex_profile_engine');

function reviewReportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function normalizeFileList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function reviewAnalysis(goal, monorepo, review) {
  return {
    lane: 'review',
    chosenCapability: {
      id: 'review.deep_review',
      domain: 'review',
    },
    intent: {
      review: true,
      verify: true,
      frontend: (review.findings || []).some((item) => item.category === 'frontend ux/a11y'),
    },
    repoSignals: {
      monorepo: monorepo?.repoShape === 'monorepo',
      frontendActive: (review.files || []).some((file) => /\.(tsx|jsx|css|scss|sass)$/.test(file.file || '')),
    },
    languageMix: {
      matchedLanguages: [],
      multilingual: false,
      englishSignals: true,
      turkishSignals: /[çğıöşüİ]/i.test(String(goal || '')),
    },
    confidence: 0.92,
    risk: {
      level: (review.blockers || []).length > 0 ? 'high' : 'medium',
      high: (review.blockers || []).length > 0,
    },
  };
}

function buildReviewLenses(review, orchestration, monorepo) {
  const categories = new Map();
  for (const finding of review.findings || []) {
    categories.set(finding.category, (categories.get(finding.category) || 0) + 1);
  }
  const topCategories = [...categories.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, 5)
    .map(([category, count]) => ({
      lens: category,
      count,
      focus: `Inspect ${category} risk across the touched surface before broadening the read scope.`,
    }));

  if (monorepo?.hotspots?.length) {
    topCategories.push({
      lens: 'package-hotspots',
      count: monorepo.hotspots.length,
      focus: `Prioritize ${monorepo.hotspots.slice(0, 3).map((item) => item.packageName).join(', ')} before repo-wide review sweeps.`,
    });
  }
  if ((orchestration?.personaShards || []).length) {
    topCategories.push({
      lens: 'persona-shards',
      count: orchestration.personaShards.length,
      focus: 'Use persona-local passes to separate correctness, security, frontend, and DX concerns.',
    });
  }

  return topCategories.slice(0, 6);
}

function buildTopBlockers(review) {
  const blockers = [];
  for (const blocker of review.blockers || []) {
    blockers.push({
      title: blocker.title || blocker.file || 'blocker',
      severity: blocker.severity || 'must_fix',
      file: blocker.file || null,
      detail: blocker.detail || blocker.reason || 'Resolve before closeout.',
    });
  }
  if (blockers.length === 0) {
    for (const finding of (review.findings || []).filter((item) => item.severity === 'must_fix').slice(0, 5)) {
      blockers.push({
        title: finding.title,
        severity: finding.severity,
        file: finding.file,
        detail: finding.detail,
      });
    }
  }
  return blockers.slice(0, 8);
}

function buildExecutionSpine(taskGraph, monorepo) {
  const steps = [
    'Triage blockers and high-risk files first.',
    'Dispatch read-only scout/review shards before opening write-capable work.',
    'Land bounded fixes package by package.',
    'Run targeted verification before any root smoke sweep.',
    'Finish with one re-review pass and explicit closeout notes.',
  ];
  if (monorepo?.agentPlan?.scout?.length) {
    steps[1] = `Dispatch ${monorepo.agentPlan.scout.length} scout lanes over the top hotspots before bounded writes.`;
  }
  if ((taskGraph?.summary?.fixTaskCount || 0) > 0) {
    steps[2] = `Land ${taskGraph.summary.fixTaskCount} fix tasks wave-by-wave instead of batching the whole diff into one pass.`;
  }
  return steps;
}

function renderMarkdown(payload) {
  const lines = [
    '# REVIEW MODE',
    '',
    `- Goal: \`${payload.goal}\``,
    `- Profile: \`${payload.profile.id}\``,
    `- Review report: \`${payload.review.artifacts?.markdown || payload.review.outputPathRelative || 'n/a'}\``,
    `- Orchestration: \`${payload.orchestration.markdownFile}\``,
    `- Task graph: \`${payload.taskGraph.markdownFile}\``,
    '',
    '## Review Lenses',
    '',
    ...(payload.reviewLenses.length > 0
      ? payload.reviewLenses.map((item) => `- \`${item.lens}\` (${item.count}) -> ${item.focus}`)
      : ['- `No review lenses were inferred.`']),
    '',
    '## Top Blockers',
    '',
    ...(payload.topBlockers.length > 0
      ? payload.topBlockers.map((item) => `- \`${item.severity}\` ${item.title}${item.file ? ` @ ${item.file}` : ''} -> ${item.detail}`)
      : ['- `No top blockers were detected.`']),
    '',
    '## Execution Spine',
    '',
    ...payload.executionSpine.map((item, index) => `- ${index + 1}. ${item}`),
    '',
    '## Task Graph Waves',
    '',
    ...payload.taskGraph.waves.flatMap((wave) => ([
      `### Wave ${wave.wave}: ${wave.label}`,
      '',
      ...(wave.tasks || []).map((task) => `- \`${task.mode}\` ${task.title}`),
      '',
    ])),
  ];

  if (payload.monorepo) {
    lines.push('## Monorepo / Agent Plan');
    lines.push('');
    lines.push(`- Repo shape: \`${payload.monorepo.repoShape}\``);
    lines.push(`- Workspace discovery: \`${(payload.monorepo.workspaceDiscovery?.sources || []).join(', ') || 'root only'}\``);
    lines.push(`- Hotspots: \`${payload.monorepo.hotspots.slice(0, 3).map((item) => item.packageName).join(', ') || 'none'}\``);
    lines.push('');
    for (const phaseName of ['scout', 'fix', 'verify']) {
      const phase = payload.monorepo.agentPlan?.[phaseName] || [];
      lines.push(`### ${phaseName}`);
      lines.push('');
      if (!phase.length) {
        lines.push('- `No tasks inferred.`');
        lines.push('');
        continue;
      }
      for (const task of phase) {
        lines.push(`- \`${task.id}\` ${task.focus || task.packageName || 'lane'}`);
      }
      lines.push('');
    }
  }

  if (payload.contextPack) {
    lines.push('## Context Pack');
    lines.push('');
    lines.push(`- File: \`${payload.contextPack.file}\``);
    lines.push(`- JSON: \`${payload.contextPack.jsonFile}\``);
    lines.push(`- Focus files: \`${payload.contextPack.focusFiles.slice(0, 8).join(', ') || 'none'}\``);
    lines.push('');
  }

  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- Markdown: \`${payload.file}\``);
  lines.push(`- JSON: \`${payload.jsonFile}\``);
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function writeArtifacts(cwd, payload) {
  const reportsDir = reviewReportsDir(cwd);
  ensureDir(reportsDir);
  const markdownPath = path.join(reportsDir, 'review-mode.md');
  const jsonPath = path.join(reportsDir, 'review-mode.json');
  fs.writeFileSync(markdownPath, renderMarkdown(payload));
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    markdownPath,
    jsonPath,
  };
}

async function buildReviewMode(cwd, rootDir, options = {}) {
  const goal = String(options.goal || 'run the advanced review mode').trim();
  const review = await runReviewEngine(cwd, rootDir, {
    mode: 'review-mode',
    files: options.files || [],
    range: options.range || '',
    diffFile: options.diffFile || '',
    staged: Boolean(options.staged),
  });
  const orchestration = buildReviewOrchestration(cwd, rootDir, review);
  const taskGraph = buildReviewTaskGraph(cwd, rootDir, review, { orchestration });
  const monorepo = buildMonorepoIntelligence(cwd, rootDir, {
    writeFiles: true,
    maxWorkers: options.maxWorkers || 4,
    changedFiles: (review.files || []).map((file) => file.file),
  });
  const analysis = reviewAnalysis(goal, monorepo, review);
  const profile = selectCodexProfile({ analysis });
  const contextPack = buildCodexContextPack(cwd, rootDir, goal, analysis, profile, {
    taste: options.taste,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    goal,
    profile,
    review,
    orchestration,
    taskGraph,
    monorepo,
    contextPack,
    reviewLenses: buildReviewLenses(review, orchestration, monorepo),
    topBlockers: buildTopBlockers(review),
    executionSpine: buildExecutionSpine(taskGraph, monorepo),
    commandPlan: {
      primary: `cwf review-mode --goal ${JSON.stringify(goal)}`,
      followUps: [
        'cwf review-tasks --json',
        'cwf re-review',
        'cwf ship-readiness',
      ],
    },
  };

  const artifacts = writeArtifacts(cwd, payload);
  payload.file = relativePath(cwd, artifacts.markdownPath);
  payload.jsonFile = relativePath(cwd, artifacts.jsonPath);
  fs.writeFileSync(artifacts.markdownPath, renderMarkdown(payload));
  fs.writeFileSync(artifacts.jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function printHelp() {
  console.log(`
review_mode

Usage:
  node scripts/workflow/review_mode.js --goal "review the auth diff"

Options:
  --goal <text>       Goal text for the review run
  --root <path>       Workflow root. Defaults to active workstream root
  --files <a;b;c>     Limit the diff to explicit files
  --range <revset>    Review a git range such as HEAD~1..HEAD
  --diff-file <path>  Review a saved diff file
  --staged            Review staged changes
  --max-workers <n>   Maximum bounded write lanes for monorepo planning
  --taste <id>        Optional explicit taste profile for any frontend artifacts
  --json              Print machine-readable output
  `);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = await buildReviewMode(cwd, rootDir, {
    goal: String(args.goal || args._.join(' ') || 'run the advanced review mode').trim(),
    files: normalizeFileList(args.files),
    range: args.range ? String(args.range).trim() : '',
    diffFile: args['diff-file'] ? String(args['diff-file']).trim() : '',
    staged: Boolean(args.staged),
    maxWorkers: Number(args['max-workers'] || 4),
    taste: args.taste ? String(args.taste).trim() : '',
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# REVIEW MODE\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- JSON: \`${payload.jsonFile}\``);
  console.log(`- Lenses: \`${payload.reviewLenses.length}\``);
  console.log(`- Top blockers: \`${payload.topBlockers.length}\``);
  console.log(`- Waves: \`${payload.taskGraph.waves.length}\``);
}

module.exports = {
  buildReviewMode,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
