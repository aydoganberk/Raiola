const path = require('node:path');
const childProcess = require('node:child_process');
const {
  assertWorkflowFiles,
  computeWindowStatus,
  getFieldValue,
  parseArgs,
  parseTableSectionObjects,
  parseValidationContract,
  read,
  renderMarkdownTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  resolveWorkflowRoot,
  resolveWorkflowControlIntent,
  syncPacketHash,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
} = require('./common');

const STEP_MODE_MATRIX = Object.freeze({
  discuss: ['explicit', 'condensed'],
  research: ['explicit', 'condensed'],
  plan: ['explicit', 'condensed'],
  execute: ['explicit'],
  audit: ['explicit', 'smoke'],
  complete: ['explicit', 'fast_closeout'],
});

function printHelp() {
  console.log(`
step_fulfillment

Usage:
  node scripts/workflow/step_fulfillment.js --utterance "plan kismini gecelim"
  node scripts/workflow/step_fulfillment.js --target plan --mode condensed

Options:
  --root <path>           Workflow root. Defaults to active workstream root
  --utterance <text>      Natural-language step control request
  --target <step>         discuss|research|plan|execute|audit|complete
  --mode <mode>           explicit|condensed|smoke|fast_closeout
  --json                  Print machine-readable output
  `);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/`/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    'to be filled',
    'replace this placeholder',
    'pending_sync',
    'waiting for',
    'still unknown',
    'describe the',
    'document the',
  ];

  return placeholderPhrases.some((phrase) => normalized.includes(phrase));
}

function rowsWithContent(rows, requiredKeys) {
  return rows.filter((row) => requiredKeys.every((key) => !isPlaceholderValue(row[key])));
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function fulfillmentStateForMode(mode, options = {}) {
  if (options.failedCondensedPlan) {
    return 'condensed_needs_inputs';
  }

  if (mode === 'condensed') {
    return 'fulfilled_condensed';
  }

  if (mode === 'smoke') {
    return 'fulfilled_smoke';
  }

  if (mode === 'fast_closeout') {
    return 'fulfilled_fast_closeout';
  }

  return 'pending_explicit';
}

function controlIntentLabel(target, mode) {
  return `step_control(${target}, ${mode})`;
}

function stepModePayload(target, requestedMode) {
  const allowedModes = STEP_MODE_MATRIX[target];
  if (!allowedModes) {
    throw new Error(`Unknown step target: ${target}`);
  }

  if (allowedModes.includes(requestedMode)) {
    return {
      ok: true,
      requestedMode,
      appliedMode: requestedMode,
    };
  }

  return {
    ok: false,
    requestedMode,
    appliedMode: allowedModes[0],
  };
}

function updateStateFields(docs, target, mode, state, intentLabel) {
  let { statusDoc, contextDoc, execplanDoc } = docs;

  statusDoc = replaceField(statusDoc, 'Current milestone step', target);
  statusDoc = replaceOrAppendField(statusDoc, 'Current step mode', mode);
  statusDoc = replaceOrAppendField(statusDoc, 'Step fulfillment state', state);
  statusDoc = replaceOrAppendField(statusDoc, 'Last control intent', intentLabel);
  statusDoc = replaceField(statusDoc, 'Last updated', today());

  contextDoc = replaceField(contextDoc, 'Step source', target);
  contextDoc = replaceOrAppendField(contextDoc, 'Current step mode', mode);
  contextDoc = replaceOrAppendField(contextDoc, 'Step fulfillment state', state);
  contextDoc = replaceOrAppendField(contextDoc, 'Last control intent', intentLabel);
  contextDoc = replaceField(contextDoc, 'Last updated', today());

  execplanDoc = replaceField(execplanDoc, 'Active milestone step', target);
  execplanDoc = replaceOrAppendField(execplanDoc, 'Current step mode', mode);
  execplanDoc = replaceOrAppendField(execplanDoc, 'Step fulfillment state', state);
  execplanDoc = replaceOrAppendField(execplanDoc, 'Last control intent', intentLabel);
  execplanDoc = replaceOrAppendField(execplanDoc, 'Last updated', today());

  return { statusDoc, contextDoc, execplanDoc };
}

function buildCondensedChosenStrategy(milestoneLabel, requirementRows) {
  const primaryRequirement = requirementRows[0]?.requirement || milestoneLabel;
  return [
    `- \`Condensed plan mode translates skip language into a minimum checked plan for ${milestoneLabel}.\``,
    `- \`Primary capability slice: ${primaryRequirement}\``,
    '- `Non-critical elaboration is deferred, but execute must still stay inside the checked coverage rows and validation contract.`',
  ].join('\n');
}

