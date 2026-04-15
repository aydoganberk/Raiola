const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runVerifyBrowser } = require('../scripts/workflow/verify_browser');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-verify-timeout-'));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('verify-browser times out bounded smoke requests instead of hanging indefinitely', async () => {
  const targetRepo = makeTempRepo();
  const server = http.createServer(() => {
    // Intentionally never respond.
  });
  const address = await listen(server);
  try {
    const started = Date.now();
    const payload = await runVerifyBrowser(targetRepo, {
      url: `http://127.0.0.1:${address.port}`,
      timeoutMs: 80,
    });
    const durationMs = Date.now() - started;

    assert.equal(payload.verdict, 'fail');
    assert.match(payload.summary, /timed out/i);
    assert.ok(durationMs < 2000);
  } finally {
    server.closeAllConnections?.();
    await close(server);
  }
});
