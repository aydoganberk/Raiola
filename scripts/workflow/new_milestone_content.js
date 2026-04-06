const { renderMarkdownTable } = require('./common');

function renderAssumptionsTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Confidence', 'Evidence refs', 'Failure mode'],
    [[
      'To be filled during discuss',
      'Unclear',
      contextRef,
      'Milestone scope may be framed incorrectly',
    ]],
  );
}

function renderClaimLedgerTable(contextRef) {
  return renderMarkdownTable(
    ['Claim', 'Type', 'Evidence refs', 'Confidence', 'Failure if wrong'],
    [[
      'Initial milestone packet only seeds the frame',
      'inference',
      contextRef,
      'Likely',
      'Planning may begin before research is ready',
    ]],
  );
}

function renderConstraintsTable() {
  return renderMarkdownTable(
    ['Constraint', 'Type', 'Source', 'Impact'],
    [[
      'No explicit constraints captured yet',
      'scope',
      'user',
      'Fill during constraint extraction before planning starts',
    ]],
  );
}

function renderAlternativesTable() {
  return renderMarkdownTable(
    ['Option', 'Status', 'Why'],
    [[
      'Keep the seeded milestone framing and refine it after codebase scan',
      'open',
      'Fill real alternatives during execution shaping',
    ]],
  );
}

function renderHighLeverageQuestionsTable(milestoneGoal) {
  return renderMarkdownTable(
    ['Question', 'Impact', 'Owner', 'Status'],
    [[
      `What is the smallest user-visible slice that proves "${milestoneGoal}" is done?`,
      'This decides how the plan should be sliced',
      'owner',
      'open',
    ]],
  );
}

function renderSuccessRubricTable(successSignal) {
  return renderMarkdownTable(
    ['Outcome', 'Observable signal', 'Why it matters'],
    [[
      'Milestone success',
      successSignal,
      'Execution should not start before success is observable',
    ]],
  );
}

function renderRequirementListTable(milestoneGoal) {
  return renderMarkdownTable(
    ['Requirement ID', 'Requirement', 'Type', 'Source', 'Notes'],
    [[
      'R1',
      milestoneGoal,
      'functional',
      'user',
      'Seeded from the milestone goal; refine or split during discuss',
    ]],
  );
}

function renderDependencyBlockersTable() {
  return renderMarkdownTable(
    ['Blocker', 'Type', 'Owner', 'Status', 'Unblock signal'],
    [[
      'No blockers identified yet',
      'none',
      'n/a',
      'clear',
      'Replace this row only if a real dependency blocker appears',
    ]],
  );
}

function renderWaveStructureTable() {
  return renderMarkdownTable(
    ['Wave', 'Chunks', 'Goal', 'Depends on', 'Parallel rule', 'Owners / write scope', 'Integration order', 'Commit boundary'],
    [
      [
        '1',
        'chunk-1',
        'Dependency-free foundation or prep slice',
        'none',
        'Only independent chunks may run together',
        'Fill owners and paths before execute',
        'Integrate wave 1 before wave 2 opens',
        'manual',
      ],
      [
        '2',
        'chunk-2',
        'Build on completed wave 1 outputs',
        'wave-1',
        'Only chunks that depend only on completed wave 1 work',
        'Fill owners and paths before execute',
        'Integrate after all wave 2 work is complete',
        'manual',
      ],
      [
        '3',
        'chunk-3',
        'Final integration, shared-surface work, or execute closeout',
        'wave-1, wave-2',
        'Prefer serialized or narrowly parallel work',
        'Fill owners and paths before execute',
        'Close execute before audit begins',
        'manual',
      ],
    ],
  );
}

function renderWaveExecutionPolicy() {
  return [
    '- `Execute follows wave 1 -> wave 2 -> wave 3.`',
    '- `Wave 1 carries dependency-free foundation or prep slices.`',
    '- `Wave 2 may start only after wave 1 is integrated and only for work that depends on completed wave 1 outputs.`',
    '- `Wave 3 closes the execute loop with final integration, shared-surface work, or execution-level cleanup.`',
    '- `Only dependency-free chunks may share a wave. If a dependency is unclear, serialize it or move it to a later wave.`',
    '- `Every write-capable chunk must name an owner and explicit write scope before a worker can be opened.`',
    '- `Unused waves should be marked not needed rather than omitted so resume logic can see the intended execution shape.`',
  ].join('\n');
}

function renderCoverageMatrixTable(milestoneLabel) {
  return renderMarkdownTable(
    ['Requirement ID', 'Milestone', 'Capability slice', 'Plan chunk', 'Validation ID', 'Notes'],
    [[
      'R1',
      milestoneLabel,
      'Fill during planning',
      'chunk-1',
      'AC1',
      'Every active requirement must map exactly once before execute',
    ]],
  );
}

