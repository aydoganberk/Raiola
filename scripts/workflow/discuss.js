const path = require('node:path');
const {
  loadPreferences,
  parseArgs,
  replaceField,
  replaceOrAppendSection,
  resolveWorkflowRoot,
  syncPacketHash,
  today,
  tryExtractSection,
  workflowPaths,
} = require('./common');
const {
  readText: read,
  readTextIfExists: readIfExists,
  writeText: write,
} = require('./io/files');
const { normalizeDiscussMode } = require('./common_preferences');
const { buildFrontendProfile } = require('./map_frontend');
const { writeRuntimeJson, writeRuntimeMarkdown } = require('./runtime_helpers');
const {
  DISCUSS_PROPOSAL_SECTION,
  discussBreakdownLines,
  readDiscussProposalState,
  renderDiscussProposalSection,
} = require('./discuss_proposals');
const { readAssumptions } = require('./trust_os');
const { readTableDocument } = require('./roadmap_os');

function printHelp() {
  console.log(`
discuss

Usage:
  node scripts/workflow/discuss.js
  node scripts/workflow/discuss.js --goal "Clarify the next frontend slice"

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --goal <text>     Optional discuss focus or goal override
  --mode <mode>     Optional override: assumptions|interview|proposal_first
  --approve <id>    Record approval for a proposal_first discuss option
  --json            Print machine-readable output
  `);
}

