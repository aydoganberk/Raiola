const path = require('node:path');
const {
  ensureDir,
  getFieldValue,
  listGitChanges,
  readIfExists,
  resolveWorkflowRoot,
  tryExtractSection,
  workflowPaths,
  writeIfChanged,
} = require('./common');
const { buildBaseState } = require('./state_surface');
const { analyzeIntent } = require('./intent_engine');
const { selectCodexProfile, getCodexProfiles } = require('./codex_profile_engine');
const { buildUiDirection } = require('./design_intelligence');
const { buildMonorepoIntelligence } = require('./monorepo');
const { loadLatestReviewTaskGraph } = require('./review_task_graph');
const { buildCodexContextPack, frontendRequested } = require('./context_pack');
const {
  nowIso,
  relativePath,
  writeJsonFile,
} = require('./roadmap_os');
const {
  desiredCodexRoot,
  runtimeDir,
  scopeName,
} = require('./codex_control_catalog');

function buildIntentAnalysisForCodex(cwd, args) {
  const tailArgs = args._.slice(1).filter((item, index) => !(index === 0 && item === 'suggest'));
  const goal = String(args.goal || tailArgs.join(' ') || 'implement the next safe slice').trim();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const analysis = analyzeIntent(cwd, rootDir, goal);
  return {
    goal,
    rootDir,
    analysis,
  };
}

