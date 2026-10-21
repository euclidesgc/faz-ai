import { catalogTool } from './aiProfiles';
import { agentManifestOf, manifestOf, type ExecProfile } from './execution';
import { contextFilesOf } from './contextSources';
import type { AiTool, HarnessItem } from './harness';
import type { BoardState, Card } from './model';
import { contextWindowOf } from './models';
import { checklistOf, columnOf } from './selectors';

/**
 * Estimativa do contexto que uma execução do board monta para um card antes de a IA começar: o que o
 * board escolhe (servidor MCP, agente, rules, skills) e o conteúdo do card. É uma conta pelo tamanho do
 * texto, não a contagem do tokenizador: serve para comparar escolhas e achar o que pesa. O prompt e as
 * ferramentas nativas da própria ferramenta de IA não entram, porque o board não os conhece.
 */

/** Caracteres por token na conta: a média que as ferramentas costumam citar. O tokenizador real varia com o modelo, o idioma e o tipo de texto. */
export const CHARS_PER_TOKEN = 4;

export const tokensOf = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

/**
 * O que o servidor MCP do board põe numa sessão, em caracteres. Medido no host a partir das próprias
 * ferramentas, do jeito que tools/list as descreve; a webview só recebe os números.
 */
export interface McpFootprint {
  /** nome do servidor, como as ferramentas o registram */
  server: string;
  /** quantas ferramentas ele expõe */
  tools: number;
  /** os nomes das ferramentas como a sessão os vê (`mcp__faz-ai__get_card`), um por linha */
  names: number;
  /** as instruções do servidor */
  instructions: number;
  /** as definições completas: nome, descrição e schema de cada ferramenta */
  definitions: number;
}

/**
 * Até onde o Claude Code lê as instruções de um servidor MCP: corta em 2.048 caracteres por padrão.
 * Com o tool search, que é o padrão, a sessão começa só com os nomes das ferramentas e as instruções
 * dos servidores, e as definições carregam quando a IA procura a ferramenta
 * (code.claude.com/docs/en/mcp, "Scale with MCP tool search", lido em 2026-10-13).
 */
export const CLAUDE_MCP_INSTRUCTIONS_LIMIT = 2048;

export type ContextGroupId = 'mcp' | 'agents' | 'rules' | 'skills' | 'card';

/** Uma linha do detalhe: o que é, o nome (quando é um dado, como o arquivo ou o agente) e quanto ocupa. */
export interface ContextEntry {
  kind:
    | 'mcp-names'
    | 'mcp-instructions'
    | 'mcp-definitions'
    | 'mcp-server'
    | 'mcp-allowed'
    | 'agent'
    | 'subagent'
    | 'rule'
    | 'skill'
    | 'card-text'
    | 'card-checklist'
    | 'card-comments'
    | 'card-phase'
    | 'card-documents';
  /** nome do servidor, agente, arquivo ou skill; ausente nas linhas do card */
  name?: string;
  /** quantos itens a linha soma (ferramentas, mensagens, documentos) */
  count?: number;
  /** null = não medido: o board não tem como saber (um servidor MCP de fora, um arquivo que sumiu) */
  tokens: number | null;
  /** carrega só quando a IA precisa: fica fora do total */
  onDemand?: boolean;
}

export interface ContextGroup {
  id: ContextGroupId;
  /** soma das linhas medidas, sem as que carregam sob demanda */
  tokens: number;
  entries: ContextEntry[];
}

export interface ContextEstimate {
  tool: AiTool;
  /** soma dos grupos: o que a sessão recebe antes de começar */
  total: number;
  /** janela de contexto do modelo do card; null quando o card não tem modelo ou o board não conhece a janela dele */
  window: number | null;
  /** rótulo do modelo do card no catálogo, ex.: "Opus 5.5"; null sem modelo */
  model: string | null;
  /** a fase da próxima execução (a coluna do card, quando a IA atua nela); null fora de uma fase da IA */
  phase: string | null;
  /** os grupos com alguma linha, na ordem da tela */
  groups: ContextGroup[];
  /** o que pode entrar depois, sob demanda (as definições das ferramentas MCP) */
  onDemand: number;
  /** linhas que o board não conseguiu medir */
  unmeasured: number;
}

const GROUP_ORDER: ContextGroupId[] = ['mcp', 'agents', 'rules', 'skills', 'card'];

const sized = (item: HarnessItem | undefined): number | null => (item?.size === undefined ? null : tokensOf(item.size));

/** O servidor do board e os que o agente libera. No Claude Code, só os nomes e as instruções entram de início. */
function mcpEntries(s: BoardState, tool: AiTool, allowed: string[]): ContextEntry[] {
  const f = s.boardServer;
  const board: ContextEntry[] = !f
    ? // antes da medição do host: o servidor do board aparece, sem número
      [{ kind: 'mcp-server', name: 'faz-ai', tokens: null }]
    : tool === 'claude'
      ? [
          { kind: 'mcp-names', name: f.server, count: f.tools, tokens: tokensOf(f.names) },
          { kind: 'mcp-instructions', name: f.server, tokens: tokensOf(Math.min(f.instructions, CLAUDE_MCP_INSTRUCTIONS_LIMIT)) },
          { kind: 'mcp-definitions', name: f.server, count: f.tools, tokens: tokensOf(f.definitions), onDemand: true },
        ]
      : // nas outras ferramentas o board não sabe se as definições são adiadas: conta todas, a estimativa mais alta
        [
          { kind: 'mcp-instructions', name: f.server, tokens: tokensOf(f.instructions) },
          { kind: 'mcp-definitions', name: f.server, count: f.tools, tokens: tokensOf(f.definitions) },
        ];
  // o board não abre os outros servidores: as ferramentas deles ficam sem medida
  return [...board, ...allowed.map((name): ContextEntry => ({ kind: 'mcp-allowed', name, tokens: null }))];
}

