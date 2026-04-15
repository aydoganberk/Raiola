#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { readProductManifest } = require('../workflow/product_manifest');
const { listWorkflowBundles, findWorkflowBundle } = require('../workflow/workflow_bundle_catalog');
const { listStartAddOns, listStartProfiles } = require('../workflow/workflow_start_intelligence');

const CLI_COMMANDS = {
  on: { script: 'onboarding.js', description: 'Open Raiola onboarding and propose the next milestone from a blank state.' },
  launch: { script: 'launch.js', description: 'Strong-start launcher for the current Codex session.' },
  codex: { script: 'codex_control.js', description: 'Operate the safe Codex control plane.' },
  start: { script: 'start.js', description: 'Open a productized workflow bundle that groups overlapping commands under one structured entry.' },
  do: { script: 'do.js', description: 'Route a natural-language intent into the right workflow lane.' },
  audit: { script: 'audit.js', description: 'Intent-level audit facade that resolves into repo-audit, review-mode, monorepo-mode, or ui-review.' },
  fix: { script: 'fix.js', description: 'Intent-level correction facade that turns audit or review output into the next bounded fix workflow.' },
  verify: { script: 'verify.js', description: 'Intent-level verification facade that resolves into verify-work or ship-readiness with audit-aware trust gates.' },
  note: { script: 'note.js', description: 'Capture a low-friction workflow note and optionally promote it.' },
  thread: { script: 'thread.js', description: 'Open, list, and resume named workflow threads.' },
  backlog: { script: 'backlog.js', description: 'Capture and review workflow backlog items.' },
  manager: { script: 'manager.js', description: 'Show the operator manager surface.' },
  dashboard: { script: 'dashboard.js', description: 'Generate the local operator dashboard HTML surface.' },
  supervisor: { script: 'runtime_supervisor.js', description: 'Run the runtime supervisor and terminal control room.' },
  telemetry: { script: 'telemetry.js', description: 'Inspect routing telemetry and capture route-feedback outcomes.' },
  setup: { script: 'setup.js', description: 'Install or refresh the workflow product in the current repo.' },
  init: { script: 'init.js', description: 'Bootstrap workflow control-plane files in the current repo.' },
  milestone: { script: 'new_milestone.js', description: 'Open a new full-workflow milestone.' },
  'milestone-edit': { script: 'milestone_edit.js', description: 'Rename or reshape the active milestone without manual patching.' },
  doctor: { script: 'doctor.js', description: 'Check install health and workflow contract integrity.' },
  health: { script: 'health.js', description: 'Check runtime health and validation integrity.' },
  repair: { script: 'repair.js', description: 'Generate or apply the bounded self-healing repair plan for runtime drift and corrupt workflow state.' },
  spec: { script: 'spec.js', description: 'Define the next slice before coding through the lifecycle facade.' },
  plan: { script: 'plan.js', description: 'Break the current slice into explicit plan chunks and gates.' },
  build: { script: 'build.js', description: 'Translate the active plan into the next safe execution slice.' },
  test: { script: 'test.js', description: 'Show the verification path that proves the slice works.' },
  simplify: { script: 'simplify.js', description: 'Simplify code without changing behavior.' },
  discuss: { script: 'discuss.js', description: 'Generate the current discuss brief from workflow state.' },
  questions: { script: 'questions.js', description: 'List or capture open workflow questions.' },
  assumptions: { script: 'assumptions.js', description: 'Track active assumptions and their exit triggers.' },
  claims: { script: 'claims.js', description: 'Track claims, evidence, and traceability.' },
  secure: { script: 'secure_phase.js', description: 'Run the secure-phase heuristic guardrail scan.' },
  hud: { script: 'hud.js', description: 'Show the daily operator HUD.' },
  next: { script: 'next_step.js', description: 'Recommend the next safe workflow action.' },
  explore: { script: 'explore.js', description: 'Explore the repo with workflow-aware lenses.' },
  'verify-shell': { script: 'verify_shell.js', description: 'Run a bounded shell verification command.' },
  'verify-browser': { script: 'verify_browser.js', description: 'Run smoke browser verification and store evidence.' },
  'verify-work': { script: 'verify_work.js', description: 'Run the trust-layer verify-work pass and emit a fix plan if needed.' },
  packet: { script: 'packet.js', description: 'Compile, explain, lock, diff, and verify workflow packets.' },
  evidence: { script: 'evidence.js', description: 'Build the local evidence graph.' },
  'validation-map': { script: 'validation_map.js', description: 'Show the current validation contract mapping.' },
  checkpoint: { script: 'checkpoint.js', description: 'Write a continuity checkpoint.' },
  'next-prompt': { script: 'next_prompt.js', description: 'Generate a minimal resume prompt for the next session.' },
  quick: { script: 'quick.js', description: 'Run or inspect the lightweight quick-mode surface.' },
  team: { script: 'team.js', description: 'Plan or operate Team Lite orchestration.' },
  subagents: { script: 'subagents.js', description: 'Suggest bounded subagent slices via the Codex planner.' },
  policy: { script: 'policy.js', description: 'Inspect or evaluate workflow policy decisions.' },
  approval: { script: 'approvals.js', description: 'Roadmap-compatible alias for approvals and approval planning.' },
  approvals: { script: 'approvals.js', description: 'Record human approvals for risky workflow actions.' },
  route: { script: 'model_route.js', description: 'Recommend the right model preset for the current phase.' },
  stats: { script: 'stats.js', description: 'Show workflow telemetry, verification, and benchmark stats.' },
  profile: { script: 'profile.js', description: 'Show the operator profile and workflow defaults.' },
  workspaces: { script: 'workspaces_center.js', description: 'Show the workspace/workstream registry.' },
  hooks: { script: 'hooks.js', description: 'Manage disabled-by-default workflow hooks.' },
  mcp: { script: 'mcp.js', description: 'Install, inspect, and doctor the repo-local MCP servers.' },
  notify: { script: 'notify.js', description: 'Emit a workflow notification smoke event.' },
  daemon: { script: 'daemon.js', description: 'Inspect or restart the optional workflow daemon state.' },
  gc: { script: 'gc.js', description: 'Prune old workflow runtime artifacts.' },
  incident: { script: 'incident.js', description: 'Open or list incident memory entries.' },
  fleet: { script: 'fleet.js', description: 'Show the current repo fleet/operator view.' },
  sessions: { script: 'sessions.js', description: 'List active workflow session surfaces.' },
  'patch-review': { script: 'patch_review.js', description: 'Review collected patch bundles.' },
  'patch-apply': { script: 'patch_apply.js', description: 'Apply a collected patch bundle.' },
  'patch-rollback': { script: 'patch_rollback.js', description: 'Rollback an applied patch bundle.' },
  'audit-repo': { script: 'audit_repo.js', description: 'Run a repo-native full repository health audit with findings, heatmap, and prompt pack outputs.' },
  'repo-proof': { script: 'repo_proof.js', description: 'Generate a compact proof pack for the current repo or an external local snapshot.' },
  'api-surface': { script: 'api_surface.js', description: 'Scan route, middleware, auth, and data-store surfaces for backend/API work.' },
  review: { script: 'review.js', description: 'Generate a review-ready closeout package.' },
  'review-mode': { script: 'review_mode.js', description: 'Run the deep multi-pass review engine.' },
  'review-orchestrate': { script: 'review_orchestrate.js', description: 'Build package/persona/wave-based review orchestration.' },
  'review-tasks': { script: 'review_task_graph.js', description: 'Turn review findings into a blocker-first task graph.' },
  'pr-review': { script: 'pr_review.js', description: 'Review a PR/diff surface with findings and blockers.' },
  're-review': { script: 're_review.js', description: 'Replay the latest review findings against current state.' },
  'ui-direction': { script: 'ui_direction.js', description: 'Generate the taste-aware UI direction pack.' },
  'design-dna': { script: 'design_dna.js', description: 'Generate the external design-reference blend for the target product surface.' },
  'page-blueprint': { script: 'page_blueprint.js', description: 'Generate the page-level section and conversion blueprint.' },
  'design-md': { script: 'design_md.js', description: 'Export a DESIGN.md contract for downstream agent-driven UI work.' },
  'component-strategy': { script: 'component_strategy.js', description: 'Generate reuse/extract/build guidance for the current frontend target.' },
  'design-benchmark': { script: 'design_benchmark.js', description: 'Generate differentiation plays and commodity-risk checks from the selected design blend.' },
  'state-atlas': { script: 'state_atlas.js', description: 'Generate the required UX state atlas for the current frontend slice.' },
  'frontend-brief': { script: 'frontend_brief.js', description: 'Generate the full frontend brief pack after lean surface detection is no longer enough.' },
  'ui-recipe': { script: 'ui_recipe.js', description: 'Generate a framework-aware UI recipe scaffold.' },
  'ui-spec': { script: 'ui_spec.js', description: 'Generate the canonical UI specification.' },
  'ui-plan': { script: 'ui_plan.js', description: 'Generate the UI execution plan.' },
  'ui-review': { script: 'ui_review.js', description: 'Run the frontend review scorecard and evidence pass.' },
  preview: { script: 'preview.js', description: 'Build the latest preview gallery from browser artifacts.' },
  'component-map': { script: 'component_map.js', description: 'Generate the component inventory and reuse map.' },
  'responsive-matrix': { script: 'responsive_matrix.js', description: 'Generate the responsive audit matrix.' },
  'design-debt': { script: 'design_debt.js', description: 'Generate the frontend design debt ledger.' },
  monorepo: { script: 'monorepo.js', description: 'Generate package-aware monorepo execution and verify guidance.' },
  'monorepo-mode': { script: 'monorepo_mode.js', description: 'Run the staged large-monorepo analysis, review, patch-plan, and verify flow.' },
  'ship-readiness': { script: 'ship_readiness.js', description: 'Score ship readiness from review, evidence, approvals, and verify-work.' },
  trust: { script: 'trust_center.js', description: 'Open the trust and governance center that answers whether it is safe to start, merge, or ship.' },
  'release-control': { script: 'release_control.js', description: 'Open the release/change control plane with exports, rollback visibility, and closeout artifacts.' },
  operate: { script: 'operate.js', description: 'Open the unified engineering operating center that refreshes and ranks the core control planes.' },
  'control-plane-publish': { script: 'control_plane_publish.js', description: 'Regenerate GitHub / CI / Slack export bridge artifacts from the current change-control state.' },
  autopilot: { script: 'autopilot.js', description: 'Suggest routine automation lanes, recovery flows, and branch-aware operator routines.' },
  handoff: { script: 'handoff.js', description: 'Compile the knowledge continuity / handoff OS surface for the current work.' },
  'team-control': { script: 'team_control_room.js', description: 'Open the multi-agent / team control room with ownership, waves, and escalations.' },
  'repo-config': { script: 'repo_config.js', description: 'Inspect or materialize the repo-native control-plane configuration and stack profile defaults.' },
  'repo-control': { script: 'repo_control.js', description: 'Open the repo-wide control room with package graph, hotspots, workspaces, and Codex follow-through.' },
  'workspace-impact': { script: 'workspace_impact.js', description: 'Map changed and impacted workspaces, blast radius, and development waves for the current monorepo surface.' },
  'monorepo-control': { script: 'monorepo_control.js', description: 'Open the large-monorepo control room with impact waves, workspace ownership, and verification sequencing.' },
  'frontend-control': { script: 'frontend_control.js', description: 'Open the frontend control room with evidence, state coverage, design debt, and reuse signals.' },
  'safety-control': { script: 'safety_control.js', description: 'Open the safety control room with security posture, failure forecasts, and self-healing repair guidance.' },
  measure: { script: 'measure.js', description: 'Show ROI, throughput, verification, and debt metrics for the workflow product.' },
  explain: { script: 'explain.js', description: 'Explain why the current lane, bundle, and confidence were chosen and what deep mode would add.' },
  lifecycle: { script: 'lifecycle_center.js', description: 'Open install, upgrade, repair, drift, and self-healing lifecycle status in one surface.' },
  ship: { script: 'ship.js', description: 'Generate a ship-ready package.' },
  'pr-brief': { script: 'pr_brief.js', description: 'Generate a PR brief draft.' },
  'release-notes': { script: 'release_notes.js', description: 'Generate release notes.' },
  'session-report': { script: 'session_report.js', description: 'Generate a session report.' },
  update: { script: 'update.js', description: 'Refresh runtime files while preserving canonical markdown.' },
  uninstall: { script: 'uninstall.js', description: 'Safely remove installed runtime surfaces.' },
  benchmark: { script: 'benchmark.js', description: 'Measure hot-path command timings and cache metrics.' },
};

