const fs = require('node:fs');
const path = require('node:path');
const { listIndexedRepoFiles } = require('./fs_index');
const { buildImportGraph, parseImports } = require('./import_graph');

function readText(cwd, relativeFile) {
  try {
    return fs.readFileSync(path.join(cwd, relativeFile), 'utf8');
  } catch {
    return '';
  }
}

function parseExportNames(content, fallbackName) {
  const names = new Set();
  const text = String(content || '');
  for (const match of text.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const normalized = String(part).split(/\s+as\s+/i)[0].trim();
      if (/^[A-Z][A-Za-z0-9_]*$/.test(normalized)) {
        names.add(normalized);
      }
    }
  }
  if (names.size === 0 && /export\s+default/.test(text) && fallbackName) {
    names.add(fallbackName);
  }
  return [...names];
}

function parsePropInterfaces(content) {
  const names = new Set();
  const text = String(content || '');
  for (const match of text.matchAll(/(?:interface|type)\s+([A-Z][A-Za-z0-9_]*Props)\b/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function nearestPackageName(cwd, relativeFile) {
  let currentDir = path.dirname(relativeFile);
  while (currentDir && currentDir !== '.' && currentDir !== path.dirname(currentDir)) {
    const manifestPath = path.join(cwd, currentDir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (pkg.name) {
        return pkg.name;
      }
    } catch {}
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
}

function packageAliasConsumerMap(cwd, files) {
  const counts = new Map();
  for (const file of files.filter((entry) => /\.(tsx|jsx|ts|js)$/.test(entry))) {
    const content = readText(cwd, file);
    for (const specifier of parseImports(content)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        counts.set(specifier, (counts.get(specifier) || 0) + 1);
      }
    }
  }
  return counts;
}

function componentConsumers(filePath, reverseEdges) {
  return Array.isArray(reverseEdges?.[filePath]) ? reverseEdges[filePath] : [];
}

function classifyComponentFamily(filePath, content) {
  const haystack = `${filePath}\n${content}`;
  if (/\b(modal|dialog|drawer|sheet|popover|tooltip|menu|dropdown)\b/i.test(haystack)) {
    return 'overlay';
  }
  if (/\b(form|field|input|select|textarea|checkbox|radio|switch|combobox|datepicker|date picker|react-hook-form|FormField|Controller)\b/i.test(haystack)) {
    return 'form';
  }
  if (/\b(table|grid|chart|metric|stats?|datatable|data table|results|feed|timeline|list|collection)\b/i.test(haystack) || /<table\b/i.test(content)) {
    return 'data-display';
  }
  if (/\b(nav|navigation|sidebar|breadcrumb|pagination|tabs?|tablist|stepper)\b/i.test(haystack)) {
    return 'navigation';
  }
  if (/\b(alert|toast|banner|status|empty|skeleton|spinner|loading|error|success|retry)\b/i.test(haystack) || /aria-live=|role=["'](?:status|alert)["']/i.test(content)) {
    return 'feedback';
  }
  if (/\b(layout|shell|page|section|header|footer|hero|panel|container|stack|card|split)\b/i.test(haystack)) {
    return 'layout';
  }
  if (/\b(button|avatar|badge|chip|tag|pill|tabs?|accordion|table|dialog|menu|tooltip)\b/i.test(haystack)) {
    return 'primitive';
  }
  return 'general';
}

function detectStateSignals(filePath, content) {
  const haystack = `${filePath}\n${content}`;
  const states = {
    loading: /\b(loading|spinner|skeleton|pending)\b/i.test(haystack),
    empty: /\b(empty state|no results|no items|nothing here|empty)\b/i.test(haystack),
    error: /\b(error|retry|failed|try again)\b/i.test(haystack),
    success: /\b(success|done|saved|completed)\b/i.test(haystack),
    disabled: /\b(disabled|aria-disabled|isDisabled)\b/i.test(haystack),
    interaction: /\b(hover|focus|active|focus-visible)\b/i.test(haystack),
    validation: /\b(validation|invalid|required field|field error|helper text|aria-invalid)\b/i.test(haystack),
  };
  return Object.fromEntries(Object.entries(states).filter(([, present]) => present));
}

function collectComponentInventory(cwd, options = {}) {
  const refreshMode = String(options.refreshMode || 'incremental') === 'full' ? 'full' : 'incremental';
  const repo = options.repoIndex || listIndexedRepoFiles(cwd, { refreshMode });
  const importGraph = options.importGraph || buildImportGraph(cwd, { refreshMode });
  const files = (options.files || repo.files).filter((filePath) => (
    ((/\.(tsx|jsx|ts|js)$/.test(filePath)
      && /(^|\/)(components|ui|app\/components|src\/components)\//.test(filePath))
      || /[A-Z][A-Za-z0-9_-]+\.(tsx|jsx|ts|js)$/.test(path.basename(filePath)))
  ));
  const packageAliasConsumers = packageAliasConsumerMap(cwd, repo.files || files);

  return files.slice(0, options.limit || 120).map((filePath) => {
    const base = path.basename(filePath, path.extname(filePath));
    const content = readText(cwd, filePath);
    const consumers = componentConsumers(filePath, importGraph.reverseEdges);
    const packageName = nearestPackageName(cwd, filePath);
    const aliasConsumerCount = packageName ? Number(packageAliasConsumers.get(packageName) || 0) : 0;
    const sharedConsumerCount = new Set(
      consumers
        .filter((consumer) => /(^|\/)(components|ui|app\/components|src\/components)\//.test(consumer))
        .map((consumer) => consumer.split('/').slice(0, 2).join('/'))
    ).size;
    const exportNames = parseExportNames(content, base);
    const propInterfaces = parsePropInterfaces(content);
    const hasJsx = /<\s*[A-Z][A-Za-z0-9]*/.test(content) || /return\s*\(/.test(content);
    const stateSignals = detectStateSignals(filePath, content);
    return {
      name: exportNames[0] || base,
      file: filePath,
      kind: hasJsx || /\.(tsx|jsx)$/.test(filePath) ? 'component' : 'module',
      family: classifyComponentFamily(filePath, content),
      exports: exportNames,
      propInterfaces,
      shared: /(components|ui)\//.test(filePath),
      consumerCount: consumers.length + aliasConsumerCount,
      sharedConsumerCount,
      dependencyCount: Array.isArray(importGraph.forwardEdges?.[filePath]) ? importGraph.forwardEdges[filePath].length : 0,
      consumers: consumers.slice(0, 12),
      responsiveHint: /(grid|layout|container|hero|page)/i.test(base) || /useMediaQuery|sm:|md:|lg:/.test(content),
      stateSignals: Object.keys(stateSignals),
      hasPropContract: propInterfaces.length > 0,
    };
  });
}

function pickDominantFamilies(familyCounts) {
  return Object.entries(familyCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([family]) => family);
}

function buildStateCoverage(inventory) {
  const evidence = {
    loading: [],
    empty: [],
    error: [],
    success: [],
    disabled: [],
    interaction: [],
    validation: [],
  };

  for (const item of inventory) {
    for (const state of item.stateSignals || []) {
      if (evidence[state]) {
        evidence[state].push(item.file);
      }
    }
  }

  return {
    present: Object.entries(evidence).filter(([, hits]) => hits.length > 0).map(([state]) => state),
    missing: Object.entries(evidence).filter(([, hits]) => hits.length === 0).map(([state]) => state),
    coverageCount: Object.values(evidence).filter((hits) => hits.length > 0).length,
    evidence: Object.fromEntries(Object.entries(evidence).map(([state, hits]) => [state, hits.slice(0, 4)])),
  };
}

function buildReuseSummary(inventory, surfaceInventory = {}) {
  const shared = inventory.filter((item) => item.shared);
  const hotspots = inventory.filter((item) => item.consumerCount >= 2 || item.sharedConsumerCount >= 2);
  const propDrivenShared = shared.filter((item) => item.hasPropContract);
  const routeCount = Number(surfaceInventory.routeCount || 0);
  const sharedCoverageRatio = routeCount > 0
    ? Number((shared.length / routeCount).toFixed(2))
    : shared.length;
  let verdict = 'thin';
  let reason = 'Very little reusable component structure was detected yet.';
  if (shared.length >= 2 && hotspots.length >= 1) {
    verdict = 'pass';
    reason = 'Shared components with multiple consumers were detected, so reuse is already taking shape.';
  } else if (routeCount >= 2 && shared.length === 0) {
    verdict = 'warn';
    reason = 'Multiple routes exist without an obvious shared component layer.';
  } else if (shared.length >= 1 || hotspots.length >= 1) {
    verdict = 'note';
    reason = 'Some reuse structure exists, but it is still shallow relative to the detected surface.';
  }

  return {
    verdict,
    reason,
    hotspotCount: hotspots.length,
    sharedCount: shared.length,
    localCount: inventory.length - shared.length,
    propDrivenSharedCount: propDrivenShared.length,
    sharedCoverageRatio,
  };
}

function buildPreviewAnchors(inventory) {
  const anchors = [];
  const seen = new Set();
  const pushAnchor = (id, label, reason) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    anchors.push({ id, label, reason });
  };

  for (const item of inventory) {
    if (item.family === 'form') {
      pushAnchor('form-submit-path', 'form submit path', 'At least one form-oriented component was detected.');
    }
    if (item.family === 'data-display') {
      pushAnchor('data-surface', 'data surface', 'A table/grid/list style component was detected.');
    }
    if (item.family === 'overlay') {
      pushAnchor('overlay-open-close', 'overlay open/close', 'Dialog, menu, or drawer style components were detected.');
    }
    if (item.family === 'navigation') {
      pushAnchor('navigation-path', 'navigation path', 'Navigation-oriented components were detected.');
    }
    if (item.family === 'feedback') {
      pushAnchor('state-feedback', 'state feedback', 'Status, loading, or empty/error feedback components were detected.');
    }
  }

  return anchors.slice(0, 6);
}

function buildComponentIntelligenceSummary(cwd, options = {}) {
  const inventory = options.inventory || collectComponentInventory(cwd, options);
  const familyCounts = {
    overlay: 0,
    form: 0,
    'data-display': 0,
    navigation: 0,
    feedback: 0,
    layout: 0,
    primitive: 0,
    general: 0,
  };
  for (const item of inventory) {
    familyCounts[item.family] = (familyCounts[item.family] || 0) + 1;
  }

  const shared = inventory.filter((item) => item.shared);
  const local = inventory.filter((item) => !item.shared);
  const propContractCount = inventory.filter((item) => item.hasPropContract).length;
  const topReusableComponents = inventory
    .filter((item) => item.shared || item.consumerCount > 0)
    .sort((left, right) => right.consumerCount - left.consumerCount || Number(right.shared) - Number(left.shared) || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map((item) => ({
      name: item.name,
      file: item.file,
      family: item.family,
      shared: item.shared,
      consumerCount: item.consumerCount,
      propContract: item.propInterfaces[0] || '',
    }));
  const surfaceInventory = options.surfaceInventory || {};
  const routeCount = Number(surfaceInventory.routeCount || 0);
  const routeToComponentRatio = routeCount > 0
    ? Number((inventory.length / routeCount).toFixed(2))
    : inventory.length;
  const stateCoverage = buildStateCoverage(inventory);
  const reuse = buildReuseSummary(inventory, surfaceInventory);

  return {
    totalComponents: inventory.length,
    sharedCount: shared.length,
    localCount: local.length,
    propContractCount,
    familyCounts,
    dominantFamilies: pickDominantFamilies(familyCounts),
    routeToComponentRatio,
    stateCoverage,
    reuse,
    topReusableComponents,
    previewAnchors: buildPreviewAnchors(inventory),
    inventorySample: inventory.slice(0, 8).map((item) => ({
      name: item.name,
      file: item.file,
      family: item.family,
      shared: item.shared,
      consumerCount: item.consumerCount,
    })),
  };
}

module.exports = {
  buildComponentIntelligenceSummary,
  collectComponentInventory,
};
