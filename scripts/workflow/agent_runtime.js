const fs = require('node:fs');
const path = require('node:path');
const { readTextIfExists } = require('./io/fs');
const { readJsonIfExists } = require('./io/json');
const { getAdapterContract } = require('./adapter_contract');
const { readAdapterBridgeSummary } = require('./adapter_hooks_bridge');

const PRIMARY_PRIORITY = Object.freeze({
  codex: 5,
  claude: 4,
  cursor: 3,
  aider: 2,
  generic: 0,
});

function exists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}


function relativePath(cwd, targetPath) {
  return path.relative(cwd, targetPath).replace(/\\/g, '/');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(safeArray(values).filter(Boolean))];
}

function listRelativeFiles(cwd, rootDir, options = {}) {
  if (!isDirectory(rootDir)) {
    return [];
  }
  const max = Number.isFinite(options.max) ? Math.max(1, Number(options.max)) : 12;
  const recursive = options.recursive !== false;
  const filter = typeof options.filter === 'function' ? options.filter : () => true;
  const files = [];
  const queue = [rootDir];
  while (queue.length > 0 && files.length < max) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          queue.push(fullPath);
        }
        continue;
      }
      if (entry.isFile() && filter(fullPath, entry)) {
        files.push(relativePath(cwd, fullPath));
      }
      if (files.length >= max) {
        break;
      }
    }
  }
  return files.sort();
}

function listTopLevelNames(rootDir, options = {}) {
  if (!isDirectory(rootDir)) {
    return [];
  }
  const max = Number.isFinite(options.max) ? Math.max(1, Number(options.max)) : 12;
  try {
    return fs.readdirSync(rootDir)
      .filter(Boolean)
      .slice(0, max)
      .sort();
  } catch {
    return [];
  }
}

function detectLevel(detected, features, score) {
  if (!detected) {
    return 'none';
  }
  const featureSet = new Set(safeArray(features));
  const verifiedHookLifecycle = featureSet.has('hook-lifecycle-verified');
  const observedHookLifecycle = featureSet.has('hook-lifecycle-observed');
  const structuralBridge = featureSet.has('mcp') || featureSet.has('workspace-tasks');
  const richNativeHooks = featureSet.has('hooks') && (
    featureSet.has('catalog')
    || featureSet.has('operator')
    || featureSet.has('profiles')
    || featureSet.has('agents')
    || featureSet.has('prompts')
    || featureSet.has('roles')
  );
  if ((verifiedHookLifecycle || structuralBridge || richNativeHooks) && score >= 4) {
    return 'operational';
  }
  if (observedHookLifecycle) {
    return 'hooked';
  }
  if (structuralBridge) {
    return 'integrated';
  }
  if (featureSet.has('hooks') || score >= 2) {
    return 'guided';
  }
  return 'signals';
}

function buildIntegration(detected, score, features, summary, missing, nextActions) {
  const normalizedFeatures = unique(features);
  return {
    score,
    maxScore: 5,
    level: detectLevel(detected, normalizedFeatures, score),
    summary,
    features: normalizedFeatures,
    missing: unique(missing),
    nextActions: unique(nextActions),
  };
}

function parseCodexConfig(configPath) {
  const text = readTextIfExists(configPath);
  if (!text) {
    return {
      model: '',
      profile: '',
      profiles: [],
      mcpServers: [],
      hooksEnabled: false,
    };
  }
  const model = ((text.match(/^model\s*=\s*"([^"]+)"/m) || [])[1] || '').trim();
  const profile = ((text.match(/^profile\s*=\s*"([^"]+)"/m) || [])[1] || '').trim();
  const hooksEnabled = /^codex_hooks\s*=\s*true/m.test(text);
  const profiles = unique([...text.matchAll(/^\[profiles\.([^\]]+)\]/gm)].map((match) => match[1]));
  const mcpServers = [];
  const sectionRegex = /^\[mcp_servers\.([^\]]+)\]$/gm;
  let match = sectionRegex.exec(text);
  while (match) {
    const name = match[1];
    const start = match.index + match[0].length;
    const next = sectionRegex.exec(text);
    const block = text.slice(start, next ? next.index : text.length);
    const transport = /(^|\n)\s*transport\s*=\s*"([^"]+)"/m.test(block)
      ? ((block.match(/(^|\n)\s*transport\s*=\s*"([^"]+)"/m) || [])[2] || '').trim()
      : /(^|\n)\s*command\s*=\s*"([^"]+)"/m.test(block)
        ? 'stdio'
        : /(^|\n)\s*url\s*=\s*"([^"]+)"/m.test(block)
          ? 'http'
          : 'unknown';
    mcpServers.push({ name, transport });
    match = next;
  }
  return {
    model,
    profile,
    profiles,
    mcpServers,
    hooksEnabled,
  };
}

