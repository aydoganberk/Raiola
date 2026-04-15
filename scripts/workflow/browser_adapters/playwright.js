const childProcess = require('node:child_process');
const path = require('node:path');

function uniquePaths(values = []) {
  return [...new Set(values
    .filter(Boolean)
    .map((value) => path.resolve(String(value))))];
}

function normalizePlaywrightExport(mod) {
  if (!mod) {
    return null;
  }
  if (mod.chromium?.launch) {
    return mod;
  }
  if (mod.playwright?.chromium?.launch) {
    return mod.playwright;
  }
  return null;
}

function tryResolveCandidate(candidate, searchRoot) {
  try {
    const resolvedPath = require.resolve(candidate, { paths: [searchRoot] });
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(resolvedPath);
    const playwright = normalizePlaywrightExport(mod);
    if (!playwright) {
      return null;
    }
    return {
      supported: true,
      renderer: 'playwright',
      moduleName: candidate,
      resolvedPath,
      resolvedFrom: searchRoot,
      playwright,
    };
  } catch {
    return null;
  }
}

function resolvePlaywrightModule(cwd) {
  const searchRoots = uniquePaths([cwd, process.cwd(), __dirname]);
  for (const candidate of ['playwright', '@playwright/test']) {
    for (const searchRoot of searchRoots) {
      const resolved = tryResolveCandidate(candidate, searchRoot);
      if (resolved) {
        return resolved;
      }
    }
  }
  return null;
}

function detectPlaywrightCli(cwd) {
  try {
    const result = childProcess.spawnSync('npx', ['playwright', '--version'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      return {
        detected: true,
        supported: false,
        renderer: 'playwright-cli-detected',
        moduleName: 'npx-playwright',
        reason: 'Playwright CLI is present, but the Node module was not resolvable from the target repo. Install playwright or @playwright/test in the repo to enable real browser proof.',
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function captureWithPlaywright(adapter, options = {}) {
  const playwright = adapter?.playwright;
  if (!playwright?.chromium?.launch) {
    return {
      ok: false,
      reason: 'Playwright launch surface is unavailable in this runtime.',
      moduleName: adapter?.moduleName || '',
    };
  }

  const timeoutMs = Number(options.timeoutMs || 15000);
  const viewport = options.viewport || { width: 1440, height: 900 };
  const browser = await playwright.chromium.launch({ headless: options.headless !== false });
  try {
    const page = await browser.newPage({ viewport });
    let gotoResponse = null;
    if (options.url) {
      gotoResponse = await page.goto(options.url, {
        waitUntil: options.waitUntil || 'networkidle',
        timeout: timeoutMs,
      });
    }
    if (options.settleMs) {
      await page.waitForTimeout(Number(options.settleMs)).catch(() => {});
    }
    if (options.assertSelector) {
      await page.locator(options.assertSelector).first().waitFor({
        state: 'attached',
        timeout: timeoutMs,
      });
    }
    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath, fullPage: true });
    }
    const accessibilityTree = page.accessibility?.snapshot
      ? await page.accessibility.snapshot({ interestingOnly: false })
      : null;
    const title = await page.title().catch(() => '');
    const html = await page.content().catch(() => '');
    const viewportMetrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    })).catch(() => null);
    return {
      ok: true,
      renderer: adapter.renderer,
      moduleName: adapter.moduleName,
      resolvedFrom: adapter.resolvedFrom || '',
      title,
      html,
      accessibilityTree,
      statusCode: gotoResponse?.status?.() ?? 200,
      headers: gotoResponse?.headers?.() ?? {},
      finalUrl: typeof page.url === 'function' ? page.url() : options.url,
      viewport: viewportMetrics,
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.message || error),
      moduleName: adapter?.moduleName || '',
      resolvedFrom: adapter?.resolvedFrom || '',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function runPlaywrightAdapter(options = {}) {
  const cwd = options.cwd || process.cwd();
  const local = resolvePlaywrightModule(cwd);
  if (local) {
    return local;
  }
  const cli = detectPlaywrightCli(cwd);
  if (cli) {
    return cli;
  }
  return {
    supported: false,
    renderer: 'playwright-fallback',
    reason: 'Playwright is not installed in the target repo/runtime; install playwright or @playwright/test to enable real screenshot and accessibility-tree proof.',
  };
}

module.exports = {
  captureWithPlaywright,
  resolvePlaywrightModule,
  runPlaywrightAdapter,
};
