import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, HarnessItem } from '../shared/harness';
import { HARNESS_CATALOG, MCP_NAME_PATTERN, type HarnessSource, type McpServerInput } from '../shared/harnessCatalog';

/**
 * Entrada de um servidor no formato de cada arquivo, como a documentação de cada ferramenta descreve:
 * `type: stdio|http` no Claude Code e no VS Code, `transport` no Kimi Code, só `command` ou `url` no Cursor,
 * e `tools` na Copilot CLI (.mcp.json e ~/.copilot/mcp-config.json).
 */
function jsonEntry(tool: AiTool, src: HarnessSource, s: McpServerInput): Record<string, unknown> {
  const stdio = s.transport === 'stdio';
  const body = stdio
    ? { command: s.command, ...(s.args.length ? { args: s.args } : {}), ...(Object.keys(s.env).length ? { env: s.env } : {}) }
    : { url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) };
  if (tool === 'cursor') return body;
  if (tool === 'kimi') return stdio ? { transport: 'stdio', ...body } : body;
  const copilotCli = tool === 'copilot' && src.path !== '.vscode/mcp.json';
  return { type: stdio ? 'stdio' : 'http', ...body, ...(copilotCli ? { tools: ['*'] } : {}) };
}

/** Lê um JSON de configuração para alterá-lo; recusa arquivos com comentários, que seriam perdidos ao regravar. */
function readForWrite(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  try {
    const v: unknown = text.trim() ? JSON.parse(text) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* cai no erro abaixo */
  }
  throw new Error(`${file} não é um JSON simples (pode ter comentários ou um erro de sintaxe). Abra o arquivo e edite-o à mão.`);
}

const tomlKey = (name: string) => (/^[\w-]+$/.test(name) ? name : JSON.stringify(name));
const tomlTable = (pairs: Record<string, string>) =>
  Object.entries(pairs)
    .map(([k, v]) => `${tomlKey(k)} = ${JSON.stringify(v)}`)
    .join('\n');

/** Linhas de um TOML sem a tabela do servidor e as subtabelas dela (env, http_headers…). */
function withoutTomlServer(toml: string, table: string, name: string): { text: string; removed: boolean } {
  const head = `${table}.${tomlKey(name)}`;
  const lines = toml.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  let removed = false;
  for (const line of lines) {
    const header = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(line)?.[1]?.trim();
    if (header !== undefined) {
      skipping = header === head || header.startsWith(`${head}.`);
      removed ||= skipping;
    }
    if (!skipping) out.push(line);
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), removed };
}

/** Acrescenta e remove servidores MCP nos arquivos de configuração das ferramentas. Não depende da API do VSCode. */
export class McpServers {
  constructor(
    private projectDir: string,
    private homeDir: string,
  ) {}

  private file(src: HarnessSource): string {
    const base = src.scope === 'project' ? this.projectDir : this.homeDir;
    if (!base) throw new Error(src.scope === 'project' ? 'Nenhuma pasta de projeto aberta.' : 'Pasta do usuário não encontrada.');
    return path.join(base, src.path);
  }

  private source(tool: AiTool, index: number): HarnessSource {
    const src = HARNESS_CATALOG[tool][index];
    if (!src || src.kind !== 'mcp' || (src.layout !== 'json-keys' && src.layout !== 'toml-tables'))
      throw new Error('Este arquivo de servidores MCP não é editado pelo board.');
    return src;
  }

  /** Acrescenta o servidor ao arquivo indicado e devolve o caminho dele. Não substitui um servidor de mesmo nome. */
  add(tool: AiTool, index: number, input: McpServerInput): string {
    const src = this.source(tool, index);
    const s = { ...input, name: input.name.trim(), command: input.command.trim(), url: input.url.trim() };
    if (!MCP_NAME_PATTERN.test(s.name)) throw new Error('Nome inválido: use letras, números, hífen, ponto ou sublinhado.');
    if (s.transport === 'stdio' && !s.command) throw new Error('Informe o comando do servidor.');
    if (s.transport === 'http' && !/^https?:\/\/\S+$/.test(s.url)) throw new Error('Informe o endereço (URL) do servidor.');
    const file = this.file(src);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (src.layout === 'json-keys') {
      const config = readForWrite(file);
      const section = (config[src.key] && typeof config[src.key] === 'object' ? config[src.key] : {}) as Record<string, unknown>;
      if (section[s.name]) throw new Error(`Já existe um servidor "${s.name}" em ${src.path}.`);
      config[src.key] = { ...section, [s.name]: jsonEntry(tool, src, s) };
      fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    } else if (src.layout === 'toml-tables') {
      const toml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const head = `${src.table}.${tomlKey(s.name)}`;
      if (withoutTomlServer(toml, src.table, s.name).removed) throw new Error(`Já existe um servidor "${s.name}" em ${src.path}.`);
      // strings JSON são strings básicas válidas em TOML
      const block =
        s.transport === 'stdio'
          ? [
              `[${head}]`,
              `command = ${JSON.stringify(s.command)}`,
              ...(s.args.length ? [`args = [${s.args.map((a) => JSON.stringify(a)).join(', ')}]`] : []),
              ...(Object.keys(s.env).length ? ['', `[${head}.env]`, tomlTable(s.env)] : []),
            ]
          : [
              `[${head}]`,
              `url = ${JSON.stringify(s.url)}`,
              ...(Object.keys(s.headers).length ? ['', `[${head}.http_headers]`, tomlTable(s.headers)] : []),
            ];
      const rest = toml.replace(/\n+$/, '');
      fs.writeFileSync(file, `${rest}${rest ? '\n\n' : ''}${block.join('\n')}\n`);
    }
    return file;
  }

  /** Remove o servidor do arquivo em que a varredura o encontrou. */
  remove(tool: AiTool, item: HarnessItem): void {
    if (item.kind !== 'mcp' || item.scope === 'plugin') throw new Error('Servidores de plugin não podem ser removidos pelo board.');
    const src = HARNESS_CATALOG[tool].find(
      (x) =>
        x.kind === 'mcp' &&
        (x.layout === 'json-keys' || x.layout === 'toml-tables') &&
        x.scope === item.scope &&
        this.file(x) === item.path,
    );
    if (!src)
      throw new Error('Este servidor fica num arquivo que o board não edita. Abra o arquivo, ou use a linha de comando da ferramenta.');
    if (src.layout === 'json-keys') {
      const config = readForWrite(item.path);
      const section = { ...(config[src.key] as Record<string, unknown> | undefined) };
      if (!(item.name in section)) throw new Error(`Servidor "${item.name}" não encontrado em ${src.path}.`);
      delete section[item.name];
      config[src.key] = section;
      fs.writeFileSync(item.path, JSON.stringify(config, null, 2) + '\n');
    } else if (src.layout === 'toml-tables') {
      const { text, removed } = withoutTomlServer(fs.readFileSync(item.path, 'utf8'), src.table, item.name);
      if (!removed) throw new Error(`Servidor "${item.name}" não encontrado em ${src.path}.`);
      fs.writeFileSync(item.path, text);
    }
  }
}