function parseCodexHooks(cwd, hooksPath) {
  const payload = readJsonIfExists(hooksPath, {}) || {};
  const hookRoot = payload && typeof payload.hooks === 'object' ? payload.hooks : {};
  const events = Object.keys(hookRoot).sort();
  const eventHookCounts = {};
  const transports = new Set();
  let totalHooks = 0;
  for (const eventName of events) {
    const entries = safeArray(hookRoot[eventName]);
    let count = 0;
    for (const entry of entries) {
      const hooks = safeArray(entry && entry.hooks);
      count += hooks.length;
      for (const hook of hooks) {
        if (!hook || typeof hook !== 'object') {
          continue;
        }
        if (hook.transport) {
          transports.add(String(hook.transport));
        }
        if (hook.command) {
          transports.add('command');
        }
        if (hook.url) {
          transports.add('http');
        }
        if (hook.type) {
          transports.add(String(hook.type));
        }
      }
    }
    eventHookCounts[eventName] = count;
    totalHooks += count;
  }
  const hookFiles = listRelativeFiles(cwd, path.join(cwd, '.codex', 'hooks'), { max: 12 });
  return {
    events,
    totalHooks,
    eventHookCounts,
    transports: [...transports].sort(),
    hookFiles,
  };
}

function resolveClaudeCommandsDir(cwd, pluginManifest) {
  const configured = pluginManifest && typeof pluginManifest.commands === 'string'
    ? pluginManifest.commands.trim()
    : '';
  if (configured) {
    return path.resolve(cwd, configured);
  }
  return path.join(cwd, '.claude', 'commands');
}

function detectClaudeHooks(cwd, pluginManifest) {
  const hooksDir = path.join(cwd, '.claude', 'hooks');
  const manifestHooks = pluginManifest && typeof pluginManifest.hooks === 'object' ? pluginManifest.hooks : {};
  const sessionStart = Boolean(
    manifestHooks.SessionStart
    || manifestHooks.sessionStart
    || exists(path.join(hooksDir, 'session_start.js'))
    || exists(path.join(hooksDir, 'session-start.sh'))
  );
  const preToolUse = Boolean(
    manifestHooks.PreToolUse
    || manifestHooks.preToolUse
    || exists(path.join(hooksDir, 'pre_tool_use.js'))
    || exists(path.join(hooksDir, 'pre-tool-use.sh'))
  );
  const postToolUse = Boolean(
    manifestHooks.PostToolUse
    || manifestHooks.postToolUse
    || exists(path.join(hooksDir, 'post_tool_use.js'))
    || exists(path.join(hooksDir, 'post-tool-use.sh'))
  );
  const sessionEnd = Boolean(
    manifestHooks.SessionEnd
    || manifestHooks.sessionEnd
    || exists(path.join(hooksDir, 'session_end.js'))
    || exists(path.join(hooksDir, 'session-end.sh'))
  );
  return {
    sessionStart,
    preToolUse,
    postToolUse,
    sessionEnd,
    hooksDir: isDirectory(hooksDir) ? relativePath(cwd, hooksDir) : '',
    hookFiles: listRelativeFiles(cwd, hooksDir, { max: 12 }),
  };
}

function parseCursorMcp(cwd, mcpPath) {
  const payload = readJsonIfExists(mcpPath, null);
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const serverContainer = payload.servers && typeof payload.servers === 'object'
    ? payload.servers
    : payload.mcpServers && typeof payload.mcpServers === 'object'
      ? payload.mcpServers
      : payload;
  return Object.entries(serverContainer)
    .filter(([name, value]) => name && value && typeof value === 'object')
    .map(([name, value]) => ({
      name,
      transport: value.transport || (value.command ? 'stdio' : value.url ? 'http' : 'unknown'),
    }));
}

function parseVscodeTasks(tasksPath) {
  const payload = readJsonIfExists(tasksPath, null);
  const tasks = safeArray(payload && payload.tasks);
  return tasks.map((task) => ({
    label: task && typeof task.label === 'string' ? task.label : '',
    command: task && typeof task.command === 'string' ? task.command : '',
    type: task && typeof task.type === 'string' ? task.type : '',
  }));
}

