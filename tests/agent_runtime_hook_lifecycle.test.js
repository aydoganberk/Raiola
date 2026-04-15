const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildRuntimeContract } = require('../scripts/workflow/agent_runtime');
const {
  installClaudeFixture,
  makeTempRepo,
  runHook,
} = require('./helpers/claude_adapter_fixture');

test('agent runtime promotes Claude readiness from declared hooks to verified lifecycle support', () => {
  const targetRepo = makeTempRepo('raiola-claude-runtime-verified-');
  installClaudeFixture(targetRepo);

  runHook(targetRepo, 'session_start.js', { sessionId: 'verified-session' });
  runHook(targetRepo, 'pre_tool_use.js', { sessionId: 'verified-session', command: 'git apply .workflow/patches/one.diff' });
  runHook(targetRepo, 'post_tool_use.js', { sessionId: 'verified-session', command: 'pnpm test', result: 'ok' });
  runHook(targetRepo, 'session_end.js', { sessionId: 'verified-session' });

  const contract = buildRuntimeContract(targetRepo);
  const claude = contract.adapters.find((entry) => entry.id === 'claude');

  assert.equal(claude.detected, true);
  assert.equal(claude.hooks.sessionStart, true);
  assert.equal(claude.hooks.sessionEnd, true);
  assert.equal(claude.integration.level, 'operational');
  assert.ok(claude.integration.features.includes('hook-lifecycle-verified'));
  assert.equal(claude.context.hookLifecycle.lifecycleVerified, true);
  assert.equal(claude.context.hookLifecycle.verifiedSessionCount, 1);
  assert.ok(claude.context.hookLifecycle.observedEvents.includes('patchApplied'));
  assert.ok(claude.context.hookLifecycle.observedEvents.includes('verificationRequested'));
  assert.equal(claude.context.adapterContract.transport, 'file-jsonl-bridge');
  assert.ok(contract.depthSummary.lifecycleVerifiedAdapters.includes('claude'));
  assert.ok(contract.depthSummary.operationalAdapters.includes('claude'));
  assert.ok(!contract.depthSummary.partialSupportAdapters.includes('claude'));
});

test('agent runtime surfaces Claude hook parse failures and partial lifecycle support', () => {
  const targetRepo = makeTempRepo('raiola-claude-runtime-partial-');
  installClaudeFixture(targetRepo);

  runHook(targetRepo, 'session_start.js', { sessionId: 'partial-session' });
  runHook(targetRepo, 'pre_tool_use.js', { sessionId: 'partial-session', command: 'git apply .workflow/patches/two.diff' });

  let parseFailed = false;
  try {
    require('node:child_process').execFileSync('node', [require('node:path').join(targetRepo, '.claude', 'hooks', 'post_tool_use.js')], {
      cwd: targetRepo,
      input: '{not-valid-json}',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    parseFailed = true;
  }
  assert.equal(parseFailed, true);

  const contract = buildRuntimeContract(targetRepo);
  const claude = contract.adapters.find((entry) => entry.id === 'claude');

  assert.equal(claude.detected, true);
  assert.equal(claude.integration.level, 'hooked');
  assert.equal(claude.context.hookLifecycle.lifecycleVerified, false);
  assert.equal(claude.context.hookLifecycle.partialSupport, true);
  assert.ok(claude.context.hookLifecycle.failureModes.includes('event_parse_failed'));
  assert.ok(claude.context.hookLifecycle.failureModes.includes('partial_support'));
  assert.ok(claude.integration.missing.includes('Claude hook payload could not be parsed'));
  assert.ok(claude.integration.missing.includes('Claude hook lifecycle is only partially supported'));
  assert.ok(claude.integration.nextActions.some((entry) => entry.includes('Exercise the missing Claude lifecycle events')));
  assert.ok(contract.depthSummary.partialSupportAdapters.includes('claude'));
  assert.ok(contract.depthSummary.adapterFailureModes.claude.includes('event_parse_failed'));
});
