const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { runReviewEngine } = require('./review_engine');
const { buildReviewOrchestration } = require('./review_orchestration');
const { buildMonorepoIntelligence } = require('./monorepo');
const { severityScore } = require('./review_findings');
const { relativePath, writeJsonFile } = require('./roadmap_os');

function reviewReportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function packageForFile(filePath, monorepo) {
  if (!monorepo) {
    return {
      packageId: '.',
      packageName: 'root',
      packagePath: '.',
      verifyCommands: [],
    };
  }
  const packageSlice = (monorepo.packageSlices || []).find((slice) => (
    filePath === slice.packagePath || filePath.startsWith(`${slice.packagePath}/`)
  ));
  if (packageSlice) {
    const verifyEntry = (monorepo.verify?.perPackage || []).find((entry) => entry.packageId === packageSlice.packageId);
    return {
      packageId: packageSlice.packageId,
      packageName: packageSlice.packageName,
      packagePath: packageSlice.packagePath,
      verifyCommands: verifyEntry?.commands || [],
    };
  }
  return {
    packageId: '.',
    packageName: 'root',
    packagePath: '.',
    verifyCommands: monorepo?.verify?.rootSmoke || [],
  };
}

function groupFindingsByPackage(review, monorepo) {
  const groups = new Map();
  for (const finding of review.findings || []) {
    const pkg = packageForFile(finding.file, monorepo);
    const key = pkg.packageId;
    const entry = groups.get(key) || {
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      packagePath: pkg.packagePath,
      findings: [],
      categories: new Set(),
      severityScore: 0,
      verifyCommands: [...pkg.verifyCommands],
      files: new Set(),
    };
    entry.findings.push(finding);
    entry.categories.add(finding.category);
    entry.severityScore += severityScore(finding.severity);
    entry.files.add(finding.file);
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      categories: [...entry.categories],
      files: [...entry.files],
      blockerCount: entry.findings.filter((finding) => severityScore(finding.severity) >= severityScore('must_fix')).length,
      shouldFixCount: entry.findings.filter((finding) => finding.severity === 'should_fix').length,
      followUpCount: entry.findings.filter((finding) => ['nice_to_have', 'follow_up'].includes(finding.severity)).length,
    }))
    .sort((left, right) => right.severityScore - left.severityScore || right.blockerCount - left.blockerCount || left.packageName.localeCompare(right.packageName));
}

function buildTriageWave(orchestration) {
  const triageTasks = [];
  const waveOne = orchestration.waves?.find((wave) => wave.wave === 1) || orchestration.waves?.[0];
  for (const task of waveOne?.tasks || []) {
    triageTasks.push({
      id: `triage-${task.id}`,
      owner: task.owner,
      mode: task.mode || 'parallel_readonly',
      title: task.packageName ? `${task.packageName} triage` : task.label || task.id,
      focus: task.focus,
      scopePaths: task.readScope || [],
      dependsOn: [],
      acceptance: task.checklist || [
        'Confirm the package/diff boundary.',
        'Convert observations into concrete fix-ready bullets.',
      ],
      verifyCommands: [],
    });
  }
  return triageTasks;
}

