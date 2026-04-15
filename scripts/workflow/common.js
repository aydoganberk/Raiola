const fs = require('node:fs');
const path = require('node:path');
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
  normalizeDiscussMode,
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
const {
  warnAgentsSize,
} = require('./common_agents');
const {
  currentBranch,
  runGit,
} = require('./common_git');
const {
  ensureUniqueMilestoneId,
  fileCoveredByStagePath,
  hashString,
  normalizeStagePath,
  safeArtifactToken,
  shortHash,
  slugify,
} = require('./common_identity');
const {
  buildFieldFragment,
  buildReferenceFragment,
  buildSectionFragment,
  buildTableRowsFragment,
  createPacketFragment,
  estimateTokens,
  meaningfulBulletItems,
  sanitizeContentForHash,
  uniqueFragments,
} = require('./packet_fragments');
const {
  isWorkflowPlaceholderValue,
  normalizeWorkflowText,
} = require('./workflow_text');
const { createPacketRuntimeApi } = require('./common_packet_runtime');

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

function listGitChanges(cwd) {
  return runtimeCache.listGitChangesCached(cwd);
}

function setActiveMilestoneCard(content, cardBody) {
  return replaceSection(content, 'Active Milestone Card', cardBody);
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

const {
  PACKET_VERSION,
  buildPacketSnapshot,
  computeWindowStatus,
  defaultPacketTargetForStep,
  syncPacketHash,
  syncStablePacketSet,
  syncWindowDocument,
} = createPacketRuntimeApi({
  fs,
  packetCache,
  defaultReasoningProfileForStep,
  loadPreferences,
  normalizeReasoningProfile,
  normalizeTokenEfficiencyMeasures,
  getSectionField,
  getFieldValue,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  replaceOrAppendSection,
  parseRefTable,
  parseTableSectionObjects,
  extractBulletItems,
  tryExtractSection,
  normalizeReference,
  meaningfulBulletItems,
  buildFieldFragment,
  buildReferenceFragment,
  buildSectionFragment,
  buildTableRowsFragment,
  createPacketFragment,
  uniqueFragments,
  sanitizeContentForHash,
  isWorkflowPlaceholderValue,
  normalizeWorkflowText,
  hashString,
  shortHash,
  today,
  parseNumber,
  toSemicolonList,
  read,
  readIfExists,
  write,
  readPacketRuntimeEntry,
  writePacketRuntimeEntry,
  estimateTokens,
});

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
  normalizeDiscussMode,
  normalizePlanGateStatus,
  normalizeReasoningProfile,
  normalizeTokenEfficiencyMeasures,
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
