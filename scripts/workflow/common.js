const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fileIo = require('./io/files');
const markdown = require('./markdown/sections');
const packetCache = require('./packet/cache');
const runtimeCache = require('./perf/runtime_cache');
const {
  parseArgs,
  parseBoolean,
  parseNumber,
  toList,
  toSemicolonList,
} = require('./common_args');
const {
  headerKey,
  parseArchivedMilestones,
  parseMarkdownTable,
  parseMilestoneTable,
  parseRefTable,
  parseTableSectionObjects,
  parseWorkstreamTable,
  renderArchivedMilestones,
  renderMarkdownTable,
  renderMilestoneTable,
  renderRefTable,
  renderWorkstreamTable,
} = require('./common_tables');
const {
  defaultReasoningProfileForStep,
  loadPreferences,
  normalizeAutomationMode,
  normalizeAutomationStatus,
  normalizeAutomationWindowPolicy,
  normalizePlanGateStatus,
  normalizeReasoningProfile,
  normalizeTokenEfficiencyMeasures,
  normalizeWorkflowMode,
  normalizeWorkflowProfile,
  profileDefaultsFor,
  readPlanGateStatus,
} = require('./common_preferences');
const {
  foldTurkishAscii,
  formatWorkflowControlCommand,
  normalizeWorkflowControlUtterance,
  resolveWorkflowControlIntent,
  workflowControlExamplesForFamily,
  workflowControlRecommendedCommand,
} = require('./workflow_control');
const {
  assertWorkflowFiles,
  controlPaths,
  getOpenCarryforwardItems,
  normalizeCommitGranularity,
  renderOpenItems,
  resolveWorkflowRoot,
  today,
  workflowPaths,
} = require('./common_workflow_paths');
const {
  extractBulletItems,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  renderMemoryEntry,
  renderMemorySection,
  renderSeedSection,
} = require('./common_memory');
const {
  checkReference,
  normalizeReference,
  parseReferenceList,
  resolveReferencePath,
  safeExec,
} = require('./common_references');
const {
  parseValidationContract,
  runEvidenceChecks,
  validateValidationContract,
} = require('./common_validation');

function escapeRegex(value) {
  return markdown.escapeRegex(value);
}

function read(filePath) {
  return fileIo.readText(filePath);
}

function readIfExists(filePath) {
  return fileIo.readTextIfExists(filePath);
}

function write(filePath, content) {
  fileIo.writeText(filePath, content);
}

function writeIfChanged(filePath, content) {
  return fileIo.writeTextIfChanged(filePath, content);
}

function ensureDir(dirPath) {
  fileIo.ensureDir(dirPath);
}

function replaceField(content, label, value) {
  return markdown.replaceField(content, label, value);
}

function replaceOrAppendField(content, label, value) {
  return markdown.replaceOrAppendField(content, label, value);
}

function ensureField(content, label, value) {
  return markdown.ensureField(content, label, value);
}

function getFieldValue(content, label) {
  return markdown.getFieldValue(content, label);
}

function getSectionField(sectionBody, label) {
  return markdown.getSectionField(sectionBody, label);
}

function replaceSection(content, heading, body) {
  return markdown.replaceSection(content, heading, body);
}

function replaceOrAppendSection(content, heading, body) {
  return markdown.replaceOrAppendSection(content, heading, body);
}

function ensureSection(content, heading, body) {
  return markdown.ensureSection(content, heading, body);
}

function extractSection(content, heading) {
  return markdown.extractSection(content, heading);
}

