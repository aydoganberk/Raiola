const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildRepoConfigPayload } = require('../scripts/workflow/repo_config');
const { makeMezatLikeRepo } = require('./helpers/mezat_fixture');

test('buildRepoConfigPayload detects turbo, web, mobile, and api surfaces from repo truth', () => {
  const targetRepo = makeMezatLikeRepo('raiola-repo-config-polyglot-');
  const payload = buildRepoConfigPayload(targetRepo, path.join(targetRepo, 'docs', 'workflow'), {
    writeSnapshot: false,
  });
  const profileIds = payload.detectedProfiles.map((entry) => entry.id);

  assert.ok(profileIds.includes('nextjs-app'));
  assert.ok(profileIds.includes('expo-react-native'));
  assert.ok(profileIds.includes('hono-api'));
  assert.ok(profileIds.includes('firestore-data'));
  assert.ok(profileIds.includes('upstash-redis'));
  assert.ok(profileIds.includes('monorepo-workspace'));
  assert.ok(profileIds.includes('turbo-workspace'));
  assert.equal(payload.frontend.framework, 'Expo');
  assert.equal(payload.frontend.webRoutes, 1);
  assert.equal(payload.frontend.mobileRoutes, 2);
  assert.deepEqual(payload.frontend.surfaceRoots, ['apps/mobile', 'apps/web']);
  assert.equal(payload.api.endpointCount, 2);
  assert.ok(payload.api.frameworks.includes('hono'));
  assert.ok(payload.generatedDefaults.requiredVerifications.includes('rai api-surface --json'));
  assert.ok(payload.generatedDefaults.requiredVerifications.includes('rai map-frontend --json'));
});
