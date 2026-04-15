const fs = require('node:fs');
const path = require('node:path');
const {
  ensureDir,
  readTextIfExists: readIfExists,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const { DEFAULT_RULE_LINES } = require('./policy_dsl_lib/constants');
const {
  buildIssue,
  parseKeyValue,
  parseRuleLine,
  stripQuotes,
  tokenize,
} = require('./policy_dsl_lib/parser');
const {
  matchRule,
  resolveDslDecision,
  valueMatches,
} = require('./policy_dsl_lib/matcher');

function policyDslPath(cwd) {
  return path.join(cwd, '.workflow', 'policy.rules');
}

function defaultPolicyDsl() {
  return DEFAULT_RULE_LINES.join('\n');
}

function ensurePolicyDsl(cwd) {
  const filePath = policyDslPath(cwd);
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    writeIfChanged(filePath, `${defaultPolicyDsl().trimEnd()}\n`);
  }
  return filePath;
}

function loadPolicyDsl(cwd) {
  const filePath = ensurePolicyDsl(cwd);
  const content = readIfExists(filePath) || defaultPolicyDsl();
  const rules = [];
  const grants = [];
  const issues = [];

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const parsed = parseRuleLine(rawLine, index);
    if (!parsed) {
      continue;
    }

    if (parsed.type === 'issue') {
      issues.push(parsed);
      continue;
    }

    if (parsed.issues?.length) {
      for (const reason of parsed.issues) {
        issues.push(buildIssue(parsed.line, parsed.source, reason));
      }
    }

    if (parsed.type === 'grant') {
      grants.push(parsed);
    } else {
      rules.push(parsed);
    }
  }

  return {
    filePath,
    content,
    rules,
    grants,
    issues,
  };
}

module.exports = {
  defaultPolicyDsl,
  ensurePolicyDsl,
  loadPolicyDsl,
  matchRule,
  parseKeyValue,
  parseRuleLine,
  policyDslPath,
  resolveDslDecision,
  stripQuotes,
  tokenize,
  valueMatches,
};
