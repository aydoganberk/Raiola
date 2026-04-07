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
  toList,
  toSemicolonList,
};
