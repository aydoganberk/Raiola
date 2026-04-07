const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ensureDir,
  readIfExists,
} = require('./common');
const {
  deriveRepoRoles,
  lineDiff,
  listEntries,
  makeId,
  nowIso,
  parseSimpleToml,
  readJsonFile,
  relativePath,
  removeFileIfExists,
  renderSimpleToml,
  writeJsonFile,
} = require('./roadmap_os');

const PROMPT_CATALOG = Object.freeze([
  {
    name: 'reviewer',
    summary: 'Bias toward bugs, regressions, and missing tests before summaries.',
  },
  {
    name: 'implementer',
    summary: 'Bias toward delivering a concrete patch slice with verification.',
  },
  {
    name: 'release-noter',
    summary: 'Bias toward PR, release notes, and ship communication quality.',
  },
]);

function scopeName(args) {
  if (args.global) {
    return 'global';
  }
  if (args.local) {
    return 'local';
  }
  return 'repo';
}

function desiredCodexRoot(cwd, args) {
  if (scopeName(args) === 'global') {
    const base = process.env.CODEX_HOME
      ? path.resolve(process.env.CODEX_HOME)
      : os.homedir();
    return path.join(base, '.codex');
  }
  return path.join(cwd, '.codex');
}

function codexRoot(cwd, args) {
  const desiredRoot = desiredCodexRoot(cwd, args);
  if (path.basename(desiredRoot) === '.codex') {
    return path.join(cwd, '.workflow', 'runtime', 'codex-control', `${scopeName(args)}-codex`);
  }
  return desiredRoot;
}

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'codex-control');
}

function journalFile(cwd) {
  return path.join(runtimeDir(cwd), 'journal.jsonl');
}

function backupsDir(cwd) {
  return path.join(runtimeDir(cwd), 'backups');
}

function desiredConfig(cwd) {
  const roles = deriveRepoRoles(cwd).map((entry) => entry.name);
  return {
    workflow: {
      repo_root: cwd,
      workflow_root: path.join(cwd, 'docs', 'workflow'),
      runtime_root: path.join(cwd, '.workflow', 'runtime'),
      control_mode: 'safe',
      roles,
    },
    routing: {
      default_entry: 'cwf codex',
      daily_entry: 'cwf do',
      verify_entry: 'cwf verify-shell',
      packet_entry: 'cwf packet compile',
    },
    safety: {
      preview_first: true,
      backup_journal: true,
      rollback_enabled: true,
    },
  };
}

function roleFilePath(rootDir, role) {
  return path.join(rootDir, 'roles', `${role}.md`);
}

function promptFilePath(rootDir, prompt) {
  return path.join(rootDir, 'prompts', `${prompt}.md`);
}

function skillFilePath(rootDir, role) {
  return path.join(rootDir, 'skills', `${role}.md`);
}

function configPath(rootDir) {
  return path.join(rootDir, 'config.toml');
}

