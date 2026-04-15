const LIFECYCLE_EVENTS = Object.freeze([
  'sessionStart',
  'beforeCommand',
  'afterCommand',
  'patchApplied',
  'verificationRequested',
  'sessionEnd',
]);

const ADAPTER_CONTRACTS = Object.freeze({
  claude: Object.freeze({
    adapter: 'claude',
    title: 'Claude Code',
    transport: 'file-jsonl-bridge',
    lifecycle: LIFECYCLE_EVENTS,
    requiredHooks: Object.freeze([
      'sessionStart',
      'beforeCommand',
      'afterCommand',
    ]),
    optionalHooks: Object.freeze([
      'patchApplied',
      'verificationRequested',
      'sessionEnd',
    ]),
    hookAliases: Object.freeze({
      SessionStart: 'sessionStart',
      sessionStart: 'sessionStart',
      session_start: 'sessionStart',
      'session-start': 'sessionStart',
      SessionEnd: 'sessionEnd',
      sessionEnd: 'sessionEnd',
      session_end: 'sessionEnd',
      'session-end': 'sessionEnd',
      PreToolUse: 'beforeCommand',
      preToolUse: 'beforeCommand',
      pre_tool_use: 'beforeCommand',
      'pre-tool-use': 'beforeCommand',
      PostToolUse: 'afterCommand',
      postToolUse: 'afterCommand',
      post_tool_use: 'afterCommand',
      'post-tool-use': 'afterCommand',
    }),
    patchPattern: /(apply(_patch)?|git\s+apply|patch-apply)/i,
    verificationPattern: /\b(verify|verification|test|lint|typecheck|build|check|playwright|vitest|jest|pytest|go test|cargo test|npm test|pnpm test|yarn test|bun test)\b/i,
  }),
});

function getAdapterContract(adapter = 'claude') {
  const key = String(adapter || 'claude').trim().toLowerCase();
  if (!ADAPTER_CONTRACTS[key]) {
    throw new Error(`Unknown adapter contract: ${adapter}`);
  }
  return ADAPTER_CONTRACTS[key];
}

function eventCountsTemplate(contract) {
  return Object.fromEntries(contract.lifecycle.map((eventName) => [eventName, 0]));
}

function emptyAdapterLifecycleState(adapter = 'claude') {
  const contract = getAdapterContract(adapter);
  return {
    adapter: contract.adapter,
    contractVersion: 1,
    generatedAt: new Date().toISOString(),
    updatedAt: null,
    eventCount: 0,
    counts: eventCountsTemplate(contract),
    latestByEvent: {},
    sessions: {},
    failures: [],
    telemetry: {
      successCount: 0,
      failureCount: 0,
    },
  };
}

function normalizeString(value, fallback = '') {
  const normalized = String(value == null ? fallback : value).trim();
  return normalized || fallback;
}

function commandText(event) {
  const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
  const argv = Array.isArray(payload.args)
    ? payload.args.join(' ')
    : Array.isArray(payload.argv)
      ? payload.argv.join(' ')
      : '';
  return [
    event.command,
    payload.command,
    payload.tool,
    payload.toolName,
    payload.commandName,
    argv,
  ].filter(Boolean).join(' ').trim();
}

function deriveSessionId(event) {
  const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
  return normalizeString(
    event.sessionId
      || payload.sessionId
      || payload.session
      || payload.threadId
      || payload.traceId
      || payload.requestId,
    'claude-session',
  );
}

function deriveLifecycleEvents(adapter, baseEvent) {
  const contract = getAdapterContract(adapter);
  const events = [{ ...baseEvent }];
  const command = commandText(baseEvent);
  if (['beforeCommand', 'afterCommand'].includes(baseEvent.event) && command) {
    if (contract.patchPattern.test(command)) {
      events.push({
        ...baseEvent,
        event: 'patchApplied',
        derivedFrom: baseEvent.event,
      });
    }
    if (contract.verificationPattern.test(command)) {
      events.push({
        ...baseEvent,
        event: 'verificationRequested',
        derivedFrom: baseEvent.event,
      });
    }
  }
  return events;
}

function normalizeLifecycleEvent(adapter, input = {}) {
  const contract = getAdapterContract(adapter);
  const rawHook = normalizeString(input.hook);
  const rawEvent = normalizeString(input.event || rawHook);
  const mappedEvent = contract.hookAliases[rawEvent] || rawEvent;
  if (!contract.lifecycle.includes(mappedEvent)) {
    return {
      ok: false,
      failureMode: 'event_parse_failed',
      error: `Unsupported lifecycle event: ${rawEvent || '<empty>'}`,
    };
  }

  const payload = input.payload && typeof input.payload === 'object'
    ? input.payload
    : {};
  const sessionId = deriveSessionId({ ...input, payload, event: mappedEvent });
  const baseEvent = {
    adapter: contract.adapter,
    event: mappedEvent,
    at: normalizeString(input.at, new Date().toISOString()),
    sessionId,
    hook: rawHook || null,
    command: normalizeString(input.command || payload.command || payload.tool || payload.toolName, ''),
    result: normalizeString(input.result || payload.result || payload.status, 'ok'),
    payload,
    source: normalizeString(input.source, 'adapter-hook-bridge'),
  };
  return {
    ok: true,
    event: baseEvent,
    derivedEvents: deriveLifecycleEvents(contract.adapter, baseEvent),
  };
}