function parseAiderConfig(configPath) {
  const text = readTextIfExists(configPath);
  if (!text) {
    return {
      keys: [],
      model: '',
      editFormat: '',
      booleanFlags: [],
    };
  }
  const keys = [];
  const booleanFlags = [];
  let model = '';
  let editFormat = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:/) || line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (!keyMatch) {
      continue;
    }
    const key = keyMatch[1];
    keys.push(key);
    if (!model && key === 'model') {
      const value = line.split(/[:=]/).slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
      model = value;
    }
    if (!editFormat && key === 'edit-format') {
      const value = line.split(/[:=]/).slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
      editFormat = value;
    }
    if (/\b(true|false)\b/i.test(line)) {
      booleanFlags.push(key);
    }
  }
  return {
    keys: unique(keys),
    model,
    editFormat,
    booleanFlags: unique(booleanFlags),
  };
}

function codexAdapter(cwd) {
  const codexRoot = path.join(cwd, '.codex');
  const hooksPath = path.join(cwd, '.codex', 'hooks.json');
  const configPath = path.join(cwd, '.codex', 'config.toml');
  const catalogPath = path.join(cwd, '.codex', 'catalog.json');
  const operatorPath = path.join(cwd, '.codex', 'operator');
  const agentsPath = path.join(cwd, '.codex', 'agents');
  const promptsPath = path.join(cwd, '.codex', 'prompts');
  const rolesPath = path.join(cwd, '.codex', 'roles');
  const detected = exists(codexRoot);
  const hooksSummary = parseCodexHooks(cwd, hooksPath);
  const configSummary = parseCodexConfig(configPath);
  const catalog = readJsonIfExists(catalogPath, {});
  const agentFiles = listRelativeFiles(cwd, agentsPath, { max: 12 });
  const promptFiles = listRelativeFiles(cwd, promptsPath, { max: 12 });
  const roleFiles = listRelativeFiles(cwd, rolesPath, { max: 12 });
  const signals = [
    exists(configPath) ? '.codex/config.toml' : null,
    exists(hooksPath) ? '.codex/hooks.json' : null,
    exists(catalogPath) ? '.codex/catalog.json' : null,
    exists(operatorPath) ? '.codex/operator/' : null,
    agentFiles.length > 0 ? '.codex/agents/' : null,
    promptFiles.length > 0 ? '.codex/prompts/' : null,
    roleFiles.length > 0 ? '.codex/roles/' : null,
  ].filter(Boolean);
  const hookAssetsPresent = {
    sessionStart: hookFilePresent(hooksSummary.hookFiles, 'session_start.js'),
    preToolUse: hookFilePresent(hooksSummary.hookFiles, 'pre_tool_use_policy.js'),
    postToolUse: hookFilePresent(hooksSummary.hookFiles, 'post_tool_use_review.js'),
    userPromptSubmit: hookFilePresent(hooksSummary.hookFiles, 'user_prompt_submit.js'),
    stop: hookFilePresent(hooksSummary.hookFiles, 'stop_continue.js'),
  };
  const hooks = {
    sessionStart: hooksSummary.events.includes('SessionStart'),
    preToolUse: hooksSummary.events.includes('PreToolUse'),
    postToolUse: hooksSummary.events.includes('PostToolUse'),
    userPromptSubmit: hooksSummary.events.includes('UserPromptSubmit'),
    stop: hooksSummary.events.includes('Stop'),
  };
  const score = [
    detected,
    hooksSummary.totalHooks > 0 || configSummary.hooksEnabled || Object.values(hookAssetsPresent).some(Boolean),
    exists(operatorPath) || exists(catalogPath),
    agentFiles.length > 0 || promptFiles.length > 0 || roleFiles.length > 0,
    configSummary.mcpServers.length > 0 || configSummary.profiles.length > 0 || Boolean(configSummary.profile),
  ].filter(Boolean).length;
  const features = [
    hooksSummary.totalHooks > 0 ? 'hooks' : null,
    Object.values(hookAssetsPresent).some(Boolean) ? 'hook-assets' : null,
    exists(operatorPath) ? 'operator' : null,
    exists(catalogPath) ? 'catalog' : null,
    configSummary.mcpServers.length > 0 ? 'mcp' : null,
    agentFiles.length > 0 ? 'agents' : null,
    promptFiles.length > 0 ? 'prompts' : null,
    roleFiles.length > 0 ? 'roles' : null,
    configSummary.profiles.length > 0 ? 'profiles' : null,
  ].filter(Boolean);
  const missing = [
    hooksSummary.totalHooks > 0
      ? null
      : Object.values(hookAssetsPresent).some(Boolean)
        ? 'Codex hook assets are present but not registered yet'
        : 'No Codex hook assets detected',
    configSummary.mcpServers.length > 0 ? null : 'No MCP servers declared in .codex/config.toml',
    agentFiles.length + promptFiles.length + roleFiles.length > 0 ? null : 'No reusable native prompt or role packs detected',
  ].filter(Boolean);
  const nextActions = [
    hooksSummary.totalHooks > 0
      ? null
      : Object.values(hookAssetsPresent).some(Boolean)
        ? 'Run `rai hooks enable` to register .codex/hooks.json when you want automatic session hooks'
        : 'Seed native hook assets under .codex/hooks/',
    configSummary.mcpServers.length > 0 ? null : 'Declare stdio or remote MCP servers in .codex/config.toml',
    exists(operatorPath) ? null : 'Add an operator runbook or cockpit layer under .codex/operator',
  ].filter(Boolean);
  const nativeProfile = catalog && typeof catalog.nativeProfile === 'string' && catalog.nativeProfile
    ? catalog.nativeProfile
    : configSummary.profile;
  return {
    id: 'codex',
    title: 'Codex',
    detected,
    signals,
    hooks,
    integration: buildIntegration(
      detected,
      score,
      features,
      hooksSummary.totalHooks > 0
        ? `Native Codex layer with ${hooksSummary.totalHooks} hook${hooksSummary.totalHooks === 1 ? '' : 's'}, ${configSummary.mcpServers.length} MCP server${configSummary.mcpServers.length === 1 ? '' : 's'}, and ${agentFiles.length + promptFiles.length + roleFiles.length} reusable prompt/role asset${agentFiles.length + promptFiles.length + roleFiles.length === 1 ? '' : 's'}.`
        : Object.values(hookAssetsPresent).some(Boolean)
          ? 'Codex footprint detected; hook assets are installed but remain disabled until .codex/hooks.json is registered.'
          : 'Codex footprint detected, but native event hooks are not wired yet.',
      missing,
      nextActions,
    ),
    context: {
      catalog: exists(catalogPath) ? relativePath(cwd, catalogPath) : '',
      hooks: exists(hooksPath) ? relativePath(cwd, hooksPath) : '',
      config: exists(configPath) ? relativePath(cwd, configPath) : '',
      operator: exists(operatorPath) ? relativePath(cwd, operatorPath) : '',
      model: configSummary.model,
      nativeProfile,
      profiles: configSummary.profiles,
      mcpServers: configSummary.mcpServers,
      hookEvents: hooksSummary.events,
      hookCount: hooksSummary.totalHooks,
      hookEventCounts: hooksSummary.eventHookCounts,
      hookFiles: hooksSummary.hookFiles,
      hookAssetsPresent,
      hookTransports: hooksSummary.transports,
      agentCount: agentFiles.length,
      agents: agentFiles,
      promptCount: promptFiles.length,
      prompts: promptFiles,
      roleCount: roleFiles.length,
      roles: roleFiles,
    },
  };
}