const CLI_COMMAND_PROFILES = Object.freeze({
  pilot: [
    'on',
    'launch',
    'codex',
    'do',
    'audit',
    'repo-proof',
    'fix',
    'verify',
    'note',
    'thread',
    'backlog',
    'manager',
    'dashboard',
    'setup',
    'init',
    'milestone',
    'doctor',
    'health',
    'repair',
    'spec',
    'plan',
    'build',
    'test',
    'simplify',
    'hud',
    'next',
    'verify-shell',
    'verify-work',
    'checkpoint',
    'next-prompt',
    'quick',
    'team',
    'review',
    'monorepo',
    'ship-readiness',
    'update',
    'uninstall',
  ],
});

const COMMAND_GROUPS = Object.freeze([
  {
    id: 'solo',
    title: 'Solo Daily Loop',
    description: 'Single-operator setup, routing, continuity, and daily execution surfaces.',
    commands: [
      'setup', 'init', 'doctor', 'health', 'repair', 'on', 'launch', 'start', 'do', 'audit', 'fix', 'verify', 'note', 'thread', 'backlog',
      'hud', 'manager', 'next', 'explore', 'checkpoint', 'next-prompt', 'quick', 'milestone', 'milestone-edit',
    ],
  },
  {
    id: 'review',
    title: 'Deep Review',
    description: 'Route risk, run review passes, collect evidence, and clear ship gates.',
    commands: [
      'route', 'audit-repo', 'repo-proof', 'review', 'review-mode', 'monorepo-mode', 'review-orchestrate', 'review-tasks', 'pr-review', 're-review',
      'verify-shell', 'verify-browser', 'verify-work', 'packet', 'evidence', 'validation-map', 'api-surface',
      'ship-readiness',
    ],
  },
  {
    id: 'planes',
    title: 'Product Control Planes',
    description: 'Repo-native control planes that compress many capabilities into a few operator surfaces.',
    commands: [
      'repo-config', 'repo-control', 'monorepo-control', 'frontend-control', 'safety-control', 'trust', 'release-control', 'operate', 'control-plane-publish', 'autopilot', 'handoff', 'team-control', 'measure', 'explain', 'lifecycle',
    ],
  },
  {
    id: 'team',
    title: 'Team Parallel',
    description: 'Plan bounded parallel work, collect patches, and operate at package scope.',
    commands: [
      'team', 'subagents', 'workspaces', 'workspace-impact', 'sessions', 'patch-review', 'patch-apply', 'patch-rollback', 'monorepo',
    ],
  },
  {
    id: 'frontend',
    title: 'Frontend',
    description: 'Direction, spec, review, preview, and design debt surfaces for UI work.',
    commands: [
      'ui-direction', 'design-dna', 'page-blueprint', 'design-md', 'component-strategy', 'design-benchmark', 'state-atlas', 'frontend-brief', 'ui-recipe', 'ui-spec', 'ui-plan', 'ui-review', 'preview', 'component-map', 'responsive-matrix', 'design-debt',
    ],
  },
  {
    id: 'trust',
    title: 'Trust And Governance',
    description: 'Discuss, assumptions, claims, approvals, and policy-backed guardrails.',
    commands: [
      'discuss', 'questions', 'assumptions', 'claims', 'secure', 'policy', 'approval', 'approvals',
    ],
  },
  {
    id: 'runtime',
    title: 'Runtime And Operator Center',
    description: 'Dashboard, telemetry, hooks, daemon, incident memory, and cleanup surfaces.',
    commands: [
      'dashboard', 'supervisor', 'stats', 'profile', 'hooks', 'mcp', 'notify', 'daemon', 'gc', 'incident', 'fleet',
    ],
  },
  {
    id: 'codex',
    title: 'Codex And Lifecycle',
    description: 'Codex control-plane actions and repo closeout packages.',
    commands: [
      'codex', 'ship', 'pr-brief', 'release-notes', 'session-report', 'update', 'uninstall', 'benchmark',
    ],
  },
]);