function renderPlanChunkTable() {
  return renderMarkdownTable(
    ['Chunk ID', 'Capability slice', 'Deliverable', 'Depends on', 'Wave', 'Owner', 'Write scope', 'Status'],
    [
      [
        'chunk-1',
        'Fill during planning',
        'Describe the dependency-free slice this chunk delivers',
        'none',
        '1',
        'main',
        'Fill owned paths before execute',
        'pending',
      ],
      [
        'chunk-2',
        'Fill during planning',
        'Describe the wave 2 slice this chunk delivers',
        'chunk-1',
        '2',
        'main',
        'Fill owned paths before execute',
        'pending',
      ],
      [
        'chunk-3',
        'Fill during planning',
        'Describe the wave 3 integration slice this chunk delivers',
        'chunk-1, chunk-2',
        '3',
        'main',
        'Fill owned paths before execute',
        'pending',
      ],
    ],
  );
}

function renderCommitPolicy(commitGranularity = 'manual') {
  return [
    '- `Preference source: PREFERENCES.md -> Commit granularity`',
    `- \`Commit granularity: ${commitGranularity}\``,
    '- `Atomic commit mode: off`',
    '- `If atomic commit mode = wave, only commit after a whole wave has been integrated.`',
    '- `If atomic commit mode = chunk, only commit after a single chunk has been integrated.`',
    '- `If atomic commit mode = off, stay manual and use the normal milestone closeout path unless the user explicitly wants otherwise.`',
  ].join('\n');
}

function renderUnknownsTable() {
  return renderMarkdownTable(
    ['Unknown', 'Impact', 'Owner', 'Status'],
    [[
      'Milestone-specific unknowns will be clarified during discuss',
      'Affects plan quality',
      'owner',
      'open',
    ]],
  );
}

function renderValidationContract(milestoneName, goldenRef, statusRef) {
  return renderMarkdownTable(
    ['Deliverable', 'Verify command', 'Expected signal', 'Manual check', 'Golden', 'Audit owner', 'Status', 'Evidence', 'Packet hash'],
    [[
      `${milestoneName} scope`,
      'Fill after research',
      'Scope and packet become clear',
      'Review discuss/research notes',
      goldenRef,
      'audit',
      'pending',
      statusRef,
      'pending_sync',
    ]],
  );
}

function renderAcceptanceCriteriaTable(successSignal) {
  return renderMarkdownTable(
    ['Acceptance ID', 'Criterion', 'How to observe', 'Status'],
    [[
      'AC1',
      'The active milestone delivers the intended capability',
      successSignal,
      'pending',
    ]],
  );
}

function renderUserVisibleOutcomesTable(successSignal) {
  return renderMarkdownTable(
    ['Outcome', 'How to observe', 'Status'],
    [[
      'User-visible outcome seeded from milestone success signal',
      successSignal,
      'pending',
    ]],
  );
}

function renderRegressionFocusTable() {
  return renderMarkdownTable(
    ['Area', 'Risk', 'Check'],
    [[
      'Existing behavior adjacent to this milestone',
      'Regression focus is still unknown until research completes',
      'Fill after touched files and dependencies are known',
    ]],
  );
}

function renderInitialFrontendAuditMode() {
  return [
    '- `Frontend mode: inactive`',
    '- `Activation reason: workflow_active_without_frontend_signals`',
    '- `Activation signals: none`',
    '- `Design-system aware execution: no`',
    '- `Adapter route: none`',
    '- `Preview/browser verification need: no`',
    '- `Visual verdict required: no`',
  ].join('\n');
}

function renderInitialVisualVerdictTable() {
  return renderMarkdownTable(
    ['Verdict area', 'Expectation', 'How to observe', 'Evidence expectation', 'Status'],
    [
      ['responsive', 'Fill when frontend mode is active', 'Describe viewport or breakpoint proof', 'Screenshot or browser-verify note', 'optional'],
      ['interaction', 'Fill when frontend mode is active', 'Describe key interaction checks', 'Manual note, test output, or browser trace', 'optional'],
      ['visual consistency', 'Fill when frontend mode is active', 'Describe design-system or visual review', 'Review note plus screenshot evidence when relevant', 'optional'],
      ['component reuse', 'Fill when frontend mode is active', 'Describe shared component/design-system reuse', 'Diff review note', 'optional'],
      ['accessibility smoke', 'Fill when frontend mode is active', 'Describe semantic/focus/label smoke checks', 'Manual note or tool output', 'optional'],
      ['screenshot evidence', 'Fill when frontend mode is active', 'Describe the screenshot or visual artifact', 'Screenshot path, URL, or explicit note', 'optional'],
    ],
  );
}

