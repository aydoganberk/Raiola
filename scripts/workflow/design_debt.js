const path = require('node:path');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const {
  buildDesignDebt,
  buildFrontendProfile,
  buildMissingStateAudit,
  buildTokenDriftAudit,
  collectComponentInventory,
  latestBrowserArtifacts,
  relativePath,
  writeDoc,
} = require('./frontend_os');

function buildDesignDebtDoc(cwd, rootDir) {
  const profile = buildFrontendProfile(cwd, rootDir, { scope: 'workstream', refresh: 'incremental' });
  const inventory = collectComponentInventory(cwd);
  const browserArtifacts = latestBrowserArtifacts(cwd);
  const missingStateAudit = buildMissingStateAudit(cwd, inventory);
  const tokenDriftAudit = buildTokenDriftAudit(cwd, inventory);
  const debt = buildDesignDebt(profile, inventory, browserArtifacts, {
    missingStateAudit,
    tokenDriftAudit,
  });
  const body = `
- Debt count: \`${debt.length}\`

## Items

${debt.length > 0
    ? debt.map((item) => `- [${item.severity}] \`${item.area}\` ${item.detail}`).join('\n')
    : '- `No major design debt signals were detected.`'}
`;
  const filePath = writeDoc(path.join(rootDir, 'DESIGN-DEBT.md'), 'DESIGN DEBT', body);
  return {
    file: relativePath(cwd, filePath),
    debt,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const rootDir = resolveWorkflowRoot(cwd, args.root);
  const payload = buildDesignDebtDoc(cwd, rootDir);
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log('# DESIGN DEBT\n');
  console.log(`- File: \`${payload.file}\``);
  console.log(`- Items: \`${payload.debt.length}\``);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDesignDebtDoc,
};