function registerFailure(state, failureMode, detail, options = {}) {
  const next = state || emptyAdapterLifecycleState(options.adapter || 'claude');
  next.updatedAt = normalizeString(options.at, new Date().toISOString());
  next.telemetry.failureCount = Number(next.telemetry.failureCount || 0) + 1;
  next.failures = [
    ...(next.failures || []),
    {
      at: next.updatedAt,
      failureMode: normalizeString(failureMode, 'unknown_failure'),
      detail: normalizeString(detail, ''),
    },
  ].slice(-25);
  return next;
}

function applyLifecycleEvent(state, lifecycleEvent, options = {}) {
  const contract = getAdapterContract(options.adapter || lifecycleEvent.adapter || 'claude');
  const next = state || emptyAdapterLifecycleState(contract.adapter);
  const event = { ...lifecycleEvent };
  next.generatedAt = next.generatedAt || new Date().toISOString();
  next.updatedAt = event.at;
  next.eventCount = Number(next.eventCount || 0) + 1;
  next.telemetry.successCount = Number(next.telemetry.successCount || 0) + 1;
  next.counts = next.counts && typeof next.counts === 'object'
    ? next.counts
    : eventCountsTemplate(contract);
  next.counts[event.event] = Number(next.counts[event.event] || 0) + 1;
  next.latestByEvent = next.latestByEvent && typeof next.latestByEvent === 'object'
    ? next.latestByEvent
    : {};
  next.latestByEvent[event.event] = {
    at: event.at,
    sessionId: event.sessionId,
    command: event.command || null,
    result: event.result || 'ok',
    derivedFrom: event.derivedFrom || null,
  };

  const sessionId = deriveSessionId(event);
  const sessions = next.sessions && typeof next.sessions === 'object' ? next.sessions : {};
  const current = sessions[sessionId] || {
    sessionId,
    startedAt: null,
    endedAt: null,
    updatedAt: null,
    eventCount: 0,
    counts: eventCountsTemplate(contract),
    commands: [],
    lifecycleVerified: false,
  };
  current.updatedAt = event.at;
  current.eventCount += 1;
  current.counts[event.event] = Number(current.counts[event.event] || 0) + 1;
  if (event.event === 'sessionStart' && !current.startedAt) {
    current.startedAt = event.at;
  }
  if (event.event === 'sessionEnd') {
    current.endedAt = event.at;
  }
  if (event.command) {
    current.commands = [...current.commands, event.command].slice(-12);
  }
  current.lifecycleVerified = contract.requiredHooks.every((requiredEvent) => Number(current.counts[requiredEvent] || 0) > 0);
  sessions[sessionId] = current;
  next.sessions = sessions;
  return next;
}

function summarizeLifecycleState(adapter = 'claude', state = null, options = {}) {
  const contract = getAdapterContract(adapter);
  const current = state || emptyAdapterLifecycleState(contract.adapter);
  const sessions = Object.values(current.sessions || {});
  const observedEvents = contract.lifecycle.filter((eventName) => Number(current.counts?.[eventName] || 0) > 0);
  const verifiedSessions = sessions.filter((session) => session.lifecycleVerified);
  const missingRequiredEvents = contract.requiredHooks.filter((eventName) => Number(current.counts?.[eventName] || 0) === 0);
  const hookSupport = options.hookSupport && typeof options.hookSupport === 'object'
    ? options.hookSupport
    : {};
  const declaredHooks = Object.entries(hookSupport)
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key);
  const failureModes = new Set((current.failures || []).map((entry) => normalizeString(entry.failureMode)));
  if (declaredHooks.length === 0) {
    failureModes.add('hook_missing');
  }
  if (sessions.length > 0 && verifiedSessions.length === 0) {
    failureModes.add('partial_support');
  }
  if (sessions.length === 0 && declaredHooks.length > 0) {
    failureModes.add('hook_lifecycle_not_observed');
  }
  const latestSession = sessions
    .slice()
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0] || null;
  return {
    adapter: contract.adapter,
    title: contract.title,
    transport: contract.transport,
    lifecycle: contract.lifecycle,
    requiredHooks: contract.requiredHooks,
    optionalHooks: contract.optionalHooks,
    declaredHooks,
    observedEvents,
    sessionCount: sessions.length,
    verifiedSessionCount: verifiedSessions.length,
    lifecycleVerified: verifiedSessions.length > 0,
    partialSupport: sessions.length > 0 && verifiedSessions.length === 0,
    missingRequiredEvents,
    failureModes: [...failureModes].sort(),
    lastEventAt: current.updatedAt || null,
    latestSession: latestSession
      ? {
          sessionId: latestSession.sessionId,
          startedAt: latestSession.startedAt,
          endedAt: latestSession.endedAt,
          lifecycleVerified: latestSession.lifecycleVerified,
          observedEvents: contract.lifecycle.filter((eventName) => Number(latestSession.counts?.[eventName] || 0) > 0),
          commands: latestSession.commands || [],
        }
      : null,
    telemetry: {
      successCount: Number(current.telemetry?.successCount || 0),
      failureCount: Number(current.telemetry?.failureCount || 0),
    },
  };
}

module.exports = {
  ADAPTER_CONTRACTS,
  LIFECYCLE_EVENTS,
  applyLifecycleEvent,
  emptyAdapterLifecycleState,
  getAdapterContract,
  normalizeLifecycleEvent,
  registerFailure,
  summarizeLifecycleState,
};