function buildFixTasks(packageGroups, monorepo, review) {
  const fixTasks = [];
  for (const group of packageGroups) {
    const blockers = group.findings.filter((finding) => severityScore(finding.severity) >= severityScore('must_fix'));
    if (blockers.length === 0) {
      continue;
    }
    const uiRelated = blockers.some((finding) => /frontend|ux|a11y/i.test(finding.category));
    const securityRelated = blockers.some((finding) => /security/i.test(finding.category));
    const rootVerify = monorepo?.verify?.rootSmoke || [];
    fixTasks.push({
      id: `fix-${slugify(group.packageId)}`,
      owner: `fixer-${slugify(group.packageId)}`,
      mode: group.packagePath === '.' ? 'bounded_write' : 'bounded_write',
      title: `${group.packageName} blocker fixes`,
      focus: `Resolve ${blockers.length} must-fix finding(s) in ${group.packageName} before replaying review.`,
      scopePaths: group.packagePath === '.' ? group.files.slice(0, 12) : [group.packagePath, ...group.files.slice(0, 10)],
      writeScope: group.packagePath === '.' ? group.files.slice(0, 12) : [group.packagePath],
      findingRefs: blockers.map((finding) => ({
        file: finding.file,
        title: finding.title,
        severity: finding.severity,
        category: finding.category,
      })),
      dependsOn: ['synthesize-review'],
      acceptance: [
        'Every must-fix finding has an explicit code or test response.',
        uiRelated ? 'Touched UI surfaces still follow UI direction and state coverage expectations.' : 'No UI-specific acceptance needed for this task.',
        securityRelated ? 'Security-sensitive changes keep validation and threat assumptions explicit.' : 'Security posture stays neutral for this slice.',
      ],
      verifyCommands: [
        ...(group.verifyCommands || []).slice(0, 4),
        ...(uiRelated ? ['cwf ui-review'] : []),
        ...((rootVerify || []).slice(0, 2)),
      ],
    });
  }
  if (fixTasks.length === 0 && (review.blockers || []).length > 0) {
    fixTasks.push({
      id: 'fix-shared-surface',
      owner: 'fixer-shared',
      mode: 'bounded_write',
      title: 'Shared-surface blocker fixes',
      focus: 'Resolve blocker findings that span shared root files before re-review.',
      scopePaths: [...new Set((review.blockers || []).map((finding) => finding.file))].slice(0, 12),
      writeScope: [...new Set((review.blockers || []).map((finding) => finding.file))].slice(0, 12),
      findingRefs: (review.blockers || []).slice(0, 12).map((finding) => ({
        file: finding.file,
        title: finding.title,
        severity: finding.severity,
        category: finding.category,
      })),
      dependsOn: ['synthesize-review'],
      acceptance: [
        'Every blocker finding is addressed or consciously downgraded with evidence.',
      ],
      verifyCommands: ['cwf re-review'],
    });
  }
  return fixTasks;
}

function buildQuickWinTasks(packageGroups) {
  const tasks = [];
  for (const group of packageGroups) {
    const quickWins = group.findings.filter((finding) => ['should_fix', 'nice_to_have', 'follow_up'].includes(finding.severity)).slice(0, 4);
    if (quickWins.length === 0) {
      continue;
    }
    tasks.push({
      id: `quick-${slugify(group.packageId)}`,
      owner: `cleanup-${slugify(group.packageId)}`,
      mode: 'bounded_write',
      title: `${group.packageName} quick wins`,
      focus: `Capture low-risk cleanup and follow-up debt for ${group.packageName} without blocking closeout.`,
      scopePaths: group.packagePath === '.' ? group.files.slice(0, 8) : [group.packagePath, ...group.files.slice(0, 6)],
      writeScope: group.packagePath === '.' ? group.files.slice(0, 8) : [group.packagePath],
      findingRefs: quickWins.map((finding) => ({
        file: finding.file,
        title: finding.title,
        severity: finding.severity,
        category: finding.category,
      })),
      dependsOn: ['synthesize-review'],
      acceptance: [
        'Do not expand scope beyond fast follow-ups or cleanup.',
        'If a quick win turns risky, promote it to a separate task instead of hiding it inside the fix task.',
      ],
      verifyCommands: (group.verifyCommands || []).slice(0, 2),
    });
  }
  return tasks.slice(0, 6);
}