function tryExtractSection(content, heading, fallback = '') {
  return markdown.tryExtractSection(content, heading, fallback);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function safeArtifactToken(value, options = {}) {
  const normalized = String(value || '').trim();
  const label = String(options.label || 'Value');
  const prefix = slugify(options.prefix || label) || 'item';
  const maxBaseLength = Math.max(8, Math.min(48, Number(options.maxBaseLength || 48)));

  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  const slug = slugify(normalized);
  if (slug && slug === normalized) {
    return normalized;
  }

  const base = (slug || prefix).slice(0, maxBaseLength) || prefix;
  return `${base}-${shortHash(hashString(normalized), 10)}`;
}


function listGitChanges(cwd) {
  return runtimeCache.listGitChangesCached(cwd);
}

function normalizeStagePath(cwd, inputPath) {
  const value = String(inputPath || '').trim().replace(/\\/g, '/');
  if (!value) {
    throw new Error('Empty stage path is not allowed');
  }

  if (value === '.' || value === './' || value === '*') {
    throw new Error(`Refusing broad stage path: ${value}`);
  }

  const resolved = path.resolve(cwd, value);
  const relative = path.relative(cwd, resolved).replace(/\\/g, '/');
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Stage path must stay inside repo root: ${value}`);
  }

  return relative || '.';
}

function fileCoveredByStagePath(filePath, stagePath) {
  return filePath === stagePath || filePath.startsWith(`${stagePath}/`);
}

function randomSuffix(length = 6) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function ensureUniqueMilestoneId(milestoneId, preferences) {
  if (!preferences.uniqueMilestoneIds) {
    return milestoneId;
  }

  if (/-[a-z0-9]{6}$/.test(milestoneId)) {
    return milestoneId;
  }

  return `${milestoneId}-${randomSuffix(6)}`;
}

function setActiveMilestoneCard(content, cardBody) {
  return replaceSection(content, 'Active Milestone Card', cardBody);
}

function currentBranch(cwd) {
  return childProcess.execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

function runGit(cwd, args, dryRun) {
  if (dryRun) {
    return { code: 0, stdout: `DRY RUN git ${args.join(' ')}` };
  }

  const result = childProcess.spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }

  return { code: result.status, stdout: result.stdout };
}

function listAgentsFiles(rootDir) {
  const results = [];
  const ignored = new Set(['.git', 'node_modules', '.next', '.turbo']);

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === 'AGENTS.md') {
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

function warnAgentsSize(rootDir) {
  const files = listAgentsFiles(rootDir);
  const totalBytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);

  if (totalBytes > 32 * 1024) {
    return `WARNING: Combined AGENTS.md size is ${totalBytes} bytes (> 32768). Consider splitting docs or increasing the limit.`;
  }

  return `AGENTS.md combined size OK: ${totalBytes} bytes.`;
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function shortHash(value, length = 12) {
  return String(value || '').slice(0, length);
}

function packetRuntimeStatePath(cwd = process.cwd()) {
  return packetCache.packetRuntimeStatePath(cwd);
}

function readPacketRuntimeState(cwd = process.cwd()) {
  return packetCache.readPacketRuntimeState(cwd);
}

function writePacketRuntimeState(cwd = process.cwd(), state = {}) {
  return packetCache.writePacketRuntimeState(cwd, state);
}

function packetRuntimeRootKey(cwd, rootDir) {
  return packetCache.packetRuntimeRootKey(cwd, rootDir);
}

function packetRuntimeEntryKey(primaryKey, hashStep) {
  return packetCache.packetRuntimeEntryKey(primaryKey, hashStep);
}

function readPacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep) {
  return packetCache.readPacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep);
}

function writePacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep, entry) {
  packetCache.writePacketRuntimeEntry(cwd, rootDir, primaryKey, hashStep, entry);
}

function estimateTokens(value) {
  return runtimeCache.estimateTokensCached(value);
}

const PACKET_VERSION = '5';

function normalizeWorkflowText(value) {
  return String(value || '')
    .replace(/`/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORKFLOW_PLACEHOLDER_PHRASES = Object.freeze([
  'fill when',
  'fill this',
  'fill after',
  'fill during',
  'fill once',
  'to be filled',
  'replace this placeholder',
  'document the',
  'describe the',
  'pending_sync',
  'waiting for',
  'still unknown',
  'none yet',
  'none_noted',
  'no active',
  'no open',
  'not ready',
  'not_ready',
  'still unclear',
  'to be filled during',
]);

function isWorkflowPlaceholderValue(value) {
  const normalized = normalizeWorkflowText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return WORKFLOW_PLACEHOLDER_PHRASES.some((phrase) => normalized.includes(phrase));
}

function packetRef(relativePath, label = '') {
  return label ? `${relativePath}#${label}` : relativePath;
}

function renderFieldSubset(content, labels) {
  return labels.map((label) => `- ${label}: \`${getFieldValue(content, label) || 'missing'}\``).join('\n');
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

function defaultPacketTargetForStep(preferences, step) {
  if (['discuss', 'research'].includes(step)) {
    return preferences.discussBudget;
  }

  if (['plan', 'execute'].includes(step)) {
    return preferences.planBudget;
  }

  return preferences.auditBudget;
}

function primaryDocForStep(paths, step, docOverride) {
  if (docOverride) {
    const normalized = String(docOverride).trim();
    if (normalized === 'context') {
      return { key: 'context', filePath: paths.context };
    }
    if (normalized === 'execplan') {
      return { key: 'execplan', filePath: paths.execplan };
    }
    if (normalized === 'validation') {
      return { key: 'validation', filePath: paths.validation };
    }
  }

  if (['discuss', 'research'].includes(step)) {
    return { key: 'context', filePath: paths.context };
  }

  if (['plan', 'execute'].includes(step)) {
    return { key: 'execplan', filePath: paths.execplan };
  }

  return { key: 'validation', filePath: paths.validation };
}

function sortRefs(refs) {
  return [...refs].sort((left, right) => {
    const leftKey = `${left.class}|${left.ref}|${left.why}`;
    const rightKey = `${right.class}|${right.ref}|${right.why}`;
    return leftKey.localeCompare(rightKey);
  });
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildPacketFragments(paths, step, primaryContent, options = {}) {
  const cwd = options.cwd || process.cwd();
  const statusContent = read(paths.status);
  const contextContent = read(paths.context);
  const execplanContent = read(paths.execplan);
  const validationContent = read(paths.validation);
  const handoffContent = read(paths.handoff);
  const planSection = tryExtractSection(execplanContent, 'Plan of Record', '');
  const validationCore = tryExtractSection(validationContent, 'Validation Core', '');
  const currentRunChunk = String(getSectionField(planSection, 'Run chunk id') || 'NONE').trim();
  const openRequirementRows = parseTableSectionObjects(execplanContent, 'Open Requirements');
  const openRequirementIds = openRequirementRows
    .filter((row) => normalizeWorkflowText(row.status).toLowerCase() !== 'closed')
    .map((row) => normalizeWorkflowText(row.requirement_id))
    .filter(Boolean);
  const activeValidationIds = uniqueStrings([
    ...parseDelimitedFieldValue(validationCore, 'Active validation IDs').map((value) => normalizeWorkflowText(value)),
    ...parseDelimitedFieldValue(validationCore, 'Acceptance criteria IDs').map((value) => normalizeWorkflowText(value)),
  ]);
  const touchedFilesSection = tryExtractSection(contextContent, 'Touched Files', '');
  const touchedFileRefs = meaningfulBulletItems(touchedFilesSection)
    .filter((item) => {
      const normalized = normalizeReference(cwd, item, { rootDir: paths.rootDir });
      return normalized.path && fs.existsSync(normalized.path);
    });

  const tierA = uniqueFragments([
    buildFieldFragment(
      paths.status,
      statusContent,
      'Workflow Cursor',
      ['Current phase', 'Current milestone', 'Current milestone step', 'Current step mode', 'Step fulfillment state'],
      'A',
      'continuity cursor',
      { cwd },
    ),
    buildSectionFragment(paths.context, contextContent, 'Intent Core', 'A', 'continuity core', { cwd }),
    buildSectionFragment(paths.execplan, execplanContent, 'Delivery Core', 'A', 'delivery continuity core', { cwd }),
    buildSectionFragment(paths.execplan, execplanContent, 'Open Requirements', 'A', 'open requirements continuity core', { cwd }),
    buildSectionFragment(paths.execplan, execplanContent, 'Current Capability Slice', 'A', 'current capability continuity core', { cwd }),
    buildSectionFragment(paths.validation, validationContent, 'Validation Core', 'A', 'validation continuity core', { cwd }),
    buildSectionFragment(paths.handoff, handoffContent, 'Continuity Checkpoint', 'A', 'checkpoint continuity core', { cwd }),
  ]);

  const coverageIds = uniqueStrings(openRequirementIds);
  const tierB = [];

  const pushTierB = (fragment) => {
    if (fragment) {
      tierB.push(fragment);
    }
  };

  if (['discuss', 'research', 'plan'].includes(step)) {
    pushTierB(buildSectionFragment(paths.context, contextContent, 'User Intent', 'B', 'active intent surface', { cwd }));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Explicit Constraints', 'B', 'active constraints surface', { cwd }));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Requirement List', 'B', 'active requirement list', { cwd }));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Success Rubric', 'B', 'active success rubric', { cwd }));
  }

  if (['research', 'plan'].includes(step)) {
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Touched Files', 'B', 'active touched files surface', { cwd }));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Dependency Map', 'B', 'dependency map surface', { cwd }));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Risks', 'B', 'research risk surface', { cwd }));
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'Acceptance Criteria', 'B', 'acceptance criteria surface', { cwd }));
  }

  if (step === 'plan') {
    pushTierB(buildFieldFragment(
      paths.execplan,
      execplanContent,
      'Plan Cursor',
      ['Active milestone', 'Active milestone step', 'Current step mode', 'Step fulfillment state', 'Last control intent'],
      'B',
      'plan cursor surface',
      { cwd },
    ));
    pushTierB(buildSectionFragment(paths.execplan, execplanContent, 'Chosen Strategy', 'B', 'chosen strategy surface', { cwd }));
    pushTierB(buildSectionFragment(paths.execplan, execplanContent, 'Coverage Matrix', 'B', 'coverage matrix surface', { cwd }));
    pushTierB(buildSectionFragment(paths.execplan, execplanContent, 'Plan Chunk Table', 'B', 'plan chunk surface', { cwd }));
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'Validation Contract', 'B', 'validation contract surface', { cwd }));
  }

  if (step === 'execute') {
    pushTierB(buildFieldFragment(
      paths.execplan,
      execplanContent,
      'Current Run Chunk',
      ['Active milestone', 'Active milestone step'],
      'B',
      'execute cursor',
      { cwd },
    ));
    pushTierB(createPacketFragment({
      cwd,
      filePath: paths.execplan,
      label: 'Plan of Record (Run Cursor)',
      tier: 'B',
      reason: 'execute run cursor',
      kind: 'field_set',
      mode: 'field-aware',
      content: [
        `- Run chunk id: \`${currentRunChunk || 'NONE'}\``,
        `- Chunk cursor: \`${getSectionField(planSection, 'Chunk cursor') || '0/0'}\``,
        `- Active wave: \`${getSectionField(planSection, 'Active wave') || '0/0'}\``,
        `- Remaining items: \`${getSectionField(planSection, 'Remaining items') || 'None'}\``,
      ].join('\n'),
    }));
    pushTierB(buildTableRowsFragment(
      paths.execplan,
      execplanContent,
      'Plan Chunk Table',
      'B',
      'current chunk rows',
      {
        cwd,
        ids: currentRunChunk && currentRunChunk !== 'NONE' ? [currentRunChunk] : [],
        idKey: 'chunk_id',
        label: currentRunChunk && currentRunChunk !== 'NONE'
          ? `Plan Chunk Table (${currentRunChunk})`
          : 'Plan Chunk Table (current chunk)',
        fallback: currentRunChunk && currentRunChunk !== 'NONE'
          ? `- \`Current chunk ${currentRunChunk} is not yet mapped in the plan chunk table\``
          : '- `No current run chunk is active yet`',
      },
    ));
    pushTierB(buildTableRowsFragment(
      paths.execplan,
      execplanContent,
      'Coverage Matrix',
      'B',
      'open requirement coverage rows',
      {
        cwd,
        ids: coverageIds,
        idKey: 'requirement_id',
        label: 'Coverage Matrix (open requirements)',
        fallback: coverageIds.length > 0
          ? '- `No coverage rows match the current open requirements`'
          : '- `There are no open requirements to map right now`',
      },
    ));
    pushTierB(buildTableRowsFragment(
      paths.validation,
      validationContent,
      'Acceptance Criteria',
      'B',
      'active acceptance rows',
      {
        cwd,
        ids: activeValidationIds,
        idKey: 'acceptance_id',
        label: 'Acceptance Criteria (active validation IDs)',
        fallback: activeValidationIds.length > 0
          ? '- `No acceptance rows match the active validation IDs`'
          : '- `No active validation IDs are currently named`',
      },
    ));
    pushTierB(buildSectionFragment(paths.context, contextContent, 'Touched Files', 'B', 'execute touched files list', { cwd }));
    for (const fileRef of touchedFileRefs) {
      pushTierB(buildReferenceFragment(cwd, fileRef, 'B', 'touched file', { rootDir: paths.rootDir }));
    }
  }

  if (step === 'audit') {
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'Acceptance Criteria', 'B', 'audit acceptance criteria', { cwd }));
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'User-visible Outcomes', 'B', 'audit user-visible outcomes', { cwd }));
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'Regression Focus', 'B', 'audit regression focus', { cwd }));
    pushTierB(buildSectionFragment(paths.validation, validationContent, 'Validation Contract', 'B', 'audit validation contract', { cwd }));
  }

  if (step === 'complete') {
    pushTierB(buildSectionFragment(paths.status, statusContent, 'Tests Run', 'B', 'closeout verification notes', { cwd }));
    pushTierB(buildSectionFragment(paths.status, statusContent, 'Risks', 'B', 'closeout risk notes', { cwd }));
    pushTierB(buildSectionFragment(paths.handoff, handoffContent, 'Snapshot', 'B', 'closeout snapshot', { cwd }));
  }

  const canonicalRefs = parseRefTable(primaryContent, 'Canonical Refs');
  const upstreamRefs = parseRefTable(primaryContent, 'Upstream Refs');
  const tierC = uniqueFragments([
    ...sortRefs(canonicalRefs).map((item) => buildReferenceFragment(cwd, item.ref, 'C', item.why || 'cold canonical ref', { rootDir: paths.rootDir })),
    ...sortRefs(upstreamRefs).map((item) => buildReferenceFragment(cwd, item.ref, 'C', item.why || 'cold upstream ref', { rootDir: paths.rootDir })),
  ]);

  return {
    currentRunChunk,
    openRequirementIds,
    activeValidationIds,
    touchedFileRefs,
    tierA,
    tierB: uniqueFragments(tierB),
    tierC,
    canonicalRefs,
    upstreamRefs,
  };
}

