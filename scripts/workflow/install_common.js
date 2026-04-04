const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  PACKET_VERSION,
  buildPacketSnapshot,
  computeWindowStatus,
  controlPaths,
  ensureField,
  ensureSection,
  ensureDir,
  extractSection,
  getFieldValue,
  parseWorkstreamTable,
  read,
  renderWorkstreamTable,
  replaceField,
  replaceOrAppendField,
  replaceSection,
  syncStablePacketSet,
  syncWindowDocument,
  today,
  workflowPaths,
  write,
} = require('./common');

const INSTALLER_ONLY_FILES = new Set(['init.js', 'install_common.js', 'migrate.js']);
const INSTALLER_ONLY_SCRIPTS = new Set(['workflow:init', 'workflow:migrate']);

function slugifyName(value) {
  return String(value || 'workflow-repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow-repo';
}

function sourceRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sourceLayout() {
  const repoRoot = sourceRepoRoot();
  return {
    repoRoot,
    templatesDir: path.join(repoRoot, 'templates', 'workflow'),
    scriptsDir: path.join(repoRoot, 'scripts', 'workflow'),
    compareScript: path.join(repoRoot, 'scripts', 'compare_golden_snapshots.ts'),
    skillFile: path.join(repoRoot, 'skill', 'SKILL.md'),
    packageJson: path.join(repoRoot, 'package.json'),
  };
}

function walkFiles(dirPath, predicate = () => true) {
  const results = [];

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  visit(dirPath);
  return results;
}

function copyFileTracked(sourcePath, targetPath, options = {}) {
  const { overwrite = false, bucket } = options;
  ensureDir(path.dirname(targetPath));

  const exists = fs.existsSync(targetPath);
  if (exists && !overwrite) {
    if (bucket) {
      bucket.skipped.push(targetPath);
    }
    return 'skipped';
  }

  fs.copyFileSync(sourcePath, targetPath);
  if (bucket) {
    bucket[exists ? 'updated' : 'created'].push(targetPath);
  }
  return exists ? 'updated' : 'created';
}

function copyDirectoryTracked(sourceDir, targetDir, options = {}) {
  const {
    overwrite = false,
    bucket = { created: [], updated: [], skipped: [] },
    filter = () => true,
  } = options;

  ensureDir(targetDir);
  const files = walkFiles(sourceDir, filter);
  for (const sourcePath of files) {
    const relative = path.relative(sourceDir, sourcePath);
    const targetPath = path.join(targetDir, relative);
    copyFileTracked(sourcePath, targetPath, { overwrite, bucket });
  }

  return bucket;
}

function loadTargetRuntimeScripts() {
  const sourcePackage = readJson(sourceLayout().packageJson);
  return Object.fromEntries(
    Object.entries(sourcePackage.scripts || {}).filter(([name]) => !INSTALLER_ONLY_SCRIPTS.has(name)),
  );
}

function patchPackageJsonScripts(targetRepo, options = {}) {
  const { overwriteConflicts = false } = options;
  const packageJsonPath = path.join(targetRepo, 'package.json');
  const runtimeScripts = loadTargetRuntimeScripts();
  let createdPackageJson = false;

  if (!fs.existsSync(packageJsonPath)) {
    const bootstrap = {
      name: slugifyName(path.basename(targetRepo)),
      private: true,
      version: '0.0.0',
      scripts: {},
    };
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(bootstrap, null, 2)}\n`);
    createdPackageJson = true;
  }

  const packageJson = readJson(packageJsonPath);
  const currentScripts = { ...(packageJson.scripts || {}) };
  const report = {
    packageJsonPath,
    missingPackageJson: false,
    createdPackageJson,
    added: [],
    updated: [],
    unchanged: [],
    conflicts: [],
  };

  for (const [name, value] of Object.entries(runtimeScripts)) {
    if (!(name in currentScripts)) {
      currentScripts[name] = value;
      report.added.push(name);
      continue;
    }

    if (currentScripts[name] === value) {
      report.unchanged.push(name);
      continue;
    }

    if (overwriteConflicts) {
      currentScripts[name] = value;
      report.updated.push(name);
      continue;
    }

    report.conflicts.push({
      name,
      existing: currentScripts[name],
      expected: value,
    });
  }

  packageJson.scripts = currentScripts;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return report;
}

function writeAgentsPatchTemplate(targetRepo) {
  const templatePath = path.join(targetRepo, 'docs', 'workflow', 'AGENTS_PATCH_TEMPLATE.md');
  const content = `# AGENTS PATCH TEMPLATE

Add or adapt a short workflow section like this inside your repo's \`AGENTS.md\`.

## Optional Workflow Layer

- Activate the workflow control plane only when the user explicitly asks for workflow, milestone, handoff, or closeout discipline.
- Resolve the active root from \`docs/workflow/WORKSTREAMS.md\` before reading workflow docs.
- Treat \`EXECPLAN.md\` as the only canonical plan source during plan and execute.
- Use \`npm run workflow:hud\`, \`npm run workflow:next\`, and \`npm run workflow:health -- --strict\` to orient, route, and verify.
- Keep \`.workflow/state.json\` generated and non-canonical; markdown files remain the source of truth.
`;

  ensureDir(path.dirname(templatePath));
  fs.writeFileSync(templatePath, content);
  return templatePath;
}

function seedWorkflowRootGaps(rootDir, templatesDir) {
  const docsToSeed = [
    {
      file: 'PREFERENCES.md',
      fields: [['Token efficiency measures', 'auto']],
      sections: [],
    },
    {
      file: 'STATUS.md',
      fields: [],
      sections: ['At-Risk Requirements'],
    },
    {
      file: 'CONTEXT.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Intent Core'],
    },
    {
      file: 'EXECPLAN.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Delivery Core', 'Open Requirements', 'Current Capability Slice', 'Cold Archive Refs'],
    },
    {
      file: 'VALIDATION.md',
      fields: [['Packet version', PACKET_VERSION]],
      sections: ['Validation Core'],
    },
    {
      file: 'HANDOFF.md',
      fields: [],
      sections: ['Continuity Checkpoint'],
    },
    {
      file: 'WINDOW.md',
      fields: [
        ['Packet loading mode', 'delta'],
        ['Token efficiency measures', 'auto'],
        ['Core packet size', '0'],
        ['Loaded packet size', '0'],
        ['Unchanged refs omitted', '0'],
        ['Cold refs omitted', '0'],
      ],
      sections: ['Packet Tier Summary', 'Checkpoint Guard'],
    },
  ];

  for (const doc of docsToSeed) {
    const targetPath = path.join(rootDir, doc.file);
    const templatePath = path.join(templatesDir, doc.file);
    if (!fs.existsSync(targetPath) || !fs.existsSync(templatePath)) {
      continue;
    }

    let content = read(targetPath);
    const template = read(templatePath);

    for (const [label, valueOverride] of doc.fields) {
      const templateValue = valueOverride ?? getFieldValue(template, label) ?? '';
      content = ensureField(content, label, templateValue);
      if (valueOverride != null && getFieldValue(content, label) !== valueOverride) {
        content = replaceOrAppendField(content, label, valueOverride);
      }
    }

    for (const heading of doc.sections) {
      content = ensureSection(content, heading, extractSection(template, heading));
    }

    if (content !== read(targetPath)) {
      write(targetPath, content);
    }
  }
}

