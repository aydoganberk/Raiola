function extractBulletItems(sectionBody) {
  return String(sectionBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').trim())
    .filter(Boolean);
}

function parseMemoryEntries(sectionBody, emptyMarker) {
  const lines = sectionBody.split('\n').map((line) => line.trimEnd());
  const entries = [];
  let current = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === emptyMarker) {
      continue;
    }

    if (/^- `\d{4}-\d{2}-\d{2} \| [^`]+`$/.test(line)) {
      if (current.length > 0) {
        entries.push(current.join('\n'));
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    entries.push(current.join('\n'));
  }

  return entries;
}

function parseMemoryEntry(block) {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  const header = lines[0] || '';
  const headerMatch = header.match(/^- `([^`]+?) \| ([^`]+)`$/);
  const entry = {
    raw: block,
    date: headerMatch?.[1] || '',
    title: headerMatch?.[2] || '',
    fields: {},
  };

  for (const line of lines.slice(1)) {
    const valueMatch = line.match(/^- `([^`]+)`$/);
    if (!valueMatch) {
      continue;
    }

    const payload = valueMatch[1];
    const separatorIndex = payload.indexOf(': ');
    if (separatorIndex === -1) {
      if (!entry.fields.Note) {
        entry.fields.Note = payload;
      }
      continue;
    }

    const key = payload.slice(0, separatorIndex).trim();
    const value = payload.slice(separatorIndex + 2).trim();
    entry.fields[key] = value;
  }

  return entry;
}

function renderMemoryEntry(entry) {
  const lines = [`- \`${entry.date} | ${entry.title}\``];
  const orderedFields = [];

  if (entry.fields.Mode) {
    orderedFields.push(['Mode', entry.fields.Mode]);
  }
  if (entry.fields.Status) {
    orderedFields.push(['Status', entry.fields.Status]);
  }
  if (entry.fields.Milestone) {
    orderedFields.push(['Milestone', entry.fields.Milestone]);
  }
  if (entry.fields.Step) {
    orderedFields.push(['Step', entry.fields.Step]);
  }
  if (entry.fields.Lifecycle) {
    orderedFields.push(['Lifecycle', entry.fields.Lifecycle]);
  }
  if (entry.fields.Note) {
    orderedFields.push(['Note', entry.fields.Note]);
  }
  if (entry.fields.Source) {
    orderedFields.push(['Source', entry.fields.Source]);
  }
  if (entry.fields.Tags) {
    orderedFields.push(['Tags', entry.fields.Tags]);
  }

  const emitted = new Set(orderedFields.map(([key]) => key));
  for (const [key, value] of Object.entries(entry.fields)) {
    if (!emitted.has(key) && value) {
      orderedFields.push([key, value]);
    }
  }

  for (const [key, value] of orderedFields) {
    lines.push(`  - \`${key}: ${value}\``);
  }

  return lines.join('\n');
}

function renderMemorySection(entries, emptyMarker) {
  if (entries.length === 0) {
    return `- \`${emptyMarker}\``;
  }

  return entries.map((entry) => renderMemoryEntry(entry)).join('\n');
}

function parseSeedEntries(sectionBody, emptyMarker) {
  return parseMemoryEntries(sectionBody, emptyMarker).map((entry) => parseMemoryEntry(entry));
}

function renderSeedSection(entries, emptyMarker) {
  return renderMemorySection(entries, emptyMarker);
}

module.exports = {
  extractBulletItems,
  parseMemoryEntries,
  parseMemoryEntry,
  parseSeedEntries,
  renderMemoryEntry,
  renderMemorySection,
  renderSeedSection,
};