function hookFilePresent(files, suffix) {
  return safeArray(files).some((filePath) => filePath.endsWith(suffix));
}

function adapterFailureMessage(failureMode) {
  switch (String(failureMode || '').trim()) {
    case 'hook_missing':
      return 'No Claude hook bridge detected';
    case 'hook_lifecycle_not_observed':
      return 'Claude hook lifecycle has not been observed yet';
    case 'event_parse_failed':
      return 'Claude hook payload could not be parsed';
    case 'partial_support':
      return 'Claude hook lifecycle is only partially supported';
    case 'transport_connect_failed':
      return 'Claude hook transport could not connect to the repo-local bridge';
    default:
      return '';
  }
}

function summarizeClaudeLifecycle(summary, hooksDeclared) {
  if (!hooksDeclared) {
    return 'Hook lifecycle bridge is not declared yet.';
  }
  if (summary.lifecycleVerified) {
    return `Hook lifecycle verified across ${summary.verifiedSessionCount} session${summary.verifiedSessionCount === 1 ? '' : 's'} with ${summary.observedEvents.length} observed event${summary.observedEvents.length === 1 ? '' : 's'}.`;
  }
  if (summary.partialSupport) {
    const missingRequired = summary.missingRequiredEvents.length > 0
      ? ` Missing required events: ${summary.missingRequiredEvents.join(', ')}.`
      : '';
    return `Hook lifecycle observed but only partially supported.${missingRequired}`;
  }
  if (summary.observedEvents.length > 0) {
    return `Hook lifecycle observed (${summary.observedEvents.join(', ')}), but the required session chain is not yet verified.`;
  }
  return 'Hooks are declared, but no lifecycle event has been observed yet.';
}