function buildPacketSnapshot(paths, options = {}) {
  const cwd = options.cwd || paths.cwd || process.cwd();
  const preferences = loadPreferences(paths);
  const statusContent = read(paths.status);
  const step = String(options.step || getFieldValue(statusContent, 'Current milestone step') || 'discuss').trim();
  const packetLoadingMode = String(options.packetLoadingMode || preferences.packetLoadingMode || 'delta').trim();
  const tokenEfficiencyMeasures = normalizeTokenEfficiencyMeasures(
    options.tokenEfficiencyMeasures || preferences.tokenEfficiencyMeasures,
    packetLoadingMode === 'continuity_first' ? 'off' : 'on',
  );
  const cacheKey = hashString(JSON.stringify({
    rootDir: paths.rootDir,
    step,
    doc: options.doc || 'auto',
    packetLoadingMode,
    tokenEfficiencyMeasures,
    explicitNeed: Boolean(options.explicitNeed),
    includeColdRefs: Boolean(options.includeColdRefs),
    fileSignatures: [
      paths.status,
      paths.context,
      paths.execplan,
      paths.validation,
      paths.handoff,
      paths.window,
      paths.preferences,
    ].map((filePath) => {
      if (!fs.existsSync(filePath)) {
        return { filePath, missing: true };
      }
      const stat = fs.statSync(filePath);
      return {
        filePath,
        size: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      };
    }),
  }));
  const cachedPacket = packetCache.getPacketSnapshotCache(cwd, cacheKey);
  if (cachedPacket) {
    return cachedPacket;
  }
  const primary = primaryDocForStep(paths, step, options.doc);
  const primaryContent = read(primary.filePath);
  const unknowns = parseTableSectionObjects(primaryContent, 'Unknowns');
  const primaryRelative = path.relative(cwd, primary.filePath).replace(/\\/g, '/');
  const {
    currentRunChunk,
    openRequirementIds,
    activeValidationIds,
    touchedFileRefs,
    tierA,
    tierB,
    tierC,
    canonicalRefs,
    upstreamRefs,
  } = buildPacketFragments(paths, step, primaryContent, { cwd });
  const hashStep = primary.key === 'context'
    ? 'discuss'
    : primary.key === 'execplan'
      ? 'plan'
      : 'audit';
  const stableBundle = hashStep === step
    ? { tierA, tierB }
    : buildPacketFragments(paths, hashStep, primaryContent, { cwd });
  const packetVersion = String(getFieldValue(primaryContent, 'Packet version') || PACKET_VERSION).trim();
  const budgetProfile = String(getFieldValue(primaryContent, 'Budget profile') || preferences.budgetProfile).trim();
  const targetInputTokens = parseNumber(
    getFieldValue(primaryContent, 'Target input tokens'),
    defaultPacketTargetForStep(preferences, step),
  );
  const hardCapTokens = parseNumber(
    getFieldValue(primaryContent, 'Hard cap tokens'),
    targetInputTokens + preferences.tokenReserve,
  );
  const reasoningProfileRaw = String(getFieldValue(primaryContent, 'Reasoning profile') || '').trim();
  const defaultReasoningProfile = defaultReasoningProfileForStep(step, preferences);
  const reasoningProfile = normalizeReasoningProfile(reasoningProfileRaw || defaultReasoningProfile, defaultReasoningProfile);
  const reasoningProfileValid = !reasoningProfileRaw || reasoningProfileRaw === reasoningProfile;
  const confidenceSummary = String(getFieldValue(primaryContent, 'Confidence summary') || 'mixed').trim();
  const refreshPolicy = String(getFieldValue(primaryContent, 'Refresh policy') || 'refresh_when_input_hash_drifts').trim();
  const storedInputHash = String(getFieldValue(primaryContent, 'Input hash') || '').trim();
  const falsificationItems = extractBulletItems(tryExtractSection(primaryContent, 'What Would Falsify This Plan?', ''));
  const stableFragments = [...stableBundle.tierA, ...stableBundle.tierB];
  const continuityFirst = packetLoadingMode === 'continuity_first';
  const normalizedPayload = {
    hashStep,
    primaryDoc: primaryRelative,
    packetVersion,
    budgetProfile,
    reasoningProfile,
    stableFragments: stableFragments.map((item) => ({
      tier: item.tier,
      ref: item.ref,
      contentHash: item.contentHash,
    })),
  };
  const inputHash = hashString(JSON.stringify(normalizedPayload));
  const hashDrift = Boolean(storedInputHash && storedInputHash !== inputHash);
  const runtimeEntry = continuityFirst
    ? null
    : readPacketRuntimeEntry(cwd, paths.rootDir, primary.key, hashStep);
  const runtimeStableHashes = runtimeEntry
    && runtimeEntry.inputHash === storedInputHash
    && runtimeEntry.stableFragments
    && typeof runtimeEntry.stableFragments === 'object'
    ? runtimeEntry.stableFragments
    : null;

  function partitionStableTier(fragments, partitionOptions = {}) {
    if (continuityFirst || options.explicitNeed || partitionOptions.forceInclude || !runtimeStableHashes) {
      return {
        included: fragments,
        omitted: [],
      };
    }

    const included = [];
    const omitted = [];

    for (const fragment of fragments) {
      const previousHash = runtimeStableHashes[fragment.ref]?.contentHash || '';
      if (!previousHash || previousHash !== fragment.contentHash) {
        included.push(fragment);
      } else {
        omitted.push(fragment);
      }
    }

    return { included, omitted };
  }

  const tierAPartition = partitionStableTier(tierA);
  const tierBPartition = partitionStableTier(tierB, { forceInclude: step === 'execute' });
  const includeColdRefs = continuityFirst || Boolean(options.includeColdRefs || options.explicitNeed || hashDrift);
  const coldRefLimit = continuityFirst || options.explicitNeed || options.includeColdRefs
    ? tierC.length
    : Math.max(preferences.maxCanonicalRefsPerStep, 0);
  const includedColdFragments = includeColdRefs
    ? tierC.slice(0, coldRefLimit)
    : [];
  const coldRefsOmitted = includeColdRefs ? tierC.slice(includedColdFragments.length) : tierC;
  const refSnapshots = [
    ...tierAPartition.included.map((item) => ({ ...item, included: true })),
    ...tierBPartition.included.map((item) => ({ ...item, included: true })),
    ...includedColdFragments.map((item) => ({ ...item, included: true })),
    ...tierAPartition.omitted.map((item) => ({ ...item, included: false })),
    ...tierBPartition.omitted.map((item) => ({ ...item, included: false })),
    ...coldRefsOmitted.map((item) => ({ ...item, included: false })),
  ];
  const estimatedTotalTokens = refSnapshots
    .filter((item) => item.included)
    .reduce((sum, item) => sum + item.estimatedTokens, 0);
  const corePacketSizeTokens = stableFragments.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const includedColdSizeTokens = includedColdFragments.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const budgetEvaluationTokens = corePacketSizeTokens + includedColdSizeTokens;
  const continuityReadSet = [
    ...tierA.map((item) => item.ref),
    ...tierB.map((item) => item.ref),
    ...includedColdFragments.map((item) => item.ref),
  ];
  const recommendedReadSet = refSnapshots
    .filter((item) => item.included)
    .map((item) => item.ref);

  let budgetStatus = 'ok';
  if (budgetEvaluationTokens > hardCapTokens) {
    budgetStatus = 'critical';
  } else if (budgetEvaluationTokens > targetInputTokens) {
    budgetStatus = 'warn';
  }

  const snapshot = {
    step,
    primary,
    packetVersion,
    budgetProfile,
    targetInputTokens,
    hardCapTokens,
    reasoningProfile,
    reasoningProfileRaw,
    reasoningProfileValid,
    confidenceSummary,
    refreshPolicy,
    storedInputHash,
    inputHash,
    hashDrift,
    canonicalRefs,
    upstreamRefs,
    currentRunChunk,
    openRequirementIds,
    activeValidationIds,
    touchedFileRefs,
    hashStep,
    stableFragments,
    sectionSnapshots: refSnapshots,
    refSnapshots,
    readSetTiers: {
      tierA: tierAPartition.included.map((item) => item.ref),
      tierAOmitted: tierAPartition.omitted.map((item) => item.ref),
      tierB: tierBPartition.included.map((item) => item.ref),
      tierBOmitted: tierBPartition.omitted.map((item) => item.ref),
      tierC: includedColdFragments.map((item) => item.ref),
      tierCOmitted: coldRefsOmitted.map((item) => item.ref),
    },
    continuityReadSet,
    recommendedReadSet,
    continuityCoreSizeTokens: tierA.reduce((sum, item) => sum + item.estimatedTokens, 0),
    activeReadSizeTokens: tierBPartition.included.reduce((sum, item) => sum + item.estimatedTokens, 0),
    includedColdSizeTokens,
    corePacketSizeTokens,
    budgetEvaluationTokens,
    loadedPacketSizeTokens: estimatedTotalTokens,
    unchangedSectionRefsOmittedCount: tierAPartition.omitted.length + tierBPartition.omitted.length,
    coldRefsOmittedCount: coldRefsOmitted.length,
    includeColdRefs,
    packetLoadingMode,
    tokenEfficiencyMeasures,
    estimatedTotalTokens,
    budgetStatus,
    unknowns,
    falsificationItems,
  };
  packetCache.setPacketSnapshotCache(cwd, cacheKey, snapshot);
  return snapshot;
}

