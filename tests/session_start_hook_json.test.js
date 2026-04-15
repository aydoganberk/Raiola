const path = require('node:path');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

test('session-start hook emits valid JSON even when skill content spans lines and quotes', () => {
  const output = childProcess.execFileSync('bash', [path.join(repoRoot, 'hooks', 'session-start.sh')], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const payload = JSON.parse(output);
  assert.equal(payload.priority, 'IMPORTANT');
  assert.match(payload.message, /raiola loaded/i);
  assert.match(payload.message, /workflow explicit opt-in/i);
});