const GOLDEN_FLOWS = Object.freeze([
  {
    id: 'solo',
    title: 'Solo Daily Loop',
    summary: 'Best default for a single operator moving one safe slice at a time.',
    commands: ['on', 'start', 'do', 'next', 'verify-shell', 'checkpoint', 'next-prompt', 'quick', 'milestone'],
    sequence: [
      'rai setup',
      'rai on next',
      'rai doctor --strict',
      'rai milestone --id M1 --name "Initial slice" --goal "Land the next safe slice"',
      'rai start slice --goal "land the next safe slice"',
      'rai do "land the next safe slice"',
      'rai next',
      'rai checkpoint --next "Resume here"',
    ],
    relatedGroup: 'solo',
  },
  {
    id: 'review',
    title: 'Deep Review',
    summary: 'Use when the main job is understanding risk, regressions, or readiness to ship.',
    commands: ['audit', 'fix', 'verify', 'review', 'review-tasks', 'ui-review', 'ship-readiness', 'ship'],
    sequence: [
      'rai audit --goal "review the current diff"',
      'rai fix --goal "address the top verified finding"',
      'rai verify --goal "verify the current review wave"',
      'rai review-tasks --json',
      'rai ui-review --url ./preview.html',
      'rai ship-readiness',
    ],
    relatedGroup: 'review',
  },
  {
    id: 'frontend-flow',
    title: 'Frontend Product Flow',
    summary: 'Use when UI work should feel productized instead of spread across many overlapping commands.',
    commands: ['start', 'do', 'frontend-control', 'ui-direction', 'ui-spec', 'state-atlas', 'component-strategy', 'ui-review'],
    sequence: [
      'rai start frontend --goal "ship the premium dashboard surface"',
      'rai map-frontend --json',
      'rai frontend-control --json',
      'rai ui-direction --goal "ship the premium dashboard surface" --json',
      'rai state-atlas --goal "ship the premium dashboard surface" --json',
      'rai component-strategy --goal "ship the premium dashboard surface" --json',
      'rai ui-review --goal "ship the premium dashboard surface" --json',
    ],
    relatedGroup: 'frontend',
  },
  {
    id: 'monorepo',
    title: 'Large Monorepo',
    summary: 'Use when a large repo needs staged repo mapping, risk ranking, subsystem review, patch planning, and verify discipline.',
    commands: ['audit', 'fix', 'verify', 'workspace-impact', 'monorepo-control', 'monorepo', 'monorepo-mode', 'review-mode', 'review-tasks', 'ship-readiness'],
    sequence: [
      'rai audit --goal "full repo audit et ve en riskli alanlari sirala"',
      'rai workspace-impact --json',
      'rai monorepo-control --json',
      'rai fix --goal "review and patch the top-risk monorepo subsystem"',
      'rai review-mode --goal "deep review the selected subsystem"',
      'rai review-tasks --json',
      'rai verify --goal "verify the monorepo correction wave"',
      'rai ship-readiness',
    ],
    relatedGroup: 'review',
  },
  {
    id: 'planes',
    title: 'Product Control Planes',
    summary: 'Use when the repo should feel like a small operating product instead of a bag of separate commands.',
    commands: [
      'operate', 'repo-config', 'repo-control', 'monorepo-control', 'frontend-control', 'safety-control', 'trust', 'release-control', 'control-plane-publish', 'autopilot', 'handoff', 'team-control', 'measure', 'explain', 'lifecycle', 'telemetry',
    ],
    sequence: [
      'rai operate --refresh --json',
      'rai repo-config --write --json',
      'rai repo-control --json',
      'rai monorepo-control --json',
      'rai frontend-control --json',
      'rai safety-control --json',
      'rai trust --json',
      'rai release-control --json',
      'rai control-plane-publish --json',
      'rai autopilot --json',
      'rai handoff --json',
      'rai team-control --json',
      'rai measure --json',
      'rai explain --json',
      'rai lifecycle --json',
      'rai telemetry routing --json',
    ],
    relatedGroup: 'planes',
  },
  {
    id: 'team',
    title: 'Team Parallel',
    summary: 'Use when the user explicitly wants parallel work with bounded write scopes.',
    commands: ['workspace-impact', 'monorepo', 'team', 'subagents', 'patch-review', 'sessions'],
    sequence: [
      'rai workspace-impact --json',
      'rai monorepo',
      'rai team run --adapter hybrid --activation-text "parallel yap" --write-scope src,tests',
      'rai team collect --patch-first',
      'rai team mailbox',
      'rai patch-review',
    ],
    relatedGroup: 'team',
  },
]);