function claudeAdapter(cwd) {
  const claudeRoot = path.join(cwd, '.claude');
  const pluginPath = path.join(cwd, '.claude-plugin', 'plugin.json');
  const marketplacePath = path.join(cwd, '.claude-plugin', 'marketplace.json');
  const agentsMarketplacePath = path.join(cwd, '.agents', 'plugins', 'marketplace.json');
  const pluginManifest = readJsonIfExists(pluginPath, {}) || {};
  const commandsDir = resolveClaudeCommandsDir(cwd, pluginManifest);
  const commandFiles = listRelativeFiles(cwd, commandsDir, {
    max: 12,
    filter: (filePath) => /\.(md|mdx|txt)$/i.test(filePath),
  });
  const hooksSummary = detectClaudeHooks(cwd, pluginManifest);
  const hooks = {
    sessionStart: hooksSummary.sessionStart,
    preToolUse: hooksSummary.preToolUse,
    postToolUse: hooksSummary.postToolUse,
    sessionEnd: hooksSummary.sessionEnd,
  };
  const hooksDeclared = Object.values(hooks).some(Boolean);
  const bridge = readAdapterBridgeSummary(cwd, 'claude', { hookSupport: hooks });
  const hookLifecycle = bridge.summary;
  const contract = getAdapterContract('claude');
  const marketplace = readJsonIfExists(marketplacePath, null) || readJsonIfExists(agentsMarketplacePath, null);
  const marketplacePlugins = safeArray(marketplace && marketplace.plugins).map((plugin) => plugin && plugin.name).filter(Boolean);
  const detected = exists(claudeRoot) || exists(path.join(cwd, '.claude-plugin'));
  const signals = [
    exists(claudeRoot) ? '.claude/' : null,
    exists(pluginPath) ? '.claude-plugin/plugin.json' : null,
    commandFiles.length > 0 ? relativePath(cwd, commandsDir).replace(/\/?$/, '/') : null,
    exists(marketplacePath) ? '.claude-plugin/marketplace.json' : null,
    exists(agentsMarketplacePath) ? '.agents/plugins/marketplace.json' : null,
    hooksSummary.hooksDir ? `${hooksSummary.hooksDir}/` : null,
    hookLifecycle.lifecycleVerified ? bridge.paths.summary : null,
  ].filter(Boolean);
  const score = [
    detected,
    exists(pluginPath),
    commandFiles.length > 0,
    marketplacePlugins.length > 0 || exists(marketplacePath) || exists(agentsMarketplacePath),
    hookLifecycle.lifecycleVerified,
  ].filter(Boolean).length;
  const features = [
    exists(pluginPath) ? 'plugin-manifest' : null,
    commandFiles.length > 0 ? 'commands' : null,
    marketplacePlugins.length > 0 || exists(marketplacePath) || exists(agentsMarketplacePath) ? 'plugin-marketplace' : null,
    hooksDeclared ? 'hooks' : null,
    hookLifecycle.observedEvents.length > 0 ? 'hook-lifecycle-observed' : null,
    hookLifecycle.lifecycleVerified ? 'hook-lifecycle-verified' : null,
  ].filter(Boolean);
  const missing = [
    commandFiles.length > 0 ? null : 'No Claude slash-command pack detected',
    exists(pluginPath) ? null : 'No Claude plugin manifest detected',
    hooksDeclared ? null : 'No Claude hook bridge detected',
    hooksDeclared && !hookLifecycle.lifecycleVerified
      ? hookLifecycle.partialSupport
        ? 'Claude hook lifecycle is only partially supported'
        : hookLifecycle.observedEvents.length > 0
          ? 'Claude hook lifecycle is observed but not yet verified'
          : 'Claude hook lifecycle has not been observed yet'
      : null,
    ...safeArray(hookLifecycle.failureModes).map(adapterFailureMessage),
  ].filter(Boolean);
  const nextActions = [
    exists(pluginPath) ? null : 'Add .claude-plugin/plugin.json so the command pack is discoverable',
    commandFiles.length > 0 ? null : 'Add reusable slash-command markdown under .claude/commands',
    hooksDeclared ? null : 'Install repo-local Claude hook wrappers for SessionStart / PreToolUse / PostToolUse / SessionEnd',
    hooksDeclared && !hookLifecycle.lifecycleVerified
      ? hookLifecycle.observedEvents.length > 0
        ? `Exercise the missing Claude lifecycle events (${hookLifecycle.missingRequiredEvents.join(', ') || 'sessionStart, beforeCommand, afterCommand'}) so readiness becomes verified`
        : 'Run one Claude session through SessionStart, PreToolUse, PostToolUse, and SessionEnd so lifecycle verification can be recorded'
      : null,
    safeArray(hookLifecycle.failureModes).includes('event_parse_failed')
      ? `Inspect ${bridge.paths.events} and the Claude hook payload format for malformed JSON`
      : null,
  ].filter(Boolean);
  const integrationSummary = hookLifecycle.lifecycleVerified
    ? `Claude adapter with ${commandFiles.length} reusable command${commandFiles.length === 1 ? '' : 's'} and a verified hook lifecycle.`
    : commandFiles.length > 0
      ? `Claude command pack with ${commandFiles.length} reusable command${commandFiles.length === 1 ? '' : 's'}. ${summarizeClaudeLifecycle(hookLifecycle, hooksDeclared)}`
      : `Claude files are present, but the command surface is still shallow. ${summarizeClaudeLifecycle(hookLifecycle, hooksDeclared)}`;
  return {
    id: 'claude',
    title: 'Claude Code',
    detected,
    signals,
    hooks,
    integration: buildIntegration(
      detected,
      score,
      features,
      integrationSummary,
      missing,
      nextActions,
    ),
    context: {
      plugin: exists(pluginPath) ? relativePath(cwd, pluginPath) : '',
      marketplace: exists(marketplacePath)
        ? relativePath(cwd, marketplacePath)
        : exists(agentsMarketplacePath)
          ? relativePath(cwd, agentsMarketplacePath)
          : '',
      pluginName: typeof pluginManifest.name === 'string' ? pluginManifest.name : '',
      pluginVersion: typeof pluginManifest.version === 'string' ? pluginManifest.version : '',
      commandsDir: isDirectory(commandsDir) ? relativePath(cwd, commandsDir) : '',
      commandCount: commandFiles.length,
      commands: commandFiles,
      marketplacePlugins,
      hookDir: hooksSummary.hooksDir,
      hookFiles: hooksSummary.hookFiles,
      hookBridge: bridge.paths,
      hookLifecycle,
      adapterContract: {
        transport: contract.transport,
        lifecycle: contract.lifecycle,
        requiredHooks: contract.requiredHooks,
        optionalHooks: contract.optionalHooks,
      },
    },
  };
}

