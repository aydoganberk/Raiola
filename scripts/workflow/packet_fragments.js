const fs = require('node:fs');
const path = require('node:path');
const { readText: read } = require('./io/files');
const { extractBulletItems } = require('./common_memory');
const {
  headerKey,
  parseMarkdownTable,
  renderMarkdownTable,
} = require('./common_tables');
const {
  getFieldValue,
  tryExtractSection,
} = require('./markdown/sections');
const { normalizeReference } = require('./common_references');
const runtimeCache = require('./perf/runtime_cache');
const {
  hashString,
} = require('./common_identity');
const {
  isWorkflowPlaceholderValue,
  normalizeWorkflowText,
} = require('./workflow_text');

function estimateTokens(value) {
  return runtimeCache.estimateTokensCached(value);
}

function packetRef(relativePath, label = '') {
  return label ? `${relativePath}#${label}` : relativePath;
}

function renderFieldSubset(content, labels) {
  return labels.map((label) => `- ${label}: \`${getFieldValue(content, label) || 'missing'}\``).join('\n');
}

function sanitizeContentForHash(content) {
  let sanitized = String(content || '')
    .replace(/^- Last updated: `.*?`$/gm, '- Last updated: `<dynamic>`')
    .replace(/^- Input hash: `.*?`$/gm, '- Input hash: `<dynamic>`')
    .replace(/^- Current packet hash: `.*?`$/gm, '- Current packet hash: `<dynamic>`')
    .replace(/^- Estimated used tokens: `.*?`$/gm, '- Estimated used tokens: `<dynamic>`')
    .replace(/^- Estimated remaining tokens: `.*?`$/gm, '- Estimated remaining tokens: `<dynamic>`')
    .replace(/^- Session id: `.*?`$/gm, '- Session id: `<dynamic>`')
    .replace(/`[a-f0-9]{12,64}`/g, '`<hash>`')
    .replace(/\b[a-f0-9]{32,64}\b/g, '<hash>');

  if (sanitized.startsWith('# WORKSTREAMS')) {
    sanitized = sanitized
      .replace(
        /^\| ([^|]+?) \| ([^|]+?) \| [^|]* \| [^|]* \| [^|]* \| [^|]* \| [^|]* \| [^|]* \| ([^|]*?) \|$/gm,
        '| $1 | $2 | <status> | <milestone> | <step> | <packet> | <budget> | <health> | $3 |',
      )
      .replace(/^- `\d{4}-\d{2}-\d{2} \| .*?`$/gm, '- `<switch-log>`');
  }

  if (sanitized.startsWith('# WINDOW')) {
    sanitized = sanitized
      .replace(/^- Current step: `.*?`$/gm, '- Current step: `<dynamic>`')
      .replace(/^- Current run chunk: `.*?`$/gm, '- Current run chunk: `<dynamic>`')
      .replace(/^- Can finish current chunk: `.*?`$/gm, '- Can finish current chunk: `<dynamic>`')
      .replace(/^- Can start next chunk: `.*?`$/gm, '- Can start next chunk: `<dynamic>`')
      .replace(/^- Recommended action: `.*?`$/gm, '- Recommended action: `<dynamic>`')
      .replace(/^- Automation recommendation: `.*?`$/gm, '- Automation recommendation: `<dynamic>`')
      .replace(/^- Resume anchor: `.*?`$/gm, '- Resume anchor: `<dynamic>`')
      .replace(/^- Last safe checkpoint: `.*?`$/gm, '- Last safe checkpoint: `<dynamic>`')
      .replace(/^- Packet loading mode: `.*?`$/gm, '- Packet loading mode: `<dynamic>`')
      .replace(/^- Token efficiency measures: `.*?`$/gm, '- Token efficiency measures: `<dynamic>`')
      .replace(/^- Core packet size: `.*?`$/gm, '- Core packet size: `<dynamic>`')
      .replace(/^- Loaded packet size: `.*?`$/gm, '- Loaded packet size: `<dynamic>`')
      .replace(/^- Unchanged refs omitted: `.*?`$/gm, '- Unchanged refs omitted: `<dynamic>`')
      .replace(/^- Cold refs omitted: `.*?`$/gm, '- Cold refs omitted: `<dynamic>`')
      .replace(/^- Budget status: `.*?`$/gm, '- Budget status: `<dynamic>`')
      .replace(/^- `Packet version: .*?`$/gm, '- `Packet version: <dynamic>`')
      .replace(/^- `Primary doc: .*?`$/gm, '- `Primary doc: <dynamic>`')
      .replace(/^- `Packet hash: .*?`$/gm, '- `Packet hash: <dynamic>`')
      .replace(/^- `Packet loading mode: .*?`$/gm, '- `Packet loading mode: <dynamic>`')
      .replace(/^- `Token efficiency measures: .*?`$/gm, '- `Token efficiency measures: <dynamic>`')
      .replace(/^- `Core packet size: .*?`$/gm, '- `Core packet size: <dynamic>`')
      .replace(/^- `Loaded packet size: .*?`$/gm, '- `Loaded packet size: <dynamic>`')
      .replace(/^- `Active read size: .*?`$/gm, '- `Active read size: <dynamic>`')
      .replace(/^- `Unchanged refs omitted: .*?`$/gm, '- `Unchanged refs omitted: <dynamic>`')
      .replace(/^- `Cold refs omitted: .*?`$/gm, '- `Cold refs omitted: <dynamic>`')
      .replace(/^- `Estimated packet tokens: .*?`$/gm, '- `Estimated packet tokens: <dynamic>`')
      .replace(/^- `Packet budget status: .*?`$/gm, '- `Packet budget status: <dynamic>`')
      .replace(/^- `Workflow artifact tokens: .*?`$/gm, '- `Workflow artifact tokens: <dynamic>`')
      .replace(/^- `Execution overhead: .*?`$/gm, '- `Execution overhead: <dynamic>`')
      .replace(/^- `Verify overhead: .*?`$/gm, '- `Verify overhead: <dynamic>`')
      .replace(/^- `Delta since last window snapshot: .*?`$/gm, '- `Delta since last window snapshot: <dynamic>`')
      .replace(/^- `Budget ratio: .*?`$/gm, '- `Budget ratio: <dynamic>`')
      .replace(/^- `Tier A: .*?`$/gm, '- `Tier A: <dynamic>`')
      .replace(/^- `Tier A omitted unchanged: .*?`$/gm, '- `Tier A omitted unchanged: <dynamic>`')
      .replace(/^- `Tier B: .*?`$/gm, '- `Tier B: <dynamic>`')
      .replace(/^- `Tier B omitted unchanged: .*?`$/gm, '- `Tier B omitted unchanged: <dynamic>`')
      .replace(/^- `Tier C loaded: .*?`$/gm, '- `Tier C loaded: <dynamic>`')
      .replace(/^- `Tier C omitted: .*?`$/gm, '- `Tier C omitted: <dynamic>`')
      .replace(/^- `Checkpoint required before compaction: .*?`$/gm, '- `Checkpoint required before compaction: <dynamic>`');
  }

  return sanitized;
}

