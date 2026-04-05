const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  resolveWorkflowRoot,
  slugify,
} = require('./common');
const { collectRuntimeState } = require('./runtime_collector');
const { buildNextPrompt } = require('./next_prompt');
const { writeRuntimeJson } = require('./runtime_helpers');

function printHelp() {
  console.log(`
launch

Usage:
  node scripts/workflow/launch.js

Options:
  --root <path>                 Workflow root. Defaults to active workstream root
  --preset <fast|balanced|deep> Optional launch preset override
  --goal <text>                 Optional current session goal
  --json                        Print machine-readable output
  `);
}

function detectPreset(profile, override) {
  const normalized = String(override || '').trim().toLowerCase();
  if (['fast', 'balanced', 'deep'].includes(normalized)) {
    return normalized;
  }
  if (profile === 'lite') {
    return 'fast';
  }
  if (profile === 'full') {
    return 'deep';
  }
  return 'balanced';
}

function detectLane(state, goal) {
  const normalizedGoal = String(goal || '').toLowerCase();
  if (state.orchestration?.active || /(parallel|delegate|subagent|team)/.test(normalizedGoal)) {
    return 'team';
  }
  if (state.workflow.milestone === 'NONE') {
    return 'full';
  }
  if (['discuss', 'research', 'plan'].includes(state.workflow.step)) {
    return 'full';
  }
  if (state.counts.carryforward === 0 && state.counts.activeRecall === 0 && /(small|narrow|quick|minor)/.test(normalizedGoal)) {
    return 'quick';
  }
  return 'full';
}

function findAgentsFiles(cwd) {
  const results = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.next', '.turbo', 'coverage', 'dist', 'build'].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name === 'AGENTS.md') {
        results.push(path.relative(cwd, fullPath).replace(/\\/g, '/'));
      }
    }
  };

  visit(cwd);
  return results.sort();
}

function buildLaunchPayload(cwd, rootDir, options = {}) {
  const collected = collectRuntimeState(cwd, rootDir, {
    includeDoctor: true,
    updatedBy: 'launch',
  });
  const preset = detectPreset(collected.state.workflow.profile, options.preset);
  const lane = detectLane(collected.state, options.goal);
  const nextPrompt = buildNextPrompt(cwd, rootDir, { mode: 'minimal' });
  const risks = [
    ...(collected.healthReport.failCount > 0 ? [`health failures=${collected.healthReport.failCount}`] : []),
    ...(collected.doctorReport.failCount > 0 ? [`doctor failures=${collected.doctorReport.failCount}`] : []),
    ...(collected.state.drift.count > 0 ? [`packet drift=${collected.state.drift.packets.join(', ')}`] : []),
    ...(collected.orchestration.active && collected.orchestration.status !== 'completed' ? [`team runtime=${collected.orchestration.status}`] : []),
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    rootDir: path.relative(cwd, rootDir).replace(/\\/g, '/'),
    goal: String(options.goal || '').trim(),
    preset,
    lane,
    milestone: collected.state.workflow.milestone,
    step: collected.state.workflow.step,
    workstream: collected.state.activeWorkstream.name,
    recommendedFirstCommand: collected.nextPayload.recommendation.command,
    recommendedReadSet: collected.nextPayload.recommendedReadSet.slice(0, 6),
    minimalResumePrompt: nextPrompt.prompt,
    blockers: collected.repairHints.filter((hint) => hint.level === 'high'),
    risks,
    agentsFiles: findAgentsFiles(cwd),
    summary: {
      health: collected.patch.health,
      doctor: collected.patch.doctor,
      orchestration: collected.orchestration,
      verifications: collected.verifications,
    },
  };

  const filePath = writeRuntimeJson(cwd, 'launch.json', payload);
  return {
    ...payload,
    runtimeFile: path.relative(cwd, filePath).replace(/\\/g, '/'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildLaunchPayload(cwd, rootDir, {
    preset: args.preset,
    goal: args.goal,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# LAUNCH\n');
  console.log(`- Workstream: \`${payload.workstream}\``);
  console.log(`- Milestone: \`${payload.milestone}\``);
  console.log(`- Step: \`${payload.step}\``);
  console.log(`- Preset: \`${payload.preset}\``);
  console.log(`- Recommended lane: \`${payload.lane}\``);
  console.log(`- First command: \`${payload.recommendedFirstCommand}\``);
  console.log(`- Runtime file: \`${payload.runtimeFile}\``);
  console.log('\n## Risks\n');
  if (payload.risks.length === 0) {
    console.log('- `No major startup risks detected`');
  } else {
    for (const item of payload.risks) {
      console.log(`- \`${item}\``);
    }
  }
  console.log('\n## Read First\n');
  for (const item of payload.recommendedReadSet) {
    console.log(`- \`${item}\``);
  }
  console.log('\n## Minimal Resume Prompt\n');
  process.stdout.write(`${payload.minimalResumePrompt}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildLaunchPayload,
};
