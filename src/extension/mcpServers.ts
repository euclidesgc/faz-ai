import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool, HarnessItem } from '../shared/harness';
import { HARNESS_CATALOG, MCP_NAME_PATTERN, type HarnessSource, type McpServerInput } from '../shared/harnessCatalog';

/**
 * Entrada de um servidor no formato de cada arquivo, como a documentação de cada ferramenta descreve:
 * `type: stdio|http` no Claude Code, `type: stdio` ou só `url` no Cursor (cursor.com/docs/context/mcp).
 */
function jsonEntry(tool: AiTool, s: McpServerInput): Record<string, unknown> {
  const stdio = s.transport === 'stdio';
  const body = stdio
    ? { command: s.command, ...(s.args.length ? { args: s.args } : {}), ...(Object.keys(s.env).length ? { env: s.env } : {}) }
    : { url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) };
  if (tool === 'cursor') return stdio ? { type: 'stdio', ...body } : body;
  return { type: stdio ? 'stdio' : 'http', ...body };
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
    if (!src || src.kind !== 'mcp' || src.layout !== 'json-keys')
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
      config[src.key] = { ...section, [s.name]: jsonEntry(tool, s) };
      fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    }
    return file;
  }

  /** Remove o servidor do arquivo em que a varredura o encontrou. */
  remove(tool: AiTool, item: HarnessItem): void {
    if (item.kind !== 'mcp' || item.scope === 'plugin') throw new Error('Servidores de plugin não podem ser removidos pelo board.');
    const src = HARNESS_CATALOG[tool].find(
      (x) => x.kind === 'mcp' && x.layout === 'json-keys' && x.scope === item.scope && this.file(x) === item.path,
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
    }
  }
}
