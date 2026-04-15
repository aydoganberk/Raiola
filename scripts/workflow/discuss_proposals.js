const markdown = require('./markdown/sections');
const { normalizeDiscussMode } = require('./common_preferences');

const DISCUSS_PROPOSAL_SECTION = 'Discuss Proposal';

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function defaultDiscussProposalState(mode = 'assumptions') {
  const normalizedMode = normalizeDiscussMode(mode, 'assumptions');
  if (normalizedMode === 'proposal_first') {
    return {
      mode: normalizedMode,
      status: 'pending_approval',
      selectedOption: 'none',
      summary: 'Generate 2-3 narrow discuss options and approve one before opening the full packet.',
      approvalNote: 'No approval has been recorded yet.',
    };
  }

  return {
    mode: normalizedMode,
    status: 'not_needed',
    selectedOption: 'none',
    summary: 'This discuss mode does not require a proposal approval gate.',
    approvalNote: 'Proceed with the normal discuss packet.',
  };
}

function parseProposalField(sectionBody, label, fallback) {
  const match = String(sectionBody || '').match(new RegExp('^- ' + escapeRegex(label) + ': `([^`]*)`$', 'm'));
  return match ? match[1].trim() : fallback;
}

function readDiscussProposalState(content, mode = 'assumptions') {
  const defaults = defaultDiscussProposalState(mode);
  const section = markdown.tryExtractSection(content, DISCUSS_PROPOSAL_SECTION, '').trim();

  if (!section) {
    return defaults;
  }

  return {
    mode: defaults.mode,
    status: parseProposalField(section, 'Status', defaults.status),
    selectedOption: parseProposalField(section, 'Selected option', defaults.selectedOption),
    summary: parseProposalField(section, 'Summary', defaults.summary),
    approvalNote: parseProposalField(section, 'Approval note', defaults.approvalNote),
  };
}

function renderDiscussProposalSection(state = {}) {
  const defaults = defaultDiscussProposalState(state.mode);
  const proposalState = {
    ...defaults,
    ...state,
  };

  return [
    `- Status: \`${proposalState.status}\``,
    `- Selected option: \`${proposalState.selectedOption}\``,
    `- Summary: \`${proposalState.summary}\``,
    `- Approval note: \`${proposalState.approvalNote}\``,
  ].join('\n');
}

function discussBreakdownLines(mode = 'assumptions') {
  const normalizedMode = normalizeDiscussMode(mode, 'assumptions');

  if (normalizedMode === 'proposal_first') {
    return [
      '- `Proposal shortlist -> generate 2-3 narrow options before opening the full discuss packet`',
      '- `Approval gate -> record which option was approved and why it fits the slice`',
      '- `Focused discuss -> fill only the packet depth implied by the approved option`',
    ];
  }

  return [
    '- `Intent capture -> turn the user request into concrete intent and requirements`',
    '- `Constraint extraction -> capture explicit constraints and unanswered high-leverage questions`',
    '- `Execution shaping -> compare approaches and define an observable success rubric`',
  ];
}

module.exports = {
  DISCUSS_PROPOSAL_SECTION,
  defaultDiscussProposalState,
  discussBreakdownLines,
  readDiscussProposalState,
  renderDiscussProposalSection,
};
