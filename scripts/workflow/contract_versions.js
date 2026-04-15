const CLI_CONTRACT_VERSION = '2026-04';

const ARTIFACT_SCHEMA_REGISTRY = Object.freeze({
  productManifest: {
    schema: 'raiola/product-manifest/v2',
    summary: 'Installed surface manifest and artifact compatibility map.',
  },
  setupPlan: {
    schema: 'raiola/setup-plan/v1',
    summary: 'Dry-run or post-install setup plan with compatibility assessment.',
  },
  installCompatibility: {
    schema: 'raiola/install-compatibility/v1',
    summary: 'Compatibility check against existing repo tooling before setup/update.',
  },
  uninstallReport: {
    schema: 'raiola/uninstall-report/v1',
    summary: 'Deterministic uninstall cleanup report for installed runtime assets.',
  },
  generatedArtifacts: {
    schema: 'raiola/generated-artifacts/v1',
    summary: 'Managed generated-artifact roots and files under .workflow/.',
  },
  doctorReport: {
    schema: 'raiola/doctor-report/v1',
    summary: 'Doctor health report including install-surface and compatibility checks.',
  },
  start: {
    schema: 'raiola/start-plan/v1',
    summary: 'Structured lane selection and start bundle payload.',
  },
  do: {
    schema: 'raiola/do-route/v1',
    summary: 'Intent-routing payload with trust and command-plan hints.',
  },
  repoProof: {
    schema: 'raiola/repo-proof/v1',
    summary: 'Versioned repo-proof pack for current or external local snapshots.',
  },
  apiSurface: {
    schema: 'raiola/api-surface/v2',
    summary: 'Static API surface plus optional runtime HTTP evidence.',
  },
  apiSurfaceRuntime: {
    schema: 'raiola/api-surface-runtime/v1',
    summary: 'Live HTTP probe evidence for a subset of detected endpoints.',
  },
  verifyBrowser: {
    schema: 'raiola/verify-browser/v2',
    summary: 'Browser verification payload with smoke/proof distinction.',
  },
  frontendControl: {
    schema: 'raiola/frontend-control-room/v1',
    summary: 'Frontend control-room verdict, evidence, and remedies.',
  },
});

function schemaEntry(key) {
  return ARTIFACT_SCHEMA_REGISTRY[key] || null;
}

function contractPayload(key, options = {}) {
  const entry = schemaEntry(key);
  if (!entry) {
    throw new Error(`Unknown contract key: ${key}`);
  }
  return {
    schema: entry.schema,
    contractVersion: CLI_CONTRACT_VERSION,
    stability: 'versioned-json-contract',
    summary: entry.summary,
    ...options,
  };
}

function manifestSchemaMap() {
  return Object.fromEntries(
    Object.entries(ARTIFACT_SCHEMA_REGISTRY).map(([key, value]) => [key, value.schema]),
  );
}

module.exports = {
  ARTIFACT_SCHEMA_REGISTRY,
  CLI_CONTRACT_VERSION,
  contractPayload,
  manifestSchemaMap,
  schemaEntry,
};
