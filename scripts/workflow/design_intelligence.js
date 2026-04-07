const path = require('node:path');
const { readIfExists, tryExtractSection } = require('./common');
const { buildFrontendProfile } = require('./map_frontend');
const {
  collectComponentInventory,
  collectUiFiles,
  relativePath,
  writeDoc,
} = require('./frontend_os');
const { buildDesignDnaPayload } = require('./design_contracts');
const { writeRuntimeJson } = require('./runtime_helpers');
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
