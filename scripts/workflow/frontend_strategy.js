const path = require('node:path');
const {
  buildFrontendProfile,
  buildMissingStateAudit,
  buildPrimitiveContractAudit,
  buildPrimitiveOpportunityAudit,
  collectComponentInventory,
  relativePath,
  writeDoc,
} = require('./frontend_os');
const { writeRuntimeJson } = require('./runtime_helpers');

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function tokenize(...values) {
  return unique(values
    .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 3));
}

function scoreComponentForSection(item, section) {
  const componentTokens = tokenize(item.name, item.file);
  const sectionTokens = tokenize(section.id, section.title, section.goal, ...(section.components || []));
  let score = 0;
  for (const token of componentTokens) {
    if (sectionTokens.includes(token)) {
      score += 2;
    }
  }
  if (item.shared) {
    score += 1;
  }
  if (item.responsiveHint && sectionTokens.some((token) => ['hero', 'layout', 'grid', 'page', 'rail', 'panel', 'card'].includes(token))) {
    score += 1;
  }
  return score;
}

function componentCueForSection(section) {
  const haystack = `${section.id} ${section.title} ${(section.components || []).join(' ')}`.toLowerCase();
  if (/\b(table|comparison|grid|row|column|data)\b/.test(haystack)) {
    return 'table or comparison primitive';
  }
  if (/\b(filter|search|toggle|segmented|scope)\b/.test(haystack)) {
    return 'filter/search control bar';
  }
  if (/\b(hero|headline|cta|proof|logo|metric)\b/.test(haystack)) {
    return 'hero/proof section shell';
  }
  if (/\b(timeline|activity|event|log|process|stepper)\b/.test(haystack)) {
    return 'timeline or stepper block';
  }
  if (/\b(form|faq|checkout|booking|billing)\b/.test(haystack)) {
    return 'form/disclosure shell';
  }
  if (/\b(panel|inspector|detail|drawer|modal)\b/.test(haystack)) {
    return 'detail panel or dialog primitive';
  }
  return 'shared section shell';
}

