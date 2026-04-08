const fs = require('node:fs');
const path = require('node:path');

const EMBEDDED_PRODUCT = Object.freeze({
  name: 'raiola',
  legacyNames: Object.freeze(['codex-workflow-kit']),
  version: '0.3.1',
  primaryCommand: 'rai',
  commandAliases: Object.freeze(['raiola', 'cwf', 'codex-workflow']),
  primarySkillName: 'raiola',
  legacySkillNames: Object.freeze(['codex-workflow']),
});

function repoPackagePath() {
  return path.join(__dirname, '..', '..', 'package.json');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function embeddedProductMeta() {
  return { ...EMBEDDED_PRODUCT };
}

function knownProductNames() {
  return [EMBEDDED_PRODUCT.name, ...EMBEDDED_PRODUCT.legacyNames];
}

function isKnownProductName(value) {
  return knownProductNames().includes(String(value || ''));
}

function detectRepoProductMeta() {
  const pkg = readJsonIfExists(repoPackagePath());
  if (!pkg || !isKnownProductName(pkg.name) || !pkg.version) {
    return null;
  }
  return {
    name: String(pkg.name),
    version: String(pkg.version),
    source: 'repo-package',
  };
}

function productMeta() {
  return detectRepoProductMeta() || {
    ...EMBEDDED_PRODUCT,
    source: 'embedded',
  };
}

function productName() {
  return productMeta().name;
}

function productVersion() {
  return productMeta().version;
}

function productCommandName() {
  return EMBEDDED_PRODUCT.primaryCommand;
}

function productCommandAliases() {
  return [...EMBEDDED_PRODUCT.commandAliases];
}

function productSkillName() {
  return EMBEDDED_PRODUCT.primarySkillName;
}

function productSkillAliases() {
  return [...EMBEDDED_PRODUCT.legacySkillNames];
}

module.exports = {
  detectRepoProductMeta,
  embeddedProductMeta,
  isKnownProductName,
  knownProductNames,
  productCommandAliases,
  productCommandName,
  productMeta,
  productName,
  productSkillAliases,
  productSkillName,
  productVersion,
};