function syncPacketHash(paths, options = {}) {
  const packet = buildPacketSnapshot(paths, options);
  const content = read(packet.primary.filePath);
  const next = replaceOrAppendField(content, 'Input hash', packet.inputHash);
  write(packet.primary.filePath, next);
  writePacketRuntimeEntry(options.cwd || paths.cwd || process.cwd(), paths.rootDir, packet.primary.key, packet.hashStep, {
    inputHash: packet.inputHash,
    packetVersion: packet.packetVersion,
    packetLoadingMode: packet.packetLoadingMode,
    syncedAt: new Date().toISOString(),
    stableFragments: Object.fromEntries(
      packet.stableFragments.map((fragment) => [
        fragment.ref,
        {
          tier: fragment.tier,
          contentHash: fragment.contentHash,
          estimatedTokens: fragment.estimatedTokens,
        },
      ]),
    ),
  });
  return packet;
}

function syncStablePacketSet(paths) {
  syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  const windowStatus = syncWindowDocument(paths, computeWindowStatus(paths, { doc: 'validation', step: 'audit' }));
  let contextPacket = null;
  let execplanPacket = null;
  let validationPacket = null;

  for (let pass = 0; pass < 3; pass += 1) {
    syncPacketHash(paths, { doc: 'context', step: 'discuss' });
    syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
    syncPacketHash(paths, { doc: 'validation', step: 'audit' });

    contextPacket = buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' });
    execplanPacket = buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' });
    validationPacket = buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' });

    if (!contextPacket.hashDrift && !execplanPacket.hashDrift && !validationPacket.hashDrift) {
      break;
    }
  }

  return {
    contextPacket,
    execplanPacket,
    validationPacket,
    windowStatus,
  };
}

