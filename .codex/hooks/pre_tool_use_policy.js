const {
  readStdin,
  findRepoRoot,
  loadPolicy,
  printJson,
  dangerousCommand,
  recordHookEvent,
  extractRepoPaths,
  pathWithinBoundary,
  classifyShellCommand,
  inspectScriptLaunch,
  inspectWrappedCommand,
  commandMatchesPolicyList,
} = require('./common');

function noteMessage(decision, reason, hookSpecificOutput = {}) {
  const payload = {
    systemMessage: reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
      ...hookSpecificOutput,
    },
  };
  printJson(payload);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function combineAnalysis(primary = {}, secondary = {}) {
  return {
    dangerous: Boolean(primary.dangerous || secondary.dangerous),
    network: Boolean(primary.network || secondary.network),
    release: Boolean(primary.release || secondary.release),
    ciWorkflow: Boolean(primary.ciWorkflow || secondary.ciWorkflow),
    repoWide: Boolean(primary.repoWide || secondary.repoWide),
    writes: Boolean(primary.writes || secondary.writes),
    scriptLaunch: Boolean(primary.scriptLaunch || secondary.scriptLaunch),
  };
}

function boundaryHitRoots(relativePaths = [], roots = ['.']) {
  if (roots.includes('.')) {
    return ['.'];
  }
  return roots.filter((root) => relativePaths.some((relativePath) => pathWithinBoundary(relativePath, [root])));
}

function scriptTrace(details) {
  if (!details) {
    return [];
  }
  const parts = [`${details.manager || 'script'}:${details.scriptName || 'unknown'}@${details.packageDir || '.'}`];
  for (const nested of details.nested || []) {
    parts.push(...scriptTrace(nested));
  }
  return parts;
}

function isRepoWideGitStage(command) {
  const text = String(command || '').trim();
  return /\bgit\s+add\s+(-A|--all|\.)(\s|$)/i.test(text)
    || /\bgit\s+add\b[^\n]*\s(--all|-A)(\s|$)/i.test(text);
}

