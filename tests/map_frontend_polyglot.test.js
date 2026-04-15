const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildFrontendProfile } = require('../scripts/workflow/map_frontend');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

test('buildFrontendProfile surveys nested web and mobile surfaces without workflow docs', () => {
  const targetRepo = makeMezatLikeRepo('raiola-frontend-polyglot-');
  const profile = buildFrontendProfile(targetRepo, path.join(targetRepo, 'docs', 'workflow'), {
    scope: 'repo',
    allowMissingWorkflow: true,
    refresh: 'full',
  });

  assert.ok(profile.framework.detected.includes('Next'));
  assert.ok(profile.framework.detected.includes('Expo'));
  assert.ok(profile.routing.detected.includes('next-app-router'));
  assert.ok(profile.routing.detected.includes('expo-router'));
  assert.equal(profile.surfaceInventory.webRouteCount, 1);
  assert.equal(profile.surfaceInventory.mobileRouteCount, 2);
  assert.deepEqual(profile.surfaceInventory.surfaceRoots, ['apps/mobile', 'apps/web']);
  assert.equal(profile.productSurface.id, 'mobile-app');
  assert.equal(profile.frontendMode.active, true);
});
