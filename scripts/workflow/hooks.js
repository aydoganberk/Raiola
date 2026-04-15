const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('./common');
const { relativePath } = require('./roadmap_os');
const {
  buildConfigSpec,
  hookConfigObject,
  renderConfigToml,
  resolveCodexHooksEnabled,
  writeHookAssets,
  writeHookRegistration,
} = require('./codex_native');

const DEFAULT_HOOKS = Object.freeze({
  hooks: hookConfigObject().hooks,
  generatedAt: null,
});

function codexRoot(cwd) {
  return path.join(cwd, '.codex');
}

function hooksPath(cwd) {
  return path.join(codexRoot(cwd), 'hooks.json');
}

function configPath(cwd) {
  return path.join(codexRoot(cwd), 'config.toml');
}

function registrationPresent(cwd) {
  return fs.existsSync(hooksPath(cwd));
}

function shippedHookAssets(cwd) {
  const root = path.resolve(cwd);
  const hookConfig = path.join(root, '.codex', 'hooks.json');
  const hookDir = path.join(root, '.codex', 'hooks');
  const hookFiles = [
    path.join(hookDir, 'common.js'),
    path.join(hookDir, 'session_start.js'),
    path.join(hookDir, 'pre_tool_use_policy.js'),
    path.join(hookDir, 'post_tool_use_review.js'),
    path.join(hookDir, 'user_prompt_submit.js'),
    path.join(hookDir, 'stop_continue.js'),
  ];
  const metaSkillCandidates = [
    path.join(root, 'skills', 'using-raiola', 'SKILL.md'),
    path.join(root, '.agents', 'skills', 'raiola', 'SKILL.md'),
  ];
  const metaSkill = metaSkillCandidates.find((filePath) => fs.existsSync(filePath)) || metaSkillCandidates[0];
  return {
    hookConfig,
    hookFiles,
    sessionStart: path.join(hookDir, 'session_start.js'),
    preTool: path.join(hookDir, 'pre_tool_use_policy.js'),
    metaSkill,
    present: hookFiles.every((filePath) => fs.existsSync(filePath)) && metaSkillCandidates.some((filePath) => fs.existsSync(filePath)),
  };
}

function readHooks(cwd) {
  const filePath = hooksPath(cwd);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readHooksEnabled(cwd) {
  return Boolean(resolveCodexHooksEnabled(cwd, {}));
}

function writeConfigWithHooksState(cwd, enabled) {
  const filePath = configPath(cwd);
  const hooksEnabled = Boolean(enabled);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    const spec = buildConfigSpec(cwd, { repo: true, _: ['setup'], hooksEnabled });
    fs.writeFileSync(filePath, renderConfigToml(spec));
    return filePath;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  if (/^codex_hooks\s*=\s*(true|false)/m.test(content)) {
    content = content.replace(/^codex_hooks\s*=\s*(true|false)/m, `codex_hooks = ${hooksEnabled ? 'true' : 'false'}`);
  } else if (/^\[features\]$/m.test(content)) {
    content = content.replace(/^\[features\]$/m, `[features]\ncodex_hooks = ${hooksEnabled ? 'true' : 'false'}`);
  } else {
    content = `${String(content || '').trimEnd()}\n\n[features]\ncodex_hooks = ${hooksEnabled ? 'true' : 'false'}\n`;
  }
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
  return filePath;
}

function seedHookScripts(cwd) {
  fs.mkdirSync(codexRoot(cwd), { recursive: true });
  return writeHookAssets(codexRoot(cwd), { register: false });
}

function enableHooks(cwd) {
  seedHookScripts(cwd);
  writeHookRegistration(codexRoot(cwd));
  writeConfigWithHooksState(cwd, true);
}

function disableHooks(cwd) {
  seedHookScripts(cwd);
  if (fs.existsSync(hooksPath(cwd))) {
    fs.rmSync(hooksPath(cwd), { force: true });
  }
  writeConfigWithHooksState(cwd, false);
}

function statusPayload(cwd, action, options = {}) {
  const shipped = shippedHookAssets(cwd);
  const registeredHooks = readHooks(cwd);
  const hooks = options.includeHooks ? (registeredHooks || { ...DEFAULT_HOOKS }) : undefined;
  const enabled = readHooksEnabled(cwd);
  const registered = registrationPresent(cwd);
  const hookEvents = Object.keys((registeredHooks && registeredHooks.hooks) || {}).length;
  return {
    action,
    file: relativePath(cwd, hooksPath(cwd)),
    configFile: relativePath(cwd, configPath(cwd)),
    hooksEnabled: enabled,
    registrationPresent: registered,
    hookEvents,
    shippedHookAssets: {
      present: shipped.present,
      hookConfig: relativePath(cwd, shipped.hookConfig),
      sessionStart: relativePath(cwd, shipped.sessionStart),
      preTool: relativePath(cwd, shipped.preTool),
      metaSkill: relativePath(cwd, shipped.metaSkill),
      hookFiles: shipped.hookFiles.map((filePath) => relativePath(cwd, filePath)),
    },
    ...(options.includeHooks ? { hooks } : {}),
  };
}

function validatePayload(cwd) {
  const payload = statusPayload(cwd, 'validate');
  const registrationRequired = payload.hooksEnabled;
  const rawRegistration = fs.existsSync(hooksPath(cwd))
    ? fs.readFileSync(hooksPath(cwd), 'utf8')
    : '';
  let registrationValid = !payload.registrationPresent;
  if (payload.registrationPresent) {
    try {
      JSON.parse(rawRegistration);
      registrationValid = true;
    } catch {
      registrationValid = false;
    }
  }
  return {
    ...payload,
    registrationRequired,
    registrationValid,
    verdict: payload.shippedHookAssets.present && registrationValid && (!registrationRequired || payload.registrationPresent)
      ? 'pass'
      : payload.shippedHookAssets.present
        ? 'warn'
        : 'fail',
  };
}

function printHelp() {
  console.log('Usage: node scripts/workflow/hooks.js status|enable|disable|validate|list [--json]');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  let payload;
  switch (action) {
    case 'status':
      payload = statusPayload(cwd, 'status');
      break;
    case 'list':
      payload = statusPayload(cwd, 'list', { includeHooks: true });
      break;
    case 'init':
    case 'enable':
      enableHooks(cwd);
      payload = statusPayload(cwd, action === 'init' ? 'init' : 'enable', { includeHooks: true });
      break;
    case 'disable':
      disableHooks(cwd);
      payload = statusPayload(cwd, 'disable', { includeHooks: true });
      break;
    case 'validate':
      payload = validatePayload(cwd);
      break;
    default:
      throw new Error(`Unknown hooks action: ${action}`);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('# HOOKS\n');
  console.log(`- Registration: \`${payload.registrationPresent ? 'present' : 'absent'}\``);
  console.log(`- Hooks enabled: \`${payload.hooksEnabled ? 'yes' : 'no'}\``);
  console.log(`- Native hook assets: \`${payload.shippedHookAssets.present ? 'present' : 'missing'}\``);
  console.log(`- Config: \`${payload.configFile}\``);
  console.log(`- Registration file: \`${payload.file}\``);
  if (payload.action === 'validate') {
    console.log(`- Verdict: \`${payload.verdict}\``);
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
