const assert = require('node:assert/strict');
const { test } = require('node:test');

const sourcePackage = require('../package.json');
const { readRuntimeScriptCatalog } = require('../scripts/workflow/runtime_script_catalog');

const EXPECTED_VISIBLE_SCRIPTS = [
  'release:cut',
  'release:notes',
  'test',
  'pack:smoke',
  'rai',
  'raiola-on',
  'rai:help',
  'rai:quickstart',
  'rai:start',
  'rai:do',
  'rai:next',
  'rai:verify',
  'rai:doctor',
  'rai:audit-repo',
  'rai:api-surface',
  'rai:repo-proof',
].sort();

test('root visible script surface stays capped and separate from the compatibility catalog', () => {
  const visibleScripts = Object.keys(sourcePackage.scripts || {}).sort();
  const compatibilityCatalog = readRuntimeScriptCatalog();

  assert.deepEqual(visibleScripts, EXPECTED_VISIBLE_SCRIPTS);
  assert.equal(visibleScripts.length, 16);
  assert.ok(Object.keys(compatibilityCatalog).length >= 140);
  assert.equal(compatibilityCatalog['raiola:repo-proof'], 'node scripts/workflow/repo_proof.js');
  assert.equal(compatibilityCatalog['raiola:quick'], 'node scripts/workflow/quick.js');
  assert.equal(sourcePackage.scripts['raiola:quick'], undefined);
  assert.equal(sourcePackage.scripts['raiola:repo-proof'], undefined);
});