function truncateInline(value, max = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

module.exports.__handler = async function handle(input) {
  const repoRoot = findRepoRoot(input.cwd || process.cwd());
  const policy = loadPolicy(repoRoot);
  const command = String(input.tool_input?.command || '');
  const directAnalysis = classifyShellCommand(command);
  const wrapperDetails = inspectWrappedCommand(command, repoRoot);
  const wrapperAnalysis = wrapperDetails?.classification || {};
  const scriptDetails = policy.commandPolicy?.packageManagerIntrospection
    ? inspectScriptLaunch(command, repoRoot, {
      maxDepth: policy.commandPolicy?.nestedPackageManagerIntrospection ? 3 : 1,
    })
    : null;
  const scriptAnalysis = scriptDetails?.classification || {};
  const analysis = combineAnalysis(combineAnalysis(directAnalysis, scriptAnalysis), wrapperAnalysis);
  const touchedPaths = uniqueStrings([
    ...extractRepoPaths(command, repoRoot),
    ...((wrapperDetails?.touchedPaths) || []),
    ...((scriptDetails?.touchedPaths) || []),
  ]);
  const boundary = policy.writeBoundary || {};
  const allowedRoots = Array.isArray(boundary.roots) && boundary.roots.length > 0 ? boundary.roots : ['.'];
  const protectedRoots = Array.isArray(boundary.protectedRoots) && boundary.protectedRoots.length > 0
    ? boundary.protectedRoots
    : Array.isArray(policy.commandPolicy?.protectedPaths) && policy.commandPolicy.protectedPaths.length > 0
      ? policy.commandPolicy.protectedPaths
      : ['.git', '.workflow', 'node_modules'];
  const touchingProtectedRoots = touchedPaths.filter((relativePath) => pathWithinBoundary(relativePath, protectedRoots));
  const outsideBoundary = touchedPaths.filter((relativePath) => !pathWithinBoundary(relativePath, allowedRoots));
  const boundaryRequired = Boolean(policy.commandPolicy?.explicitWriteBoundaryRequired);
  const denylisted = commandMatchesPolicyList(command, policy.commandPolicy?.commandDenylist)
    || commandMatchesPolicyList(scriptDetails?.body || '', policy.commandPolicy?.commandDenylist);
  const allowlisted = commandMatchesPolicyList(command, policy.commandPolicy?.commandAllowlist)
    || commandMatchesPolicyList(scriptDetails?.body || '', policy.commandPolicy?.commandAllowlist);
  const ciWorkflowTouched = analysis.ciWorkflow || touchedPaths.some((relativePath) => pathWithinBoundary(relativePath, ['.github/workflows', '.github']));
  const writeRootHits = boundaryHitRoots(touchedPaths, allowedRoots);
  const waveThreshold = Math.max(0, Number(policy.commandPolicy?.waveWriteRootThreshold || 0));
  const notesBase = scriptDetails?.found
    ? [`Script trace: ${scriptTrace(scriptDetails).join(' -> ')}`]
    : [];
  if (wrapperDetails?.wrapper) {
    notesBase.push(`Wrapped command: ${wrapperDetails.wrapper}`);
  }

  if (denylisted) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'deny',
      command,
      reason: 'Command matched the repo-specific Raiola denylist.',
      notes: [...notesBase, 'Adjust the command or widen policy intentionally before retrying.'],
    });
    noteMessage('deny', 'This command matches the active repo-specific denylist in Raiola policy.');
    return;
  }

  if ((dangerousCommand(command) || analysis.dangerous) && (policy.locked || policy.strict)) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'deny',
      command,
      reason: 'Raiola blocks destructive shell commands in strict or locked mode.',
      notes: [...notesBase, 'Destructive command denied under strict/locked posture.'],
    });
    noteMessage('deny', 'Raiola blocked a destructive shell command while native policy is strict or locked.');
    return;
  }

  if (policy.locked && analysis.writes) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'deny',
      command,
      reason: 'Locked profile allows diagnosis and review, not write operations.',
      notes: [...notesBase, 'Write attempt denied while trust posture is locked.'],
    });
    noteMessage('deny', 'Trust Center is holding the repo in a locked posture, so write commands are blocked.');
    return;
  }

  if (wrapperDetails?.classification?.writes && (policy.locked || policy.strict || boundaryRequired)) {
    const decision = policy.locked || policy.strict ? 'deny' : 'warn';
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision,
      command,
      reason: `${wrapperDetails.wrapper} hides inline file mutations, which Raiola requires to be expressed as explicit repo paths under the active policy.`,
      notes: [...notesBase, truncateInline(wrapperDetails.body)],
    });
    noteMessage(decision, `${wrapperDetails.wrapper} hides inline file mutations. Express the write as explicit repo paths or widen the boundary intentionally.`);
    return;
  }

  if (wrapperDetails?.classification?.network && !policy.networkAccess) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: allowlisted ? 'note' : 'warn',
      command,
      reason: `${wrapperDetails.wrapper} hides inline network activity while the active Raiola profile keeps network restricted.`,
      notes: [...notesBase, truncateInline(wrapperDetails.body)],
    });
    noteMessage(allowlisted ? 'note' : 'warn', `${wrapperDetails.wrapper} hides inline network activity, but the active Raiola profile keeps network restricted. Switch profiles or request approval intentionally.`);
    return;
  }

  if (scriptDetails?.found && analysis.release && (policy.strict || policy.locked || boundaryRequired)) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'deny',
      command,
      reason: `Underlying ${scriptDetails.manager} script ${scriptDetails.scriptName} expands to release/publish behavior under the active Raiola policy.`,
      notes: [...notesBase, scriptDetails.body],
    });
    noteMessage('deny', `The underlying ${scriptDetails.manager} script ${scriptDetails.scriptName} expands to release or publish behavior, which requires an explicit closeout lane.`);
    return;
  }

  if (analysis.release && (policy.strict || policy.locked || boundaryRequired)) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'deny',
      command,
      reason: 'Release or publish commands require an explicit closeout lane under the active Raiola policy.',
      notes: [...notesBase, 'Use release-control / ship-closeout surfaces before publish or deploy actions.'],
    });
    noteMessage('deny', 'Release, publish, and deploy commands require an explicit closeout lane under the active Raiola policy.');
    return;
  }

  if (analysis.repoWide && (policy.strict || policy.repoSignals?.monorepo)) {
    const repoWideGitStage = isRepoWideGitStage(command);
    const decision = repoWideGitStage && !policy.locked ? 'warn' : 'deny';
    const reason = repoWideGitStage && !policy.locked
      ? 'Repo-wide git staging is allowed with warning so commit flows can continue, but targeted staging is still preferred when the boundary is intentionally narrow.'
      : 'Repo-wide mutation commands are blocked until the write boundary is intentionally widened.';
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision,
      command,
      reason,
      notes: [...notesBase, `Current boundary roots: ${allowedRoots.join(', ')}`],
    });
    noteMessage(decision, repoWideGitStage && !policy.locked
      ? 'Repo-wide git staging is being allowed with warning so commit flows can continue. Prefer targeted git add paths when the current boundary is intentionally narrow.'
      : 'Repo-wide mutation commands are blocked until the write boundary is intentionally widened.');
    return;
  }

  if (analysis.network && !policy.networkAccess) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: allowlisted ? 'note' : 'warn',
      command,
      reason: 'This command likely needs network access, but the active Raiola profile keeps network restricted.',
      notes: [...notesBase, ...(policy.selectionRationale || [])],
    });
    noteMessage(allowlisted ? 'note' : 'warn', 'This command likely needs network access, but the active Raiola profile keeps network restricted. Switch profiles or request approval intentionally.');
    return;
  }

  if (ciWorkflowTouched && (analysis.writes || analysis.release || analysis.repoWide) && (policy.strict || boundaryRequired || policy.commandPolicy?.ciWorkflowRiskEscalation)) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: policy.strict ? 'deny' : 'warn',
      command,
      reason: 'CI or GitHub workflow surfaces are high-risk and require explicit review and verification posture.',
      notes: [...notesBase, `Touched paths: ${touchedPaths.join(', ') || '.github/workflows'}`],
    });
    noteMessage(policy.strict ? 'deny' : 'warn', 'CI or GitHub workflow changes are high-risk. Keep permissions explicit, pin the boundary, and rerun doctor before shipping.');
    return;
  }

  if (touchingProtectedRoots.length > 0 && !boundary.allowGeneratedWorkflowWrites) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: policy.strict ? 'deny' : 'warn',
      command,
      reason: 'Protected runtime or tooling surfaces are being touched outside an allowed refresh/closeout path.',
      notes: [...notesBase, `Protected paths: ${touchingProtectedRoots.join(', ')}`],
    });
    noteMessage(policy.strict ? 'deny' : 'warn', 'You are touching protected runtime/tooling surfaces. Prefer canonical docs or explicit refresh commands first.', {
      touchedPaths: touchingProtectedRoots,
    });
    return;
  }

  if (analysis.writes && outsideBoundary.length > 0 && allowedRoots[0] !== '.') {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: policy.strict ? 'deny' : 'warn',
      command,
      reason: 'The command writes outside the current task-aware boundary.',
      notes: [
        ...notesBase,
        `Allowed roots: ${allowedRoots.join(', ')}`,
        `Outside boundary: ${outsideBoundary.join(', ')}`,
      ],
    });
    noteMessage(policy.strict ? 'deny' : 'warn', 'This write goes outside the current task-aware boundary. Narrow the command or widen the boundary intentionally.', {
      allowedRoots,
      outsideBoundary,
    });
    return;
  }

  if (analysis.writes && waveThreshold > 0 && writeRootHits[0] !== '.' && writeRootHits.length > waveThreshold) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: policy.strict ? 'deny' : 'warn',
      command,
      reason: 'The command fans out across too many write roots for the current execution wave.',
      notes: [...notesBase, `Write roots hit: ${writeRootHits.join(', ')}`, `Wave threshold: ${waveThreshold}`],
    });
    noteMessage(policy.strict ? 'deny' : 'warn', 'This command spans too many package roots for the current execution wave. Shard the work or widen the boundary intentionally.');
    return;
  }

  if (analysis.scriptLaunch && policy.commandPolicy?.packageManagerIntrospection && /\b(run\s+release|publish|deploy)\b/i.test(command) && !scriptDetails?.found) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'warn',
      command,
      reason: 'Script-driven release or deploy commands should be inspected before execution.',
      notes: ['Check the underlying package-manager script and required verification contract first.'],
    });
    noteMessage('warn', 'Inspect the underlying package-manager script before running release or deploy automation.');
    return;
  }

  if (/\.workflow\//.test(command)) {
    recordHookEvent(repoRoot, 'PreToolUse', {
      decision: 'warn',
      command,
      notes: ['Generated workflow surface touched before closeout.'],
    });
    noteMessage('warn', 'You are touching .workflow generated artifacts. Prefer updating canonical docs or product sources first unless this command is explicitly refreshing derived state.');
  }
};

readStdin(module.exports.__handler);
