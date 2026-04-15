const net = require('node:net');

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.localhost')
  ) {
    return true;
  }
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    return normalized.startsWith('127.');
  }
  if (ipVersion === 6) {
    return normalized === '::1';
  }
  return false;
}

function normalizeHttpUrl(targetUrl, label = 'URL') {
  let parsed;
  try {
    parsed = new URL(String(targetUrl || '').trim());
  } catch {
    throw new Error(`${label} must be a valid absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http:// or https://`);
  }
  return parsed;
}

function ensureLoopbackHttpUrl(targetUrl, options = {}) {
  const parsed = normalizeHttpUrl(targetUrl, options.label || 'URL');
  if (!options.allowExternal && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${options.label || 'URL'} must stay on localhost/loopback unless explicit opt-in is enabled`);
  }
  return parsed.toString();
}

module.exports = {
  ensureLoopbackHttpUrl,
  isLoopbackHostname,
  normalizeHttpUrl,
};