function parseDelimitedFieldValue(sectionBody, label) {
  return toSemicolonList(getSectionField(sectionBody, label) || '');
}

function computeWindowStatus(paths, options = {}) {
  const preferences = loadPreferences(paths);
  const packet = buildPacketSnapshot(paths, options);
  const execplan = read(paths.execplan);
  const planSection = tryExtractSection(execplan, 'Plan of Record', '');
  const windowContent = read(paths.window);
  const handoffContent = readIfExists(paths.handoff) || '';
  const currentRunChunk = getSectionField(planSection, 'Run chunk id') || 'NONE';
  const executionOverhead = parseNumber(getSectionField(planSection, 'Estimated execution overhead'), 2000);
  const verifyOverhead = parseNumber(getSectionField(planSection, 'Estimated verify overhead'), 1000);
  const minimumReserve = parseNumber(getSectionField(planSection, 'Minimum reserve'), preferences.reserveFloorTokens);
  const workflowArtifacts = [
    paths.status,
    paths.context,
    paths.execplan,
    paths.validation,
    paths.handoff,
    paths.window,
  ];
  const artifactTokens = workflowArtifacts
    .filter((filePath) => fs.existsSync(filePath))
    .reduce((sum, filePath) => sum + estimateTokens(sanitizeContentForHash(read(filePath))), 0);
  const estimatedUsedTokens = packet.estimatedTotalTokens + Math.ceil(artifactTokens * 0.2);
  const estimatedRemainingTokens = Math.max(0, preferences.windowSizeTokens - estimatedUsedTokens);
  const currentRunCost = executionOverhead + verifyOverhead;
  const canFinishCurrentChunk = estimatedRemainingTokens >= minimumReserve + currentRunCost;
  const canStartNextChunk = estimatedRemainingTokens >= minimumReserve + preferences.minimumNextStepBudget;
  const budgetRatio = preferences.windowSizeTokens > 0
    ? estimatedUsedTokens / preferences.windowSizeTokens
    : 0;
  let decision = 'continue';
  let recommendedAction = 'continue';

  if (estimatedRemainingTokens <= preferences.mustHandoffThreshold) {
    decision = 'handoff-required';
    recommendedAction = 'handoff';
  } else if (!canFinishCurrentChunk || estimatedRemainingTokens <= preferences.reserveFloorTokens) {
    decision = 'new-window-recommended';
    recommendedAction = 'new-window';
  } else if (!canStartNextChunk || estimatedRemainingTokens <= preferences.stopStartingNewWorkThreshold) {
    decision = 'do-not-start-next-step';
    recommendedAction = 'compact';
  } else if (budgetRatio >= preferences.compactionThreshold || packet.budgetStatus === 'warn') {
    decision = 'compact-now';
    recommendedAction = 'compact';
  }

  let automationRecommendation = 'continue_in_current_window';
  if (preferences.automationMode !== 'manual') {
    if (['handoff-required', 'new-window-recommended'].includes(decision)) {
      automationRecommendation = preferences.automationWindowPolicy === 'handoff_then_compact'
        ? 'prefer_handoff_or_new_window'
        : 'compact_and_continue';
    } else if (['do-not-start-next-step', 'compact-now'].includes(decision)) {
      automationRecommendation = 'compact_then_continue';
    }
  }

  const storedUsed = parseNumber(getFieldValue(windowContent, 'Estimated used tokens'), 0);
  const recentContextGrowth = Math.max(0, estimatedUsedTokens - storedUsed);
  const continuityCoreFiles = [paths.status, paths.context, paths.execplan, paths.validation];
  const checkpointBaseHash = hashString(
    continuityCoreFiles
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => sanitizeContentForHash(read(filePath)))
      .join('\n---\n'),
  );
  const checkpointSection = tryExtractSection(handoffContent, 'Continuity Checkpoint', '');
  const checkpointExists = Boolean(checkpointSection) && !checkpointSection.includes('No continuity checkpoint');
  const checkpointAnchor = getFieldValue(windowContent, 'Last safe checkpoint') || '';
  const checkpointFreshness = checkpointExists && checkpointAnchor === checkpointBaseHash ? 'yes' : 'no';
  const checkpointReason = checkpointFreshness === 'yes'
    ? 'Continuity checkpoint matches the current continuity core'
    : checkpointExists
      ? 'Continuity checkpoint exists but continuity core drifted'
      : 'No continuity checkpoint is recorded for the current packet';
  const checkpointRequiredBeforeCompaction = checkpointFreshness !== 'yes'
    && ['compact-now', 'do-not-start-next-step'].includes(decision);

  if (checkpointFreshness !== 'yes' && ['compact', 'new-window', 'handoff'].includes(recommendedAction)) {
    recommendedAction = 'checkpoint_then_compact';
  }

  return {
    packet,
    windowMode: preferences.windowBudgetMode,
    windowSizeTokens: preferences.windowSizeTokens,
    reserveFloorTokens: preferences.reserveFloorTokens,
    estimatedUsedTokens,
    estimatedRemainingTokens,
    artifactTokens,
    recentContextGrowth,
    currentStep: packet.step,
    currentRunChunk,
    canFinishCurrentChunk,
    canStartNextChunk,
    decision,
    recommendedAction,
    automationMode: preferences.automationMode,
    automationWindowPolicy: preferences.automationWindowPolicy,
    automationRecommendation,
    budgetRatio,
    executionOverhead,
    verifyOverhead,
    minimumReserve,
    checkpointBaseHash,
    checkpointFreshness,
    checkpointReason,
    checkpointRequiredBeforeCompaction,
    corePacketSizeTokens: packet.corePacketSizeTokens,
    loadedPacketSizeTokens: packet.loadedPacketSizeTokens,
    activeReadSizeTokens: packet.activeReadSizeTokens,
    includedColdSizeTokens: packet.includedColdSizeTokens,
    unchangedSectionRefsOmittedCount: packet.unchangedSectionRefsOmittedCount,
    coldRefsOmittedCount: packet.coldRefsOmittedCount,
    readSetTiers: packet.readSetTiers,
    resumeAnchor: getSectionField(planSection, 'Resume from item') || getFieldValue(windowContent, 'Resume anchor') || 'start',
    lastSafeCheckpoint: getFieldValue(windowContent, 'Last safe checkpoint') || checkpointBaseHash,
    budgetStatus: packet.budgetStatus === 'critical' || decision === 'handoff-required'
      ? 'critical'
      : packet.budgetStatus === 'warn' || decision !== 'continue'
        ? 'warn'
        : 'ok',
  };
}

