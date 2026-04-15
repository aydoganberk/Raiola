const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

function bootstrapRepo(targetRepo) {
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);
  run('git', ['add', '.'], targetRepo);
  run('git', ['commit', '-m', 'initial state'], targetRepo);
  return path.join(targetRepo, 'bin', 'rai.js');
}

test('agent runtime contract scores adapter depth beyond file presence and surfaces it in lifecycle output', () => {
  const targetRepo = makeTempRepo('raiola-phase51-');
  const targetBin = bootstrapRepo(targetRepo);

  fs.mkdirSync(path.join(targetRepo, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, '.claude', 'commands', 'review.md'), '# Review\nFocus on the highest-risk slice first.\n');
  fs.mkdirSync(path.join(targetRepo, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'raiola',
    version: '0.3.1',
    commands: './.claude/commands',
  }, null, 2));
  fs.writeFileSync(path.join(targetRepo, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    plugins: [{ name: 'raiola' }],
  }, null, 2));

  fs.mkdirSync(path.join(targetRepo, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, '.cursor', 'rules', 'repo.mdc'), '# Cursor rule\nUse bounded repo-native workflow slices.\n');
  fs.writeFileSync(path.join(targetRepo, '.cursor', 'mcp.json'), JSON.stringify({
    servers: {
      raiola: {
        command: 'node',
        args: ['scripts/workflow/mcp_server.js', '--server', 'workflow-state', '--repo', '.'],
      },
    },
  }, null, 2));
  fs.mkdirSync(path.join(targetRepo, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(targetRepo, '.vscode', 'tasks.json'), JSON.stringify({
    version: '2.0.0',
    tasks: [
      {
        label: 'rai review slice',
        type: 'shell',
        command: 'node bin/rai.js review --goal "close the current slice"',
      },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(targetRepo, '.vscode', 'settings.json'), JSON.stringify({
    'editor.formatOnSave': true,
    'raiola.workflow.defaultGoal': 'land the next safe slice',
  }, null, 2));
  fs.writeFileSync(path.join(targetRepo, '.aider.conf.yml'), [
    'model: gpt-4o-mini',
    'edit-format: diff',
    'auto-commits: false',
    'watch-files: true',
    'chat-history-file: .aider.chat.md',
  ].join('\n'));

  const lifecycle = JSON.parse(run('node', [targetBin, 'lifecycle', '--json'], targetRepo));
  const codex = lifecycle.agentRuntime.adapters.find((entry) => entry.id === 'codex');
  const claude = lifecycle.agentRuntime.adapters.find((entry) => entry.id === 'claude');
  const cursor = lifecycle.agentRuntime.adapters.find((entry) => entry.id === 'cursor');
  const aider = lifecycle.agentRuntime.adapters.find((entry) => entry.id === 'aider');

  assert.equal(lifecycle.agentRuntime.primary, 'codex');
  assert.ok(lifecycle.agentRuntime.multiRuntime);
  assert.ok(lifecycle.agentRuntime.depthSummary.hookCapableAdapters.includes('codex'));
  assert.ok(lifecycle.agentRuntime.depthSummary.mcpTransports.includes('stdio'));

  assert.equal(codex.detected, true);
  assert.equal(codex.integration.level, 'operational');
  assert.ok(codex.integration.score >= 4);
  assert.equal(codex.hooks.sessionStart, false);
  assert.equal(codex.context.hookAssetsPresent.sessionStart, true);
  assert.ok(codex.context.mcpServers.some((entry) => entry.transport === 'stdio'));

  assert.equal(claude.detected, true);
  assert.equal(claude.integration.level, 'guided');
  assert.ok(claude.context.commandCount >= 1);
  assert.equal(claude.hooks.preToolUse, false);
  assert.ok(claude.integration.missing.includes('No Claude hook bridge detected'));

  assert.equal(cursor.detected, true);
  assert.ok(['integrated', 'operational'].includes(cursor.integration.level));
  assert.equal(cursor.context.rulesCount, 1);
  assert.equal(cursor.context.taskCount, 1);
  assert.equal(cursor.context.mcpServers[0].transport, 'stdio');

  assert.equal(aider.detected, true);
  assert.equal(aider.integration.level, 'guided');
  assert.equal(aider.context.model, 'gpt-4o-mini');
  assert.ok(aider.context.keys.includes('watch-files'));

  const lifecycleMarkdown = fs.readFileSync(path.join(targetRepo, lifecycle.artifacts.markdown), 'utf8');
  assert.match(lifecycleMarkdown, /Adapter Depth/);
  assert.match(lifecycleMarkdown, /`codex` -> `operational`/);
  assert.match(lifecycleMarkdown, /MCP transports: `http, stdio`|MCP transports: `stdio, http`/);
});
