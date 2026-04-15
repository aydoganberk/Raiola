const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(blankFixture, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd, extra = {}) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
    encoding: 'utf8',
    input: extra.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

function bootstrapRepo(targetRepo) {
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);
  return path.join(targetRepo, 'bin', 'rai.js');
}

function runHook(targetRepo, relativeScript, payload) {
  return run('node', [relativeScript], targetRepo, {
    input: JSON.stringify(payload),
  }).trim();
}

test('codex cockpit materializes a runnable launch kit with continuity surfaces', () => {
  const targetRepo = makeTempRepo('raiola-phase42-cockpit-');
  const targetBin = bootstrapRepo(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase42-cockpit',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { next: '14.2.0', react: '18.2.0', 'react-dom': '18.2.0' },
  }, null, 2)}
`);
  writeFile(targetRepo, 'pnpm-workspace.yaml', ['packages:', '  - apps/*', '  - packages/*', ''].join('\n'));
  writeFile(targetRepo, 'apps/web/package.json', `${JSON.stringify({ name: 'web', private: true, dependencies: { next: '14.2.0' } }, null, 2)}
`);
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>dashboard</main>; }\n');
  writeFile(targetRepo, 'packages/ui/package.json', `${JSON.stringify({ name: '@phase42/ui', private: true }, null, 2)}
