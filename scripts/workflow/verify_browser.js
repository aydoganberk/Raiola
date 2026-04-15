const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const childProcess = require('node:child_process');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { parseArgs } = require('./common');
const { ensureDir } = require('./io/files');
const { resolveExistingPathWithinRoot } = require('./io/path_guard');
const { makeArtifactId, writeRuntimeMarkdown } = require('./runtime_helpers');
const { captureWithPlaywright, runPlaywrightAdapter } = require('./browser_adapters/playwright');
const {
  buildAccessibilityTreeFromHtml,
  buildSummarySvg,
  deriveVisualVerdict,
  extractAccessibilitySignals,
  extractJourneySignals,
  extractMetadataSignals,
  extractUiContractSignals,
  extractVisualSignals,
} = require('./browser_contracts');
const { contractPayload } = require('./contract_versions');

function printHelp() {
  console.log(`
verify_browser

Usage:
  node scripts/workflow/verify_browser.js --url http://localhost:3000

Options:
  --url <http://...>     Target URL
  --adapter <name>       smoke|playwright|auto. Defaults to smoke
                         auto uses repo-local Playwright when available
  --assert <selector>    Assert a simple tag, .class, or #id signal exists
  --smoke                Run smoke mode (default behavior)
  --screenshot-only      Store fetch evidence without verdict gating
  --watch                Run a browser verification control loop
  --require-proof        Fail when browser proof degrades to smoke-only evidence
  --interval <ms>        Watch interval in milliseconds. Defaults to 1500
  --iterations <n>       Limit watch mode iterations. Defaults to unlimited
  --timeout <ms>         Network/browser timeout. Defaults to 10000 for smoke, 15000 for Playwright
  --max-bytes <n>        Bound HTML/file payload size. Defaults to 2097152 bytes
  --allow-external-file-target  Allow verify-browser to read file targets outside the repo root
  --json                 Print machine-readable output
  `);
}

function sha256(value) {
  return require('node:crypto').createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function controlLoopDir(cwd) {
  return path.join(cwd, '.workflow', 'verifications', 'browser-control');
}

async function runVerifyBrowserControlLoop(cwd, options = {}) {
  const intervalMs = Number(options.interval || 1500);
  const maxIterations = options.iterations == null ? null : Math.max(1, Number(options.iterations));
  ensureDir(controlLoopDir(cwd));
  const startedAt = new Date().toISOString();
  const entries = [];
  let index = 0;
  while (maxIterations == null || index < maxIterations) {
    const meta = await runVerifyBrowser(cwd, options);
    const htmlPath = path.join(cwd, meta.artifacts.html);
    const htmlHash = fs.existsSync(htmlPath) ? sha256(fs.readFileSync(htmlPath, 'utf8')) : null;
    const previous = entries[entries.length - 1] || null;
    const drift = previous && previous.htmlHash && htmlHash && previous.htmlHash !== htmlHash ? 'changed' : 'stable';
    entries.push({
      iteration: index + 1,
      at: new Date().toISOString(),
      verdict: meta.verdict,
      visualVerdict: meta.visualVerdict,
      statusCode: meta.statusCode,
      htmlHash,
      screenshot: meta.artifacts.screenshot,
      accessibilityTree: meta.artifacts.accessibilityTree,
      drift,
      uiContracts: meta.uiContracts?.verdict || 'n/a',
    });
    index += 1;
    if (maxIterations != null && index >= maxIterations) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    url: options.url,
    intervalMs,
    iterations: entries.length,
    driftCount: entries.filter((entry) => entry.drift === 'changed').length,
    entries,
  };
  const filePath = path.join(controlLoopDir(cwd), 'latest.json');
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    mode: 'watch',
    ...payload,
    artifacts: {
      log: path.relative(cwd, filePath).replace(/\\/g, '/'),
      latestScreenshot: entries[entries.length - 1]?.screenshot || null,
      latestAccessibilityTree: entries[entries.length - 1]?.accessibilityTree || null,
    },
  };
}