function cursorAdapter(cwd) {
  const cursorRoot = path.join(cwd, '.cursor');
  const rulesDir = path.join(cursorRoot, 'rules');
  const mcpPath = path.join(cursorRoot, 'mcp.json');
  const vscodeDir = path.join(cwd, '.vscode');
  const tasksPath = path.join(vscodeDir, 'tasks.json');
  const settingsPath = path.join(vscodeDir, 'settings.json');
  const ruleFiles = listRelativeFiles(cwd, rulesDir, {
    max: 12,
    filter: (filePath) => /\.(md|mdc|txt|json)$/i.test(filePath),
  });
  const mcpServers = parseCursorMcp(cwd, mcpPath);
  const tasks = parseVscodeTasks(tasksPath);
  const settings = readJsonIfExists(settingsPath, {}) || {};
  const settingsKeys = Object.keys(settings).slice(0, 12).sort();
  const detected = exists(cursorRoot) || exists(vscodeDir);
  const signals = [
    exists(cursorRoot) ? '.cursor/' : null,
    ruleFiles.length > 0 ? '.cursor/rules/' : null,
    exists(mcpPath) ? '.cursor/mcp.json' : null,
    exists(vscodeDir) ? '.vscode/' : null,
    exists(tasksPath) ? '.vscode/tasks.json' : null,
    exists(settingsPath) ? '.vscode/settings.json' : null,
  ].filter(Boolean);
  const hooks = {
    sessionStart: false,
    preToolUse: false,
    postToolUse: false,
    sessionEnd: false,
  };
  const score = [
    detected,
    ruleFiles.length > 0,
    mcpServers.length > 0,
    tasks.length > 0,
    settingsKeys.length > 0,
  ].filter(Boolean).length;
  const features = [
    ruleFiles.length > 0 ? 'rules' : null,
    mcpServers.length > 0 ? 'mcp' : null,
    tasks.length > 0 ? 'workspace-tasks' : null,
    settingsKeys.length > 0 ? 'editor-settings' : null,
  ].filter(Boolean);
  const missing = [
    ruleFiles.length > 0 ? null : 'No Cursor rules detected under .cursor/rules',
    mcpServers.length > 0 ? null : 'No Cursor MCP server manifest detected',
    tasks.length > 0 ? null : 'No VS Code or Cursor task shortcuts detected',
  ].filter(Boolean);
  const nextActions = [
    ruleFiles.length > 0 ? null : 'Add .cursor/rules guidance for reusable repo prompts',
    mcpServers.length > 0 ? null : 'Declare Cursor MCP servers in .cursor/mcp.json',
    tasks.length > 0 ? null : 'Add .vscode/tasks.json shortcuts for common Raiola flows',
  ].filter(Boolean);
  return {
    id: 'cursor',
    title: 'Cursor',
    detected,
    signals,
    hooks,
    integration: buildIntegration(
      detected,
      score,
      features,
      detected
        ? `Cursor editor surface with ${ruleFiles.length} rule${ruleFiles.length === 1 ? '' : 's'}, ${mcpServers.length} MCP server${mcpServers.length === 1 ? '' : 's'}, and ${tasks.length} workspace task${tasks.length === 1 ? '' : 's'}.`
        : 'Cursor editor files are not present in this repo.',
      missing,
      nextActions,
    ),
    context: {
      rulesDir: isDirectory(rulesDir) ? relativePath(cwd, rulesDir) : '',
      rulesCount: ruleFiles.length,
      rules: ruleFiles,
      mcp: exists(mcpPath) ? relativePath(cwd, mcpPath) : '',
      mcpServers,
      taskFile: exists(tasksPath) ? relativePath(cwd, tasksPath) : '',
      taskCount: tasks.length,
      tasks: tasks.slice(0, 8),
      settings: exists(settingsPath) ? relativePath(cwd, settingsPath) : '',
      settingsKeys,
    },
  };
}

