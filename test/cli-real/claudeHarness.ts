// A API local controla as respostas, mas o processo que descobre artefatos e executa ferramentas é a CLI real.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import type { HeadlessInput } from '../../src/extension/headless';
import { AiGateway, NO_CARD, type AiRunEnd } from '../../src/extension/ai/gateway';
import { spawnHeadless } from '../../src/extension/spawn';
import { openFile } from '../../src/extension/db/database';
import { BoardRepo } from '../../src/extension/repositories/boardRepo';
import { createRunLog } from '../../src/extension/log/runLog';
import { all } from '../../src/extension/db/query';
import { ExecutionAdmission } from '../../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../../src/extension/ai/capabilityEvidence';
import type { ProcessIdentity } from '../../src/extension/processIdentity';
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
  end: AiRunEnd;
  runId: string;
  tempFiles: string[];
  privateTempFiles: boolean;
  persisted: { outcome: unknown; measure: unknown; ended_at: unknown; input_tokens: unknown };
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
  const dbPath = path.join(root, 'test.db');
  const wasmDir = path.resolve('node_modules/sql.js/dist');
  let handle = await openFile(dbPath, wasmDir);
  const board = new BoardRepo(handle.db).getOrCreate(root, 'CLI real — descartável');
  let current:
    | { requests: ApiRequest[]; attempts: ToolAttempt[]; sent: boolean; calls: string[]; connections: string[]; interrupt?: () => void }
    | undefined;
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
        if (current.interrupt) {
          const interrupt = current.interrupt;
          current.interrupt = undefined;
          interrupt();
          return; // Mantém a resposta pendente até o encerramento real do processo.
        }
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
  const mcpConfig = json({ mcpServers: { allowed: { type: 'http', url: `${url}/mcp/allowed` } } });
  const env: Record<string, string> = {
    // spawnHeadless herda o ambiente do host. A fixture neutraliza provedores/chaves/wrappers,
    // sem alterar HOME ou variáveis do processo de testes.
    ...Object.fromEntries(
      Object.keys(process.env)
        .filter((key) => /^(ANTHROPIC_|CLAUDE_|AWS_|GOOGLE_|AZURE_|NODE_OPTIONS$|NODE_PATH$)/.test(key))
        .map((key) => [key, '']),
    ),
    PATH: process.env.PATH ?? '',
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
    get requestCount() {
      return current?.requests.length ?? 0;
    },
    async audit() {
      await handle.close();
      handle = await openFile(dbPath, wasmDir);
      return all(handle.db, 'SELECT outcome, admission_json FROM ai_runs ORDER BY rowid DESC');
    },
    async run({
      control = false,
      inheritAdditionalMemory = false,
      empty = false,
      attempts = [],
      prompt = 'Verificação local de contrato.',
      interrupt,
      failFlush = false,
      unverified = false,
    }: {
      control?: boolean;
      inheritAdditionalMemory?: boolean;
      empty?: boolean;
      attempts?: ToolAttempt[];
      prompt?: string;
      interrupt?: 'cancel' | 'crash';
      failFlush?: boolean;
      unverified?: boolean;
    } = {}): Promise<Observation> {
      fs.rmSync(marker, { force: true });
      current = { requests: [], attempts, sent: false, calls: [], connections: [] };
      const input: HeadlessInput = {
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
      };
      let stdout = '',
        stderr = '';
      const tempFiles: string[] = [];
      let privateTempFiles = true;
      const gateway = new AiGateway({
        boardId: board.id,
        runLog: createRunLog(handle.db),
        admission: new ExecutionAdmission({
          pathEnv: () => process.env.PATH,
          homeDir: os.homedir(),
          evidence: new CapabilityEvidenceStore(path.join(root, 'evidence')),
          environmentEvidence: () => ({ state: 'unknown' }),
        }),
        leaseCoordinationDir: path.join(root, 'leases'),
        spawn: (built, cwd, out, controlGate) => {
          let args = [...built.args];
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
          for (const flag of ['--mcp-config']) {
            const index = built.args.indexOf(flag);
            if (index >= 0) {
              const file = built.args[index + 1]!;
              tempFiles.push(file);
              privateTempFiles &&= (fs.statSync(file).mode & 0o777) === 0o600 && (fs.statSync(path.dirname(file)).mode & 0o777) === 0o700;
            }
          }
          return spawnHeadless(
            {
              ...built,
              command: identity.executable,
              args,
              env: {
                ...env,
                ...(!control ? built.env : {}),
                ...(inheritAdditionalMemory ? { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' } : {}),
              },
            },
            cwd,
            (text, stream) => {
              if (stream === 'stdout') stdout += text;
              else stderr = (stderr + text).slice(-10_000);
              out(text, stream);
            },
            process.env.PATH,
            controlGate,
          );
        },
      });
      if (interrupt)
        current.interrupt = () => {
          if (interrupt === 'cancel') execution.stop();
          else if (execution.identity?.groupId) process.kill(-execution.identity.groupId, 'SIGKILL');
          else throw new Error('Grupo da execução real não identificado.');
        };
      const execution = gateway.run({
        origin: 'manual',
        tool: 'claude',
        context: NO_CARD,
        cwd: project,
        timeoutMinutes: 35 / 60,
        prepare: () => ({
          input,
          ...(unverified
            ? {
                strict: {
                  profileId: 'cli-real-fixture',
                  request: {
                    version: 1 as const,
                    regime: 'exclusive' as const,
                    agentTools: { categories: ['read' as const], native: { tool: 'claude' as const, allow: ['Read'], deny: [] } },
                    boardTools: { mode: 'explicit' as const, value: ['read' as const] },
                    mcpLevel: { permission: 'board' as const, tools: [] },
                    activeMcpIds: [],
                    allowedMcpIds: [],
                    boardMcpIds: [],
                    mcpServers: [],
                    mcpTools: [],
                    boardMcpTools: [],
                  },
                },
              }
            : {}),
          config: {
            model: input.exec!.model?.name ?? null,
            effort: null,
            profile: null,
            agent: null,
            autonomous: false,
            clean: true,
            skills: [],
            mcp: empty ? [] : ['allowed'],
          },
        }),
        beforeStart: async (_identity: ProcessIdentity) => {
          if (failFlush) throw new Error('Falha de flush injetada antes de liberar a CLI real.');
          await handle.flush();
        },
        log: () => {},
      });
      const end = await new Promise<AiRunEnd>((resolve) => execution.onExit(resolve));
      // Reabrir os bytes do disco impede confundir o estado em memória com o registro durável.
      await handle.close();
      handle = await openFile(dbPath, wasmDir);
      const persisted = all(handle.db, 'SELECT outcome, measure, ended_at, input_tokens FROM ai_runs WHERE id = ?', [execution.runId])[0]!;
      const events = stdout.split('\n').flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      });
      return {
        code: end.code,
        timedOut: end.timedOut,
        requests: current.requests,
        events,
        stderr,
        mcpCalls: [...current.calls],
        mcpConnections: [...current.connections],
        end,
        runId: execution.runId,
        tempFiles,
        privateTempFiles,
        persisted: {
          outcome: persisted.outcome,
          measure: persisted.measure,
          ended_at: persisted.ended_at,
          input_tokens: persisted.input_tokens,
        },
      };
    },
    async close() {
      await handle.close();
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
