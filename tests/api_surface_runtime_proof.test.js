const http = require('node:http');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildApiSurfaceCommandPayload } = require('../scripts/workflow/api_surface');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

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

test('api-surface can attach runtime HTTP evidence to detected endpoints', async () => {
  const targetRepo = makeMezatLikeRepo('raiola-api-surface-runtime-');
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'OPTIONS' && req.url === '/bids') {
      res.writeHead(204, { allow: 'POST,OPTIONS' });
      res.end('');
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
  });

  const address = await listen(server);
  try {
    const payload = await buildApiSurfaceCommandPayload(targetRepo, {
      refresh: 'full',
      writeFiles: false,
      baseUrl: `http://127.0.0.1:${address.port}`,
      probeLimit: 4,
    });

    assert.equal(payload.schema, 'raiola/api-surface/v2');
    assert.equal(payload.analysis.method, 'static-plus-runtime-http-probe');
    assert.ok(payload.runtimeVerification);
    assert.equal(payload.runtimeVerification.schema, 'raiola/api-surface-runtime/v1');
    assert.equal(payload.runtimeVerification.baseUrl, `http://127.0.0.1:${address.port}`);
    assert.ok(payload.runtimeVerification.attemptedCount >= 1);
    assert.ok(payload.runtimeVerification.verifiedCount >= 1);
    assert.ok(payload.runtimeVerification.entries.some((entry) => entry.endpoint === '/health'));
  } finally {
    await close(server);
  }
});
