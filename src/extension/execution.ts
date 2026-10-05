import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXEC_ENFORCEMENT, manifestOf, type ExecManifest } from '../shared/execution';
import type { AiTool } from '../shared/harness';
import { byPath } from './samePath';
import type { BoardState, Card } from '../shared/model';

/** Nome do servidor MCP do board, como registrado em cada ferramenta. */
export const BOARD_SERVER = 'faz-ai';

/** O que o agente pede e a linha de comando da ferramenta consegue impor. */
export interface ExecInput {
  agent: string;
  /** servidores MCP liberados além do do board; null = sem restrição */
  mcpAllowed: string[] | null;
  /** servidores MCP configurados para a ferramenta que ficam de fora */
  mcpBlocked: string[];
  /** Claude Code: arquivo de configuração só com os servidores liberados */
  mcpConfig: string | null;
  tools: string[];
  deniedTools: string[];
  model: { name: string; effort: string | null } | null;
  clean: boolean;
}

export interface ExecPlan {
  manifest: ExecManifest;
  input: ExecInput;
  /** o que a ferramenta não impõe por parâmetro e segue no prompt, como instrução */
  advice: string[];
  /** resumo para o log da execução */
  summary: string[];
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readJson(file: string): Record<string, unknown> {
  try {
    return obj(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
}

/**
 * Definições dos servidores MCP que o Claude Code carregaria nesta pasta: do projeto (.mcp.json) e do
 * usuário (~/.claude.json, globais e desta pasta). Fica na extensão: tem variáveis e cabeçalhos com segredos.
 */
function claudeServers(projectDir: string, homeDir: string): Record<string, unknown> {
  const user = homeDir ? readJson(path.join(homeDir, '.claude.json')) : {};
  return {
    ...obj(user.mcpServers),
    ...obj(readJson(path.join(projectDir, '.mcp.json')).mcpServers),
    ...obj(obj(byPath(obj(user.projects), projectDir)).mcpServers),
  };
}

/** Traduz o agente do card no que a execução pelo board impõe e no que só orienta. */
export function executionPlan(
  s: BoardState,
  c: Card,
  projectDir: string,
  homeDir: string,
  /** o servidor do board desta execução: vale mais que um registro de arquivo, que pode ser de outra pasta */
  board?: { command: string; args: string[] },
): ExecPlan {
  const tool: AiTool = s.board.aiTool;
  const manifest = manifestOf(s, c);
  const how = EXEC_ENFORCEMENT[tool];
  const items = s.harness.inventory.find((t) => t.tool === tool)?.items ?? [];
  const known = [...new Set(items.filter((i) => i.kind === 'mcp').map((i) => i.name))].filter((n) => n !== BOARD_SERVER);
  const allowed = manifest.mcpServers;
  const blocked = allowed ? known.filter((n) => !allowed.includes(n)) : [];

  let mcpConfig: string | null = null;
  if (allowed && tool === 'claude') {
    const defs = claudeServers(projectDir, homeDir);
    if (board) defs[BOARD_SERVER] = { type: 'stdio', ...board };
    if (!defs[BOARD_SERVER])
      throw new Error(
        'O agente restringe os servidores MCP, mas o servidor do board não está registrado para o Claude Code nesta pasta. Instale o servidor em Configurações → Harness de IA → Tudo que a ferramenta carrega → Claude Code → Servidores MCP.',
      );
    const missing = allowed.filter((n) => !defs[n]);
    if (missing.length) throw new Error(`Servidores MCP do agente não encontrados na configuração do Claude Code: ${missing.join(', ')}.`);
    mcpConfig = JSON.stringify({ mcpServers: Object.fromEntries([BOARD_SERVER, ...allowed].map((n) => [n, defs[n]])) });
  }

  const advice: string[] = [];
  const agentFile = manifest.agent ? items.find((i) => i.kind === 'agent' && i.name === manifest.agent)?.path : undefined;
  if (manifest.agent && how.agent === 'advised')
    advice.push(`Atue como o agente "${manifest.agent}"${agentFile ? `: leia e siga as instruções de ${agentFile}` : ''}.`);
  if (allowed && how.mcp === 'advised')
    advice.push(`De servidores MCP, use só o do board${allowed.length ? ` e: ${allowed.join(', ')}` : ''}.`);
  if (how.tools === 'advised') {
    if (manifest.tools.length) advice.push(`Use só estas ferramentas: ${manifest.tools.join(', ')}.`);
    if (manifest.deniedTools.length) advice.push(`Não use estas ferramentas: ${manifest.deniedTools.join(', ')}.`);
  }
  if (manifest.clean && how.clean === 'advised')
    advice.push('Use só as skills e instruções indicadas neste card e nas regras do projeto; ignore as demais.');

  const mark = (aspect: keyof typeof how) => (how[aspect] === 'enforced' ? 'imposto' : 'orientado');
  const summary = [
    `Agente do board: ${manifest.profile ?? 'nenhum'}`,
    ...(manifest.agent ? [`Subagente da ferramenta: ${manifest.agent} (${mark('agent')})`] : []),
    ...(manifest.skills.length ? [`Skills: ${manifest.skills.join(', ')} (pelo caminho do arquivo)`] : []),
    ...(allowed ? [`Servidores MCP: ${[BOARD_SERVER, ...allowed].join(', ')} (${mark('mcp')})`] : []),
    ...(manifest.tools.length ? [`Ferramentas: ${manifest.tools.join(', ')} (${mark('tools')})`] : []),
    ...(manifest.deniedTools.length ? [`Ferramentas negadas: ${manifest.deniedTools.join(', ')} (${mark('tools')})`] : []),
    ...(manifest.model
      ? [`Modelo: ${manifest.model.name}${manifest.model.effort ? ` · ${manifest.model.effort}` : ''} (${mark('model')})`]
      : []),
    ...(manifest.clean ? [`Sessão limpa (${mark('clean')})`] : []),
  ];
  return {
    manifest,
    input: {
      agent: manifest.agent,
      mcpAllowed: allowed,
      mcpBlocked: blocked,
      mcpConfig,
      tools: manifest.tools,
      deniedTools: manifest.deniedTools,
      model: manifest.model,
      clean: manifest.clean,
    },
    advice,
    summary,
  };
}
