const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');

test('health', async () => {
  assert.ok(app);
});