function syncWindowDocument(paths, windowStatus) {
  const status = windowStatus || computeWindowStatus(paths);
  let content = read(paths.window);

  content = replaceOrAppendField(content, 'Last updated', today());
  content = replaceOrAppendField(content, 'Session id', shortHash(hashString(`${today()}|${process.pid}|${status.packet.inputHash}`), 16));
  content = replaceOrAppendField(content, 'Current packet hash', status.packet.inputHash);
  content = replaceOrAppendField(content, 'Window mode', status.windowMode);
  content = replaceOrAppendField(content, 'Estimated used tokens', String(status.estimatedUsedTokens));
  content = replaceOrAppendField(content, 'Estimated remaining tokens', String(status.estimatedRemainingTokens));
  content = replaceOrAppendField(content, 'Window size tokens', String(status.windowSizeTokens));
  content = replaceOrAppendField(content, 'Reserve floor', String(status.reserveFloorTokens));
  content = replaceOrAppendField(content, 'Current step', status.currentStep);
  content = replaceOrAppendField(content, 'Current run chunk', status.currentRunChunk);
  content = replaceOrAppendField(content, 'Can finish current chunk', status.canFinishCurrentChunk ? 'yes' : 'no');
  content = replaceOrAppendField(content, 'Can start next chunk', status.canStartNextChunk ? 'yes' : 'no');
  content = replaceOrAppendField(content, 'Recommended action', status.recommendedAction);
  content = replaceOrAppendField(content, 'Automation recommendation', status.automationRecommendation);
  content = replaceOrAppendField(content, 'Resume anchor', status.resumeAnchor);
  content = replaceOrAppendField(content, 'Last safe checkpoint', status.lastSafeCheckpoint);
  content = replaceOrAppendField(content, 'Checkpoint freshness', status.checkpointFreshness);
  content = replaceOrAppendField(content, 'Packet loading mode', status.packet.packetLoadingMode);
  content = replaceOrAppendField(content, 'Token efficiency measures', status.packet.tokenEfficiencyMeasures);
  content = replaceOrAppendField(content, 'Core packet size', String(status.corePacketSizeTokens));
  content = replaceOrAppendField(content, 'Loaded packet size', String(status.loadedPacketSizeTokens));
  content = replaceOrAppendField(content, 'Unchanged refs omitted', String(status.unchangedSectionRefsOmittedCount));
  content = replaceOrAppendField(content, 'Cold refs omitted', String(status.coldRefsOmittedCount));
  content = replaceOrAppendField(content, 'Budget status', status.budgetStatus);
  content = replaceSection(content, 'Current Packet Summary', [
    `- \`Packet version: ${status.packet.packetVersion}\``,
    `- \`Primary doc: ${status.packet.primary.key}\``,
    `- \`Packet hash: ${status.packet.inputHash}\``,
    `- \`Packet loading mode: ${status.packet.packetLoadingMode}\``,
    `- \`Token efficiency measures: ${status.packet.tokenEfficiencyMeasures}\``,
    `- \`Core packet size: ${status.corePacketSizeTokens}\``,
    `- \`Loaded packet size: ${status.loadedPacketSizeTokens}\``,
    `- \`Active read size: ${status.activeReadSizeTokens}\``,
    `- \`Unchanged refs omitted: ${status.unchangedSectionRefsOmittedCount}\``,
    `- \`Cold refs omitted: ${status.coldRefsOmittedCount}\``,
    `- \`Estimated packet tokens: ${status.packet.estimatedTotalTokens}\``,
    `- \`Packet budget status: ${status.packet.budgetStatus}\``,
  ].join('\n'));
  content = replaceSection(content, 'Read Set Estimate', status.packet.recommendedReadSet.length === 0
    ? '- `No recommended read set yet`'
    : status.packet.recommendedReadSet.map((item) => `- \`${item}\``).join('\n'));
  content = replaceOrAppendSection(content, 'Packet Tier Summary', [
    `- \`Tier A: ${status.readSetTiers.tierA.join('; ') || 'None'}\``,
    `- \`Tier A omitted unchanged: ${status.readSetTiers.tierAOmitted.join('; ') || 'None'}\``,
    `- \`Tier B: ${status.readSetTiers.tierB.join('; ') || 'None'}\``,
    `- \`Tier B omitted unchanged: ${status.readSetTiers.tierBOmitted.join('; ') || 'None'}\``,
    `- \`Tier C loaded: ${status.readSetTiers.tierC.join('; ') || 'None'}\``,
    `- \`Tier C omitted: ${status.readSetTiers.tierCOmitted.join('; ') || 'None'}\``,
  ].join('\n'));
  content = replaceSection(content, 'Artifact Estimate', [
    `- \`Workflow artifact tokens: ${status.artifactTokens}\``,
    `- \`Execution overhead: ${status.executionOverhead}\``,
    `- \`Verify overhead: ${status.verifyOverhead}\``,
  ].join('\n'));
  content = replaceSection(content, 'Recent Context Growth', [
    `- \`Delta since last window snapshot: ${status.recentContextGrowth}\``,
    `- \`Budget ratio: ${status.budgetRatio.toFixed(2)}\``,
  ].join('\n'));
  content = replaceOrAppendSection(content, 'Checkpoint Guard', [
    `- \`Checkpoint freshness: ${status.checkpointFreshness}\``,
    `- \`Reason: ${status.checkpointReason}\``,
    `- \`Checkpoint required before compaction: ${status.checkpointRequiredBeforeCompaction ? 'yes' : 'no'}\``,
    `- \`Recommended action: ${status.recommendedAction}\``,
  ].join('\n'));

  write(paths.window, content);
  if (fs.existsSync(paths.handoff)) {
    let handoff = read(paths.handoff);
    if (handoff.includes('- Packet hash: `')) {
      handoff = replaceField(handoff, 'Packet hash', status.packet.inputHash);
      if (handoff.includes('## Packet Snapshot')) {
        handoff = replaceSection(handoff, 'Packet Snapshot', [
          `- \`Packet hash: ${status.packet.inputHash}\``,
          `- \`Current run chunk: ${status.currentRunChunk}\``,
          `- \`Chunk cursor: ${getFieldValue(handoff, 'Current chunk cursor') || '0/0'}\``,
        ].join('\n'));
      }
      write(paths.handoff, handoff);
    }
  }
  return status;
}