function readJsonIfExists(filePath) {
  const content = readIfExists(filePath);
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function loadLatestReviewOrchestration(cwd) {
  return readJsonIfExists(path.join(cwd, '.workflow', 'reports', 'review-orchestration.json'));
}

function buildCodexPromptPack(cwd, rootDir, goal, analysis, profile, options = {}) {
  const monorepo = analysis.repoSignals?.monorepo
    ? buildMonorepoIntelligence(cwd, rootDir, { writeFiles: true, maxWorkers: 4 })
    : null;
  const wantsFrontend = frontendRequested(analysis, null, { ...options, goal });
  const frontendDirection = wantsFrontend
    ? buildUiDirection(cwd, rootDir, { goal, taste: options.taste })
    : null;
  const reviewOrchestration = loadLatestReviewOrchestration(cwd);
  const reviewTaskGraph = loadLatestReviewTaskGraph(cwd);
  const contextPack = buildCodexContextPack(cwd, rootDir, goal, analysis, profile, {
    taste: options.taste,
    page: options.page,
    writeFiles: true,
  });
  const suggestedCommands = [
    ...analysis.verificationPlan,
    'cwf codex contextpack --goal "<goal>"',
    analysis.chosenCapability.domain === 'review' ? 'cwf review-tasks --json' : '',
    analysis.chosenCapability.domain === 'review' ? 'cwf review-orchestrate --json' : '',
    wantsFrontend ? 'cwf frontend-brief --json && cwf component-strategy --json && cwf ui-review' : '',
    monorepo ? 'cwf monorepo --json' : '',
  ].filter(Boolean);

  const lines = [
    '# CODEX PROMPT PACK',
    '',
    `- Goal: \`${goal}\``,
    `- Capability: \`${analysis.chosenCapability.id}\``,
    `- Profile: \`${profile.id}\``,
    `- Reasoning effort: \`${profile.reasoningEffort}\``,
    `- Context depth: \`${profile.contextDepth}\``,
    `- Verify policy: \`${profile.verifyPolicy}\``,
    `- Languages detected: \`${(analysis.languageMix?.matchedLanguages || []).join(', ') || 'neutral'}\``,
    '',
    '## Execution Posture',
    '',
    `- \`${profile.summary}\``,
    `- \`${analysis.chosenCapability.reasons[0] || 'Use the routed capability as the primary lane.'}\``,
    `- \`${profile.reasons[0] || 'Keep the Codex profile aligned to the task.'}\``,
    '',
    '## Route Why',
    '',
    ...[...analysis.chosenCapability.reasons, ...profile.reasons].slice(0, 8).map((item) => `- ${item}`),
    '',
    '## Suggested Commands',
    '',
    ...(suggestedCommands.length > 0 ? suggestedCommands.map((item) => `- \`${item}\``) : ['- `cwf next`']),
    '',
    '## Context Pack',
    '',
    `- File: \`${contextPack.file}\``,
    `- Attachments: \`${contextPack.attachments.length}\``,
    `- Compact preset paths: \`${contextPack.budgetPresets.compact.attachmentPaths.length}\``,
    ...(contextPack.focusFiles.length > 0 ? contextPack.focusFiles.slice(0, 8).map((item) => `- Focus: \`${item}\``) : ['- `No extra focus files inferred.`']),
    '',
    '## Verification Contract',
    '',
    ...(analysis.verificationPlan.length > 0
      ? analysis.verificationPlan.map((item) => `- \`${item}\``)
      : ['- `Route-specific verify plan not required yet.`']),
    '',
  ];

  if (frontendDirection) {
    lines.push('## Frontend Direction', '');
    lines.push(`- UI direction: \`${frontendDirection.file}\``);
    lines.push(`- Archetype: \`${frontendDirection.archetype.label}\``);
    lines.push(`- Taste profile: \`${frontendDirection.taste.profile.label}\``);
    lines.push(`- Taste signature: \`${frontendDirection.taste.tagline}\``);
    lines.push(`- Design DNA: \`${contextPack.frontend?.designDnaFile || 'n/a'}\``);
    lines.push(`- Page blueprint: \`${contextPack.frontend?.pageBlueprintFile || 'n/a'}\``);
    lines.push(`- DESIGN.md export: \`${contextPack.frontend?.designMdFile || 'n/a'}\``);
    lines.push(`- Component strategy: \`${contextPack.frontend?.componentStrategyFile || 'n/a'}\``);
    lines.push(`- Design benchmark: \`${contextPack.frontend?.designBenchmarkFile || 'n/a'}\``);
    lines.push(`- Product category: \`${contextPack.frontend?.productCategory?.label || 'n/a'}\``);
    lines.push(`- Reference blend: \`${contextPack.frontend?.referenceBlend?.summary || 'n/a'}\``);
    lines.push(`- Page type: \`${contextPack.frontend?.pageType?.label || 'n/a'}\``);
    lines.push(`- Recipe scaffold: \`${contextPack.frontend?.recipeFile || 'n/a'}\``);
    lines.push(`- Selected recipe: \`${contextPack.frontend?.selectedRecipe?.title || 'n/a'}\``);
    lines.push(`- Prototype mode: \`${frontendDirection.prototypeMode.mode}\` (${frontendDirection.prototypeMode.recommended ? 'recommended' : 'optional'})`);
    lines.push(...(contextPack.frontend?.pageSections || []).slice(0, 4).map((item) => `- Section: ${item.title} -> ${item.goal}`));
    lines.push(...(contextPack.frontend?.differentiationPlays || []).slice(0, 3).map((item) => `- Differentiation: ${item.title} -> ${item.move}`));
    lines.push(...(contextPack.frontend?.buildNow || []).slice(0, 3).map((item) => `- Build next: ${item.title} -> ${item.target}`));
    lines.push(...frontendDirection.semanticGuardrails.slice(0, 5).map((item) => `- Guardrail: ${item}`));
    lines.push(...frontendDirection.nativeFirstRecommendations.slice(0, 4).map((item) => `- Native first: ${item.title} -> ${item.native}`));
    lines.push(...frontendDirection.recipePack.slice(0, 3).map((item) => `- Recipe: ${item.title} -> ${item.structure}`));
    lines.push(...frontendDirection.codexRecipes.slice(0, 6).map((item) => `- ${item}`));
    lines.push('');
  }

  if (monorepo) {
    lines.push('## Monorepo Focus', '');
    lines.push(`- Monorepo file: \`${monorepo.markdownFile}\``);
    lines.push(`- Recommended write scopes: \`${monorepo.writeScopes.map((scope) => `${scope.worker}:${scope.paths.join(',')}`).join(' | ') || 'none'}\``);
    lines.push(`- Hotspots: \`${(monorepo.hotspots || []).slice(0, 3).map((item) => item.packageName).join(', ') || 'none'}\``);
    lines.push(...(monorepo.performanceRisks.length > 0 ? monorepo.performanceRisks.map((item) => `- ${item}`) : ['- `No monorepo-specific risk note.`']));
    lines.push('');
  }

  if (reviewOrchestration) {
    lines.push('## Review Orchestration', '');
    lines.push('- Latest review orchestration: `.workflow/reports/review-orchestration.md`');
    lines.push(`- Package groups: \`${reviewOrchestration.packageGroups?.length || 0}\``);
    lines.push(`- Waves: \`${reviewOrchestration.waves?.length || 0}\``);
    lines.push('');
  }

  if (reviewTaskGraph) {
    lines.push('## Review Task Graph', '');
    lines.push(`- Latest review task graph: \`${reviewTaskGraph.markdownFile || '.workflow/reports/review-task-graph.md'}\``);
    lines.push(`- Fix tasks: \`${reviewTaskGraph.summary?.fixTaskCount || 0}\``);
    lines.push(`- Verify tasks: \`${reviewTaskGraph.summary?.verifyTaskCount || 0}\``);
    lines.push(...(reviewTaskGraph.waves || []).slice(0, 2).flatMap((wave) => wave.tasks.slice(0, 3).map((task) => `- ${wave.label}: ${task.title}`)));
    lines.push('');
  }

  const markdown = `${lines.join('\n').trimEnd()}\n`;
  const markdownPath = path.join(runtimeDir(cwd), 'promptpack.md');
  const jsonPath = path.join(runtimeDir(cwd), 'promptpack.json');
  ensureDir(path.dirname(markdownPath));
  writeIfChanged(markdownPath, markdown);
  writeJsonFile(jsonPath, {
    generatedAt: nowIso(),
    goal,
    capability: analysis.chosenCapability.id,
    profile,
    routeWhy: [...analysis.chosenCapability.reasons, ...profile.reasons],
    verificationPlan: analysis.verificationPlan,
    suggestedCommands,
    languageMix: analysis.languageMix,
    contextPack: {
      file: contextPack.file,
      jsonFile: contextPack.jsonFile,
      attachments: contextPack.attachments.length,
      compactPreset: contextPack.budgetPresets.compact,
      focusFiles: contextPack.focusFiles,
    },
    frontendDirection: frontendDirection ? {
      file: frontendDirection.file,
      archetype: frontendDirection.archetype.label,
      taste: frontendDirection.taste.tagline,
      tasteProfile: frontendDirection.taste.profile,
      designDnaFile: contextPack.frontend?.designDnaFile || null,
      pageBlueprintFile: contextPack.frontend?.pageBlueprintFile || null,
      designMdFile: contextPack.frontend?.designMdFile || null,
      componentStrategyFile: contextPack.frontend?.componentStrategyFile || null,
      designBenchmarkFile: contextPack.frontend?.designBenchmarkFile || null,
      productCategory: contextPack.frontend?.productCategory || null,
      referenceBlend: contextPack.frontend?.referenceBlend || null,
      pageType: contextPack.frontend?.pageType || null,
      recipeFile: contextPack.frontend?.recipeFile || null,
      selectedRecipe: contextPack.frontend?.selectedRecipe || null,
      pageSections: contextPack.frontend?.pageSections || [],
      buildNow: contextPack.frontend?.buildNow || [],
      differentiationPlays: contextPack.frontend?.differentiationPlays || [],
      commodityRisks: contextPack.frontend?.commodityRisks || [],
      semanticGuardrails: frontendDirection.semanticGuardrails,
      nativeFirst: frontendDirection.nativeFirstRecommendations,
      recipePack: frontendDirection.recipePack,
      prototypeMode: frontendDirection.prototypeMode,
    } : null,
    monorepo: monorepo ? {
      markdownFile: monorepo.markdownFile,
      jsonFile: monorepo.jsonFile,
      writeScopes: monorepo.writeScopes,
      hotspots: monorepo.hotspots,
      performanceRisks: monorepo.performanceRisks,
    } : null,
    reviewOrchestration: reviewOrchestration ? {
      markdownFile: '.workflow/reports/review-orchestration.md',
      packageGroups: reviewOrchestration.packageGroups?.length || 0,
      waves: reviewOrchestration.waves?.length || 0,
    } : null,
    reviewTaskGraph: reviewTaskGraph ? {
      markdownFile: reviewTaskGraph.markdownFile || '.workflow/reports/review-task-graph.md',
      waveCount: reviewTaskGraph.waves?.length || 0,
      fixTaskCount: reviewTaskGraph.summary?.fixTaskCount || 0,
      verifyTaskCount: reviewTaskGraph.summary?.verifyTaskCount || 0,
    } : null,
  });
  return {
    file: relativePath(cwd, markdownPath),
    jsonFile: relativePath(cwd, jsonPath),
    contextPack: contextPack.file,
    frontendDirection: frontendDirection ? frontendDirection.file : null,
    monorepo: monorepo ? monorepo.markdownFile : null,
    reviewTaskGraph: reviewTaskGraph ? (reviewTaskGraph.markdownFile || '.workflow/reports/review-task-graph.md') : null,
  };
}

function doPromptPack(cwd, args) {
  const { goal, rootDir, analysis } = buildIntentAnalysisForCodex(cwd, args);
  const profile = selectCodexProfile({ analysis });
  const pack = buildCodexPromptPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  return {
    action: 'promptpack',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    goal,
    capability: analysis.chosenCapability.id,
    profile: profile.id,
    ...pack,
  };
}

function doContextPack(cwd, args) {
  const { goal, rootDir, analysis } = buildIntentAnalysisForCodex(cwd, args);
  const profile = selectCodexProfile({ analysis });
  const pack = buildCodexContextPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
    writeFiles: true,
  });
  return {
    action: 'contextpack',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    goal,
    capability: analysis.chosenCapability.id,
    profile: profile.id,
    file: pack.file,
    jsonFile: pack.jsonFile,
    attachmentCount: pack.attachments.length,
    compactPresetCount: pack.budgetPresets.compact.attachmentPaths.length,
    focusFiles: pack.focusFiles,
  };
}