const CORE_COMMANDS = ['setup', 'on', 'doctor', 'start', 'do', 'audit', 'fix', 'verify', 'trust', 'release-control', 'operate', 'next', 'review', 'team'];
const LIFECYCLE_COMMANDS = ['spec', 'plan', 'build', 'test', 'simplify', 'review', 'ship', 'telemetry'];

const LEGACY_EQUIVALENTS = [
  ['rai on', 'npm run raiola:on -- next'],
  ['rai milestone', 'npm run raiola:milestone -- --id Mx --name "..." --goal "..."'],
  ['rai doctor', 'npm run raiola:doctor -- --strict'],
  ['rai health', 'npm run raiola:health -- --strict'],
  ['rai repair', 'npm run raiola:repair -- --kind health'],
  ['rai discuss', 'npm run raiola:discuss'],
  ['rai assumptions', 'npm run raiola:assumptions'],
  ['rai hud', 'npm run raiola:hud -- --compact'],
  ['rai next', 'npm run raiola:next'],
  ['rai launch', 'npm run raiola:launch'],
  ['rai manager', 'npm run raiola:manager'],
  ['rai dashboard', 'npm run raiola:dashboard'],
  ['rai do', 'npm run raiola:do -- "..."'],
  ['rai audit', 'npm run raiola:audit -- --goal "..."'],
  ['rai repo-proof', 'npm run rai -- repo-proof -- --repo ../candidate-repo --json'],
  ['rai fix', 'npm run raiola:fix -- --goal "..."'],
  ['rai verify', 'npm run raiola:verify -- --goal "..."'],
  ['rai note', 'npm run raiola:note -- "..."'],
  ['rai packet', 'npm run raiola:packet -- --step plan'],
  ['rai explore', 'npm run raiola:explore -- "query"'],
  ['rai verify-shell', 'npm run raiola:verify-shell -- --cmd "npm test"'],
  ['rai verify-browser', 'npm run raiola:verify-browser -- --url http://localhost:3000'],
  ['rai verify-work', 'npm run raiola:verify-work'],
  ['rai next-prompt', 'npm run raiola:next-prompt'],
  ['rai checkpoint', 'npm run raiola:checkpoint -- --next "Resume here"'],
  ['rai spec', 'npm run raiola:spec -- --goal "..."'],
  ['rai plan', 'npm run raiola:plan -- --goal "..."'],
  ['rai build', 'npm run raiola:build -- --goal "..."'],
  ['rai test', 'npm run raiola:test -- --cmd "npm test"'],
  ['rai simplify', 'npm run raiola:simplify -- --scope "changed files"'],
  ['rai quick', 'npm run raiola:quick'],
  ['rai team', 'npm run raiola:team'],
  ['rai subagents', 'npm run raiola:subagents -- plan'],
  ['rai approval', 'npm run raiola:approval -- plan'],
  ['rai review', 'npm run raiola:review'],
  ['rai review-mode', 'npm run raiola:review-mode'],
  ['rai monorepo-mode', 'npm run raiola:monorepo-mode'],
  ['rai review-tasks', 'npm run raiola:review-tasks'],
  ['rai pr-review', 'npm run raiola:pr-review'],
  ['rai re-review', 'npm run raiola:re-review'],
  ['rai ui-spec', 'npm run raiola:ui-spec'],
  ['rai design-dna', 'npm run raiola:design-dna'],
  ['rai page-blueprint', 'npm run raiola:page-blueprint'],
  ['rai design-md', 'npm run raiola:design-md'],
  ['rai component-strategy', 'npm run raiola:component-strategy'],
  ['rai design-benchmark', 'npm run raiola:design-benchmark'],
  ['rai state-atlas', 'npm run raiola:state-atlas'],
  ['rai frontend-brief', 'npm run raiola:frontend-brief'],
  ['rai ui-recipe', 'npm run raiola:ui-recipe'],
  ['rai ui-plan', 'npm run raiola:ui-plan'],
  ['rai ui-review', 'npm run raiola:ui-review'],
  ['rai preview', 'npm run raiola:preview'],
  ['rai component-map', 'npm run raiola:component-map'],
  ['rai responsive-matrix', 'npm run raiola:responsive-matrix'],
  ['rai design-debt', 'npm run raiola:design-debt'],
  ['rai operate', 'npm run raiola:operate'],
  ['rai repo-config', 'npm run raiola:repo-config'],
  ['rai repo-control', 'npm run raiola:repo-control'],
  ['rai frontend-control', 'npm run raiola:frontend-control'],
  ['rai control-plane-publish', 'npm run raiola:control-plane-publish'],
  ['rai trust', 'npm run raiola:trust'],
  ['rai release-control', 'npm run raiola:release-control'],
  ['rai autopilot', 'npm run raiola:autopilot'],
  ['rai handoff', 'npm run raiola:handoff'],
  ['rai team-control', 'npm run raiola:team-control'],
  ['rai measure', 'npm run raiola:measure'],
  ['rai explain', 'npm run raiola:explain'],
  ['rai lifecycle', 'npm run raiola:lifecycle'],
  ['rai ship-readiness', 'npm run raiola:ship-readiness'],
  ['rai ship', 'npm run raiola:ship'],
  ['rai pr-brief', 'npm run raiola:pr-brief'],
  ['rai release-notes', 'npm run raiola:release-notes'],
  ['rai session-report', 'npm run raiola:session-report'],
];

