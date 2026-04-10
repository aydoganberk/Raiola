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
  const plugin = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const hooks = JSON.parse(run('node', [path.join(repoRoot, 'scripts', 'workflow', 'hooks.js'), 'validate', '--json'], repoRoot));

  assert.equal(plugin.commands, './.claude/commands');
  assert.equal(marketplace.plugins[0].name, 'raiola');
  assert.equal(hooks.shippedHookAssets.present, true);
  assert.equal(hooks.shippedHookAssets.hookConfig, 'hooks/hooks.json');
  assert.equal(hooks.shippedHookAssets.sessionStart, 'hooks/session-start.sh');
  assert.equal(hooks.shippedHookAssets.metaSkill, 'skills/using-raiola/SKILL.md');
  assert.ok(fs.existsSync(path.join(repoRoot, 'agents', 'code-reviewer.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'references', 'ship-readiness-checklist.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'skills', 'using-raiola', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(repoRoot, '.claude', 'commands', 'code-simplify.md')));
});
