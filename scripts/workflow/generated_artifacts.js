const { contractPayload } = require('./contract_versions');

const GENERATED_ARTIFACT_ROOTS = Object.freeze([
  '.workflow/runtime',
  '.workflow/reports',
  '.workflow/verifications',
  '.workflow/cache',
  '.workflow/benchmarks',
  '.workflow/exports',
  '.workflow/evidence-graph',
  '.workflow/evidence-store',
  '.workflow/orchestration',
  '.workflow/packets',
  '.workflow/telemetry',
  '.workflow/incidents',
  '.workflow/quick',
]);

const GENERATED_ARTIFACT_FILES = Object.freeze([
  '.workflow/state.json',
  '.workflow/packet-state.json',
  '.workflow/frontend-profile.json',
  '.workflow/delegation-plan.json',
  '.workflow/delegation-plan.md',
  '.workflow/fs-index.json',
  '.workflow/repo-config.json',
  '.workflow/install-report.json',
]);

function generatedArtifactRoots() {
  return [...GENERATED_ARTIFACT_ROOTS];
}

function generatedArtifactFiles() {
  return [...GENERATED_ARTIFACT_FILES];
}

function generatedArtifactPaths() {
  return [...generatedArtifactRoots(), ...generatedArtifactFiles()];
}

function buildGeneratedArtifactsManifest() {
  return {
    ...contractPayload('generatedArtifacts'),
    generatedArtifactRoots: generatedArtifactRoots(),
    generatedArtifactFiles: generatedArtifactFiles(),
  };
}

module.exports = {
  buildGeneratedArtifactsManifest,
  generatedArtifactFiles,
  generatedArtifactPaths,
  generatedArtifactRoots,
};
