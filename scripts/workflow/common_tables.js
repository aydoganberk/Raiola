const markdown = require('./markdown/sections');

function parseMarkdownTable(sectionBody) {
  const lines = String(sectionBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split('|').slice(1, -1).map((cell) => cell.trim());
  const rows = lines.slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell.length > 0));

  return { headers, rows };
}

function renderMarkdownTable(headers, rows) {
  const safeRows = rows.length > 0 ? rows : [headers.map(() => '')];
  const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|');
  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...safeRows.map((row) => `| ${headers.map((_, index) => escapeCell(row[index] || '')).join(' | ')} |`),
  ].join('\n');
}

function headerKey(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseTableSectionObjects(content, heading) {
  const section = markdown.tryExtractSection(content, heading, '');
  const table = parseMarkdownTable(section);
  if (table.headers.length === 0) {
    return [];
  }

  return table.rows.map((cells) => Object.fromEntries(
    table.headers.map((header, index) => [headerKey(header), cells[index] || '']),
  ));
}

function renderRefTable(rows) {
  const normalizedRows = rows.length > 0
    ? rows.map((row) => [row.class || '', row.ref || '', row.why || row.notes || ''])
    : [['source_of_truth', 'docs/workflow/WORKSTREAMS.md', 'Update with step-specific refs']];

  return renderMarkdownTable(['Class', 'Ref', 'Why'], normalizedRows);
}

function parseRefTable(content, heading) {
  return parseTableSectionObjects(content, heading).map((row) => ({
    class: row.class || '',
    ref: row.ref || '',
    why: row.why || '',
  })).filter((row) => row.ref);
}

function parseMilestoneTable(content) {
  const section = markdown.extractSection(content, 'Milestone Table');
  const table = parseMarkdownTable(section);
  const rows = table.rows.map((cells) => ({
    milestone: cells[0] || '',
    goal: cells[1] || '',
    phase: cells[2] || '',
    status: cells[3] || '',
    step: cells[4] || '',
    exitCriteria: cells[5] || '',
    evidence: cells[6] || '',
  }));

  return {
    headerLines: [
      '| Milestone | Goal | Phase | Status | Step | Exit criteria | Evidence / notes |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    ],
    rows,
  };
}

function renderMilestoneTable(headerLines, rows) {
  const renderedRows = rows.map((row) => (
    `| ${row.milestone} | ${row.goal} | ${row.phase} | ${row.status} | ${row.step} | ${row.exitCriteria} | ${row.evidence} |`
  ));
  return [...headerLines, ...renderedRows].join('\n');
}

function parseArchivedMilestones(content) {
  const section = markdown.extractSection(content, 'Archived Done Milestones');
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));
}

function renderArchivedMilestones(items) {
  if (items.length === 0) {
    return '- `No archived milestones yet`';
  }
  return items.join('\n');
}

function parseWorkstreamTable(content) {
  const rows = parseTableSectionObjects(content, 'Workstream Table').map((row) => ({
    name: row.name || '',
    root: row.root || '',
    status: row.status || '',
    currentMilestone: row.current_milestone || '',
    step: row.step || '',
    packetHash: row.packet_hash || '',
    budgetStatus: row.budget_status || '',
    health: row.health || '',
    notes: row.notes || '',
  }));

  return {
    headerLines: [
      '| Name | Root | Status | Current milestone | Step | Packet hash | Budget status | Health | Notes |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ],
    rows,
  };
}

function renderWorkstreamTable(headerLines, rows) {
  const renderedRows = rows.map((row) => (
    `| ${row.name} | ${row.root} | ${row.status} | ${row.currentMilestone || ''} | ${row.step || ''} | ${row.packetHash || ''} | ${row.budgetStatus || ''} | ${row.health || ''} | ${row.notes || ''} |`
  ));
  return [...headerLines, ...renderedRows].join('\n');
}

module.exports = {
  headerKey,
  parseArchivedMilestones,
  parseMarkdownTable,
  parseMilestoneTable,
  parseRefTable,
  parseTableSectionObjects,
  parseWorkstreamTable,
  renderArchivedMilestones,
  renderMarkdownTable,
  renderMilestoneTable,
  renderRefTable,
  renderWorkstreamTable,
};
