const fs = require('node:fs');
const path = require('node:path');
const { buildBaseState } = require('./state_surface');
const { parseArgs, resolveWorkflowRoot } = require('./common');
const { buildEvidenceGraph } = require('./evidence');
const { readApprovals, checkPolicy, loadPolicy } = require('./policy');
const { getLogSnapshot } = require('./team_runtime_log_index');
const { productVersion } = require('./product_version');

const PROTOCOL_VERSION = '2025-03-26';

function relativePath(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).replace(/\\/g, '/');
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function clipText(content, maxChars = 12000) {
  const limit = Number.isFinite(Number(maxChars)) ? Math.max(200, Number(maxChars)) : 12000;
  const value = String(content || '');
  if (value.length <= limit) {
    return {
      content: value,
      truncated: false,
      originalLength: value.length,
    };
  }
  return {
    content: `${value.slice(0, limit)}\n\n...[truncated]`,
    truncated: true,
    originalLength: value.length,
  };
}

function packetsDir(repoRoot) {
  return path.join(repoRoot, '.workflow', 'orchestration', 'packets');
}

function listPacketFiles(repoRoot) {
  const dirPath = packetsDir(repoRoot);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        id: entry.name.replace(/\.md$/, ''),
        file: relativePath(repoRoot, fullPath),
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolvePacketFile(repoRoot, taskId) {
  const normalized = String(taskId || '').trim();
  if (!normalized) {
    return null;
  }
  const candidate = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  const filePath = path.join(packetsDir(repoRoot), path.basename(candidate));
  return fs.existsSync(filePath) ? filePath : null;
}

function threadsDir(repoRoot) {
  return path.join(repoRoot, 'docs', 'workflow', 'THREADS');
}

function listThreads(repoRoot) {
  const dirPath = threadsDir(repoRoot);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({
      name: entry.name.replace(/\.md$/, ''),
      file: relativePath(repoRoot, path.join(dirPath, entry.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function resolveThreadFile(repoRoot, name) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    return null;
  }
  const safeName = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  const filePath = path.join(threadsDir(repoRoot), path.basename(safeName));
  return fs.existsSync(filePath) ? filePath : null;
}

function workflowSummaryTool(repoRoot) {
  const rootDir = resolveWorkflowRoot(repoRoot);
  const state = buildBaseState(repoRoot, rootDir);
  const activeThread = readJsonIfExists(path.join(repoRoot, '.workflow', 'runtime', 'thread.json'), null);
  return {
    ...state,
    activeThread,
  };
}

function teamRuntimeSummaryTool(repoRoot) {
  const orchestration = readJsonIfExists(path.join(repoRoot, '.workflow', 'orchestration', 'state.json'), null);
  const runtime = readJsonIfExists(path.join(repoRoot, '.workflow', 'orchestration', 'runtime', 'state.json'), null);
  const mailbox = getLogSnapshot(repoRoot, 'mailbox');
  const timeline = getLogSnapshot(repoRoot, 'timeline');
  return {
    orchestration,
    runtime,
    mailbox: {
      count: mailbox.count,
      recent: mailbox.recent,
    },
    timeline: {
      count: timeline.count,
      recent: timeline.recent,
    },
  };
}

function listTaskPacketsTool(repoRoot) {
  return {
    packets: listPacketFiles(repoRoot),
  };
}

function readTaskPacketTool(repoRoot, args = {}) {
  const taskId = String(args.taskId || args.id || '').trim();
  if (!taskId) {
    throw new Error('taskId is required');
  }
  const filePath = resolvePacketFile(repoRoot, taskId);
  if (!filePath) {
    throw new Error(`Task packet not found: ${taskId}`);
  }
  const clipped = clipText(fs.readFileSync(filePath, 'utf8'), args.maxChars);
  return {
    taskId: path.basename(filePath, '.md'),
    file: relativePath(repoRoot, filePath),
    ...clipped,
  };
}

function evidenceGraphTool(repoRoot) {
  return buildEvidenceGraph(repoRoot);
}

function mailboxRecentTool(repoRoot, args = {}) {
  const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Number(args.limit)) : 10;
  const snapshot = getLogSnapshot(repoRoot, 'mailbox');
  return {
    count: snapshot.count,
    entries: snapshot.recent.slice(-limit),
  };
}

function timelineRecentTool(repoRoot, args = {}) {
  const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Number(args.limit)) : 20;
  const snapshot = getLogSnapshot(repoRoot, 'timeline');
  return {
    count: snapshot.count,
    entries: snapshot.recent.slice(-limit),
  };
}

function listThreadsTool(repoRoot) {
  const activeThread = readJsonIfExists(path.join(repoRoot, '.workflow', 'runtime', 'thread.json'), null);
  return {
    activeThread,
    threads: listThreads(repoRoot),
  };
}

function readThreadTool(repoRoot, args = {}) {
  const name = String(args.name || '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const filePath = resolveThreadFile(repoRoot, name);
  if (!filePath) {
    throw new Error(`Thread not found: ${name}`);
  }
  const clipped = clipText(fs.readFileSync(filePath, 'utf8'), args.maxChars);
  return {
    name: path.basename(filePath, '.md'),
    file: relativePath(repoRoot, filePath),
    ...clipped,
  };
}

function readMemoryTool(repoRoot, args = {}) {
  const filePath = path.join(repoRoot, 'docs', 'workflow', 'MEMORY.md');
  if (!fs.existsSync(filePath)) {
    throw new Error('docs/workflow/MEMORY.md is missing');
  }
  const clipped = clipText(fs.readFileSync(filePath, 'utf8'), args.maxChars);
  return {
    file: relativePath(repoRoot, filePath),
    ...clipped,
  };
}

function policySummaryTool(repoRoot) {
  return {
    policy: loadPolicy(repoRoot),
    approvals: readApprovals(repoRoot).grants,
  };
}

function policyCheckTool(repoRoot, args = {}) {
  const files = Array.isArray(args.files)
    ? args.files.map((item) => String(item)).filter(Boolean)
    : String(args.files || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
  return checkPolicy(repoRoot, {
    files: files.join(';'),
    operation: args.operation || 'edit',
    actor: args.actor || 'mcp',
    mode: args.mode || 'standard',
  });
}

const SERVER_CATALOG = Object.freeze({
  'workflow-state': {
    title: 'Workflow State',
    tools: [
      {
        name: 'workflow_summary',
        description: 'Return the current canonical workflow summary and active thread state.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => workflowSummaryTool(repoRoot),
      },
      {
        name: 'team_runtime_summary',
        description: 'Return the current Team runtime/orchestration summary plus mailbox/timeline counts.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => teamRuntimeSummaryTool(repoRoot),
      },
    ],
  },
  packet: {
    title: 'Task Packets',
    tools: [
      {
        name: 'list_task_packets',
        description: 'List generated Team task packets from .workflow/orchestration/packets.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => listTaskPacketsTool(repoRoot),
      },
      {
        name: 'read_task_packet',
        description: 'Read a generated Team task packet by taskId.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            maxChars: { type: 'number' },
          },
          required: ['taskId'],
          additionalProperties: false,
        },
        handler: (repoRoot, args) => readTaskPacketTool(repoRoot, args),
      },
    ],
  },
  evidence: {
    title: 'Evidence Graph',
    tools: [
      {
        name: 'evidence_graph',
        description: 'Build the repo-local evidence graph spanning claims, verify runs, review findings, and approvals.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => evidenceGraphTool(repoRoot),
      },
    ],
  },
  mailbox: {
    title: 'Mailbox And Timeline',
    tools: [
      {
        name: 'mailbox_recent',
        description: 'Return recent Team mailbox entries and the total count.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
          additionalProperties: false,
        },
        handler: (repoRoot, args) => mailboxRecentTool(repoRoot, args),
      },
      {
        name: 'timeline_recent',
        description: 'Return recent Team timeline entries and the total count.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
          additionalProperties: false,
        },
        handler: (repoRoot, args) => timelineRecentTool(repoRoot, args),
      },
    ],
  },
  'thread-memory': {
    title: 'Thread And Memory',
    tools: [
      {
        name: 'list_threads',
        description: 'List workflow threads and the currently active thread.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => listThreadsTool(repoRoot),
      },
      {
        name: 'read_thread',
        description: 'Read a specific workflow thread markdown file.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            maxChars: { type: 'number' },
          },
          required: ['name'],
          additionalProperties: false,
        },
        handler: (repoRoot, args) => readThreadTool(repoRoot, args),
      },
      {
        name: 'read_memory',
        description: 'Read the canonical MEMORY.md document.',
        inputSchema: {
          type: 'object',
          properties: {
            maxChars: { type: 'number' },
          },
          additionalProperties: false,
        },
        handler: (repoRoot, args) => readMemoryTool(repoRoot, args),
      },
    ],
  },
  policy: {
    title: 'Policy',
    tools: [
      {
        name: 'policy_summary',
        description: 'Return the derived workflow policy matrix and approval grants.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        handler: (repoRoot) => policySummaryTool(repoRoot),
      },
      {
        name: 'policy_check',
        description: 'Evaluate policy for a file list, operation, actor, and mode.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'array',
                  items: { type: 'string' },
                },
              ],
            },
            operation: { type: 'string' },
            actor: { type: 'string' },
            mode: { type: 'string' },
          },
          required: ['files'],
          additionalProperties: false,
        },
        handler: (repoRoot, args) => policyCheckTool(repoRoot, args),
      },
    ],
  },
});

