const fs = require('node:fs');
const path = require('node:path');
const {
  listGitChanges,
  parseArgs,
  readIfExists,
  resolveWorkflowRoot,
  writeIfChanged,
  workflowPaths,
} = require('./common');
const { buildCodebaseMap } = require('./map_codebase');
const { buildComponentInventoryDoc } = require('./component_inventory');
const { buildUiDirection } = require('./design_intelligence');
const { buildUiRecipeScaffold } = require('./ui_recipe');
const { buildUiSpec } = require('./ui_spec');
const { buildMonorepoIntelligence } = require('./monorepo');
const { loadLatestReviewTaskGraph } = require('./review_task_graph');
const { relativePath, writeJsonFile } = require('./roadmap_os');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function reviewReportsDir(cwd) {
  return path.join(cwd, '.workflow', 'reports');
}

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'codex-control');
}

function fileEstimateTokens(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return 0;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return Math.max(40, Math.round(content.length / 4));
  } catch {
    const bytes = fs.statSync(filePath).size;
    return Math.max(40, Math.round(bytes / 4));
  }
}

function pushAttachment(attachments, cwd, filePath, payload = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const relative = relativePath(cwd, filePath);
  if (attachments.some((entry) => entry.path === relative)) {
    return;
  }
  attachments.push({
    id: payload.id || path.basename(filePath, path.extname(filePath)).toLowerCase(),
    title: payload.title || path.basename(filePath),
    path: relative,
    required: payload.required !== false,
    reason: payload.reason || 'Relevant to the current Codex task.',
    lane: payload.lane || 'core',
    estimatedTokens: payload.estimatedTokens || fileEstimateTokens(filePath),
    priority: payload.priority || 'recommended',
  });
}

function collectWorkflowAttachments(cwd, rootDir, analysis) {
  const attachments = [];
  const paths = workflowPaths(rootDir, cwd);
  const domain = analysis?.chosenCapability?.domain || 'execute';
  pushAttachment(attachments, cwd, paths.status, {
    id: 'status',
    title: 'Workflow status',
    reason: 'Carries the current milestone, next action, and resume-safe state.',
    lane: 'workflow',
    priority: 'core',
  });
  pushAttachment(attachments, cwd, paths.context, {
    id: 'context',
    title: 'Workflow context',
    reason: 'Captures user intent, constraints, touched files, and problem framing.',
    lane: 'workflow',
    priority: 'core',
  });

  if (['plan', 'execute', 'review', 'ship', 'incident'].includes(domain)) {
    pushAttachment(attachments, cwd, paths.execplan, {
      id: 'execplan',
      title: 'Execution plan',
      reason: 'Specifies the current implementation sequence and scope guardrails.',
      lane: 'workflow',
      priority: 'core',
    });
  }

  if (['execute', 'review', 'verify', 'ship', 'incident', 'frontend'].includes(domain)) {
    pushAttachment(attachments, cwd, paths.validation, {
      id: 'validation',
      title: 'Validation contract',
      reason: 'Defines verification expectations and evidence requirements.',
      lane: 'workflow',
      priority: 'recommended',
    });
  }

  if (['ship', 'incident'].includes(domain)) {
    pushAttachment(attachments, cwd, paths.handoff, {
      id: 'handoff',
      title: 'Handoff',
      reason: 'Useful when the Codex session should close cleanly or hand work forward.',
      lane: 'workflow',
      priority: 'optional',
    });
  }

  return attachments;
}

function collectRepoAttachments(cwd, rootDir) {
  const attachments = [];
  const codebaseMap = buildCodebaseMap(cwd, rootDir, {
    refreshMode: 'incremental',
    scopeKind: 'workstream',
    writeFiles: true,
  });
  pushAttachment(attachments, cwd, codebaseMap.files.markdown, {
    id: 'codebase-map',
    title: 'Codebase map',
    reason: 'Compact repo map with architecture, testing, risk, and stack lanes.',
    lane: 'repo',
    priority: 'recommended',
  });
  for (const [surfaceId, surfacePath] of Object.entries(codebaseMap.files.surfaces || {})) {
    pushAttachment(attachments, cwd, surfacePath, {
      id: `surface-${surfaceId}`,
      title: `${surfaceId} surface`,
      reason: `Use only when the task needs deeper ${surfaceId} context.`,
      lane: 'repo',
      priority: ['architecture', 'stack', 'testing'].includes(surfaceId) ? 'optional' : 'defer',
    });
  }
  return {
    attachments,
    codebaseMap,
  };
}

