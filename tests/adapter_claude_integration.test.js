const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  installClaudeFixture,
  makeTempRepo,
  runHook,
} = require('./helpers/claude_adapter_fixture');

test('Claude hook bridge records a verified lifecycle chain in a synthetic workspace', () => {
  const targetRepo = makeTempRepo('raiola-claude-integration-');
  installClaudeFixture(targetRepo);

  runHook(targetRepo, 'session_start.js', { sessionId: 'session-1' });
  runHook(targetRepo, 'pre_tool_use.js', { sessionId: 'session-1', command: 'git apply patches/review.diff' });
  runHook(targetRepo, 'post_tool_use.js', { sessionId: 'session-1', command: 'npm test', result: 'ok' });
  runHook(targetRepo, 'session_end.js', { sessionId: 'session-1' });

  const bridgeRoot = path.join(targetRepo, '.workflow', 'runtime', 'adapter-hooks', 'claude');
  const summary = JSON.parse(fs.readFileSync(path.join(bridgeRoot, 'summary.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(bridgeRoot, 'state.json'), 'utf8'));
  const events = fs.readFileSync(path.join(bridgeRoot, 'events.jsonl'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const telemetry = JSON.parse(fs.readFileSync(path.join(targetRepo, '.workflow', 'telemetry', 'adapter-hooks.json'), 'utf8'));

  assert.equal(summary.adapter, 'claude');
  assert.equal(summary.lifecycleVerified, true);
  assert.equal(summary.verifiedSessionCount, 1);
  assert.deepEqual(summary.missingRequiredEvents, []);
  assert.ok(summary.observedEvents.includes('sessionStart'));
  assert.ok(summary.observedEvents.includes('beforeCommand'));
  assert.ok(summary.observedEvents.includes('afterCommand'));
  assert.ok(summary.observedEvents.includes('patchApplied'));
  assert.ok(summary.observedEvents.includes('verificationRequested'));
  assert.ok(summary.observedEvents.includes('sessionEnd'));
  assert.equal(summary.latestSession.sessionId, 'session-1');
  assert.equal(summary.latestSession.lifecycleVerified, true);
  assert.equal(state.counts.sessionStart, 1);
  assert.equal(state.counts.beforeCommand, 1);
  assert.equal(state.counts.afterCommand, 1);
  assert.equal(state.counts.patchApplied, 1);
  assert.equal(state.counts.verificationRequested, 1);
  assert.equal(state.counts.sessionEnd, 1);
  assert.equal(events.length, 6);
  assert.equal(telemetry.adapters.claude.lifecycleVerified, true);
  assert.equal(telemetry.adapters.claude.successCount, 6);
  assert.equal(telemetry.adapters.claude.failureCount, 0);
});
