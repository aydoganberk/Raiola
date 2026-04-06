const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const childProcess = require('node:child_process');
const {
  ensureDir,
  parseArgs,
} = require('./common');
const { makeArtifactId, writeRuntimeMarkdown } = require('./runtime_helpers');
const { runPlaywrightAdapter } = require('./browser_adapters/playwright');

function printHelp() {
  console.log(`
verify_browser

Usage:
  node scripts/workflow/verify_browser.js --url http://localhost:3000

Options:
  --url <http://...>     Target URL
  --adapter <name>       smoke|playwright. Defaults to smoke
  --assert <selector>    Assert a simple tag, .class, or #id signal exists
  --smoke                Run smoke mode (default behavior)
  --screenshot-only      Store fetch evidence without verdict gating
  --json                 Print machine-readable output
  `);
}

function requestUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https:') ? https : http;
    const request = client.get(targetUrl, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function readFileTarget(targetUrl) {
  const filePath = targetUrl.startsWith('file://')
    ? new URL(targetUrl).pathname
    : targetUrl;
  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    body: fs.readFileSync(filePath, 'utf8'),
  };
}

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function firstMatch(content, pattern) {
  return content.match(pattern)?.[1] || '';
}

function extractVisualSignals(body) {
  const title = stripTags(firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const heading = stripTags(firstMatch(body, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
    || stripTags(firstMatch(body, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
  const mainBody = firstMatch(body, /<main[^>]*>([\s\S]*?)<\/main>/i);
  const mainText = stripTags(mainBody);
  const bodyText = stripTags(firstMatch(body, /<body[^>]*>([\s\S]*?)<\/body>/i) || body);
  const snippet = (mainText || bodyText).slice(0, 280);
  const hasMain = /<main[\s>]/i.test(body);
  const hasHeading = /<h[1-3][\s>]/i.test(body);
  const hasNav = /<nav[\s>]/i.test(body);
  const hasForm = /<form[\s>]/i.test(body);
  const hasButton = /<button[\s>]|type=["']submit["']/i.test(body);
  const signalScore = [
    Boolean(title),
    Boolean(heading),
    hasMain,
    hasHeading,
    hasNav,
    hasForm,
    hasButton,
  ].filter(Boolean).length;

  return {
    title,
    heading,
    snippet,
    hasMain,
    hasHeading,
    hasNav,
    hasForm,
    hasButton,
    signalScore,
  };
}

function stripTagContents(value) {
  return stripTags(String(value || ''));
}

function collectTagMatches(body, tagName) {
  return [...String(body || '').matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))];
}

function extractAccessibilitySignals(body) {
  const issues = [];
  const pushIssue = (severity, rule, detail) => {
    issues.push({ severity, rule, detail });
  };
  const htmlTag = body.match(/<html\b([^>]*)>/i)?.[1] || '';
  const hasLang = /\blang\s*=\s*["'][^"']+["']/i.test(htmlTag);
  if (!hasLang) {
    pushIssue('medium', 'document-lang', 'The root html element does not declare a lang attribute.');
  }
  if (!/<main[\s>]/i.test(body)) {
    pushIssue('medium', 'landmark-main', 'A main landmark was not detected in the document.');
  }

  const images = [...String(body || '').matchAll(/<img\b([^>]*)>/gi)];
  const imagesWithoutAlt = images.filter((match) => !/\balt\s*=\s*["'][^"']*["']/i.test(match[1] || '')).length;
  if (imagesWithoutAlt > 0) {
    pushIssue('high', 'image-alt', `${imagesWithoutAlt} image element(s) are missing alt text.`);
  }

  const labelsByFor = new Set([...String(body || '').matchAll(/<label\b[^>]*for=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));
  const fields = [...String(body || '').matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
  const unlabeledFields = fields.filter((match) => {
    const attrs = match[2] || '';
    if (/\btype=["']?(hidden|submit|button|reset)["']?/i.test(attrs)) {
      return false;
    }
    if (/\b(aria-label|aria-labelledby|title)\s*=/i.test(attrs)) {
      return false;
    }
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    return !id || !labelsByFor.has(id);
  }).length;
  if (unlabeledFields > 0) {
    pushIssue('high', 'form-label', `${unlabeledFields} form control(s) do not have an obvious accessible label.`);
  }

  const unlabeledButtons = collectTagMatches(body, 'button').filter((match) => {
    const full = match[0] || '';
    const attrs = full.match(/<button\b([^>]*)>/i)?.[1] || '';
    const text = stripTagContents(match[1] || '');
    return !text && !/\b(aria-label|aria-labelledby|title)\s*=/i.test(attrs);
  }).length;
  if (unlabeledButtons > 0) {
    pushIssue('high', 'button-name', `${unlabeledButtons} button element(s) do not expose an accessible name.`);
  }

  return {
    verdict: issues.some((issue) => issue.severity === 'high')
      ? 'fail'
      : issues.length > 0
        ? 'warn'
        : 'pass',
    issueCount: issues.length,
    issues,
    checks: {
      hasLang,
      hasMain: /<main[\s>]/i.test(body),
      imagesWithoutAlt,
      unlabeledFields,
      unlabeledButtons,
    },
  };
}

function extractJourneySignals(body) {
  const signals = {
    nav: /<nav[\s>]/i.test(body),
    main: /<main[\s>]/i.test(body),
    heading: /<h[1-2][\s>]/i.test(body),
    primaryAction: /<button[\s>]|type=["']submit["']|<a\b[^>]*>([\s\S]*?(start|get started|continue|save|submit|buy|ship|next))/i.test(body),
    form: /<form[\s>]|<(input|select|textarea)\b/i.test(body),
    feedback: /\b(loading|spinner|skeleton|error|retry|success|saved|empty state|no results|aria-live)\b/i.test(body),
  };
  const missing = Object.entries(signals)
    .filter(([, present]) => !present)
    .map(([key]) => key)
    .filter((key) => !['form', 'feedback', 'nav'].includes(key));
  return {
    coverage: missing.length === 0
      ? 'pass'
      : missing.length <= 2
        ? 'warn'
        : 'incomplete',
    signals,
    missing,
    summary: missing.length === 0
      ? 'Core journey signals were detected.'
      : `Missing journey signals: ${missing.join(', ')}.`,
  };
}

function wrapText(value, limit = 72, maxLines = 4) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
    if (lines.length >= maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, limit - 3))}...`;
  }

  return lines;
}

function buildSummarySvg(payload) {
  const lines = [
    ...wrapText(payload.title || 'Untitled page', 34, 2),
    ...wrapText(payload.heading || payload.url, 48, 2),
    ...wrapText(payload.snippet || 'No readable body text was captured from the response.', 62, 5),
  ];
  const lineHeight = 34;
  const startY = 214;
  const textNodes = lines
    .map((line, index) => `<text x="84" y="${startY + (index * lineHeight)}" fill="#0f172a" font-size="${index < 2 ? 28 : 22}" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(line)}</text>`)
    .join('\n');
  const badges = [
    `HTTP ${payload.statusCode || 'n/a'}`,
    `transport ${payload.verdict}`,
    `visual ${payload.visualVerdict}`,
    payload.renderer,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="Browser verification summary">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="48" y="44" width="1184" height="632" rx="28" fill="#fffbeb" stroke="#0f172a" stroke-width="3"/>
  <text x="84" y="112" fill="#0f172a" font-size="36" font-family="Menlo, Monaco, 'Courier New', monospace">VERIFY BROWSER</text>
  <text x="84" y="154" fill="#334155" font-size="22" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(payload.url)}</text>
  <rect x="84" y="564" width="1112" height="72" rx="18" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="110" y="608" fill="#334155" font-size="22" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(badges.join(' | '))}</text>
  <text x="84" y="520" fill="#475569" font-size="20" font-family="Menlo, Monaco, 'Courier New', monospace">signals: title=${payload.signals.title ? 'yes' : 'no'} heading=${payload.signals.hasHeading ? 'yes' : 'no'} main=${payload.signals.hasMain ? 'yes' : 'no'} nav=${payload.signals.hasNav ? 'yes' : 'no'} form=${payload.signals.hasForm ? 'yes' : 'no'} button=${payload.signals.hasButton ? 'yes' : 'no'}</text>
  ${textNodes}
</svg>
`;
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

function deriveVisualVerdict({ errorMessage, htmlLike, statusCode, signals }) {
  if (errorMessage || statusCode >= 400) {
    return 'fail';
  }
  if (!htmlLike) {
    return 'inconclusive';
  }
  if (signals.signalScore >= 2) {
    return 'pass';
  }
  return 'inconclusive';
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

  try {
    response = url.startsWith('file://') || fs.existsSync(url)
      ? readFileTarget(url)
      : await requestUrl(url);
  } catch (error) {
    errorMessage = String(error.message || error);
    response = {
      statusCode: 0,
      headers: {},
      body: '',
    };
  }

  const durationMs = Number((process.hrtime.bigint() - startedHr) / BigInt(1e6));
  const finishedAt = new Date().toISOString();
  const htmlLike = /<html|<!doctype html/i.test(response.body);
  const visualSignals = extractVisualSignals(response.body);
  const accessibility = extractAccessibilitySignals(response.body);
  const journey = extractJourneySignals(response.body);
  const adapterName = String(options.adapter || 'smoke').trim().toLowerCase() || 'smoke';
  const adapter = adapterName === 'playwright' ? runPlaywrightAdapter() : {
    supported: true,
    renderer: 'smoke',
  };
  const selectorAssertion = assertSelector(response.body, options.assert);
  const visualVerdict = deriveVisualVerdict({
    errorMessage,
    htmlLike,
    statusCode: response.statusCode,
    signals: visualSignals,
  });
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

  ensureDir(artifactDir);
  const htmlArtifactPath = path.join(artifactDir, 'response.html');
  fs.writeFileSync(htmlArtifactPath, response.body || '');
  fs.writeFileSync(path.join(artifactDir, 'headers.json'), `${JSON.stringify(response.headers || {}, null, 2)}\n`);
  const renderedPreview = tryQuickLookScreenshot(htmlArtifactPath, artifactDir);
  const visualArtifact = renderedPreview.ok
    ? renderedPreview
    : writeSummarySvg(artifactDir, {
      url,
      statusCode: response.statusCode,
      verdict,
      visualVerdict,
      title: visualSignals.title,
      heading: visualSignals.heading,
      snippet: visualSignals.snippet,
      signals: visualSignals,
      renderer: renderedPreview.error ? 'summary-svg-fallback' : 'summary-svg',
    });
  const meta = {
    kind: 'browser',
    url,
    adapter: adapterName,
    startedAt,
    finishedAt,
    durationMs,
    statusCode: response.statusCode,
    htmlLike,
    screenshotOnly: Boolean(options.screenshotOnly),
    verdict,
    visualVerdict,
    selectorAssertion,
    visualSignals,
    accessibility,
    journey,
    renderer: adapter.supported ? visualArtifact.renderer : adapter.renderer,
    adapterFallbackReason: adapter.reason || '',
    renderError: renderedPreview.ok ? '' : renderedPreview.error,
    summary: errorMessage || `HTTP ${response.statusCode || 'n/a'} | html=${htmlLike ? 'yes' : 'no'} | visual=${visualVerdict} | artifact=${visualArtifact.kind}`,
    artifacts: {
      html: path.relative(cwd, path.join(artifactDir, 'response.html')).replace(/\\/g, '/'),
      headers: path.relative(cwd, path.join(artifactDir, 'headers.json')).replace(/\\/g, '/'),
      screenshot: path.relative(cwd, visualArtifact.screenshotPath).replace(/\\/g, '/'),
    },
  };
  fs.writeFileSync(path.join(artifactDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  writeRuntimeMarkdown(cwd, 'last-verify-browser.md', `
# LAST VERIFY BROWSER

- Verdict: \`${meta.verdict}\`
- Visual verdict: \`${meta.visualVerdict}\`
- Adapter: \`${meta.adapter}\`
- URL: \`${meta.url}\`
- Status code: \`${meta.statusCode}\`
- Summary: \`${meta.summary}\`
- Renderer: \`${meta.renderer}\`
- Accessibility: \`${meta.accessibility.verdict}\`
- Journey: \`${meta.journey.coverage}\`
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
  const payload = await runVerifyBrowser(cwd, {
    url: args.url,
    adapter: args.adapter,
    assert: args.assert,
    smoke: Boolean(args.smoke),
    screenshotOnly: Boolean(args['screenshot-only']),
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# VERIFY BROWSER\n');
  console.log(`- Verdict: \`${payload.verdict}\``);
  console.log(`- URL: \`${payload.url}\``);
  console.log(`- Status code: \`${payload.statusCode}\``);
  console.log(`- Visual verdict: \`${payload.visualVerdict}\``);
  console.log(`- Adapter: \`${payload.adapter}\``);
  console.log(`- Renderer: \`${payload.renderer}\``);
  console.log(`- Summary: \`${payload.summary}\``);
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
};
