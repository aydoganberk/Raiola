const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { resolveWorkflowRoot } = require('./common');
const {
  ensureDir,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const { analyzeIntent } = require('./intent_engine');
const { selectCodexProfile } = require('./codex_profile_engine');
const { buildConfigSpec, deriveNativePolicy, nativeAgentDefinitions } = require('./codex_native');
const { buildRepoControlPayload } = require('./repo_control');
const { buildMonorepoControlPayload } = require('./monorepo_control');
const { buildFrontendControlPayload } = require('./frontend_control');
const { buildSafetyControlPayload } = require('./safety_control');
const { buildTrustCenterPayload } = require('./trust_center');
const { buildReleaseControlPayload } = require('./release_control');
const { buildHandoffPayload } = require('./handoff');
const { buildCodexContextPack } = require('./context_pack');
const {
  buildCodexPromptPack,
  buildResumeCard,
  doPlanSubagents,
} = require('./codex_control_packets');
const { nowIso, relativePath, writeJsonFile } = require('./roadmap_os');

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'codex-control');
}

function telemetryDir(cwd) {
  return path.join(runtimeDir(cwd), 'telemetry');
}

function cockpitDir(cwd) {
  return path.join(runtimeDir(cwd), 'cockpit');
}

function missionsDir(cwd) {
  return path.join(runtimeDir(cwd), 'missions');
}

function scopeName(args = {}) {
  if (args.global) {
    return 'global';
  }
  if (args.local) {
    return 'local';
  }
  return 'repo';
}

function tomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => tomlValue(entry)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(String(value ?? ''));
}

function renderSection(name, entries = {}) {
  const lines = [`[${name}]`];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  return lines.join('\n');
}

function goalText(args = {}) {
  const tail = Array.isArray(args._) ? args._.slice(1).join(' ') : '';
  return String(args.goal || tail || 'operate this repository natively with Codex').trim();
}

function stableHash(value, length = 12) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, length);
}

