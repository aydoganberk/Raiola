const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  extractBulletItems,
  extractSection,
  getFieldValue,
  loadPreferences,
  parseArgs,
  parseTableSectionObjects,
  parseValidationContract,
  read,
  replaceField,
  replaceSection,
  resolveWorkflowRoot,
  syncPacketHash,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
} = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const { writeStateSurface } = require('./state_surface');

function printHelp() {
  console.log(`
plan_check

Usage:
  node scripts/workflow/plan_check.js --strict

Options:
  --root <path>     Workflow root. Defaults to active workstream root
  --strict          Exit non-zero when any fail check exists
  --sync            Write plan-ready state back to workflow docs
  --json            Print machine-readable output
  `);
}

function runHealthStrictCheck(rootDir, cwd = process.cwd()) {
  childProcess.execFileSync('node', [path.join(__dirname, 'health.js'), '--root', rootDir, '--strict'], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function safeExtract(content, heading, fallback = '') {
  try {
    return extractSection(content, heading);
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/`/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeText(value)]),
  ));
}

function isPlaceholderValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  const placeholderPhrases = [
    'fill when',
    'fill this',
    'fill after',
    'fill during',
    'fill once',
    'to be filled',
    'replace this placeholder',
    'describe the',
    'document the',
    'document rejected strategies',
    'pending_sync',
    'waiting for',
    'still unknown',
    'no explicit constraints captured yet',
    'seeded milestone framing',
  ];

  return placeholderPhrases.some((phrase) => normalized.includes(phrase));
}

function rowsWithContent(rows, requiredKeys) {
  return rows.filter((row) => requiredKeys.every((key) => !isPlaceholderValue(row[key])));
}

function sectionHasMeaningfulText(content, options = {}) {
  const normalized = normalizeText(content).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (options.allowExplicitNone && (
    normalized.includes('none currently')
    || normalized.includes('no blockers identified yet')
    || normalized.includes('no explicit constraints')
  )) {
    return true;
  }

  return !isPlaceholderValue(normalized);
}

function isHorizontalSlice(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || isPlaceholderValue(normalized)) {
    return false;
  }

  const horizontalSignals = [
    /\bui\b/,
    /\bfrontend\b/,
    /\bbackend\b/,
    /\bapi\b/,
    /\bmodel(s)?\b/,
    /\bdatabase\b/,
    /\bdb\b/,
    /\bschema\b/,
    /\btype(s)?\b/,
    /\btest(s|ing)?\b/,
    /\bvalidation\b/,
    /\bservice(s)?\b/,
    /\bcontroller(s)?\b/,
  ];

  const featureSignals = [
    /\buser\b/,
    /\bcustomer\b/,
    /\badmin\b/,
    /\bflow\b/,
    /\bjourney\b/,
    /\bcapability\b/,
    /\boutcome\b/,
    /\bcreate\b/,
    /\bedit\b/,
    /\bview\b/,
    /\bsearch\b/,
    /\bfilter\b/,
    /\bexport\b/,
    /\bimport\b/,
    /\bsync\b/,
    /\bupload\b/,
    /\bdownload\b/,
    /\bcheckout\b/,
    /\blogin\b/,
    /\bsign\b/,
    /\bscreen\b/,
  ];

  const horizontalHit = horizontalSignals.some((pattern) => pattern.test(normalized));
  const featureHit = featureSignals.some((pattern) => pattern.test(normalized));

  return horizontalHit && !featureHit;
}

function summarizeChecks(checks) {
  return {
    failCount: checks.filter((item) => item.status === 'fail').length,
    pendingCount: checks.filter((item) => item.status === 'pending').length,
    warnCount: checks.filter((item) => item.status === 'warn').length,
    passCount: checks.filter((item) => item.status === 'pass').length,
  };
}

function gateStatusFromChecks(checks, area = null) {
  const relevant = area ? checks.filter((item) => item.area === area) : checks;
  if (relevant.some((item) => item.status === 'fail')) {
    return 'fail';
  }
  if (relevant.some((item) => item.status === 'pending')) {
    return 'pending';
  }
  return 'pass';
}

function statusForIncomplete(checkKey, profile, step) {
  if (['discuss', 'research'].includes(step)) {
    return checkKey === 'dependency_blockers' ? 'warn' : 'pending';
  }

  const warnByProfile = {
    lite: new Set([
      'explicit_constraints',
      'alternatives_considered',
      'unanswered_questions',
      'rejected_strategies',
      'dependency_blockers',
      'regression_focus',
    ]),
    standard: new Set(['dependency_blockers']),
    full: new Set(['dependency_blockers']),
  };

  return warnByProfile[profile]?.has(checkKey) ? 'warn' : 'fail';
}

function syncPlanState(paths, docs, planGate, summary) {
  let { statusDoc, contextDoc, execplanDoc, validationDoc } = docs;
  const planReady = planGate === 'pass';
  const contextReadiness = planReady ? 'plan_ready' : planGate === 'pending' ? 'plan_pending' : 'not_ready';
  const contextStatus = planReady ? 'plan_checked_pass' : planGate === 'pending' ? 'plan_check_pending' : 'plan_check_failed';
  const planStatus = planReady ? 'ready_for_execute' : planGate === 'pending' ? 'waiting_for_plan_inputs' : 'blocked_by_plan_check';
  const auditReadiness = planReady ? 'planned' : planGate === 'pending' ? 'pending_plan' : 'not_ready';

  contextDoc = replaceField(contextDoc, 'Plan readiness', planReady ? 'yes' : 'not_ready');
  contextDoc = replaceField(contextDoc, 'Context status', contextStatus);
  contextDoc = replaceField(contextDoc, 'Discuss subphase', 'execution_shaping');
  contextDoc = replaceSection(
    contextDoc,
    'Ready For Plan',
    planReady
      ? [
        '- `Yes`',
        `- \`workflow:plan-check passed on ${today()}\``,
      ].join('\n')
      : planGate === 'pending'
        ? [
          '- `Pending`',
          `- \`workflow:plan-check is incomplete (${summary.pendingCount} pending, ${summary.warnCount} warn)\``,
        ].join('\n')
      : [
        '- `No`',
        `- \`workflow:plan-check is failing (${summary.failCount} fail, ${summary.pendingCount} pending, ${summary.warnCount} warn)\``,
      ].join('\n'),
  );

  statusDoc = replaceField(statusDoc, 'Context readiness', contextReadiness);
  statusDoc = replaceSection(
    statusDoc,
    'Suggested Next Step',
    planReady
      ? '- `Execute only within the checked plan; if the plan changes, rerun workflow:plan-check`'
      : planGate === 'pending'
        ? '- `Finish CONTEXT.md, EXECPLAN.md, and VALIDATION.md until workflow:plan-check moves from pending to pass`'
        : '- `Revise CONTEXT.md, EXECPLAN.md, and VALIDATION.md until workflow:plan-check passes`',
  );

  execplanDoc = replaceField(execplanDoc, 'Plan-ready gate', planGate);
  execplanDoc = replaceField(execplanDoc, 'Plan status', planStatus);

  validationDoc = replaceField(validationDoc, 'Audit readiness', auditReadiness);

  write(paths.context, contextDoc);
  write(paths.status, statusDoc);
  write(paths.execplan, execplanDoc);
  write(paths.validation, validationDoc);

  syncPacketHash(paths, { doc: 'context', step: 'discuss' });
  syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  syncWindowDocument(paths, computeWindowStatus(paths, { step: 'plan', doc: 'execplan' }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const paths = workflowPaths(rootDir);
  assertWorkflowFiles(paths);

  const preferences = loadPreferences(paths);
  let statusDoc = read(paths.status);
  let contextDoc = read(paths.context);
  let execplanDoc = read(paths.execplan);
  let validationDoc = read(paths.validation);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const step = String(getFieldValue(statusDoc, 'Current milestone step') || 'unknown').trim();
  const requireStrictHealth = Boolean(preferences.healthStrictRequired);

  if (requireStrictHealth && milestone !== 'NONE') {
    runHealthStrictCheck(rootDir, cwd);
  }

  const checks = [];
  const pushCheck = (status, area, message, extra = {}) => checks.push({ status, area, message, ...extra });
  const pushCompletenessCheck = (checkKey, ok, area, message, extra = {}) => pushCheck(
    ok ? 'pass' : statusForIncomplete(checkKey, preferences.workflowProfile, step),
    area,
    message,
    { checkKey, ...extra },
  );

  if (milestone === 'NONE') {
    pushCheck('warn', 'plan-ready', 'No active milestone is open; plan check is informational only');
  } else {
    const frontendProfile = buildFrontendProfile(cwd, rootDir);
    const userIntent = safeExtract(contextDoc, 'User Intent');
    const constraints = cleanRows(parseTableSectionObjects(contextDoc, 'Explicit Constraints'));
    const alternatives = cleanRows(parseTableSectionObjects(contextDoc, 'Alternatives Considered'));
    const questions = cleanRows(parseTableSectionObjects(contextDoc, 'Unanswered High-Leverage Questions'));
    const successRubric = cleanRows(parseTableSectionObjects(contextDoc, 'Success Rubric'));
    const requirements = cleanRows(parseTableSectionObjects(contextDoc, 'Requirement List'));

    const chosenStrategy = safeExtract(execplanDoc, 'Chosen Strategy');
    const rejectedStrategies = safeExtract(execplanDoc, 'Rejected Strategies');
    const rollbackFallback = safeExtract(execplanDoc, 'Rollback / Fallback');
    const execplanFalsifiers = extractBulletItems(safeExtract(execplanDoc, 'What Would Falsify This Plan?'));
    const dependencyBlockers = cleanRows(parseTableSectionObjects(execplanDoc, 'Dependency Blockers'));
    const waveStructure = cleanRows(parseTableSectionObjects(execplanDoc, 'Wave Structure'));
    const coverageMatrix = cleanRows(parseTableSectionObjects(execplanDoc, 'Coverage Matrix'));
    const planChunks = cleanRows(parseTableSectionObjects(execplanDoc, 'Plan Chunk Table'));

    const acceptanceCriteria = cleanRows(parseTableSectionObjects(validationDoc, 'Acceptance Criteria'));
    const userVisibleOutcomes = cleanRows(parseTableSectionObjects(validationDoc, 'User-visible Outcomes'));
    const regressionFocus = cleanRows(parseTableSectionObjects(validationDoc, 'Regression Focus'));
    const validationContract = cleanRows(parseValidationContract(validationDoc));
    const visualVerdict = cleanRows(parseTableSectionObjects(validationDoc, 'Visual Verdict'));
    const validationFalsifiers = extractBulletItems(safeExtract(validationDoc, 'What Would Falsify This Plan?'));
    const validationFrontendMode = String(getFieldValue(validationDoc, 'Frontend mode') || 'inactive').trim().toLowerCase();
    const validationFrontendProfileRef = String(getFieldValue(validationDoc, 'Frontend profile ref') || '').trim();
    const validationFrontendAdapterRoute = String(getFieldValue(validationDoc, 'Frontend adapter route') || '').trim();
    const validationVisualVerdictRequired = String(getFieldValue(validationDoc, 'Visual verdict required') || 'no').trim().toLowerCase();

    pushCompletenessCheck('user_intent', sectionHasMeaningfulText(userIntent), 'plan-ready', 'User Intent must be explicit');
    pushCompletenessCheck('explicit_constraints', rowsWithContent(constraints, ['constraint', 'type', 'source', 'impact']).length > 0, 'plan-ready', 'Explicit Constraints must include at least one concrete row');
    pushCompletenessCheck('alternatives_considered', rowsWithContent(alternatives, ['option', 'status', 'why']).length > 0, 'plan-ready', 'Alternatives Considered must record at least one real option');
    pushCompletenessCheck('unanswered_questions', rowsWithContent(questions, ['question', 'impact', 'owner', 'status']).length > 0, 'plan-ready', 'Unanswered High-Leverage Questions must be explicit');

    const successRows = rowsWithContent(successRubric, ['outcome', 'observable_signal', 'why_it_matters']);
    pushCompletenessCheck('success_rubric', successRows.length > 0, 'observability', 'Success Rubric must contain observable outcomes');

    const requirementRows = rowsWithContent(requirements, ['requirement_id', 'requirement', 'type', 'source']);
    pushCompletenessCheck('requirement_list', requirementRows.length > 0, 'coverage', 'Requirement List must contain real requirements');

    pushCompletenessCheck('chosen_strategy', sectionHasMeaningfulText(chosenStrategy), 'plan-ready', 'Chosen Strategy must be written');
    pushCompletenessCheck('rejected_strategies', sectionHasMeaningfulText(rejectedStrategies, { allowExplicitNone: true }), 'plan-ready', 'Rejected Strategies must be explicit');
    pushCompletenessCheck('rollback_fallback', sectionHasMeaningfulText(rollbackFallback), 'plan-ready', 'Rollback / Fallback must be explicit');
    pushCheck(execplanFalsifiers.length > 0 ? 'pass' : 'fail', 'falsification', 'EXECPLAN must record what would falsify the plan');
    pushCompletenessCheck('wave_structure', rowsWithContent(waveStructure, ['wave', 'chunks', 'goal', 'depends_on']).length > 0, 'plan-ready', 'Wave Structure must define at least one wave');

    const planChunkRows = rowsWithContent(planChunks, ['chunk_id', 'capability_slice', 'deliverable', 'depends_on', 'wave', 'status']);
    pushCompletenessCheck('plan_chunks', planChunkRows.length > 0, 'plan-ready', 'Plan Chunk Table must define concrete chunks');
    pushCompletenessCheck('dependency_blockers', dependencyBlockers.length > 0, 'plan-ready', 'Dependency Blockers should be explicit even when empty');

    const acceptanceRows = rowsWithContent(acceptanceCriteria, ['acceptance_id', 'criterion', 'how_to_observe', 'status']);
    const outcomeRows = rowsWithContent(userVisibleOutcomes, ['outcome', 'how_to_observe', 'status']);
    const regressionRows = rowsWithContent(regressionFocus, ['area', 'risk', 'check']);

    pushCompletenessCheck('acceptance_criteria', acceptanceRows.length > 0, 'observability', 'Acceptance Criteria must be observable');
    pushCompletenessCheck('user_visible_outcomes', outcomeRows.length > 0, 'observability', 'User-visible Outcomes must be explicit');
    pushCompletenessCheck('regression_focus', regressionRows.length > 0, 'plan-ready', 'Regression Focus must be explicit');
    pushCheck(validationFalsifiers.length > 0 ? 'pass' : 'fail', 'falsification', 'VALIDATION must record what would falsify the audit plan');
    const validationRows = rowsWithContent(validationContract, [
      'deliverable',
      'verify_command',
      'expected_signal',
      'manual_check',
      'golden',
      'audit_owner',
      'status',
      'evidence',
    ]);
    pushCompletenessCheck('validation_contract', validationRows.length > 0, 'plan-ready', 'Validation Contract must contain concrete verification rows');

    const frontendRequired = frontendProfile.frontendMode.active;
    const frontendMarkdownPath = path.join(rootDir, 'FRONTEND_PROFILE.md');
    const frontendJsonPath = path.join(cwd, '.workflow', 'frontend-profile.json');
    const verdictRows = rowsWithContent(visualVerdict, [
      'verdict_area',
      'expectation',
      'how_to_observe',
      'evidence_expectation',
      'status',
    ]);
    const requiredVerdictAreas = [
      'responsive',
      'interaction',
      'visual consistency',
      'component reuse',
      'accessibility smoke',
      'screenshot evidence',
    ];
    const coveredVerdictAreas = new Set(verdictRows.map((row) => row.verdict_area.toLowerCase()));
    const missingVerdictAreas = requiredVerdictAreas.filter((area) => !coveredVerdictAreas.has(area));

    if (frontendRequired) {
      pushCompletenessCheck('frontend_mode', validationFrontendMode === 'active', 'frontend', 'Validation must mark Frontend mode active when frontend signals are present');
      pushCompletenessCheck('frontend_profile_ref', Boolean(validationFrontendProfileRef) && !isPlaceholderValue(validationFrontendProfileRef), 'frontend', 'Frontend profile ref must be explicit when frontend mode is active');
      pushCompletenessCheck('frontend_adapter_route', Boolean(validationFrontendAdapterRoute) && validationFrontendAdapterRoute.toLowerCase() !== 'none' && !isPlaceholderValue(validationFrontendAdapterRoute), 'frontend', 'Frontend adapter route must be explicit when frontend mode is active');
      pushCompletenessCheck('visual_verdict_required', validationVisualVerdictRequired === 'yes', 'frontend', 'Visual verdict must be marked required when frontend mode is active');
      pushCompletenessCheck('visual_verdict_rows', verdictRows.length > 0, 'frontend', 'Visual Verdict must contain concrete rows when frontend mode is active');
      pushCheck(fs.existsSync(frontendMarkdownPath) ? 'pass' : 'fail', 'frontend', `FRONTEND_PROFILE.md exists -> ${fs.existsSync(frontendMarkdownPath) ? 'yes' : 'no'}`);
      pushCheck(fs.existsSync(frontendJsonPath) ? 'pass' : 'fail', 'frontend', `.workflow/frontend-profile.json exists -> ${fs.existsSync(frontendJsonPath) ? 'yes' : 'no'}`);
      pushCheck(missingVerdictAreas.length === 0 ? 'pass' : 'fail', 'frontend', `Visual Verdict coverage -> ${missingVerdictAreas.length === 0 ? 'all required areas covered' : missingVerdictAreas.join(', ')}`);
    } else if (validationFrontendMode === 'active') {
      pushCheck('warn', 'frontend', 'Validation marks Frontend mode active, but current auto-detection is inactive');
    }

    const requirementIds = requirementRows.map((row) => row.requirement_id);
    const coverageRows = rowsWithContent(coverageMatrix, ['requirement_id', 'milestone', 'capability_slice', 'plan_chunk', 'validation_id']);
    const coverageReady = requirementRows.length > 0
      && coverageRows.length > 0
      && planChunkRows.length > 0
      && acceptanceRows.length > 0;

    pushCompletenessCheck(
      'coverage_matrix',
      coverageReady,
      'coverage',
      'Coverage Matrix must map requirement -> milestone -> plan chunk -> validation before execute',
    );

    const duplicateRequirements = [];
    const orphanRequirements = [];
    const coverageChunkMisses = [];
    const coverageValidationMisses = [];
    const milestoneMisses = [];

    if (coverageReady) {
      const coverageCounts = new Map();
      for (const row of coverageRows) {
        coverageCounts.set(row.requirement_id, (coverageCounts.get(row.requirement_id) || 0) + 1);
      }

      duplicateRequirements.push(...[...coverageCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([requirementId]) => requirementId));
      orphanRequirements.push(...requirementIds.filter((requirementId) => !coverageCounts.has(requirementId)));
      const chunkIds = new Set(planChunkRows.map((row) => row.chunk_id));
      const acceptanceIds = new Set(acceptanceRows.map((row) => row.acceptance_id));
      coverageChunkMisses.push(...coverageRows.filter((row) => !chunkIds.has(row.plan_chunk)).map((row) => row.plan_chunk));
      coverageValidationMisses.push(...coverageRows.filter((row) => !acceptanceIds.has(row.validation_id)).map((row) => row.validation_id));
      milestoneMisses.push(...coverageRows.filter((row) => row.milestone !== milestone).map((row) => row.requirement_id));
    }

    pushCheck(orphanRequirements.length === 0 ? 'pass' : 'fail', 'coverage', `Coverage matrix orphan requirements -> ${orphanRequirements.length === 0 ? 'none' : orphanRequirements.join(', ')}`);
    pushCheck(duplicateRequirements.length === 0 ? 'pass' : 'fail', 'coverage', `Coverage matrix duplicate mappings -> ${duplicateRequirements.length === 0 ? 'none' : duplicateRequirements.join(', ')}`);
    pushCheck(coverageChunkMisses.length === 0 ? 'pass' : 'fail', 'coverage', `Coverage matrix chunk mapping -> ${coverageChunkMisses.length === 0 ? 'all chunks resolved' : coverageChunkMisses.join(', ')}`);
    pushCheck(coverageValidationMisses.length === 0 ? 'pass' : 'fail', 'coverage', `Coverage matrix validation mapping -> ${coverageValidationMisses.length === 0 ? 'all acceptance ids resolved' : coverageValidationMisses.join(', ')}`);
    pushCheck(milestoneMisses.length === 0 ? 'pass' : 'fail', 'coverage', `Coverage matrix milestone mapping -> ${milestoneMisses.length === 0 ? 'current milestone' : milestoneMisses.join(', ')}`);

    const flaggedHorizontalSlices = planChunkRows
      .filter((row) => isHorizontalSlice(`${row.capability_slice} ${row.deliverable}`))
      .map((row) => row.chunk_id);
    pushCheck(flaggedHorizontalSlices.length === 0 ? 'pass' : 'fail', 'anti-horizontal-slicing', `Plan chunks must stay capability-oriented -> ${flaggedHorizontalSlices.length === 0 ? 'pass' : flaggedHorizontalSlices.join(', ')}`);

    const missingObservability = [];
    for (const row of successRubric) {
      if (!row.outcome) {
        continue;
      }
      if (isPlaceholderValue(row.observable_signal)) {
        missingObservability.push(`success:${row.outcome}`);
      }
    }
    for (const row of acceptanceCriteria) {
      if (!row.acceptance_id) {
        continue;
      }
      if (isPlaceholderValue(row.how_to_observe)) {
        missingObservability.push(`acceptance:${row.acceptance_id}`);
      }
    }
    for (const row of userVisibleOutcomes) {
      if (!row.outcome) {
        continue;
      }
      if (isPlaceholderValue(row.how_to_observe)) {
        missingObservability.push(`outcome:${row.outcome}`);
      }
    }
    pushCheck(missingObservability.length === 0 ? 'pass' : 'fail', 'observability', `Observable success criteria -> ${missingObservability.length === 0 ? 'pass' : missingObservability.join(', ')}`);

    const coverageGate = gateStatusFromChecks(checks, 'coverage');
    const falsificationGate = gateStatusFromChecks(checks, 'falsification');
    const frontendGate = gateStatusFromChecks(checks, 'frontend');
    const antiHorizontalGate = gateStatusFromChecks(checks, 'anti-horizontal-slicing');
    const observabilityGate = gateStatusFromChecks(checks, 'observability');
    const summary = summarizeChecks(checks);
    const planGate = gateStatusFromChecks(checks);
    const planReady = planGate === 'pass' && milestone !== 'NONE';

    if (args.sync) {
      syncPlanState(
        paths,
        { statusDoc, contextDoc, execplanDoc, validationDoc },
        planGate,
        summary,
      );
      statusDoc = read(paths.status);
      contextDoc = read(paths.context);
      execplanDoc = read(paths.execplan);
      validationDoc = read(paths.validation);
    }

    const report = {
      rootDir: path.relative(cwd, rootDir),
      milestone,
      step,
      workflowProfile: preferences.workflowProfile,
      planReady,
      planGate,
      checks,
      summary,
      gates: {
        planReady: planGate,
        coverage: coverageGate,
        falsification: falsificationGate,
        frontend: frontendGate,
        antiHorizontalSlicing: antiHorizontalGate,
        observability: observabilityGate,
      },
      coverage: {
        requirementCount: requirementRows.length,
        coverageRows: coverageRows.length,
        orphanRequirements,
        duplicateRequirements,
        unresolvedChunks: coverageChunkMisses,
        unresolvedValidationIds: coverageValidationMisses,
      },
      falsification: {
        execplanCount: execplanFalsifiers.length,
        validationCount: validationFalsifiers.length,
      },
      antiHorizontalSlicing: {
        flaggedChunks: flaggedHorizontalSlices,
      },
      observability: {
        missing: missingObservability,
      },
      frontend: {
        autoDetected: frontendProfile.frontendMode.active,
        validationMode: validationFrontendMode,
        adapters: frontendProfile.adapters.selected,
        missingVerdictAreas,
      },
      syncApplied: Boolean(args.sync),
    };

    writeStateSurface(cwd, rootDir, { planCheck: report }, { updatedBy: 'plan-check' });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      if (args.strict && milestone !== 'NONE' && planGate !== 'pass') {
        process.exitCode = 1;
      }
      return;
    }

    console.log('# PLAN CHECK\n');
    console.log(`- Root: \`${report.rootDir}\``);
    console.log(`- Milestone: \`${report.milestone}\``);
    console.log(`- Step: \`${report.step}\``);
    console.log(`- Workflow profile: \`${report.workflowProfile}\``);
    console.log(`- Plan gate: \`${report.planGate}\``);
    console.log(`- Plan ready: \`${planReady ? 'yes' : 'no'}\``);
    console.log(`- Fail count: \`${summary.failCount}\``);
    console.log(`- Pending count: \`${summary.pendingCount}\``);
    console.log(`- Warn count: \`${summary.warnCount}\``);
    console.log(`- Coverage gate: \`${report.gates.coverage}\``);
    console.log(`- Falsification gate: \`${report.gates.falsification}\``);
    console.log(`- Frontend gate: \`${report.gates.frontend}\``);
    console.log(`- Anti-horizontal slicing: \`${report.gates.antiHorizontalSlicing}\``);
    console.log(`- Observability: \`${report.gates.observability}\``);
    console.log(`\n## Checks\n`);
    for (const check of checks) {
      console.log(`- [${check.status.toUpperCase()}] ${check.area}: ${check.message}`);
    }

    if (args.strict && milestone !== 'NONE' && planGate !== 'pass') {
      process.exitCode = 1;
    }
    return;
  }

  const summary = summarizeChecks(checks);
  const planGate = 'pending';
  const planReady = false;

  if (args.sync) {
    syncPlanState(
      paths,
      { statusDoc, contextDoc, execplanDoc, validationDoc },
      planGate,
      summary,
    );
    statusDoc = read(paths.status);
    contextDoc = read(paths.context);
    execplanDoc = read(paths.execplan);
    validationDoc = read(paths.validation);
  }

  const report = {
    rootDir: path.relative(cwd, rootDir),
    milestone,
    step,
    workflowProfile: preferences.workflowProfile,
    planReady,
    planGate,
    checks,
    summary,
    gates: {
      planReady: planGate,
      coverage: 'pending',
      falsification: 'pending',
      antiHorizontalSlicing: 'pending',
      observability: 'pending',
    },
    coverage: {
      requirementCount: 0,
      coverageRows: 0,
      orphanRequirements: [],
      duplicateRequirements: [],
      unresolvedChunks: [],
      unresolvedValidationIds: [],
    },
    falsification: {
      execplanCount: 0,
      validationCount: 0,
    },
    antiHorizontalSlicing: {
      flaggedChunks: [],
    },
    observability: {
      missing: [],
    },
    syncApplied: Boolean(args.sync),
  };

  writeStateSurface(cwd, rootDir, { planCheck: report }, { updatedBy: 'plan-check' });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    if (args.strict && summary.failCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log('# PLAN CHECK\n');
  console.log(`- Root: \`${report.rootDir}\``);
  console.log(`- Milestone: \`${report.milestone}\``);
  console.log(`- Step: \`${report.step}\``);
  console.log(`- Workflow profile: \`${report.workflowProfile}\``);
  console.log(`- Plan gate: \`${report.planGate}\``);
  console.log(`- Plan ready: \`${planReady ? 'yes' : 'no'}\``);
  console.log(`- Fail count: \`${summary.failCount}\``);
  console.log(`- Pending count: \`${summary.pendingCount}\``);
  console.log(`- Warn count: \`${summary.warnCount}\``);
  console.log(`- Coverage gate: \`${report.gates.coverage}\``);
  console.log(`- Falsification gate: \`${report.gates.falsification}\``);
  console.log(`- Anti-horizontal slicing: \`${report.gates.antiHorizontalSlicing}\``);
  console.log(`- Observability: \`${report.gates.observability}\``);
  console.log(`\n## Checks\n`);
  for (const check of checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.area}: ${check.message}`);
  }

  if (args.strict && milestone !== 'NONE' && planGate !== 'pass') {
    process.exitCode = 1;
  }
}

main();
