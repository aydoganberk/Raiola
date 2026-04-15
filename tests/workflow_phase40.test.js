const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const blankFixture = path.join(repoRoot, 'tests', 'fixtures', 'blank-repo');
const sourceBin = path.join(repoRoot, 'bin', 'rai.js');

function makeTempRepo(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(blankFixture, tempDir, { recursive: true });
  return tempDir;
}

function run(command, args, cwd, extra = {}) {
  return childProcess.execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...(extra.env || {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeFile(targetRepo, relativeFile, content) {
  const fullPath = path.join(targetRepo, relativeFile);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function gitInit(targetRepo) {
  run('git', ['init'], targetRepo);
  run('git', ['config', 'user.email', 'test@example.com'], targetRepo);
  run('git', ['config', 'user.name', 'Test User'], targetRepo);
}

test('native codex operator layer emits operator packet, managed policy export, and operator assets', () => {
  const targetRepo = makeTempRepo('raiola-phase40-operator-');
  run('node', [sourceBin, 'setup', '--target', targetRepo, '--script-profile', 'core', '--skip-verify'], repoRoot);
  gitInit(targetRepo);

  writeFile(targetRepo, 'package.json', `${JSON.stringify({
    name: 'phase40-operator',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: { test: 'node -e "process.exit(0)"' },
    dependencies: { next: '14.2.0', react: '18.2.0', 'react-dom': '18.2.0' },
  }, null, 2)}
`);
  writeFile(targetRepo, 'pnpm-workspace.yaml', ['packages:', '  - apps/*', '  - packages/*', ''].join('\n'));
  writeFile(targetRepo, 'apps/web/package.json', `${JSON.stringify({ name: 'web', private: true, dependencies: { next: '14.2.0' } }, null, 2)}
`);
  writeFile(targetRepo, 'apps/web/app/page.tsx', 'export default function Page() { return <main>dashboard</main>; }\n');
  writeFile(targetRepo, 'packages/ui/package.json', `${JSON.stringify({ name: '@phase40/ui', private: true }, null, 2)}
`);
  writeFile(targetRepo, 'preview.html', '<!doctype html><html><body><main>preview</main></body></html>\n');

  const targetBin = path.join(targetRepo, 'bin', 'rai.js');
  const codexSetup = JSON.parse(run('node', [targetBin, 'codex', 'setup', '--repo', '--json'], targetRepo));
  const operator = JSON.parse(run('node', [targetBin, 'codex', 'operator', '--goal', 'audit the large repo and ship the dashboard safely', '--json'], targetRepo));
  const managed = JSON.parse(run('node', [targetBin, 'codex', 'managed-export', '--json'], targetRepo));

  assert.ok(codexSetup.operatorAssets.length >= 8);
  assert.equal(operator.action, 'operator');
  assert.match(operator.commands.interactive, /CODEX_HOME=\$\(pwd\)\/\.codex codex --profile/);
  assert.match(operator.commands.exec, /codex exec --profile/);
  assert.match(operator.commands.mcpServer, /codex mcp-server/);
  assert.match(operator.commands.appServer, /codex app-server/);
  assert.ok(operator.slashFlow.some((entry) => entry.command === '/status'));
  assert.ok(operator.slashFlow.some((entry) => entry.command === '/agent'));
  assert.ok(operator.slashFlow.some((entry) => entry.command === '/review'));
  assert.ok(operator.subagents.some((entry) => entry.id === 'operator-supervisor'));
  assert.ok(operator.subagents.some((entry) => entry.id === 'monorepo-planner'));
  assert.ok(operator.subagents.some((entry) => entry.id === 'browser-debugger'));
  assert.ok(operator.skills.includes('raiola-native-operator'));
  assert.ok(operator.skills.includes('raiola-large-repo-optimizer'));
  assert.equal(operator.automation.executionMode, 'dedicated-worktree');
  assert.equal(operator.automation.handoff, 'validated-materialization');
  assert.ok(operator.automation.safetyInvariants.includes('clean-target-before-merge'));
  assert.ok(operator.automation.safetyInvariants.includes('fresh-worktree-validation'));
  assert.ok(fs.existsSync(path.join(targetRepo, operator.file)));
  assert.ok(fs.existsSync(path.join(targetRepo, operator.markdownFile)));

  assert.equal(managed.action, 'managed-export');
  assert.ok(managed.approvalPolicies.includes('on-request') || managed.approvalPolicies.includes('untrusted'));
  assert.ok(fs.existsSync(path.join(targetRepo, managed.file)));
  const requirementsToml = fs.readFileSync(path.join(targetRepo, managed.file), 'utf8');
  assert.match(requirementsToml, /allowed_approval_policies/);
  assert.match(requirementsToml, /allowed_sandbox_modes/);
  assert.match(requirementsToml, /prefix_rules/);
  assert.match(requirementsToml, /mcp_servers\.openaiDeveloperDocs\.identity/);

  for (const relativeFile of [
    '.codex/AGENTS.md',
    '.codex/hooks/AGENTS.md',
    '.codex/operator/README.md',
    '.codex/operator/agents-sdk/README.md',
    '.codex/operator/agents-sdk/codex_operator_pipeline.py',
    '.codex/operator/app-server/README.md',
    '.codex/operator/evals/README.md',
    '.codex/operator/evals/run_skill_evals.mjs',
    '.codex/operator/runbooks/large-repo.md',
    '.codex/operator/runbooks/release-gate.md',
    '.codex/managed/README.md',
    '.github/codex/AGENTS.md',
    'plugins/AGENTS.md',
    'plugins/raiola-codex-optimizer/AGENTS.md',
  ]) {
    assert.ok(fs.existsSync(path.join(targetRepo, relativeFile)), `${relativeFile} should exist`);
  }

  const plugin = JSON.parse(fs.readFileSync(path.join(targetRepo, 'plugins', 'raiola-codex-optimizer', '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.skills.includes('skills/raiola-native-operator'));
  assert.ok(plugin.skills.includes('skills/raiola-release-gate'));
  assert.ok(plugin.skills.includes('skills/raiola-large-repo-optimizer'));
  assert.ok(plugin.skills.includes('skills/raiola-automation-curator'));
  assert.ok(plugin.subagents.includes('.codex/agents/operator-supervisor.toml'));
  assert.ok(plugin.subagents.includes('.codex/agents/release-gatekeeper.toml'));
});
