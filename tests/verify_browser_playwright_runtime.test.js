const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runVerifyBrowser } = require('../scripts/workflow/verify_browser');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-verify-playwright-'));
}

function writeFakePlaywright(repoDir, options = {}) {
  const moduleDir = path.join(repoDir, 'node_modules', 'playwright');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), `
const fs = require('node:fs');
function readHtml(targetUrl) {
  if (!targetUrl) {
    return '<!doctype html><html><body><main><h1>Empty</h1></main></body></html>';
  }
  if (String(targetUrl).startsWith('file://')) {
    return fs.readFileSync(new URL(targetUrl), 'utf8');
  }
  return '<!doctype html><html><body><main><h1>Remote</h1></main></body></html>';
}
function hasSelector(html, selector) {
  if (!selector) {
    return true;
  }
  if (selector.startsWith('#')) {
    return new RegExp('id=["\\\']' + selector.slice(1) + '["\\\']', 'i').test(html);
  }
  if (selector.startsWith('.')) {
    return new RegExp('class=["\\\'][^"\\\']*\\b' + selector.slice(1) + '\\b[^"\\\']*["\\\']', 'i').test(html);
  }
  return new RegExp('<' + selector + '(\\s|>)', 'i').test(html);
}
exports.chromium = {
  launch: async () => ({
    newPage: async ({ viewport } = {}) => {
      let currentUrl = 'about:blank';
      let html = '<!doctype html><html><body><main><h1>Empty</h1></main></body></html>';
      return {
        goto: async (targetUrl) => {
          currentUrl = targetUrl;
          html = readHtml(targetUrl);
          return {
            status: () => 200,
            headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
          };
        },
        locator: (selector) => ({
          first: () => ({
            waitFor: async () => {
              if (!hasSelector(html, selector)) {
                throw new Error('selector not found: ' + selector);
              }
            },
          }),
        }),
        screenshot: async ({ path: screenshotPath }) => {
          fs.writeFileSync(screenshotPath, 'fake-playwright-png');
        },
        accessibility: {
          snapshot: async () => ${options.realAccessibilityTree === false ? 'null' : `({
            role: 'document',
            name: 'Playwright proof',
            children: [{ role: 'main', name: 'Preview' }],
          })`},
        },
        title: async () => {
          const match = html.match(/<title[^>]*>([\s\S]*?)<\\/title>/i);
          return match ? match[1] : 'Preview';
        },
        content: async () => html,
        url: () => currentUrl,
        evaluate: async () => ({
          width: viewport?.width || 1440,
          height: viewport?.height || 900,
          devicePixelRatio: 1,
        }),
      };
    },
    close: async () => {},
  }),
};
`);
}

function writePreviewHtml(targetRepo) {
  const htmlPath = path.join(targetRepo, 'preview.html');
  fs.writeFileSync(htmlPath, [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <title>Preview</title>',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '</head>',
    '<body>',
    '  <main id="root"><h1>Preview</h1><button type="button">Open</button></main>',
    '</body>',
    '</html>',
    '',
  ].join('\n'));
  return htmlPath;
}

test('verify-browser resolves repo-local Playwright and stores real runtime proof artifacts', async () => {
  const targetRepo = makeTempRepo();
  writeFakePlaywright(targetRepo);
  const htmlPath = writePreviewHtml(targetRepo);

  const payload = await runVerifyBrowser(targetRepo, {
    url: htmlPath,
    adapter: 'auto',
    requireProof: true,
  });

  assert.equal(payload.verdict, 'pass');
  assert.equal(payload.proofStatus, 'verified');
  assert.equal(payload.evidenceLevel, 'proof');
  assert.equal(payload.execution.browserRuntime, true);
  assert.equal(payload.execution.realScreenshot, true);
  assert.equal(payload.execution.realAccessibilityTree, true);
  assert.equal(payload.execution.accessibilityTreeSource, 'playwright');
  assert.equal(payload.renderer, 'playwright');
  assert.equal(payload.playwright.moduleName, 'playwright');
  assert.match(payload.playwright.resolvedFrom, /raiola-verify-playwright-/);
  assert.equal(payload.metadata.title, 'Preview');
  assert.equal(payload.uiContracts.landmarks.main, true);
  assert.ok(payload.artifacts.screenshot.endsWith('.png'));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.screenshot)));
  assert.ok(fs.existsSync(path.join(targetRepo, payload.artifacts.accessibilityTree)));
});

test('verify-browser does not label fallback accessibility trees as real Playwright proof', async () => {
  const targetRepo = makeTempRepo();
  writeFakePlaywright(targetRepo, { realAccessibilityTree: false });
  const htmlPath = writePreviewHtml(targetRepo);

  const payload = await runVerifyBrowser(targetRepo, {
    url: htmlPath,
    adapter: 'auto',
    requireProof: true,
  });

  assert.equal(payload.verdict, 'pass');
  assert.equal(payload.proofStatus, 'verified');
  assert.equal(payload.execution.browserRuntime, true);
  assert.equal(payload.execution.realScreenshot, true);
  assert.equal(payload.execution.realAccessibilityTree, false);
  assert.equal(payload.execution.accessibilityTreeSource, 'html-fallback');
  assert.equal(payload.playwright.realAccessibilityTree, false);
});
