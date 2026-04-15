const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  parseMarkdownTable,
  renderMarkdownTable,
  replaceOrAppendSection,
  slugify,
  tryExtractSection,
} = require('./common');
const {
  ensureDir,
  readText: read,
  readTextIfExists: readIfExists,
  writeText: write,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const {
  readJsonIfExists,
  runtimePath,
  writeRuntimeJson,
  writeRuntimeMarkdown,
} = require('./runtime_helpers');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix, seed = '') {
  const normalizedPrefix = slugify(prefix || 'item');
  const normalizedSeed = slugify(seed || '');
  const hash = crypto.createHash('sha1')
    .update(`${normalizedPrefix}:${normalizedSeed}:${nowIso()}`)
    .digest('hex')
    .slice(0, 8);
  return [normalizedPrefix, normalizedSeed, hash].filter(Boolean).join('-');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function ensureMarkdownDocument(filePath, title, extraBody = '') {
  if (fs.existsSync(filePath)) {
    return;
  }

  ensureDir(path.dirname(filePath));
  write(filePath, `# ${title}\n\n${String(extraBody || '').trim()}\n`);
}

function ensureTableDocument(filePath, title, heading, headers, extraBody = '') {
  ensureMarkdownDocument(filePath, title, extraBody);
  const current = read(filePath);
  const section = tryExtractSection(current, heading, '');
  const existingTable = parseMarkdownTable(section);
  if (existingTable.headers.length === 0) {
    const next = replaceOrAppendSection(current, heading, `${renderMarkdownTable(headers, [])}\n`);
    if (next !== current) {
      write(filePath, next);
    }
  }
}

function readTableDocument(filePath, heading, options = {}) {
  ensureTableDocument(filePath, options.title || path.basename(filePath, path.extname(filePath)), heading, options.headers || []);
  const content = read(filePath);
  const section = tryExtractSection(content, heading, '');
  const table = parseMarkdownTable(section);
  return {
    content,
    headers: table.headers.length > 0 ? table.headers : [...(options.headers || [])],
    rows: table.rows,
  };
}

function writeTableDocument(filePath, title, heading, headers, rows, extraBody = '') {
  ensureDir(path.dirname(filePath));
  const parts = [`# ${title}`];
  if (String(extraBody || '').trim()) {
    parts.push(String(extraBody || '').trim());
  }
  parts.push(`## ${heading}\n${renderMarkdownTable(headers, rows)}`);
  write(filePath, `${parts.join('\n\n').trimEnd()}\n`);
}

function appendMarkdownListItem(filePath, title, heading, line, extraBody = '') {
  ensureMarkdownDocument(filePath, title, extraBody);
  const current = read(filePath);
  const section = tryExtractSection(current, heading, '').trim();
  const lines = section
    ? section.split('\n').map((entry) => entry.trimEnd()).filter(Boolean)
    : [];
  if (!lines.includes(line)) {
    lines.push(line);
  }
  const next = replaceOrAppendSection(current, heading, `${lines.join('\n')}\n`);
  if (next !== current) {
    write(filePath, next);
  }
}

function readMarkdownList(filePath, heading, options = {}) {
  ensureMarkdownDocument(filePath, options.title || path.basename(filePath, path.extname(filePath)), options.extraBody || '');
  const content = readIfExists(filePath) || '';
  const section = tryExtractSection(content, heading, '');
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- /.test(line));
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  ensureDir(path.dirname(filePath));
  writeIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function appendJsonl(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

function listEntries(dirPath, options = {}) {
  const {
    directoriesOnly = false,
    filesOnly = false,
  } = options;

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => {
      if (directoriesOnly) {
        return entry.isDirectory();
      }
      if (filesOnly) {
        return entry.isFile();
      }
      return true;
    })
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true, recursive: true });
  }
}

function ensureRuntimeLog(cwd, fileName, payload) {
  return writeRuntimeJson(cwd, fileName, {
    generatedAt: nowIso(),
    ...payload,
  });
}

function readRuntimeLog(cwd, fileName, fallback = null) {
  return readJsonIfExists(runtimePath(cwd, fileName)) || fallback;
}