function buildCondensedCoverageMatrix(milestoneLabel, requirementRows, acceptanceRows) {
  if (requirementRows.length === 0) {
    return renderMarkdownTable(
      ['Requirement ID', 'Milestone', 'Capability slice', 'Plan chunk', 'Validation ID', 'Notes'],
      [[
        'R0',
        milestoneLabel,
        'Fill when condensed plan has a real capability slice',
        'chunk-1',
        acceptanceRows[0]?.acceptance_id || 'AC1',
        'Replace once the requirement list is explicit',
      ]],
    );
  }

  const rows = requirementRows.map((row, index) => [
    row.requirement_id || `R${index + 1}`,
    milestoneLabel,
    `Vertical slice for ${row.requirement_id || `R${index + 1}`}`,
    `chunk-${index + 1}`,
    acceptanceRows[index]?.acceptance_id || acceptanceRows[0]?.acceptance_id || `AC${index + 1}`,
    `Condensed plan coverage generated from requirement ${row.requirement_id || `R${index + 1}`}`,
  ]);

  return renderMarkdownTable(
    ['Requirement ID', 'Milestone', 'Capability slice', 'Plan chunk', 'Validation ID', 'Notes'],
    rows,
  );
}

function buildCondensedPlanChunkTable(requirementRows) {
  if (requirementRows.length === 0) {
    return renderMarkdownTable(
      ['Chunk ID', 'Capability slice', 'Deliverable', 'Depends on', 'Wave', 'Owner', 'Write scope', 'Status'],
      [[
        'chunk-1',
        'Fill when condensed plan has a real capability slice',
        'Replace this row once the requirement list is explicit',
        'none',
        '1',
        'main',
        '.',
        'planned',
      ]],
    );
  }

  const rows = requirementRows.map((row, index) => [
    `chunk-${index + 1}`,
    `Vertical slice for ${row.requirement_id || `R${index + 1}`}`,
    `Complete one vertical slice for requirement ${row.requirement_id || `R${index + 1}`}`,
    index === 0 ? 'none' : `chunk-${index}`,
    String(Math.min(index + 1, 3)),
    'main',
    '.',
    'planned',
  ]);

  return renderMarkdownTable(
    ['Chunk ID', 'Capability slice', 'Deliverable', 'Depends on', 'Wave', 'Owner', 'Write scope', 'Status'],
    rows,
  );
}

function buildCondensedValidationContract(milestoneLabel, existingRows) {
  const firstExisting = existingRows[0] || {};
  return renderMarkdownTable(
    ['Deliverable', 'Verify command', 'Expected signal', 'Manual check', 'Golden', 'Audit owner', 'Status', 'Evidence', 'Packet hash'],
    [[
      `${milestoneLabel} condensed plan gate`,
      'node scripts/workflow/plan_check.js --json --sync --strict',
      'planReady=true',
      'Review the missing-field summary if the gate stays pending or fail',
      firstExisting.golden || 'tests/golden/workflow/README.md',
      firstExisting.audit_owner || 'audit',
      'planned',
      'docs/workflow/EXECPLAN.md; docs/workflow/VALIDATION.md',
      'pending_sync',
    ]],
  );
}

function parseMeaningfulRows(doc, heading, keys) {
  return rowsWithContent(parseTableSectionObjects(doc, heading), keys);
}