function normalizeGoal(goal = '') {
  return String(goal || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function truncateText(value, max = 220) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readControlPayloadOrBuild(cwd, fileName, builder, args = {}) {
  const reportPath = path.join(cwd, '.workflow', 'reports', fileName);
  const existing = readJsonFile(reportPath, null);
  if (existing) {
    return existing;
  }
  try {
    return builder(cwd, resolveWorkflowRoot(cwd, args.root), { ...args, refresh: false });
  } catch {
    return null;
  }
}

function summarizeRepoControlForOperator(payload) {
  if (!payload) {
    return null;
  }
  return {
    verdict: payload.verdict || 'unknown',
    repoShape: payload.packageGraph?.repoShape || 'unknown',
    packageCount: Number(payload.packageGraph?.packageCount || 0),
    hotspotCount: (payload.hotspots || []).length,
    topHotspot: payload.hotspots?.[0] || null,
    findings: payload.repoHealth?.findingCounts || { total: 0, verified: 0, probable: 0, heuristic: 0 },
    command: 'rai repo-control --json',
  };
}

function summarizeMonorepoControlForOperator(payload) {
  if (!payload) {
    return null;
  }
  return {
    verdict: payload.verdict || 'unknown',
    repoShape: payload.repoShape || 'unknown',
    packageCount: Number(payload.monorepo?.packageCount || 0),
    blastRadius: payload.blastRadius || { verdict: 'unknown', impactedPackageCount: 0, impactedWorkspaceCount: 0 },
    waveCount: Number(payload.campaign?.waves?.length || 0),
    topWave: payload.campaign?.waves?.[0] || null,
    bottlenecks: (payload.topology?.rootBottlenecks || []).length,
    command: 'rai monorepo-control --json',
  };
}

function summarizeFrontendControlForOperator(payload) {
  if (!payload) {
    return null;
  }
  return {
    verdict: payload.verdict || 'unknown',
    detected: Boolean(payload.frontend?.detected),
    framework: payload.frontend?.framework || 'unknown',
    uiSystem: payload.frontend?.uiSystem || 'unknown',
    routeCount: Number(payload.frontend?.routeCount || 0),
    designDebt: payload.designDebt || { total: 0, high: 0, medium: 0, low: 0 },
    browserArtifacts: Number(payload.browserEvidence?.artifactCount || 0),
    command: 'rai frontend-control --json',
  };
}

function summarizeSafetyControlForOperator(payload) {
  if (!payload) {
    return null;
  }
  return {
    verdict: payload.verdict || 'unknown',
    secureVerdict: payload.security?.verdict || 'unknown',
    doctorFails: Number(payload.recovery?.doctor?.failCount || 0),
    healthFails: Number(payload.recovery?.health?.failCount || 0),
    repairActions: Number(payload.recovery?.repair?.safeActionCount || 0),
    topForecast: payload.failureForecast?.[0] || null,
    command: 'rai safety-control --json',
  };
}

function commandBucket(command = '') {
  const text = String(command || '').trim();
  if (!text) {
    return null;
  }
  const first = text.split(/\s+/)[0] || '';
  return first || null;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function requiresWorktree(goal = '', analysis = {}, policy = {}) {
  const text = String(goal || '').toLowerCase();
  return Boolean(
    policy.repoSignals?.monorepo
    || policy.locked
    || /large repo|monorepo|repo audit|full repo|release|ship|review|migration|cross-cutting|many packages/.test(text)
    || analysis.chosenCapability?.domain === 'review'
    || analysis.chosenCapability?.domain === 'research'
  );
}

function chooseSubagents(goal = '', analysis = {}, policy = {}) {
  const available = new Map(nativeAgentDefinitions().map((agent) => [agent.file.replace(/\.toml$/, ''), agent]));
  const picked = [];
  const push = (name, reason) => {
    if (!available.has(name) || picked.some((entry) => entry.id === name)) {
      return;
    }
    const agent = available.get(name);
    picked.push({
      id: name,
      name: agent.name || name,
      file: `.codex/agents/${agent.file}`,
      reason,
    });
  };

  const domain = analysis.chosenCapability?.domain || '';
  const text = String(goal || '').toLowerCase();

  push('pr-explorer', 'Start with a read-only scout so the change surface is explicit before editing.');
  push('operator-supervisor', 'Use a dedicated supervisor for long or multi-surface work so planning, handoff, and escalation stay deterministic.');

  if (domain === 'review' || /review|audit|regression|bug|correctness/.test(text)) {
    push('reviewer', 'Deep review work benefits from a correctness-first reviewer.');
  }
  if (policy.repoSignals?.monorepo || /large repo|monorepo|packages|workspace|repo audit/.test(text)) {
    push('monorepo-planner', 'Large repos need shard planning and bounded write scopes before edits widen.');
  }
  if (policy.repoSignals?.frontend || /ui|frontend|browser|dashboard|design/.test(text)) {
    push('browser-debugger', 'Frontend work should reproduce the behavior in the browser before patching.');
    push('ui-fixer', 'After reproduction, keep the UI patch small and verification-specific.');
  }
  if (policy.strict || /release|ship|merge|approval|risk|safe/.test(text)) {
    push('trust-analyst', 'Trust posture is elevated, so operator policy should be inspected directly.');
    push('release-gatekeeper', 'Release and merge decisions should flow through a dedicated gatekeeper.');
  }
  if (/automation|schedule|daily|nightly|worktree|background/.test(text)) {
    push('automation-curator', 'Recurring work benefits from explicit automation and worktree guidance.');
  }
  push('docs-researcher', 'Documentation verification keeps native Codex behavior and APIs grounded.');

  return picked;
}

function buildSessionGenome(cwd, rootDir, goal, analysis = {}, nativePolicy = {}, codexProfile = {}, usingWorktree = false) {
  const repoFingerprint = stableHash({
    workflowRoot: relativePath(cwd, rootDir),
    repoSignals: nativePolicy.repoSignals || {},
    repoShape: nativePolicy.repoConfig?.repoShape || nativePolicy.repoSignals?.repoShape || 'unknown',
    roles: (nativePolicy.roles || []).map((role) => role.name || role.summary || String(role)),
  });
  const goalFingerprint = stableHash(normalizeGoal(goal));
  const policyFingerprint = stableHash({
    profile: nativePolicy.selectedProfile,
    approvalPolicy: nativePolicy.approvalPolicy,
    sandboxMode: nativePolicy.sandboxMode,
    networkAccess: nativePolicy.networkAccess,
    strict: nativePolicy.strict,
    locked: nativePolicy.locked,
    riskLevel: nativePolicy.riskLevel,
  });
  const routeFingerprint = stableHash({
    capability: analysis.chosenCapability?.id || 'unknown',
    codexProfile: codexProfile.id || 'unknown',
    usingWorktree,
    verificationPlan: analysis.verificationPlan || [],
  });
  return {
    id: `cx-${stableHash({ repoFingerprint, goalFingerprint, policyFingerprint, routeFingerprint }, 16)}`,
    repoFingerprint,
    goalFingerprint,
    policyFingerprint,
    routeFingerprint,
    label: `${analysis.chosenCapability?.id || 'operate'}::${codexProfile.id || 'profile'}`,
  };
}

function pickPreferredEntrypoint(goal = '', analysis = {}, nativePolicy = {}, codexProfile = {}, usingWorktree = false) {
  const text = String(goal || '').toLowerCase();
  const domain = analysis.chosenCapability?.domain || '';
  if (nativePolicy.repoSignals?.frontend && /ui|browser|preview|dashboard|screen|design/.test(text)) {
    return 'app-server';
  }
  if (domain === 'verify' && !usingWorktree) {
    return 'exec';
  }
  if (domain === 'execute' && codexProfile.contextDepth === 'delta' && !usingWorktree) {
    return 'exec';
  }
  if (/automation|nightly|daily|recurring|scheduled/.test(text)) {
    return 'ephemeral-exec';
  }
  if (usingWorktree || domain === 'review' || codexProfile.mode === 'research') {
    return 'interactive';
  }
  return 'interactive';
}

function buildToolBudget(codexProfile = {}, nativePolicy = {}, analysis = {}, selectedSubagents = []) {
  const contextBudget = {
    minimal: { preset: 'compact', attachments: 8, focusFiles: 8 },
    delta: { preset: 'compact', attachments: 12, focusFiles: 12 },
    focused: { preset: 'balanced', attachments: 20, focusFiles: 16 },
    full: { preset: 'deep', attachments: 28, focusFiles: 22 },
  }[codexProfile.contextDepth || 'delta'] || { preset: 'compact', attachments: 12, focusFiles: 12 };
  const turnsBeforeCheckpoint = {
    low: 8,
    medium: 12,
    high: 18,
    extra_high: 24,
  }[codexProfile.reasoningEffort || 'medium'] || 12;
  const verifyCycles = {
    light: 1,
    standard: 2,
    strict: 3,
  }[codexProfile.verifyPolicy || 'standard'] || 2;
  const riskLevel = nativePolicy.riskLevel || analysis.risk?.level || 'low';
  return {
    recommendedContextPreset: contextBudget.preset,
    maxReadAttachments: contextBudget.attachments,
    maxFocusFiles: contextBudget.focusFiles,
    maxTurnsBeforeCheckpoint: turnsBeforeCheckpoint,
    verifyCycles,
    maxParallelAgents: Math.max(1, Math.min(selectedSubagents.length || 1, nativePolicy.agentsMaxThreads || 1)),
    maxAgentDepth: nativePolicy.agentsMaxDepth || 1,
    writeCheckpointAfterSlices: nativePolicy.strict || nativePolicy.locked ? 1 : 3,
    shellMutation: nativePolicy.sandboxMode === 'read-only'
      ? 'none'
      : nativePolicy.strict || ['high', 'critical'].includes(riskLevel)
        ? 'single-slice'
        : 'bounded',
    network: nativePolicy.networkAccess ? 'enabled' : 'restricted',
  };
}

function buildDecisionLadders(goal = '', analysis = {}, nativePolicy = {}, usingWorktree = false) {
  const ladders = [
    {
      when: 'missing-context',
      do: `Run \`rai codex contextpack --goal ${JSON.stringify(goal)}\` and reopen the task with the compact preset before widening scope.`,
    },
    {
      when: 'verification-fails',
      do: 'Stop widening scope, reproduce the failing command, narrow the patch, and rerun the route-specific verification steps first.',
    },
  ];
  if (usingWorktree) {
    ladders.push({
      when: 'materialization-risk',
      do: 'Stay in the dedicated worktree, validate in a fresh worktree, and only materialize exact file outputs after the recheck passes.',
    });
  }
  if (nativePolicy.strict || nativePolicy.locked || /release|ship|merge|approval/.test(String(goal || '').toLowerCase())) {
    ladders.push({
      when: 'approval-or-ship-gate',
      do: 'Refresh `rai trust`, `rai release-control`, and `rai handoff` before any approval, merge, or ship call.',
    });
  }
  if (!nativePolicy.networkAccess) {
    ladders.push({
      when: 'network-needed',
      do: 'Request approval or switch to a profile where network access is intentionally enabled instead of silently retrying.',
    });
  }
  return ladders;
}

function buildExecutionEnvelope(goal = '', analysis = {}, nativePolicy = {}, codexProfile = {}, usingWorktree = false, selectedSubagents = [], commands = {}) {
  const preferredEntrypoint = pickPreferredEntrypoint(goal, analysis, nativePolicy, codexProfile, usingWorktree);
  const launchCommandByEntrypoint = {
    interactive: commands.interactive,
    exec: commands.exec,
    'ephemeral-exec': commands.ephemeralExec,
    'app-server': commands.appServer,
  };
  return {
    operatorMode: codexProfile.mode || 'implement',
    preferredEntrypoint,
    preferredLaunchCommand: launchCommandByEntrypoint[preferredEntrypoint] || commands.interactive,
    mutationPolicy: usingWorktree
      ? 'worktree-validated-materialization'
      : nativePolicy.strict || nativePolicy.locked
        ? 'plan-before-write'
        : 'bounded-local-write',
    closeoutProtocol: nativePolicy.strict || nativePolicy.locked || /release|ship|merge/.test(String(goal || '').toLowerCase())
      ? 'trust-release-handoff'
      : 'verify-and-checkpoint',
    concurrency: {
      maxParallelAgents: Math.max(1, Math.min(selectedSubagents.length || 1, nativePolicy.agentsMaxThreads || 1)),
      maxDepth: nativePolicy.agentsMaxDepth || 1,
      policy: codexProfile.subagentPolicy || 'off',
    },
    verification: {
      policy: codexProfile.verifyPolicy || 'standard',
      commands: analysis.verificationPlan || [],
    },
    continuity: {
      worktree: usingWorktree,
      checkpointCadence: nativePolicy.strict || nativePolicy.locked ? 'every-write' : 'every-slice',
      resumeSurface: 'rai codex cockpit --goal "..." && rai codex telemetry --json',
    },
  };
}

function buildPromptFragments(goal = '', packet = {}) {
  const slashLead = (packet.slashFlow || []).slice(0, 4).map((entry) => `${entry.surface}:${entry.command}`).join(' → ');
  const verification = (packet.routing?.verificationPlan || []).slice(0, 4).join(' | ') || 'route-specific verification not declared yet';
  return {
    sessionPrimer: `Session genome ${packet.sessionGenome?.id || 'cx-unknown'}. Goal: ${goal}. Use ${packet.executionEnvelope?.preferredEntrypoint || 'interactive'} mode and open with ${slashLead || 'cli:/status → cli:/permissions'}.`,
    firstWriteGate: `Before the first write, restate the target files, worktree posture, and verification contract: ${verification}.`,
    closeout: packet.executionEnvelope?.closeoutProtocol === 'trust-release-handoff'
      ? 'Before stopping, refresh trust/release/handoff surfaces and name the next safest command if anything remains blocked.'
      : 'Before stopping, summarize touched files, verification evidence, and the next safest follow-up command.',
  };
}

function buildManagedRequirementsSpec(cwd, args = {}) {
  const configSpec = buildConfigSpec(cwd, args);
  const policy = deriveNativePolicy(cwd, args);
  const strictMode = Boolean(policy.locked || policy.strict);

  const prefixRules = [
    {
      pattern: [{ token: 'rm' }],
      decision: 'forbidden',
      justification: 'Prefer git-aware cleanup and reviewable deletes over blind removal.',
    },
    {
      pattern: [{ token: 'git' }, { any_of: ['push', 'commit', 'rebase', 'reset'] }],
      decision: 'prompt',
      justification: 'Require an explicit operator checkpoint before mutating git history or publishing changes.',
    },
  ];

  if (!policy.networkAccess || strictMode) {
    prefixRules.push({
      pattern: [{ any_of: ['curl', 'wget', 'npm', 'pnpm', 'yarn', 'pip', 'cargo'] }],
      decision: 'prompt',
      justification: 'Network and dependency mutations should stay explicit under the Raiola operator layer.',
    });
  }

  const allowedApprovals = policy.locked
    ? ['untrusted']
    : strictMode
      ? ['untrusted', 'on-request']
      : ['untrusted', 'on-request'];
  const allowedSandboxModes = policy.locked
    ? ['read-only']
    : strictMode
      ? ['read-only', 'workspace-write']
      : ['read-only', 'workspace-write'];

  const mcpServers = {};
  for (const [serverName, serverValues] of Object.entries(configSpec.mcpServers || {})) {
    if (serverValues.command) {
      mcpServers[serverName] = {
        identity: { command: serverValues.command },
      };
    } else if (serverValues.url) {
      mcpServers[serverName] = {
        identity: { url: serverValues.url },
      };
    }
  }

  return {
    generatedAt: nowIso(),
    policy,
    allowed_approval_policies: allowedApprovals,
    allowed_sandbox_modes: allowedSandboxModes,
    allowed_web_search_modes: ['cached'],
    features: {
      codex_hooks: true,
      raiola_operator_telemetry: true,
    },
    rules: {
      prefix_rules: prefixRules,
    },
    mcp_servers: mcpServers,
  };
}

function renderManagedRequirementsToml(spec) {
  const lines = [
    '# Generated by rai codex managed-export',
    '# Template for system- or cloud-managed Codex requirements.',
    `allowed_approval_policies = ${tomlValue(spec.allowed_approval_policies)}`,
    `allowed_sandbox_modes = ${tomlValue(spec.allowed_sandbox_modes)}`,
    `allowed_web_search_modes = ${tomlValue(spec.allowed_web_search_modes)}`,
    '',
    renderSection('features', spec.features),
    '',
  ];

  if (spec.rules?.prefix_rules?.length) {
    lines.push('[rules]');
    const formatted = spec.rules.prefix_rules.map((rule) => {
      const pattern = `[${rule.pattern.map((token) => {
        if (token.token) {
          return `{ token = ${tomlValue(token.token)} }`;
        }
        return `{ any_of = ${tomlValue(token.any_of)} }`;
      }).join(', ')}]`;
      return `{ pattern = ${pattern}, decision = ${tomlValue(rule.decision)}, justification = ${tomlValue(rule.justification)} }`;
    });
    lines.push(`prefix_rules = [\n  ${formatted.join(',\n  ')}\n]`);
    lines.push('');
  }

  for (const [serverName, serverValues] of Object.entries(spec.mcp_servers || {})) {
    lines.push(renderSection(`mcp_servers.${serverName}.identity`, serverValues.identity));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function writeManagedExportFiles(cwd, spec) {
  const exportDir = path.join(cwd, '.workflow', 'exports', 'codex');
  ensureDir(exportDir);
  const tomlPath = path.join(exportDir, 'managed-requirements.toml');
  const readmePath = path.join(exportDir, 'managed-requirements.README.md');
  writeIfChanged(tomlPath, renderManagedRequirementsToml(spec));
  writeIfChanged(readmePath, [
    '# Managed Codex Requirements Export',
    '',
    'This file is an export template for system-level or cloud-managed `requirements.toml` deployment.',
    'It is **not** applied automatically from the repository root.',
    '',
    '## Suggested deployment targets',
    '',
    '- Cloud-managed Codex requirements for ChatGPT Business / Enterprise',
    '- `/etc/codex/requirements.toml` on trusted CI or developer machines',
    '',
    '## Generated from',
    '',
    `- Active Raiola profile: \`${spec.policy.selectedProfile}\``,
    `- Approval posture: \`${spec.policy.approvalPolicy}\``,
    `- Sandbox posture: \`${spec.policy.sandboxMode}\``,
    '- Telemetry feature: `raiola_operator_telemetry = true`',
  ].join('\n').trimEnd() + '\n');
  return {
    tomlFile: relativePath(cwd, tomlPath),
    readmeFile: relativePath(cwd, readmePath),
  };
}

function buildOperatorPacket(cwd, args = {}) {
  const goal = goalText(args);
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const codexProfile = selectCodexProfile({ analysis });
  const nativePolicy = deriveNativePolicy(cwd, args);
  const usingWorktree = requiresWorktree(goal, analysis, nativePolicy);
  const selectedSubagents = chooseSubagents(goal, analysis, nativePolicy);
  const skillSuggestions = [
    'using-raiola',
    'raiola-native-operator',
    'raiola-codex-cockpit',
    nativePolicy.repoSignals?.monorepo ? 'raiola-repo-control-room' : null,
    nativePolicy.repoSignals?.monorepo ? 'raiola-monorepo-control-room' : null,
    nativePolicy.repoSignals?.monorepo ? 'raiola-workspace-impact-planner' : null,
    nativePolicy.repoSignals?.frontend ? 'raiola-frontend-control-room' : null,
    nativePolicy.repoSignals?.monorepo ? 'raiola-large-repo-optimizer' : null,
    nativePolicy.repoSignals?.frontend ? 'raiola-release-gate' : null,
    nativePolicy.strict || nativePolicy.locked || /security|secure|risk|repair|incident|drift|stabilize|failure|recover|hardening|harden/.test(goal.toLowerCase()) ? 'raiola-safety-control-room' : null,
    /release|ship|merge|gate/.test(goal.toLowerCase()) ? 'raiola-release-gate' : null,
    /automation|daily|nightly|schedule|worktree/.test(goal.toLowerCase()) ? 'raiola-automation-curator' : null,
    /telemetry|observability|hook|flight recorder/.test(goal.toLowerCase()) ? 'raiola-native-telemetry' : null,
  ].filter(Boolean);

  const commands = {
    interactive: `CODEX_HOME=$(pwd)/.codex codex --profile ${nativePolicy.selectedProfile}`,
    prompt: `CODEX_HOME=$(pwd)/.codex codex ${JSON.stringify(goal)}`,
    exec: `CODEX_HOME=$(pwd)/.codex codex exec --profile ${nativePolicy.selectedProfile} ${JSON.stringify(goal)}`,
    ephemeralExec: `CODEX_HOME=$(pwd)/.codex codex exec --profile ${nativePolicy.selectedProfile} --ephemeral ${JSON.stringify(goal)}`,
    mcpServer: 'CODEX_HOME=$(pwd)/.codex codex mcp-server',
    appServer: 'CODEX_HOME=$(pwd)/.codex codex app-server --listen ws://127.0.0.1:4500',
    remoteTui: 'CODEX_HOME=$(pwd)/.codex codex --remote ws://127.0.0.1:4500',
    agentsSdkPipeline: 'python .codex/operator/agents-sdk/codex_operator_pipeline.py',
    evalRunner: 'node .codex/operator/evals/run_skill_evals.mjs',
    managedExport: 'rai codex managed-export --json',
    telemetry: 'rai codex telemetry --json',
    repoControl: 'rai repo-control --json',
    workspaceImpact: 'rai workspace-impact --json',
    monorepoControl: 'rai monorepo-control --json',
    frontendControl: 'rai frontend-control --json',
    safetyControl: 'rai safety-control --json',
    cockpit: `rai codex cockpit --goal ${JSON.stringify(goal)} --json`,
  };

  const slashFlow = [
    {
      surface: 'cli',
      command: '/status',
      why: 'Check thread state and context usage before widening the session.',
    },
    {
      surface: 'cli',
      command: '/permissions',
      why: nativePolicy.strict || nativePolicy.locked
        ? 'Confirm the tightened permission posture before editing.'
        : 'Change permissions intentionally instead of drifting into a looser sandbox.',
    },
    {
      surface: 'cli',
      command: '/agent',
      why: 'Spawn or switch to bounded subagents for review, mapping, or UI debugging.',
    },
    {
      surface: 'app',
      command: '/mcp',
      why: 'Verify that the docs and Raiola MCP surfaces are connected before delegating work.',
    },
    {
      surface: 'app',
      command: '/review',
      why: 'Use the built-in review surface before merge or release-facing actions.',
    },
    {
      surface: 'app',
      command: '/plan-mode',
      why: 'For large or ambiguous tasks, force a planning pass before implementation.',
    },
  ];

  const firstPartySurfaces = {
    githubReview: '@codex review',
    githubAction: 'openai/codex-action@v1',
    exec: 'codex exec',
    mcpServer: 'codex mcp-server',
    appServer: 'codex app-server',
  };

  const repoControl = summarizeRepoControlForOperator(readControlPayloadOrBuild(cwd, 'repo-control-room.json', buildRepoControlPayload, args));
  const monorepoControl = summarizeMonorepoControlForOperator(readControlPayloadOrBuild(cwd, 'monorepo-control-room.json', buildMonorepoControlPayload, args));
  const frontendControl = summarizeFrontendControlForOperator(readControlPayloadOrBuild(cwd, 'frontend-control-room.json', buildFrontendControlPayload, args));
  const safetyControl = summarizeSafetyControlForOperator(readControlPayloadOrBuild(cwd, 'safety-control-room.json', buildSafetyControlPayload, args));
  const sessionGenome = buildSessionGenome(cwd, rootDir, goal, analysis, nativePolicy, codexProfile, usingWorktree);
  const toolBudget = buildToolBudget(codexProfile, nativePolicy, analysis, selectedSubagents);
  const executionEnvelope = buildExecutionEnvelope(goal, analysis, nativePolicy, codexProfile, usingWorktree, selectedSubagents, commands);
  const decisionLadders = buildDecisionLadders(goal, analysis, nativePolicy, usingWorktree);

  const files = {
    config: '.codex/config.toml',
    hooks: '.codex/hooks.json',
    policy: '.codex/raiola-policy.json',
    operatorGuide: '.codex/operator/README.md',
    cockpitGuide: '.codex/operator/cockpit/README.md',
    telemetryGuide: '.codex/operator/telemetry/README.md',
    repoControlGuide: '.codex/operator/repo-control/README.md',
    monorepoControlGuide: '.codex/operator/monorepo-control/README.md',
    frontendControlGuide: '.codex/operator/frontend-control/README.md',
    safetyControlGuide: '.codex/operator/safety-control/README.md',
    agentsSdkGuide: '.codex/operator/agents-sdk/README.md',
    pipeline: '.codex/operator/agents-sdk/codex_operator_pipeline.py',
    evalsGuide: '.codex/operator/evals/README.md',
    evalRunner: '.codex/operator/evals/run_skill_evals.mjs',
    managedGuide: '.codex/managed/README.md',
    telemetryStream: '.workflow/runtime/codex-control/telemetry/events.jsonl',
    telemetrySummary: '.workflow/runtime/codex-control/telemetry.json',
  };

  const packet = {
    action: 'operator',
    scope: scopeName(args),
    rootDir,
    goal,
    generatedAt: nowIso(),
    nativeProfile: nativePolicy.selectedProfile,
    codexProfile,
    sessionGenome,
    policy: {
      approvalPolicy: nativePolicy.approvalPolicy,
      sandboxMode: nativePolicy.sandboxMode,
      networkAccess: nativePolicy.networkAccess,
      strict: nativePolicy.strict,
      locked: nativePolicy.locked,
      riskLevel: nativePolicy.riskLevel,
    },
    routing: {
      capability: analysis.chosenCapability,
      reasons: analysis.chosenCapability?.reasons || [],
      verificationPlan: analysis.verificationPlan || [],
    },
    slashFlow,
    firstPartySurfaces,
    commands,
    repoControl,
    monorepoControl,
    frontendControl,
    safetyControl,
    subagents: selectedSubagents,
    skills: skillSuggestions,
    executionEnvelope,
    toolBudget,
    decisionLadders,
    automation: {
      recommended: usingWorktree,
      executionMode: usingWorktree ? 'dedicated-worktree' : 'local-project',
      handoff: usingWorktree ? 'validated-materialization' : 'direct-session',
      maxParallelBranches: Math.max(1, Math.min(selectedSubagents.length || 1, nativePolicy.agentsMaxThreads || 1)),
      safetyInvariants: usingWorktree
        ? ['clean-target-before-merge', 'fresh-worktree-validation', 'exact-file-materialization']
        : ['local-session-bounded-by-profile'],
      suggestedPrompt: usingWorktree
        ? `Review ${goal} in a dedicated worktree, validate the handoff in a fresh worktree, and only materialize exact file outputs when there are no findings.`
        : `Run ${goal} in the current project when you want the automation to work directly in the main checkout.`,
    },
    files,
  };
  packet.promptFragments = buildPromptFragments(goal, packet);
  return packet;
}

function renderOperatorMarkdown(cwd, packet) {
  const lines = [
    '# CODEX OPERATOR LAYER',
    '',
    `- Goal: \`${packet.goal}\``,
    `- Session genome: \`${packet.sessionGenome?.id || 'cx-unknown'}\``,
    `- Native profile: \`${packet.nativeProfile}\``,
    `- Routed Codex profile: \`${packet.codexProfile.id}\``,
    `- Approval policy: \`${packet.policy.approvalPolicy}\``,
    `- Sandbox mode: \`${packet.policy.sandboxMode}\``,
    `- Network access: \`${packet.policy.networkAccess ? 'workspace-write enabled' : 'restricted'}\``,
    `- Risk level: \`${packet.policy.riskLevel}\``,
    '',
    '## Native entrypoints',
    '',
    `- Preferred: \`${packet.executionEnvelope?.preferredEntrypoint || 'interactive'}\` -> \`${packet.executionEnvelope?.preferredLaunchCommand || packet.commands.interactive}\``,
    `- Interactive: \`${packet.commands.interactive}\``,
    `- One-shot: \`${packet.commands.prompt}\``,
    `- Exec: \`${packet.commands.exec}\``,
    `- MCP server: \`${packet.commands.mcpServer}\``,
    `- App server: \`${packet.commands.appServer}\``,
    `- Cockpit: \`${packet.commands.cockpit}\``,
    `- Telemetry: \`${packet.commands.telemetry}\``,
    `- Repo control: \`${packet.commands.repoControl}\``,
    `- Workspace impact: \`${packet.commands.workspaceImpact}\``,
    `- Monorepo control: \`${packet.commands.monorepoControl}\``,
    `- Frontend control: \`${packet.commands.frontendControl}\``,
    `- Safety control: \`${packet.commands.safetyControl}\``,
    '',
    '## Repo-native control rooms',
    '',
    `- Repo control: \`${packet.repoControl?.verdict || 'n/a'}\` / shape=\`${packet.repoControl?.repoShape || 'unknown'}\` / hotspots=\`${packet.repoControl?.hotspotCount || 0}\``,
    `- Monorepo control: \`${packet.monorepoControl?.verdict || 'n/a'}\` / blast=\`${packet.monorepoControl?.blastRadius?.verdict || 'unknown'}\` / waves=\`${packet.monorepoControl?.waveCount || 0}\` / bottlenecks=\`${packet.monorepoControl?.bottlenecks || 0}\``,
    `- Frontend control: \`${packet.frontendControl?.verdict || 'n/a'}\` / framework=\`${packet.frontendControl?.framework || 'unknown'}\` / routes=\`${packet.frontendControl?.routeCount || 0}\` / browser=\`${packet.frontendControl?.browserArtifacts || 0}\``,
    `- Safety control: \`${packet.safetyControl?.verdict || 'n/a'}\` / secure=\`${packet.safetyControl?.secureVerdict || 'unknown'}\` / doctor-fails=\`${packet.safetyControl?.doctorFails || 0}\` / repairs=\`${packet.safetyControl?.repairActions || 0}\``,
    '',
    '## Slash flow',
    '',
    ...packet.slashFlow.map((entry) => `- \`${entry.surface}:${entry.command}\` -> ${entry.why}`),
    '',
    '## Recommended subagents',
    '',
    ...(packet.subagents.length
      ? packet.subagents.map((entry) => `- \`${entry.name}\` -> ${entry.reason}`)
      : ['- `No extra subagent routing was inferred.`']),
    '',
    '## Tool budget',
    '',
    `- Context preset: \`${packet.toolBudget?.recommendedContextPreset || 'compact'}\``,
    `- Max attachments: \`${packet.toolBudget?.maxReadAttachments || 0}\``,
    `- Max focus files: \`${packet.toolBudget?.maxFocusFiles || 0}\``,
    `- Max turns before checkpoint: \`${packet.toolBudget?.maxTurnsBeforeCheckpoint || 0}\``,
    `- Verify cycles: \`${packet.toolBudget?.verifyCycles || 0}\``,
    `- Max parallel agents: \`${packet.toolBudget?.maxParallelAgents || 1}\``,
    '',
    '## Decision ladder',
    '',
    ...(packet.decisionLadders || []).map((entry) => `- \`${entry.when}\` -> ${entry.do}`),
    '',
    '## Skills for explicit invocation',
    '',
    ...packet.skills.map((entry) => `- \`${entry}\``),
    '',
    '## Automation posture',
    '',
    `- Mode: \`${packet.automation.executionMode}\``,
    `- Handoff: \`${packet.automation.handoff}\``,
    `- Safety invariants: \`${(packet.automation.safetyInvariants || []).join(', ') || 'none'}\``,
    `- Suggested automation prompt: \`${packet.automation.suggestedPrompt}\``,
    '',
    '## Prompt fragments',
    '',
    `- Session primer: \`${packet.promptFragments?.sessionPrimer || ''}\``,
    `- First-write gate: \`${packet.promptFragments?.firstWriteGate || ''}\``,
    `- Closeout: \`${packet.promptFragments?.closeout || ''}\``,
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function doOperator(cwd, args = {}) {
  const packet = buildOperatorPacket(cwd, args);
  const jsonPath = path.join(runtimeDir(cwd), 'operator.json');
  const markdownPath = path.join(runtimeDir(cwd), 'operator.md');
  ensureDir(path.dirname(jsonPath));
  writeJsonFile(jsonPath, packet);
  writeIfChanged(markdownPath, renderOperatorMarkdown(cwd, packet));
  return {
    ...packet,
    file: relativePath(cwd, jsonPath),
    markdownFile: relativePath(cwd, markdownPath),
  };
}

function renderSessionPrompt(payload) {
  const focusFiles = payload.focusFiles.length > 0
    ? payload.focusFiles.map((item) => `- ${item}`).join('\n')
    : '- No explicit focus files inferred yet';
  const verification = payload.verificationPlan.length > 0
    ? payload.verificationPlan.map((item) => `- ${item}`).join('\n')
    : '- Route-specific verification is still lightweight';
  const ladders = (payload.decisionLadders || []).map((entry) => `- ${entry.when}: ${entry.do}`).join('\n');
  return [
    `Session genome: ${payload.sessionGenome.id}`,
    `Goal: ${payload.goal}`,
    `Preferred entrypoint: ${payload.preferredEntrypoint}`,
    '',
    payload.promptFragments.sessionPrimer,
    payload.promptFragments.firstWriteGate,
    '',
    'Focus files:',
    focusFiles,
    '',
    'Verification plan:',
    verification,
    '',
    'Decision ladder:',
    ladders || '- missing-context: run the context pack first',
    '',
    `Closeout: ${payload.promptFragments.closeout}`,
  ].join('\n').trimEnd() + '\n';
}

function renderSlashGuide(operator) {
  return [
    '# Slash Flow',
    '',
    `- Session genome: \`${operator.sessionGenome?.id || 'cx-unknown'}\``,
    '',
    ...operator.slashFlow.map((entry, index) => `${index + 1}. \`${entry.surface}:${entry.command}\` -> ${entry.why}`),
    '',
    'Use the early slash commands to pin context, permissions, and subagent posture before the first write.',
  ].join('\n').trimEnd() + '\n';
}

function renderAutomationBrief(operator, plan) {
  const suggestedPlan = (plan?.suggestedPlan || []).slice(0, 8);
  return [
    '# Automation Brief',
    '',
    `- Mode: \`${operator.automation.executionMode}\``,
    `- Handoff: \`${operator.automation.handoff}\``,
    `- Max parallel branches: \`${operator.automation.maxParallelBranches || 1}\``,
    `- Closeout protocol: \`${operator.executionEnvelope?.closeoutProtocol || 'verify-and-checkpoint'}\``,
    '',
    '## Safety invariants',
    '',
    ...(operator.automation.safetyInvariants || []).map((item) => `- \`${item}\``),
    '',
    '## Suggested subagent slices',
    '',
    ...(suggestedPlan.length > 0
      ? suggestedPlan.map((item) => `- \`${item.owner}\` -> ${item.focus} [${item.mode}] (${item.scope})`)
      : ['- `No explicit parallel slice was inferred.`']),
    '',
    '## Suggested automation prompt',
    '',
    operator.automation.suggestedPrompt,
  ].join('\n').trimEnd() + '\n';
}

function renderCockpitMarkdown(payload) {
  return [
    '# CODEX COCKPIT',
    '',
    `- Goal: \`${payload.goal}\``,
    `- Session genome: \`${payload.sessionGenome.id}\``,
    `- Native profile: \`${payload.nativeProfile}\``,
    `- Preferred entrypoint: \`${payload.preferredEntrypoint}\``,
    `- Telemetry command: \`${payload.telemetry.command}\``,
    '',
    '## Kit contents',
    '',
    `- Operator packet: \`${payload.operator.file}\``,
    `- Prompt pack: \`${payload.promptPack.file}\``,
    `- Context pack: \`${payload.contextPack.file}\``,
    `- Managed export: \`${payload.managedExport.file}\``,
    `- Resume card: \`${payload.resumeCard.file}\``,
    '',
    '## Launchers',
    '',
    ...Object.entries(payload.launchers).map(([name, file]) => `- \`${name}\` -> \`${file}\``),
    '',
    '## Focus files',
    '',
    ...(payload.focusFiles.length > 0 ? payload.focusFiles.map((item) => `- \`${item}\``) : ['- `No explicit focus files inferred.`']),
    '',
    '## Suggested reads',
    '',
    ...(payload.suggestedReads.length > 0 ? payload.suggestedReads.map((item) => `- \`${item}\``) : ['- `No suggested reads recorded.`']),
    '',
    '## Verification',
    '',
    ...(payload.verificationPlan.length > 0 ? payload.verificationPlan.map((item) => `- \`${item}\``) : ['- `No explicit verification plan yet.`']),
    '',
    '## Next closeout surfaces',
    '',
    ...(payload.closeoutCommands || []).map((item) => `- \`${item}\``),
  ].join('\n').trimEnd() + '\n';
}

function shellScript(command, commentLines = []) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    ...commentLines.map((line) => `# ${line}`),
    command,
    '',
  ].join('\n');
}

function writeExecutable(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
  fs.chmodSync(filePath, 0o755);
}

function buildCockpitPacket(cwd, args = {}) {
  const goal = goalText(args);
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const profile = selectCodexProfile({ analysis });
  const operator = doOperator(cwd, args);
  const managedExport = doManagedExport(cwd, args);
  const promptPack = buildCodexPromptPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
  });
  const contextPack = buildCodexContextPack(cwd, rootDir, goal, analysis, profile, {
    taste: args.taste ? String(args.taste).trim() : '',
    page: args.page ? String(args.page).trim() : '',
    writeFiles: true,
  });
  const resumeCard = buildResumeCard(cwd, rootDir);
  const plan = doPlanSubagents(cwd, args);

  const kitDir = cockpitDir(cwd);
  const launchDir = path.join(kitDir, 'launch');
  ensureDir(launchDir);

  const launcherTargets = {
    preferred: operator.executionEnvelope.preferredLaunchCommand,
    interactive: operator.commands.interactive,
    prompt: operator.commands.prompt,
    exec: operator.commands.exec,
    ephemeralExec: operator.commands.ephemeralExec,
    appServer: operator.commands.appServer,
    remoteTui: operator.commands.remoteTui,
    agentsSdk: operator.commands.agentsSdkPipeline,
    evals: operator.commands.evalRunner,
    telemetry: operator.commands.telemetry,
    managedExport: operator.commands.managedExport,
  };

  const launchers = {};
  for (const [name, command] of Object.entries(launcherTargets)) {
    const filePath = path.join(launchDir, `${name}.sh`);
    writeExecutable(filePath, shellScript(command, [
      `Raiola Codex cockpit launcher: ${name}`,
      `Session genome: ${operator.sessionGenome.id}`,
      `Goal: ${truncateText(goal, 140)}`,
    ]));
    launchers[name] = relativePath(cwd, filePath);
  }

  const sessionPromptPath = path.join(kitDir, 'session-prompt.txt');
  const slashGuidePath = path.join(kitDir, 'slash-flow.md');
  const automationPath = path.join(kitDir, 'automation.md');
  const readmePath = path.join(kitDir, 'README.md');
  const manifestPath = path.join(kitDir, 'manifest.json');

  const payload = {
    action: 'cockpit',
    scope: scopeName(args),
    rootDir,
    goal,
    generatedAt: nowIso(),
    nativeProfile: operator.nativeProfile,
    codexProfile: operator.codexProfile,
    sessionGenome: operator.sessionGenome,
    preferredEntrypoint: operator.executionEnvelope.preferredEntrypoint,
    operator: {
      file: operator.file,
      markdownFile: operator.markdownFile,
    },
    promptPack: {
      file: promptPack.file,
      jsonFile: promptPack.jsonFile,
    },
    contextPack: {
      file: contextPack.file,
      jsonFile: contextPack.jsonFile,
      attachments: contextPack.attachments.length,
      compactAttachmentPaths: contextPack.budgetPresets?.compact?.attachmentPaths || [],
    },
    managedExport: {
      file: managedExport.file,
      readmeFile: managedExport.readmeFile,
    },
    resumeCard: {
      file: resumeCard.file,
    },
    subagentPlan: {
      file: plan.promptPack,
      suggestedPlan: plan.suggestedPlan || [],
    },
    focusFiles: (contextPack.focusFiles || []).slice(0, 16),
    suggestedReads: (contextPack.budgetPresets?.compact?.attachmentPaths || []).slice(0, 16),
    verificationPlan: operator.routing?.verificationPlan || [],
    decisionLadders: operator.decisionLadders || [],
    promptFragments: operator.promptFragments || {},
    launchers,
    telemetry: {
      command: operator.commands.telemetry,
      eventsFile: relativePath(cwd, path.join(telemetryDir(cwd), 'events.jsonl')),
      latestSessionFile: relativePath(cwd, path.join(telemetryDir(cwd), 'latest-session.json')),
    },
    closeoutCommands: uniqueStrings([
      'rai trust --json',
      'rai release-control --json',
      'rai handoff --json',
      'rai codex telemetry --json',
      'rai next',
    ]),
  };

  writeIfChanged(sessionPromptPath, renderSessionPrompt(payload));
  writeIfChanged(slashGuidePath, renderSlashGuide(operator));
  writeIfChanged(automationPath, renderAutomationBrief(operator, plan));

  payload.sessionPromptFile = relativePath(cwd, sessionPromptPath);
  payload.slashGuideFile = relativePath(cwd, slashGuidePath);
  payload.automationFile = relativePath(cwd, automationPath);
  payload.file = relativePath(cwd, manifestPath);
  payload.markdownFile = relativePath(cwd, readmePath);

  writeJsonFile(manifestPath, payload);
  writeIfChanged(readmePath, renderCockpitMarkdown(payload));

  return payload;
}


function doCockpit(cwd, args = {}) {
  return buildCockpitPacket(cwd, args);
}

function missionSlug(goal = '', sessionGenomeId = '') {
  const words = String(goal || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 8)
    .join('-');
  return `${words || 'codex-mission'}-${String(sessionGenomeId || stableHash(goal || 'mission', 6)).slice(0, 6)}`;
}

function missionRiskFlags(nativePolicy = {}, analysis = {}, trustCenter = {}, releaseControl = {}, handoff = {}) {
  const flags = [];
  const push = (flag) => {
    if (flag && !flags.includes(flag)) {
      flags.push(flag);
    }
  };
  if (nativePolicy.locked) {
    push('locked-posture');
  }
  if (nativePolicy.strict) {
    push('strict-posture');
  }
  if (['high', 'critical'].includes(nativePolicy.riskLevel || analysis.risk?.level || 'low')) {
    push('high-risk');
  }
  if (Number(nativePolicy.pendingApprovals || 0) > 0 || (trustCenter.approvals?.pending || []).length > 0) {
    push('pending-approvals');
  }
  if (Number(nativePolicy.verificationGaps || 0) > 0 || Number(trustCenter.governance?.verificationGapCount || 0) > 0) {
    push('verification-gaps');
  }
  if ((releaseControl.gates?.ship?.blockers || 0) > 0 || (releaseControl.gates?.verify?.failed || 0) > 0) {
    push('release-blockers');
  }
  if ((handoff.continuity?.openLoopCount || 0) > 0) {
    push('open-loops');
  }
  return flags;
}

function buildMissionStages(goal = '', operator = {}, cockpit = {}, trustCenter = {}, releaseControl = {}, handoff = {}) {
  const verificationPlan = operator.routing?.verificationPlan || [];
  const closeoutCommands = cockpit.closeoutCommands || [];
  return [
    {
      id: 'preflight',
      title: 'Preflight gate',
      outcomes: [
        `Confirm native profile \`${operator.nativeProfile || 'unknown'}\` and Codex profile \`${operator.codexProfile?.id || 'unknown'}\`.`,
        `Open operator packet \`${operator.file}\` and mission charter before the first write.`,
        `Review trust decision start=\`${trustCenter.decisions?.start || 'unknown'}\` merge=\`${trustCenter.decisions?.merge || 'unknown'}\` ship=\`${trustCenter.decisions?.ship || 'unknown'}\`.`,
      ],
      commands: [
        `rai codex operator --goal ${JSON.stringify(goal)} --json`,
        'rai trust --json',
      ],
    },
    {
      id: 'execute',
      title: 'Bounded execution',
      outcomes: [
        `Prefer \`${operator.executionEnvelope?.preferredEntrypoint || 'interactive'}\` entry and keep mutation policy \`${operator.executionEnvelope?.mutationPolicy || 'bounded'}\`.`,
        `Use the mission launcher or cockpit preferred launcher instead of rebuilding the session by hand.`,
        `Checkpoint after each slice when risk or ambiguity grows.`,
      ],
      commands: [
        cockpit.launchers?.preferred ? `bash ${cockpit.launchers.preferred}` : operator.commands?.interactive,
        'rai checkpoint',
      ].filter(Boolean),
    },
    {
      id: 'prove',
      title: 'Proof and closeout',
      outcomes: [
        verificationPlan.length > 0
          ? `Run the declared verification contract (${verificationPlan.length} step${verificationPlan.length === 1 ? '' : 's'}).`
          : 'Run repo-appropriate verification before claiming completion.',
        `Refresh release blockers (${releaseControl.gates?.ship?.blockers || 0}) and open loops (${handoff.continuity?.openLoopCount || 0}) before handoff or merge.`,
        'Finish with a handoff-quality resume anchor, not just a terminal summary.',
      ],
      commands: uniqueStrings([
        ...verificationPlan,
        ...closeoutCommands,
      ]).slice(0, 10),
    },
  ];
}

function renderMissionCharter(payload) {
  const stageLines = payload.stages.flatMap((stage) => [
    `### ${stage.title}`,
    '',
    ...stage.outcomes.map((item) => `- ${item}`),
    '',
    ...(stage.commands.length > 0 ? ['Commands:', '', ...stage.commands.map((item) => `- \`${item}\``), ''] : []),
  ]);
  return [
    '# CODEX MISSION CHARTER',
    '',
    `- Mission: \`${payload.missionId}\``,
    `- Goal: \`${payload.goal}\``,
    `- Session genome: \`${payload.sessionGenome.id}\``,
    `- Native profile: \`${payload.nativeProfile}\``,
    `- Codex profile: \`${payload.codexProfile}\``,
    `- Preferred entry: \`${payload.preferredEntrypoint}\``,
    `- Mutation policy: \`${payload.mutationPolicy}\``,
    `- Route: \`${payload.route.capability}\``,
    `- Confidence: \`${payload.route.confidence}\``,
    `- Risk flags: \`${payload.riskFlags.join(', ') || 'none'}\``,
    '',
    '## Why this mission exists',
    '',
    ...payload.why.map((item) => `- ${item}`),
    '',
    '## Mission stages',
    '',
    ...stageLines,
    '## Key artifacts',
    '',
    `- Operator packet: \`${payload.files.operator}\``,
    `- Cockpit: \`${payload.files.cockpit}\``,
    `- Prompt pack: \`${payload.files.promptPack}\``,
    `- Context pack: \`${payload.files.contextPack}\``,
    `- Resume card: \`${payload.files.resumeCard}\``,
    `- Trust center: \`${payload.files.trustCenter}\``,
    `- Release control: \`${payload.files.releaseControl}\``,
    `- Handoff OS: \`${payload.files.handoff}\``,
    '',
    '## Recovery ladder',
    '',
    ...payload.recoveryLadder.map((item) => `- **${item.when}** → ${item.do}`),
    '',
    '## Resume anchor',
    '',
    `- \`${payload.resume.command}\``,
    `- ${payload.resume.reason}`,
    '',
  ].join('\n').trimEnd() + '\n';
}

function renderMissionRecovery(payload) {
  return [
    '# CODEX MISSION RECOVERY',
    '',
    `- Mission: \`${payload.missionId}\``,
    `- Resume command: \`${payload.resume.command}\``,
    `- Last safe closeout protocol: \`${payload.closeoutProtocol}\``,
    '',
    '## Immediate recovery checks',
    '',
    '- Reopen the mission charter before changing scope.',
    '- Inspect telemetry for repeated denials or warnings.',
    '- Refresh trust, release, and handoff surfaces before resuming risky work.',
    '',
    '## Fast commands',
    '',
    `- \`rai codex telemetry --json\``,
    `- \`rai trust --json\``,
    `- \`rai release-control --json\``,
    `- \`rai handoff --json\``,
    `- \`${payload.resume.command}\``,
    '',
    '## Mission-specific ladders',
    '',
    ...payload.recoveryLadder.map((item) => `- **${item.when}** → ${item.do}`),
    '',
  ].join('\n').trimEnd() + '\n';
}

function buildMissionPacket(cwd, args = {}) {
  const goal = goalText(args);
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const analysis = analyzeIntent(cwd, rootDir, goal);
  const operator = doOperator(cwd, args);
  const cockpit = buildCockpitPacket(cwd, args);
  const trustCenter = buildTrustCenterPayload(cwd, rootDir, { write: true });
  const releaseControl = buildReleaseControlPayload(cwd, rootDir, { write: true });
  const handoff = buildHandoffPayload(cwd, rootDir, { write: true });
  const telemetry = doTelemetry(cwd, args);
  const slug = missionSlug(goal, operator.sessionGenome?.id || 'mission');
  const missionDir = path.join(missionsDir(cwd), slug);
  ensureDir(missionDir);

  const riskFlags = missionRiskFlags(operator.nativePolicy || {}, analysis, trustCenter, releaseControl, handoff);
  const recoveryLadder = [
    ...(operator.decisionLadders || []),
    {
      when: 'release-gates-open',
      do: `Run \`rai release-control --json\` and clear blockers before saying the work is merge- or ship-ready.`,
    },
    {
      when: 'resume-after-interruption',
      do: `Use \`${handoff.nextAction?.command || 'rai next'}\` after checking \`rai codex telemetry --json\` so the mission restarts from a grounded state.`,
    },
  ].filter((item, index, array) => item && array.findIndex((candidate) => candidate.when === item.when && candidate.do === item.do) == index);
  const stages = buildMissionStages(goal, operator, cockpit, trustCenter, releaseControl, handoff);

  const launcherPath = path.join(missionDir, 'launch-mission.sh');
  writeExecutable(launcherPath, shellScript(
    cockpit.launchers?.preferred ? `bash ${path.relative(missionDir, path.join(cwd, cockpit.launchers.preferred))}` : operator.executionEnvelope?.preferredLaunchCommand,
    [
      `Raiola Codex mission launcher`,
      `Mission: ${slug}`,
      `Session genome: ${operator.sessionGenome?.id || 'unknown'}`,
      `Goal: ${truncateText(goal, 140)}`,
    ],
  ));

  const payload = {
    action: 'mission',
    scope: scopeName(args),
    generatedAt: nowIso(),
    rootDir,
    goal,
    missionId: slug,
    missionDir: relativePath(cwd, missionDir),
    sessionGenome: operator.sessionGenome,
    nativeProfile: operator.nativeProfile,
    codexProfile: operator.codexProfile.id,
    preferredEntrypoint: operator.executionEnvelope?.preferredEntrypoint || 'interactive',
    mutationPolicy: operator.executionEnvelope?.mutationPolicy || 'bounded-local-write',
    closeoutProtocol: operator.executionEnvelope?.closeoutProtocol || 'verify-and-checkpoint',
    route: {
      capability: analysis.chosenCapability?.id || 'unknown',
      domain: analysis.chosenCapability?.domain || 'unknown',
      confidence: analysis.confidence || 'medium',
    },
    riskFlags,
    why: uniqueStrings([
      ...(analysis.chosenCapability?.reasons || []),
      ...(operator.codexProfile?.reasons || []),
      ...(riskFlags.length > 0 ? [`Risk posture: ${riskFlags.join(', ')}`] : []),
    ]).slice(0, 10),
    recoveryLadder,
    stages,
    resume: {
      command: handoff.nextAction?.command || 'rai next',
      reason: handoff.nextAction?.reason || 'Resume from the handoff surface.',
    },
    files: {
      operator: operator.file,
      operatorMarkdown: operator.markdownFile,
      cockpit: cockpit.file,
      cockpitMarkdown: cockpit.markdownFile,
      promptPack: cockpit.promptPack.file,
      contextPack: cockpit.contextPack.file,
      resumeCard: cockpit.resumeCard.file,
      telemetry: telemetry.file,
      trustCenter: trustCenter.artifacts?.json || '.workflow/reports/trust-center.json',
      releaseControl: releaseControl.artifacts?.json || '.workflow/reports/change-control.json',
      handoff: handoff.artifacts?.json || '.workflow/reports/handoff-os.json',
      missionLauncher: relativePath(cwd, launcherPath),
    },
    trust: {
      verdict: trustCenter.verdict,
      riskLevel: trustCenter.risk?.level || operator.nativePolicy?.riskLevel || 'unknown',
      decisions: trustCenter.decisions || {},
    },
    release: {
      verdict: releaseControl.verdict,
      mergeAllowed: Boolean(releaseControl.gates?.merge?.allowed),
      shipAllowed: Boolean(releaseControl.gates?.ship?.allowed),
      blockers: releaseControl.gates?.ship?.blockers || 0,
    },
    continuity: {
      verdict: handoff.verdict,
      openLoops: handoff.continuity?.openLoopCount || 0,
      resumeAnchor: handoff.resumeAnchor || handoff.nextAction?.command || 'rai next',
    },
  };

  const manifestPath = path.join(missionDir, 'mission.json');
  const charterPath = path.join(missionDir, 'MISSION.md');
  const recoveryPath = path.join(missionDir, 'RECOVERY.md');
  writeJsonFile(manifestPath, payload);
  writeIfChanged(charterPath, renderMissionCharter(payload));
  writeIfChanged(recoveryPath, renderMissionRecovery(payload));
  payload.file = relativePath(cwd, manifestPath);
  payload.markdownFile = relativePath(cwd, charterPath);
  payload.recoveryFile = relativePath(cwd, recoveryPath);
  return payload;
}

function doMission(cwd, args = {}) {
  return buildMissionPacket(cwd, args);
}

function summarizeTelemetry(events = []) {
  const countsByEvent = {};
  const decisions = {};
  const profiles = {};
  const commandBuckets = {};
  const noteCounts = {};
  const sessionIds = new Set();
  let blockedCount = 0;
  let warningCount = 0;

  for (const row of events) {
    const eventName = row.eventName || 'unknown';
    countsByEvent[eventName] = (countsByEvent[eventName] || 0) + 1;
    if (row.sessionGenomeId) {
      sessionIds.add(row.sessionGenomeId);
    }
    if (row.nativeProfile) {
      profiles[row.nativeProfile] = (profiles[row.nativeProfile] || 0) + 1;
    }
    if (row.decision) {
      decisions[row.decision] = (decisions[row.decision] || 0) + 1;
    }
    if (['deny', 'block', 'interrupt'].includes(String(row.decision || ''))) {
      blockedCount += 1;
    }
    if (row.decision === 'warn' || (Array.isArray(row.notes) && row.notes.length > 0)) {
      warningCount += 1;
    }
    const bucket = commandBucket(row.command);
    if (bucket) {
      commandBuckets[bucket] = (commandBuckets[bucket] || 0) + 1;
    }
    for (const note of Array.isArray(row.notes) ? row.notes : []) {
      const key = truncateText(note, 160);
      noteCounts[key] = (noteCounts[key] || 0) + 1;
    }
    if (row.reason) {
      const key = truncateText(row.reason, 160);
      noteCounts[key] = (noteCounts[key] || 0) + 1;
    }
  }

  const sortEntries = (input) => Object.entries(input).sort((left, right) => right[1] - left[1]);
  const recentEvents = events.slice(-12).reverse().map((row) => ({
    at: row.at,
    eventName: row.eventName,
    decision: row.decision || null,
    command: row.command ? truncateText(row.command, 120) : null,
    prompt: row.prompt ? truncateText(row.prompt, 120) : null,
    notes: Array.isArray(row.notes) ? row.notes.map((item) => truncateText(item, 120)) : [],
    sessionGenomeId: row.sessionGenomeId || null,
  }));

  return {
    eventCount: events.length,
    sessionCount: sessionIds.size,
    blockedCount,
    warningCount,
    countsByEvent,
    decisions,
    profiles,
    topCommandBuckets: sortEntries(commandBuckets).slice(0, 6).map(([name, count]) => ({ name, count })),
    repeatedNotes: sortEntries(noteCounts).slice(0, 6).map(([note, count]) => ({ note, count })),
    recentEvents,
    latestEventAt: events.length ? events[events.length - 1].at : null,
  };
}

function renderTelemetryMarkdown(summary, eventsFile) {
  return [
    '# CODEX TELEMETRY',
    '',
    `- Events: \`${summary.eventCount}\``,
    `- Session genomes seen: \`${summary.sessionCount}\``,
    `- Blocked/interrupt events: \`${summary.blockedCount}\``,
    `- Warning-style events: \`${summary.warningCount}\``,
    `- Event stream: \`${eventsFile}\``,
    '',
    '## Event mix',
    '',
    ...(Object.entries(summary.countsByEvent).length > 0
      ? Object.entries(summary.countsByEvent).map(([name, count]) => `- \`${name}\` -> ${count}`)
      : ['- `No hook events recorded yet.`']),
    '',
    '## Decision mix',
    '',
    ...(Object.entries(summary.decisions).length > 0
      ? Object.entries(summary.decisions).map(([name, count]) => `- \`${name}\` -> ${count}`)
      : ['- `No explicit hook decisions recorded yet.`']),
    '',
    '## Repeated frictions',
    '',
    ...(summary.repeatedNotes.length > 0
      ? summary.repeatedNotes.map((item) => `- ${item.note} (${item.count})`)
      : ['- `No repeated friction note recorded.`']),
    '',
    '## Recent events',
    '',
    ...(summary.recentEvents.length > 0
      ? summary.recentEvents.map((event) => `- \`${event.at || 'unknown'}\` \`${event.eventName}\`${event.decision ? ` [${event.decision}]` : ''}${event.command ? ` -> ${event.command}` : ''}${event.prompt ? ` -> ${event.prompt}` : ''}`)
      : ['- `No recent events.`']),
  ].join('\n').trimEnd() + '\n';
}

function doTelemetry(cwd, args = {}) {
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const dir = telemetryDir(cwd);
  ensureDir(dir);
  const eventsFilePath = path.join(dir, 'events.jsonl');
  const latestSessionPath = path.join(dir, 'latest-session.json');
  const events = readJsonl(eventsFilePath);
  const summary = summarizeTelemetry(events);
  const jsonPath = path.join(runtimeDir(cwd), 'telemetry.json');
  const markdownPath = path.join(runtimeDir(cwd), 'telemetry.md');
  const payload = {
    action: 'telemetry',
    scope: scopeName(args),
    rootDir,
    generatedAt: nowIso(),
    ...summary,
    file: relativePath(cwd, jsonPath),
    markdownFile: relativePath(cwd, markdownPath),
    eventsFile: relativePath(cwd, eventsFilePath),
    latestSessionFile: relativePath(cwd, latestSessionPath),
  };
  writeJsonFile(jsonPath, payload);
  writeIfChanged(markdownPath, renderTelemetryMarkdown(summary, payload.eventsFile));
  if (!fs.existsSync(latestSessionPath)) {
    writeJsonFile(latestSessionPath, {
      lastUpdatedAt: payload.generatedAt,
      eventCount: summary.eventCount,
      sessionCount: summary.sessionCount,
    });
  }
  return payload;
}

function doManagedExport(cwd, args = {}) {
  const spec = buildManagedRequirementsSpec(cwd, args);
  const files = writeManagedExportFiles(cwd, spec);
  return {
    action: 'managed-export',
    scope: scopeName(args),
    rootDir: resolveWorkflowRoot(cwd, args.root),
    generatedAt: spec.generatedAt,
    nativeProfile: spec.policy.selectedProfile,
    approvalPolicies: spec.allowed_approval_policies,
    sandboxModes: spec.allowed_sandbox_modes,
    webSearchModes: spec.allowed_web_search_modes,
    file: files.tomlFile,
    readmeFile: files.readmeFile,
  };
}

module.exports = {
  buildCockpitPacket,
  buildManagedRequirementsSpec,
  buildOperatorPacket,
  doCockpit,
  doMission,
  doManagedExport,
  doOperator,
  doTelemetry,
  renderManagedRequirementsToml,
};