function renderSimpleToml(value, depth = 0) {
  const indent = '  '.repeat(depth);
  const lines = [];

  for (const [key, rawValue] of Object.entries(value || {})) {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      lines.push('');
      lines.push(`${indent}[${key}]`);
      lines.push(renderSimpleToml(rawValue, depth + 1));
      continue;
    }

    if (Array.isArray(rawValue)) {
      lines.push(`${indent}${key} = [${rawValue.map((item) => JSON.stringify(String(item))).join(', ')}]`);
      continue;
    }

    if (typeof rawValue === 'boolean') {
      lines.push(`${indent}${key} = ${rawValue ? 'true' : 'false'}`);
      continue;
    }

    lines.push(`${indent}${key} = ${JSON.stringify(String(rawValue ?? ''))}`);
  }

  return lines.filter((line, index, items) => !(line === '' && items[index + 1] === '')).join('\n');
}

function parseSimpleToml(content) {
  const result = {};
  let current = result;

  for (const rawLine of String(content || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const section = sectionMatch[1].trim();
      result[section] = result[section] || {};
      current = result[section];
      continue;
    }
    const pairMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!pairMatch) {
      throw new Error(`Invalid TOML line: ${rawLine}`);
    }
    const key = pairMatch[1].trim();
    const rawValue = pairMatch[2].trim();
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1).trim();
      current[key] = inner
        ? inner.split(',').map((item) => item.trim().replace(/^"(.*)"$/, '$1'))
        : [];
      continue;
    }
    if (rawValue === 'true' || rawValue === 'false') {
      current[key] = rawValue === 'true';
      continue;
    }
    current[key] = rawValue.replace(/^"(.*)"$/, '$1');
  }

  return result;
}

function lineDiff(current, target) {
  const currentLines = String(current || '').split('\n');
  const targetLines = String(target || '').split('\n');
  const maxLength = Math.max(currentLines.length, targetLines.length);
  const lines = [];

  for (let index = 0; index < maxLength; index += 1) {
    const before = currentLines[index];
    const after = targetLines[index];
    if (before === after) {
      continue;
    }
    if (typeof before === 'string') {
      lines.push(`- ${before}`);
    }
    if (typeof after === 'string') {
      lines.push(`+ ${after}`);
    }
  }

  return lines;
}

function deriveRepoRoles(cwd) {
  const packageJson = readJsonFile(path.join(cwd, 'package.json'), { scripts: {}, dependencies: {}, devDependencies: {} });
  const dependencyKeys = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];
  const hasFrontendSignals = dependencyKeys.some((name) => /(react|next|vite|svelte|vue|tailwind|astro)/i.test(name))
    || fs.existsSync(path.join(cwd, 'docs', 'workflow', 'FRONTEND_PROFILE.md'));
  const hasMigrationSignals = fs.existsSync(path.join(cwd, 'migrations'))
    || Object.keys(packageJson.scripts || {}).some((name) => /migrat/i.test(name));
  const hasDocsSignals = fs.existsSync(path.join(cwd, 'docs'));
  const roles = [
    {
      name: 'repo-explorer',
      summary: 'Maps the codebase, packet refs, and likely impact surface before execution.',
    },
    {
      name: 'release-noter',
      summary: 'Prepares review, ship, PR brief, and release communication artifacts.',
    },
  ];

  if (hasFrontendSignals) {
    roles.push({
      name: 'frontend-verifier',
      summary: 'Validates UI surfaces, browser evidence, and frontend-specific regressions.',
    });
  }
  if (dependencyKeys.length > 0) {
    roles.push({
      name: 'dependency-risk-auditor',
      summary: 'Audits dependency drift, package scripts, and upgrade risk.',
    });
  }
  if (hasMigrationSignals) {
    roles.push({
      name: 'migration-checker',
      summary: 'Reviews migrations, compatibility impact, and rollout safety.',
    });
  }
  if (hasDocsSignals) {
    roles.push({
      name: 'docs-verifier',
      summary: 'Checks command docs, getting-started flows, and closeout narratives.',
    });
  }

  return roles;
}

module.exports = {
  appendJsonl,
  appendMarkdownListItem,
  deriveRepoRoles,
  ensureMarkdownDocument,
  ensureRuntimeLog,
  ensureTableDocument,
  lineDiff,
  listEntries,
  makeId,
  nowIso,
  parseSimpleToml,
  readJsonFile,
  readMarkdownList,
  readRuntimeLog,
  readTableDocument,
  relativePath,
  removeFileIfExists,
  renderSimpleToml,
  sha256,
  writeJsonFile,
  writeTableDocument,
  writeRuntimeJson,
  writeRuntimeMarkdown,
};
