const crypto = require('node:crypto');
const { markCache } = require('../perf/metrics');

const sectionCache = new Map();
const fieldCache = new Map();

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contentKey(content, label) {
  return crypto.createHash('sha1').update(`${label}\n${String(content || '')}`, 'utf8').digest('hex');
}

function detectLineEnding(content) {
  return String(content || '').includes('\r\n') ? '\r\n' : '\n';
}

function normalizeLineEndings(content, eol) {
  return String(content || '').replace(/\r?\n/g, eol);
}

function replaceField(content, label, value) {
  const pattern = new RegExp(`^- ${escapeRegex(label)}: .*?$`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing field: ${label}`);
  }
  return content.replace(pattern, `- ${label}: \`${value}\``);
}

function replaceOrAppendField(content, label, value) {
  const pattern = new RegExp(`^- ${escapeRegex(label)}: .*?$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `- ${label}: \`${value}\``);
  }

  const eol = detectLineEnding(content);
  if (!content.startsWith('# ')) {
    return content
      ? `- ${label}: \`${value}\`${eol}${normalizeLineEndings(content, eol)}`
      : `- ${label}: \`${value}\`${eol}`;
  }

  const lines = String(content).split(/\r?\n/);
  lines.splice(1, 0, '', `- ${label}: \`${value}\``);
  return lines.join(eol);
}

function ensureField(content, label, value) {
  return getFieldValue(content, label) == null
    ? replaceOrAppendField(content, label, value)
    : content;
}

function getFieldValue(content, label) {
  const key = contentKey(content, `field:${label}`);
  if (fieldCache.has(key)) {
    markCache('markdown_field_cache', true);
    return fieldCache.get(key);
  }
  markCache('markdown_field_cache', false);
  const pattern = new RegExp(`^- ${escapeRegex(label)}: \`(.*?)\`$`, 'm');
  const match = String(content || '').match(pattern);
  const value = match ? match[1] : null;
  fieldCache.set(key, value);
  return value;
}

function getSectionField(sectionBody, label) {
  return getFieldValue(sectionBody, label);
}

function replaceSection(content, heading, body) {
  const eol = detectLineEnding(content);
  const normalizedBody = normalizeLineEndings(body, eol).trimEnd();
  const pattern = new RegExp(`(^## ${escapeRegex(heading)}\\r?\\n)([\\s\\S]*?)(?=^## [^\\r\\n]+\\r?\\n|(?![\\s\\S]))`, 'm');
  if (!pattern.test(content)) {
    throw new Error(`Missing section: ${heading}`);
  }
  return content.replace(pattern, (_, prefix) => `${prefix}${normalizedBody}${eol}${eol}`);
}

function replaceOrAppendSection(content, heading, body) {
  try {
    return replaceSection(content, heading, body);
  } catch {
    const eol = detectLineEnding(content);
    const normalizedBody = normalizeLineEndings(body, eol).trimEnd();
    const prefix = String(content || '').trimEnd();
    return prefix
      ? `${prefix}${eol}${eol}## ${heading}${eol}${eol}${normalizedBody}${eol}`
      : `## ${heading}${eol}${eol}${normalizedBody}${eol}`;
  }
}

function extractSection(content, heading) {
  const key = contentKey(content, `section:${heading}`);
  if (sectionCache.has(key)) {
    markCache('markdown_section_cache', true);
    return sectionCache.get(key);
  }
  markCache('markdown_section_cache', false);
  const pattern = new RegExp(`^## ${escapeRegex(heading)}\\r?\\n([\\s\\S]*?)(?=^## [^\\r\\n]+\\r?\\n|(?![\\s\\S]))`, 'm');
  const match = String(content || '').match(pattern);
  if (!match) {
    throw new Error(`Missing section: ${heading}`);
  }
  const value = match[1].trim();
  sectionCache.set(key, value);
  return value;
}

function tryExtractSection(content, heading, fallback = '') {
  try {
    return extractSection(content, heading);
  } catch {
    return fallback;
  }
}

function ensureSection(content, heading, body) {
  try {
    extractSection(content, heading);
    return content;
  } catch {
    return replaceOrAppendSection(content, heading, body);
  }
}

module.exports = {
  ensureField,
  ensureSection,
  escapeRegex,
  extractSection,
  getFieldValue,
  getSectionField,
  replaceField,
  replaceOrAppendField,
  replaceOrAppendSection,
  replaceSection,
  tryExtractSection,
};