module.exports = {
  PACKET_VERSION,
  assertWorkflowFiles,
  buildPacketSnapshot,
  checkReference,
  computeWindowStatus,
  controlPaths,
  currentBranch,
  defaultReasoningProfileForStep,
  defaultPacketTargetForStep,
  ensureDir,
  ensureField,
  ensureSection,
  ensureUniqueMilestoneId,
  escapeRegex,
  estimateTokens,
  extractBulletItems,
  extractSection,
  fileCoveredByStagePath,
  getFieldValue,
  getOpenCarryforwardItems,
  getSectionField,
  hashString,
  headerKey,
  listGitChanges,
  loadPreferences,
  normalizeReference,
  normalizeStagePath,
  normalizeAutomationMode,
  normalizeAutomationStatus,
  normalizeAutomationWindowPolicy,
  normalizePlanGateStatus,
  normalizeReasoningProfile,
  normalizeWorkflowText,
  normalizeWorkflowControlUtterance,
  normalizeWorkflowMode,
  normalizeWorkflowProfile,
  isWorkflowPlaceholderValue,
  parseArgs,
  parseArchivedMilestones,
  parseBoolean,
  parseMarkdownTable,
  parseMemoryEntries,
  parseMemoryEntry,
  parseMilestoneTable,
  parseNumber,
  profileDefaultsFor,
  parseReferenceList,
  parseRefTable,
  parseSeedEntries,
  parseTableSectionObjects,
  parseValidationContract,
  parseWorkstreamTable,
  read,
  readPlanGateStatus,
  readIfExists,
  renderArchivedMilestones,
  renderMarkdownTable,
  renderMemoryEntry,
  renderMemorySection,
  renderMilestoneTable,
  renderOpenItems,
  renderRefTable,
  renderSeedSection,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendSection,
  replaceOrAppendField,
  replaceSection,
  resolveWorkflowRoot,
  runEvidenceChecks,
  runGit,
  sanitizeContentForHash,
  safeExec,
  safeArtifactToken,
  setActiveMilestoneCard,
  shortHash,
  slugify,
  formatWorkflowControlCommand,
  syncPacketHash,
  syncStablePacketSet,
  syncWindowDocument,
  today,
  toList,
  toSemicolonList,
  tryExtractSection,
  validateValidationContract,
  warnAgentsSize,
  workflowControlExamplesForFamily,
  workflowControlRecommendedCommand,
  resolveWorkflowControlIntent,
  workflowPaths,
  write,
  writeIfChanged,
};