function createPacketFragment(options = {}) {
  const cwd = options.cwd || process.cwd();
  const relativePath = path.relative(cwd, options.filePath).replace(/\\/g, '/');
  const content = String(options.content || '').trim();
  const sanitized = sanitizeContentForHash(content);

  return {
    tier: options.tier,
    ref: packetRef(relativePath, options.label),
    reason: options.reason,
    kind: options.kind || 'section',
    mode: options.mode || 'section-aware',
    relativePath,
    label: options.label || '',
    contentHash: sanitized ? hashString(sanitized) : 'missing',
    estimatedTokens: estimateTokens(sanitized),
    exists: true,
    content: sanitized,
  };
}

function buildSectionFragment(filePath, content, heading, tier, reason, options = {}) {
  const section = tryExtractSection(content, heading, '');
  const fallback = options.fallback || `- \`Missing section: ${heading}\``;
  return createPacketFragment({
    cwd: options.cwd,
    filePath,
    label: heading,
    tier,
    reason,
    kind: 'section',
    mode: 'section-aware',
    content: section || fallback,
  });
}

function buildFieldFragment(filePath, content, label, fieldLabels, tier, reason, options = {}) {
  return createPacketFragment({
    cwd: options.cwd,
    filePath,
    label,
    tier,
    reason,
    kind: 'field_set',
    mode: 'field-aware',
    content: renderFieldSubset(content, fieldLabels),
  });
}

