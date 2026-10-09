import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXEC_ENFORCEMENT, manifestOf, withBoardTools, type ExecManifest } from '../shared/execution';
import type { AiTool } from '../shared/harness';
import { byPath } from './samePath';
import type { BoardState, Card } from '../shared/model';

/** Nome do servidor MCP do board, como registrado em cada ferramenta. */
export const BOARD_SERVER = 'faz-ai';

/** Como iniciar o servidor MCP do board. */
export interface BoardServerSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** O agente, no formato que o Claude Code recebe em `--agents` (o `prompt` é o papel da sessão). */
export interface AgentDefinition {
  name: string;
  description: string;
  prompt: string;
  /** ferramentas do agente; ausente = todas as da sessão */
  tools?: string[];
  disallowedTools?: string[];
  /** modelo do subagente, no nome que a ferramenta aceita; ausente = o da sessão */
  model?: string;
}

/** A ferramenta do Claude Code que lança subagentes: é por ela que a sessão da história delega as sub-tarefas. */
export const SUBAGENT_TOOL = 'Agent';

/**
 * Acima disto o JSON do agente não vai na linha de comando: no Windows a CLI é um `.cmd` e a linha
 * passa pelo cmd.exe, que corta em 8191 caracteres (o resto do comando também precisa caber).
 */
export const MAX_AGENT_ARG = 6000;