function buildSectionCoverage(inventory, pageBlueprint) {
  return pageBlueprint.sections.map((section) => {
    const matches = inventory
      .map((item) => ({ item, score: scoreComponentForSection(item, section) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    const sharedMatches = matches.filter((entry) => entry.item.shared);
    return {
      section,
      bestShared: sharedMatches[0] || null,
      bestAny: matches[0] || null,
      matches: matches.slice(0, 4).map((entry) => ({
        name: entry.item.name,
        file: entry.item.file,
        shared: entry.item.shared,
        score: entry.score,
      })),
    };
  });
}

function buildReuseNow(coverage) {
  const seenFiles = new Set();
  const items = [];
  for (const entry of coverage) {
    if (!entry.bestShared || entry.bestShared.score < 2 || seenFiles.has(entry.bestShared.item.file)) {
      continue;
    }
    seenFiles.add(entry.bestShared.item.file);
    items.push({
      title: entry.bestShared.item.name,
      file: entry.bestShared.item.file,
      section: entry.section.title,
      reason: `${entry.bestShared.item.name} already overlaps ${entry.section.title.toLowerCase()} and should be reused before adding page-local UI.`,
    });
  }
  return items.slice(0, 6);
}

function buildExtractNow(coverage, primitiveOpportunities) {
  const items = [];
  const seen = new Set();

  for (const entry of coverage) {
    if (entry.bestShared || !entry.bestAny || entry.bestAny.score < 2 || entry.bestAny.item.shared) {
      continue;
    }
    const key = entry.bestAny.item.file;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      title: `Promote ${entry.bestAny.item.name}`,
      source: entry.bestAny.item.file,
      reason: `${entry.bestAny.item.name} looks like the closest fit for ${entry.section.title.toLowerCase()}, but it currently lives in a page-local surface.`,
      move: `Extract it into a shared ${componentCueForSection(entry.section)} so later sections can reuse the same contract.`,
    });
  }

  for (const opportunity of primitiveOpportunities.opportunities) {
    if (items.length >= 6) {
      break;
    }
    const key = `${opportunity.id}:${opportunity.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      title: opportunity.title,
      source: opportunity.evidence.join(', '),
      reason: opportunity.recommendation,
      move: opportunity.stackTranslation,
    });
  }

  return items.slice(0, 6);
}

function buildBuildNow(coverage, stateAtlas, missingStateAudit, primitiveContractAudit) {
  const items = [];

  for (const entry of coverage) {
    if (entry.bestAny && entry.bestAny.score >= 2) {
      continue;
    }
    items.push({
      title: `Build ${entry.section.title}`,
      target: componentCueForSection(entry.section),
      reason: `No existing component strongly matches ${entry.section.title.toLowerCase()}, so this section needs a fresh shared shell.`,
      states: entry.section.states,
    });
  }

  const missingRequired = stateAtlas.states
    .filter((entry) => entry.priority === 'required')
    .filter((entry) => entry.evidenceSignals.some((signal) => missingStateAudit.missing.includes(signal)));
  if (missingRequired.length > 0) {
    items.push({
      title: 'Build the shared async-state family',
      target: 'loading / empty / error / success primitives',
      reason: `Required state evidence is still missing for ${missingRequired.map((entry) => entry.id).join(', ')}.`,
      states: unique(missingRequired.flatMap((entry) => entry.evidenceSignals)),
    });
  }

  const contractIssues = primitiveContractAudit.issues
    .filter((issue) => ['dialog', 'menu', 'table', 'feedback', 'disclosure'].includes(issue.primitive))
    .slice(0, 2);
  for (const issue of contractIssues) {
    items.push({
      title: `Stabilize the ${issue.primitive} contract`,
      target: issue.file,
      reason: issue.detail,
      states: [],
    });
  }

  return items.slice(0, 6);
}

function buildComponentPolicy(profile, designDna, pageBlueprint) {
  return [
    `Favor the active ${profile.uiSystem.primary} stack before introducing a second component vocabulary.`,
    `Keep ${pageBlueprint.pageType.label.toLowerCase()} sections as shells that compose shared primitives instead of hard-coding all behavior into one page file.`,
    `Use ${designDna.productCategory.label.toLowerCase()} expectations as the tie-breaker when deciding between dense utility and decorative marketing polish.`,
    'Extract repeated page-local blocks as named primitives as soon as a second section or screen needs them.',
    'Land shared state primitives in the same pass as section scaffolds so new screens inherit resilience by default.',
  ];
}

function buildComponentRisks(profile, missingStateAudit, primitiveContractAudit, inventory) {
  const risks = [];
  if (inventory.filter((item) => item.shared).length < 3) {
    risks.push('Shared component inventory is still thin, so external-site work may fragment into page-local JSX unless extraction happens early.');
  }
  if (missingStateAudit.missing.length > 0) {
    risks.push(`State evidence is still missing for ${missingStateAudit.missing.join(', ')}, so implementation could drift toward happy-path-only UI.`);
  }
  if (primitiveContractAudit.issueCount > 0) {
    risks.push(`${primitiveContractAudit.issueCount} primitive-contract gaps were detected across repeated UI patterns.`);
  }
  if (!/tailwind|css modules|styled/i.test(profile.styling.detected.join(' '))) {
    risks.push('Styling conventions are not strongly signaled yet, so component extraction should set token and naming rules early.');
  }
  return risks.slice(0, 5);
}

function buildComponentStrategyPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint) {
  const profile = direction?.profile || buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const primitiveOpportunities = buildPrimitiveOpportunityAudit(cwd, profile, inventory);
  const primitiveContractAudit = buildPrimitiveContractAudit(cwd, profile, inventory);
  const missingStateAudit = buildMissingStateAudit(cwd, inventory);
  const sectionCoverage = buildSectionCoverage(inventory, pageBlueprint);
  const reuseNow = buildReuseNow(sectionCoverage);
  const extractNow = buildExtractNow(sectionCoverage, primitiveOpportunities);
  const buildNow = buildBuildNow(sectionCoverage, stateAtlas, missingStateAudit, primitiveContractAudit);

  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    framework: profile.framework.primary,
    uiSystem: profile.uiSystem.primary,
    pageType: pageBlueprint.pageType,
    productCategory: designDna.productCategory,
    inventoryStats: {
      total: inventory.length,
      shared: inventory.filter((item) => item.shared).length,
      local: inventory.filter((item) => !item.shared).length,
    },
    reuseNow,
    extractNow,
    buildNow,
    componentPolicy: buildComponentPolicy(profile, designDna, pageBlueprint),
    risks: buildComponentRisks(profile, missingStateAudit, primitiveContractAudit, inventory),
    sectionCoverage,
    primitiveOpportunities,
    primitiveContractAudit,
    missingStateAudit,
  };
}

function renderComponentStrategyMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Framework: \`${payload.framework}\``,
    `- UI system: \`${payload.uiSystem}\``,
    `- Page type: \`${payload.pageType.label}\``,
    `- Product category: \`${payload.productCategory.label}\``,
    `- Inventory: \`${payload.inventoryStats.total}\` components (${payload.inventoryStats.shared} shared / ${payload.inventoryStats.local} local)`,
    '',
    '## Reuse Now',
    '',
    ...(payload.reuseNow.length > 0
      ? payload.reuseNow.flatMap((item) => ([
        `### ${item.title}`,
        '',
        `- File: \`${item.file}\``,
        `- Section: ${item.section}`,
        `- Why: ${item.reason}`,
        '',
      ]))
      : ['- `No obvious shared component matches were detected yet.`', '']),
    '## Extract Now',
    '',
    ...(payload.extractNow.length > 0
      ? payload.extractNow.flatMap((item) => ([
        `### ${item.title}`,
        '',
        `- Source: \`${item.source}\``,
        `- Why: ${item.reason}`,
        `- Move: ${item.move}`,
        '',
      ]))
      : ['- `No urgent extraction candidates were detected yet.`', '']),
    '## Build Now',
    '',
    ...(payload.buildNow.length > 0
      ? payload.buildNow.flatMap((item) => ([
        `### ${item.title}`,
        '',
        `- Target: ${item.target}`,
        `- Why: ${item.reason}`,
        `- States: \`${(item.states || []).join(', ') || 'none'}\``,
        '',
      ]))
      : ['- `Existing inventory already covers the current page blueprint well.`', '']),
    '## Section Coverage',
    '',
    ...payload.sectionCoverage.flatMap((entry) => ([
      `### ${entry.section.title}`,
      '',
      ...(entry.matches.length > 0
        ? entry.matches.map((item) => `- \`${item.name}\` -> ${item.file} (${item.shared ? 'shared' : 'local'}, score ${item.score})`)
        : ['- `No strong inventory match yet.`']),
      '',
    ])),
    '## Component Policy',
    '',
    ...payload.componentPolicy.map((item) => `- ${item}`),
    '',
    '## Risks',
    '',
    ...(payload.risks.length > 0 ? payload.risks.map((item) => `- ${item}`) : ['- `No major component-strategy risks detected.`']),
  ];
  return lines.join('\n');
}

function buildComponentStrategyDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint) {
  const payload = buildComponentStrategyPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint);
  const filePath = writeDoc(path.join(rootDir, 'COMPONENT-STRATEGY.md'), 'COMPONENT STRATEGY', renderComponentStrategyMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'component-strategy.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });
  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

function buildBenchmarkAxes(direction, designDna, stateAtlas, pageBlueprint, componentStrategy) {
  return [
    {
      id: 'hierarchy',
      label: 'Hierarchy and shell',
      benchmark: designDna.blend.structure,
      target: `Use ${pageBlueprint.sections[0]?.title || 'the primary section'} plus ${pageBlueprint.sections[1]?.title || 'the next section'} as the visible hierarchy spine.`,
      reviewPrompt: 'Can a new visitor or operator tell what the page is for and what to do next within one scan?',
    },
    {
      id: 'proof',
      label: 'Product proof',
      benchmark: designDna.references[0]?.label || designDna.blend.structure,
      target: pageBlueprint.proofSurfaces[0] || 'Show the real product or output before abstract storytelling expands.',
      reviewPrompt: 'Does real product proof arrive before decorative storytelling?',
    },
    {
      id: 'typography',
      label: 'Typography and copy',
      benchmark: designDna.blend.typography,
      target: direction.copyVoice?.tone || 'Use deliberate typography and clear copy tone instead of generic SaaS filler.',
      reviewPrompt: 'Would the page still feel specific and authored if color were removed?',
    },
    {
      id: 'state',
      label: 'State completeness',
      benchmark: designDna.productCategory.label,
      target: `Cover ${stateAtlas.requiredStates.join(', ')} as first-pass states, not backlog polish.`,
      reviewPrompt: 'Do critical states feel designed, or only technically handled?',
    },
    {
      id: 'component',
      label: 'Component discipline',
      benchmark: componentStrategy.reuseNow[0]?.title || componentStrategy.uiSystem || 'shared primitives',
      target: componentStrategy.componentPolicy[0],
      reviewPrompt: 'Are we reusing a coherent component vocabulary or inventing per-section variants?',
    },
    {
      id: 'conversion',
      label: 'Primary outcome',
      benchmark: pageBlueprint.pageType.label,
      target: pageBlueprint.primaryOutcome,
      reviewPrompt: 'Does the page keep momentum toward the primary outcome without hiding trust cues or next actions?',
    },
  ];
}

function buildDifferentiationPlays(direction, designDna, pageBlueprint, componentStrategy) {
  const plays = [];
  const signatureMoments = direction.signatureMoments || [];
  if (signatureMoments[0]) {
    plays.push({
      title: signatureMoments[0].title,
      move: signatureMoments[0].description,
      why: 'Use one intentional signature moment so the page has a memorable point of view without becoming noisy.',
    });
  }
  if (pageBlueprint.proofSurfaces[0]) {
    plays.push({
      title: 'Lead with product proof',
      move: pageBlueprint.proofSurfaces[0],
      why: 'External-site frontend work feels cutting-edge when the product is concrete, not when the hero is more abstract.',
    });
  }
  if (designDna.references[0]?.adopt?.[0]) {
    plays.push({
      title: `Borrow from ${designDna.references[0].label}`,
      move: designDna.references[0].adopt[0],
      why: 'This is the strongest reusable benchmark cue from the selected reference blend.',
    });
  }
  if (componentStrategy.buildNow[0]) {
    plays.push({
      title: 'Differentiate through structure',
      move: `Ship ${componentStrategy.buildNow[0].title.toLowerCase()} as a shared system primitive, not a page-local one-off.`,
      why: 'Reusable structure compounds across new site pages faster than isolated visual polish.',
    });
  }
  if (pageBlueprint.motionMoments[0]) {
    plays.push({
      title: 'Constrain motion',
      move: pageBlueprint.motionMoments[0],
      why: 'The product will feel more premium when motion supports sequencing instead of shouting for attention.',
    });
  }
  return plays.slice(0, 5);
}

function buildCommodityRisks(designDna, pageBlueprint) {
  return unique([
    ...pageBlueprint.antiPatterns.slice(0, 4),
    ...designDna.antiPatterns.slice(0, 4),
  ]).slice(0, 6);
}

function buildReviewQuestions(axes) {
  return axes.map((axis) => `Review ${axis.label.toLowerCase()}: ${axis.reviewPrompt}`);
}

function buildDesignBenchmarkPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy) {
  const axes = buildBenchmarkAxes(direction, designDna, stateAtlas, pageBlueprint, componentStrategy);
  return {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    productCategory: designDna.productCategory,
    pageType: pageBlueprint.pageType,
    referenceBlend: designDna.blend,
    benchmarkAxes: axes,
    differentiationPlays: buildDifferentiationPlays(direction, designDna, pageBlueprint, componentStrategy),
    commodityRisks: buildCommodityRisks(designDna, pageBlueprint),
    reviewQuestions: buildReviewQuestions(axes),
  };
}