function buildTableRowsFragment(filePath, content, heading, tier, reason, options = {}) {
  const section = tryExtractSection(content, heading, '');
  const table = parseMarkdownTable(section);
  const ids = new Set((options.ids || []).filter(Boolean).map((value) => normalizeWorkflowText(value)));

  if (table.headers.length === 0) {
    return createPacketFragment({
      cwd: options.cwd,
      filePath,
      label: options.label || heading,
      tier,
      reason,
      kind: 'table_rows',
      mode: 'row-aware',
      content: options.fallback || `- \`No table rows were found in ${heading}\``,
    });
  }

  const headerMap = table.headers.map((header) => headerKey(header));
  const selectedRows = table.rows.filter((cells) => {
    if (ids.size === 0) {
      return false;
    }

    const row = Object.fromEntries(headerMap.map((key, index) => [key, cells[index] || '']));
    const rowId = normalizeWorkflowText(row[options.idKey || 'requirement_id']);
    return ids.has(rowId);
  });

  return createPacketFragment({
    cwd: options.cwd,
    filePath,
    label: options.label || heading,
    tier,
    reason,
    kind: 'table_rows',
    mode: 'row-aware',
    content: selectedRows.length > 0
      ? renderMarkdownTable(table.headers, selectedRows)
      : (options.fallback || `- \`No matching rows were found in ${heading}\``),
  });
}

function buildReferenceFragment(cwd, rawRef, tier, reason, options = {}) {
  const normalized = normalizeReference(cwd, rawRef, { rootDir: options.rootDir });
  if (!normalized.path || !fs.existsSync(normalized.path)) {
    return {
      tier,
      ref: normalized.raw || rawRef,
      reason,
      kind: 'file',
      mode: 'file-fallback',
      relativePath: normalized.relativePath || String(rawRef || '').trim(),
      label: '',
      contentHash: 'missing',
      estimatedTokens: 0,
      exists: false,
      content: '',
    };
  }

  const fileContent = sanitizeContentForHash(read(normalized.path));
  return {
    tier,
    ref: normalized.raw || normalized.relativePath,
    reason,
    kind: 'file',
    mode: 'file-fallback',
    relativePath: normalized.relativePath,
    label: '',
    contentHash: fileContent ? hashString(fileContent) : 'missing',
    estimatedTokens: estimateTokens(fileContent),
    exists: true,
    content: fileContent,
  };
}

function uniqueFragments(fragments) {
  const deduped = [];
  const seen = new Set();

  for (const fragment of fragments.filter(Boolean)) {
    const key = `${fragment.tier}|${fragment.ref}|${fragment.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(fragment);
  }

  return deduped;
}

function meaningfulBulletItems(sectionBody) {
  return extractBulletItems(sectionBody).filter((item) => !isWorkflowPlaceholderValue(item));
}

module.exports = {
  buildFieldFragment,
  buildReferenceFragment,
  buildSectionFragment,
  buildTableRowsFragment,
  createPacketFragment,
  estimateTokens,
  meaningfulBulletItems,
  sanitizeContentForHash,
  uniqueFragments,
};
