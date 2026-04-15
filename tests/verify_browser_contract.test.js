const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runVerifyBrowser } = require('../scripts/workflow/verify_browser');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-verify-browser-'));
}

test('verify-browser marks smoke mode as evidence, not browser proof', async () => {
  const targetRepo = makeTempRepo();
  const htmlPath = path.join(targetRepo, 'preview.html');
  fs.writeFileSync(htmlPath, '<!doctype html><html><body><main>Preview</main></body></html>');

  const payload = await runVerifyBrowser(targetRepo, { url: htmlPath });

  assert.equal(payload.verdict, 'pass');
  assert.equal(payload.proofStatus, 'smoke-only');
  assert.equal(payload.evidenceLevel, 'smoke');
  assert.equal(payload.canClaimBrowserProof, false);
});

test('verify-browser require-proof fails when the run degrades to smoke-only evidence', async () => {
  const targetRepo = makeTempRepo();
  const htmlPath = path.join(targetRepo, 'preview.html');
  fs.writeFileSync(htmlPath, '<!doctype html><html><body><main>Preview</main></body></html>');

  const payload = await runVerifyBrowser(targetRepo, {
    url: htmlPath,
    requireProof: true,
  });

  assert.equal(payload.proofStatus, 'smoke-only');
  assert.equal(payload.evidenceLevel, 'smoke');
  assert.equal(payload.verdict, 'fail');
});
