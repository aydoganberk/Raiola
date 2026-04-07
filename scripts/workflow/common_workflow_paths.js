const fs = require('node:fs');
const path = require('node:path');
const { readText } = require('./io/files');
const {
  extractSection,
  getFieldValue,
} = require('./markdown/sections');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function controlRoot(cwd) {
  return path.join(cwd, 'docs', 'workflow');
}

function controlPaths(cwd) {
  const rootDir = controlRoot(cwd);
  return {
    rootDir,
    workstreams: path.join(rootDir, 'WORKSTREAMS.md'),
  };
}

function resolveWorkflowRoot(cwd, requestedRoot) {
  if (requestedRoot) {
    return path.resolve(cwd, String(requestedRoot));
  }

  const controls = controlPaths(cwd);
  if (!fs.existsSync(controls.workstreams)) {
    return controls.rootDir;
  }

  const content = readText(controls.workstreams);
  const activeRoot = getFieldValue(content, 'Active workstream root');
  if (!activeRoot) {
    return controls.rootDir;
  }

  return path.resolve(cwd, activeRoot);
}

function workflowPaths(rootDir, cwd = process.cwd()) {
  return {
    cwd,
    rootDir,
    workstreams: controlPaths(cwd).workstreams,
    project: path.join(rootDir, 'PROJECT.md'),
    runtime: path.join(rootDir, 'RUNTIME.md'),
    preferences: path.join(rootDir, 'PREFERENCES.md'),
    execplan: path.join(rootDir, 'EXECPLAN.md'),
    status: path.join(rootDir, 'STATUS.md'),
    decisions: path.join(rootDir, 'DECISIONS.md'),
    milestones: path.join(rootDir, 'MILESTONES.md'),
    milestoneTemplate: path.join(rootDir, 'MILESTONE_TEMPLATE.md'),
    context: path.join(rootDir, 'CONTEXT.md'),
    carryforward: path.join(rootDir, 'CARRYFORWARD.md'),
    validation: path.join(rootDir, 'VALIDATION.md'),
    handoff: path.join(rootDir, 'HANDOFF.md'),
    window: path.join(rootDir, 'WINDOW.md'),
    memory: path.join(rootDir, 'MEMORY.md'),
    seeds: path.join(rootDir, 'SEEDS.md'),
    archiveDir: path.join(rootDir, 'completed_milestones'),
    forensicsDir: path.join(rootDir, 'forensics'),
  };
}

function assertWorkflowFiles(paths) {
  const required = [
    paths.workstreams,
    paths.project,
    paths.runtime,
    paths.preferences,
    paths.execplan,
    paths.status,
    paths.decisions,
    paths.milestones,
    paths.milestoneTemplate,
    paths.context,
    paths.carryforward,
    paths.validation,
    paths.handoff,
    paths.window,
    paths.memory,
    paths.seeds,
    paths.archiveDir,
  ];

  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing workflow path: ${filePath}`);
    }
  }
}

function getOpenCarryforwardItems(content) {
  const section = extractSection(content, 'Open Items');
  const items = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').replace(/^`|`$/g, ''));

  if (items.length === 1 && items[0] === 'No carryforward items yet') {
    return [];
  }

  return items;
}

function renderOpenItems(items) {
  if (items.length === 0) {
    return '- `No carryforward items yet`';
  }

  return items.map((item) => `- \`${item}\``).join('\n');
}

function normalizeCommitGranularity(value, fallback = 'manual') {
  const normalized = String(value || '').trim().toLowerCase();
  return ['manual', 'phase', 'chunk'].includes(normalized) ? normalized : fallback;
}

module.exports = {
  assertWorkflowFiles,
  controlPaths,
  getOpenCarryforwardItems,
  normalizeCommitGranularity,
  renderOpenItems,
  resolveWorkflowRoot,
  today,
  workflowPaths,
};