function doProfileSuggest(cwd, args) {
  const { goal, rootDir, analysis } = buildIntentAnalysisForCodex(cwd, args);
  const profile = selectCodexProfile({ analysis });
  return {
    action: 'profile-suggest',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    goal,
    profile,
    capability: analysis.chosenCapability.id,
    confidence: analysis.confidence,
    why: profile.reasons,
    availableProfiles: getCodexProfiles().map((item) => item.id),
  };
}

function doBootstrap(cwd, args) {
  const { goal, rootDir, analysis } = buildIntentAnalysisForCodex(cwd, args);
  const profile = selectCodexProfile({ analysis });
  const promptPack = buildCodexPromptPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  const payload = {
    action: 'bootstrap',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    goal,
    capability: analysis.chosenCapability.id,
    fallbackCapability: analysis.fallbackCapability.id,
    confidence: analysis.confidence,
    profile,
    riskLane: analysis.risk.level,
    contextDepth: profile.contextDepth,
    verificationPolicy: profile.verifyPolicy,
    verificationPlan: analysis.verificationPlan,
    evidenceOutputs: analysis.evidenceOutputs,
    languageMix: analysis.languageMix,
    promptPack,
    contextPack: promptPack.contextPack || null,
    why: [
      ...analysis.chosenCapability.reasons,
      ...profile.reasons,
    ],
  };
  writeJsonFile(path.join(runtimeDir(cwd), 'bootstrap.json'), {
    generatedAt: nowIso(),
    ...payload,
  });
  return payload;
}

