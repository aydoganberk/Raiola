const assert = require('node:assert/strict');
const { test } = require('node:test');

const { detectPlaywrightCli } = require('../scripts/workflow/browser_adapters/playwright');

test('Playwright CLI detection uses no-install npx invocation to avoid network installs', () => {
  const calls = [];
  const result = detectPlaywrightCli('/tmp/demo', (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: 'Version 1.0.0', stderr: '' };
  });

  assert.equal(result.detected, true);
  assert.equal(result.supported, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], '--no-install');
  assert.equal(calls[0].args[1], 'playwright');
  assert.equal(calls[0].args[2], '--version');
  assert.equal(calls[0].options.cwd, '/tmp/demo');
});
