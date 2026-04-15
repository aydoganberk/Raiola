const fs = require('node:fs');
const path = require('node:path');
const {
  getFieldValue,
  parseArgs,
} = require('./common');
const {
  ensureDir,
  readText: read,
} = require('./io/files');
const { readProductManifest } = require('./product_manifest');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function quote(value, fallback = '...') {
  const normalized = String(value || '').trim() || fallback;
  return JSON.stringify(normalized);
}

function workflowStatus(cwd) {
  const workflowRoot = path.join(cwd, 'docs', 'workflow');
  const statusPath = path.join(workflowRoot, 'STATUS.md');
  const exists = fs.existsSync(path.join(workflowRoot, 'WORKSTREAMS.md'));
  if (!exists || !fs.existsSync(statusPath)) {
    return {
      installed: Boolean(readProductManifest(cwd) || exists),
      workflowRoot: exists ? workflowRoot : null,
      milestone: 'NONE',
      step: 'inactive',
    };
  }

  const status = read(statusPath);
  return {
    installed: true,
    workflowRoot,
    milestone: String(getFieldValue(status, 'Current milestone') || 'NONE').trim(),
    step: String(getFieldValue(status, 'Current milestone step') || 'unknown').trim(),
  };
}

function buildReport(cwd, stage, payload) {
  const runtimeRoot = path.join(cwd, '.workflow', 'reports');
  if (!fs.existsSync(path.join(cwd, '.workflow'))) {
    return null;
  }

  ensureDir(runtimeRoot);
  const targetPath = path.join(runtimeRoot, `${stage}-guide.md`);
  const lines = [
    `# ${payload.title.toUpperCase()}`,
    '',
    `- Principle: \`${payload.principle}\``,
    `- Workflow installed: \`${payload.workflowInstalled ? 'yes' : 'no'}\``,
    `- Active milestone: \`${payload.milestone}\``,
    `- Active step: \`${payload.step}\``,
    '',
    '## Summary',
    '',
    payload.summary,
    '',
    '## Recommended Commands',
    '',
    ...payload.commands.map((command) => `- \`${command}\``),
    '',
    '## Skills',
    '',
    ...payload.skills.map((skill) => `- \`${skill}\``),
    '',
    '## References',
    '',
    ...payload.references.map((reference) => `- \`${reference}\``),
    '',
    '## Artifacts',
    '',
    ...payload.artifacts.map((artifact) => `- \`${artifact}\``),
    '',
    '## Exit Criteria',
    '',
    ...payload.exitCriteria.map((item) => `- \`${item}\``),
    '',
  ];
  fs.writeFileSync(targetPath, `${lines.join('\n')}`);
  return targetPath;
}

