const TOKEN_RE = /[^\s=]+=(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+/g;
const RULE_DECISIONS = new Set(['allow', 'warn', 'require_approval', 'block']);
const DECISION_ALIASES = Object.freeze({
  allow: 'auto',
  require_approval: 'human_needed',
});
const DECISION_WEIGHTS = Object.freeze({
  block: 4,
  human_needed: 3,
  warn: 2,
  auto: 1,
});
const DEFAULT_RULE_LINES = Object.freeze([
  '# Raiola policy rules',
  '# Syntax:',
  '# allow|warn|require_approval|block <operation> when <key>=<value> [and <key>=<value> ...] [note="..."]',
  '# grant <target> reason="..."',
  '',
  'warn edit when domain=src note="Source edits remain reviewable by default."',
  'require_approval edit when domain=migrations note="Schema edits need explicit approval."',
  'block delete when domain=secrets note="Secret surfaces are immutable without a human."',
  'warn browser when actor=worker note="Worker browser actions should remain evidence-backed."',
]);

module.exports = {
  DECISION_ALIASES,
  DECISION_WEIGHTS,
  DEFAULT_RULE_LINES,
  RULE_DECISIONS,
  TOKEN_RE,
};