function readQuestions(cwd) {
  const filePath = path.join(cwd, 'docs', 'workflow', 'QUESTIONS.md');
  const table = readTableDocument(filePath, 'Open Questions', {
    title: 'QUESTIONS',
    headers: ['Id', 'Question', 'Status', 'Opened At', 'Resolution'],
  });
  return table.rows.filter((row) => row[1]);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractProblemFrameValue(context, label) {
  const section = tryExtractSection(context, 'Problem Frame', '');
  const match = section.match(new RegExp('- ' + escapeRegex(label) + ':\\s*\\n\\s*- `([^`]*)`', 'm'));
  return match ? match[1].trim() : '';
}

function extractIntentCoreGoal(context) {
  const section = tryExtractSection(context, 'Intent Core', '');
  const match = section.match(/^- Goal: `([^`]*)`$/m);
  return match ? match[1].trim() : '';
}

function resolveDiscussGoal(status, context, goalOverride) {
  const explicitGoal = String(goalOverride || '').trim();
  if (explicitGoal) {
    return explicitGoal;
  }

  return extractProblemFrameValue(context, 'Goal')
    || extractIntentCoreGoal(context)
    || String((status.match(/^- Current milestone: `(.*)`$/m) || [])[1] || '')
      .replace(/^[A-Z0-9-]+ - /, '')
      .trim()
    || 'Clarify the next safe slice';
}

function buildGenericProposalOptions(goal) {
  return [
    {
      id: 'proposal-1',
      title: 'Lean slice framing',
      summary: `Keep discuss narrow around "${goal}" and avoid opening extra packet surfaces yet.`,
      why: 'Best default when the main job is to lock the smallest safe slice fast.',
      nextArtifacts: ['CONTEXT -> User Intent', 'CONTEXT -> Explicit Constraints', 'CONTEXT -> Success Rubric'],
      recommended: true,
    },
    {
      id: 'proposal-2',
      title: 'Research-assisted framing',
      summary: `Add a light repo scan before deepening the discuss packet for "${goal}".`,
      why: 'Useful when the codebase shape could change the slice choice.',
      nextArtifacts: ['CONTEXT -> User Intent', 'QUESTIONS', 'ASSUMPTIONS', 'CONTEXT -> Codebase Scan Summary'],
      recommended: false,
    },
    {
      id: 'proposal-3',
      title: 'Full discuss packet',
      summary: `Open the full discuss surface immediately for "${goal}" when handoff depth matters more than speed.`,
      why: 'Use only when the slice is broad enough to justify the heavier packet.',
      nextArtifacts: ['CONTEXT full packet', 'VALIDATION prep'],
      recommended: false,
    },
  ];
}

function buildFrontendProposalOptions(goal, frontendProfile) {
  const mobileSurface = frontendProfile.productSurface.category === 'mobile-consumer-app';
  const surfaceLabel = mobileSurface ? 'mobile screen flow' : 'frontend surface';

  return [
    {
      id: 'proposal-1',
      title: mobileSurface ? 'Lean mobile surface alignment' : 'Lean surface alignment',
      summary: `Lock the real ${surfaceLabel} for "${goal}" before opening deeper artifact packs.`,
      why: 'This is the safest path when repo context was previously misread.',
      nextArtifacts: ['map-frontend', 'ui-direction', 'ui-spec'],
      recommended: true,
    },
    {
      id: 'proposal-2',
      title: mobileSurface ? 'Screen flow and state coverage' : 'Flow and state coverage',
      summary: `After surface alignment, document the critical states and flow edges that can break "${goal}".`,
      why: 'Good when the slice depends on gestures, screen transitions, or dense state handling.',
      nextArtifacts: ['map-frontend', 'ui-direction', 'state-atlas', 'ui-plan'],
      recommended: false,
    },
    {
      id: 'proposal-3',
      title: 'Full frontend packet',
      summary: `Open the heavyweight frontend artifact pack for "${goal}" only if the slice is broad or handoff-heavy.`,
      why: 'Best reserved for large UI milestones where the lean path would be too thin.',
      nextArtifacts: ['frontend-brief'],
      recommended: false,
    },
  ];
}

function buildProposalOptions(goal, frontendProfile) {
  const frontendSignals = frontendProfile.frontendMode.active
    || frontendProfile.signals.hits.length > 0
    || frontendProfile.productSurface.category !== 'unknown';
  const options = frontendSignals
    ? buildFrontendProposalOptions(goal, frontendProfile)
    : buildGenericProposalOptions(goal);

  return options.map((option) => ({
    ...option,
    approvalCommand: `rai discuss --approve ${option.id}`,
  }));
}

function applyProposalApproval(paths, discussMode, goal, selectedOption) {
  let context = read(paths.context);
  context = replaceField(context, 'Last updated', today());
  context = replaceField(context, 'Discuss mode', discussMode);
  context = replaceField(context, 'Context status', 'proposal_approved_ready_for_discuss');
  context = replaceField(context, 'Discuss subphase', 'intent_capture');
  context = replaceOrAppendSection(context, 'Discuss Breakdown', discussBreakdownLines(discussMode).join('\n'));
  context = replaceOrAppendSection(context, DISCUSS_PROPOSAL_SECTION, renderDiscussProposalSection({
    mode: discussMode,
    status: 'approved',
    selectedOption: selectedOption.id,
    summary: `${selectedOption.title} -> ${selectedOption.summary}`,
    approvalNote: `Approved on ${today()} for ${goal}.`,
  }));
  write(paths.context, context);
  syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  return readDiscussProposalState(read(paths.context), discussMode);
}

function buildProposalMarkdown(options) {
  if (options.length === 0) {
    return '- `No proposal options generated.`';
  }

  return options.map((option) => [
    `- \`${option.id}\` ${option.title}${option.recommended ? ' (recommended)' : ''}`,
    `  - Summary: \`${option.summary}\``,
    `  - Why: \`${option.why}\``,
    `  - Next artifacts: \`${option.nextArtifacts.join(', ')}\``,
    `  - Approval command: \`${option.approvalCommand}\``,
  ].join('\n')).join('\n');
}

