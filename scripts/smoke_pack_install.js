#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    const value = !next || next.startsWith('--') ? true : next;
    if (value !== true) {
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

function commandName(base) {
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

function run(command, args, options = {}, overrides = {}) {
  const execFileSync = overrides.execFileSync || childProcess.execFileSync;
  const platform = overrides.platform || process.platform;
  const execOptions = {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  };
  if (platform === 'win32') {
    // GitHub's Windows runners expose npm/npx via .cmd shims that require a shell-backed launch.
    execOptions.shell = true;
  }
  return execFileSync(command, args, execOptions);
}

function resolveTarball(args, cwd) {
  if (args.tarball) {
    return {
      created: false,
      tarballPath: path.resolve(cwd, String(args.tarball)),
    };
  }

  const packJson = run(commandName('npm'), ['pack', '--json'], { cwd });
  const payload = JSON.parse(packJson);
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first?.filename) {
    throw new Error('npm pack --json did not return a tarball filename');
  }
  return {
    created: true,
    tarballPath: path.join(cwd, first.filename),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const cleanupPaths = [];

  try {
    const tarball = resolveTarball(args, cwd);
    if (tarball.created) {
      cleanupPaths.push(tarball.tarballPath);
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwf-pack-smoke-'));
    const consumerDir = path.join(tempRoot, 'consumer');
    const targetRepo = path.join(tempRoot, 'target-repo');
    fs.mkdirSync(consumerDir, { recursive: true });
    fs.mkdirSync(targetRepo, { recursive: true });

    run(commandName('npm'), ['init', '-y'], { cwd: consumerDir });
    run(commandName('npm'), ['install', '--silent', tarball.tarballPath], { cwd: consumerDir });
    run(commandName('npx'), ['--yes', 'cwf', 'help'], { cwd: consumerDir });
    const setupPayload = run(commandName('npx'), ['--yes', 'cwf', 'setup', '--target', targetRepo, '--skip-verify', '--json'], {
      cwd: consumerDir,
    });

    const result = {
      tarball: tarball.tarballPath,
      consumerDir,
      targetRepo,
      setup: JSON.parse(setupPayload),
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('# PACK SMOKE');
    console.log('');
    console.log(`- Tarball: \`${result.tarball}\``);
    console.log(`- Consumer: \`${result.consumerDir}\``);
    console.log(`- Target repo: \`${result.targetRepo}\``);
    console.log(`- Setup mode: \`${result.setup.mode}\``);
    console.log(`- Product version: \`${result.setup.versionMarker?.installedVersion || 'unknown'}\``);
  } finally {
    for (const filePath of cleanupPaths) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  commandName,
  run,
  resolveTarball,
};