function buildVerifyWave(review, fixTasks, monorepo) {
  const wave = [];
  for (const task of fixTasks) {
    wave.push({
      id: `verify-${task.id}`,
      owner: `verifier-${task.owner}`,
      mode: 'targeted_verify',
      title: `${task.title} verification`,
      focus: `Run the fastest targeted verification for ${task.title}.`,
      scopePaths: task.scopePaths.slice(0, 12),
      dependsOn: [task.id],
      acceptance: [
        'Use package-local verification before escalating to repo-wide commands.',
        'Record the command output or artifact path in closeout notes.',
      ],
      verifyCommands: [...new Set(task.verifyCommands.filter(Boolean))].slice(0, 6),
    });
  }
  if (wave.length === 0) {
    wave.push({
      id: 'verify-review-surface',
      owner: 'verifier',
      mode: 'targeted_verify',
      title: 'Review surface verification',
      focus: 'Close the review loop with the lightest targeted verification available.',
      scopePaths: [],
      dependsOn: ['synthesize-review'],
      acceptance: [
        'Target changed packages or files first.',
      ],
      verifyCommands: monorepo?.verify?.rootSmoke?.slice(0, 4) || ['cwf review --heatmap'],
    });
  }
  if ((review.blockers || []).length > 0) {
    wave.push({
      id: 're-review-closeout',
      owner: 'review-lead',
      mode: 're_review',
      title: 'Re-review closeout',
      focus: 'Replay the latest review after blocker fixes and targeted verification land.',
      scopePaths: [],
      dependsOn: wave.map((task) => task.id),
      acceptance: [
        'All must-fix findings are resolved or downgraded with evidence.',
        'Any remaining should-fix or follow-up items are captured explicitly.',
      ],
      verifyCommands: ['cwf re-review', 'cwf ship-readiness'],
    });
  }
  return wave;
}

function buildReviewTaskGraph(cwd, rootDir, review, options = {}) {
  const monorepo = buildMonorepoIntelligence(cwd, rootDir, { writeFiles: true, maxWorkers: 4 });
  const orchestration = options.orchestration || buildReviewOrchestration(cwd, rootDir, review);
  const packageGroups = groupFindingsByPackage(review, monorepo);
  const triageTasks = buildTriageWave(orchestration);
  const fixTasks = buildFixTasks(packageGroups, monorepo, review);
  const quickWinTasks = buildQuickWinTasks(packageGroups);
  const verifyTasks = buildVerifyWave(review, fixTasks, monorepo);
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      findingCount: review.findings.length,
      blockerCount: review.blockers.length,
      packageCount: packageGroups.length,
      triageTaskCount: triageTasks.length,
      fixTaskCount: fixTasks.length,
      quickWinCount: quickWinTasks.length,
      verifyTaskCount: verifyTasks.length,
    },
    reviewArtifacts: review.artifacts,
    orchestration: {
      markdownFile: orchestration.markdownFile,
      jsonFile: orchestration.jsonFile,
      waveCount: orchestration.waves.length,
    },
    packageGroups: packageGroups.map((group) => ({
      packageId: group.packageId,
      packageName: group.packageName,
      packagePath: group.packagePath,
      blockerCount: group.blockerCount,
      shouldFixCount: group.shouldFixCount,
      followUpCount: group.followUpCount,
      categories: group.categories,
      files: group.files.slice(0, 12),
      verifyCommands: group.verifyCommands.slice(0, 6),
    })),
    waves: [
      {
        wave: 1,
        label: 'triage',
        rationale: 'Stay read-only while confirming package boundaries, ranking findings, and removing duplicates.',
        tasks: triageTasks,
      },
      {
        wave: 2,
        label: 'synthesis',
        rationale: 'Create one authoritative fix queue before asking write-capable agents to patch.',
        tasks: [
          {
            id: 'synthesize-review',
            owner: 'review-lead',
            mode: 'synthesis',
            title: 'Synthesize review findings',
            focus: 'Merge package/persona observations into a single blocker-first execution queue.',
            scopePaths: [],
            dependsOn: triageTasks.map((task) => task.id),
            acceptance: [
              'Must-fix items are separated from quick wins and follow-ups.',
              'Every fix task gets a verify command before execution starts.',
            ],
            verifyCommands: [],
          },
        ],
      },
      {
        wave: 3,
        label: 'fix',
        rationale: 'Bound write-capable work by package or shared surface so large repos stay mergeable.',
        tasks: [...fixTasks, ...quickWinTasks],
      },
      {
        wave: 4,
        label: 'verify',
        rationale: 'Verify only the changed or impacted surface, then replay review before closeout.',
        tasks: verifyTasks,
      },
    ],
  };

  const markdownPath = path.join(reviewReportsDir(cwd), 'review-task-graph.md');
  const jsonPath = path.join(reviewReportsDir(cwd), 'review-task-graph.json');
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, renderMarkdown(payload));
  writeJsonFile(jsonPath, payload);
  payload.markdownFile = relativePath(cwd, markdownPath);
  payload.jsonFile = relativePath(cwd, jsonPath);
  return payload;
}