function serverIds() {
  return Object.keys(SERVER_CATALOG);
}

function toolCountFor(serverId) {
  return Array.isArray(SERVER_CATALOG[serverId]?.tools)
    ? SERVER_CATALOG[serverId].tools.length
    : 0;
}

function renderToolResult(result) {
  const preview = JSON.stringify(result, null, 2);
  return {
    content: [
      {
        type: 'text',
        text: preview.length > 4000 ? `${preview.slice(0, 4000)}\n\n...[truncated]` : preview,
      },
    ],
    structuredContent: result,
    isError: false,
  };
}

function writeMessage(message) {
  const encoded = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${encoded.length}\r\n\r\n`);
  process.stdout.write(encoded);
}

function writeResponse(id, result) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function writeError(id, code, message) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
}

function createServerRuntime(serverId, repoRoot) {
  const entry = SERVER_CATALOG[serverId];
  if (!entry) {
    throw new Error(`Unknown MCP server: ${serverId}`);
  }
  const tools = Object.fromEntries(
    entry.tools.map((tool) => [tool.name, tool]),
  );

  return {
    serverId,
    repoRoot,
    entry,
    async handleRequest(message) {
      const method = message.method;
      if (method === 'initialize') {
        const clientVersion = String(message.params?.protocolVersion || PROTOCOL_VERSION).trim() || PROTOCOL_VERSION;
        return {
          protocolVersion: clientVersion,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: `raiola-${serverId}`,
            version: productVersion(),
          },
        };
      }
      if (method === 'ping') {
        return {};
      }
      if (method === 'tools/list') {
        return {
          tools: entry.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
      }
      if (method === 'tools/call') {
        const toolName = String(message.params?.name || '').trim();
        const tool = tools[toolName];
        if (!tool) {
          throw Object.assign(new Error(`Unknown tool: ${toolName}`), { code: -32601 });
        }
        return renderToolResult(tool.handler(repoRoot, message.params?.arguments || {}));
      }
      throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
    },
  };
}

function processFrames(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerIndex = buffer.indexOf('\r\n\r\n');
      if (headerIndex === -1) {
        return;
      }
      const header = buffer.slice(0, headerIndex).toString('utf8');
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = Buffer.alloc(0);
        return;
      }
      const contentLength = Number(lengthMatch[1]);
      const frameStart = headerIndex + 4;
      const frameEnd = frameStart + contentLength;
      if (buffer.length < frameEnd) {
        return;
      }
      const body = buffer.slice(frameStart, frameEnd).toString('utf8');
      buffer = buffer.slice(frameEnd);
      try {
        onMessage(JSON.parse(body));
      } catch (error) {
        writeError(null, -32700, error.message || 'Invalid JSON');
      }
    }
  });
}

function printHelp() {
  console.log(`
mcp_server

Usage:
  node scripts/workflow/mcp_server.js --server workflow-state --repo /path/to/repo
  `);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const serverId = String(args.server || '').trim();
  const repoRoot = path.resolve(String(args.repo || process.cwd()));
  const runtime = createServerRuntime(serverId, repoRoot);

  processFrames(async (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (String(message.method || '').startsWith('notifications/')) {
      return;
    }
    try {
      const result = await runtime.handleRequest(message);
      writeResponse(message.id ?? null, result);
    } catch (error) {
      writeError(message.id ?? null, error.code || -32000, error.message || 'Server error');
    }
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  PROTOCOL_VERSION,
  SERVER_CATALOG,
  serverIds,
  toolCountFor,
};