function collectFrontendAttachments(cwd, rootDir, analysis, options = {}) {
  if (!(analysis?.chosenCapability?.domain === 'frontend' || analysis?.repoSignals?.frontendActive)) {
    return null;
  }
  const direction = buildUiDirection(cwd, rootDir, {
    goal: options.goal,
    taste: options.taste,
  });
  const spec = buildUiSpec(cwd, rootDir, {
    goal: options.goal,
    taste: options.taste,
  });
  const recipe = buildUiRecipeScaffold(cwd, rootDir, {
    goal: options.goal,
    taste: options.taste,
  });
  const inventory = buildComponentInventoryDoc(cwd, rootDir);
  const attachments = [];
  pushAttachment(attachments, cwd, path.join(rootDir, 'UI-DIRECTION.md'), {
    id: 'ui-direction',
    title: 'UI direction',
    reason: 'Taste-aware design brief for Codex-generated UI changes.',
    lane: 'frontend',
    priority: 'core',
  });
  pushAttachment(attachments, cwd, path.join(rootDir, 'UI-SPEC.md'), {
    id: 'ui-spec',
    title: 'UI specification',
    reason: 'Flow, state, responsive, and accessibility contract for frontend work.',
    lane: 'frontend',
    priority: 'recommended',
  });
  pushAttachment(attachments, cwd, path.join(rootDir, 'UI-RECIPE.md'), {
    id: 'ui-recipe',
    title: 'UI recipe scaffold',
    reason: 'Framework-aware scaffold with semantic prototype and stack translation notes.',
    lane: 'frontend',
    priority: 'recommended',
  });
  pushAttachment(attachments, cwd, path.join(rootDir, 'COMPONENT-INVENTORY.md'), {
    id: 'component-inventory',
    title: 'Component inventory',
    reason: 'Shared component surface plus primitive normalization opportunities.',
    lane: 'frontend',
    priority: 'optional',
  });
  return {
    direction,
    spec,
    recipe,
    inventory,
    attachments,
  };
}

function frontendRequested(analysis, frontend) {
  return Boolean(
    frontend
      || analysis?.chosenCapability?.domain === 'frontend'
      || analysis?.repoSignals?.frontendActive,
  );
}

function collectReviewAttachments(cwd, analysis) {
  if (!(analysis?.chosenCapability?.domain === 'review' || analysis?.chosenCapability?.domain === 'verify')) {
    return null;
  }
  const attachments = [];
  const reviewDir = reviewReportsDir(cwd);
  const taskGraph = loadLatestReviewTaskGraph(cwd);
  pushAttachment(attachments, cwd, path.join(reviewDir, 'review.md'), {
    id: 'review-report',
    title: 'Review report',
    reason: 'Current review findings and heatmap summary.',
    lane: 'review',
    priority: 'recommended',
  });
  pushAttachment(attachments, cwd, path.join(reviewDir, 'review-orchestration.md'), {
    id: 'review-orchestration',
    title: 'Review orchestration',
    reason: 'Package/persona/wave split for large-repo review coverage.',
    lane: 'review',
    priority: 'recommended',
  });
  if (taskGraph?.markdownFile) {
    pushAttachment(attachments, cwd, path.join(cwd, taskGraph.markdownFile), {
      id: 'review-task-graph',
      title: 'Review task graph',
      reason: 'Step-by-step triage, fix, verify, and re-review workflow for Codex.',
      lane: 'review',
      priority: 'core',
    });
  }
  return {
    attachments,
    taskGraph,
  };
}

function collectMonorepoAttachments(cwd, rootDir, analysis) {
  if (!analysis?.repoSignals?.monorepo) {
    return null;
  }
  const monorepo = buildMonorepoIntelligence(cwd, rootDir, { writeFiles: true, maxWorkers: 4 });
  const attachments = [];
  pushAttachment(attachments, cwd, path.join(cwd, monorepo.markdownFile), {
    id: 'monorepo',
    title: 'Monorepo intelligence',
    reason: 'Package-local write scopes, hotspots, and verify strategy for large repos.',
    lane: 'monorepo',
    priority: 'core',
  });
  return {
    monorepo,
    attachments,
  };
}

function uniqueByPath(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.path || seen.has(item.path)) {
      return false;
    }
    seen.add(item.path);
    return true;
  });
}

function attachmentIds(items) {
  return items.map((item) => item.path);
}

function isUsefulFocusPath(filePath) {
  return Boolean(filePath)
    && !String(filePath).endsWith('/')
    && !/^(?:\.git|node_modules|dist|build|coverage|\.next)\//.test(String(filePath))
    && !/^\.(?:workflow)(?:\/|$)/.test(String(filePath));
}

