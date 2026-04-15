const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common_args');
const { ensureDir, writeTextIfChanged } = require('./io/fs');
const { readJsonIfExists } = require('./io/json');
const {
  applyLifecycleEvent,
  emptyAdapterLifecycleState,
  getAdapterContract,
  normalizeLifecycleEvent,
  registerFailure,
  summarizeLifecycleState,
} = require('./adapter_contract');

function bridgeRoot(cwd, adapter = 'claude') {
  return path.join(cwd, '.workflow', 'runtime', 'adapter-hooks', adapter);
}

function bridgeStatePath(cwd, adapter = 'claude') {
  return path.join(bridgeRoot(cwd, adapter), 'state.json');
}

function bridgeEventsPath(cwd, adapter = 'claude') {
  return path.join(bridgeRoot(cwd, adapter), 'events.jsonl');
}

function bridgeSummaryPath(cwd, adapter = 'claude') {
  return path.join(bridgeRoot(cwd, adapter), 'summary.json');
}

function bridgeTelemetryPath(cwd) {
  return path.join(cwd, '.workflow', 'telemetry', 'adapter-hooks.json');
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function appendJsonl(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

function readBridgeState(cwd, adapter = 'claude') {
  return readJsonIfExists(bridgeStatePath(cwd, adapter), emptyAdapterLifecycleState(adapter));
}

function writeBridgeArtifacts(cwd, adapter, state, hookSupport = {}) {
  const summary = summarizeLifecycleState(adapter, state, { hookSupport });
  writeTextIfChanged(bridgeStatePath(cwd, adapter), `${JSON.stringify(state, null, 2)}\n`);
  writeTextIfChanged(bridgeSummaryPath(cwd, adapter), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function updateBridgeTelemetry(cwd, adapter, summary) {
  const telemetry = readJsonIfExists(bridgeTelemetryPath(cwd), {
    generatedAt: null,
    adapters: {},
  }) || {
    generatedAt: null,
    adapters: {},
  };
  telemetry.generatedAt = new Date().toISOString();
  telemetry.adapters[adapter] = {
    lastEventAt: summary.lastEventAt,
    lifecycleVerified: summary.lifecycleVerified,
    sessionCount: summary.sessionCount,
    verifiedSessionCount: summary.verifiedSessionCount,
    observedEvents: summary.observedEvents,
    failureModes: summary.failureModes,
    successCount: summary.telemetry.successCount,
    failureCount: summary.telemetry.failureCount,
  };
  writeTextIfChanged(bridgeTelemetryPath(cwd), `${JSON.stringify(telemetry, null, 2)}\n`);
  return telemetry;
}

function recordAdapterLifecycleEvent(cwd, adapter = 'claude', input = {}, options = {}) {
  const contract = getAdapterContract(adapter);
  let state = readBridgeState(cwd, contract.adapter);
  const normalized = normalizeLifecycleEvent(contract.adapter, input);
  if (!normalized.ok) {
    state = registerFailure(state, normalized.failureMode, normalized.error, {
      adapter: contract.adapter,
      at: new Date().toISOString(),
    });
    const summary = writeBridgeArtifacts(cwd, contract.adapter, state, options.hookSupport || {});
    updateBridgeTelemetry(cwd, contract.adapter, summary);
    return {
      ok: false,
      adapter: contract.adapter,
      failureMode: normalized.failureMode,
      error: normalized.error,
      state,
      summary,
    };
  }

  const baseEvent = normalized.event;
  const emitted = normalized.derivedEvents && normalized.derivedEvents.length > 0
    ? normalized.derivedEvents
    : [baseEvent];
  ensureDir(bridgeRoot(cwd, contract.adapter));
  for (const lifecycleEvent of emitted) {
    state = applyLifecycleEvent(state, lifecycleEvent, { adapter: contract.adapter });
    appendJsonl(bridgeEventsPath(cwd, contract.adapter), lifecycleEvent);
  }
  const summary = writeBridgeArtifacts(cwd, contract.adapter, state, options.hookSupport || {});
  updateBridgeTelemetry(cwd, contract.adapter, summary);
  return {
    ok: true,
    adapter: contract.adapter,
    event: baseEvent,
    emittedEvents: emitted.map((entry) => entry.event),
    state,
    summary,
  };
}

function readAdapterBridgeSummary(cwd, adapter = 'claude', options = {}) {
  const state = readBridgeState(cwd, adapter);
  const summary = summarizeLifecycleState(adapter, state, {
    hookSupport: options.hookSupport || {},
  });
  return {
    state,
    summary,
    paths: {
      state: path.relative(cwd, bridgeStatePath(cwd, adapter)).replace(/\\/g, '/'),
      events: path.relative(cwd, bridgeEventsPath(cwd, adapter)).replace(/\\/g, '/'),
      summary: path.relative(cwd, bridgeSummaryPath(cwd, adapter)).replace(/\\/g, '/'),
      telemetry: path.relative(cwd, bridgeTelemetryPath(cwd)).replace(/\\/g, '/'),
    },
  };
}

function parseJsonPayload(rawPayload) {
  if (!rawPayload) {
    return {
      ok: true,
      payload: {},
    };
  }
  try {
    return {
      ok: true,
      payload: JSON.parse(rawPayload),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      payload: {},
    };
  }
}

function buildHookSupport(adapter, hookName) {
  if (String(adapter).trim().toLowerCase() !== 'claude') {
    return {};
  }
  return {
    sessionStart: hookName === 'SessionStart',
    beforeCommand: hookName === 'PreToolUse',
    afterCommand: hookName === 'PostToolUse',
    sessionEnd: hookName === 'SessionEnd',
  };
}

function runAdapterHookFromProcess(options = {}) {
  const adapter = String(options.adapter || 'claude').trim().toLowerCase();
  const hook = String(options.hook || '').trim();
  const cwd = path.resolve(options.cwd || process.cwd());
  const stdin = options.stdin != null ? String(options.stdin) : readStdin();
  const parsed = parseJsonPayload(stdin.trim());
  if (!parsed.ok) {
    const state = registerFailure(readBridgeState(cwd, adapter), 'event_parse_failed', parsed.error, {
      adapter,
      at: new Date().toISOString(),
    });
    const summary = writeBridgeArtifacts(cwd, adapter, state, buildHookSupport(adapter, hook));
    updateBridgeTelemetry(cwd, adapter, summary);
    return {
      ok: false,
      adapter,
      hook,
      failureMode: 'event_parse_failed',
      error: parsed.error,
      summary,
    };
  }
  return recordAdapterLifecycleEvent(cwd, adapter, {
    hook,
    payload: parsed.payload,
    source: 'hook-wrapper',
  }, {
    hookSupport: buildHookSupport(adapter, hook),
  });
}

function printHelp() {
  console.log(`
adapter_hooks_bridge

Usage:
  node scripts/workflow/adapter_hooks_bridge.js --adapter claude --event sessionStart --session-id s1
  node scripts/workflow/adapter_hooks_bridge.js --adapter claude --hook PreToolUse --stdin-json

Options:
  --adapter <name>        Adapter id. Defaults to claude
  --event <name>          Normalized lifecycle event name
  --hook <name>           Raw hook name. Claude aliases map to lifecycle events
  --session-id <id>       Optional session id override
  --command <text>        Optional command/tool label
  --payload <json>        Inline JSON payload
  --stdin-json            Parse JSON payload from stdin
  --cwd <path>            Repo root override. Defaults to process cwd
  --json                  Print machine-readable output
`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.includes('help')) {
    printHelp();
    return;
  }
  const adapter = String(args.adapter || 'claude').trim().toLowerCase();
  const cwd = path.resolve(args.cwd || process.cwd());
  const rawPayload = args['stdin-json'] ? readStdin() : String(args.payload || '').trim();
  const parsed = parseJsonPayload(rawPayload);
  if (!parsed.ok) {
    const result = recordAdapterLifecycleEvent(cwd, adapter, {
      event: args.event,
      hook: args.hook,
      sessionId: args['session-id'],
      command: args.command,
      payload: {},
      source: 'adapter-hook-bridge',
    }, {
      hookSupport: buildHookSupport(adapter, args.hook),
    });
    result.ok = false;
    result.failureMode = 'event_parse_failed';
    result.error = parsed.error;
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`# ADAPTER HOOK BRIDGE\n\n- Adapter: \`${adapter}\`\n- Status: \`failed\`\n- Failure mode: \`event_parse_failed\``);
    return;
  }

  const result = recordAdapterLifecycleEvent(cwd, adapter, {
    event: args.event,
    hook: args.hook,
    sessionId: args['session-id'],
    command: args.command,
    payload: parsed.payload,
    source: 'adapter-hook-bridge',
  }, {
    hookSupport: buildHookSupport(adapter, args.hook),
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('# ADAPTER HOOK BRIDGE\n');
  console.log(`- Adapter: \`${result.adapter}\``);
  console.log(`- Status: \`${result.ok ? 'ok' : 'failed'}\``);
  if (result.failureMode) {
    console.log(`- Failure mode: \`${result.failureMode}\``);
  }
  if (result.ok) {
    console.log(`- Emitted events: \`${result.emittedEvents.join(', ')}\``);
    console.log(`- Lifecycle verified: \`${result.summary.lifecycleVerified ? 'yes' : 'no'}\``);
    console.log(`- Observed events: \`${result.summary.observedEvents.join(', ') || 'none'}\``);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  bridgeEventsPath,
  bridgeRoot,
  bridgeStatePath,
  bridgeSummaryPath,
  bridgeTelemetryPath,
  readAdapterBridgeSummary,
  readBridgeState,
  recordAdapterLifecycleEvent,
  runAdapterHookFromProcess,
};