function syncDefaultWorkflowSurface(targetRepo, options = {}) {
  const { setAsActive = false } = options;
  const rootDir = path.join(targetRepo, 'docs', 'workflow');
  const paths = workflowPaths(rootDir, targetRepo);
  const controls = controlPaths(targetRepo);
  const { templatesDir } = sourceLayout();

  ensureDir(paths.archiveDir);
  if (!fs.existsSync(path.join(paths.archiveDir, 'README.md'))) {
    fs.writeFileSync(
      path.join(paths.archiveDir, 'README.md'),
      '# COMPLETED MILESTONES\n\n- `Completed milestone archives are stored here`\n',
    );
  }

  seedWorkflowRootGaps(rootDir, templatesDir);

  const {
    contextPacket,
    execplanPacket,
    validationPacket,
    windowStatus,
  } = syncStablePacketSet(paths);

  if (fs.existsSync(controls.workstreams)) {
    let workstreams = read(controls.workstreams);
    const table = parseWorkstreamTable(workstreams);
    const defaultRoot = 'docs/workflow';
    let targetRow = table.rows.find((row) => row.root === defaultRoot || row.name === 'workflow');

    if (!targetRow) {
      targetRow = {
        name: 'workflow',
        root: defaultRoot,
        status: 'inactive',
        currentMilestone: 'NONE',
        step: 'complete',
        packetHash: execplanPacket.inputHash,
        budgetStatus: windowStatus.budgetStatus,
        health: 'pending',
        notes: 'Default workflow control plane',
      };
      table.rows.push(targetRow);
    }

    targetRow.name = 'workflow';
    targetRow.root = defaultRoot;
    targetRow.packetHash = execplanPacket.inputHash;
    targetRow.budgetStatus = windowStatus.budgetStatus;
    targetRow.health = targetRow.health || 'pending';
    targetRow.notes = targetRow.notes || 'Default workflow control plane';

    if (setAsActive) {
      for (const row of table.rows) {
        row.status = row === targetRow ? 'active' : 'inactive';
      }
      workstreams = replaceField(workstreams, 'Active workstream name', 'workflow');
      workstreams = replaceField(workstreams, 'Active workstream root', defaultRoot);
    }

    workstreams = replaceField(workstreams, 'Last updated', today());
    workstreams = replaceSection(
      workstreams,
      'Workstream Table',
      renderWorkstreamTable(table.headerLines, table.rows),
    );
    write(controls.workstreams, workstreams);
  }

  runTargetScript(targetRepo, 'build_packet.js', ['--all', '--sync']);
  const stabilized = {
    contextPacket: buildPacketSnapshot(paths, { doc: 'context', step: 'discuss' }),
    execplanPacket: buildPacketSnapshot(paths, { doc: 'execplan', step: 'plan' }),
    validationPacket: buildPacketSnapshot(paths, { doc: 'validation', step: 'audit' }),
    windowStatus: computeWindowStatus(paths, { doc: 'validation', step: 'audit' }),
  };

  return {
    rootDir,
    contextPacket: stabilized.contextPacket,
    execplanPacket: stabilized.execplanPacket,
    validationPacket: stabilized.validationPacket,
    windowStatus: stabilized.windowStatus,
  };
}

