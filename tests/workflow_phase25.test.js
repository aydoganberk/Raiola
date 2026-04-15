const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('source repo ships portable agent packaging, lifecycle commands, and session-start hook assets', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugins', 'raiola-codex-optimizer', '.codex-plugin', 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  const hooks = JSON.parse(run('node', [path.join(repoRoot, 'scripts', 'workflow', 'hooks.js'), 'validate', '--json'], repoRoot));

  assert.equal(plugin.name, 'raiola-codex-optimizer');
  assert.equal(marketplace.plugins[0].name, 'raiola-codex-optimizer');
  assert.equal(hooks.verdict, 'pass');
  assert.equal(hooks.registrationRequired, false);
  assert.equal(hooks.registrationPresent, false);
  assert.equal(hooks.shippedHookAssets.present, true);
  assert.equal(hooks.shippedHookAssets.hookConfig, '.codex/hooks.json');
  assert.equal(hooks.shippedHookAssets.sessionStart, '.codex/hooks/session_start.js');
  assert.equal(hooks.shippedHookAssets.preTool, '.codex/hooks/pre_tool_use_policy.js');
  assert.equal(hooks.shippedHookAssets.metaSkill, 'skills/using-raiola/SKILL.md');
  assert.ok(fs.existsSync(path.join(repoRoot, '.codex', 'config.toml')));
  assert.ok(fs.existsSync(path.join(repoRoot, '.codex', 'agents', 'reviewer.toml')));
  assert.ok(fs.existsSync(path.join(repoRoot, '.github', 'codex', 'prompts', 'review.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'references', 'ship-readiness-checklist.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'skills', 'using-raiola', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, '.claude', 'commands', 'code-simplify.md')));
});
