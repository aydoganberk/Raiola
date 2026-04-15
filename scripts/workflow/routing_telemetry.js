const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  ensureDir,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');

function telemetryDir(cwd) { return path.join(cwd, '.workflow', 'telemetry'); }
function routingLogPath(cwd) { return path.join(telemetryDir(cwd), 'routing-log.jsonl'); }
function routingSummaryPath(cwd) { return path.join(telemetryDir(cwd), 'routing-summary.json'); }
function stableGoalFingerprint(goal) { return crypto.createHash('sha1').update(String(goal || '').trim().toLowerCase()).digest('hex').slice(0, 12); }
function appendJsonl(filePath, payload) { ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`); }
function readRoutingLog(cwd) {
  const filePath = routingLogPath(cwd);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}
function scoreKeywordToken(token) { return /^[a-z0-9][a-z0-9_-]{2,}$/i.test(token) && !/^(the|and|for|with|this|that|into|from|plan|next|safe|work|repo|goal|task|slice)$/i.test(token); }
function extractKeywords(goal, limit = 6) {
  const normalized = String(goal || '').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, ' ').split(/\s+/).filter(scoreKeywordToken);
  return [...new Set(normalized)].slice(0, limit);
}
function topKey(object) { return Object.entries(object || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
function summarizeRoutingTelemetry(cwd) {
  const entries = readRoutingLog(cwd);
  const byPhase = {};
  const keywordStats = {};
  for (const entry of entries) {
    const phase = entry.phase || 'plan';
    if (!byPhase[phase]) byPhase[phase] = { total: 0, capabilityCounts: {}, presetCounts: {}, overrides: 0 };
    const bucket = byPhase[phase];
    bucket.total += 1;
    bucket.capabilityCounts[entry.finalCapability] = (bucket.capabilityCounts[entry.finalCapability] || 0) + 1;
    bucket.presetCounts[entry.finalPreset] = (bucket.presetCounts[entry.finalPreset] || 0) + 1;
    if (entry.outcome === 'override') bucket.overrides += 1;
    for (const keyword of entry.keywords || []) {
      const key = `${phase}:${keyword}`;
      if (!keywordStats[key]) keywordStats[key] = { phase, keyword, count: 0, capabilities: {}, presets: {} };
      keywordStats[key].count += 1;
      keywordStats[key].capabilities[entry.finalCapability] = (keywordStats[key].capabilities[entry.finalCapability] || 0) + 1;
      keywordStats[key].presets[entry.finalPreset] = (keywordStats[key].presets[entry.finalPreset] || 0) + 1;
    }
  }
  const phaseSummaries = Object.fromEntries(Object.entries(byPhase).map(([phase, bucket]) => [phase, {
    total: bucket.total,
    overrideRate: bucket.total > 0 ? Number((bucket.overrides / bucket.total).toFixed(3)) : 0,
    learnedCapability: topKey(bucket.capabilityCounts),
    learnedPreset: topKey(bucket.presetCounts),
    capabilityCounts: bucket.capabilityCounts,
    presetCounts: bucket.presetCounts,
  }]));
  const topKeywordPatterns = Object.values(keywordStats).filter((entry) => entry.count >= 2).sort((a, b) => b.count - a.count).slice(0, 25).map((entry) => ({ phase: entry.phase, keyword: entry.keyword, count: entry.count, capability: topKey(entry.capabilities), preset: topKey(entry.presets) }));
  return { generatedAt: new Date().toISOString(), totalEntries: entries.length, byPhase: phaseSummaries, topKeywordPatterns, logFile: path.relative(cwd, routingLogPath(cwd)).replace(/\\/g, '/') };
}
function logRoutingDecision(cwd, entry = {}) {
  const payload = {
    at: entry.at || new Date().toISOString(),
    source: entry.source || 'route',
    phase: String(entry.phase || 'plan'),
    goal: String(entry.goal || ''),
    goalFingerprint: stableGoalFingerprint(entry.goal || ''),
    recommendedCapability: String(entry.recommendedCapability || entry.capability || 'unknown'),
    recommendedPreset: String(entry.recommendedPreset || entry.preset || 'balanced'),
    finalCapability: String(entry.finalCapability || entry.recommendedCapability || entry.capability || 'unknown'),
    finalPreset: String(entry.finalPreset || entry.recommendedPreset || entry.preset || 'balanced'),
    confidence: Number(entry.confidence || 0),
    outcome: String(entry.outcome || 'recommended'),
    repoShape: String(entry.repoShape || 'unknown'),
    monorepo: Boolean(entry.monorepo),
    frontendActive: Boolean(entry.frontendActive),
    keywords: Array.isArray(entry.keywords) ? entry.keywords : extractKeywords(entry.goal || ''),
  };
  appendJsonl(routingLogPath(cwd), payload);
  writeIfChanged(routingSummaryPath(cwd), `${JSON.stringify(summarizeRoutingTelemetry(cwd), null, 2)}\n`);
  return payload;
}
function suggestTelemetryBias(cwd, route = {}) {
  const summary = summarizeRoutingTelemetry(cwd);
  const phase = String(route.phase || 'plan');
  const phaseSummary = summary.byPhase?.[phase];
  if (!phaseSummary || phaseSummary.total < 4) return null;
  const routeKeywords = new Set(extractKeywords(route.goal || ''));
  const keywordMatch = (summary.topKeywordPatterns || []).filter((entry) => entry.phase === phase && routeKeywords.has(entry.keyword)).sort((a, b) => b.count - a.count)[0] || null;
  const recommendedCapability = keywordMatch?.capability || phaseSummary.learnedCapability;
  const recommendedPreset = keywordMatch?.preset || phaseSummary.learnedPreset;
  if (!recommendedCapability && !recommendedPreset) return null;
  return {
    phase,
    totalExamples: phaseSummary.total,
    keyword: keywordMatch?.keyword || null,
    recommendedCapability,
    recommendedPreset,
    overrideRate: phaseSummary.overrideRate,
    reason: keywordMatch ? `Telemetry saw ${keywordMatch.count} prior ${phase} routes with keyword \`${keywordMatch.keyword}\`.` : `Telemetry saw ${phaseSummary.total} prior ${phase} routes in this repo.`,
  };
}
module.exports = { extractKeywords, logRoutingDecision, readRoutingLog, routingLogPath, routingSummaryPath, suggestTelemetryBias, summarizeRoutingTelemetry };