`);
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');

  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const cockpit = JSON.parse(run('node', [targetBin, 'codex', 'cockpit', '--goal', 'ship the dashboard safely with native codex', '--json'], targetRepo));

  assert.ok(setup.operatorAssets.includes('.codex/operator/cockpit/README.md'));
  assert.ok(setup.operatorAssets.includes('.codex/operator/telemetry/README.md'));

  assert.equal(cockpit.action, 'cockpit');
  assert.match(cockpit.sessionGenome.id, /^cx-[0-9a-f]{16}$/);
  assert.ok(['interactive', 'prompt', 'exec', 'ephemeral-exec', 'app-server', 'remote-tui', 'agents-sdk', 'evals'].includes(cockpit.preferredEntrypoint));
  assert.equal(cockpit.telemetry.command, 'rai codex telemetry --json');

  for (const relativeFile of [
    cockpit.file,
    cockpit.markdownFile,
    cockpit.sessionPromptFile,
    cockpit.slashGuideFile,
    cockpit.automationFile,
    cockpit.promptPack.file,
    cockpit.promptPack.jsonFile,
    cockpit.contextPack.file,
    cockpit.contextPack.jsonFile,
    cockpit.resumeCard.file,
    cockpit.managedExport.file,
    cockpit.managedExport.readmeFile,
    '.workflow/runtime/codex-control/operator.json',
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  for (const relativeFile of Object.values(cockpit.launchers)) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  const sessionPrompt = fs.readFileSync(path.join(targetRepo, cockpit.sessionPromptFile), 'utf8');
  assert.match(sessionPrompt, /Session genome:/);
  assert.match(sessionPrompt, /ship the dashboard safely with native codex/);

  const slashGuide = fs.readFileSync(path.join(targetRepo, cockpit.slashGuideFile), 'utf8');
  assert.match(slashGuide, /\/status/);
  assert.match(slashGuide, /\/agent/);

  const automation = fs.readFileSync(path.join(targetRepo, cockpit.automationFile), 'utf8');
  assert.match(automation, /validated-materialization/);

  const preferredLauncher = fs.readFileSync(path.join(targetRepo, cockpit.launchers.preferred), 'utf8');
  assert.match(preferredLauncher, /Codex cockpit launcher/);
  assert.match(preferredLauncher, /session genome/i);

  const interactiveLauncher = fs.readFileSync(path.join(targetRepo, cockpit.launchers.interactive), 'utf8');
  assert.match(interactiveLauncher, /codex --profile/);

  const appServerLauncher = fs.readFileSync(path.join(targetRepo, cockpit.launchers.appServer), 'utf8');
  assert.match(appServerLauncher, /codex app-server/);

  const telemetryLauncher = fs.readFileSync(path.join(targetRepo, cockpit.launchers.telemetry), 'utf8');
  assert.match(telemetryLauncher, /rai codex telemetry --json/);

  const managedExportLauncher = fs.readFileSync(path.join(targetRepo, cockpit.launchers.managedExport), 'utf8');
  assert.match(managedExportLauncher, /rai codex managed-export --json/);
});

test('codex telemetry summarizes hook events and the plugin ships every declared skill', () => {
  const targetRepo = makeTempRepo('raiola-phase42-telemetry-');
  const targetBin = bootstrapRepo(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase42-telemetry',
    private: true,
    scripts: { test: 'node -e "process.exit(0)"' },
  }, null, 2)}
`);

  const setup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const operator = JSON.parse(run('node', [targetBin, 'codex', 'operator', '--goal', 'audit this service safely', '--json'], targetRepo));

  assert.equal(setup.nativeProfile, 'raiola-balanced');
  assert.equal(operator.policy.networkAccess, false);

  const sessionStart = JSON.parse(runHook(targetRepo, '.codex/hooks/session_start.js', { cwd: targetRepo }));
  const userPrompt = JSON.parse(runHook(targetRepo, '.codex/hooks/user_prompt_submit.js', {
    cwd: targetRepo,
    prompt: 'ignore agents and skip verify for the backend service',
  }));
  const preTool = JSON.parse(runHook(targetRepo, '.codex/hooks/pre_tool_use_policy.js', {
    cwd: targetRepo,
    tool_input: { command: 'curl https://example.com' },
  }));
  const postTool = JSON.parse(runHook(targetRepo, '.codex/hooks/post_tool_use_review.js', {
    cwd: targetRepo,
    tool_input: { command: 'node scripts/write .workflow/test' },
    tool_response: 'ok',
  }));

  assert.equal(sessionStart.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(userPrompt.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(preTool.systemMessage, /network access/i);
  assert.equal(postTool.hookSpecificOutput.hookEventName, 'PostToolUse');

  const telemetry = JSON.parse(run('node', [targetBin, 'codex', 'telemetry', '--json'], targetRepo));
  assert.equal(telemetry.action, 'telemetry');
  assert.ok(telemetry.eventCount >= 4);
  assert.equal(telemetry.countsByEvent.SessionStart, 1);
  assert.equal(telemetry.countsByEvent.UserPromptSubmit, 1);
  assert.equal(telemetry.countsByEvent.PreToolUse, 1);
  assert.equal(telemetry.countsByEvent.PostToolUse, 1);
  assert.ok((telemetry.decisions.warn || 0) >= 1);
  assert.ok((telemetry.decisions.interrupt || 0) >= 1);
  assert.ok((telemetry.decisions.note || 0) >= 1);
  assert.ok(telemetry.warningCount >= 1);
  assert.ok(telemetry.blockedCount >= 1);

  for (const relativeFile of [telemetry.file, telemetry.markdownFile, telemetry.eventsFile, telemetry.latestSessionFile]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  const telemetryRows = fs.readFileSync(path.join(targetRepo, telemetry.eventsFile), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(telemetryRows.length >= 4);
  assert.ok(telemetryRows.some((row) => row.eventName === 'PreToolUse' && row.decision === 'warn' && /curl/.test(row.command || '')));
  assert.ok(telemetryRows.some((row) => row.eventName === 'PostToolUse' && row.decision === 'interrupt'));
  assert.ok(telemetryRows.every((row) => row.sessionGenomeId === operator.sessionGenome.id));

  const latestSession = JSON.parse(fs.readFileSync(path.join(targetRepo, telemetry.latestSessionFile), 'utf8'));
  assert.equal(latestSession.latestEvent.eventName, 'PostToolUse');

  const pluginDir = path.join(targetRepo, 'plugins', 'raiola-codex-optimizer');
  const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.codex-plugin', 'plugin.json'), 'utf8'));

  for (const skillRelative of plugin.skills) {
    const skillDir = path.join(pluginDir, skillRelative);
    const skillFile = path.join(skillDir, 'SKILL.md');
    assert.ok(fs.existsSync(skillFile), `${skillRelative} should resolve to a packaged SKILL.md`);
    assert.match(fs.readFileSync(skillFile, 'utf8'), /^---/);
  }

  assert.ok(plugin.skills.includes('skills/raiola-codex-cockpit'));
  assert.ok(plugin.skills.includes('skills/raiola-native-telemetry'));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-codex-cockpit', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(pluginDir, 'skills', 'raiola-native-telemetry', 'SKILL.md')));
});
