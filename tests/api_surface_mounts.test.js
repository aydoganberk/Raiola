const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildApiSurface } = require('../scripts/workflow/api_surface');
const { writeFile } = require('./helpers/mezat_fixture');

function makeMountedExpressRepo() {
  const targetRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'raiola-api-mounted-'));
  writeFile(targetRepo, 'package.json', JSON.stringify({
    name: 'mounted-express-fixture',
    private: true,
    dependencies: {
      express: '5.0.0',
    },
  }, null, 2));
  writeFile(targetRepo, 'src/server.ts', [
    "const express = require('express');",
    'const app = express();',
    'const v1Router = express.Router();',
    'const usersRouter = express.Router();',
    "const API_PREFIX = '/api';",
    'app.use(API_PREFIX, requireAuth, auditTrail, v1Router);',
    "v1Router.use('/v1', ensureTenant, usersRouter);",
    "usersRouter.get('/users', requireUser, validateInput, listUsers);",
    "usersRouter.post('/users', requireUser, createUser);",
    'module.exports = app;',
    '',
  ].join('\n'));
  return targetRepo;
}

test('buildApiSurface resolves mounted router prefixes and middleware depth heuristics', () => {
  const targetRepo = makeMountedExpressRepo();
  const surface = buildApiSurface(targetRepo, {
    refresh: 'full',
    writeFiles: false,
  });

  assert.equal(surface.endpointCount, 2);
  assert.equal(surface.middlewareCount, 2);
  assert.equal(surface.mountCount, 2);
  assert.ok(surface.frameworks.includes('express'));
  assert.equal(surface.middlewareDepth.useMax, 3);
  assert.equal(surface.middlewareDepth.routeHandlerMax, 3);
  assert.ok(surface.endpoints.some((entry) => entry.method === 'GET' && entry.path === '/api/v1/users'));
  assert.ok(surface.endpoints.some((entry) => entry.method === 'POST' && entry.path === '/api/v1/users'));
  assert.ok(surface.middlewareFiles.some((entry) => entry.file === 'src/server.ts' && entry.maxDepth >= 3));
});
