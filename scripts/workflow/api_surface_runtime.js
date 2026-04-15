const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { ensureDir } = require('./io/files');
const { contractPayload } = require('./contract_versions');
const { makeArtifactId } = require('./runtime_helpers');

function requestWithMethod(targetUrl, method, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method, timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers || {},
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    request.end();
  });
}

function methodForProbe(endpoint, options = {}) {
  const declared = String(endpoint.method || 'GET').toUpperCase();
  if (declared === 'GET' || declared === 'HEAD') {
    return declared;
  }
  if (options.allowUnsafeMethods) {
    return declared;
  }
  return 'OPTIONS';
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!trimmed) {
    throw new Error('A base URL is required for runtime API evidence.');
  }
  return trimmed;
}

function summarizeBody(body) {
  const compact = String(body || '').replace(/\s+/g, ' ').trim();
  return compact ? compact.slice(0, 220) : '';
}

function verdictForResponse(response, method) {
  const statusCode = Number(response?.statusCode || 0);
  if (statusCode >= 200 && statusCode < 300) {
    return method === 'OPTIONS' ? 'reachable' : 'verified';
  }
  if (statusCode >= 300 && statusCode < 500) {
    return 'warn';
  }
  return 'fail';
}

async function probeEndpoint(baseUrl, endpoint, options = {}) {
  const method = methodForProbe(endpoint, options);
  const targetUrl = `${normalizeBaseUrl(baseUrl)}${endpoint.path}`;
  try {
    const response = await requestWithMethod(targetUrl, method, Number(options.timeoutMs || 10000));
    const verdict = verdictForResponse(response, method);
    return {
      endpoint: endpoint.path,
      declaredMethod: String(endpoint.method || 'GET').toUpperCase(),
      probeMethod: method,
      url: targetUrl,
      verdict,
      statusCode: response.statusCode,
      contentType: response.headers['content-type'] || '',
      responsePreview: summarizeBody(response.body),
    };
  } catch (error) {
    return {
      endpoint: endpoint.path,
      declaredMethod: String(endpoint.method || 'GET').toUpperCase(),
      probeMethod: method,
      url: targetUrl,
      verdict: 'fail',
      statusCode: 0,
      contentType: '',
      responsePreview: '',
      error: String(error.message || error),
    };
  }
}

function selectRuntimeEndpoints(apiSurface, options = {}) {
  const limit = Math.max(1, Number(options.probeLimit || 6));
  const endpoints = Array.isArray(apiSurface?.endpoints) ? apiSurface.endpoints : [];
  const seen = new Set();
  const selected = [];
  for (const endpoint of endpoints) {
    const signature = `${String(endpoint.method || 'GET').toUpperCase()} ${endpoint.path}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    selected.push(endpoint);
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

function proofStatusFromEntries(entries = []) {
  if (entries.some((entry) => entry.verdict === 'verified')) {
    return 'verified';
  }
  if (entries.some((entry) => entry.verdict === 'reachable')) {
    return 'reachable';
  }
  if (entries.some((entry) => entry.verdict === 'warn')) {
    return 'warn';
  }
  if (entries.length > 0) {
    return 'fail';
  }
  return 'skipped';
}

async function runApiSurfaceRuntimeEvidence(cwd, apiSurface, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const endpoints = selectRuntimeEndpoints(apiSurface, options);
  const entries = [];
  for (const endpoint of endpoints) {
    entries.push(await probeEndpoint(baseUrl, endpoint, options));
  }

  const artifactId = makeArtifactId('api-surface-runtime');
  const artifactDir = path.join(cwd, '.workflow', 'verifications', 'api-surface', artifactId);
  const payload = {
    ...contractPayload('apiSurfaceRuntime'),
    generatedAt: new Date().toISOString(),
    baseUrl,
    attemptedCount: entries.length,
    verifiedCount: entries.filter((entry) => entry.verdict === 'verified').length,
    reachableCount: entries.filter((entry) => entry.verdict === 'reachable').length,
    warnCount: entries.filter((entry) => entry.verdict === 'warn').length,
    failCount: entries.filter((entry) => entry.verdict === 'fail').length,
    skippedCount: entries.filter((entry) => entry.verdict === 'skipped').length,
    proofStatus: proofStatusFromEntries(entries),
    summary: entries.length === 0
      ? 'No eligible endpoints were selected for runtime probing.'
      : entries.map((entry) => `${entry.declaredMethod} ${entry.endpoint} -> ${entry.verdict}${entry.statusCode ? ` (${entry.statusCode})` : ''}`).join(' | '),
    entries,
    artifacts: null,
  };

  if (options.writeArtifacts !== false) {
    ensureDir(artifactDir);
    const metaPath = path.join(artifactDir, 'meta.json');
    fs.writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`);
    payload.artifacts = {
      meta: path.relative(cwd, metaPath).replace(/\\/g, '/'),
    };
  }

  return payload;
}

module.exports = {
  methodForProbe,
  probeEndpoint,
  runApiSurfaceRuntimeEvidence,
  selectRuntimeEndpoints,
};
