const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBacktickField(content, label) {
  const pattern = '^- ' + escapeRegExp(label) + ': `([^`]*)`$';
  const match = String(content).match(new RegExp(pattern, 'm'));
  return match ? match[1] : null;
}

function versionMarkerPath(targetRepo) {
  return path.join(targetRepo, '.workflow', 'VERSION.md');
}

function productManifestPath(targetRepo) {
  return path.join(targetRepo, '.workflow', 'product-manifest.json');
}

function readInstalledVersionMarker(targetRepo) {
  const markerPath = versionMarkerPath(targetRepo);
  if (!fs.existsSync(markerPath)) {
    return {
      exists: false,
      path: markerPath,
      installedVersion: null,
      previousVersion: null,
      refreshedAt: null,
      sourcePackage: null,
    };
  }

  const content = fs.readFileSync(markerPath, 'utf8');
  return {
    exists: true,
    path: markerPath,
    installedVersion: extractBacktickField(content, 'Installed version'),
    previousVersion: extractBacktickField(content, 'Previous version'),
    refreshedAt: extractBacktickField(content, 'Last refreshed at'),
    sourcePackage: extractBacktickField(content, 'Source package'),
  };
}

function readProductManifest(targetRepo) {
  const manifestPath = productManifestPath(targetRepo);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  productManifestPath,
  readInstalledVersionMarker,
  readProductManifest,
  versionMarkerPath,
};
