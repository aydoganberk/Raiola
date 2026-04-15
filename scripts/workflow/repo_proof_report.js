const path = require('node:path');

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function formatList(values = []) {
  const filtered = (values || []).filter(Boolean);
  return filtered.length > 0 ? filtered.join(', ') : 'none';
}

function topFindings(findings = {}, limit = 5) {
  return ['verified', 'probable', 'heuristic']
    .flatMap((bucket) => (findings[bucket] || []).map((item) => ({
      bucket,
      title: String(item.title || item.summary || item.id || 'untitled finding'),
      severity: String(item.severity || 'unknown'),
      why: String(item.why || item.rationale || item.summary || '').trim(),
    })))
    .slice(0, limit);
}

function determineCoverage(apiSurface, frontendProfile, auditPayload, repoTruth) {
  const lanes = [];
  if ((apiSurface?.endpointCount || 0) > 0) {
    lanes.push('api');
  }
  if (frontendProfile?.frontendMode?.active) {
    lanes.push('frontend');
  }
  if (auditPayload?.repoShape === 'monorepo' || (repoTruth?.workspaces || []).length > 1) {
    lanes.push('monorepo');
  }
  if (lanes.length === 0) {
    lanes.push('repo-audit');
  }
  return lanes;
}

function localRepoCommand(targetRepo, command, externalSnapshot) {
  return externalSnapshot ? `cd ${targetRepo} && ${command}` : command;
}

function buildRecommendedNextLanes(targetRepo, payload) {
  const commands = [];
  if (payload.coverage.includes('api')) {
    commands.push(`rai api-surface --repo ${targetRepo} --json`);
  }
  if (payload.coverage.includes('frontend')) {
    commands.push(localRepoCommand(targetRepo, `rai map-frontend --root ${payload.frontend.rootRelative || 'docs/workflow'} --json`, payload.externalSnapshot));
  }
  commands.push(`rai audit-repo --repo ${targetRepo} --goal "${payload.audit.goal}" --json`);
  if (payload.coverage.includes('monorepo')) {
    commands.push(localRepoCommand(targetRepo, 'rai workspace-impact --json', payload.externalSnapshot));
  }
  commands.push(localRepoCommand(targetRepo, `rai start recommend --goal "${payload.audit.goal}"`, payload.externalSnapshot));
  return [...new Set(commands)];
}

function summarizeRepoTruth(repoTruth) {
  const markers = Object.entries(repoTruth.markers || {})
    .filter(([, active]) => Boolean(active))
    .map(([name]) => name);

  return {
    workspaceCount: (repoTruth.workspaces || []).length,
    ecosystems: repoTruth.ecosystems || [],
    markers,
    ownershipSource: repoTruth.ownership?.source || null,
    sampleWorkspaces: (repoTruth.workspaces || []).slice(0, 8).map((entry) => ({
      root: entry.root,
      ecosystem: entry.ecosystem,
      owners: entry.owners || [],
      sources: entry.sources || [],
    })),
  };
}

function summarizeFrontend(targetRepo, rootDir, frontendProfile, frontendArtifacts) {
  return {
    active: Boolean(frontendProfile.frontendMode?.active),
    rootRelative: relativePath(targetRepo, rootDir),
    framework: frontendProfile.framework?.primary || 'unknown',
    routing: frontendProfile.routing?.label || 'unknown',
    productSurface: frontendProfile.productSurface?.label || 'unknown',
    browserLane: frontendProfile.browserReadiness?.recommendedLane || 'unknown',
    hasProofHarness: Boolean(frontendProfile.browserReadiness?.hasProofHarness),
    componentReuseVerdict: frontendProfile.componentIntelligence?.reuse?.verdict || 'unknown',
    artifacts: frontendArtifacts
      ? {
          markdown: relativePath(targetRepo, frontendArtifacts.markdownPath),
          json: relativePath(targetRepo, frontendArtifacts.jsonPath),
        }
      : null,
  };
}

