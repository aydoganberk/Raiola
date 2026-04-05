const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const { ensureMarkdownDocument, listEntries, relativePath } = require('./roadmap_os');

function incidentDir(cwd) {
  return path.join(cwd, '.workflow', 'incidents');
}

function incidentFile(cwd, title) {
  const slug = String(title || 'incident')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'incident';
  return path.join(incidentDir(cwd), `${slug}.md`);
}

function openIncident(cwd, title, summary, command) {
  const filePath = incidentFile(cwd, title);
  ensureMarkdownDocument(filePath, title, `- Opened at: \`${new Date().toISOString()}\`\n- Broken command: \`${command || 'n/a'}\`\n\n## Summary\n\n- ${summary || 'No summary yet'}\n`);
  return {
    action: 'open',
    file: relativePath(cwd, filePath),
  };
}

function listIncidents(cwd) {
  return {
    action: 'list',
    incidents: listEntries(incidentDir(cwd), { filesOnly: true }).map((entry) => ({
      name: entry.name.replace(/\.md$/, ''),
      file: relativePath(cwd, entry.fullPath),
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'list';
  if (args.help || action === 'help') {
    console.log('Usage: node scripts/workflow/incident.js open|list [--title ... --summary ... --command ...]');
    return;
  }
  const cwd = process.cwd();
  const payload = action === 'open'
    ? openIncident(cwd, String(args.title || args._[1] || 'incident'), String(args.summary || 'No summary yet'), String(args.command || ''))
    : listIncidents(cwd);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# INCIDENT\n');
  console.log(`- Action: \`${payload.action}\``);
  for (const incident of payload.incidents || [payload]) {
    if (incident.file) {
      console.log(`- \`${incident.file}\``);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
