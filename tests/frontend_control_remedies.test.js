const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildFrontendControlPayload } = require('../scripts/workflow/frontend_control');

function writeFile(targetRepo, relativePath, content) {
  const filePath = path.join(targetRepo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('frontend control room exposes explicit remedies for attention-required surfaces', () => {
  const targetRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-frontend-control-'));
  const rootDir = path.join(targetRepo, 'docs', 'workflow');
  fs.mkdirSync(rootDir, { recursive: true });
  for (const name of ['WORKSTREAMS.md', 'PROJECT.md', 'RUNTIME.md', 'PREFERENCES.md', 'EXECPLAN.md', 'STATUS.md', 'DECISIONS.md', 'MILESTONES.md', 'MILESTONE_TEMPLATE.md', 'CONTEXT.md', 'CARRYFORWARD.md', 'VALIDATION.md', 'HANDOFF.md', 'WINDOW.md', 'MEMORY.md', 'SEEDS.md']) {
    writeFile(targetRepo, `docs/workflow/${name}`, '# placeholder\n');
  }
  fs.mkdirSync(path.join(rootDir, 'completed_milestones'), { recursive: true });
  writeFile(targetRepo, 'package.json', JSON.stringify({ name: 'frontend-fixture', private: true, dependencies: { next: '15.0.0', react: '19.0.0' } }, null, 2));
  writeFile(targetRepo, 'app/page.tsx', 'export default function Page() { return <main><section><button>Save</button></section></main>; }\n');

  const payload = buildFrontendControlPayload(targetRepo, rootDir, {});

  assert.equal(payload.schema, 'raiola/frontend-control-room/v1');
  assert.equal(payload.commands.verifyBrowser, 'rai verify-browser --adapter auto --require-proof --url http://localhost:3000 --json');
  assert.ok(Array.isArray(payload.remedies));
  assert.ok(payload.remedies.length >= 1);
  assert.ok(payload.remedySummary);
  assert.ok(payload.remedies.some((entry) => /verify-browser/.test(entry.command)));
});
