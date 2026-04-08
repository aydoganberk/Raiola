const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { parseArgs, slugify } = require('./common');
const { readJsonFile, relativePath, writeJsonFile } = require('./roadmap_os');
const { serverIds, toolCountFor } = require('./mcp_server');

function runtimeDir(cwd) {
  return path.join(cwd, '.workflow', 'runtime', 'mcp');
}

function manifestPath(cwd) {
  return path.join(runtimeDir(cwd), 'manifest.json');
}

function serverDescriptorPath(cwd, serverId) {
  return path.join(runtimeDir(cwd), 'servers', `${serverId}.json`);
}

function loadManifest(cwd) {
  return readJsonFile(manifestPath(cwd), null);
}

function detectCodexBinary(command = 'codex') {
  try {
    const result = childProcess.spawnSync(command, ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function codexRegistrySnapshot(command = 'codex') {
  if (!detectCodexBinary(command)) {
    return {
      available: false,
      servers: [],
    };
  }
  const result = childProcess.spawnSync(command, ['mcp', 'list', '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    return {
      available: true,
      servers: [],
      error: (result.stderr || result.stdout || 'Unable to inspect Codex MCP registry').trim(),
    };
  }
  let servers = [];
  try {
    servers = JSON.parse(result.stdout || '[]');
  } catch {
    servers = [];
  }
  return {
    available: true,
    servers,
  };
}

function repoSlug(cwd) {
  return slugify(path.basename(cwd) || 'repo');
}

function buildServerDescriptor(cwd, serverId) {
  const scriptPath = path.join(cwd, 'scripts', 'workflow', 'mcp_server.js');
  return {
    id: serverId,
    name: `rai-${repoSlug(cwd)}-${serverId}`,
    title: serverId,
    transport: 'stdio',
    toolCount: toolCountFor(serverId),
    command: process.execPath,
    args: [scriptPath, '--server', serverId, '--repo', cwd],
    cwd,
    script: relativePath(cwd, scriptPath),
    descriptorFile: relativePath(cwd, serverDescriptorPath(cwd, serverId)),
  };
}

function writeManifest(cwd, manifest) {
  writeJsonFile(manifestPath(cwd), manifest);
}

function writeServerDescriptor(cwd, descriptor) {
  writeJsonFile(serverDescriptorPath(cwd, descriptor.id), descriptor);
}

function installMcp(cwd, args = {}) {
  const descriptors = serverIds().map((serverId) => buildServerDescriptor(cwd, serverId));
  for (const descriptor of descriptors) {
    writeServerDescriptor(cwd, descriptor);
  }

  const registry = codexRegistrySnapshot(String(args['codex-bin'] || 'codex'));
  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    enabled: true,
    repoRoot: cwd,
    servers: descriptors,
    codexRegistry: {
      available: registry.available,
      knownServers: registry.available ? registry.servers.map((server) => server.name) : [],
      registeredCount: registry.available ? registry.servers.length : 0,
    },
  };

  if (args['register-codex']) {
    const codexCommand = String(args['codex-bin'] || 'codex');
    if (!registry.available) {
      throw new Error(`Codex CLI not found for MCP registration: ${codexCommand}`);
    }
    const existing = new Set(registry.servers.map((server) => server.name));
    const registrationResults = [];
    for (const descriptor of descriptors) {
      if (existing.has(descriptor.name)) {
        registrationResults.push({
          name: descriptor.name,
          status: 'existing',
        });
        continue;
      }
      const result = childProcess.spawnSync(
        codexCommand,
        ['mcp', 'add', descriptor.name, '--', descriptor.command, ...descriptor.args],
        {
          cwd,
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
      registrationResults.push({
        name: descriptor.name,
        status: result.status === 0 ? 'added' : 'failed',
        error: result.status === 0 ? null : (result.stderr || result.stdout || 'Registration failed').trim(),
      });
    }
    manifest.codexRegistration = {
      requested: true,
      attemptedAt: new Date().toISOString(),
      results: registrationResults,
    };
  }

  writeManifest(cwd, manifest);
  return manifest;
}

function sendFramedMessage(stream, payload) {
  const json = JSON.stringify(payload);
  stream.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
}

function smokeDescriptor(descriptor) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(descriptor.command, descriptor.args, {
      cwd: descriptor.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const pending = new Map();
    let nextId = 1;
    let buffer = Buffer.alloc(0);
    let settled = false;
    let stderr = '';

    function finish(payload) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve(payload);
    }

    function request(method, params = {}) {
      return new Promise((resolveRequest, rejectRequest) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolveRequest, rejectRequest });
        sendFramedMessage(child.stdin, {
          jsonrpc: '2.0',
          id,
          method,
          params,
        });
      });
    }

    function handleMessage(message) {
      if (message.id == null) {
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }
      pending.delete(message.id);
      if (message.error) {
        entry.rejectRequest(new Error(message.error.message || 'MCP request failed'));
        return;
      }
      entry.resolveRequest(message.result);
    }

    function parseFrames() {
      while (true) {
        const headerIndex = buffer.indexOf('\r\n\r\n');
        if (headerIndex === -1) {
          return;
        }
        const header = buffer.slice(0, headerIndex).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          finish({
            server: descriptor.id,
            status: 'fail',
            error: 'Invalid MCP response header',
          });
          return;
        }
        const length = Number(match[1]);
        const bodyStart = headerIndex + 4;
        const bodyEnd = bodyStart + length;
        if (buffer.length < bodyEnd) {
          return;
        }
        const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
        buffer = buffer.slice(bodyEnd);
        try {
          handleMessage(JSON.parse(body));
        } catch (error) {
          finish({
            server: descriptor.id,
            status: 'fail',
            error: error.message,
          });
          return;
        }
      }
    }

    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      parseFrames();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish({
        server: descriptor.id,
        status: 'fail',
        error: error.message,
      });
    });
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish({
          server: descriptor.id,
          status: 'fail',
          error: stderr.trim() || `Server exited with code ${code}`,
        });
      }
    });

    const timer = setTimeout(() => {
      finish({
        server: descriptor.id,
        status: 'fail',
        error: 'Timed out while probing MCP server',
      });
    }, 5000);

    (async () => {
      try {
        const initialized = await request('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'raiola-doctor',
            version: '1.0.0',
          },
        });
        sendFramedMessage(child.stdin, {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        });
        const toolList = await request('tools/list');
        finish({
          server: descriptor.id,
          status: 'pass',
          serverInfo: initialized.serverInfo || null,
          toolCount: Array.isArray(toolList.tools) ? toolList.tools.length : 0,
          tools: Array.isArray(toolList.tools) ? toolList.tools.map((tool) => tool.name) : [],
        });
      } catch (error) {
        finish({
          server: descriptor.id,
          status: 'fail',
          error: error.message,
        });
      }
    })();
  });
}

