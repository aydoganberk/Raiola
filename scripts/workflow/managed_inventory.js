const { generatedArtifactPaths } = require('./generated_artifacts');

const LEGACY_RUNTIME_CLEANUP_PATHS = Object.freeze([
  'bin/cwf.js',
  '.agents/skills/codex-workflow',
  '.agents/skills/codex-workflow/SKILL.md',
]);

function uniqueNormalizedPaths(values = []) {
  return [...new Set(
    (values || [])
      .filter(Boolean)
      .map((entry) => String(entry).replace(/\\/g, '/'))
      .filter(Boolean),
  )].sort();
}

function legacyRuntimeCleanupPaths() {
  return [...LEGACY_RUNTIME_CLEANUP_PATHS];
}

function buildTrustedRuntimeCleanupInventory(runtimeFiles = []) {
  return uniqueNormalizedPaths([
    ...runtimeFiles,
    ...legacyRuntimeCleanupPaths(),
  ]);
}

function buildTrustedGeneratedArtifactInventory() {
  return uniqueNormalizedPaths(generatedArtifactPaths());
}

module.exports = {
  buildTrustedGeneratedArtifactInventory,
  buildTrustedRuntimeCleanupInventory,
  legacyRuntimeCleanupPaths,
  uniqueNormalizedPaths,
};