/** O que o agente pede e a linha de comando da ferramenta consegue impor. */
export interface ExecInput {
  /** nome do agente, para a ferramenta que o resolve por `--agent`; vazio = sem agente */
  agent: string;
  /** o agente inteiro, para a ferramenta que o recebe inline (Claude Code); null = vai no prompt ou não há */
  agentDefinition: AgentDefinition | null;
  /** os outros agentes do board, inline junto do agente da sessão, para ela delegar as sub-tarefas (Claude Code) */
  delegates: AgentDefinition[];
  /** servidores MCP liberados além do do board */
  mcpAllowed: string[];
  /** servidores MCP configurados para a ferramenta que ficam de fora */
  mcpBlocked: string[];
  /** Claude Code: arquivo de configuração só com o servidor do board e os liberados */
  mcpConfig: string | null;
  tools: string[];
  deniedTools: string[];
  model: { name: string; effort: string | null } | null;
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

/** Configuração do Claude Code só com o servidor do board: o que toda execução recebe quando o agente não libera mais nada. */
export const boardOnlyMcpConfig = (board: BoardServerSpec): string =>
  JSON.stringify({ mcpServers: { [BOARD_SERVER]: { type: 'stdio', ...board } } });

/** As instruções do agente como texto, para a ferramenta que não o recebe por parâmetro. */
export const agentAdvice = (m: ExecManifest): string[] =>
  m.agent
    ? [
        `Você atua como o agente "${m.agent}"${m.purpose ? `: ${m.purpose}` : ''}.`,
        ...(m.instructions ? [`Instruções do agente:\n${m.instructions}`] : []),
      ]
    : [];

/**
 * Traduz o agente do card no que a execução pelo board impõe e no que só orienta. Toda execução parte
 * de contexto vazio: só o servidor do board e os servidores que o agente libera; o agente vai por
 * parâmetro onde a ferramenta aceita, e como texto nas demais.
 */
export function executionPlan(
  s: BoardState,
  c: Card,
  projectDir: string,
  homeDir: string,
  /** o servidor do board desta execução: vale mais que um registro de arquivo, que pode ser de outra pasta */
  board?: BoardServerSpec,
): ExecPlan {
  const tool: AiTool = s.board.aiTool;
  const manifest = manifestOf(s, c);
  const how = EXEC_ENFORCEMENT[tool];
  const items = s.harness.inventory.find((t) => t.tool === tool)?.items ?? [];
  const known = [...new Set(items.filter((i) => i.kind === 'mcp').map((i) => i.name))].filter((n) => n !== BOARD_SERVER);
  const allowed = manifest.mcpServers;
  const blocked = known.filter((n) => !allowed.includes(n));

  // o Claude Code recebe um arquivo só com o servidor do board e os liberados; sem servidor do board
  // conhecido (nem desta execução nem registrado na pasta) e sem nada liberado, fica sem arquivo, e a
  // linha de comando segue sem restrição de servidores (só acontece fora da extensão)
  let mcpConfig: string | null = null;
  if (tool === 'claude') {
    const defs = allowed.length || !board ? claudeServers(projectDir, homeDir) : {};
    if (board) defs[BOARD_SERVER] = { type: 'stdio', ...board };
    if (!defs[BOARD_SERVER] && allowed.length)
      throw new Error(
        'O agente libera servidores MCP, mas o servidor do board não está registrado para o Claude Code nesta pasta. Instale o servidor em Configurações → Harness de IA → Tudo que a ferramenta carrega → Claude Code → Servidores MCP.',
      );
    const missing = allowed.filter((n) => !defs[n]);
    if (missing.length) throw new Error(`Servidores MCP do agente não encontrados na configuração do Claude Code: ${missing.join(', ')}.`);
    if (defs[BOARD_SERVER])
      mcpConfig = JSON.stringify({ mcpServers: Object.fromEntries([BOARD_SERVER, ...allowed].map((n) => [n, defs[n]])) });
  }

  // o agente inline só no Claude Code, e só quando cabe na linha de comando; senão vai como texto
  let agentDefinition: AgentDefinition | null = null;
  // a sessão de uma história leva os outros agentes do board como subagentes, para delegar as
  // sub-tarefas (é ela que as executa; a sub-tarefa nunca roda sozinha). Com isso a sessão fica com
  // todas as ferramentas (os subagentes precisam das deles), o agente dela ganha a de lançar
  // subagentes, e o que ele próprio pode usar vai na definição inline
  let delegates: AgentDefinition[] = [];
  let sessionTools = manifest.tools;
  if (manifest.agent && tool === 'claude') {
    const def: AgentDefinition = { name: manifest.agent, description: manifest.purpose || manifest.agent, prompt: manifest.instructions };
    const size = (list: AgentDefinition[]) => JSON.stringify(Object.fromEntries(list.map(({ name, ...d }) => [name, d]))).length;
    if (manifest.delegates.length) {
      const own = manifest.tools.length ? { tools: withBoardTools([...manifest.tools, SUBAGENT_TOOL]) } : {};
      const withDelegates: AgentDefinition = {
        ...def,
        ...own,
        ...(manifest.deniedTools.length ? { disallowedTools: manifest.deniedTools } : {}),
      };
      const subs = manifest.delegates.map<AgentDefinition>((d) => ({
        name: d.name,
        description: d.purpose || d.name,
        prompt: d.instructions,
        ...(d.tools.length ? { tools: withBoardTools(d.tools) } : {}),
        ...(d.deniedTools.length ? { disallowedTools: d.deniedTools } : {}),
        ...(d.model ? { model: d.model } : {}),
      }));
      if (size([withDelegates, ...subs]) <= MAX_AGENT_ARG) {
        agentDefinition = withDelegates;
        delegates = subs;
        sessionTools = [];
      }
    }
    if (!agentDefinition && size([def]) <= MAX_AGENT_ARG) agentDefinition = def;
  }

  const advice: string[] = [];
  // a história cujos subagentes não couberam na linha de comando: a sessão faz as sub-tarefas ela mesma
  if (manifest.delegates.length && !delegates.length && tool === 'claude') {
    sessionTools = [];
    advice.push(
      'Os agentes especialistas do board não couberam nesta execução: faça você o trabalho das sub-tarefas, com as ferramentas da sessão, seguindo as instruções de cada card.',
    );
  }
  if (manifest.agent && (how.agent === 'advised' || (tool === 'claude' && !agentDefinition))) advice.push(...agentAdvice(manifest));
  if (how.mcp === 'advised') advice.push(`De servidores MCP, use só o do board${allowed.length ? ` e: ${allowed.join(', ')}` : ''}.`);
  if (how.tools === 'advised') {
    if (manifest.tools.length) advice.push(`Use só estas ferramentas: ${manifest.tools.join(', ')}.`);
    if (manifest.deniedTools.length) advice.push(`Não use estas ferramentas: ${manifest.deniedTools.join(', ')}.`);
  }
  if (how.context === 'advised')
    advice.push(
      'Use só as rules, as skills e as instruções indicadas neste pedido; ignore instruções, skills e agentes carregados por conta própria.',
    );

  const mark = (aspect: keyof typeof how) => (how[aspect] === 'enforced' ? 'imposto' : 'orientado');
  const summary = [
    `Agente do board: ${manifest.profile ?? 'nenhum'}${manifest.agent ? ` (${agentDefinition ? 'inline' : mark('agent')})` : ''}`,
    ...(manifest.skills.length ? [`Skills: ${manifest.skills.join(', ')} (pelo caminho do arquivo)`] : []),
    ...(manifest.rules.length ? [`Rules: ${manifest.rules.join(', ')} (pelo caminho do arquivo)`] : []),
    `Servidores MCP: ${[BOARD_SERVER, ...allowed].join(', ')} (${mark('mcp')})`,
    ...(delegates.length
      ? [
          `Subagentes: ${delegates.map((d) => d.name).join(', ')} (inline)`,
          ...(agentDefinition?.tools ? [`Ferramentas do agente: ${agentDefinition.tools.join(', ')} (no agente)`] : []),
        ]
      : []),
    ...(sessionTools.length ? [`Ferramentas: ${sessionTools.join(', ')} (${mark('tools')})`] : []),
    ...(manifest.deniedTools.length ? [`Ferramentas negadas: ${manifest.deniedTools.join(', ')} (${mark('tools')})`] : []),
    ...(manifest.model
      ? [`Modelo: ${manifest.model.name}${manifest.model.effort ? ` · ${manifest.model.effort}` : ''} (${mark('model')})`]
      : []),
    `Contexto vazio (${mark('context')})`,
  ];
  return {
    manifest,
    input: {
      // no Claude Code o agente vai inline (`--agents`) e é escolhido por `--agent`; nas demais só o nome
      agent: tool === 'claude' && !agentDefinition ? '' : manifest.agent,
      agentDefinition,
      delegates,
      mcpAllowed: allowed,
      mcpBlocked: blocked,
      mcpConfig,
      tools: sessionTools,
      deniedTools: manifest.deniedTools,
      model: manifest.model,
    },
    advice,
    summary,
  };
}

/** Execução sem agente e sem card (chat do board, sugestão de agentes): contexto vazio, só o servidor do board. */
export function bareExec(model: ExecInput['model'], board?: BoardServerSpec): ExecInput {
  return {
    agent: '',
    agentDefinition: null,
    delegates: [],
    mcpAllowed: [],
    mcpBlocked: [],
    mcpConfig: board ? boardOnlyMcpConfig(board) : null,
    tools: [],
    deniedTools: [],
    model,
  };
}
