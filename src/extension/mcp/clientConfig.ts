import * as fs from 'node:fs';
import * as path from 'node:path';
import { samePath } from '../samePath';
import type { AiTool } from '../../shared/harness';

export interface RegisterOptions {
  /** caminho estável do bridge.js */
  bridgePath: string;
  workspaceDir: string;
  homeDir: string;
  /**
   * Caminho absoluto do node. O editor aberto pelo menu do sistema não herda o PATH do terminal, e
   * com o node instalado só pelo nvm um `"command": "node"` falharia ao iniciar o servidor.
   */
  nodeCommand?: string;
}

export interface Registration {
  tool: AiTool;
  /** arquivo de configuração gravado */
  file: string;
  /** caminho relativo ao projeto quando o arquivo fica dentro dele (candidato ao .gitignore) */
  projectFile: string | null;
  /** o que a pessoa precisa fazer para a ferramenta carregar o servidor */
  next: string;
}

const SERVER = 'faz-ai';

function mergeJson(file: string, entry: Record<string, unknown>, key = 'mcpServers'): void {
  let config: Record<string, Record<string, unknown> | undefined> = {};
  if (fs.existsSync(file)) {
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof config;
    } catch {
      throw new Error(`${file} não é um JSON válido; corrija-o e tente de novo.`);
    }
  }
  config[key] = { ...config[key], [SERVER]: entry };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

/** O que `ensureProjectServer` fez com o registro. */
export type ProjectServerResult = 'kept' | 'added' | 'repaired' | 'invalid';

/**
 * Garante o servidor do board num JSON de configuração do projeto, para a ferramenta que só lê
 * servidores MCP de arquivo (o Cursor em segundo plano).
 *
 * - Um registro que já aponta para este bridge e esta pasta fica como está, mesmo com outro comando:
 *   pode ser o caminho do node que a pessoa escolheu.
 * - Um registro de outra pasta ou de outro bridge (o arquivo veio de um colega pelo git, o projeto
 *   mudou de lugar) é refeito: a IA falaria com outro board, ou com nenhum. O comando da pessoa fica,
 *   se ainda existir.
 * - Um arquivo que não é JSON válido não é tocado (`invalid`): a execução segue, e quem chama avisa.
 *
 * O arquivo entra no `.git/info/exclude` quando o board grava nele: guarda caminhos desta máquina e
 * não deve ir para o repositório num `git add` da própria IA, mas também não muda o `.gitignore` de
 * ninguém (num arquivo já versionado, a exclusão não tem efeito).
 */
export function ensureProjectServer(
  workspaceDir: string,
  relFile: string,
  entry: { command: string; args: string[]; env?: Record<string, string> },
): ProjectServerResult {
  const file = path.join(workspaceDir, relFile);
  let current: { command?: unknown; args?: unknown } | undefined;
  if (fs.existsSync(file)) {
    try {
      const config = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, typeof current> } | null;
      current = config?.mcpServers?.[SERVER];
    } catch {
      return 'invalid';
    }
  }
  let command = entry.command;
  if (current) {
    const args = Array.isArray(current.args) ? current.args.map(String) : [];
    const same = args.length === entry.args.length && args.every((a, i) => samePath(a, entry.args[i]!));
    const usable =
      typeof current.command === 'string' && (path.isAbsolute(current.command) ? fs.existsSync(current.command) : !!current.command);
    if (same && usable) return 'kept';
    if (usable) command = current.command as string;
  }
  mergeJson(file, { type: 'stdio', command, args: entry.args, ...(entry.env && command === entry.command ? { env: entry.env } : {}) });
  excludeLocally(workspaceDir, relFile);
  return current ? 'repaired' : 'added';
}

