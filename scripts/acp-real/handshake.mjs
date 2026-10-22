#!/usr/bin/env node
// Handshake ACP real, fora do `npm test`: abre o agente pelo comando dado, faz `initialize`,
// `session/new` e, com `--prompt`, um `session/prompt` curto. Imprime o que a épica "Conectar
// ferramenta por ACP" precisa conferir em cada CLI: `authMethods`, capacidades, `models`, `modes`,
// `configOptions`, as permissões pedidas, o `usage` e os erros (login, cota).
//
// Uso: node scripts/acp-real/handshake.mjs [--prompt "texto"] [--cwd pasta] [--timeout ms] -- <comando> [args...]
// Permissões pedidas pelo agente são sempre negadas (o teste não escreve nem executa nada).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
const opt = { prompt: null, cwd: null, timeout: 120000 };
let cmd = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') {
    cmd = argv.slice(i + 1);
    break;
  }
  if (a === '--prompt') opt.prompt = argv[++i];
  else if (a === '--cwd') opt.cwd = argv[++i];
  else if (a === '--timeout') opt.timeout = Number(argv[++i]);
  else {
    cmd = argv.slice(i);
    break;
  }
}
if (!cmd.length) {
  console.error('informe o comando do agente depois de --');
  process.exit(2);
}
const cwd = opt.cwd ?? mkdtempSync(join(tmpdir(), 'acp-handshake-'));

const out = {
  command: cmd.join(' '),
  cwd,
  initialize: null,
  session: null,
  prompt: null,
  permissions: [],
  updates: {},
  stderr: '',
  errors: [],
};
const child = spawn(cmd[0], cmd.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
child.stderr.on('data', (d) => (out.stderr = (out.stderr + d.toString()).slice(-4000)));
child.on('error', (e) => out.errors.push(`spawn: ${e.message}`));

let next = 1;
const pending = new Map();
const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });

const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    out.errors.push(`stdout não JSON: ${line.slice(0, 200)}`);
    return;
  }
  if ('id' in msg && msg.method) {
    // pedido do agente
    if (msg.method === 'session/request_permission') {
      const options = msg.params?.options ?? [];
      out.permissions.push({
        title: msg.params?.toolCall?.title,
        kind: msg.params?.toolCall?.kind,
        options: options.map((o) => `${o.kind}:${o.optionId}`),
      });
      const deny = options.find((o) => o.kind === 'reject_once') ?? options.find((o) => /reject|deny/.test(o.kind));
      send({
        id: msg.id,
        result: deny ? { outcome: { outcome: 'selected', optionId: deny.optionId } } : { outcome: { outcome: 'cancelled' } },
      });
    } else {
      out.errors.push(`pedido do agente não atendido: ${msg.method}`);
      send({ id: msg.id, error: { code: -32601, message: 'não suportado neste teste' } });
    }
    return;
  }
  if (msg.method) {
    // aviso (session/update)
    const u = msg.params?.update;
    const kind = u?.sessionUpdate ?? msg.method;
    out.updates[kind] = (out.updates[kind] ?? 0) + 1;
    if (kind === 'usage_update') out.usageUpdate = u;
    if (kind === 'agent_message_chunk') out.lastText = ((out.lastText ?? '') + (u.content?.text ?? '')).slice(-500);
    if (kind === 'current_mode_update') out.currentMode = u.currentModeId;
    return;
  }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.error) p.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code, data: msg.error.data }));
  else p.resolve(msg.result);
});

const finish = (code) => {
  try {
    child.stdin.end();
  } catch {}
  setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {}
  }, 2000);
  console.log(JSON.stringify(out, null, 2));
  setTimeout(() => process.exit(code), 2200);
};
const timer = setTimeout(() => {
  out.errors.push(`tempo esgotado (${opt.timeout} ms)`);
  finish(1);
}, opt.timeout);

try {
  const init = await request('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'faz-ai-handshake', title: 'Faz AI (teste real do ACP)', version: '0.0.0' },
  });
  out.initialize = init;
  const session = await request('session/new', { cwd, mcpServers: [] });
  out.session = session;
  if (opt.prompt) {
    const t0 = Date.now();
    const res = await request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: opt.prompt }] });
    out.prompt = { ...res, ms: Date.now() - t0 };
  }
} catch (e) {
  out.errors.push(`${e.code !== undefined ? `[${e.code}] ` : ''}${e.message}${e.data ? ' ' + JSON.stringify(e.data).slice(0, 500) : ''}`);
}
clearTimeout(timer);
finish(out.errors.length ? 1 : 0);
