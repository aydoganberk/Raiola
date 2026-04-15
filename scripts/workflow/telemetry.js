const { parseArgs } = require('./common');
const { summarizeRoutingTelemetry, logRoutingDecision } = require('./routing_telemetry');
function printHelp() {
  console.log(`
telemetry

Usage:
  node scripts/workflow/telemetry.js routing
  node scripts/workflow/telemetry.js route-feedback --phase audit --goal "fix flaky test" --recommended-capability review-mode --final-capability fix --outcome override

Options:
  --phase <name>
  --goal <text>
  --recommended-capability <id>
  --final-capability <id>
  --recommended-preset <id>
  --final-preset <id>
  --outcome <accepted|override>
  --json
  `);
}
function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = String(args._[0] || 'routing');
  if (args.help || action === 'help') { printHelp(); return; }
  const cwd = process.cwd();
  const payload = action === 'route-feedback' ? {
    action,
    entry: logRoutingDecision(cwd, {
      source: 'feedback',
      phase: args.phase,
      goal: args.goal,
      recommendedCapability: args['recommended-capability'],
      finalCapability: args['final-capability'],
      recommendedPreset: args['recommended-preset'],
      finalPreset: args['final-preset'],
      confidence: args.confidence,
      outcome: args.outcome || 'override',
    }),
    summary: summarizeRoutingTelemetry(cwd),
  } : { action: 'routing', summary: summarizeRoutingTelemetry(cwd) };
  if (args.json) { console.log(JSON.stringify(payload, null, 2)); return; }
  console.log('# TELEMETRY\n');
  console.log(`- Action: \`${payload.action}\``);
  console.log(`- Entries: \`${payload.summary.totalEntries}\``);
  for (const [phase, summary] of Object.entries(payload.summary.byPhase || {})) {
    console.log(`- ${phase}: capability=\`${summary.learnedCapability || 'n/a'}\` preset=\`${summary.learnedPreset || 'n/a'}\` total=\`${summary.total}\` overrideRate=\`${summary.overrideRate}\``);
  }
}
if (require.main === module) main();
module.exports = { main };
