const path = require('node:path');

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

    if (key in args) {
      if (Array.isArray(args[key])) {
        args[key].push(value);
      } else {
        args[key] = [args[key], value];
      }
    } else {
      args[key] = value;
    }
  }

  return args;
}

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split('|'))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split('|').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function toSemicolonList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(';'))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(';').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}


function resolveTargetRepoArg(args, options = {}) {
  const cwd = path.resolve(String(options.cwd || process.cwd()));
  const positionalIndex = Number.isInteger(options.positionalIndex) ? options.positionalIndex : 0;
  const allowPositional = options.allowPositional !== false;
  const positionalValues = Array.isArray(args?._) ? args._ : [];
  const positional = allowPositional ? positionalValues[positionalIndex] : null;
  const candidate = args?.target || positional || '.';
  return path.resolve(cwd, String(candidate));
}

function parseBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

function parseNumber(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }

  const normalized = Number(String(value).replace(/_/g, '').trim());
  return Number.isFinite(normalized) ? normalized : fallback;
}

module.exports = {
  parseArgs,
  parseBoolean,
  parseNumber,
  resolveTargetRepoArg,
  toList,
  toSemicolonList,
};
