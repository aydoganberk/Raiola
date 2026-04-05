function runPlaywrightAdapter() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    require.resolve('playwright');
    return {
      supported: true,
      renderer: 'playwright',
    };
  } catch {
    return {
      supported: false,
      renderer: 'playwright-fallback',
      reason: 'Playwright is not installed in this repo; falling back to smoke verification.',
    };
  }
}

module.exports = {
  runPlaywrightAdapter,
};
