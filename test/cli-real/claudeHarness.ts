// A API local controla as respostas, mas o processo que descobre artefatos e executa ferramentas é a CLI real.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { headlessCommand } from '../../src/extension/headless';
import { resolveCommand } from '../../src/extension/cliResolve';

export interface ApiRequest {
  system?: unknown;
  messages?: { role: string; content: unknown }[];
  tools?: { name: string }[];
}
export interface ToolAttempt {
  name: string;
  input: Record<string, unknown>;
}
export interface Observation {
  code: number | null;
  timedOut: boolean;
  requests: ApiRequest[];
  events: Record<string, unknown>[];
  stderr: string;
  mcpCalls: string[];
  mcpConnections: string[];
}
const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { mode: 0o600 });
};
const json = (value: unknown) => JSON.stringify(value);

function respond(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(json(body));
}
/** Resposta Anthropic SSE mínima: não aceita valores fornecidos por um modelo como evidência. */
function message(res: http.ServerResponse, model: string, calls: ToolAttempt[]): void {
  const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${json(data)}\n\n`);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  send('message_start', {
    type: 'message_start',
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  });
  const blocks = calls.length
    ? calls.map((call) => ({ type: 'tool_use', id: `toolu_${randomUUID()}`, name: call.name, input: call.input }))
    : [{ type: 'text', text: 'Verificação local encerrada.' }];
  blocks.forEach((block, index) => {
    send('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: block.type === 'tool_use' ? { ...block, input: {} } : block,
    });
    if ('input' in block)
      send('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json(block.input) },
      });
    send('content_block_stop', { type: 'content_block_stop', index });
  });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: calls.length ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

export async function claudeHarness() {
  if (process.platform === 'win32') throw new Error('CLI real: Windows não validado por este harness POSIX.');
  const executable = resolveCommand('claude', process.env.PATH, os.homedir());
  if (!executable) throw new Error('CLI real: Claude Code ausente; verificação não realizada.');
  const identity = {
    executable: fs.realpathSync(executable),
    version: execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim(),
    binary: createHash('sha256')
      .update(fs.readFileSync(fs.realpathSync(executable)))
      .digest('hex'),
    platform: process.platform,
    arch: process.arch,
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cli-real-'));
  const project = path.join(root, 'ancestor', 'project');
  const config = path.join(root, 'config');
  const additional = path.join(root, 'additional');
  const marker = path.join(root, 'hook-executed');
  const canaries = Object.fromEntries(
    ['project', 'user', 'ancestor', 'additional', 'skill', 'agent'].map((name) => [
      name,
      `FAZAI_${name}_${randomUUID().replaceAll('-', '')}`,
    ]),
  );
  write(path.join(project, 'CLAUDE.md'), canaries.project!);
  write(path.join(config, 'CLAUDE.md'), canaries.user!);
  write(path.join(project, '..', 'CLAUDE.md'), canaries.ancestor!);
  write(path.join(additional, 'CLAUDE.md'), canaries.additional!);
  write(
    path.join(project, '.claude', 'skills', 'canary', 'SKILL.md'),
    `---\nname: canary\ndescription: ${canaries.skill}\n---\nSkill de controle.\n`,
  );
  write(
    path.join(project, '.claude', 'agents', 'canary.md'),
    `---\nname: canary\ndescription: ${canaries.agent}\n---\nAgente de controle.\n`,
  );
  write(path.join(project, 'allowed.txt'), 'FAZAI_READ_ALLOWED');
  const hook = path.join(root, 'hook.cjs');
  write(hook, `require('node:fs').writeFileSync(${json(marker)}, 'executado')`);
  write(
    path.join(project, '.claude', 'settings.local.json'),
    json({
      enableAllProjectMcpServers: true,
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `${quote(process.execPath)} ${quote(hook)}` }] }] },
    }),
  );
  let current: { requests: ApiRequest[]; attempts: ToolAttempt[]; sent: boolean; calls: string[]; connections: string[] } | undefined;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') return respond(res, {}, 405);
      let body = '';
      for await (const chunk of req) {
        body += String(chunk);
        if (body.length > 8_000_000) return respond(res, {}, 413);
      }
      const data = JSON.parse(body);
      if (req.url?.startsWith('/mcp/')) {
        const name = req.url.slice('/mcp/'.length);
        if (data.id === undefined) {
          res.writeHead(202).end();
          return;
        }
        if (data.method === 'initialize') current?.connections.push(name);
        const result =
          data.method === 'initialize'
            ? { protocolVersion: data.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '1' } }
            : data.method === 'tools/list'
              ? {
                  tools: ['allowed', 'forbidden'].map((tool) => ({
                    name: tool,
                    description: `Operação ${tool} do teste`,
                    inputSchema: { type: 'object', properties: {} },
                  })),
                }
              : data.method === 'tools/call'
                ? (current?.calls.push(`${name}:${data.params.name}`), { content: [{ type: 'text', text: 'FAZAI_MCP_ALLOWED' }] })
                : {};
        return respond(res, { jsonrpc: '2.0', id: data.id, result });
      }
      if (req.url?.split('?')[0] === '/v1/messages') {
        if (!current) return respond(res, {}, 503);
        // A fixture aceita somente a chave fictícia: nunca usa nem reencaminha autenticação da pessoa.
        if (req.headers['x-api-key'] !== 'fazai-local-verification-only' || req.headers.authorization)
          return respond(res, { error: { type: 'authentication_error', message: 'Apenas autenticação fictícia é aceita.' } }, 401);
        current.requests.push(data);
        const attempts = current.sent ? [] : current.attempts;
        current.sent = true;
        return message(res, data.model, attempts);
      }
      if (req.url?.includes('count_tokens')) return respond(res, { input_tokens: 1 });
      return respond(res, {});
    } catch {
      if (!res.headersSent) respond(res, {}, 400);
      else res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  write(path.join(project, '.mcp.json'), json({ mcpServers: { forbidden: { type: 'http', url: `${url}/mcp/forbidden` } } }));
  const endpoint = path.join(root, 'mcp.json');
  const mcpConfig = json({ mcpServers: { allowed: { type: 'http', url: `${url}/mcp/allowed` } } });
  write(endpoint, mcpConfig);
  const env: NodeJS.ProcessEnv = {
    // Não herdar chaves, provedores ou wrappers da pessoa. HOME não é alterada.
    PATH: process.env.PATH,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    CLAUDE_CONFIG_DIR: config,
    ANTHROPIC_API_KEY: 'fazai-local-verification-only',
    ANTHROPIC_BASE_URL: url,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    NO_COLOR: '1',
  };
  return {
    root,
    project,
    additional,
    marker,
    canaries,
    executable,
    identity,
    async run({
      control = false,
      inheritAdditionalMemory = false,
      empty = false,
      attempts = [],
      prompt = 'Verificação local de contrato.',
    }: {
      control?: boolean;
      inheritAdditionalMemory?: boolean;
      empty?: boolean;
      attempts?: ToolAttempt[];
      prompt?: string;
    } = {}): Promise<Observation> {
      fs.rmSync(marker, { force: true });
      current = { requests: [], attempts, sent: false, calls: [], connections: [] };
      const command = headlessCommand('claude', {
        prompt,
        permission: 'board',
        structured: true,
        addDirs: [additional],
        exec: {
          agent: '',
          agentDefinition: null,
          delegates: [],
          model: { name: 'claude-sonnet-4-6', effort: null },
          mcpBlocked: [],
          mcpAllowed: empty ? [] : ['allowed'],
          mcpConfig: empty ? '{"mcpServers":{}}' : mcpConfig,
          tools: empty ? [] : ['Read'],
          deniedTools: ['Agent', 'Task', 'SendMessage', 'ListAgents'],
          toolSet: 'explicit',
          mcpTools: empty ? [] : ['mcp__allowed__allowed'],
        },
      });
      let args = command.args.map((arg) => (arg === '{tmp:mcp.json}' ? endpoint : arg));
      if (empty) write(endpoint, '{"mcpServers":{}}');
      else write(endpoint, mcpConfig);
      if (control) {
        // Controle positivo: retirar as barreiras precisa tornar a contaminação observável.
        args = args.filter((arg) => !['--strict-mcp-config', '--disable-slash-commands'].includes(arg));
        for (const flag of ['--setting-sources', '--tools', '--disallowedTools']) {
          const index = args.indexOf(flag);
          if (index >= 0) {
            const end = args.findIndex((arg, i) => i > index && arg.startsWith('--'));
            args.splice(index, (end < 0 ? args.length : end) - index);
          }
        }
      }
      const child = spawn(executable, args, {
        cwd: project,
        env: {
          ...env,
          ...(!control ? command.env : {}),
          ...(inheritAdditionalMemory ? { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' } : {}),
        },
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '',
        timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          /* Já encerrado. */
        }
      }, 35_000);
      child.stdout.on('data', (b) => {
        stdout += String(b);
        if (stdout.length > 8_000_000) {
          timedOut = true;
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            /* Já encerrado. */
          }
        }
      });
      child.stderr.on('data', (b) => {
        stderr = (stderr + String(b)).slice(-10_000);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(command.stdin);
      try {
        const [code] = await once(child, 'close');
        const events = stdout.split('\n').flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        });
        return {
          code,
          timedOut,
          requests: current.requests,
          events,
          stderr,
          mcpCalls: [...current.calls],
          mcpConnections: [...current.connections],
        };
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Apenas metadados e hashes saem do teste; requests, credenciais e prompts não entram no relatório. */
export function observationDigest(observation: Observation): string {
  return createHash('sha256')
    .update(json({ requests: observation.requests, events: observation.events, calls: observation.mcpCalls }))
    .digest('hex');
}
