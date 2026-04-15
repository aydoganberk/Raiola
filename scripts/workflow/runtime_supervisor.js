const fs = require('node:fs');
const path = require('node:path');
const {
  parseArgs,
  resolveWorkflowRoot,
  safeExec,
  listGitChanges,
} = require('./common');
const {
  ensureDir,
  writeTextIfChanged: writeIfChanged,
} = require('./io/files');
const { readJsonIfExists, runtimePath, listLatestEntries } = require('./runtime_helpers');
const { buildLifecycleCenterPayload } = require('./lifecycle_center');
const { buildOperatingCenterPayload } = require('./operate');
const { checkPolicy } = require('./policy');
function printHelp(){ console.log(`
runtime_supervisor

Usage:
  node scripts/workflow/runtime_supervisor.js [--json]

Options:
  --root <path>       Workflow root. Defaults to active workstream root
  --watch             Re-render live control room until interrupted
  --interval <ms>     Watch interval. Defaults to 2000
  --tui               Render terminal control room instead of markdown summary
  --json              Print machine-readable output
  `); }
function relativePath(fromDir, targetPath){ return path.relative(fromDir,targetPath).replace(/\\/g,'/'); }
function readLatestMeta(baseDir, limit=1){ return listLatestEntries(baseDir,limit).map((entry)=>({ id:entry.name, path:entry.fullPath, meta: readJsonIfExists(path.join(entry.fullPath,'meta.json'))||{} })); }
function parseWorktrees(cwd){ const result=safeExec('git',['worktree','list','--porcelain'],{cwd}); if(!result.ok) return []; const rows=[]; let current=null; for(const line of String(result.stdout||'').split('\n')){ if(line.startsWith('worktree ')){ if(current) rows.push(current); current={ path: line.slice(9).trim() }; continue; } if(!current||!line.trim()) continue; if(line.startsWith('branch ')) current.branch=line.slice(7).trim().replace('refs/heads/',''); if(line==='detached') current.detached=true; if(line==='locked') current.locked=true; } if(current) rows.push(current); return rows; }
function summarizePolicy(cwd){ const files=['package.json','docs/architecture.md','scripts/workflow/policy.js','.env.example'].filter((f)=> fs.existsSync(path.join(cwd,f))); if(files.length===0) return { verdict:'pass', results:[] }; return checkPolicy(cwd,{ files: files.join(';'), operation:'edit', actor:'worker', mode:'strict' }); }
function buildSupervisorPayload(cwd, rootDir, args={}){ const lifecycle=buildLifecycleCenterPayload(cwd,rootDir,args); const operating=buildOperatingCenterPayload(cwd,rootDir,args); const policy=summarizePolicy(cwd); const changes=(()=>{ try { return listGitChanges(cwd);} catch { return []; } })(); const browser=readLatestMeta(path.join(cwd,'.workflow','verifications','browser'),2); const shell=readLatestMeta(path.join(cwd,'.workflow','verifications','shell'),2); const worktrees=parseWorktrees(cwd).map((entry)=>({ path: relativePath(cwd,entry.path), branch: entry.branch||'detached', detached:Boolean(entry.detached), locked:Boolean(entry.locked) })); const releaseControl=readJsonIfExists(path.join(cwd,'.workflow','reports','release-control.json')); const trustCenter=readJsonIfExists(path.join(cwd,'.workflow','reports','trust-center.json')); const teamControl=readJsonIfExists(path.join(cwd,'.workflow','reports','team-control-room.json')); const nextActions=[]; const addAction=(label,command,reason,priority='medium')=>{ if(!command||nextActions.some((x)=>x.command===command)) return; nextActions.push({label,command,reason,priority}); };
if(operating.primaryCommand) addAction('Follow active plane', operating.primaryCommand, operating.activePlane?.question||'Operating center ranked this first.', operating.verdict==='action-required'?'high':'medium');
if(policy.results?.some((i)=>i.decision==='human_needed'||i.decision==='block')) addAction('Resolve policy blockers','rai policy check --files package.json --operation edit --actor worker --mode strict','Strict worker policy found a gated surface.','high');
if(lifecycle.selfHealing?.actions?.[0]?.command) addAction('Run lifecycle repair', lifecycle.selfHealing.actions[0].command, lifecycle.selfHealing.actions[0].label||'Lifecycle center queued a repair.','high');
if(releaseControl?.verifyStatusBoard?.primaryCommand) addAction('Run verify queue', releaseControl.verifyStatusBoard.primaryCommand, 'Release control already assembled the verify queue.','medium');
if(trustCenter?.priorityActions?.[0]?.command) addAction('Clear trust issue', trustCenter.priorityActions[0].command, trustCenter.priorityActions[0].reason||'Trust center has a priority action.','medium');
const verdicts=[lifecycle.verdict, operating.verdict, policy.verdict]; const verdict = verdicts.includes('hold')||verdicts.includes('fail')||verdicts.includes('action-required') ? 'intervene' : (verdicts.includes('warn')||verdicts.includes('attention-required') ? 'watch' : 'stable');
const payload={ generatedAt:new Date().toISOString(), verdict, lifecycle:{ verdict:lifecycle.verdict, recommendedNext:lifecycle.stateMachine?.recommendedNext||'plan', primaryRuntime:lifecycle.agentRuntime?.primary||'generic', validTransitions:lifecycle.stateMachine?.validTransitions||[] }, operating:{ verdict:operating.verdict, activePlane:operating.activePlane?.title||'Unknown plane', primaryCommand:operating.primaryCommand||'', compressionSummary:operating.compression?.summary||'' }, policy:{ verdict:policy.verdict, gatedCount:(policy.results||[]).filter((i)=>i.decision==='human_needed'||i.decision==='block').length, results:policy.results||[], declarativeFile:policy.declarativeFile||'.workflow/policy.rules' }, worktrees, changes:{ count:changes.length, sample:changes.slice(0,8) }, verifications:{ browser: browser.map((e)=>({id:e.id, verdict:e.meta.verdict||e.meta.summary?.verdict||'unknown'})), shell: shell.map((e)=>({id:e.id, verdict:e.meta.verdict||'unknown'})) }, team:{ status: teamControl?.status||'idle', activeTracks: teamControl?.trackCount || teamControl?.activeTrackCount || 0 }, nextActions, artifacts:{} };
const outDir=runtimePath(cwd,'supervisor'); ensureDir(outDir); const jsonPath=path.join(outDir,'latest.json'); const mdPath=path.join(outDir,'latest.md'); writeIfChanged(jsonPath, `${JSON.stringify(payload,null,2)}\n`); writeIfChanged(mdPath, `${renderSupervisorMarkdown(payload).trimEnd()}\n`); payload.artifacts={ json:relativePath(cwd,jsonPath), markdown:relativePath(cwd,mdPath) }; return payload; }
function renderSupervisorMarkdown(payload){ return ['# RUNTIME SUPERVISOR','',`- Verdict: \`${payload.verdict}\``,`- Lifecycle: \`${payload.lifecycle.verdict}\` -> next \`${payload.lifecycle.recommendedNext}\``,`- Runtime: \`${payload.lifecycle.primaryRuntime}\``,`- Active plane: \`${payload.operating.activePlane}\``,`- Policy gated surfaces: \`${payload.policy.gatedCount}\``,`- Worktrees: \`${payload.worktrees.length}\``,`- Changed files: \`${payload.changes.count}\``,'','## Next Actions','',...(payload.nextActions.length>0 ? payload.nextActions.map((i)=>`- [${i.priority}] ${i.label} -> \`${i.command}\` — ${i.reason}`) : ['- No action is currently queued.'])].join('\n'); }
function pad(value,width){ const t=String(value||''); return t.length>=width ? t.slice(0,width) : `${t}${' '.repeat(width-t.length)}`; }
function renderTui(payload){ const width=process.stdout.columns||100; const divider='─'.repeat(Math.max(20,width-2)); const actions=payload.nextActions.slice(0,6).map((i)=>`${i.priority.toUpperCase()} ${i.label} :: ${i.command}`); return [`┌${divider}┐`,`│ ${pad(`RAIOLA CONTROL ROOM · verdict=${payload.verdict} · runtime=${payload.lifecycle.primaryRuntime}`, width-4)} │`,`├${divider}┤`,`│ ${pad(`Lifecycle: ${payload.lifecycle.verdict} -> next ${payload.lifecycle.recommendedNext}`, width-4)} │`,`│ ${pad(`Plane: ${payload.operating.activePlane}`, width-4)} │`,`│ ${pad(`Policy gated: ${payload.policy.gatedCount} · Worktrees: ${payload.worktrees.length} · Changed files: ${payload.changes.count}`, width-4)} │`,`│ ${pad(`Browser verify: ${(payload.verifications.browser[0]&&payload.verifications.browser[0].verdict)||'none'} · Shell verify: ${(payload.verifications.shell[0]&&payload.verifications.shell[0].verdict)||'none'}`, width-4)} │`,`├${divider}┤`,`│ ${pad('NEXT ACTIONS', width-4)} │`,...((actions.length>0?actions:['No immediate action queued.']).map((line)=>`│ ${pad(line,width-4)} │`)),`└${divider}┘`].join('\n'); }
async function main(){ const args=parseArgs(process.argv.slice(2)); if(args.help||args._.includes('help')){ printHelp(); return; } const cwd=process.cwd(); const rootDir=resolveWorkflowRoot(cwd,args.root); const renderPayload=()=>buildSupervisorPayload(cwd,rootDir,args); if(args.watch){ const intervalMs=Number(args.interval||2000); while(true){ const payload=renderPayload(); process.stdout.write('\x1Bc'); process.stdout.write(`${args.tui?renderTui(payload):renderSupervisorMarkdown(payload)}\n`); await new Promise((r)=>setTimeout(r,intervalMs)); } } const payload=renderPayload(); if(args.json){ console.log(JSON.stringify(payload,null,2)); return; } console.log(args.tui?renderTui(payload):renderSupervisorMarkdown(payload)); }
if(require.main===module){ main().catch((error)=>{ console.error(error.message); process.exitCode=1; }); }
module.exports={ buildSupervisorPayload, renderSupervisorMarkdown, renderTui };