function catalogPath(rootDir) {
  return path.join(rootDir, 'catalog.json');
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function snapshotCurrentState(cwd, rootDir, action) {
  if (!fs.existsSync(rootDir)) {
    return null;
  }
  const backupId = makeId(`codex-${action}`);
  const backupRoot = path.join(backupsDir(cwd), backupId);
  ensureDir(backupRoot);

  const files = [
    ['config.toml', configPath(rootDir)],
    ['catalog.json', catalogPath(rootDir)],
  ];

  const directories = [
    ['roles', path.join(rootDir, 'roles')],
    ['prompts', path.join(rootDir, 'prompts')],
    ['skills', path.join(rootDir, 'skills')],
  ];

  for (const [relativeName, sourcePath] of files) {
    copyFileIfExists(sourcePath, path.join(backupRoot, relativeName));
  }
  for (const [relativeName, sourceDir] of directories) {
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    ensureDir(path.join(backupRoot, relativeName));
    for (const entry of listEntries(sourceDir, { filesOnly: true })) {
      fs.copyFileSync(entry.fullPath, path.join(backupRoot, relativeName, entry.name));
    }
  }

  const payload = {
    id: backupId,
    action,
    createdAt: nowIso(),
    rootDir,
    backupRoot,
  };
  const journalPath = journalFile(cwd);
  ensureDir(path.dirname(journalPath));
  fs.appendFileSync(journalPath, `${JSON.stringify(payload)}\n`);
  return payload;
}

function latestBackup(cwd) {
  const journalContent = readIfExists(journalFile(cwd)) || '';
  const rows = journalContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return rows[rows.length - 1] || null;
}

function writeRoleFiles(cwd, rootDir, roles) {
  const created = [];
  ensureDir(path.join(rootDir, 'roles'));
  for (const role of roles) {
    const filePath = roleFilePath(rootDir, role.name);
    const content = `# ${role.name}\n\n- Summary: \`${role.summary}\`\n- Generated from: \`repo-profile\`\n- Repo root: \`${cwd}\`\n\n## Responsibilities\n\n- \`${role.summary}\`\n- \`Use packet compile output before taking action\`\n- \`Keep evidence and verification visible in closeout\`\n`;
    fs.writeFileSync(filePath, content);
    created.push(relativePath(cwd, filePath));
  }
  return created;
}

function writePromptFiles(cwd, rootDir) {
  const created = [];
  ensureDir(path.join(rootDir, 'prompts'));
  for (const prompt of PROMPT_CATALOG) {
    const filePath = promptFilePath(rootDir, prompt.name);
    const content = `# ${prompt.name}\n\n- Summary: \`${prompt.summary}\`\n\n## Prompt\n\n- \`Start by reading the relevant workflow packet, then explain the plan, make the change, verify it, and report evidence.\`\n- \`Keep the command surface safe, preview-first, and rollback-aware.\`\n`;
    fs.writeFileSync(filePath, content);
    created.push(relativePath(cwd, filePath));
  }
  return created;
}

function writeCatalog(rootDir, payload) {
  writeJsonFile(catalogPath(rootDir), payload);
}

function readCatalog(rootDir) {
  return readJsonFile(catalogPath(rootDir), {
    generatedAt: null,
    roles: [],
    prompts: [],
    scope: null,
  });
}

function doSetup(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const backup = snapshotCurrentState(cwd, rootDir, 'setup');
  const roles = deriveRepoRoles(cwd);
  const prompts = [...PROMPT_CATALOG];
  ensureDir(rootDir);
  fs.writeFileSync(configPath(rootDir), `${renderSimpleToml(desiredConfig(cwd))}\n`);
  const writtenRoles = writeRoleFiles(cwd, rootDir, roles);
  const writtenPrompts = writePromptFiles(cwd, rootDir);
  writeCatalog(rootDir, {
    generatedAt: nowIso(),
    scope: scopeName(args),
    roles,
    prompts,
  });
  return {
    action: 'setup',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    configFile: relativePath(cwd, configPath(rootDir)),
    backup: backup ? relativePath(cwd, backup.backupRoot) : null,
    roles: writtenRoles,
    prompts: writtenPrompts,
  };
}

function doDiff(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const current = readIfExists(configPath(rootDir)) || '';
  const target = `${renderSimpleToml(desiredConfig(cwd))}\n`;
  return {
    action: 'diff-config',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    configExists: Boolean(current),
    changed: current !== target,
    diffLines: lineDiff(current, target),
  };
}

function doDoctor(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const issues = [];
  const configContent = readIfExists(configPath(rootDir));
  if (!configContent) {
    issues.push({
      status: 'fail',
      message: 'config.toml is missing',
      fix: 'cwf codex setup --repo',
    });
  } else {
    try {
      parseSimpleToml(configContent);
    } catch (error) {
      issues.push({
        status: 'fail',
        message: `config.toml is invalid -> ${error.message}`,
        fix: 'cwf codex repair --repo',
      });
    }
  }

  const diff = doDiff(cwd, args);
  if (diff.changed) {
    issues.push({
      status: 'warn',
      message: 'Generated config drift detected',
      fix: 'cwf codex sync --repo',
    });
  }

  const catalog = readCatalog(rootDir);
  if ((catalog.roles || []).length === 0) {
    issues.push({
      status: 'warn',
      message: 'Role catalog is missing or empty',
      fix: 'cwf codex scaffold-role --from repo-profile',
    });
  }
  for (const role of catalog.roles || []) {
    if (!fs.existsSync(roleFilePath(rootDir, role.name))) {
      issues.push({
        status: 'warn',
        message: `Role file missing -> ${role.name}`,
        fix: 'cwf codex sync --repo',
      });
    }
  }
  for (const prompt of catalog.prompts || PROMPT_CATALOG) {
    const name = prompt.name || prompt;
    if (!fs.existsSync(promptFilePath(rootDir, name))) {
      issues.push({
        status: 'warn',
        message: `Prompt file missing -> ${name}`,
        fix: 'cwf codex sync --repo',
      });
    }
  }

  return {
    action: 'doctor',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    verdict: issues.some((issue) => issue.status === 'fail')
      ? 'fail'
      : issues.length > 0
        ? 'warn'
        : 'pass',
    issues,
  };
}

function doSync(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const backup = snapshotCurrentState(cwd, rootDir, 'sync');
  const payload = doSetup(cwd, args);
  return {
    action: 'sync',
    scope: payload.scope,
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    configFile: payload.configFile,
    backup: backup ? relativePath(cwd, backup.backupRoot) : payload.backup,
    roles: payload.roles,
    prompts: payload.prompts,
  };
}

function doRollback(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const backup = latestBackup(cwd);
  if (!backup) {
    return {
      action: 'rollback',
      scope: scopeName(args),
      rootDir,
      virtualRoot: desiredCodexRoot(cwd, args),
      restored: false,
      message: 'No journal backup exists yet.',
    };
  }

  ensureDir(rootDir);
  copyFileIfExists(path.join(backup.backupRoot, 'config.toml'), configPath(rootDir));
  copyFileIfExists(path.join(backup.backupRoot, 'catalog.json'), catalogPath(rootDir));
  for (const bucket of ['roles', 'prompts', 'skills']) {
    const backupBucket = path.join(backup.backupRoot, bucket);
    const targetBucket = path.join(rootDir, bucket);
    removeFileIfExists(targetBucket);
    if (!fs.existsSync(backupBucket)) {
      continue;
    }
    ensureDir(targetBucket);
    for (const entry of listEntries(backupBucket, { filesOnly: true })) {
      fs.copyFileSync(entry.fullPath, path.join(targetBucket, entry.name));
    }
  }

  return {
    action: 'rollback',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    restored: true,
    backupId: backup.id,
  };
}

function doUninstall(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const backup = snapshotCurrentState(cwd, rootDir, 'uninstall');
  removeFileIfExists(rootDir);
  return {
    action: 'uninstall',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    removed: !fs.existsSync(rootDir),
    backup: backup ? relativePath(cwd, backup.backupRoot) : null,
  };
}

function doRepair(cwd, args) {
  const doctor = doDoctor(cwd, args);
  if (doctor.verdict === 'pass') {
    return {
      action: 'repair',
      scope: scopeName(args),
      rootDir: doctor.rootDir,
      virtualRoot: doctor.virtualRoot,
      repaired: false,
      doctor,
    };
  }
  const sync = doSync(cwd, args);
  return {
    action: 'repair',
    scope: scopeName(args),
    rootDir: sync.rootDir,
    virtualRoot: sync.virtualRoot,
    repaired: true,
    doctor,
    sync,
  };
}

function doRoles(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const catalog = readCatalog(rootDir);
  return {
    action: 'roles',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    roles: (catalog.roles || []).map((entry) => ({
      name: entry.name,
      summary: entry.summary,
      file: relativePath(cwd, roleFilePath(rootDir, entry.name)),
    })),
  };
}

function doPrompts(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const catalog = readCatalog(rootDir);
  return {
    action: 'prompts',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    prompts: (catalog.prompts || []).map((entry) => {
      const name = entry.name || entry;
      return {
        name,
        summary: entry.summary || '',
        file: relativePath(cwd, promptFilePath(rootDir, name)),
      };
    }),
  };
}

function doInstallSkill(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const role = String(args.role || '').trim();
  if (!role) {
    throw new Error('--role is required');
  }
  const skillSource = path.join(cwd, '.agents', 'skills', 'codex-workflow', 'SKILL.md');
  ensureDir(path.join(rootDir, 'skills'));
  const targetPath = skillFilePath(rootDir, role);
  if (!copyFileIfExists(skillSource, targetPath)) {
    fs.writeFileSync(targetPath, `# ${role}\n\n- Installed from: \`generated fallback\`\n- Purpose: \`Use the shared workflow discipline for ${role}\`\n`);
  }
  return {
    action: 'install-skill',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    role,
    file: relativePath(cwd, targetPath),
  };
}

function doRemoveSkill(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const role = String(args.role || '').trim();
  if (!role) {
    throw new Error('--role is required');
  }
  const targetPath = skillFilePath(rootDir, role);
  removeFileIfExists(targetPath);
  return {
    action: 'remove-skill',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    role,
    removed: !fs.existsSync(targetPath),
  };
}

function doScaffoldRole(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const roles = args.from === 'repo-profile' || args._.includes('repo-profile')
    ? deriveRepoRoles(cwd)
    : deriveRepoRoles(cwd);
  const backup = snapshotCurrentState(cwd, rootDir, 'scaffold-role');
  ensureDir(rootDir);
  const writtenRoles = writeRoleFiles(cwd, rootDir, roles);
  const catalog = readCatalog(rootDir);
  writeCatalog(rootDir, {
    ...catalog,
    generatedAt: nowIso(),
    scope: scopeName(args),
    roles,
    prompts: catalog.prompts && catalog.prompts.length > 0 ? catalog.prompts : [...PROMPT_CATALOG],
  });
  return {
    action: 'scaffold-role',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    backup: backup ? relativePath(cwd, backup.backupRoot) : null,
    roles: writtenRoles,
  };
}

function doStatus(cwd, args) {
  const rootDir = codexRoot(cwd, args);
  const doctor = doDoctor(cwd, args);
  const catalog = readCatalog(rootDir);
  return {
    action: 'status',
    scope: scopeName(args),
    rootDir,
    virtualRoot: desiredCodexRoot(cwd, args),
    configExists: fs.existsSync(configPath(rootDir)),
    catalogExists: fs.existsSync(catalogPath(rootDir)),
    roleCount: (catalog.roles || []).length,
    promptCount: (catalog.prompts || []).length,
    journalEntries: (readIfExists(journalFile(cwd)) || '').split('\n').filter(Boolean).length,
    verdict: doctor.verdict,
  };
}

module.exports = {
  PROMPT_CATALOG,
  codexRoot,
  desiredCodexRoot,
  desiredConfig,
  doDiff,
  doDoctor,
  doInstallSkill,
  doPrompts,
  doRemoveSkill,
  doRepair,
  doRoles,
  doRollback,
  doScaffoldRole,
  doSetup,
  doStatus,
  doSync,
  doUninstall,
  promptFilePath,
  readCatalog,
  roleFilePath,
  runtimeDir,
  scopeName,
};