function renderDesignBenchmarkMarkdown(payload) {
  const lines = [
    `- Workflow root: \`${payload.workflowRootRelative}\``,
    `- Product category: \`${payload.productCategory.label}\``,
    `- Page type: \`${payload.pageType.label}\``,
    `- Reference blend: \`${payload.referenceBlend.summary}\``,
    '',
    '## Benchmark Axes',
    '',
    ...payload.benchmarkAxes.flatMap((axis) => ([
      `### ${axis.label}`,
      '',
      `- Benchmark lead: \`${axis.benchmark}\``,
      `- Target: ${axis.target}`,
      `- Review prompt: ${axis.reviewPrompt}`,
      '',
    ])),
    '## Differentiation Plays',
    '',
    ...payload.differentiationPlays.flatMap((item) => ([
      `### ${item.title}`,
      '',
      `- Move: ${item.move}`,
      `- Why: ${item.why}`,
      '',
    ])),
    '## Commodity Risks',
    '',
    ...payload.commodityRisks.map((item) => `- ${item}`),
    '',
    '## Review Questions',
    '',
    ...payload.reviewQuestions.map((item) => `- ${item}`),
  ];
  return lines.join('\n');
}

function buildDesignBenchmarkDoc(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy) {
  const payload = buildDesignBenchmarkPayload(cwd, rootDir, direction, designDna, stateAtlas, pageBlueprint, componentStrategy);
  const filePath = writeDoc(path.join(rootDir, 'DESIGN-BENCHMARK.md'), 'DESIGN BENCHMARK', renderDesignBenchmarkMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'design-benchmark.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });
  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

module.exports = {
  buildComponentStrategyDoc,
  buildDesignBenchmarkDoc,
};