function summarizeApiSurface(apiSurface) {
  return {
    endpointCount: apiSurface.endpointCount || 0,
    middlewareCount: apiSurface.middlewareCount || 0,
    mountCount: apiSurface.mountCount || 0,
    frameworks: apiSurface.frameworks || [],
    authSignals: apiSurface.authSignals || [],
    dataStores: apiSurface.dataStores || [],
    artifacts: apiSurface.artifacts || null,
  };
}

function summarizeAudit(auditPayload) {
  return {
    goal: auditPayload.goal,
    repoShape: auditPayload.repoShape,
    stackPack: auditPayload.stackPack?.label || 'unknown',
    healthVerdict: auditPayload.repoHealth?.verdict || 'unknown',
    healthScore: auditPayload.repoHealth?.score ?? null,
    verifiedCount: auditPayload.findings?.verified?.length || 0,
    probableCount: auditPayload.findings?.probable?.length || 0,
    heuristicCount: auditPayload.findings?.heuristic?.length || 0,
    topFindings: topFindings(auditPayload.findings),
    artifacts: auditPayload.artifacts || null,
    controlPlaneArtifacts: auditPayload.controlPlane?.artifacts || null,
  };
}

function confidenceLabel(score) {
  if (score >= 4) {
    return 'high';
  }
  if (score >= 2) {
    return 'medium';
  }
  return 'low';
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function buildRepoProofVerdict(payload) {
  const score = [
    payload.repoTruth.workspaceCount > 0,
    payload.apiSurface.endpointCount > 0,
    payload.frontend.active,
    payload.audit.verifiedCount > 0,
    (payload.audit.healthScore || 0) >= 70,
  ].filter(Boolean).length;

  const trustableFindings = uniqueStrings([
    payload.repoTruth.workspaceCount > 0 ? `Workspace graph reports ${payload.repoTruth.workspaceCount} root${payload.repoTruth.workspaceCount === 1 ? '' : 's'}` : '',
    payload.repoTruth.ecosystems.length > 0 ? `Detected ecosystems: ${payload.repoTruth.ecosystems.join(', ')}` : '',
    payload.apiSurface.endpointCount > 0 ? `API surface found ${payload.apiSurface.endpointCount} endpoint${payload.apiSurface.endpointCount === 1 ? '' : 's'} via ${formatList(payload.apiSurface.frameworks)}` : '',
    payload.frontend.active ? `Frontend surface detected (${payload.frontend.framework} / ${payload.frontend.routing})` : '',
    ...payload.audit.topFindings
      .filter((item) => item.bucket === 'verified')
      .map((item) => `Verified finding: ${item.title}`),
  ]).slice(0, 5);

  const manualVerify = uniqueStrings([
    payload.apiSurface.authSignals.length > 0 ? `Auth edge behavior and middleware ordering (${payload.apiSurface.authSignals.join(', ')})` : '',
    payload.apiSurface.dataStores.length > 0 ? `Runtime datastore wiring and environment variables (${payload.apiSurface.dataStores.join(', ')})` : '',
    payload.frontend.active ? `Critical UI flows, navigation params, and browser/mobile smoke paths` : '',
    payload.coverage.includes('monorepo') ? 'Cross-workspace boundaries, owners, and release sequencing' : '',
    payload.externalSnapshot ? 'Deployment-time integrations that are invisible in a read-only snapshot' : 'Deployment-only assumptions and runtime-only feature flags',
  ]).slice(0, 5);

  const knownLimitations = uniqueStrings([
    payload.apiSurface.endpointCount === 0 ? 'Static route scan may miss runtime-generated endpoints or framework-specific mounts.' : '',
    payload.frontend.active && !payload.frontend.hasProofHarness ? 'No proof harness was detected for the frontend surface; manual smoke verification remains necessary.' : '',
    payload.audit.heuristicCount > payload.audit.verifiedCount ? 'Heuristic audit findings still outweigh verified findings in this proof pack.' : '',
    payload.externalSnapshot ? 'Read-only snapshot mode cannot confirm secrets, env wiring, or live services.' : '',
    payload.frontend.productSurface === 'mobile-app' ? 'Native mobile build settings and store-release metadata still require manual review.' : '',
    payload.apiSurface.dataStores.length > 0 ? 'Static analysis can detect datastore libraries, but not whether every runtime path uses the intended production instance.' : '',
  ]).slice(0, 5);

  return {
    overallConfidence: confidenceLabel(score),
    score,
    maxScore: 5,
    trustableFindings,
    manualVerify,
    knownLimitations,
  };
}

function renderSummaryMarkdown(payload) {
  const verdict = payload.verdict || buildRepoProofVerdict(payload);
  const trustable = verdict.trustableFindings.length > 0
    ? verdict.trustableFindings.map((item) => `- ${item}`).join('\n')
    : '- No high-confidence finding was captured yet.';
  const manualVerify = verdict.manualVerify.length > 0
    ? verdict.manualVerify.map((item) => `- ${item}`).join('\n')
    : '- No manual verification lane was generated.';
  const knownLimitations = verdict.knownLimitations.length > 0
    ? verdict.knownLimitations.map((item) => `- ${item}`).join('\n')
    : '- No explicit limitation was recorded.';
  return `# REPO PROOF SUMMARY\n\n- Repo: \`${payload.repoRelative}\`\n- Overall confidence: \`${verdict.overallConfidence}\` (${verdict.score}/${verdict.maxScore})\n- Coverage: \`${payload.coverage.join(', ')}\`\n- Audit verdict: \`${payload.audit.healthVerdict}\` (${payload.audit.healthScore})\n\n## Trustable findings\n\n${trustable}\n\n## Manual verify lane\n\n${manualVerify}\n\n## Known limitations\n\n${knownLimitations}\n`;
}

function renderMarkdown(payload) {
  const verdict = payload.verdict || buildRepoProofVerdict(payload);
  const topFindingLines = (payload.audit.topFindings || [])
    .map((item) => `- [${item.bucket}] \`${item.severity}\` ${item.title}${item.why ? ` -> ${item.why}` : ''}`)
    .join('\n') || '- `No high-signal findings were captured.`';
  const workspaceLines = (payload.repoTruth.sampleWorkspaces || [])
    .map((item) => `- \`${item.root}\` -> ecosystem=${item.ecosystem}, owners=${formatList(item.owners)}`)
    .join('\n') || '- `No workspace roots detected.`';
  const nextLanes = (payload.recommendedNextLanes || [])
    .map((command) => `- \`${command}\``)
    .join('\n');
  const trustable = verdict.trustableFindings.length > 0
    ? verdict.trustableFindings.map((item) => `- ${item}`).join('\n')
    : '- `No high-confidence finding was captured yet.`';
  const manualVerify = verdict.manualVerify.length > 0
    ? verdict.manualVerify.map((item) => `- ${item}`).join('\n')
    : '- `No manual verification lane was generated.`';
  const knownLimitations = verdict.knownLimitations.length > 0
    ? verdict.knownLimitations.map((item) => `- ${item}`).join('\n')
    : '- `No explicit limitation was recorded.`';

  return `
# REPO PROOF

- Generated at: \`${payload.generatedAt}\`
- Repo: \`${payload.repoRelative}\`
- Invoked from: \`${payload.invokedFromRelative}\`
- External snapshot: \`${payload.externalSnapshot ? 'yes' : 'no'}\`
- Coverage: \`${payload.coverage.join(', ')}\`
- Write mode: \`${payload.writeArtifacts ? 'persistent' : 'read-only'}\`

## Verdict

- Overall confidence: \`${verdict.overallConfidence}\` (${verdict.score}/${verdict.maxScore})
- Audit verdict: \`${payload.audit.healthVerdict}\` (${payload.audit.healthScore})
- Findings: verified=\`${payload.audit.verifiedCount}\`, probable=\`${payload.audit.probableCount}\`, heuristic=\`${payload.audit.heuristicCount}\`

### Trustable findings

${trustable}

### Manual verify lane

${manualVerify}

### Known limitations

${knownLimitations}

## Repo truth

- Workspace count: \`${payload.repoTruth.workspaceCount}\`
- Ecosystems: \`${formatList(payload.repoTruth.ecosystems)}\`
- Ownership source: \`${payload.repoTruth.ownershipSource || 'none'}\`
- Repo markers: \`${formatList(payload.repoTruth.markers)}\`

${workspaceLines}

## API surface

- Endpoints: \`${payload.apiSurface.endpointCount}\`
- Middleware count: \`${payload.apiSurface.middlewareCount}\`
- Mount count: \`${payload.apiSurface.mountCount}\`
- Frameworks: \`${formatList(payload.apiSurface.frameworks)}\`
- Auth signals: \`${formatList(payload.apiSurface.authSignals)}\`
- Data stores: \`${formatList(payload.apiSurface.dataStores)}\`

## Frontend surface

- Frontend active: \`${payload.frontend.active ? 'yes' : 'no'}\`
- Framework: \`${payload.frontend.framework}\`
- Routing: \`${payload.frontend.routing}\`
- Product surface: \`${payload.frontend.productSurface}\`
- Browser lane: \`${payload.frontend.browserLane}\`
- Proof harness: \`${payload.frontend.hasProofHarness ? 'yes' : 'no'}\`
- Component reuse verdict: \`${payload.frontend.componentReuseVerdict}\`

## Audit summary

- Goal: \`${payload.audit.goal}\`
- Repo shape: \`${payload.audit.repoShape}\`
- Stack pack: \`${payload.audit.stackPack}\`
- Health verdict: \`${payload.audit.healthVerdict}\`
- Health score: \`${payload.audit.healthScore}\`
- Findings: verified=\`${payload.audit.verifiedCount}\`, probable=\`${payload.audit.probableCount}\`, heuristic=\`${payload.audit.heuristicCount}\`

${topFindingLines}

## Recommended next lanes

${nextLanes}
`;
}

function renderConsoleSummary(payload) {
  const verdict = payload.verdict || buildRepoProofVerdict(payload);
  const trustable = verdict.trustableFindings.join('; ') || 'none';
  const manualVerify = verdict.manualVerify.join('; ') || 'none';
  const knownLimitations = verdict.knownLimitations.join('; ') || 'none';
  const lines = [
    '# REPO PROOF',
    '',
    `- Repo: ${payload.repoRoot}`,
    `- External snapshot: ${payload.externalSnapshot ? 'yes' : 'no'}`,
    `- Coverage: ${payload.coverage.join(', ')}`,
    `- Write mode: ${payload.writeArtifacts ? 'persistent' : 'read-only'}`,
    `- Overall confidence: ${verdict.overallConfidence} (${verdict.score}/${verdict.maxScore})`,
    `- Trustable findings: ${trustable}`,
    `- Manual verify lane: ${manualVerify}`,
    `- Known limitations: ${knownLimitations}`,
    `- Workspaces: ${payload.repoTruth.workspaceCount}`,
    `- Ecosystems: ${formatList(payload.repoTruth.ecosystems)}`,
    `- API endpoints: ${payload.apiSurface.endpointCount}`,
    `- Frontend active: ${payload.frontend.active ? 'yes' : 'no'}`,
    `- Audit verdict: ${payload.audit.healthVerdict} (${payload.audit.healthScore})`,
    `- Findings: verified=${payload.audit.verifiedCount}, probable=${payload.audit.probableCount}, heuristic=${payload.audit.heuristicCount}`,
  ];
  if (payload.artifacts) {
    lines.push(`- Report JSON: ${payload.artifacts.reportJson}`);
    lines.push(`- Report Markdown: ${payload.artifacts.reportMarkdown}`);
    if (payload.artifacts.summaryMarkdown) {
      lines.push(`- Summary Markdown: ${payload.artifacts.summaryMarkdown}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildRecommendedNextLanes,
  buildRepoProofVerdict,
  determineCoverage,
  formatList,
  relativePath,
  renderConsoleSummary,
  renderMarkdown,
  renderSummaryMarkdown,
  summarizeApiSurface,
  summarizeAudit,
  summarizeFrontend,
  summarizeRepoTruth,
  topFindings,
};
