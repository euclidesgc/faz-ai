// Cliente ACP mínimo para os testes da fase 2 (Cursor, Kimi, Codex-acp, Antigravity).
// Uso: node client.mjs --cmd <comando> --cwd <dir> --out <log.jsonl> [--args "a b"] [--prompt-file f] [--resume <sessionId>]
// - grava TODAS as mensagens (requests, responses, notifications) no log, uma por linha;
// - responde permissões com allow-once e elicitações com cancel;
// - o sessionId vai para stdout ao criar/carregar a sessão (para o teste de retomada, P4).
import { spawn } from 'node:child_process';
import console from 'node:console';
import * as fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';
import { setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const CMD = arg('cmd', null);
const ARGS = (arg('args', '') ?? '').split(' ').filter(Boolean);
const CWD = arg('cwd', process.cwd());
const OUT = arg('out', 'acp-log.jsonl');
const PROMPT = arg('prompt-file', null) ? fs.readFileSync(arg('prompt-file'), 'utf8') : arg('prompt', 'Diga olá em uma frase.');
const RESUME = arg('resume', null);
const LOAD_ONLY = process.argv.includes('--load-only');
if (!CMD) {
  console.error('falta --cmd');
  process.exit(2);
}

const log = (rec) => fs.appendFileSync(OUT, JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n');
const agent = spawn(CMD, [...ARGS], { cwd: CWD, stdio: ['pipe', 'pipe', 'inherit'] });
let nextId = 1;
const pending = new Map();
const send = (method, params) => {
  const id = nextId++;
  log({ dir: 'out', id, method, params });
  agent.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const respond = (id, result) => {
  log({ dir: 'out', id, result });
  agent.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
};

const rl = readline.createInterface({ input: agent.stdout });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log({ dir: 'in', raw: line });
    return;
  }
  log({ dir: 'in', msg });
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && pending.has(msg.id)) {
    const w = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
    else w.resolve(msg.result);
    return;
  }
  if (msg.method === 'session/request_permission') {
    const opts = msg.params?.options ?? [];
    const opt = opts.find((o) => o.optionId === 'allow-once' || o.id === 'allow-once') ?? opts[0];
    respond(msg.id, { outcome: { outcome: 'selected', optionId: opt?.optionId ?? opt?.id ?? 'allow-once' } });
  } else if (msg.id !== undefined && msg.method) {
    // qualquer outro método do servidor (elicitação, fs, terminal): recusa educada
    respond(msg.id, { outcome: { outcome: 'cancelled' } });
  }
});

const main = async () => {
  const init = await send('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'faz-ai-teste-modos', version: '0.1.0' },
  });
  const authMethods = init?.authMethods ?? [];
  if (authMethods.length) {
    const m = authMethods.find((a) => !/browser|login/i.test(a.id ?? a.name ?? '')) ?? authMethods[0];
    try {
      await send('authenticate', { methodId: m.id ?? m });
    } catch (e) {
      log({ auth_error: String(e) });
    }
  }
  const mcpServers = process.argv.includes('--without-mcp')
    ? []
    : [
        {
          name: 'mcp-segredo',
          command: 'node',
          args: [fileURLToPath(new URL('../fixtures/mcp-segredo/server.mjs', import.meta.url))],
          env: [],
        },
      ];
  const sess = RESUME
    ? await send('session/load', { sessionId: RESUME, cwd: CWD, mcpServers })
    : await send('session/new', { cwd: CWD, mcpServers });
  const sessionId = sess?.sessionId ?? RESUME;
  console.log(`sessionId=${sessionId}`);
  if (LOAD_ONLY) {
    console.log(
      `loadOnly=true configOptions=${JSON.stringify((sess?.configOptions ?? []).map((o) => ({ id: o.id, currentValue: o.currentValue })))}`,
    );
    return;
  }
  const result = await send('session/prompt', { sessionId, prompt: [{ type: 'text', text: PROMPT }] });
  console.log(`stopReason=${result?.stopReason}`);
};

main()
  .catch((e) => {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => {
      agent.stdin.end();
      agent.kill();
      process.exit(process.exitCode ?? 0);
    }, 500);
  });