/** Acrescenta o caminho ao `.git/info/exclude` do repositório, se houver um e ele ainda não estiver lá. */
function excludeLocally(workspaceDir: string, relFile: string): void {
  const exclude = path.join(workspaceDir, '.git', 'info', 'exclude');
  if (!fs.existsSync(path.join(workspaceDir, '.git'))) return;
  try {
    const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (current.split(/\r?\n/).some((l) => l.trim() === relFile)) return;
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.writeFileSync(exclude, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${relFile}\n`);
  } catch {
    /* `.git` pode ser um arquivo (worktree, submódulo): fica sem a exclusão local */
  }
}

/** Substitui (ou acrescenta) a tabela [mcp_servers.faz-ai] sem tocar no resto do TOML. */
export function upsertTomlServer(toml: string, command: string, args: string[]): string {
  const header = `[mcp_servers.${SERVER}]`;
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === header);
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
    lines.splice(start, end - start);
  }
  const rest = lines.join('\n').replace(/\n+$/, '');
  // strings JSON são strings básicas válidas em TOML
  const block = `${header}\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((a) => JSON.stringify(a)).join(', ')}]\n`;
  return `${rest}${rest ? '\n\n' : ''}${block}`;
}

/**
 * Registra o servidor MCP do board na configuração que cada ferramenta lê:
 * - Claude Code: `.mcp.json` do projeto
 * - Cursor: `.cursor/mcp.json` do projeto
 * - Codex: `.codex/config.toml` do projeto (vale em projetos marcados como confiáveis)
 * - Kimi Code: configuração global, sem a pasta fixa (a ponte descobre o projeto pelo diretório atual)
 * - GitHub Copilot: `.vscode/mcp.json` (VS Code) e `.mcp.json` (Copilot CLI) do projeto
 */
export function registerClients(tools: AiTool[], o: RegisterOptions): Registration[] {
  const args = [o.bridgePath, o.workspaceDir];
  const node = o.nodeCommand ?? 'node';
  const out: Registration[] = [];
  for (const tool of tools) {
    switch (tool) {
      case 'claude': {
        const file = path.join(o.workspaceDir, '.mcp.json');
        mergeJson(file, { type: 'stdio', command: node, args });
        out.push({
          tool,
          file,
          projectFile: '.mcp.json',
          next: 'Claude Code: abra uma sessão nova na pasta e aprove o servidor (/mcp mostra o estado).',
        });
        break;
      }
      case 'cursor': {
        const file = path.join(o.workspaceDir, '.cursor', 'mcp.json');
        mergeJson(file, { type: 'stdio', command: node, args });
        out.push({ tool, file, projectFile: '.cursor/mcp.json', next: 'Cursor: ative o servidor em Settings → MCP.' });
        break;
      }
      case 'codex': {
        const file = path.join(o.workspaceDir, '.codex', 'config.toml');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, upsertTomlServer(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', node, args));
        out.push({
          tool,
          file,
          projectFile: '.codex/config.toml',
          next: 'Codex: o projeto precisa estar marcado como confiável; abra uma sessão nova (codex mcp list confere).',
        });
        break;
      }
      case 'kimi': {
        // Kimi Code usa ~/.kimi-code e a Kimi CLI usa ~/.kimi; grava nas que existirem
        const dirs = ['.kimi-code', '.kimi'].map((d) => path.join(o.homeDir, d)).filter((d) => fs.existsSync(d));
        for (const dir of dirs.length ? dirs : [path.join(o.homeDir, '.kimi')]) {
          const file = path.join(dir, 'mcp.json');
          mergeJson(file, { transport: 'stdio', command: node, args: [o.bridgePath] });
          out.push({ tool, file, projectFile: null, next: 'Kimi Code: abra uma sessão nova a partir da pasta do projeto.' });
        }
        break;
      }
      case 'copilot': {
        // o VS Code lê .vscode/mcp.json (chave `servers`); a Copilot CLI não lê esse arquivo, e sim o .mcp.json
        const vscodeFile = path.join(o.workspaceDir, '.vscode', 'mcp.json');
        mergeJson(vscodeFile, { type: 'stdio', command: node, args }, 'servers');
        out.push({
          tool,
          file: vscodeFile,
          projectFile: '.vscode/mcp.json',
          next: 'GitHub Copilot no VS Code: confirme a confiança e inicie o servidor (MCP: List Servers).',
        });
        const cliFile = path.join(o.workspaceDir, '.mcp.json');
        mergeJson(cliFile, { type: 'stdio', command: node, args, tools: ['*'] });
        out.push({
          tool,
          file: cliFile,
          projectFile: '.mcp.json',
          next: 'Copilot CLI: abra uma sessão nova na pasta e confirme a confiança nela.',
        });
        break;
      }
    }
  }
  return out;
}
