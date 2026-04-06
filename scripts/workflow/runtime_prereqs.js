const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_NODE_RANGE = '>=20';
const PLATFORM_SUPPORT = Object.freeze({
  darwin: {
    status: 'pass',
    tier: 'full',
    summary: 'macOS is fully supported, including dashboard open helpers and Quick Look screenshots.',
  },
  linux: {
    status: 'pass',
    tier: 'full',
    summary: 'Linux is fully supported; dashboard open uses xdg-open when available.',
  },
  win32: {
    status: 'warn',
    tier: 'smoke',
    summary: 'Windows is smoke-tested for install/help flows; some OS-integrated surfaces rely on fallbacks.',
  },
});

function packageJsonPath(cwd) {
  return path.join(cwd, 'package.json');
}

function readPackageMetadata(cwd) {
  const filePath = packageJsonPath(cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function extractNodeRange(packageJson) {
  return String(packageJson?.engines?.node || '').trim();
}

function parseMajor(version) {
  const match = String(version || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function nodeVersionSatisfies(range, version = process.version) {
  if (!range) {
    return true;
  }

  const currentMajor = parseMajor(version);
  if (currentMajor == null) {
    return false;
  }

  const minMatch = String(range).match(/>=\s*(\d+)/);
  if (minMatch && currentMajor < Number(minMatch[1])) {
    return false;
  }

  const maxMatch = String(range).match(/<\s*(\d+)/);
  if (maxMatch && currentMajor >= Number(maxMatch[1])) {
    return false;
  }

  return true;
}

function executableExtensions() {
  if (process.platform !== 'win32') {
    return [''];
  }

  const pathExt = String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM');
  return pathExt.split(';').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function resolveBinary(binaryName) {
  const pathValue = String(process.env.PATH || '');
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  const hasExtension = /\.[a-z0-9]+$/i.test(binaryName);
  const candidates = hasExtension
    ? [binaryName]
    : process.platform === 'win32'
      ? [binaryName, ...executableExtensions().map((ext) => `${binaryName}${ext}`)]
      : [binaryName];

  for (const directory of directories) {
    for (const candidate of candidates) {
      const fullPath = path.join(directory, candidate);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {
        // Ignore unreadable PATH entries and keep scanning.
      }
    }
  }

  return null;
}

function buildBinaryCheck(binaryName, options = {}) {
  const {
    missingStatus = 'warn',
    presentLabel = binaryName,
    missingFix = null,
    missingSummary = `${binaryName} is not on PATH`,
    presentSummary = null,
  } = options;
  const resolved = resolveBinary(binaryName);
  return {
    status: resolved ? 'pass' : missingStatus,
    message: resolved
      ? `${presentLabel} -> ${presentSummary || resolved}`
      : `${presentLabel} -> ${missingSummary}`,
    fix: resolved ? null : missingFix,
    resolved,
  };
}

function buildRuntimePrerequisiteChecks(cwd) {
  const checks = [];
  const support = PLATFORM_SUPPORT[process.platform] || {
    status: 'warn',
    tier: 'unsupported',
    summary: `Platform ${process.platform} is not part of the documented support matrix.`,
  };

  checks.push({
    status: nodeVersionSatisfies(SUPPORTED_NODE_RANGE)
      ? 'pass'
      : 'fail',
    message: `Node.js runtime -> ${process.version} (workflow support: ${SUPPORTED_NODE_RANGE})`,
    fix: nodeVersionSatisfies(SUPPORTED_NODE_RANGE)
      ? null
      : `Install a Node.js version that satisfies ${SUPPORTED_NODE_RANGE}`,
  });

  checks.push({
    status: support.status,
    message: `Platform support -> ${process.platform} (${support.tier}): ${support.summary}`,
    fix: support.status === 'warn'
      ? 'Prefer macOS or Linux for the full workflow surface'
      : null,
  });

  checks.push(buildBinaryCheck('git', {
    missingStatus: 'fail',
    presentLabel: 'Git',
    missingSummary: 'git is required for diffs, worktrees, patch flows, and review surfaces',
    missingFix: 'Install git and ensure it is on PATH',
  }));

  checks.push(buildBinaryCheck('rg', {
    missingStatus: 'warn',
    presentLabel: 'Ripgrep',
    missingSummary: 'rg is missing; cwf explore will fall back to slower built-in search',
    missingFix: 'Install ripgrep (rg) for faster repo search',
  }));

  if (process.platform === 'darwin') {
    checks.push(buildBinaryCheck('open', {
      missingStatus: 'warn',
      presentLabel: 'Dashboard opener',
      missingSummary: 'open is missing; cwf dashboard --open cannot auto-launch the browser',
      missingFix: 'Restore the open command or open the generated HTML manually',
    }));
    checks.push(buildBinaryCheck('qlmanage', {
      missingStatus: 'warn',
      presentLabel: 'Quick Look renderer',
      missingSummary: 'qlmanage is missing; verify-browser will fall back to SVG screenshots',
      missingFix: 'Restore qlmanage to regain PNG browser artifacts',
    }));
  } else if (process.platform === 'linux') {
    checks.push(buildBinaryCheck('xdg-open', {
      missingStatus: 'warn',
      presentLabel: 'Dashboard opener',
      missingSummary: 'xdg-open is missing; cwf dashboard --open cannot auto-launch the browser',
      missingFix: 'Install xdg-utils or open the generated HTML manually',
    }));
  } else if (process.platform === 'win32') {
    checks.push({
      status: 'pass',
      message: 'Dashboard opener -> Windows shell start fallback is available',
      fix: null,
    });
  }

  return checks;
}

module.exports = {
  buildRuntimePrerequisiteChecks,
  nodeVersionSatisfies,
  readPackageMetadata,
  resolveBinary,
};