function renderTask(task) {
  return [
    `### ${task.id}`,
    '',
    `- Owner: \`${task.owner}\``,
    `- Mode: \`${task.mode}\``,
    `- Title: ${task.title}`,
    `- Focus: ${task.focus}`,
    ...(task.scopePaths?.length ? [`- Scope: \`${task.scopePaths.join(', ')}\``] : []),
    ...(task.writeScope?.length ? [`- Write scope: \`${task.writeScope.join(', ')}\``] : []),
    ...(task.dependsOn?.length ? [`- Depends on: \`${task.dependsOn.join(', ')}\``] : []),
    ...(task.findingRefs?.length ? ['- Findings:', ...task.findingRefs.map((finding) => `  - [${finding.severity}] \`${finding.file}\` ${finding.title}`)] : []),
    ...(task.verifyCommands?.length ? ['- Verify:', ...task.verifyCommands.map((command) => `  - \`${command}\``)] : []),
    '',
    'Acceptance:',
    ...((task.acceptance || []).map((item) => `- [ ] ${item}`)),
    '',
  ].join('\n');
}

function renderMarkdown(payload) {
  const lines = [
    '# REVIEW TASK GRAPH',
    '',
    `- Generated at: \`${payload.generatedAt}\``,
    `- Findings: \`${payload.summary.findingCount}\``,
    `- Blockers: \`${payload.summary.blockerCount}\``,
    `- Packages: \`${payload.summary.packageCount}\``,
    `- Triage tasks: \`${payload.summary.triageTaskCount}\``,
    `- Fix tasks: \`${payload.summary.fixTaskCount}\``,
    `- Quick wins: \`${payload.summary.quickWinCount}\``,
    `- Verify tasks: \`${payload.summary.verifyTaskCount}\``,
    '',
    '## How To Use',
    '',
    '- Run wave 1 read-only triage first and keep it diff-scoped.',
    '- Use wave 2 to agree the blocker-first queue before editing code.',
    '- Run wave 3 with bounded write scopes per package/shared surface.',
    '- Finish with wave 4 targeted verification and re-review.',
    '',
    '## Package Summary',
    '',
    ...(payload.packageGroups.length > 0
      ? payload.packageGroups.map((group) => `- \`${group.packageName}\` blockers=${group.blockerCount} should_fix=${group.shouldFixCount} follow_up=${group.followUpCount} categories=${group.categories.join(', ') || 'none'}`)
      : ['- `No package grouping was needed.`']),
    '',
  ];

  for (const wave of payload.waves) {
    lines.push(`## Wave ${wave.wave} — ${wave.label}`);
    lines.push('');
    lines.push(`- ${wave.rationale}`);
    lines.push('');
    for (const task of wave.tasks) {
      lines.push(renderTask(task));
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function loadLatestReviewTaskGraph(cwd) {
  const jsonPath = path.join(reviewReportsDir(cwd), 'review-task-graph.json');
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return null;
  }
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

function printHelp() {
  console.log(`
review_task_graph

Usage:
  node scripts/workflow/review_task_graph.js

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --mode <name>       review|review-mode|pr-review|re-review
  --files <a;b;c>     Limit the review diff to explicit files
  --range <revset>    Review a git range such as HEAD~1..HEAD
  --diff-file <path>  Review a saved diff file
  --staged            Review staged changes
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
  const review = await runReviewEngine(cwd, rootDir, {
    mode: String(args.mode || 'review-mode').trim(),
    files: normalizeFileList(args.files),
    range: args.range ? String(args.range).trim() : '',
    diffFile: args['diff-file'] ? String(args['diff-file']).trim() : '',
    staged: Boolean(args.staged),
  });
  const orchestration = buildReviewOrchestration(cwd, rootDir, review);
  const payload = buildReviewTaskGraph(cwd, rootDir, review, { orchestration });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# REVIEW TASK GRAPH\n');
  console.log(`- File: \`${payload.markdownFile}\``);
  console.log(`- Waves: \`${payload.waves.length}\``);
  console.log(`- Fix tasks: \`${payload.summary.fixTaskCount}\``);
}

module.exports = {
  buildReviewTaskGraph,
  loadLatestReviewTaskGraph,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
