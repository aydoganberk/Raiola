const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runVerifyBrowser } = require('../scripts/workflow/verify_browser');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-verify-guard-'));
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

test('verify-browser blocks file targets outside the repo by default', async () => {
  const repo = makeTempRepo();
  const outsideFile = path.join(os.tmpdir(), `raiola-browser-secret-${Date.now()}.html`);
  fs.writeFileSync(outsideFile, '<html><body>secret</body></html>');

  const payload = await runVerifyBrowser(repo, {
    url: outsideFile,
  });

  assert.equal(payload.verdict, 'fail');
  assert.match(payload.summary, /repository boundary/i);
  const htmlArtifact = fs.readFileSync(path.join(repo, payload.artifacts.html), 'utf8');
  assert.equal(htmlArtifact, '');
});

test('verify-browser fails fast when a smoke HTTP response exceeds the configured byte limit', async () => {
  const repo = makeTempRepo();
  const oversizedBody = '<html><body>' + 'x'.repeat(4096) + '</body></html>';
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(oversizedBody);
  });
  const address = await listen(server);

  try {
    const payload = await runVerifyBrowser(repo, {
      url: `http://127.0.0.1:${address.port}`,
      maxBytes: 128,
      timeoutMs: 1000,
    });

    assert.equal(payload.verdict, 'fail');
    assert.match(payload.summary, /exceeded 128 bytes/i);
  } finally {
    server.closeAllConnections?.();
    await close(server);
  }
});
