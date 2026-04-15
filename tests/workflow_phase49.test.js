const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');
const repoRoot = path.resolve(__dirname, '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'large-monorepo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');
function makeTempRepo(prefix){ const tempDir=fs.mkdtempSync(path.join(os.tmpdir(), prefix)); fs.cpSync(fixture,tempDir,{recursive:true}); return tempDir; }
function run(command,args,cwd){ return childProcess.execFileSync(command,args,{cwd,env:process.env,encoding:'utf8',stdio:['pipe','pipe','pipe']}); }
function gitInit(targetRepo){ run('git',['init'],targetRepo); run('git',['config','user.email','test@example.com'],targetRepo); run('git',['config','user.name','Test User'],targetRepo); }
function bootstrapRepo(targetRepo){ run('node',[sourceBin,'setup','--target',targetRepo,'--script-profile','core','--skip-verify'],repoRoot); gitInit(targetRepo); run('git',['add','.'],targetRepo); run('git',['commit','-m','initial state'],targetRepo); return path.join(targetRepo,'bin','rai.js'); }
test('declarative policy rules, runtime supervisor, and terminal control room are available', ()=>{ const targetRepo=makeTempRepo('raiola-phase49-'); const targetBin=bootstrapRepo(targetRepo); fs.mkdirSync(path.join(targetRepo,'.workflow'),{recursive:true}); fs.writeFileSync(path.join(targetRepo,'.workflow','policy.rules'), ['block edit when path=package.json note="Package manifest edits require review."','warn edit when domain=docs note="Docs edits are visible but allowed."','grant docs reason="Docs are pre-approved for this test."'].join('\n')); const policy=JSON.parse(run('node',[targetBin,'policy','check','--files','package.json;docs/architecture.md','--operation','edit','--actor','worker','--json'],targetRepo)); const packageResult=policy.results.find((e)=>e.file==='package.json'); const docsResult=policy.results.find((e)=>e.file==='docs/architecture.md'); assert.equal(packageResult.rule,'dsl:line:1'); assert.equal(packageResult.decision,'block'); assert.equal(docsResult.approved,true); const supervisor=JSON.parse(run('node',[targetBin,'supervisor','--json'],targetRepo)); assert.ok(supervisor.artifacts.json.endsWith('supervisor/latest.json')); assert.ok(fs.existsSync(path.join(targetRepo,supervisor.artifacts.json))); assert.ok(['stable','watch','intervene'].includes(supervisor.verdict)); assert.ok(Array.isArray(supervisor.nextActions)); const dashboardTui=run('node',[targetBin,'dashboard','--tui'],targetRepo); assert.match(dashboardTui,/RAIOLA CONTROL ROOM/); });