function browserPayloadLimit(options = {}) {
  const fallback = 2 * 1024 * 1024;
  const parsed = Number(options.maxBytes || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function looksLikeExistingFileTarget(cwd, targetUrl) {
  if (String(targetUrl || '').startsWith('file://')) {
    return true;
  }
  const candidate = path.isAbsolute(String(targetUrl || ''))
    ? path.resolve(String(targetUrl || ''))
    : path.resolve(cwd, String(targetUrl || ''));
  return fs.existsSync(candidate);
}

function resolveExternalFileTarget(cwd, targetUrl) {
  const filePath = String(targetUrl || '').startsWith('file://')
    ? fileURLToPath(targetUrl)
    : String(targetUrl || '');
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(cwd, filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Browser file target does not exist: ${filePath}`);
  }
  return absolutePath;
}

function readFileTarget(cwd, targetUrl, options = {}) {
  const maxBytes = browserPayloadLimit(options);
  const allowExternal = Boolean(options.allowExternalFileTarget);
  const resolved = allowExternal
    ? { absolutePath: resolveExternalFileTarget(cwd, targetUrl), relativePath: null }
    : resolveExistingPathWithinRoot(cwd, String(targetUrl || '').startsWith('file://') ? fileURLToPath(targetUrl) : targetUrl, {
      label: 'Browser file target',
    });
  const filePath = resolved.absolutePath;
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    throw new Error(`Browser file target exceeded ${maxBytes} bytes`);
  }
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    body: fs.readFileSync(filePath, 'utf8'),
    filePath,
  };
}

function requestUrl(targetUrl, options = {}, redirectCount = 0) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs || 10000));
  const maxRedirects = Math.max(0, Number(options.maxRedirects || 4));
  const maxBytes = browserPayloadLimit(options);
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https:') ? https : http;
    const request = client.get(targetUrl, { timeout: timeoutMs }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers?.location;
      if (location && [301, 302, 303, 307, 308].includes(statusCode)) {
        if (redirectCount >= maxRedirects) {
          response.resume();
          reject(new Error(`Too many redirects while requesting ${targetUrl}`));
          return;
        }
        const redirectedUrl = new URL(location, targetUrl).toString();
        response.resume();
        resolve(requestUrl(redirectedUrl, options, redirectCount + 1));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error(`Response exceeded ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        resolve({
          statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

function tryQuickLookScreenshot(htmlPath, artifactDir) {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      error: 'Quick Look PNG rendering is only available on macOS; falling back to SVG summary',
    };
  }
  const result = childProcess.spawnSync('qlmanage', ['-t', '-s', '1200', '-o', artifactDir, htmlPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || result.stdout || 'Quick Look render failed',
    };
  }

  const generatedPath = `${htmlPath}.png`;
  if (!fs.existsSync(generatedPath)) {
    return {
      ok: false,
      error: 'Quick Look did not produce a PNG artifact',
    };
  }

  const screenshotPath = path.join(artifactDir, 'screenshot.png');
  if (fs.existsSync(screenshotPath)) {
    fs.rmSync(screenshotPath, { force: true });
  }
  fs.renameSync(generatedPath, screenshotPath);
  return {
    ok: true,
    kind: 'png',
    renderer: 'quicklook',
    screenshotPath,
    error: '',
  };
}

function writeSummarySvg(artifactDir, payload) {
  const screenshotPath = path.join(artifactDir, 'screenshot.svg');
  fs.writeFileSync(screenshotPath, buildSummarySvg(payload));
  return {
    kind: 'svg',
    renderer: 'summary-svg',
    screenshotPath,
    error: '',
  };
}

function assertSelector(body, selector) {
  const value = String(selector || '').trim();
  if (!value) {
    return {
      checked: false,
      matched: true,
      selector: '',
    };
  }
  if (value.startsWith('#')) {
    const id = value.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      checked: true,
      matched: new RegExp(`id=["']${id}["']`, 'i').test(body),
      selector: value,
    };
  }
  if (value.startsWith('.')) {
    const klass = value.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      checked: true,
      matched: new RegExp(`class=["'][^"']*\\b${klass}\\b[^"']*["']`, 'i').test(body),
      selector: value,
    };
  }
  const tag = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    checked: true,
    matched: new RegExp(`<${tag}(\\s|>)`, 'i').test(body),
    selector: value,
  };
}

function buildBrowserReadinessHint(meta, uiContracts, options, adapterName) {
  const requireProof = Boolean(options.requireProof);
  const proofIntent = requireProof || adapterName === 'playwright';
  if (proofIntent) {
    return 'proof-first';
  }
  if (uiContracts.patterns.form || uiContracts.patterns.dialog || uiContracts.patterns.table) {
    return 'interaction-smoke';
  }
  if (meta.viewport.present || uiContracts.landmarks.main) {
    return 'layout-smoke';
  }
  return 'lightweight-smoke';
}

async function runVerifyBrowser(cwd, options = {}) {
  const url = String(options.url || '').trim();
  if (!url) {
    throw new Error('--url is required');
  }

  const artifactId = makeArtifactId('browser');
  const artifactDir = path.join(cwd, '.workflow', 'verifications', 'browser', artifactId);
  const startedAt = new Date().toISOString();
  const startedHr = process.hrtime.bigint();
  let response;
  let errorMessage = '';
  let resolvedFileTargetPath = null;
  const fileTarget = looksLikeExistingFileTarget(cwd, url);

  try {
    response = fileTarget
      ? readFileTarget(cwd, url, options)
      : await requestUrl(url, options);
    resolvedFileTargetPath = response.filePath || null;
  } catch (error) {
    errorMessage = String(error.message || error);
    response = {
      statusCode: 0,
      headers: {},
      body: '',
    };
  }

  const requestedAdapter = String(options.adapter || 'smoke').trim().toLowerCase() || 'smoke';
  const autoCandidate = requestedAdapter === 'auto' ? runPlaywrightAdapter({ cwd }) : null;
  const adapterName = requestedAdapter === 'auto'
    ? (autoCandidate?.supported ? 'playwright' : 'smoke')
    : requestedAdapter;
  const adapter = adapterName === 'playwright' ? (autoCandidate || runPlaywrightAdapter({ cwd })) : {
    supported: true,
    renderer: 'smoke',
  };

  ensureDir(artifactDir);
  let playwrightCapture = null;
  if (adapterName === 'playwright' && adapter.supported) {
    playwrightCapture = await captureWithPlaywright(adapter, {
      url: resolvedFileTargetPath ? pathToFileURL(resolvedFileTargetPath).href : url,
      assertSelector: options.assert ? String(options.assert) : '',
      screenshotPath: path.join(artifactDir, 'playwright-screenshot.png'),
      timeoutMs: options.timeoutMs || 15000,
    });
    if (playwrightCapture?.ok) {
      errorMessage = '';
      if (playwrightCapture.html) {
        response.body = playwrightCapture.html;
      }
      if (Number.isFinite(playwrightCapture.statusCode)) {
        response.statusCode = playwrightCapture.statusCode;
      }
      if (playwrightCapture.headers && Object.keys(playwrightCapture.headers).length > 0) {
        response.headers = playwrightCapture.headers;
      }
    }
  }

  const durationMs = Number((process.hrtime.bigint() - startedHr) / BigInt(1e6));
  const finishedAt = new Date().toISOString();
  const htmlLike = /<html|<!doctype html/i.test(response.body);
  const visualSignals = extractVisualSignals(response.body);
  const accessibility = extractAccessibilitySignals(response.body);
  const journey = extractJourneySignals(response.body);
  const metadata = extractMetadataSignals(response.body);
  const uiContracts = extractUiContractSignals(response.body);
  const selectorAssertion = assertSelector(response.body, options.assert);
  const visualVerdict = deriveVisualVerdict({
    errorMessage,
    htmlLike,
    statusCode: response.statusCode,
    signals: visualSignals,
  });
  const proofStatus = adapterName === 'playwright'
    ? (playwrightCapture?.ok ? 'verified' : 'degraded')
    : 'smoke-only';
  const evidenceLevel = proofStatus === 'verified'
    ? 'proof'
    : proofStatus === 'degraded'
      ? 'degraded'
      : 'smoke';
  const capabilityDegraded = proofStatus === 'degraded'
    || (adapterName === 'playwright' && !adapter.supported)
    || (!playwrightCapture?.ok && adapterName === 'playwright');
  let verdict = errorMessage
    ? 'fail'
    : options.screenshotOnly
      ? 'inconclusive'
      : response.statusCode >= 200 && response.statusCode < 400 && htmlLike
        ? 'pass'
        : response.statusCode >= 400
          ? 'fail'
          : 'inconclusive';
  if (selectorAssertion.checked && !selectorAssertion.matched) {
    verdict = 'fail';
  }
  if (options.requireProof && proofStatus !== 'verified') {
    verdict = 'fail';
  }

  const htmlArtifactPath = path.join(artifactDir, 'response.html');
  fs.writeFileSync(htmlArtifactPath, response.body || '');
  fs.writeFileSync(path.join(artifactDir, 'headers.json'), `${JSON.stringify(response.headers || {}, null, 2)}\n`);
  const realAccessibilityTree = Boolean(playwrightCapture?.ok && playwrightCapture.realAccessibilityTree);
  const accessibilityTree = realAccessibilityTree
    ? playwrightCapture.accessibilityTree
    : buildAccessibilityTreeFromHtml(response.body);
  fs.writeFileSync(path.join(artifactDir, 'accessibility-tree.json'), `${JSON.stringify(accessibilityTree, null, 2)}\n`);

  const renderedPreview = playwrightCapture?.ok && fs.existsSync(path.join(artifactDir, 'playwright-screenshot.png'))
    ? {
      ok: true,
      kind: 'png',
      renderer: adapter.renderer,
      screenshotPath: path.join(artifactDir, 'playwright-screenshot.png'),
      error: '',
    }
    : tryQuickLookScreenshot(htmlArtifactPath, artifactDir);

  const visualArtifact = renderedPreview.ok
    ? renderedPreview
    : writeSummarySvg(artifactDir, {
      url,
      statusCode: response.statusCode,
      verdict,
      visualVerdict,
      title: playwrightCapture?.title || visualSignals.title,
      heading: visualSignals.heading,
      snippet: visualSignals.snippet,
      signals: visualSignals,
      renderer: renderedPreview.error ? 'summary-svg-fallback' : 'summary-svg',
    });

  const meta = {
    ...contractPayload('verifyBrowser'),
    kind: 'browser',
    url,
    requestedAdapter,
    adapter: adapterName,
    startedAt,
    finishedAt,
    durationMs,
    statusCode: response.statusCode,
    htmlLike,
    screenshotOnly: Boolean(options.screenshotOnly),
    verdict,
    visualVerdict,
    proofStatus,
    evidenceLevel,
    capabilityDegraded,
    canClaimBrowserProof: proofStatus === 'verified',
    selectorAssertion,
    visualSignals,
    accessibility,
    journey,
    metadata,
    uiContracts,
    renderer: adapter.supported ? visualArtifact.renderer : adapter.renderer,
    execution: {
      mode: proofStatus === 'verified' ? 'browser-runtime' : 'html-smoke',
      browserRuntime: proofStatus === 'verified',
      runtimeAdapter: adapterName,
      requestedAdapter,
      proofRequired: Boolean(options.requireProof),
      realScreenshot: proofStatus === 'verified' && visualArtifact.kind === 'png',
      realAccessibilityTree,
      accessibilityTreeSource: realAccessibilityTree ? 'playwright' : 'html-fallback',
      finalUrl: playwrightCapture?.finalUrl || url,
      viewport: playwrightCapture?.viewport || null,
    },
    adapterFallbackReason: adapter.reason || '',
    adapterModule: adapter.moduleName || '',
    renderError: renderedPreview.ok ? '' : renderedPreview.error,
    readinessHint: buildBrowserReadinessHint(metadata, uiContracts, options, adapterName),
    accessibilityTreeArtifact: path.relative(cwd, path.join(artifactDir, 'accessibility-tree.json')).replace(/\\/g, '/'),
    playwright: adapterName === 'playwright' ? {
      ok: Boolean(playwrightCapture?.ok),
      reason: playwrightCapture?.reason || adapter.reason || '',
      moduleName: playwrightCapture?.moduleName || adapter.moduleName || '',
      resolvedFrom: playwrightCapture?.resolvedFrom || adapter.resolvedFrom || '',
      finalUrl: playwrightCapture?.finalUrl || '',
      viewport: playwrightCapture?.viewport || null,
      realAccessibilityTree,
    } : null,
    summary: errorMessage || `HTTP ${response.statusCode || 'n/a'} | html=${htmlLike ? 'yes' : 'no'} | visual=${visualVerdict} | evidence=${evidenceLevel} | proof=${proofStatus} | ui=${uiContracts.verdict} | artifact=${visualArtifact.kind}`,
    artifacts: {
      html: path.relative(cwd, path.join(artifactDir, 'response.html')).replace(/\\/g, '/'),
      headers: path.relative(cwd, path.join(artifactDir, 'headers.json')).replace(/\\/g, '/'),
      screenshot: path.relative(cwd, visualArtifact.screenshotPath).replace(/\\/g, '/'),
      accessibilityTree: path.relative(cwd, path.join(artifactDir, 'accessibility-tree.json')).replace(/\\/g, '/'),
    },
  };
  fs.writeFileSync(path.join(artifactDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  writeRuntimeMarkdown(cwd, 'last-verify-browser.md', `
# LAST VERIFY BROWSER

- Verdict: \`${meta.verdict}\`
- Visual verdict: \`${meta.visualVerdict}\`
- Proof status: \`${meta.proofStatus}\`
- Evidence level: \`${meta.evidenceLevel}\`
- Adapter: \`${meta.adapter}\`
- Browser runtime: \`${meta.execution.browserRuntime ? 'yes' : 'no'}\`
- URL: \`${meta.url}\`
- Status code: \`${meta.statusCode}\`
- Summary: \`${meta.summary}\`
- Renderer: \`${meta.renderer}\`
- Accessibility: \`${meta.accessibility.verdict}\`
- Journey: \`${meta.journey.coverage}\`
- UI contracts: \`${meta.uiContracts.verdict}\`
- Title: \`${meta.metadata.title || 'n/a'}\`
- Viewport meta: \`${meta.metadata.viewport.present ? 'yes' : 'no'}\`
- Artifact dir: \`${path.relative(cwd, artifactDir).replace(/\\/g, '/')}\`
`);

  return meta;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const runOptions = {
    url: args.url,
    adapter: args.adapter,
    assert: args.assert,
    smoke: Boolean(args.smoke),
    screenshotOnly: Boolean(args['screenshot-only']),
    requireProof: Boolean(args['require-proof']),
    interval: args.interval,
    iterations: args.iterations,
    timeoutMs: args.timeout,
    maxBytes: args['max-bytes'],
    allowExternalFileTarget: Boolean(args['allow-external-file-target']),
  };
  const payload = args.watch
    ? await runVerifyBrowserControlLoop(cwd, runOptions)
    : await runVerifyBrowser(cwd, runOptions);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# VERIFY BROWSER\n');
  if (payload.mode === 'watch') {
    console.log(`- Mode: \`watch\``);
    console.log(`- URL: \`${payload.url}\``);
    console.log(`- Iterations: \`${payload.iterations}\``);
    console.log(`- Drift count: \`${payload.driftCount}\``);
    console.log(`- Log: \`${payload.artifacts.log}\``);
    return;
  }
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- URL: \`${payload.url}\``);
  console.log(`- Status code: \`${payload.statusCode}\``);
  console.log(`- Visual verdict: \`${payload.visualVerdict}\``);
  console.log(`- Proof status: \`${payload.proofStatus}\``);
  console.log(`- Evidence level: \`${payload.evidenceLevel}\``);
  console.log(`- Adapter: \`${payload.adapter}\``);
  console.log(`- Renderer: \`${payload.renderer}\``);
  console.log(`- Browser runtime: \`${payload.execution.browserRuntime ? 'yes' : 'no'}\``);
  if (payload.playwright?.moduleName) {
    console.log(`- Playwright module: \`${payload.playwright.moduleName}\``);
  }
  console.log(`- UI contracts: \`${payload.uiContracts.verdict}\``);
  console.log(`- Metadata title: \`${payload.metadata.title || 'n/a'}\``);
  console.log(`- Viewport meta: \`${payload.metadata.viewport.present ? 'yes' : 'no'}\``);
  console.log(`- Summary: \`${payload.summary}\``);
  if (payload.adapterFallbackReason) {
    console.log(`- Adapter note: \`${payload.adapterFallbackReason}\``);
  }
  console.log(`- Accessibility: \`${payload.accessibility.verdict}\` issues=\`${payload.accessibility.issueCount}\``);
  console.log(`- Journey: \`${payload.journey.coverage}\``);
  if (payload.selectorAssertion?.checked) {
    console.log(`- Selector assertion: \`${payload.selectorAssertion.selector}\` -> \`${payload.selectorAssertion.matched ? 'matched' : 'missing'}\``);
  }
  console.log(`- HTML: \`${payload.artifacts.html}\``);
  console.log(`- Screenshot: \`${payload.artifacts.screenshot}\``);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  extractAccessibilitySignals,
  extractJourneySignals,
  runVerifyBrowser,
  runVerifyBrowserControlLoop,
};
