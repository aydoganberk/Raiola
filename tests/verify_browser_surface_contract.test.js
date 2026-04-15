const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runVerifyBrowser } = require('../scripts/workflow/verify_browser');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-verify-surface-'));
}

test('verify-browser extracts metadata and UI contracts from smoke HTML', async () => {
  const targetRepo = makeTempRepo();
  const htmlPath = path.join(targetRepo, 'settings.html');
  fs.writeFileSync(htmlPath, [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <title>Settings Console</title>',
    '  <meta name="description" content="Manage billing and alerts" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '</head>',
    '<body>',
    '  <header><nav><a href="/">Home</a></nav></header>',
    '  <main>',
    '    <h1>Settings</h1>',
    '    <form>',
    '      <label for="email">Email</label>',
    '      <input id="email" />',
    '      <button type="submit">Save</button>',
    '    </form>',
    '    <table><thead><tr><th>Plan</th></tr></thead><tbody><tr><td>Pro</td></tr></tbody></table>',
    '    <div aria-live="polite">saved successfully</div>',
    '  </main>',
    '  <footer>Footer</footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n'));

  const payload = await runVerifyBrowser(targetRepo, { url: htmlPath });

  assert.equal(payload.verdict, 'pass');
  assert.equal(payload.metadata.title, 'Settings Console');
  assert.equal(payload.metadata.description, 'Manage billing and alerts');
  assert.equal(payload.metadata.viewport.present, true);
  assert.equal(payload.metadata.lang, 'en');
  assert.equal(payload.uiContracts.landmarks.main, true);
  assert.equal(payload.uiContracts.patterns.form, true);
  assert.equal(payload.uiContracts.patterns.table, true);
  assert.equal(payload.uiContracts.patterns.status, true);
  assert.equal(payload.uiContracts.verdict, 'pass');
  assert.equal(payload.readinessHint, 'interaction-smoke');
});
