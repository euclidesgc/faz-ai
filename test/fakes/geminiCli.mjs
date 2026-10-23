// Uma CLI do Gemini falsa para o teste do verificador: imita, do Gemini CLI 0.65.0, só o que as sondas
// observam (conferido com o binário real contra a API local, ver docs/decisoes/ferramenta-por-modo-8-gemini-cli.md):
// a home é `GEMINI_CLI_HOME` (senão `HOME`), com `.gemini/settings.json`, `.gemini/GEMINI.md` e as extensões; o
// `GEMINI.md` da pasta, dos ancestrais até a pasta com `.git` (nenhum com `context.memoryBoundaryMarkers: []`) e
// o das `--include-directories`; o primeiro `.gemini/.env` ou `.env` subindo da pasta (o `.env` genérico fica de
// fora com `advanced.ignoreLocalEnv`), aplicado só nas variáveis ainda não definidas (`loadEnvironment`); o
// cabeçalho de `GEMINI_CLI_CUSTOM_HEADERS`; os servidores MCP do settings e das extensões (sem `-e none`),
// filtrados por `--allowed-mcp-server-names`; as ferramentas de `tools.core`, e as operações MCP de
// `tools.allowed`; o shell, com o ambiente sem as variáveis com cara de segredo quando
// `security.environmentVariableRedaction.enabled` (`sanitizeEnvironment`); a chamada fora do registro volta como
// erro. Fala com `GOOGLE_GEMINI_BASE_URL` e escreve o `stream-json`.
// O teste a põe no PATH como `gemini`, um script que chama `node` com este arquivo.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const fetch = globalThis.fetch;

const args = process.argv.slice(2);
const values = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const home = process.env.GEMINI_CLI_HOME || process.env.HOME;
const read = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
const settings = JSON.parse(read(path.join(home, '.gemini', 'settings.json')) || '{}');
const out = (o) => process.stdout.write(`${JSON.stringify({ ...o, timestamp: new Date().toISOString() })}\n`);

/** O `findEnvFile` + `loadEnvironment` da 0.65.0, com a pasta confiada (`--skip-trust`). */
function loadEnvironment() {
  const ignoreLocal = !!settings.advanced?.ignoreLocalEnv;
  let found = null;
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.gemini', '.env'))) found = path.join(dir, '.gemini', '.env');
    else if (fs.existsSync(path.join(dir, '.env')) && (!ignoreLocal || dir === home)) found = path.join(dir, '.env');
    if (found || dir === path.dirname(dir)) break;
  }
  found ??= [path.join(home, '.gemini', '.env'), path.join(home, '.env')].find((f) => fs.existsSync(f)) ?? null;
  if (!found) return;
  for (const line of read(found).split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (!Object.hasOwn(process.env, name)) process.env[name] = line.slice(at + 1).trim();
  }
}

/** O ambiente que o shell recebe: sem o que tem cara de segredo, quando a máscara está ligada. */
function shellEnv() {
  const redaction = settings.security?.environmentVariableRedaction;
  if (!redaction?.enabled) return { ...process.env };
  const blocked = new Set((redaction.blocked ?? []).map((k) => k.toUpperCase()));
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k === 'PATH' || (!blocked.has(k.toUpperCase()) && !/KEY|TOKEN|SECRET|AUTH/i.test(k))),
  );
}

