const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildApiSurface } = require('../scripts/workflow/api_surface');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

test('buildApiSurface detects hono routes plus auth and datastore signals', () => {
  const targetRepo = makeMezatLikeRepo('raiola-api-surface-');
  const surface = buildApiSurface(targetRepo, {
    refresh: 'full',
    writeFiles: false,
  });

  assert.equal(surface.endpointCount, 2);
  assert.equal(surface.middlewareCount, 1);
  assert.ok(surface.frameworks.includes('hono'));
  assert.ok(surface.authSignals.includes('jwt'));
  assert.ok(surface.dataStores.includes('firestore'));
  assert.ok(surface.dataStores.includes('redis'));
  assert.ok(surface.repositoryPatternFiles.some((entry) => /itemRepository\.ts$/.test(entry)));
  assert.ok(surface.packages.some((entry) => entry.packagePath === 'apps/api' && entry.endpointCount === 2));
  assert.ok(surface.recommendedVerifications.includes('rai api-surface --json'));
  assert.ok(surface.recommendedVerifications.includes('rai trust --json'));
});
