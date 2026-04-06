const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

function readCurrentFile(cwd, filePath) {
  try {
    return fs.readFileSync(path.join(cwd, filePath), 'utf8');
  } catch {
    return null;
  }
}

function readPreviousFile(cwd, filePath) {
  const result = childProcess.spawnSync('git', ['show', `HEAD:${filePath}`], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout || null;
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function collectMatches(content, pattern, limit = 40) {
  const matches = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let result;
  while ((result = regex.exec(String(content || ''))) && matches.length < limit) {
    if (result[1]) {
      matches.push(result[1]);
    }
  }
  return uniqueSorted(matches);
}

function signatureMap(content) {
  const signatures = {};
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
    /export\s+default\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of String(content || '').matchAll(pattern)) {
      signatures[match[1]] = String(match[2] || '').replace(/\s+/g, ' ').trim();
    }
  }
  return signatures;
}

function semanticSnapshot(content) {
  const text = String(content || '');
  return {
    exportedSymbols: uniqueSorted([
      ...collectMatches(text, /export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g),
      ...collectMatches(text, /export\s+default\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g),
      ...collectMatches(text, /export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/g),
      ...collectMatches(text, /export\s+(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g),
    ]),
    routeHandlers: uniqueSorted(collectMatches(text, /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)),
    authSignals: (text.match(/\b(auth|session|permission|authorize|authenticated|middleware)\b/gi) || []).length,
    errorSignals: (text.match(/\b(catch|throw|error|retry|failed|exception)\b/gi) || []).length,
    envSignals: (text.match(/\bprocess\.env\.[A-Z0-9_]+\b/g) || []).length,
    inlineStyles: (text.match(/style=\{\{/g) || []).length,
    imagesWithoutAlt: (text.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length,
    unlabeledButtons: (text.match(/<button\b(?![^>]*\b(aria-label|aria-labelledby|title)=)[^>]*>\s*<\/button>/gi) || []).length,
    signatures: signatureMap(text),
  };
}

function fallbackBeforeAfter(file) {
  return {
    before: (file.deletedLines || []).join('\n'),
    after: (file.addedLines || []).join('\n'),
    source: 'diff',
  };
}

function buildSemanticInput(cwd, file) {
  const current = readCurrentFile(cwd, file.file);
  const previous = readPreviousFile(cwd, file.file);
  if (current != null || previous != null) {
    return {
      before: previous || (file.deletedLines || []).join('\n'),
      after: current || (file.addedLines || []).join('\n'),
      source: 'filesystem',
    };
  }
  return fallbackBeforeAfter(file);
}

function semanticDiff(beforeSnapshot, afterSnapshot) {
  const removedExports = beforeSnapshot.exportedSymbols.filter((item) => !afterSnapshot.exportedSymbols.includes(item));
  const addedExports = afterSnapshot.exportedSymbols.filter((item) => !beforeSnapshot.exportedSymbols.includes(item));
  const changedSignatures = Object.keys(afterSnapshot.signatures).filter((name) => (
    beforeSnapshot.signatures[name]
    && beforeSnapshot.signatures[name] !== afterSnapshot.signatures[name]
  ));
  const removedRouteHandlers = beforeSnapshot.routeHandlers.filter((item) => !afterSnapshot.routeHandlers.includes(item));
  const addedRouteHandlers = afterSnapshot.routeHandlers.filter((item) => !beforeSnapshot.routeHandlers.includes(item));
  return {
    removedExports,
    addedExports,
    changedSignatures,
    removedRouteHandlers,
    addedRouteHandlers,
    authSignalsDropped: afterSnapshot.authSignals < beforeSnapshot.authSignals,
    errorSignalsDropped: afterSnapshot.errorSignals < beforeSnapshot.errorSignals,
    addedInlineStyles: afterSnapshot.inlineStyles > beforeSnapshot.inlineStyles,
    addedImageAltIssues: afterSnapshot.imagesWithoutAlt > beforeSnapshot.imagesWithoutAlt,
    addedButtonLabelIssues: afterSnapshot.unlabeledButtons > beforeSnapshot.unlabeledButtons,
  };
}

function buildSemanticAnalysis(cwd, file) {
  const input = buildSemanticInput(cwd, file);
  const beforeSnapshot = semanticSnapshot(input.before);
  const afterSnapshot = semanticSnapshot(input.after);
  return {
    source: input.source,
    before: beforeSnapshot,
    after: afterSnapshot,
    diff: semanticDiff(beforeSnapshot, afterSnapshot),
  };
}

module.exports = {
  buildSemanticAnalysis,
};