function aiderAdapter(cwd) {
  const configPath = exists(path.join(cwd, '.aider.conf.yml'))
    ? path.join(cwd, '.aider.conf.yml')
    : path.join(cwd, '.aider.conf.yaml');
  const detected = exists(configPath);
  const config = parseAiderConfig(configPath);
  const ioKeys = config.keys.filter((key) => /read|file|history|message/i.test(key));
  const automationKeys = config.keys.filter((key) => /watch|auto|commit|lint|test|map/i.test(key));
  const score = [
    detected,
    Boolean(config.model || config.editFormat),
    automationKeys.length > 0,
    ioKeys.length > 0,
    config.booleanFlags.length > 0,
  ].filter(Boolean).length;
  const features = [
    Boolean(config.model || config.editFormat) ? 'model-config' : null,
    automationKeys.length > 0 ? 'automation-flags' : null,
    ioKeys.length > 0 ? 'io-controls' : null,
    config.booleanFlags.length > 0 ? 'boolean-flags' : null,
  ].filter(Boolean);
  const missing = [
    detected ? null : 'No Aider config file detected',
    config.model ? null : 'No explicit Aider model detected',
    automationKeys.length > 0 ? null : 'No automation-oriented Aider settings detected',
  ].filter(Boolean);
  const nextActions = [
    detected ? null : 'Add .aider.conf.yml for repo-local Aider defaults',
    config.model ? null : 'Pin an Aider model in the repo-local config',
    automationKeys.length > 0 ? null : 'Add watch, lint, test, or map-tokens style controls to the Aider config',
  ].filter(Boolean);
  return {
    id: 'aider',
    title: 'Aider',
    detected,
    signals: [
      exists(path.join(cwd, '.aider.conf.yml')) ? '.aider.conf.yml' : null,
      exists(path.join(cwd, '.aider.conf.yaml')) ? '.aider.conf.yaml' : null,
    ].filter(Boolean),
    hooks: {
      sessionStart: false,
      preToolUse: false,
      postToolUse: false,
      sessionEnd: false,
    },
    integration: buildIntegration(
      detected,
      score,
      features,
      detected
        ? `Aider config with ${config.keys.length} declared key${config.keys.length === 1 ? '' : 's'}${config.model ? ` and model \`${config.model}\`` : ''}.`
        : 'Aider is not configured for this repo.',
      missing,
      nextActions,
    ),
    context: {
      config: detected ? relativePath(cwd, configPath) : '',
      keys: config.keys,
      model: config.model,
      editFormat: config.editFormat,
      booleanFlags: config.booleanFlags,
    },
  };
}

function genericAdapter() {
  return {
    id: 'generic',
    title: 'Generic Agent Runtime',
    detected: true,
    signals: [],
    hooks: {
      sessionStart: false,
      preToolUse: false,
      postToolUse: false,
      sessionEnd: false,
    },
    integration: {
      score: 0,
      maxScore: 5,
      level: 'fallback',
      summary: 'Fallback runtime used when no named adapter is deeply integrated.',
      features: [],
      missing: ['No named agent runtime detected'],
      nextActions: ['Install or wire a named adapter when repo-native automation depth is required'],
    },
    context: {},
  };
}

function listAdapters(cwd) {
  return [
    codexAdapter(cwd),
    claudeAdapter(cwd),
    cursorAdapter(cwd),
    aiderAdapter(cwd),
    genericAdapter(cwd),
  ];
}

function adapterSortValue(adapter) {
  return (adapter && adapter.integration ? adapter.integration.score : 0) * 10 + (PRIMARY_PRIORITY[adapter.id] || 0);
}

function detectPrimaryAdapter(cwd) {
  const adapters = listAdapters(cwd);
  const detected = adapters.filter((adapter) => adapter.detected && adapter.id !== 'generic');
  const primary = detected.length > 0
    ? detected.slice().sort((left, right) => adapterSortValue(right) - adapterSortValue(left))[0]
    : adapters[adapters.length - 1];
  return {
    primary,
    adapters,
    adapterCount: detected.length,
    multiRuntime: detected.length > 1,
  };
}

function buildRuntimeDepthSummary(adapters) {
  const detectedAdapters = adapters.filter((adapter) => adapter.detected && adapter.id !== 'generic');
  const mcpTransports = unique(
    detectedAdapters.flatMap((adapter) => safeArray(adapter.context && adapter.context.mcpServers).map((entry) => entry && entry.transport))
  );
  const lifecycleVerifiedAdapters = detectedAdapters
    .filter((adapter) => Boolean(adapter.context?.hookLifecycle?.lifecycleVerified))
    .map((adapter) => adapter.id);
  const partialSupportAdapters = detectedAdapters
    .filter((adapter) => Boolean(adapter.context?.hookLifecycle?.partialSupport))
    .map((adapter) => adapter.id);
  const adapterFailureModes = Object.fromEntries(
    detectedAdapters
      .map((adapter) => [adapter.id, unique(safeArray(adapter.context?.hookLifecycle?.failureModes))])
      .filter(([, failureModes]) => failureModes.length > 0)
  );
  return {
    detectedAdapters: detectedAdapters.map((adapter) => adapter.id),
    operationalAdapters: detectedAdapters.filter((adapter) => adapter.integration.level === 'operational').map((adapter) => adapter.id),
    hookedAdapters: detectedAdapters.filter((adapter) => adapter.integration.level === 'hooked').map((adapter) => adapter.id),
    guidedAdapters: detectedAdapters.filter((adapter) => ['guided', 'signals'].includes(adapter.integration.level)).map((adapter) => adapter.id),
    integratedAdapters: detectedAdapters.filter((adapter) => ['integrated', 'hooked', 'operational'].includes(adapter.integration.level)).map((adapter) => adapter.id),
    hookCapableAdapters: detectedAdapters.filter((adapter) => Object.values(adapter.hooks || {}).some(Boolean) || Object.values(adapter.context?.hookAssetsPresent || {}).some(Boolean)).map((adapter) => adapter.id),
    lifecycleVerifiedAdapters,
    partialSupportAdapters,
    adapterFailureModes,
    mcpTransports,
  };
}

function buildRuntimeContract(cwd) {
  const detected = detectPrimaryAdapter(cwd);
  return {
    type: 'AgentRuntimeContract',
    generatedAt: new Date().toISOString(),
    primary: detected.primary.id,
    primaryTitle: detected.primary.title,
    primaryScore: detected.primary.integration ? detected.primary.integration.score : 0,
    adapterCount: detected.adapterCount,
    multiRuntime: detected.multiRuntime,
    depthSummary: buildRuntimeDepthSummary(detected.adapters),
    adapters: detected.adapters.map((adapter) => ({
      id: adapter.id,
      title: adapter.title,
      detected: adapter.detected,
      signals: adapter.signals,
      hooks: adapter.hooks,
      integration: adapter.integration,
      context: adapter.context,
    })),
  };
}

module.exports = {
  buildRuntimeContract,
  detectPrimaryAdapter,
  listAdapters,
};