function renderMinimumDoneChecklist(profile) {
  const variants = {
    lite: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        'User intent, explicit constraints, success rubric, and requirement list were filled in',
        'Relevant core files were scanned and the scope was framed with evidence',
      ],
      research: [
        'Touched files were documented',
        'Risks and verification surface were written down',
        'VALIDATION.md acceptance criteria and contract were narrowed to milestone scope',
      ],
      plan: [
        'Chosen strategy, rollback/fallback, blockers, wave execution policy, and commit policy were written',
        'Coverage matrix had no orphan or duplicate requirements',
        'workflow:plan-check passed before execute started',
      ],
      execute: [
        'Only ready chunks from the active wave were executed',
        'Same-wave work stayed dependency-free with disjoint write scope',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md summary fields were refreshed',
        'Integration order and any atomic commit checkpoints were recorded when relevant',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'The milestone did not move to complete before audit closed',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Git closeout scope was made explicit',
      ],
    },
    standard: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        '5-15 relevant files were scanned',
        'User intent, explicit constraints, unanswered questions, and requirement list were filled in',
        'Seed intake and active recall intake were recorded',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks and verification surface were written down',
        'VALIDATION.md acceptance criteria, user-visible outcomes, and contract were narrowed to milestone scope',
      ],
      plan: [
        'Chosen strategy, rejected strategies, wave execution policy, and commit policy were written',
        'Carryforward and seed intake were reviewed',
        'Coverage matrix and plan chunk table were written as dependency-aware vertical capability slices with owner + write scope',
        'workflow:plan-check passed before execute started',
      ],
      execute: [
        'Only ready chunks from the active wave were executed',
        'Same-wave work stayed dependency-free with disjoint write scope',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md Verified/Inferred/Unknown were updated',
        'Integration order and any atomic commit checkpoints were recorded when relevant',
        'Active recall notes were saved when needed',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'Evidence / packet hash fields were updated',
        'Strict health was confirmed clean before complete',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Active recall cleanup was checked',
        'AGENTS.md / git closeout needs were reviewed',
      ],
    },
    full: {
      discuss: [
        'Intent capture, constraint extraction, and execution shaping were completed',
        '5-15 relevant files were scanned',
        'User intent, explicit constraints, unanswered questions, success rubric, and falsifiers were written',
        'Seed intake and active recall intake were recorded',
        'Possible handoff/closeout needs were noted',
      ],
      research: [
        'Touched files were documented',
        'Dependency map was produced',
        'Risks, verification surface, and research targets were written down',
        'VALIDATION.md acceptance criteria, user-visible outcomes, regression focus, and contract were narrowed to milestone scope',
        'A RETRO note was captured if process friction appeared',
      ],
      plan: [
        'Chosen strategy, rejected strategies, rollback/fallback, blockers, wave execution policy, and commit policy were written',
        'Carryforward and seed intake were reviewed',
        'Coverage matrix and plan chunk table were written as dependency-aware vertical capability slices with owner + write scope',
        'workflow:plan-check passed before execute started',
        'Resume anchor and out-of-scope guardrails were clarified',
      ],
      execute: [
        'Only ready chunks from the active wave were executed',
        'Same-wave work stayed dependency-free with disjoint write scope',
        'Docs were updated when work drifted beyond plan',
        'STATUS.md Verified/Inferred/Unknown were updated',
        'Integration order and any atomic commit checkpoints were recorded when relevant',
        'Active recall notes were saved when needed',
        'A RETRO note was kept if a process gap appeared',
      ],
      audit: [
        'Verify command rows were run',
        'Manual checks and remaining risks were written down',
        'Evidence / packet hash fields were updated',
        'Strict health was confirmed clean before complete',
        'A RETRO entry was prepared if a process gap appeared',
      ],
      complete: [
        'Carryforward was selected',
        'Archive and validation snapshot were written',
        'Active recall cleanup was checked',
        'AGENTS.md and RETRO.md update needs were reviewed',
        'Git closeout scope was made explicit intentionally',
      ],
    },
  };
  const selected = variants[profile] || variants.standard;

  return `
- Minimum done (\`${profile}\`):
  - Discuss:
    - \`${selected.discuss.join('`\n    - `')}\`
  - Research:
    - \`${selected.research.join('`\n    - `')}\`
  - Plan:
    - \`${selected.plan.join('`\n    - `')}\`
  - Execute:
    - \`${selected.execute.join('`\n    - `')}\`
  - Audit:
    - \`${selected.audit.join('`\n    - `')}\`
  - Complete:
    - \`${selected.complete.join('`\n    - `')}\`
`;
}

module.exports = {
  renderAcceptanceCriteriaTable,
  renderAlternativesTable,
  renderAssumptionsTable,
  renderClaimLedgerTable,
  renderCommitPolicy,
  renderConstraintsTable,
  renderCoverageMatrixTable,
  renderDependencyBlockersTable,
  renderHighLeverageQuestionsTable,
  renderInitialFrontendAuditMode,
  renderInitialVisualVerdictTable,
  renderMinimumDoneChecklist,
  renderPlanChunkTable,
  renderRegressionFocusTable,
  renderRequirementListTable,
  renderSuccessRubricTable,
  renderUnknownsTable,
  renderUserVisibleOutcomesTable,
  renderValidationContract,
  renderWaveExecutionPolicy,
  renderWaveStructureTable,
};