/** O agente da sessão (instruções inteiras) e, numa história no Claude Code, os subagentes (só o nome e a descrição entram aqui). */
function agentEntries(tool: AiTool, m: ReturnType<typeof manifestOf>): ContextEntry[] {
  const own: ContextEntry[] = m.agent ? [{ kind: 'agent', name: m.agent, tokens: tokensOf(m.instructions.length + m.purpose.length) }] : [];
  // a ferramenta lista cada subagente pelo nome e pela descrição; as instruções dele vão para o contexto do próprio subagente
  const subs =
    tool === 'claude'
      ? m.delegates.map((d): ContextEntry => ({ kind: 'subagent', name: d.name, tokens: tokensOf(d.name.length + d.purpose.length) }))
      : [];
  return [...own, ...subs];
}

/** As rules e as skills que a sessão lê pelo caminho: as do contexto fixo e as que o card (ou o agente) exige, sem repetir. */
function fileEntries(s: BoardState, m: ReturnType<typeof manifestOf>): { rules: ContextEntry[]; skills: ContextEntry[] } {
  const files = contextFilesOf(s, m);
  return {
    rules: files.rules.map((f) => ({ kind: 'rule', name: f.name, tokens: sized(f.item) })),
    skills: files.skills.map((f) => ({ kind: 'skill', name: f.name, tokens: sized(f.item) })),
  };
}

/** O que o get_card e a fase entregam do card: texto, checklist, conversa, instruções da fase e os documentos das fases. */
function cardEntries(s: BoardState, c: Card): ContextEntry[] {
  const out: ContextEntry[] = [{ kind: 'card-text', tokens: tokensOf(c.title.length + c.description.length) }];
  const checklist = checklistOf(s, c.id);
  if (checklist.length)
    out.push({ kind: 'card-checklist', count: checklist.length, tokens: tokensOf(checklist.reduce((n, i) => n + i.text.length, 0)) });
  const comments = s.comments.filter((m) => m.cardId === c.id);
  if (comments.length)
    out.push({ kind: 'card-comments', count: comments.length, tokens: tokensOf(comments.reduce((n, m) => n + m.body.length, 0)) });
  const col = columnOf(s, c);
  if (col?.aiActive && (col.aiInstruction || col.artifactTemplate))
    out.push({ kind: 'card-phase', tokens: tokensOf(col.aiInstruction.length + col.artifactTemplate.length) });
  // os documentos das fases ficam na história; a sub-tarefa os recebe dela
  const docs = s.attachments.filter((a) => a.artifact && a.cardId === (c.parentId ?? c.id));
  if (docs.length) out.push({ kind: 'card-documents', count: docs.length, tokens: tokensOf(docs.reduce((n, a) => n + a.size, 0)) });
  return out;
}

const sum = (entries: ContextEntry[]): number => entries.reduce((n, e) => n + (e.onDemand ? 0 : (e.tokens ?? 0)), 0);

/**
 * O contexto estimado da próxima execução do card, com o agente, as rules, as skills, o modelo e a fase
 * que valem para ele agora: muda quando o card muda de coluna, quando a conversa cresce ou encolhe e
 * quando a fase anexa um documento.
 */
export function estimateContext(s: BoardState, c: Card): ContextEstimate {
  return estimateManifestContext(s, manifestOf(s, c), c);
}

/** Custo inicial do agente com o contexto fixo, sem inventar um card ou chamar a IA. */
export function estimateAgentContext(s: BoardState, profile: ExecProfile): ContextEstimate {
  return estimateManifestContext(s, agentManifestOf(s, profile));
}

function estimateManifestContext(s: BoardState, m: ReturnType<typeof manifestOf>, c?: Card): ContextEstimate {
  // a CLI do alvo do card (ou do agente), não o perfil padrão do board
  const cli = m.target.cli;
  const tool = cli.id;
  const { rules, skills } = fileEntries(s, m);
  const byGroup: Record<ContextGroupId, ContextEntry[]> = {
    mcp: mcpEntries(s, tool, m.mcpServers),
    agents: agentEntries(tool, m),
    rules,
    skills,
    card: c ? cardEntries(s, c) : [],
  };
  const groups = GROUP_ORDER.filter((id) => byGroup[id].length).map((id): ContextGroup => ({
    id,
    tokens: sum(byGroup[id]),
    entries: byGroup[id],
  }));
  const entries = groups.flatMap((g) => g.entries);
  const option = m.model ? s.board.modelCatalog.find((o) => o.tool === catalogTool(cli) && o.model === m.model!.name) : undefined;
  const col = c ? columnOf(s, c) : undefined;
  return {
    tool,
    total: groups.reduce((n, g) => n + g.tokens, 0),
    window: m.model ? contextWindowOf(catalogTool(cli), m.model.name) : null,
    model: option?.label ?? m.model?.name ?? null,
    phase: col?.aiActive ? col.name : null,
    groups,
    onDemand: entries.reduce((n, e) => n + (e.onDemand ? (e.tokens ?? 0) : 0), 0),
    unmeasured: entries.filter((e) => e.tokens === null).length,
  };
}
