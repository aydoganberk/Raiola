const path = require('node:path');
const {
  tryExtractSection } = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const {
  collectComponentInventory,
  collectUiFiles,
  relativePath,
  writeDoc,
  } = require('./frontend_os');
const { buildDesignDnaPayload } = require('./design_contracts');
const { writeRuntimeJson } = require('./runtime_helpers');
const { ensureDir,
  writeTextIfChanged,
  readTextIfExists: readIfExists,
} = require('./io/files');
const {
  TASTE_PROFILES,
  buildAcceptanceChecklist,
  buildAntiPatterns,
  buildCodexRecipes,
  buildCopyVoice,
  buildDesignSystemActions,
  buildDesignTokens,
  buildDifferentiators,
  buildExperienceThesis,
  buildImplementationPrompts,
  buildMotionSystem,
  buildNativeFirstRecommendations,
  buildPatterns,
  buildPrinciples,
  buildPrototypeMode,
  buildRecipePack,
  buildScreenBlueprints,
  buildSemanticGuardrails,
  buildSignatureMoments,
  buildStyleGuardrails,
  inferArchetype,
  inferTasteSignature,
  renderDirectionMarkdown,
  resolveTasteProfile,
} = require('./design_intelligence_model');


function flattenTokenEntries(value, prefix = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix.length > 0 ? [{ key: prefix.join('-'), value }] : [];
  }
  return Object.entries(value).flatMap(([key, nested]) => flattenTokenEntries(nested, [...prefix, key]));
}

function buildTokenExports(cwd, rootDir, designTokens) {
  const tokenEntries = flattenTokenEntries(designTokens).filter((entry) => ['string', 'number'].includes(typeof entry.value));
  const cssLines = [':root {', ...tokenEntries.map((entry) => `  --rai-${entry.key}: ${entry.value};`), '}'];
  const figmaVariables = {
    schema: 'raiola/figma-variables/v1',
    collections: [{
      name: 'Raiola Taste Profile',
      modes: [{ name: 'Default', values: Object.fromEntries(tokenEntries.map((entry) => [entry.key, entry.value])) }],
    }],
  };
  const tailwindPartial = {
    theme: {
      extend: {
        colors: Object.fromEntries(tokenEntries.filter((entry) => /color/i.test(entry.key)).map((entry) => [entry.key.replace(/-+/g, '_'), entry.value])),
        spacing: Object.fromEntries(tokenEntries.filter((entry) => /space|gap|padding|radius/i.test(entry.key)).map((entry) => [entry.key.replace(/-+/g, '_'), entry.value])),
      },
    },
  };
  const exportDir = path.join(cwd, '.workflow', 'runtime', 'design-tokens');
  ensureDir(exportDir);
  const cssPath = path.join(exportDir, 'tokens.css');
  const figmaPath = path.join(exportDir, 'figma-variables.json');
  const tailwindPath = path.join(exportDir, 'tailwind.partial.json');
  writeTextIfChanged(cssPath, `${cssLines.join('\n')}\n`);
  writeTextIfChanged(figmaPath, `${JSON.stringify(figmaVariables, null, 2)}\n`);
  writeTextIfChanged(tailwindPath, `${JSON.stringify(tailwindPartial, null, 2)}\n`);
  return {
    css: relativePath(cwd, cssPath),
    figmaVariables: relativePath(cwd, figmaPath),
    tailwindPartial: relativePath(cwd, tailwindPath),
  };
}

function buildUiDirection(cwd, rootDir, options = {}) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const uiFiles = collectUiFiles(cwd);
  const contextDoc = readIfExists(path.join(rootDir, 'CONTEXT.md')) || '';
  const intentText = [
    tryExtractSection(contextDoc, 'User Intent', ''),
    tryExtractSection(contextDoc, 'Problem Frame', ''),
    tryExtractSection(contextDoc, 'Touched Files', ''),
    options.goal || '',
  ].join('\n');

  const archetype = inferArchetype(profile, inventory, uiFiles, intentText);
  const tasteProfile = resolveTasteProfile(archetype, intentText, options);
  const taste = inferTasteSignature(profile, archetype, tasteProfile);
  const designTokens = buildDesignTokens(tasteProfile, archetype, profile);
  const experienceThesis = buildExperienceThesis(archetype, tasteProfile, profile);
  const motionSystem = buildMotionSystem(profile, tasteProfile);
  const copyVoice = buildCopyVoice(archetype, tasteProfile);
  const signatureMoments = buildSignatureMoments(archetype);
  const screenBlueprints = buildScreenBlueprints(archetype);
  const differentiators = buildDifferentiators(archetype, tasteProfile);
  const designSystemActions = buildDesignSystemActions(profile, tasteProfile);
  const semanticGuardrails = buildSemanticGuardrails(profile, archetype);
  const nativeFirstRecommendations = buildNativeFirstRecommendations(profile, archetype);
  const recipePack = buildRecipePack(profile, archetype);
  const prototypeMode = buildPrototypeMode(profile, archetype, inventory, options);
  const implementationPrompts = buildImplementationPrompts(archetype, taste, tasteProfile);
  const styleGuardrails = buildStyleGuardrails(tasteProfile, archetype);
  const principles = buildPrinciples(profile, archetype, tasteProfile);
  const patterns = buildPatterns(profile, inventory, archetype, tasteProfile);
  const antiPatterns = buildAntiPatterns(archetype, tasteProfile);
  const codexRecipes = buildCodexRecipes(profile, archetype, taste, tasteProfile);
  const acceptanceChecklist = buildAcceptanceChecklist(profile, archetype, tasteProfile);
  const designDna = buildDesignDnaPayload(cwd, rootDir, {
    profile,
    archetype,
    taste,
    antiPatterns,
  }, options);
  const tokenExports = buildTokenExports(cwd, rootDir, designTokens);
  const payload = {
    generatedAt: new Date().toISOString(),
    workflowRootRelative: relativePath(cwd, rootDir),
    profile,
    archetype,
    taste,
    experienceThesis,
    motionSystem,
    copyVoice,
    signatureMoments,
    screenBlueprints,
    differentiators,
    designSystemActions,
    semanticGuardrails,
    nativeFirstRecommendations,
    recipePack,
    prototypeMode,
    implementationPrompts,
    designDna,
    designTokens,
    tokenExports,
    componentCues: [...(tasteProfile.componentCues || [])],
    interactionCues: [...(tasteProfile.interactionCues || [])],
    styleGuardrails,
    principles,
    patterns,
    antiPatterns,
    codexRecipes,
    acceptanceChecklist,
    inventoryPreview: inventory.slice(0, 12).map((item) => item.file),
    uiFilePreview: uiFiles.slice(0, 12),
  };

  const filePath = writeDoc(path.join(rootDir, 'UI-DIRECTION.md'), 'UI DIRECTION', renderDirectionMarkdown(payload));
  const runtimeFile = writeRuntimeJson(cwd, 'ui-direction.json', {
    ...payload,
    file: relativePath(cwd, filePath),
  });

  return {
    ...payload,
    file: relativePath(cwd, filePath),
    runtimeFile: relativePath(cwd, runtimeFile),
  };
}

module.exports = {
  TASTE_PROFILES,
  buildUiDirection,
};