function runCondensedPlanGate(rootDir, cwd) {
  const commandArgs = [path.join(__dirname, 'plan_check.js'), '--root', rootDir, '--sync', '--json', '--strict'];

  try {
    const stdout = childProcess.execFileSync('node', commandArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    if (stdout) {
      try {
        return JSON.parse(stdout);
      } catch {
        return {
          planReady: false,
          planGate: 'fail',
          checks: [{ status: 'fail', message: stdout }],
          summary: { failCount: 1, pendingCount: 0, warnCount: 0 },
        };
      }
    }

    const stderr = String(error.stderr || '').trim();
    return {
      planReady: false,
      planGate: 'fail',
      checks: [{ status: 'fail', message: stderr || error.message }],
      summary: { failCount: 1, pendingCount: 0, warnCount: 0 },
    };
  }
}

function extractMissingFields(report) {
  if (Array.isArray(report.checks)) {
    const messages = uniqueList(
      report.checks
        .filter((item) => item.status === 'fail' || item.status === 'pending')
        .map((item) => item.message),
    );
    if (messages.length > 0) {
      return messages;
    }
  }

  if (report.gates && typeof report.gates === 'object') {
    const gateMessages = uniqueList(
      Object.entries(report.gates)
        .filter(([, value]) => value !== 'pass')
        .map(([key, value]) => `${key} -> ${value}`),
    );
    if (gateMessages.length > 0) {
      return gateMessages;
    }
  }

  return ['Plan gate still needs explicit context, coverage, or validation details'];
}

function syncAfterUpdate(paths, step) {
  syncPacketHash(paths, { doc: 'context', step: ['plan', 'audit'].includes(step) ? 'discuss' : step });
  syncPacketHash(paths, { doc: 'execplan', step: 'plan' });
  syncPacketHash(paths, { doc: 'validation', step: 'audit' });
  syncWindowDocument(
    paths,
    computeWindowStatus(paths, {
      step: step === 'plan' ? 'plan' : step,
      doc: step === 'plan' ? 'execplan' : 'context',
    }),
  );
}

function writeDocs(paths, docs) {
  write(paths.status, docs.statusDoc);
  write(paths.context, docs.contextDoc);
  write(paths.execplan, docs.execplanDoc);
  if (docs.validationDoc) {
    write(paths.validation, docs.validationDoc);
  }
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

  const utterance = String(args.utterance || '').trim();
  const controlIntent = utterance ? resolveWorkflowControlIntent(utterance) : null;
  if (controlIntent && controlIntent.matched && controlIntent.family !== 'step_control') {
    throw new Error(`--utterance resolved to ${controlIntent.family}; step_fulfillment requires a step_control intent`);
  }
  if (controlIntent && !controlIntent.matched) {
    throw new Error('--utterance did not resolve to a step control intent');
  }

  const statusDoc = read(paths.status);
  const contextDoc = read(paths.context);
  const execplanDoc = read(paths.execplan);
  const validationDoc = read(paths.validation);
  const milestone = String(getFieldValue(statusDoc, 'Current milestone') || 'NONE').trim();
  const currentStep = String(getFieldValue(statusDoc, 'Current milestone step') || 'complete').trim();

  if (milestone === 'NONE') {
    throw new Error('No active milestone is open; open a milestone before applying step fulfillment');
  }

  const target = String(args.target || controlIntent?.target || currentStep).trim().toLowerCase();
  const requestedMode = String(args.mode || controlIntent?.mode || 'explicit').trim().toLowerCase();
  const modeResolution = stepModePayload(target, requestedMode);
  const intentLabel = controlIntentLabel(target, modeResolution.appliedMode);

  if (!modeResolution.ok) {
    const fallbackPayload = {
      rootDir: path.relative(cwd, rootDir),
      milestone,
      currentStep,
      target,
      requestedMode,
      appliedMode: modeResolution.appliedMode,
      state: 'pending_explicit',
      fulfilled: false,
      lastControlIntent: intentLabel,
      message: target === 'execute'
        ? 'Execute step cannot be skipped; only explicit mode is allowed.'
        : `Requested mode is not supported for ${target}; safe fallback is ${modeResolution.appliedMode}.`,
    };

    if (args.json) {
      console.log(JSON.stringify(fallbackPayload, null, 2));
      return;
    }

    console.log('# STEP FULFILLMENT\n');
    console.log(`- Milestone: \`${fallbackPayload.milestone}\``);
    console.log(`- Target: \`${fallbackPayload.target}\``);
    console.log(`- Requested mode: \`${fallbackPayload.requestedMode}\``);
    console.log(`- Applied mode: \`${fallbackPayload.appliedMode}\``);
    console.log(`- Message: \`${fallbackPayload.message}\``);
    return;
  }

  let nextDocs = updateStateFields(
    { statusDoc, contextDoc, execplanDoc },
    target,
    modeResolution.appliedMode,
    fulfillmentStateForMode(modeResolution.appliedMode),
    intentLabel,
  );
  let nextValidationDoc = validationDoc;

  if (target === 'plan' && modeResolution.appliedMode === 'condensed') {
    const requirementRows = parseMeaningfulRows(
      nextDocs.contextDoc,
      'Requirement List',
      ['requirement_id', 'requirement', 'type', 'source'],
    );
    const acceptanceRows = parseMeaningfulRows(
      nextValidationDoc,
      'Acceptance Criteria',
      ['acceptance_id', 'criterion', 'how_to_observe', 'status'],
    );
    const existingValidationRows = rowsWithContent(
      parseValidationContract(nextValidationDoc),
      ['deliverable', 'verify_command', 'expected_signal', 'manual_check', 'golden', 'audit_owner', 'status', 'evidence'],
    );

    nextDocs.execplanDoc = replaceSection(
      nextDocs.execplanDoc,
      'Chosen Strategy',
      buildCondensedChosenStrategy(milestone, requirementRows),
    );
    nextDocs.execplanDoc = replaceSection(
      nextDocs.execplanDoc,
      'Coverage Matrix',
      buildCondensedCoverageMatrix(milestone, requirementRows, acceptanceRows),
    );
    nextDocs.execplanDoc = replaceSection(
      nextDocs.execplanDoc,
      'Plan Chunk Table',
      buildCondensedPlanChunkTable(requirementRows),
    );
    nextDocs.execplanDoc = replaceField(nextDocs.execplanDoc, 'Plan-ready gate', 'pending');
    nextDocs.execplanDoc = replaceField(nextDocs.execplanDoc, 'Plan status', 'condensed_pending_gate');
    nextValidationDoc = replaceField(nextValidationDoc, 'Last updated', today());
    nextValidationDoc = replaceSection(
      nextValidationDoc,
      'Validation Contract',
      buildCondensedValidationContract(milestone, existingValidationRows),
    );

    writeDocs(paths, { ...nextDocs, validationDoc: nextValidationDoc });

    const report = runCondensedPlanGate(rootDir, cwd);
    const missingFields = report.planReady ? [] : extractMissingFields(report);
    const finalState = fulfillmentStateForMode(modeResolution.appliedMode, {
      failedCondensedPlan: !report.planReady,
    });

    nextDocs = updateStateFields(
      {
        statusDoc: read(paths.status),
        contextDoc: read(paths.context),
        execplanDoc: read(paths.execplan),
      },
      target,
      modeResolution.appliedMode,
      finalState,
      intentLabel,
    );
    nextValidationDoc = read(paths.validation);
    writeDocs(paths, { ...nextDocs, validationDoc: nextValidationDoc });
    syncAfterUpdate(paths, target);

    const payload = {
      rootDir: path.relative(cwd, rootDir),
      milestone,
      currentStep,
      target,
      requestedMode,
      appliedMode: modeResolution.appliedMode,
      state: finalState,
      fulfilled: report.planReady,
      lastControlIntent: intentLabel,
      message: report.planReady
        ? 'Condensed plan fulfilled and checked with workflow:plan-check.'
        : 'Condensed plan icin eksik alanlar bunlar.',
      missingFields,
      gate: {
        planReady: Boolean(report.planReady),
        planGate: report.planGate || 'pending',
        summary: report.summary || null,
        command: 'npm run workflow:plan-check -- --sync --strict',
      },
      intent: controlIntent
        ? {
          utterance,
          family: controlIntent.family,
          target: controlIntent.target,
          mode: controlIntent.mode,
          resolution: controlIntent.resolution,
        }
        : null,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log('# STEP FULFILLMENT\n');
    console.log(`- Milestone: \`${payload.milestone}\``);
    console.log(`- Target: \`${payload.target}\``);
    console.log(`- Applied mode: \`${payload.appliedMode}\``);
    console.log(`- State: \`${payload.state}\``);
    console.log(`- Message: \`${payload.message}\``);
    console.log(`- Plan gate: \`${payload.gate.planGate}\``);
    if (payload.missingFields.length > 0) {
      console.log('\n## Missing Fields\n');
      for (const item of payload.missingFields) {
        console.log(`- \`${item}\``);
      }
    }
    return;
  }

  writeDocs(paths, { ...nextDocs, validationDoc: nextValidationDoc });
  syncAfterUpdate(paths, target);

  const finalState = fulfillmentStateForMode(modeResolution.appliedMode);
  const payload = {
    rootDir: path.relative(cwd, rootDir),
    milestone,
    currentStep,
    target,
    requestedMode,
    appliedMode: modeResolution.appliedMode,
    state: finalState,
    fulfilled: finalState.startsWith('fulfilled_'),
    lastControlIntent: intentLabel,
    message: modeResolution.appliedMode === 'explicit'
      ? 'Step mode set to explicit.'
      : `Step fulfilled in ${modeResolution.appliedMode} mode.`,
    missingFields: [],
    gate: null,
    intent: controlIntent
      ? {
        utterance,
        family: controlIntent.family,
        target: controlIntent.target,
        mode: controlIntent.mode,
        resolution: controlIntent.resolution,
      }
      : null,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# STEP FULFILLMENT\n');
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Target: \`${payload.target}\``);
  console.log(`- Applied mode: \`${payload.appliedMode}\``);
  console.log(`- State: \`${payload.state}\``);
  console.log(`- Message: \`${payload.message}\``);
}

main();