function validateCommandGroups() {
  const knownCommands = new Set(Object.keys(CLI_COMMANDS));
  const seen = new Set();
  for (const group of COMMAND_GROUPS) {
    for (const command of group.commands) {
      if (!knownCommands.has(command)) {
        throw new Error(`Unknown help command in group ${group.id}: ${command}`);
      }
      if (seen.has(command)) {
        throw new Error(`Command ${command} appears in multiple help groups.`);
      }
      seen.add(command);
    }
  }

  const missing = [...knownCommands].filter((command) => !seen.has(command) && !LIFECYCLE_COMMANDS.includes(command));
  if (missing.length > 0) {
    throw new Error(`COMMAND_GROUPS is missing commands: ${missing.join(', ')}`);
  }
}

validateCommandGroups();

function formatCommandRows(commands) {
  return commands
    .map((command) => `  ${command.padEnd(16)} ${CLI_COMMANDS[command].description}`)
    .join('\n');
}

function workflowScriptPath(scriptName) {
  return path.join(__dirname, '..', 'workflow', scriptName);
}

function commandSetForSurface(surface) {
  const knownCommands = Object.keys(CLI_COMMANDS);
  const expectedCommands = CLI_COMMAND_PROFILES[surface.scriptProfile] || knownCommands;
  return expectedCommands.filter((command) => fs.existsSync(workflowScriptPath(CLI_COMMANDS[command].script)));
}

function buildSurfaceContext(cwd = process.cwd()) {
  const manifest = readProductManifest(cwd);
  const scriptProfile = String(manifest?.scriptProfile || 'full').trim().toLowerCase();
  const availableCommands = new Set(commandSetForSurface({ scriptProfile }));
  return {
    manifest,
    scriptProfile,
    availableCommands,
    isFiltered: scriptProfile === 'pilot',
  };
}

function filterCommands(commands, surface) {
  return commands.filter((command) => surface.availableCommands.has(command));
}

function isFlowAvailable(flow, surface) {
  return flow.commands.every((command) => surface.availableCommands.has(command));
}

function visibleGroupsForSurface(surface) {
  return COMMAND_GROUPS
    .map((group) => ({ ...group, commands: filterCommands(group.commands, surface) }))
    .filter((group) => group.commands.length > 0);
}

function visibleAdvancedGroupsForSurface(surface) {
  return visibleGroupsForSurface(surface).filter((group) => ['frontend', 'trust', 'runtime', 'codex'].includes(group.id));
}

function upgradeHintForSurface(surface) {
  if (surface.scriptProfile === 'pilot') {
    return 'Run `rai update --script-profile core` for the full shell with curated npm aliases, or `rai update --script-profile full` for every repo-local fallback alias.';
  }
  return 'Run `rai doctor --strict` or `rai update` to repair the local shell.';
}

function printUnavailableSurface(topic, surface) {
  console.error(`The \`${topic}\` surface is not installed in this repo's current shell.`);
  console.error(upgradeHintForSurface(surface));
  process.exitCode = 1;
}

function groupById(groupId) {
  return COMMAND_GROUPS.find((group) => group.id === groupId) || null;
}

function flowById(flowId) {
  return GOLDEN_FLOWS.find((flow) => flow.id === flowId) || null;
}