function buildResumeCard(cwd, rootDir) {
  const state = buildBaseState(cwd, rootDir);
  const paths = workflowPaths(rootDir, cwd);
  const status = readIfExists(paths.status) || '';
  const context = readIfExists(paths.context) || '';
  const validation = readIfExists(paths.validation) || '';
  const questions = readIfExists(path.join(rootDir, 'QUESTIONS.md')) || '';
  const openQuestions = tryExtractSection(questions, 'Open Questions', '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- /.test(line))
    .slice(0, 6);
  const nextActions = tryExtractSection(status, 'Next', '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- /.test(line))
    .slice(0, 6);
  const verification = tryExtractSection(validation, 'Validation Contract', '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const changedFiles = (() => {
    try {
      return listGitChanges(cwd).slice(0, 12);
    } catch {
      return [];
    }
  })();

  const markdown = `# RESUME CARD

- Milestone: \`${state.workflow.milestone}\`
- Step: \`${state.workflow.step}\`
- Goal: \`${getFieldValue(status, 'Current goal') || 'not recorded'}\`
- Changed files: \`${changedFiles.length}\`

## Last Touched Files

${changedFiles.length > 0 ? changedFiles.map((item) => `- \`${item}\``).join('\n') : '- `No git changes detected`'}

## Open Questions

