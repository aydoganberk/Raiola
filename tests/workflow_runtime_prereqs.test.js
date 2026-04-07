const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildRuntimePrerequisiteChecks } = require('../scripts/workflow/runtime_prereqs');

function makeResolver(entries) {
  return (binaryName) => entries[binaryName] || null;
}

function findCheck(checks, prefix) {
  const check = checks.find((item) => item.message.startsWith(prefix));
  assert.ok(check, `expected a check starting with "${prefix}"`);
  return check;
}

test('doctor keeps optional host tools as warnings while health downgrades them to advisory passes', () => {
  const resolver = makeResolver({
    git: '/usr/bin/git',
  });

  const doctorChecks = buildRuntimePrerequisiteChecks(process.cwd(), {
    surface: 'doctor',
    platform: 'linux',
    nodeVersion: 'v20.11.1',
    resolveBinary: resolver,
  });
  const healthChecks = buildRuntimePrerequisiteChecks(process.cwd(), {
    surface: 'health',
    platform: 'linux',
    nodeVersion: 'v20.11.1',
    resolveBinary: resolver,
  });

  assert.equal(findCheck(doctorChecks, 'Ripgrep ->').status, 'warn');
  assert.equal(findCheck(doctorChecks, 'Dashboard opener ->').status, 'warn');
  assert.equal(findCheck(healthChecks, 'Ripgrep ->').status, 'pass');
  assert.equal(findCheck(healthChecks, 'Dashboard opener ->').status, 'pass');
  assert.match(findCheck(healthChecks, 'Ripgrep ->').message, /optional;/);
});

test('health keeps blocking prerequisites as failures', () => {
  const checks = buildRuntimePrerequisiteChecks(process.cwd(), {
    surface: 'health',
    platform: 'linux',
    nodeVersion: 'v18.19.0',
    resolveBinary: makeResolver({}),
  });

  assert.equal(findCheck(checks, 'Node.js runtime ->').status, 'fail');
  assert.equal(findCheck(checks, 'Git ->').status, 'fail');
});

test('health does not inherit smoke-tier platform warnings from doctor', () => {
  const resolver = makeResolver({
    git: 'C:/Program Files/Git/bin/git.exe',
  });

  const doctorChecks = buildRuntimePrerequisiteChecks(process.cwd(), {
    surface: 'doctor',
    platform: 'win32',
    nodeVersion: 'v20.11.1',
    resolveBinary: resolver,
  });
  const healthChecks = buildRuntimePrerequisiteChecks(process.cwd(), {
    surface: 'health',
    platform: 'win32',
    nodeVersion: 'v20.11.1',
    resolveBinary: resolver,
  });

  assert.equal(findCheck(doctorChecks, 'Platform support ->').status, 'warn');
  assert.equal(findCheck(healthChecks, 'Platform support ->').status, 'pass');
  assert.match(findCheck(healthChecks, 'Platform support ->').message, /run doctor/i);
});
