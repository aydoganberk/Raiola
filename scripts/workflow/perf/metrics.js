const fs = require('node:fs');
const path = require('node:path');

const state = {
  counters: {},
  startedAt: new Date().toISOString(),
};

function recordCounter(name, delta = 1) {
  state.counters[name] = (state.counters[name] || 0) + delta;
}

function markCache(name, hit) {
  recordCounter(`${name}_${hit ? 'hits' : 'misses'}`, 1);
}

function getPerfMetrics() {
  return {
    startedAt: state.startedAt,
    capturedAt: new Date().toISOString(),
    counters: { ...state.counters },
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writePerfSnapshot() {
  if (process.env.WORKFLOW_PERF_CAPTURE !== '1') {
    return;
  }

  const cwd = process.cwd();
  const label = String(process.env.WORKFLOW_PERF_LABEL || path.basename(process.argv[1] || 'workflow')).replace(/[^a-z0-9._-]+/gi, '-');
  const dir = path.join(cwd, '.workflow', 'cache', 'perf-metrics');
  ensureDir(dir);
  const payload = getPerfMetrics();
  fs.writeFileSync(path.join(dir, 'latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, `${label}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

process.once('exit', writePerfSnapshot);

module.exports = {
  getPerfMetrics,
  markCache,
  recordCounter,
};
