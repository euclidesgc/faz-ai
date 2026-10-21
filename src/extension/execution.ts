import { EXEC_ENFORCEMENT, effortToRun, manifestOf, withBoardTools, type ExecManifest } from '../shared/execution';
import { activeProfile, catalogTool, profileBase, type AiProfile } from '../shared/aiProfiles';
import type { RunTarget } from '../shared/runTarget';
import { selectedMcpNames } from '../shared/harnessSelection';
import type { BoardState, Card } from '../shared/model';
import { isFlowSkill } from './flowSkill';
import { alwaysRefs } from './promptContext';

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
  /** No contrato v1, [] é nenhuma ferramenta. Ausente preserva a semântica legada. */
  toolSet?: 'explicit';
  mcpTools?: string[];
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
function requireReviewedMcps(state: BoardState, names: readonly string[]): void {
  const denied =
    state.harness.library?.artifacts.filter(
      (a) =>
        a.kind === 'mcp' &&
        names.includes(a.name) &&
        a.mcpCredential &&
        (a.mcpCredential.review !== 'reviewed' || !a.mcpCredential.available),
    ) ?? [];
  if (denied.length) throw new Error(`MCPs exigem revisão humana ou configuração local: ${denied.map((a) => a.name).join(', ')}.`);
}
/** O manifesto com outro alvo: a CLI e o modelo mudam, o resto (agente, skills, MCPs) é do card e segue igual. */
function withTarget(s: BoardState, manifest: ExecManifest, target: RunTarget): ExecManifest {
  const option = target.model && s.board.modelCatalog.find((o) => o.tool === catalogTool(target.cli) && o.model === target.model!.name);
  return {
    ...manifest,
    target,
    model: target.model
      ? { name: target.model.name, effort: option ? effortToRun(option, target.model.effort) : target.model.effort }
      : null,
  };
}
export function executionPlan(
  s: BoardState,
  c: Card,
  /** as definições dos servidores MCP guardadas no board (só no host: têm as credenciais do cofre) */
  libraryServers: Record<string, unknown>,
  /** o servidor do board desta execução */
  board?: BoardServerSpec,
  /** o alvo que vale nesta execução (a troca por política pode ser noutra CLI); sem ele, o do card */
  target?: RunTarget,
): ExecPlan {
  const manifest = target ? withTarget(s, manifestOf(s, c), target) : manifestOf(s, c);
  // o perfil de CLI do alvo do card (não o padrão do board): a imposição, o inventário e o arquivo de MCP seguem a CLI que executa
  const cli = manifest.target.cli;
  const base = profileBase(cli);
  const how = (base ? EXEC_ENFORCEMENT[base] : undefined) ?? {
    agent: 'advised',
    skills: 'advised',
    mcp: 'advised',
    tools: 'advised',
    model: 'advised',
    context: 'advised',
  };
  const items = s.harness.inventory.find((t) => t.tool === cli.id)?.items ?? [];
  const known = [...new Set(items.filter((i) => i.kind === 'mcp').map((i) => i.name))].filter((n) => n !== BOARD_SERVER);
  const allowed = manifest.mcpServers;
  requireReviewedMcps(s, allowed);
  const blocked = known.filter((n) => !allowed.includes(n));

  // o Claude Code recebe um arquivo só com o servidor do board e os liberados; sem servidor do board
  // conhecido (nem desta execução nem registrado na pasta) e sem nada liberado, fica sem arquivo, e a
  // linha de comando segue sem restrição de servidores (só acontece fora da extensão)
  let mcpConfig: string | null = null;
  if (base === 'claude') {
    // só as definições guardadas no board (no host, com as credenciais do cofre): a execução não lê
    // `.mcp.json` nem `~/.claude.json`, e um servidor que ficou só na pasta da ferramenta não entra
    const defs: Record<string, unknown> = { ...libraryServers };
    if (board) defs[BOARD_SERVER] = { type: 'stdio', ...board };
    if (!defs[BOARD_SERVER] && allowed.length)
      throw new Error('O agente libera servidores MCP, mas o servidor do board não está disponível nesta execução.');
    const missing = allowed.filter((n) => !defs[n]);
    if (missing.length)
      throw new Error(
        `Servidores MCP do agente que não estão no board: ${missing.join(', ')}. Envie o servidor ao board em Configurações → Harness.`,
      );
    if (defs[BOARD_SERVER])
      mcpConfig = JSON.stringify({ mcpServers: Object.fromEntries([BOARD_SERVER, ...allowed].map((n) => [n, defs[n]])) });
  }

  // o agente inline só na CLI que o aceita (perfil), e só quando cabe na linha de comando; senão vai como texto
  const inline = how.agent === 'enforced';
  let agentDefinition: AgentDefinition | null = null;
  // a sessão de uma história leva os outros agentes do board como subagentes, para delegar as
  // sub-tarefas (é ela que as executa; a sub-tarefa nunca roda sozinha). Com isso a sessão fica com
  // todas as ferramentas (os subagentes precisam das deles), o agente dela ganha a de lançar
  // subagentes, e o que ele próprio pode usar vai na definição inline
  let delegates: AgentDefinition[] = [];
  let sessionTools = manifest.tools;
  if (manifest.agent && inline) {
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
  if (manifest.delegates.length && !delegates.length && inline) {
    sessionTools = [];
    advice.push(
      'Os agentes especialistas do board não couberam nesta execução: faça você o trabalho das sub-tarefas, com as ferramentas da sessão, seguindo as instruções de cada card.',
    );
  }
  if (manifest.agent && (how.agent === 'advised' || (inline && !agentDefinition))) advice.push(...agentAdvice(manifest));
  if (s.harness.library && allowed.length)
    advice.push(
      `MCPs da biblioteca: use list_board_mcp_tools e call_board_mcp_tool do servidor faz-ai, com server e card #${c.number}. Disponíveis: ${allowed.join(', ')}.`,
    );
  if (how.mcp === 'advised') advice.push(`De servidores MCP, use só o do board${allowed.length ? ` e: ${allowed.join(', ')}` : ''}.`);
  if (how.tools === 'advised') {
    if (manifest.tools.length) advice.push(`Use só estas ferramentas: ${manifest.tools.join(', ')}.`);
    if (manifest.deniedTools.length) advice.push(`Não use estas ferramentas: ${manifest.deniedTools.join(', ')}.`);
  }
  if (how.context === 'advised')
    advice.push(
      'Use só as rules, as skills e as instruções indicadas neste pedido; ignore instruções, skills e agentes carregados por conta própria.',
    );

  // a origem de cada item: a CLI impõe por parâmetro ou o pedido orienta
  const mark = (aspect: keyof typeof how) => (how[aspect] === 'enforced' ? 'imposto pela CLI' : 'pelo pedido');
  const always = alwaysRefs(s).map((r) => `${r.kind} ${r.name}`);
  const flow = [...new Set(['faz-ai-fluxo', ...manifest.skills.filter(isFlowSkill)])];
  const cardSkills = manifest.skills.filter((k) => !isFlowSkill(k));
  const summary = [
    `Agente do board: ${manifest.profile ?? 'nenhum'}${manifest.agent ? ` (${agentDefinition ? 'inline' : mark('agent')})` : ''}`,
    `Fluxo do board: ${flow.join(', ')} (pelo MCP)`,
    ...(always.length ? [`Contexto fixo: ${always.join(', ')} (pelo pedido)`] : []),
    ...(cardSkills.length ? [`Skills: ${cardSkills.join(', ')} (pelo pedido)`] : []),
    ...(manifest.rules.length ? [`Rules: ${manifest.rules.join(', ')} (pelo pedido)`] : []),
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
      agent: inline && !agentDefinition ? '' : manifest.agent,
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

/**
 * Execução sem agente e sem card (chat do board, sugestões, "Indicar artefatos"): contexto vazio, só o
 * servidor do board e, com `s`, os servidores do board em modo "Sempre" (eles entram em toda
 * interação). Uma configuração local da biblioteca precisa ser resolvida; falha impede execução.
 * Fontes legadas sem definição conhecida mantêm o tratamento anterior.
 */
export function bareExec(
  model: ExecInput['model'],
  board?: BoardServerSpec,
  s?: BoardState,
  /** as definições dos servidores MCP guardadas no board; sem elas, só o servidor do board */
  libraryServers?: Record<string, unknown>,
  /** o perfil de CLI que executa; sem ele vale o padrão do board */
  cli?: AiProfile,
): ExecInput {
  const always = s && profileBase(cli ?? activeProfile(s.board)) === 'claude' && libraryServers ? selectedMcpNames(s, 'always') : [];
  if (s) requireReviewedMcps(s, always);
  const defs: Record<string, unknown> = { ...(libraryServers ?? {}) };
  const missing = always.filter((n) => !defs[n] && s?.harness.library?.artifacts.some((a) => a.kind === 'mcp' && a.name === n));
  if (missing.length) throw new Error(`MCPs exigem revisão humana ou configuração local: ${missing.join(', ')}.`);
  const allowed = always.filter((n) => defs[n]);
  if (board) defs[BOARD_SERVER] = { type: 'stdio', ...board };
  return {
    agent: '',
    agentDefinition: null,
    delegates: [],
    mcpAllowed: allowed,
    mcpBlocked: [],
    mcpConfig: board ? JSON.stringify({ mcpServers: Object.fromEntries([BOARD_SERVER, ...allowed].map((n) => [n, defs[n]])) }) : null,
    tools: [],
    deniedTools: [],
    model,
  };
}
