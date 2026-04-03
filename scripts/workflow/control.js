const {
  formatWorkflowControlCommand,
  parseArgs,
  resolveWorkflowControlIntent,
  workflowControlExamplesForFamily,
  workflowControlRecommendedCommand,
} = require('./common');

function printHelp() {
  const familyExamples = [
    ['workflow_activation', workflowControlExamplesForFamily('workflow_activation').join(' | ') || 'none'],
    ['step_control', workflowControlExamplesForFamily('step_control').join(' | ') || 'none'],
    ['automation_control', workflowControlExamplesForFamily('automation_control').join(' | ') || 'none'],
    ['parallel_control', workflowControlExamplesForFamily('parallel_control').join(' | ') || 'none'],
    ['tempo_control', workflowControlExamplesForFamily('tempo_control').join(' | ') || 'none'],
    ['pause_resume_control', workflowControlExamplesForFamily('pause_resume_control').join(' | ') || 'none'],
    ['context_control', workflowControlExamplesForFamily('context_control').join(' | ') || 'none'],
  ];

  console.log(`
control

Usage:
  node scripts/workflow/control.js --utterance "plan kismini gecelim"

Options:
  --utterance <text>      Natural-language workflow instruction to normalize
  --json                  Print machine-readable output

Supported families:
${familyExamples.map(([family, examples]) => `  - ${family}: ${examples}`).join('\n')}
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const utterance = String(args.utterance || args._.join(' ')).trim();
  if (!utterance) {
    throw new Error('--utterance is required');
  }

  const intent = resolveWorkflowControlIntent(utterance);
  const payload = {
    utterance,
    controlCommand: formatWorkflowControlCommand('<user request>'),
    intent,
    suggestedCommand: workflowControlRecommendedCommand(intent, utterance),
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# WORKFLOW CONTROL\n');
  console.log(`- Utterance: \`${payload.utterance}\``);
  console.log(`- Family: \`${intent.family}\``);
  console.log(`- Label: \`${intent.label}\``);
  console.log(`- Risk: \`${intent.risk}\``);
  console.log(`- Action: \`${intent.action}\``);
  console.log(`- Resolution: \`${intent.resolution}\``);
  if (intent.target) {
    console.log(`- Target: \`${intent.target}\``);
  }
  if (intent.mode) {
    console.log(`- Mode: \`${intent.mode}\``);
  }
  if (intent.state) {
    console.log(`- State: \`${intent.state}\``);
  }
  console.log(`- Summary: \`${intent.summary}\``);
  console.log(`- Normalized utterance: \`${intent.normalizedUtterance}\``);
  if (payload.suggestedCommand) {
    console.log(`- Suggested command: \`${payload.suggestedCommand}\``);
  }
}

main();
