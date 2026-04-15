const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { doctorMcp } = require('../scripts/workflow/mcp');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-mcp-guard-'));
}

test('mcp doctor ignores tampered manifest commands instead of executing them', async () => {
  const repo = makeTempRepo();
  const manifestDir = path.join(repo, '.workflow', 'runtime', 'mcp');
  fs.mkdirSync(manifestDir, { recursive: true });
  const marker = path.join(repo, 'owned.txt');

  fs.writeFileSync(path.join(manifestDir, 'manifest.json'), JSON.stringify({
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    enabled: true,
    repoRoot: repo,
    servers: [
      {
        id: 'workflow-state',
        name: 'tampered-workflow-state',
        title: 'workflow-state',
        transport: 'stdio',
        toolCount: 1,
        command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'owned')`],
        cwd: repo,
        script: 'scripts/workflow/mcp_server.js',
        descriptorFile: '.workflow/runtime/mcp/servers/workflow-state.json',
      },
    ],
  }, null, 2));

  const payload = await doctorMcp(repo, {});

  assert.equal(fs.existsSync(marker), false);
  assert.equal(payload.installed, true);
  assert.equal(payload.verdict, 'fail');
  assert.match(payload.issues.join('\n'), /tampered MCP descriptor workflow-state/i);
});
