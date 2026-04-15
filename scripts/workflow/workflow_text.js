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

module.exports = {
  isWorkflowPlaceholderValue,
  normalizeWorkflowText,
  WORKFLOW_PLACEHOLDER_PHRASES,
};