function runTargetScript(targetRepo, scriptFile, args = []) {
  return childProcess.execFileSync(
    'node',
    [path.join(targetRepo, 'scripts', 'workflow', scriptFile), ...args],
    {
      cwd: targetRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function verifyInstalledSurface(targetRepo) {
  runTargetScript(targetRepo, 'doctor.js');
  runTargetScript(targetRepo, 'health.js');
  runTargetScript(targetRepo, 'next_step.js');
  const hud = runTargetScript(targetRepo, 'hud.js', ['--json']);
  return JSON.parse(hud);
}

function installWorkflowSurface(targetRepo, options = {}) {
  const {
    mode = 'init',
    forceDocs = false,
    refreshDocs = false,
    overwriteScriptConflicts = false,
    writeAgentsTemplate = false,
    verify = true,
  } = options;
  const source = sourceLayout();
  const docsTarget = path.join(targetRepo, 'docs', 'workflow');
  const scriptsTarget = path.join(targetRepo, 'scripts', 'workflow');
  const compareTarget = path.join(targetRepo, 'scripts', 'compare_golden_snapshots.ts');
  const skillTarget = path.join(targetRepo, '.agents', 'skills', 'codex-workflow', 'SKILL.md');

  ensureDir(targetRepo);

  const docsExists = fs.existsSync(docsTarget);
  if (mode === 'init' && docsExists && !forceDocs) {
    throw new Error(`Workflow root already exists at ${docsTarget}. Run workflow:migrate or pass --force-docs.`);
  }

  const report = {
    targetRepo,
    mode,
    docs: { created: [], updated: [], skipped: [] },
    scripts: { created: [], updated: [], skipped: [] },
    compareScript: null,
    skill: null,
    packageScripts: null,
    agentsTemplate: null,
    sync: null,
    hudState: null,
  };

  copyDirectoryTracked(source.templatesDir, docsTarget, {
    overwrite: forceDocs || refreshDocs,
    bucket: report.docs,
  });

  copyDirectoryTracked(source.scriptsDir, scriptsTarget, {
    overwrite: true,
    bucket: report.scripts,
    filter: (filePath) => !INSTALLER_ONLY_FILES.has(path.basename(filePath)),
  });

  report.compareScript = copyFileTracked(source.compareScript, compareTarget, { overwrite: true });
  report.skill = copyFileTracked(source.skillFile, skillTarget, { overwrite: true });
  report.packageScripts = patchPackageJsonScripts(targetRepo, {
    overwriteConflicts: overwriteScriptConflicts,
  });

  if (writeAgentsTemplate) {
    report.agentsTemplate = writeAgentsPatchTemplate(targetRepo);
  }

  report.sync = syncDefaultWorkflowSurface(targetRepo, { setAsActive: mode === 'init' });
  if (verify) {
    report.hudState = verifyInstalledSurface(targetRepo);
  }

  return report;
}

function formatInstallSummary(report) {
  const targetRepo = report.targetRepo;
  const lines = [
    `- Target: \`${targetRepo}\``,
    `- Docs created: \`${report.docs.created.length}\``,
    `- Docs updated: \`${report.docs.updated.length}\``,
    `- Scripts created: \`${report.scripts.created.length}\``,
    `- Scripts updated: \`${report.scripts.updated.length}\``,
    `- Compare script: \`${report.compareScript}\``,
    `- Skill: \`${report.skill}\``,
  ];

  if (report.packageScripts.missingPackageJson) {
    lines.push('- Package scripts: `package.json missing, so script patching was skipped`');
  } else {
    if (report.packageScripts.createdPackageJson) {
      lines.push('- Package JSON: `created minimal package.json for workflow scripts`');
    }
    lines.push(`- Package scripts added: \`${report.packageScripts.added.length}\``);
    lines.push(`- Package scripts updated: \`${report.packageScripts.updated.length}\``);
    if (report.packageScripts.conflicts.length > 0) {
      lines.push(`- Package script conflicts: \`${report.packageScripts.conflicts.length}\``);
    }
  }

  if (report.agentsTemplate) {
    lines.push(`- AGENTS patch template: \`${relativePath(targetRepo, report.agentsTemplate)}\``);
  }

  if (report.hudState) {
    lines.push(`- State file: \`${report.hudState.stateFileRelative || relativePath(targetRepo, report.hudState.stateFile)}\``);
    lines.push(`- HUD health: \`${report.hudState.health.status}\` (\`${report.hudState.health.failCount}\` fail / \`${report.hudState.health.warnCount}\` warn)`);
  }

  return lines;
}

module.exports = {
  formatInstallSummary,
  installWorkflowSurface,
  relativePath,
  sourceRepoRoot,
};
