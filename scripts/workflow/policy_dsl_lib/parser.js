const {
  DECISION_ALIASES,
  RULE_DECISIONS,
  TOKEN_RE,
} = require('./constants');

function tokenize(line) {
  const tokens = [];
  for (const match of String(line || '').matchAll(TOKEN_RE)) {
    tokens.push(match[0]);
  }
  return tokens;
}

function stripQuotes(value) {
  const normalized = String(value || '').trim();
  const hasDoubleQuotes = normalized.startsWith('"') && normalized.endsWith('"');
  const hasSingleQuotes = normalized.startsWith("'") && normalized.endsWith("'");
  if (hasDoubleQuotes || hasSingleQuotes) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function parseKeyValue(token) {
  const normalized = String(token || '').trim();
  const separatorIndex = normalized.indexOf('=');
  if (separatorIndex === -1) {
    return null;
  }

  return {
    key: normalized.slice(0, separatorIndex).trim(),
    value: stripQuotes(normalized.slice(separatorIndex + 1).trim()),
  };
}

function extractAssignment(tokens, key) {
  const prefix = `${key}=`;
  const hit = (tokens || []).find((token) => token.startsWith(prefix));
  if (!hit) {
    return '';
  }
  return stripQuotes(hit.slice(prefix.length));
}

function normalizeDecision(word) {
  return DECISION_ALIASES[word] || word;
}

function buildIssue(lineNumber, source, reason) {
  return {
    type: 'issue',
    line: lineNumber,
    source,
    reason,
  };
}

function parseGrant(tokens, lineNumber, source) {
  return {
    type: 'grant',
    target: stripQuotes(tokens[0] || '*'),
    reason: extractAssignment(tokens.slice(1), 'reason') || 'manual grant',
    line: lineNumber,
    source,
    issues: [],
  };
}

function parseRule(decisionWord, tokens, lineNumber, source) {
  const operation = stripQuotes(tokens[0] || '*');
  if (!operation) {
    return buildIssue(lineNumber, source, 'Rule is missing an operation token.');
  }

  const whenIndex = tokens.findIndex((token) => token === 'when');
  const note = extractAssignment(tokens, 'note');
  const filters = {};
  const issues = [];

  if (whenIndex !== -1) {
    for (const token of tokens.slice(whenIndex + 1)) {
      if (!token || token === 'and' || token.startsWith('note=')) {
        continue;
      }

      const keyValue = parseKeyValue(token);
      if (!keyValue || !keyValue.key) {
        issues.push(`Ignored malformed condition token "${token}".`);
        continue;
      }
      filters[keyValue.key] = keyValue.value;
    }
  }

  return {
    type: 'rule',
    decision: normalizeDecision(decisionWord),
    operation,
    filters,
    note,
    line: lineNumber,
    source,
    issues,
  };
}

function parseRuleLine(line, index) {
  const lineNumber = index + 1;
  const source = String(line || '').trim();
  if (!source || source.startsWith('#')) {
    return null;
  }

  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return null;
  }

  const [head, ...rest] = tokens;
  if (head === 'grant') {
    return parseGrant(rest, lineNumber, source);
  }
  if (!RULE_DECISIONS.has(head)) {
    return buildIssue(lineNumber, source, `Unknown policy directive "${head}".`);
  }
  return parseRule(head, rest, lineNumber, source);
}

module.exports = {
  buildIssue,
  extractAssignment,
  normalizeDecision,
  parseGrant,
  parseKeyValue,
  parseRule,
  parseRuleLine,
  stripQuotes,
  tokenize,
};