function focusPathPriority(filePath) {
  const value = String(filePath || '');
  if (value === 'package.json' || value === 'README.md' || value === 'AGENTS.md') {
    return 0;
  }
  if (/^(?:scripts|src|app|pages|components|lib|packages)\//.test(value)) {
    return 0;
  }
  if (/^docs\/workflow\//.test(value)) {
    return 1;
  }
  if (/^docs\//.test(value)) {
    return 2;
  }
  if (/^tests\//.test(value)) {
    return 3;
  }
  return 2;
}

function buildBudgetPreset(targetTokens, attachments) {
  const selected = [];
  let total = 0;
  for (const attachment of attachments) {
    if (selected.length > 0 && total + attachment.estimatedTokens > targetTokens) {
      continue;
    }
    selected.push(attachment);
    total += attachment.estimatedTokens;
  }
  return {
    targetTokens,
    estimatedTokens: total,
    attachmentPaths: attachmentIds(selected),
  };
}

function buildContextSlices(cwd, analysis, inputs) {
  const slices = [];
  const workflowPaths = inputs.workflow.attachments.map((item) => item.path);
  slices.push({
    id: 'operator-spine',
    label: 'Operator spine',
    reason: 'Minimum workflow state needed to resume safely.',
    attachmentPaths: workflowPaths.slice(0, 4),
  });
  slices.push({
    id: 'repo-map',
    label: 'Repo map',
    reason: 'Compact architecture and quality map before broad file reads.',
    attachmentPaths: inputs.repo.attachments.slice(0, 4).map((item) => item.path),
  });

  if (inputs.monorepo?.monorepo) {
    const scopePaths = (inputs.monorepo.monorepo.contextSlices || [])
      .slice(0, 3)
      .flatMap((slice) => slice.readFirst || []);
    slices.push({
      id: 'monorepo-hotset',
      label: 'Monorepo hotset',
      reason: 'Top changed/impacted packages and their recommended read-first scope.',
      attachmentPaths: uniqueByPath(inputs.monorepo.attachments).map((item) => item.path),
      scopePaths: [...new Set(scopePaths)].slice(0, 12),
    });
  }

  if (inputs.frontend?.direction) {
    slices.push({
      id: 'frontend-direction',
      label: 'Frontend direction',
      reason: 'Design taste, tokens, and acceptance bar for UI work.',
      attachmentPaths: inputs.frontend.attachments.map((item) => item.path),
    });
  }

  if (inputs.review?.taskGraph) {
    slices.push({
      id: 'review-flow',
      label: 'Review flow',
      reason: 'Step-by-step review/fix/verify sequence for the latest diff.',
      attachmentPaths: inputs.review.attachments.map((item) => item.path),
    });
  }

  if (analysis?.chosenCapability?.domain === 'review') {
    slices.push({
      id: 'verification-closeout',
      label: 'Verification closeout',
      reason: 'Keep re-review and verification commands visible during fix execution.',
      attachmentPaths: inputs.review?.attachments?.slice(0, 3).map((item) => item.path) || [],
    });
  }

  return slices;
}

