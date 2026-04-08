const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  ensureDir,
  getFieldValue,
  parseArgs,
  read,
  readIfExists,
  replaceOrAppendField,
  replaceOrAppendSection,
  resolveWorkflowRoot,
  workflowPaths,
  write,
} = require('./common');

function printHelp() {
  console.log(`
quick

Usage:
  node scripts/workflow/quick.js
  node scripts/workflow/quick.js start --goal "Fix a narrow bug"
  node scripts/workflow/quick.js close --summary "Done"
  node scripts/workflow/quick.js escalate --summary "Needs full workflow" --open-full-workflow

Options:
  --goal <text>               Quick session goal
  --scope <text>              Narrow scope summary
  --plan <text>               Short plan summary
  --verify <text>             Verify contract or evidence summary
  --summary <text>            Closeout or escalation summary
  --next <text>               Suggested next action
  --open-full-workflow        Open a full workflow milestone during escalation
  --milestone-id <text>       Optional milestone id for escalation
  --milestone-name <text>     Optional milestone name for escalation
  --milestone-goal <text>     Optional milestone goal for escalation
  --json                      Print machine-readable output
  --compact                   Print a compact summary
  `);
}

function quickPaths(cwd) {
  const dir = path.join(cwd, '.workflow', 'quick');
  return {
    dir,
    context: path.join(dir, 'context.md'),
    plan: path.join(dir, 'plan.md'),
    verify: path.join(dir, 'verify.md'),
    handoff: path.join(dir, 'handoff.md'),
    session: path.join(dir, 'session.json'),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'quick-task';
}

function readSession(cwd) {
  const content = readIfExists(quickPaths(cwd).session);
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeSession(cwd, session) {
  const paths = quickPaths(cwd);
  ensureDir(paths.dir);
  write(paths.session, `${JSON.stringify(session, null, 2)}\n`);
  return session;
}

function ensureQuickSurface(cwd, session, options = {}) {
  const paths = quickPaths(cwd);
  ensureDir(paths.dir);
  const workflowRoot = options.workflowRootRelative || 'docs/workflow';

  if (!fs.existsSync(paths.context)) {
    write(paths.context, `# QUICK CONTEXT

- Session id: \`${session.id}\`
- Status: \`${session.status}\`
- Goal: \`${session.goal}\`
- Scope: \`${session.scope}\`
- Started at: \`${session.startedAt}\`
- Workflow root: \`${workflowRoot}\`

## Scope

- \`${session.scope}\`

## Constraints

- \`No explicit quick-mode constraints recorded yet\`

## Touched Surface

- \`No touched surface recorded yet\`
`);
  }

  if (!fs.existsSync(paths.plan)) {
    write(paths.plan, `# QUICK PLAN

- Session id: \`${session.id}\`
- Status: \`${session.status}\`
- Escalate to full raiola: \`no\`
- Plan readiness: \`ready\`

## Plan

- \`${session.plan}\`

## Done Checklist

- \`Scope is narrow and single-operator friendly\`
- \`A verify contract exists before closeout\`
- \`Handoff or next action stays visible\`
`);
  }

  if (!fs.existsSync(paths.verify)) {
    write(paths.verify, `# QUICK VERIFY

- Session id: \`${session.id}\`
- Status: \`pending\`

## Verify Contract

- \`${session.verify}\`

## Evidence

- \`Pending quick-mode evidence\`

## Residual Risks

- \`No residual risks recorded yet\`
`);
  }

  if (!fs.existsSync(paths.handoff)) {
    write(paths.handoff, `# QUICK HANDOFF

- Session id: \`${session.id}\`
- Status: \`${session.status}\`
- Next action: \`${session.nextAction}\`

## Summary

- \`Quick session started\`

## Resume

- \`Run raiola:quick to inspect the current quick session\`
`);
  }
}

function summaryPayload(cwd, session) {
  const paths = quickPaths(cwd);
  const verifyDoc = readIfExists(paths.verify) || '';
  const handoffDoc = readIfExists(paths.handoff) || '';
  return {
    session,
    files: {
      context: paths.context,
      plan: paths.plan,
      verify: paths.verify,
      handoff: paths.handoff,
      session: paths.session,
    },
    verifyStatus: String(getFieldValue(verifyDoc, 'Status') || 'pending').trim(),
    nextAction: String(getFieldValue(handoffDoc, 'Next action') || session.nextAction || 'Continue the quick task').trim(),
  };
}

function printCompact(payload) {
  console.log('# QUICK\n');
  console.log(`- id=\`${payload.session.id}\` status=\`${payload.session.status}\` goal=\`${payload.session.goal}\``);
  console.log(`- verify=\`${payload.verifyStatus}\` next=\`${payload.nextAction}\``);
  console.log('- files=`.workflow/quick/context.md .workflow/quick/plan.md .workflow/quick/verify.md .workflow/quick/handoff.md`');
}

function appendQuickEscalationToWorkflow(cwd, session, summary, nextAction) {
  const workflowRoot = resolveWorkflowRoot(cwd);
  const paths = workflowPaths(workflowRoot);
  if (!fs.existsSync(paths.context) || !fs.existsSync(paths.status) || !fs.existsSync(paths.handoff)) {
    return null;
  }

  let context = read(paths.context);
  context = replaceOrAppendSection(context, 'Quick Escalation Intake', `
- Quick session id: \`${session.id}\`
- Quick goal: \`${session.goal}\`
- Scope summary: \`${session.scope}\`
- Escalation summary: \`${summary}\`
- Suggested next action: \`${nextAction}\`
`);
  write(paths.context, context);

  let status = read(paths.status);
  status = replaceOrAppendSection(status, 'Suggested Next Step', `- \`${nextAction}\``);
  write(paths.status, status);

  let handoff = read(paths.handoff);
  handoff = replaceOrAppendSection(handoff, 'Quick Escalation Snapshot', `
- Quick session id: \`${session.id}\`
- Summary: \`${summary}\`
- Next action: \`${nextAction}\`
`);
  write(paths.handoff, handoff);
  return workflowRoot;
}

function maybeOpenFullWorkflow(cwd, session, args) {
  if (!args['open-full-workflow'] && !args['milestone-id'] && !args['milestone-name'] && !args['milestone-goal']) {
    return null;
  }

  const workflowRoot = path.join(cwd, 'docs', 'workflow');
  if (!fs.existsSync(workflowRoot)) {
    childProcess.execFileSync(process.execPath, [path.join(__dirname, 'setup.js'), '--target', cwd, '--skip-verify'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  }

  const milestoneId = String(args['milestone-id'] || `Q${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`).trim();
  const milestoneName = String(args['milestone-name'] || session.goal).trim();
  const milestoneGoal = String(args['milestone-goal'] || session.goal).trim();

  try {
    childProcess.execFileSync(process.execPath, [
      path.join(__dirname, 'new_milestone.js'),
      '--id', milestoneId,
      '--name', milestoneName,
      '--goal', milestoneGoal,
      '--profile', 'standard',
      '--automation', 'manual',
    ], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch {
    return { milestoneId, milestoneName, milestoneGoal, opened: false };
  }

  return { milestoneId, milestoneName, milestoneGoal, opened: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const action = args._[0] && !String(args._[0]).startsWith('--') ? String(args._[0]).trim().toLowerCase() : 'status';
  const existing = readSession(cwd);

  if (action === 'start') {
    const goal = String(args.goal || '').trim();
    if (!goal) {
      throw new Error('--goal is required for quick start');
    }

    const session = writeSession(cwd, {
      id: `quick-${slugify(goal)}`,
      status: 'active',
      goal,
      scope: String(args.scope || 'Single narrow change with a small touched surface').trim(),
      plan: String(args.plan || 'Make the narrow change, verify it, and close with a visible handoff note').trim(),
      verify: String(args.verify || 'Capture the minimal evidence needed to trust the change').trim(),
      nextAction: String(args.next || 'Continue the quick task and close with evidence').trim(),
      startedAt: nowIso(),
      updatedAt: nowIso(),
      closedAt: null,
      escalatedAt: null,
    });
    ensureQuickSurface(cwd, session);
    const payload = summaryPayload(cwd, session);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (args.compact) {
      printCompact(payload);
      return;
    }
    console.log('# QUICK START\n');
    console.log(`- Session: \`${session.id}\``);
    console.log(`- Goal: \`${session.goal}\``);
    console.log(`- Scope: \`${session.scope}\``);
    console.log('- Canonical quick artifacts live under `.workflow/quick/*.md`.');
    return;
  }

  if (!existing) {
    const payload = {
      session: null,
      recommendation: 'No quick session exists yet. Run `raiola:quick start --goal "..."` to open one.',
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log('# QUICK\n');
    console.log(`- ${payload.recommendation}`);
    return;
  }

  if (action === 'close') {
    const summary = String(args.summary || '').trim();
    if (!summary) {
      throw new Error('--summary is required for quick close');
    }

    const session = {
      ...existing,
      status: 'closed',
      updatedAt: nowIso(),
      closedAt: nowIso(),
      nextAction: String(args.next || 'Open a full milestone only if the task grows').trim(),
    };
    writeSession(cwd, session);

    const paths = quickPaths(cwd);
    let verify = read(paths.verify);
    verify = replaceOrAppendField(verify, 'Status', 'pass');
    verify = replaceOrAppendSection(verify, 'Evidence', `- \`${String(args.verify || summary).trim()}\``);
    write(paths.verify, verify);

    let handoff = read(paths.handoff);
    handoff = replaceOrAppendField(handoff, 'Status', 'closed');
    handoff = replaceOrAppendField(handoff, 'Next action', session.nextAction);
    handoff = replaceOrAppendSection(handoff, 'Summary', `- \`${summary}\``);
    write(paths.handoff, handoff);

    const payload = summaryPayload(cwd, session);
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (args.compact) {
      printCompact(payload);
      return;
    }
    console.log('# QUICK CLOSEOUT\n');
    console.log(`- Session: \`${session.id}\``);
    console.log(`- Summary: \`${summary}\``);
    console.log(`- Next: \`${session.nextAction}\``);
    return;
  }

  if (action === 'escalate') {
    const summary = String(args.summary || '').trim();
    if (!summary) {
      throw new Error('--summary is required for quick escalation');
    }

    const fullWorkflow = maybeOpenFullWorkflow(cwd, existing, args);
    const nextAction = fullWorkflow?.opened
      ? `Continue in full workflow milestone ${fullWorkflow.milestoneId}`
      : String(args.next || 'Continue in full workflow and preserve the quick summary as intake').trim();
    const session = {
      ...existing,
      status: 'escalated',
      updatedAt: nowIso(),
      escalatedAt: nowIso(),
      nextAction,
    };
    writeSession(cwd, session);

    const paths = quickPaths(cwd);
    let plan = read(paths.plan);
    plan = replaceOrAppendField(plan, 'Status', 'escalated');
    plan = replaceOrAppendField(plan, 'Escalate to full workflow', 'yes');
    write(paths.plan, plan);

    let handoff = read(paths.handoff);
    handoff = replaceOrAppendField(handoff, 'Status', 'escalated');
    handoff = replaceOrAppendField(handoff, 'Next action', nextAction);
    handoff = replaceOrAppendSection(handoff, 'Summary', `- \`${summary}\``);
    write(paths.handoff, handoff);

    const workflowRoot = appendQuickEscalationToWorkflow(cwd, session, summary, nextAction);
    const payload = {
      ...summaryPayload(cwd, session),
      fullWorkflow,
      workflowRoot,
    };
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (args.compact) {
      printCompact(payload);
      return;
    }
    console.log('# QUICK ESCALATION\n');
    console.log(`- Session: \`${session.id}\``);
    console.log(`- Summary: \`${summary}\``);
    console.log(`- Next: \`${nextAction}\``);
    if (fullWorkflow?.opened) {
      console.log(`- Full milestone opened: \`${fullWorkflow.milestoneId}\``);
    }
    return;
  }

  const payload = summaryPayload(cwd, existing);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (args.compact) {
    printCompact(payload);
    return;
  }
  console.log('# QUICK STATUS\n');
  console.log(`- Session: \`${existing.id}\``);
  console.log(`- Status: \`${existing.status}\``);
  console.log(`- Goal: \`${existing.goal}\``);
  console.log(`- Next: \`${payload.nextAction}\``);
}

main();