function buildDiscussPayload(cwd, rootDir, args = {}) {
  const paths = workflowPaths(rootDir);
  const status = readIfExists(paths.status) || '';
  const preferences = loadPreferences(paths);
  const discussMode = normalizeDiscussMode(args.mode || preferences.discussMode, preferences.discussMode);
  let context = readIfExists(paths.context) || '';
  const goal = resolveDiscussGoal(status, context, args.goal);
  const userIntent = tryExtractSection(context, 'User Intent', '').trim();
  const constraints = tryExtractSection(context, 'Explicit Constraints', '').trim();
  const questions = readQuestions(cwd).slice(0, 8).map((row) => ({
    id: row[0],
    question: row[1],
    status: row[2] || 'open',
  }));
  const assumptions = readAssumptions(cwd).filter((row) => row.status !== 'resolved').slice(0, 8);
  const frontendProfile = buildFrontendProfile(cwd, rootDir);
  const options = discussMode === 'proposal_first'
    ? buildProposalOptions(goal, frontendProfile)
    : [];
  let proposalState = readDiscussProposalState(context, discussMode);

  if (args.approve) {
    if (discussMode !== 'proposal_first') {
      throw new Error('--approve can only be used when Discuss mode is proposal_first');
    }

    const selectedOption = options.find((option) => option.id === String(args.approve).trim());
    if (!selectedOption) {
      throw new Error(`Unknown discuss proposal id: ${args.approve}`);
    }

    proposalState = applyProposalApproval(paths, discussMode, goal, selectedOption);
    context = readIfExists(paths.context) || context;
  }

  const prompts = [];

  if (discussMode === 'proposal_first' && proposalState.status !== 'approved') {
    prompts.push('Choose one proposal option and record approval before expanding the discuss packet.');
    prompts.push('Keep the shortlist to 2-3 options and prefer the recommended one unless repo signals justify a different path.');
  } else {
    if (discussMode === 'proposal_first' && proposalState.selectedOption !== 'none') {
      prompts.push(`Stay inside the approved proposal scope: ${proposalState.selectedOption}.`);
    }
    if (questions.length === 0) {
      prompts.push('Capture at least one high-impact open question before leaving discuss.');
    }
    if (assumptions.length === 0) {
      prompts.push('Write one evidence-backed assumption so later corrections stay visible.');
    }
    if (!constraints) {
      prompts.push('Explicit Constraints in CONTEXT.md still look thin.');
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    action: 'discuss',
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    goal,
    discussMode,
    discussBreakdown: discussBreakdownLines(discussMode).map((line) => line.replace(/^- /, '')),
    userIntent: userIntent || 'No explicit User Intent section is filled yet.',
    constraints: constraints || 'No explicit constraints were captured yet.',
    approvalRequired: discussMode === 'proposal_first',
    approvalApplied: Boolean(args.approve),
    approval: {
      status: proposalState.status,
      selectedOption: proposalState.selectedOption,
      summary: proposalState.summary,
      approvalNote: proposalState.approvalNote,
    },
    options,
    questions,
    assumptions,
    prompts,
    frontend: {
      active: frontendProfile.frontendMode.active,
      productSurface: frontendProfile.productSurface.category,
      framework: frontendProfile.framework.primary,
      adapters: frontendProfile.adapters.selected,
    },
  };
  payload.selectedOption = payload.options.find((option) => option.id === payload.approval.selectedOption) || null;

  const markdown = `# DISCUSS

- Goal: \`${payload.goal}\`
- Root: \`${payload.rootDir}\`
- Discuss mode: \`${payload.discussMode}\`

## User Intent

${payload.userIntent}

${payload.approvalRequired ? `## Proposal Approval

- Status: \`${payload.approval.status}\`
- Selected option: \`${payload.approval.selectedOption}\`
- Summary: \`${payload.approval.summary}\`
- Approval note: \`${payload.approval.approvalNote}\`

## Proposal Options

${buildProposalMarkdown(payload.options)}

` : ''}## Explicit Constraints

${payload.constraints}

## Open Questions

${payload.questions.length > 0
    ? payload.questions.map((row) => `- \`${row.id}\` ${row.question}`).join('\n')
    : '- `No open questions recorded.`'}

## Active Assumptions

${payload.assumptions.length > 0
    ? payload.assumptions.map((row) => `- \`${row.id}\` ${row.assumption}`).join('\n')
    : '- `No active assumptions recorded.`'}

## Discuss Prompts

${payload.prompts.length > 0
    ? payload.prompts.map((item) => `- \`${item}\``).join('\n')
    : '- `Discuss surface looks ready to move forward.`'}
`;

  const jsonPath = writeRuntimeJson(cwd, 'discuss.json', payload);
  const markdownPath = writeRuntimeMarkdown(cwd, 'discuss.md', markdown);
  payload.artifacts = {
    json: path.relative(cwd, jsonPath).replace(/\\/g, '/'),
    markdown: path.relative(cwd, markdownPath).replace(/\\/g, '/'),
  };
  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildDiscussPayload(cwd, rootDir, args);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# DISCUSS\n');
  console.log(`- Goal: \`${payload.goal}\``);
  console.log(`- Discuss mode: \`${payload.discussMode}\``);
  console.log(`- Questions: \`${payload.questions.length}\``);
  console.log(`- Assumptions: \`${payload.assumptions.length}\``);
  if (payload.approvalRequired) {
    console.log(`- Approval status: \`${payload.approval.status}\``);
  }
  console.log(`- Runtime brief: \`${payload.artifacts.markdown}\``);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildDiscussPayload,
  buildProposalOptions,
};