function buildFocusFiles(cwd, inputs) {
  const focus = [];
  const monorepo = inputs.monorepo?.monorepo;
  for (const scope of monorepo?.writeScopes || []) {
    focus.push(...scope.paths.slice(0, 4));
  }
  for (const hotspot of monorepo?.hotspots || []) {
    focus.push(...(hotspot.readFirst || []).slice(0, 4));
  }
  const reviewTaskGraph = inputs.review?.taskGraph;
  for (const wave of reviewTaskGraph?.waves || []) {
    for (const task of wave.tasks || []) {
      focus.push(...(task.scopePaths || []).slice(0, 4));
    }
  }
  if (inputs.frontend?.direction) {
    focus.push(...inputs.frontend.direction.uiFilePreview.slice(0, 8));
    focus.push(...inputs.frontend.direction.inventoryPreview.slice(0, 6));
  }
  const repoMap = inputs.repo?.codebaseMap;
  focus.push(...(repoMap?.repo?.changedFiles || []).slice(0, 10));
  focus.push(...(repoMap?.lanes?.stack?.inputs || []).slice(0, 8));
  focus.push(...(repoMap?.lanes?.architecture?.data?.sampleAppFiles || []).slice(0, 8));
  focus.push(...(repoMap?.lanes?.architecture?.data?.workstreamRefs || []).slice(0, 8));
  focus.push(...(inputs.workflow?.attachments || []).map((item) => item.path).slice(0, 6));

  if (focus.length === 0) {
    try {
      focus.push(...listGitChanges(cwd).slice(0, 8));
    } catch {
      // Best-effort fallback only.
    }
  }

  return [...new Set(focus.filter(isUsefulFocusPath))]
    .map((filePath, index) => ({
      filePath,
      index,
      priority: focusPathPriority(filePath),
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((entry) => entry.filePath)
    .slice(0, 24);
}

function buildAvoidPatterns() {
  return [
    'node_modules/**',
    '.git/**',
    '.workflow/cache/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.next/**',
    '**/*.snap',
    '**/generated/**',
  ];
}

function renderMarkdown(payload) {
  const lines = [
    '# CODEX CONTEXT PACK',
    '',
    `- Goal: \`${payload.goal}\``,
    `- Capability: \`${payload.capability}\``,
    `- Profile: \`${payload.profile.id}\``,
    `- Languages: \`${(payload.languageMix?.matchedLanguages || []).join(', ') || 'neutral'}\``,
    `- Total attachments: \`${payload.attachments.length}\``,
    '',
    '## Read Order',
    '',
    ...payload.readOrder.map((item, index) => `- ${index + 1}. \`${item.title}\` -> \`${item.path}\` (${item.reason})`),
    '',
    '## Context Slices',
    '',
    ...payload.contextSlices.flatMap((slice) => [
      `### ${slice.label}`,
      '',
      `- Reason: ${slice.reason}`,
      ...(slice.attachmentPaths?.length ? [`- Attach: \`${slice.attachmentPaths.join(', ')}\``] : []),
      ...(slice.scopePaths?.length ? [`- Focus paths: \`${slice.scopePaths.join(', ')}\``] : []),
      '',
    ]),
    '## Budget Presets',
    '',
    ...Object.entries(payload.budgetPresets).flatMap(([name, preset]) => [
      `### ${name}`,
      '',
      `- Target tokens: \`${preset.targetTokens}\``,
      `- Estimated tokens: \`${preset.estimatedTokens}\``,
      ...(preset.attachmentPaths.length > 0 ? preset.attachmentPaths.map((item) => `- \`${item}\``) : ['- `No attachments selected.`']),
      '',
    ]),
    '## Focus Files',
    '',
    ...(payload.focusFiles.length > 0 ? payload.focusFiles.map((item) => `- \`${item}\``) : ['- `No extra focus files inferred.`']),
    '',
    ...(payload.frontend ? [
      '## Frontend Guidance',
      '',
      `- Taste signature: \`${payload.frontend.taste}\``,
      `- Prototype mode: \`${payload.frontend.prototypeMode?.mode || 'n/a'}\` (${payload.frontend.prototypeMode?.recommended ? 'recommended' : 'optional'})`,
      ...(payload.frontend.semanticGuardrails || []).map((item) => `- Guardrail: ${item}`),
      ...(payload.frontend.nativeFirst || []).slice(0, 4).map((item) => `- Native first: \`${item.title}\` -> \`${item.native}\``),
      ...(payload.frontend.recipePack || []).slice(0, 4).map((item) => `- Recipe: \`${item.title}\` -> ${item.structure}`),
      '',
    ] : []),
    '## Avoid By Default',
    '',
    ...payload.avoidPatterns.map((item) => `- \`${item}\``),
    '',
    '## Suggested Next Commands',
    '',
    ...(payload.suggestedCommands.length > 0 ? payload.suggestedCommands.map((item) => `- \`${item}\``) : ['- `cwf next`']),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildCodexContextPack(cwd, rootDir, goal, analysis, profile, options = {}) {
  const workflow = {
    attachments: collectWorkflowAttachments(cwd, rootDir, analysis),
  };
  const repo = collectRepoAttachments(cwd, rootDir);
  const monorepo = collectMonorepoAttachments(cwd, rootDir, analysis);
  const frontend = collectFrontendAttachments(cwd, rootDir, analysis, options);
  const review = collectReviewAttachments(cwd, analysis);
  const attachments = uniqueByPath([
    ...workflow.attachments,
    ...repo.attachments,
    ...(monorepo?.attachments || []),
    ...(frontend?.attachments || []),
    ...(review?.attachments || []),
  ]);
  const readOrder = [
    ...attachments.filter((item) => item.priority === 'core'),
    ...attachments.filter((item) => item.priority === 'recommended'),
    ...attachments.filter((item) => item.priority === 'optional'),
    ...attachments.filter((item) => item.priority === 'defer'),
  ];
  const contextSlices = buildContextSlices(cwd, analysis, {
    workflow,
    repo,
    monorepo,
    frontend,
    review,
  });
  const focusFiles = buildFocusFiles(cwd, {
    workflow,
    repo,
    monorepo,
    frontend,
    review,
  });
  const budgetPresets = {
    compact: buildBudgetPreset(1400, readOrder.filter((item) => ['core', 'recommended'].includes(item.priority))),
    balanced: buildBudgetPreset(2800, readOrder),
    deep: buildBudgetPreset(4200, [...readOrder, ...attachments.filter((item) => item.priority === 'defer')]),
  };
  const avoidPatterns = buildAvoidPatterns();
  const wantsFrontend = frontendRequested(analysis, frontend);
  const suggestedCommands = [
    'cwf codex promptpack --goal "<goal>"',
    analysis?.chosenCapability?.domain === 'review' ? 'cwf review-tasks --json' : '',
    analysis?.repoSignals?.monorepo ? 'cwf monorepo --json' : '',
    wantsFrontend ? 'cwf ui-direction --json' : '',
    wantsFrontend ? 'cwf ui-spec --json' : '',
    wantsFrontend ? 'cwf ui-recipe --json' : '',
  ].filter(Boolean);

  const payload = {
    generatedAt: new Date().toISOString(),
    goal,
    capability: analysis?.chosenCapability?.id || 'unknown',
    lane: analysis?.lane || 'unknown',
    profile,
    languageMix: analysis?.languageMix || { matchedLanguages: [] },
    attachments,
    readOrder,
    contextSlices,
    focusFiles,
    avoidPatterns,
    budgetPresets,
    suggestedCommands,
    monorepo: monorepo?.monorepo ? {
      markdownFile: monorepo.monorepo.markdownFile,
      hotspots: monorepo.monorepo.hotspots || [],
      contextSlices: monorepo.monorepo.contextSlices || [],
    } : null,
    frontend: frontend?.direction ? {
      file: frontend.direction.file,
      specFile: frontend.spec?.file || null,
      recipeFile: frontend.recipe?.file || null,
      componentInventoryFile: frontend.inventory?.file || null,
      taste: frontend.direction.taste.tagline,
      tasteProfile: frontend.direction.taste.profile || null,
      tokens: frontend.direction.designTokens || null,
      experienceThesis: frontend.direction.experienceThesis || null,
      semanticGuardrails: frontend.direction.semanticGuardrails || [],
      nativeFirst: frontend.direction.nativeFirstRecommendations || [],
      recipePack: frontend.direction.recipePack || [],
      prototypeMode: frontend.direction.prototypeMode || null,
      selectedRecipe: frontend.recipe?.recipe || null,
      signatureMoments: frontend.direction.signatureMoments || [],
      screenBlueprints: frontend.direction.screenBlueprints || [],
    } : null,
    review: review?.taskGraph ? {
      markdownFile: review.taskGraph.markdownFile,
      waveCount: review.taskGraph.waves.length,
      fixTaskCount: review.taskGraph.summary?.fixTaskCount || 0,
    } : null,
  };

  if (options.writeFiles !== false) {
    const dir = runtimeDir(cwd);
    ensureDir(dir);
    const markdownPath = path.join(dir, 'contextpack.md');
    const jsonPath = path.join(dir, 'contextpack.json');
    writeIfChanged(markdownPath, renderMarkdown(payload));
    writeJsonFile(jsonPath, payload);
    payload.file = relativePath(cwd, markdownPath);
    payload.jsonFile = relativePath(cwd, jsonPath);
  }

  return payload;
}

function printHelp() {
  console.log(`
context_pack

Usage:
  node scripts/workflow/context_pack.js --goal "review the auth diff"

Options:
  --goal <text>   Goal text for routing and context shaping
  --root <path>   Workflow root. Defaults to active workstream root
  --taste <id>    Optional explicit taste profile for frontend packs
  --json          Print machine-readable output
  `);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const goal = String(args.goal || args._.join(' ') || 'build the right Codex context pack').trim();
  const analysis = optionsAnalyzeIntent(cwd, rootDir, goal);
  const payload = buildCodexContextPack(cwd, rootDir, goal, analysis.analysis, analysis.profile, {
    taste: args.taste,
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# CODEX CONTEXT PACK\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Attachments: \`${payload.attachments.length}\``);
  console.log(`- Compact preset: \`${payload.budgetPresets.compact.attachmentPaths.length}\` files`);
}

function optionsAnalyzeIntent(cwd, rootDir, goal) {
  const { analyzeIntent } = require('./intent_engine');
  const { selectCodexProfile } = require('./codex_profile_engine');
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const profile = selectCodexProfile({ analysis });
  return {
    analysis,
    profile,
  };
}

module.exports = {
  buildCodexContextPack,
  main,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
