const path = require('node:path');
const crypto = require('node:crypto');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function shortHash(value, length = 12) {
  return String(value || '').slice(0, length);
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
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

module.exports = {
  ensureUniqueMilestoneId,
  fileCoveredByStagePath,
  hashString,
  normalizeStagePath,
  safeArtifactToken,
  shortHash,
  slugify,
};