function stageDefinition(stage, context, options = {}) {
  const goal = String(options.goal || '').trim();
  const verifyCmd = String(options.cmd || '').trim();
  const previewUrl = String(options.url || '').trim();
  const scope = String(options.scope || '').trim();
  const qGoal = quote(goal);
  const qVerifyCmd = quote(verifyCmd, 'npm test');
  const qPreviewUrl = quote(previewUrl, 'http://localhost:3000');
  const qScope = quote(scope, 'recently changed files');

  const sharedFront = context.installed
    ? []
    : ['rai setup', 'rai on next'];

  const stages = {
    spec: {
      title: 'spec',
      principle: 'Spec before code',
      summary: 'Turn the request into explicit scope, assumptions, success criteria, and verification expectations before implementation expands.',
      commands: [
        ...sharedFront,
        `rai milestone --id Mx --name "..." --goal ${qGoal}`,
        `rai do ${qGoal}`,
        'rai discuss',
        'rai assumptions',
        'rai claims',
      ],
      skills: ['using-raiola', 'raiola-milestone-lifecycle'],
      references: ['AGENTS.md'],
      artifacts: [
        'docs/workflow/CONTEXT.md',
        'docs/workflow/ASSUMPTIONS.md',
        'docs/workflow/CLAIMS.md',
        'docs/workflow/VALIDATION.md',
      ],
      exitCriteria: [
        'Scope and constraints are explicit',
        'Assumptions are visible',
        'Success criteria and verify surface are written down',
      ],
    },
    plan: {
      title: 'plan',
      principle: 'Small, verifiable chunks',
      summary: 'Convert the active slice into a wave-aware plan with explicit chunking, fallback notes, and a validation contract that matches the milestone.',
      commands: context.installed
        ? [
          'rai packet --step plan --json',
          'rai plan-check --sync --strict',
          'rai next',
        ]
        : [`rai spec --goal ${qGoal}`],
      skills: ['using-raiola', 'raiola-milestone-lifecycle'],
      references: ['references/testing-checklist.md'],
      artifacts: [
        'docs/workflow/EXECPLAN.md',
        'docs/workflow/VALIDATION.md',
        'docs/workflow/WINDOW.md',
      ],
      exitCriteria: [
        'Wave policy and chunk table are explicit',
        'Validation rows match the current slice',
        'plan-check is ready to pass',
      ],
    },
    build: {
      title: 'build',
      principle: 'One safe slice at a time',
      summary: 'Translate the active plan into the next executable slice without drifting outside the declared wave, scope, or ownership boundaries.',
      commands: context.installed
        ? [
          'rai next',
          'rai packet --step execute --json',
          `rai verify-shell --cmd ${qVerifyCmd}`,
          'rai checkpoint --next "Resume from the next planned chunk"',
        ]
        : [`rai plan --goal ${qGoal}`],
      skills: ['using-raiola', 'raiola-milestone-lifecycle'],
      references: ['references/testing-checklist.md'],
      artifacts: [
        'docs/workflow/EXECPLAN.md',
        'docs/workflow/STATUS.md',
        'docs/workflow/HANDOFF.md',
      ],
      exitCriteria: [
        'Only the active chunk was implemented',
        'Verification ran for the slice',
        'Checkpoint or status notes are current',
      ],
    },
    test: {
      title: 'test',
      principle: 'Tests and evidence are proof',
      summary: 'Use the explicit verification surfaces to prove the slice works and to make remaining risk legible for the next reviewer.',
      commands: context.installed
        ? [
          `rai verify-shell --cmd ${qVerifyCmd}`,
          `rai verify-browser --url ${qPreviewUrl}`,
          'rai verify-work',
          'rai ship-readiness',
        ]
        : [`rai build --goal ${qGoal}`],
      skills: ['using-raiola', 'raiola-review-closeout'],
      references: ['references/testing-checklist.md', 'references/accessibility-checklist.md'],
      artifacts: [
        '.workflow/verifications/shell/*',
        '.workflow/verifications/browser/*',
        '.workflow/reports/verify-work.md',
      ],
      exitCriteria: [
        'Relevant automated checks ran',
        'Manual proof is explicit when needed',
        'Residual risk is visible',
      ],
    },
    simplify: {
      title: 'simplify',
      principle: 'Clarity over cleverness',
      summary: 'Run a dedicated behavior-preserving cleanup pass after understanding the current code path and verification surface.',
      commands: context.installed
        ? [
          `rai review --goal ${qScope}`,
          `rai verify-shell --cmd ${qVerifyCmd}`,
          'rai checkpoint --next "Resume simplify follow-up"',
        ]
        : [`rai build --goal ${qGoal}`],
      skills: ['using-raiola', 'raiola-code-simplification'],
      references: ['references/testing-checklist.md'],
      artifacts: [
        '.workflow/reports/review.md',
        'docs/workflow/STATUS.md',
      ],
      exitCriteria: [
        'Behavior stayed intact',
        'Simplification scope stayed narrow',
        'Relevant verification re-ran',
      ],
    },
  };

  return stages[stage];
}

function printStageHelp(stage) {
  console.log(`
${stage}

Usage:
  node scripts/workflow/${stage}.js [--goal "..."] [--cmd "npm test"] [--url http://localhost:3000] [--scope "..."] [--json]
  `);
}

function runLifecycleStage(stage) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printStageHelp(stage);
    return;
  }

  const cwd = process.cwd();
  const context = workflowStatus(cwd);
  const definition = stageDefinition(stage, context, args);
  const payload = {
    command: stage,
    title: definition.title,
    principle: definition.principle,
    summary: definition.summary,
    workflowInstalled: context.installed,
    workflowRoot: context.workflowRoot ? relativePath(cwd, context.workflowRoot) : null,
    milestone: context.milestone,
    step: context.step,
    commands: definition.commands,
    skills: definition.skills,
    references: definition.references,
    artifacts: definition.artifacts,
    exitCriteria: definition.exitCriteria,
  };
  const reportPath = buildReport(cwd, stage, payload);
  if (reportPath) {
    payload.reportPath = relativePath(cwd, reportPath);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`# ${payload.title.toUpperCase()}\n`);
  console.log(`- Principle: \`${payload.principle}\``);
  console.log(`- Workflow installed: \`${payload.workflowInstalled ? 'yes' : 'no'}\``);
  console.log(`- Active milestone: \`${payload.milestone}\``);
  console.log(`- Active step: \`${payload.step}\``);
  if (payload.reportPath) {
    console.log(`- Report: \`${payload.reportPath}\``);
  }
  console.log('\n## Summary\n');
  console.log(payload.summary);
  console.log('\n## Recommended Commands\n');
  for (const command of payload.commands) {
    console.log(`- \`${command}\``);
  }
  console.log('\n## Skills\n');
  for (const skill of payload.skills) {
    console.log(`- \`${skill}\``);
  }
  console.log('\n## Artifacts\n');
  for (const artifact of payload.artifacts) {
    console.log(`- \`${artifact}\``);
  }
  console.log('\n## Exit Criteria\n');
  for (const item of payload.exitCriteria) {
    console.log(`- \`${item}\``);
  }
}

module.exports = {
  runLifecycleStage,
  stageDefinition,
  workflowStatus,
};