async function doctorMcp(cwd, args = {}) {
  const manifest = loadManifest(cwd);
  if (!manifest) {
    return {
      installed: false,
      verdict: 'warn',
      file: relativePath(cwd, manifestPath(cwd)),
      servers: [],
      issues: ['Install the repo-local MCP surface first with `rai mcp install`.'],
      codexRegistry: codexRegistrySnapshot(String(args['codex-bin'] || 'codex')),
    };
  }

  const smoke = [];
  for (const descriptor of manifest.servers || []) {
    smoke.push(await smokeDescriptor(descriptor));
  }
  const failCount = smoke.filter((item) => item.status !== 'pass').length;
  return {
    installed: true,
    verdict: failCount > 0 ? 'fail' : 'pass',
    file: relativePath(cwd, manifestPath(cwd)),
    smoke,
    codexRegistry: codexRegistrySnapshot(String(args['codex-bin'] || 'codex')),
  };
}

function statusMcp(cwd, args = {}) {
  const manifest = loadManifest(cwd);
  const registry = codexRegistrySnapshot(String(args['codex-bin'] || 'codex'));
  const registeredNames = new Set(registry.servers.map((server) => server.name));
  const servers = manifest?.servers
    ? manifest.servers.map((descriptor) => ({
      id: descriptor.id,
      name: descriptor.name,
      toolCount: descriptor.toolCount,
      descriptorFile: descriptor.descriptorFile,
      registeredInCodex: registeredNames.has(descriptor.name),
    }))
    : serverIds().map((serverId) => {
      const descriptor = buildServerDescriptor(cwd, serverId);
      return {
        id: descriptor.id,
        name: descriptor.name,
        toolCount: descriptor.toolCount,
        descriptorFile: descriptor.descriptorFile,
        registeredInCodex: registeredNames.has(descriptor.name),
      };
    });
  return {
    installed: Boolean(manifest),
    enabled: Boolean(manifest?.enabled),
    file: relativePath(cwd, manifestPath(cwd)),
    manifest: manifest || {
      enabled: false,
      servers,
    },
    servers,
    codexRegistry: registry,
  };
}

function printHelp() {
  console.log(`
mcp

Usage:
  node scripts/workflow/mcp.js install
  node scripts/workflow/mcp.js doctor
  node scripts/workflow/mcp.js status

Options:
  --register-codex         Register the repo-local stdio servers in the local Codex CLI config
  --codex-bin <path>       Override the Codex CLI used for registry inspection/registration
  --json                   Print machine-readable output
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args._[0] || 'status';
  if (args.help || action === 'help') {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  let payload;
  if (action === 'install') {
    payload = {
      action,
      manifest: installMcp(cwd, args),
    };
  } else if (action === 'doctor') {
    payload = {
      action,
      ...(await doctorMcp(cwd, args)),
    };
  } else if (action === 'status') {
    payload = {
      action,
      ...statusMcp(cwd, args),
    };
  } else {
    throw new Error(`Unknown MCP action: ${action}`);
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    if (payload.verdict === 'fail') {
      process.exitCode = 1;
    }
    return;
  }

  console.log('# MCP\n');
  console.log(`- Action: \`${payload.action}\``);
  if (payload.file) {
    console.log(`- Manifest: \`${payload.file}\``);
  }
  if (payload.manifest) {
    console.log(`- Enabled: \`${payload.manifest.enabled ? 'yes' : 'no'}\``);
    console.log(`- Servers: \`${payload.manifest.servers.map((server) => server.id).join(', ')}\``);
  }
  if (payload.servers) {
    console.log(`- Installed: \`${payload.installed ? 'yes' : 'no'}\``);
    console.log(`- Enabled: \`${payload.enabled ? 'yes' : 'no'}\``);
    console.log('\n## Servers\n');
    for (const server of payload.servers) {
      console.log(`- \`${server.id}\` -> name=\`${server.name}\` tools=\`${server.toolCount}\` codex=\`${server.registeredInCodex ? 'registered' : 'local-only'}\``);
    }
  }
  if (payload.smoke) {
    console.log(`- Verdict: \`${payload.verdict}\``);
    console.log('\n## Smoke\n');
    for (const result of payload.smoke) {
      if (result.status === 'pass') {
        console.log(`- \`${result.server}\` -> pass (\`${result.toolCount}\` tools)`);
      } else {
        console.log(`- \`${result.server}\` -> fail: ${result.error}`);
      }
    }
  }
  if (payload.issues) {
    console.log('\n## Issues\n');
    for (const issue of payload.issues) {
      console.log(`- ${issue}`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