${openQuestions.length > 0 ? openQuestions.join('\n') : '- `No open questions recorded`'}

## Next Best Actions

${nextActions.length > 0 ? nextActions.join('\n') : '- `No next action recorded`'}

## Verification Contract

${verification.length > 0 ? verification.map((item) => `- \`${item}\``).join('\n') : '- `No validation contract recorded`'}

## Context Note

${tryExtractSection(context, 'User Intent', '').trim() || '`No user intent note recorded`'}
`;

  const filePath = path.join(runtimeDir(cwd), 'resume-card.md');
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${markdown.trimEnd()}\n`);
  return {
    action: 'resume-card',
    scope: 'repo',
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, { repo: true }),
    file: relativePath(cwd, filePath),
    milestone: state.workflow.milestone,
    step: state.workflow.step,
    changedFiles,
    openQuestions,
    nextActions,
  };
}

function doResumeCard(cwd, args) {
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  return buildResumeCard(cwd, rootDir);
}

function doPlanSubagents(cwd, args) {
  const { goal, rootDir, analysis } = buildIntentAnalysisForCodex(cwd, args);
  const profile = selectCodexProfile({ analysis });
  const plan = [];
  const latestReviewOrchestration = loadLatestReviewOrchestration(cwd);
  const latestReviewTaskGraph = loadLatestReviewTaskGraph(cwd);
  const monorepo = analysis.repoSignals.monorepo
    ? buildMonorepoIntelligence(cwd, rootDir, { writeFiles: true, maxWorkers: 4 })
    : null;
  const wantsFrontend = frontendRequested(analysis, null, {
    goal,
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  const frontendDirection = wantsFrontend
    ? buildUiDirection(cwd, rootDir, { goal })
    : null;

  if (analysis.chosenCapability.domain === 'review' && latestReviewTaskGraph?.waves?.length) {
    for (const wave of latestReviewTaskGraph.waves.slice(0, 4)) {
      for (const task of wave.tasks.slice(0, 3)) {
        if (plan.length >= 8) {
          break;
        }
        plan.push({
          owner: task.owner,
          focus: `${task.title}: ${task.focus}`,
          scope: task.writeScope?.join(', ') || task.scopePaths?.join(', ') || 'review shard',
          mode: task.mode || (wave.label === 'fix' ? 'bounded_write' : 'parallel_readonly'),
        });
      }
      if (plan.length >= 8) {
        break;
      }
    }
  } else if (analysis.chosenCapability.domain === 'review' && latestReviewOrchestration?.waves?.length) {
    for (const wave of latestReviewOrchestration.waves.slice(0, 2)) {
      for (const task of wave.tasks.slice(0, 4)) {
        plan.push({
          owner: task.owner,
          focus: task.focus,
          scope: task.packagePath || task.readScope?.join(', ') || 'review shard',
          mode: task.mode || 'parallel_readonly',
        });
      }
    }
  } else if (analysis.chosenCapability.domain === 'review') {
    if (monorepo?.reviewShards?.length) {
      for (const shard of monorepo.reviewShards.slice(0, 4)) {
        plan.push({
          owner: shard.id,
          focus: shard.focus,
          scope: shard.readScope.join(', '),
          mode: 'parallel_readonly',
        });
      }
      for (const hotspot of monorepo.hotspots.slice(0, 2)) {
        plan.push({
          owner: `fix-${hotspot.packageId}`,
          focus: `${hotspot.packageName} blocker-first follow-up`,
          scope: hotspot.readFirst.join(', '),
          mode: 'bounded_write',
        });
      }
    } else {
      plan.push({ owner: 'worker-1', focus: 'correctness/perf/security review', scope: 'read-only changed files', mode: 'parallel_readonly' });
      plan.push({ owner: 'worker-2', focus: 'test-gap and replay review', scope: 'tests + workflow reports', mode: 'parallel_readonly' });
    }
  } else if (wantsFrontend) {
    plan.push({
      owner: 'worker-1',
      focus: frontendDirection ? `Apply UI direction (${frontendDirection.archetype.label}) with ${frontendDirection.taste.profile.label} taste while shaping shared primitives.` : 'UI spec + component inventory',
      scope: frontendDirection ? `${frontendDirection.file}, ${frontendDirection.profile.workflowRootRelative}/UI-SPEC.md, ${frontendDirection.profile.workflowRootRelative}/DESIGN-DNA.md, ${frontendDirection.profile.workflowRootRelative}/STATE-ATLAS.md, ${frontendDirection.profile.workflowRootRelative}/COMPONENT-STRATEGY.md, ${frontendDirection.profile.workflowRootRelative}/DESIGN-BENCHMARK.md` : 'docs/workflow/UI-*.md, DESIGN-DNA.md, STATE-ATLAS.md, COMPONENT-STRATEGY.md, DESIGN-BENCHMARK.md, and component map',
      mode: 'bounded',
    });
    plan.push({ owner: 'worker-2', focus: 'browser evidence + responsive review', scope: 'preview/browser verification only', mode: 'parallel_readonly' });
  } else if (monorepo?.writeScopes?.length) {
    for (const scope of monorepo.writeScopes.slice(0, 3)) {
      plan.push({
        owner: scope.worker,
        focus: `${scope.packageName} delta`,
        scope: scope.paths.join(', '),
        mode: 'bounded',
      });
    }
    for (const hotspot of monorepo.hotspots.slice(0, 2)) {
      plan.push({
        owner: `reader-${hotspot.packageId}`,
        focus: `${hotspot.packageName} hotspot triage`,
        scope: hotspot.readFirst.join(', '),
        mode: 'parallel_readonly',
      });
    }
    plan.push({
      owner: 'verifier',
      focus: 'cross-package verification',
      scope: monorepo.verify.perPackage.flatMap((item) => item.commands).slice(0, 4).join(' | ') || 'impacted tests',
      mode: 'parallel_readonly',
    });
  } else {
    plan.push({ owner: 'worker-1', focus: 'supporting exploration or verification', scope: 'read-only supporting files', mode: 'parallel_readonly' });
  }

  const promptPack = buildCodexPromptPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  return {
    action: 'plan-subagents',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    goal,
    capability: analysis.chosenCapability.id,
    profile: profile.id,
    suggestedPlan: plan,
    promptPack: promptPack.file,
    contextPack: promptPack.contextPack || null,
    reviewTaskGraph: promptPack.reviewTaskGraph || null,
  };
}

module.exports = {
  buildCodexPromptPack,
  buildIntentAnalysisForCodex,
  buildResumeCard,
  doBootstrap,
  doContextPack,
  doPlanSubagents,
  doProfileSuggest,
  doPromptPack,
  doResumeCard,
};