async function main() {
  loadEnvironment();
  const base = process.env.GOOGLE_GEMINI_BASE_URL;
  const key = process.env.GEMINI_API_KEY;
  const headers = { 'x-goog-api-key': key };
  for (const entry of (process.env.GEMINI_CLI_CUSTOM_HEADERS || '').split(',')) {
    const at = entry.indexOf(':');
    if (at > 0) headers[entry.slice(0, at).trim()] = entry.slice(at + 1).trim();
  }
  let prompt = '';
  for await (const chunk of process.stdin) prompt += chunk;
  const memory = [read(path.join(home, '.gemini', 'GEMINI.md'))];
  memory.push(read(path.join(process.cwd(), 'GEMINI.md')));
  if (!(Array.isArray(settings.context?.memoryBoundaryMarkers) && settings.context.memoryBoundaryMarkers.length === 0))
    for (let dir = path.dirname(process.cwd()); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      memory.push(read(path.join(dir, 'GEMINI.md')));
      if (fs.existsSync(path.join(dir, '.git'))) break;
    }
  for (const dir of values('--include-directories')) memory.push(read(path.join(dir, 'GEMINI.md')));
  const servers = { ...(settings.mcpServers || {}) };
  if (!(values('-e')[0] === 'none')) {
    const extensions = path.join(home, '.gemini', 'extensions');
    for (const name of fs.existsSync(extensions) ? fs.readdirSync(extensions) : []) {
      const manifest = JSON.parse(read(path.join(extensions, name, 'gemini-extension.json')) || '{}');
      if (manifest.contextFileName) memory.push(read(path.join(extensions, name, manifest.contextFileName)));
      Object.assign(servers, manifest.mcpServers || {});
    }
  }
  const allowedServers = values('--allowed-mcp-server-names');
  const rpc = async (url, method, params, id) =>
    (await (
      await fetch(url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(id ? { id } : {}) }) })
    ).text()) && null;
  const mcp = {};
  for (const [name, def] of Object.entries(servers)) {
    if (allowedServers.length && !allowedServers.includes(name)) continue;
    if (!def.httpUrl) continue;
    await rpc(def.httpUrl, 'initialize', { protocolVersion: '2025-06-18' }, 1);
    for (const tool of ['allowed', 'forbidden'])
      if (!def.includeTools || def.includeTools.includes(tool)) mcp[`mcp_${name}_${tool}`] = { url: def.httpUrl, tool };
  }
  const core = settings.tools?.core;
  const allowed = settings.tools?.allowed || [];
  const builtin = core ?? ['read_file', 'list_directory', 'glob', 'grep_search', 'invoke_agent'];
  const declared = [...builtin, ...Object.keys(mcp).filter((n) => !core || allowed.includes(n))];
  const sessionId = randomUUID();
  out({ type: 'init', session_id: sessionId, model: values('-m')[0] || 'auto' });
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const body = () =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: memory.filter(Boolean).join('\n') }] },
      contents,
      tools: [{ functionDeclarations: declared.map((name) => ({ name })) }],
    });
  for (let turn = 0; turn < 5; turn++) {
    const res = await fetch(`${base}/v1beta/models/${values('-m')[0]}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers,
      body: body(),
    });
    const text = await res.text();
    const parts = text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .flatMap((l) => JSON.parse(l.slice(6)).candidates[0].content.parts);
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (!calls.length) break;
    const responses = [];
    for (const call of calls) {
      const respond = (response) => responses.push({ functionResponse: { name: call.name, response } });
      if (!declared.includes(call.name)) respond({ error: `Tool "${call.name}" not found.` });
      else if (call.name === 'read_file') respond({ output: read(call.args.file_path) });
      else if (call.name === 'run_shell_command') {
        let output;
        try {
          output = execSync(call.args.command, { env: shellEnv(), encoding: 'utf8', shell: '/bin/sh' });
        } catch (e) {
          output = String(e.stdout ?? '');
        }
        respond({ output });
      } else if (mcp[call.name]) {
        await rpc(mcp[call.name].url, 'tools/call', { name: mcp[call.name].tool, arguments: {} }, 2);
        respond({ output: 'ok' });
      } else respond({ output: 'ok' });
    }
    contents.push({ role: 'model', parts }, { role: 'user', parts: responses });
  }
  out({ type: 'result', status: 'success', stats: { total_tokens: 2, input_tokens: 1, output_tokens: 1, cached: 0, input: 1 } });
}
main().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(String(e));
    process.exit(1);
  },
);