function printDefaultHelp() {
  console.log(`# raiola

Usage:
  rai <command> [options]
  rai help <topic>

Start here:
  rai on next        First-run onboarding that proposes a milestone to start
  rai start --goal "..." Productized workflow bundle that groups overlapping commands
  rai audit "..."    Intent-level audit surface for repo, diff, or UI review
  rai fix "..."      Intent-level correction surface for the next bounded wave
  rai verify "..."   Intent-level verify surface with audit-aware trust gates
  rai help quickstart  Five-minute path for blank repos, existing repos, UI work, and monorepos
  rai help solo      Single-operator daily loop for most repos
  rai help review    Deep review, risk triage, and closeout
  rai help monorepo  Large-repo staged analysis, impact mapping, patch planning, and verify flow
  rai help team      Parallel Team Lite flow with bounded scopes
  rai trust          Trust center for start / merge / ship safety
  rai release-control Release / change control with exports and rollback
  rai operate        Unified engineering operating center over the core planes

Core commands:
${formatCommandRows(CORE_COMMANDS)}

Lifecycle facade:
${formatCommandRows(LIFECYCLE_COMMANDS)}

Golden flows:
  solo         -> rai start, rai do, rai next, rai verify-shell, rai checkpoint, rai next-prompt
  review       -> rai audit, rai fix, rai verify, rai ui-review, rai ship-readiness
  planes       -> rai operate, rai repo-config, rai trust, rai release-control, rai handoff
  frontend-flow -> rai start frontend, rai map-frontend, rai ui-direction, rai ui-review
  monorepo     -> rai audit, rai fix, rai review-mode, rai review-tasks, rai verify
  team         -> rai monorepo, rai team run, rai patch-review, rai sessions

More help:
  rai help quickstart   Five-minute path for blank repos, existing repos, UI work, and monorepos
  rai help lifecycle    Thin spec -> ship facade over the deeper workflow engine
  rai help bundles      Browse packaged workflow bundles for rai start
  rai help categories   Browse command groups
  rai help frontend     UI direction, spec, review, and preview surfaces
  rai help trust        Discuss, claims, approvals, and policy surfaces
  rai help runtime      Dashboard, telemetry, daemon, and fleet surfaces
  rai help codex        Codex control plane and closeout packages
  rai help all          Full command reference
  rai help planes       Repo-native repo/monorepo/trust/release/autopilot/handoff planes
  rai operate --refresh Unified operator entry that refreshes the planes

Examples:
  rai setup
  rai on next
  rai start --goal "land the next safe slice"
  rai audit "full repo audit yap"
  rai fix "top verified findingi kapat"
  rai verify "ship readiness kontrolu"
  rai trust
  rai release-control
  rai operate --refresh
  rai control-plane-publish --json
  rai help solo
  rai help review
  rai help bundles
  rai help monorepo
  rai help team
`);
}

function printFilteredDefaultHelp(surface) {
  const visibleCoreCommands = filterCommands(CORE_COMMANDS, surface);
  const visibleFlows = GOLDEN_FLOWS.filter((flow) => isFlowAvailable(flow, surface));
  const visibleAdvancedGroups = visibleAdvancedGroupsForSurface(surface);

  console.log(`# raiola

Usage:
  rai <command> [options]
  rai help <topic>

Focused install:
  This repo is using the \`pilot\` shell profile. Upgrade later with \`rai update --script-profile core\` or \`rai update --script-profile full\`.

Start here:`);
  if (visibleFlows.length > 0) {
    for (const flow of visibleFlows) {
      console.log(`  rai help ${flow.id.padEnd(9)} ${flow.summary}`);
    }
  } else {
    console.log('  rai help categories  Browse the currently installed command groups');
  }

  console.log(`
Core commands:
${formatCommandRows(visibleCoreCommands)}

Lifecycle facade:
${formatCommandRows(filterCommands(LIFECYCLE_COMMANDS, surface))}

More help:
  rai help quickstart   Five-minute path for blank repos, existing repos, UI work, and monorepos
  rai help lifecycle    Thin spec -> ship facade over the deeper workflow engine
  rai help bundles      Browse packaged workflow bundles for rai start
  rai help categories   Browse command groups`);
  for (const group of visibleAdvancedGroups) {
    console.log(`  rai help ${group.id.padEnd(12)} ${group.description}`);
  }
  console.log(`
Examples:
  rai on next
  rai start --goal "land the next safe slice"
  rai help solo
  rai do "land the next safe slice"
  rai next
`);
}

function printCategoriesHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Categories\n');
    for (const group of COMMAND_GROUPS) {
      console.log(`- \`${group.id}\` -> ${group.title}: ${group.description}`);
    }
    console.log('\nUse `rai help <category>` for the commands inside a category, or `rai help all` for the full shell.');
    return;
  }

  console.log('# raiola Categories\n');
  for (const group of visibleGroupsForSurface(surface)) {
    console.log(`- \`${group.id}\` -> ${group.title}: ${group.description}`);
  }
  console.log('\nUse `rai help <category>` for the commands inside a category, or `rai help all` for the full shell.');
}

function printBundlesHelp() {
  console.log('# raiola Workflow Bundles\n');
  console.log('- `rai start` is the productized operator entry that groups overlapping commands into structured bundles.\n');
  for (const bundle of listWorkflowBundles()) {
    console.log(`- \`${bundle.id}\` -> ${bundle.summary} (shortcut: \`rai start ${bundle.shorthand || bundle.id} --goal "..."\`)`);
    if ((bundle.supportedProfiles || []).length > 0) {
      console.log(`  - profiles: \`${bundle.supportedProfiles.join(', ')}\``);
    }
    if ((bundle.supportedAddOns || []).length > 0) {
      console.log(`  - add-ons: \`${bundle.supportedAddOns.join(', ')}\``);
    }
  }
  console.log('\n## Start Profiles\n');
  for (const profile of listStartProfiles()) {
    console.log(`- \`${profile.id}\` -> ${profile.summary}`);
  }
  console.log('\n## Start Add-ons\n');
  for (const addOn of listStartAddOns()) {
    console.log(`- \`${addOn.id}\` -> ${addOn.summary}`);
  }
  console.log('\nUse `rai help <bundle-id>` for bundle details, or run `rai help start` for the command surface itself.');
}

