const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBridge = path.join(repoRoot, 'scripts', 'workflow', 'adapter_hooks_bridge.js');

function makeTempRepo(prefix = 'raiola-claude-adapter-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(fixtureRoot, tempDir, { recursive: true });
  return tempDir;
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

function hookWrapper(hookName) {
  return `#!/usr/bin/env node\nconst { runAdapterHookFromProcess } = require(${JSON.stringify(sourceBridge)});\nconst result = runAdapterHookFromProcess({ adapter: 'claude', hook: ${JSON.stringify(hookName)}, cwd: process.cwd() });\nif (!result.ok) {\n  process.exitCode = 1;\n}\n`;
}

function installClaudeFixture(targetRepo, options = {}) {
  const commandBody = options.commandBody || '# Review\nFocus on the highest-risk slice first.\n';
  writeFile(targetRepo, '.claude/commands/review.md', commandBody);
  writeFile(targetRepo, '.claude/hooks/session_start.js', hookWrapper('SessionStart'));
  writeFile(targetRepo, '.claude/hooks/pre_tool_use.js', hookWrapper('PreToolUse'));
  writeFile(targetRepo, '.claude/hooks/post_tool_use.js', hookWrapper('PostToolUse'));
  writeFile(targetRepo, '.claude/hooks/session_end.js', hookWrapper('SessionEnd'));
  writeFile(targetRepo, '.claude-plugin/plugin.json', `${JSON.stringify({
    name: 'raiola',
    version: '0.5.0',
    commands: './.claude/commands',
    hooks: {
      SessionStart: './.claude/hooks/session_start.js',
      PreToolUse: './.claude/hooks/pre_tool_use.js',
      PostToolUse: './.claude/hooks/post_tool_use.js',
      SessionEnd: './.claude/hooks/session_end.js',
    },
  }, null, 2)}\n`);
  return targetRepo;
}

function runHook(targetRepo, hookScript, payload = null) {
  const fullPath = path.join(targetRepo, '.claude', 'hooks', hookScript);
  return childProcess.execFileSync('node', [fullPath], {
    cwd: targetRepo,
    input: payload == null ? '' : `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

module.exports = {
  installClaudeFixture,
  makeTempRepo,
  repoRoot,
  runHook,
  writeFile,
};