function printBundleHelp(bundle) {
  console.log(`# raiola ${bundle.label}\n`);
  console.log(`- ${bundle.summary}`);
  console.log(`- Starter command: \`${bundle.starterCommand}\``);
  if ((bundle.aliases || []).length > 0) {
    console.log(`- Aliases: \`${bundle.aliases.join(', ')}\``);
  }
  if ((bundle.supportedProfiles || []).length > 0) {
    console.log(`- Profiles: \`${bundle.supportedProfiles.join(', ')}\``);
  }
  if ((bundle.supportedAddOns || []).length > 0) {
    console.log(`- Add-ons: \`${bundle.supportedAddOns.join(', ')}\``);
  }
  if ((bundle.relatedBundles || []).length > 0) {
    console.log(`- Related bundles: \`${bundle.relatedBundles.join(', ')}\``);
  }
  if ((bundle.useWhen || []).length > 0) {
    console.log('\n## Use When\n');
    for (const entry of bundle.useWhen) {
      console.log(`- ${entry}`);
    }
  }
  if ((bundle.outcomes || []).length > 0) {
    console.log('\n## Outcomes\n');
    for (const entry of bundle.outcomes) {
      console.log(`- ${entry}`);
    }
  }
}

function printFlowHelp(flow) {
  const relatedGroup = groupById(flow.relatedGroup);
  const summary = flow.summary || flow.description || 'No summary provided.';
  const sequence = Array.isArray(flow.sequence) ? flow.sequence : [];
  console.log(`# raiola ${flow.title}\n`);
  console.log(`- Summary: \`${summary}\``);
  console.log('\n## Starter Commands\n');
  console.log(formatCommandRows(flow.commands));
  console.log('\n## Suggested Sequence\n');
  if (sequence.length === 0) {
    console.log('- `No suggested sequence was recorded.`');
  }
  for (const command of sequence) {
    console.log(`- \`${command}\``);
  }
  if (relatedGroup) {
    const relatedCommand = relatedGroup.id === flow.id ? 'rai help all' : `rai help ${relatedGroup.id}`;
    const relatedDescription = relatedGroup.id === flow.id
      ? `Full command reference including the ${relatedGroup.title.toLowerCase()} surfaces.`
      : relatedGroup.description;
    console.log(`\n## Related Category\n\n- \`${relatedCommand}\` -> ${relatedDescription}`);
  }
}

function printGroupHelp(group) {
  console.log(`# raiola ${group.title}\n`);
  console.log(`- ${group.description}`);
  console.log('\n## Commands\n');
  console.log(formatCommandRows(group.commands));
}

function printAdvancedHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Advanced\n');
    console.log('- `frontend` -> UI direction, review, responsive, and design debt surfaces');
    console.log('- `trust` -> discuss, assumptions, claims, approvals, and policy');
    console.log('- `runtime` -> dashboard, stats, hooks, daemon, gc, incident, and fleet');
    console.log('- `codex` -> control plane, prompt packs, lifecycle closeout, and benchmark');
    console.log('\nOpen any of them with `rai help <topic>` or use `rai help all` for the full command reference.');
    return;
  }

  console.log('# raiola Advanced\n');
  for (const group of visibleAdvancedGroupsForSurface(surface)) {
    console.log(`- \`${group.id}\` -> ${group.description}`);
  }
  console.log('\nOpen any of them with `rai help <topic>` or use `rai help all` for the full command reference.');
}

function printQuickstartHelp(surface) {
  const starterSurface = ['start', 'do', 'next', 'verify']
    .filter((command) => !surface.isFiltered || surface.availableCommands.has(command));
  const upgradeHint = surface.isFiltered
    ? `- Advanced surfaces stay hidden in the \`pilot\` shell until you ask for them. ${upgradeHintForSurface(surface)}`
    : '- Advanced surfaces are optional. Stay on the starter surface until the repo shape forces a deeper lane.';

  console.log('# raiola Quickstart\n');
  console.log('- Goal: get useful in the first five minutes without learning the whole product.');
  console.log(`- Starter surface: \`${starterSurface.join(', ')}\``);
  console.log(upgradeHint);
  console.log('\n## Existing repo\n');
  console.log('- `rai setup`');
  console.log('- `rai doctor --strict`');
  console.log('- `rai start recommend --goal "fix the next safe slice and verify it"`');
  console.log('- `rai next`');
  console.log('\n## Blank repo\n');
  console.log('- `rai on next`');
  console.log('- `rai milestone --id M1 --name "Initial slice" --goal "Land the first safe slice"`');
  console.log('- `rai start --goal "land the first safe slice"`');
  console.log('- `rai checkpoint --next "Resume from the next recommended step"`');
  console.log('\n## Frontend repo\n');
  console.log('- `rai start recommend --goal "ship the dashboard surface"`');
  console.log('- `rai start frontend --goal "ship the dashboard surface" --with browser|docs`');
  console.log('- `rai verify-browser --url http://localhost:3000`');
  console.log('\n## Large monorepo\n');
  console.log('- `rai start monorepo --goal "review and patch the top-risk subsystem"`');
  console.log('- `rai workspace-impact --json`');
  console.log('- `rai verify --goal "verify the correction wave"`');
  console.log('\n## External repo snapshot\n');
  console.log('- `rai repo-proof --repo ../candidate-repo --json`');
  console.log('- `rai api-surface --repo ../candidate-repo --json`');
  console.log('- `rai audit-repo --repo ../candidate-repo --goal "audit the snapshot" --json`');
  console.log('\n## Stop here by default\n');
  console.log('- `rai start` -> choose the lane');
  console.log('- `rai do` -> route a natural-language request');
  console.log('- `rai next` -> continue from live state');
  console.log('- `rai verify` -> ask whether the slice is safe to merge or ship');
}

function printLifecycleHelp(surface) {
  const commands = surface.isFiltered ? filterCommands(LIFECYCLE_COMMANDS, surface) : LIFECYCLE_COMMANDS;
  console.log('# raiola Lifecycle\n');
  console.log('- Thin spec -> ship facade that maps onto the deeper Raiola workflow engine.\n');
  console.log('## Commands\n');
  console.log(formatCommandRows(commands));
  console.log('\n## Suggested Use\n');
  console.log('- `rai spec` -> define scope, assumptions, and success criteria');
  console.log('- `rai plan` -> chunk the slice and align validation');
  console.log('- `rai build` -> execute the next safe slice');
  console.log('- `rai test` -> prove the slice works with explicit evidence');
  console.log('- `rai simplify` -> run a behavior-preserving cleanup pass');
  console.log('- `rai review` -> generate the review-ready package');
  console.log('- `rai ship` -> generate the ship-ready closeout package');
}

function printAllHelp(surface) {
  if (!surface.isFiltered) {
    console.log('# raiola Full Command Reference\n');
    console.log('Use `rai help solo`, `rai help review`, `rai help monorepo`, or `rai help team` for the starter flows.\n');
    console.log('## Lifecycle\n');
    console.log('Thin spec -> ship facade over the deeper workflow engine.\n');
    console.log(`${formatCommandRows(LIFECYCLE_COMMANDS)}\n`);
    for (const group of COMMAND_GROUPS) {
      console.log(`## ${group.title}\n`);
      console.log(`${group.description}\n`);
      console.log(`${formatCommandRows(group.commands)}\n`);
    }
    console.log('## Npm Fallback Commands\n');
    for (const [current, legacy] of LEGACY_EQUIVALENTS) {
      console.log(`- \`${current}\` -> \`${legacy}\``);
    }
    return;
  }

  console.log('# raiola Full Command Reference\n');
  console.log('Use `rai help solo` for the installed starter flow. Upgrade to `core` or `full` to unlock the broader shell.\n');
  console.log('## Lifecycle\n');
  console.log('Thin spec -> ship facade over the deeper workflow engine.\n');
  console.log(`${formatCommandRows(filterCommands(LIFECYCLE_COMMANDS, surface))}\n`);
  for (const group of visibleGroupsForSurface(surface)) {
    console.log(`## ${group.title}\n`);
    console.log(`${group.description}\n`);
    console.log(`${formatCommandRows(group.commands)}\n`);
  }
  console.log('## Installed Npm Fallback Commands\n');
  for (const [current, legacy] of LEGACY_EQUIVALENTS.filter(([current]) => surface.availableCommands.has(current.replace(/^rai\s+/, '')))) {
    console.log(`- \`${current}\` -> \`${legacy}\``);
  }
}

function printHelp(topic, surface) {
  const normalized = String(topic || '').trim().toLowerCase();
  if (!normalized) {
    if (surface.isFiltered) {
      printFilteredDefaultHelp(surface);
      return;
    }
    printDefaultHelp();
    return;
  }
  if (normalized === 'all') {
    printAllHelp(surface);
    return;
  }
  if (normalized === 'categories') {
    printCategoriesHelp(surface);
    return;
  }
  if (normalized === 'bundles') {
    printBundlesHelp(surface);
    return;
  }
  if (normalized === 'advanced') {
    printAdvancedHelp(surface);
    return;
  }
  if (['quickstart', 'start-here', '5min', '5-minute'].includes(normalized)) {
    printQuickstartHelp(surface);
    return;
  }
  if (normalized === 'lifecycle') {
    printLifecycleHelp(surface);
    return;
  }

  const flow = flowById(normalized);
  if (flow && isFlowAvailable(flow, surface)) {
    printFlowHelp(flow);
    return;
  }

  const group = visibleGroupsForSurface(surface).find((entry) => entry.id === normalized) || null;
  if (group) {
    printGroupHelp(group);
    return;
  }

  if (flow || groupById(normalized)) {
    const missingCommands = (flow?.commands || groupById(normalized)?.commands || []).filter((command) => !surface.availableCommands.has(command));
    printUnavailableSurface(missingCommands[0] || normalized, surface);
    return;
  }

  const bundle = findWorkflowBundle(normalized);
  if (bundle) {
    if (surface.isFiltered && !surface.availableCommands.has('start')) {
      printUnavailableSurface('start', surface);
      return;
    }
    printBundleHelp(bundle);
    return;
  }

  if (groupById(normalized)) {
    printUnavailableSurface(normalized, surface);
    return;
  }

  const commandHelp = CLI_COMMANDS[normalized];
  if (commandHelp) {
    runScript(normalized, commandHelp.script, ['--help'], surface);
    return;
  }

  console.error(`Unknown help topic: ${topic}`);
  console.error('Run `rai help categories` to browse available help topics.');
  process.exitCode = 1;
}

function runScript(command, scriptName, forwardedArgs, surface) {
  if (surface.isFiltered && !surface.availableCommands.has(command)) {
    printUnavailableSurface(command, surface);
    return;
  }

  const scriptPath = workflowScriptPath(scriptName);
  if (!fs.existsSync(scriptPath)) {
    printUnavailableSurface(command, surface);
    return;
  }

  const result = childProcess.spawnSync(process.execPath, [scriptPath, ...forwardedArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return;
  }

  if (result.error) {
    throw result.error;
  }
}

function main(argv = process.argv.slice(2)) {
  const surface = buildSurfaceContext(process.cwd());
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp(rest[0], surface);
    return;
  }

  const entry = CLI_COMMANDS[command];
  if (!entry) {
    console.error(`Unknown command: ${command}`);
    console.error('Run `rai help` for the starter flows or `rai help all` for the full shell.');
    process.exitCode = 1;
    return;
  }

  if (rest.includes('--help') || rest.includes('help')) {
    runScript(command, entry.script, ['--help'], surface);
    return;
  }

  runScript(command, entry.script, rest, surface);
}

if (require.main === module) {
  main();
}

module.exports = {
  CLI_COMMANDS,
  COMMAND_GROUPS,
  GOLDEN_FLOWS,
  LEGACY_EQUIVALENTS,
  main,
};
