import { manifestOf } from './execution';
import type { AiTool, HarnessItem } from './harness';
import { selectedItems, toolItemsOf } from './harnessSelection';
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
  /** os grupos com alguma linha, na ordem da tela */
  groups: ContextGroup[];
  /** o que pode entrar depois, sob demanda (as definições das ferramentas MCP) */
  onDemand: number;
  /** linhas que o board não conseguiu medir */
  unmeasured: number;
}

const GROUP_ORDER: ContextGroupId[] = ['mcp', 'agents', 'rules', 'skills', 'card'];

const sized = (item: HarnessItem | undefined): number | null => (item?.size === undefined ? null : tokensOf(item.size));

/** A skill de um nome na ferramenta em uso, como o get_card a resolve: a do projeto vale mais que a global ou a de plugin. */
function skillItem(s: BoardState, name: string): HarnessItem | undefined {
  const skills = toolItemsOf(s).filter((i) => i.kind === 'skill' && i.name === name);
  return skills.find((i) => i.scope === 'project') ?? skills[0];
}

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
function agentEntries(tool: AiTool, c: Card, m: ReturnType<typeof manifestOf>): ContextEntry[] {
  const own: ContextEntry[] = m.agent ? [{ kind: 'agent', name: m.agent, tokens: tokensOf(m.instructions.length + m.purpose.length) }] : [];
  // a ferramenta lista cada subagente pelo nome e pela descrição; as instruções dele vão para o contexto do próprio subagente
  const subs =
    tool === 'claude' && !c.parentId
      ? m.delegates.map((d): ContextEntry => ({ kind: 'subagent', name: d.name, tokens: tokensOf(d.name.length + d.purpose.length) }))
      : [];
  return [...own, ...subs];
}

/** As rules e as skills que a sessão lê pelo caminho: as do contexto fixo e as que o card (ou o agente) exige, sem repetir. */
function fileEntries(s: BoardState, m: ReturnType<typeof manifestOf>): { rules: ContextEntry[]; skills: ContextEntry[] } {
  const seen = new Set<string>();
  const once = (item: HarnessItem | undefined, key: string) => {
    const id = item?.path ?? key;
    return seen.has(id) ? false : (seen.add(id), true);
  };
  const rules: ContextEntry[] = [];
  for (const i of selectedItems(s, 'instructions', 'always'))
    if (once(i, i.location)) rules.push({ kind: 'rule', name: i.location, tokens: sized(i) });
  for (const location of m.rules) {
    const item = toolItemsOf(s).find((i) => i.kind === 'instructions' && i.location === location);
    if (once(item, `rule:${location}`)) rules.push({ kind: 'rule', name: location, tokens: sized(item) });
  }
  const skills: ContextEntry[] = [];
  for (const i of selectedItems(s, 'skill', 'always')) if (once(i, i.name)) skills.push({ kind: 'skill', name: i.name, tokens: sized(i) });
  for (const name of m.skills) {
    const item = skillItem(s, name);
    if (once(item, `skill:${name}`)) skills.push({ kind: 'skill', name, tokens: sized(item) });
  }
  return { rules, skills };
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

/** O contexto estimado de uma execução do card, com o agente, as rules, as skills e o modelo que valem para ele agora. */
export function estimateContext(s: BoardState, c: Card): ContextEstimate {
  const tool = s.board.aiTool;
  const m = manifestOf(s, c);
  const { rules, skills } = fileEntries(s, m);
  const byGroup: Record<ContextGroupId, ContextEntry[]> = {
    mcp: mcpEntries(s, tool, m.mcpServers),
    agents: agentEntries(tool, c, m),
    rules,
    skills,
    card: cardEntries(s, c),
  };
  const groups = GROUP_ORDER.filter((id) => byGroup[id].length).map((id): ContextGroup => ({
    id,
    tokens: sum(byGroup[id]),
    entries: byGroup[id],
  }));
  const entries = groups.flatMap((g) => g.entries);
  const option = m.model ? s.board.modelCatalog.find((o) => o.tool === tool && o.model === m.model!.name) : undefined;
  return {
    tool,
    total: groups.reduce((n, g) => n + g.tokens, 0),
    window: m.model ? contextWindowOf(tool, m.model.name) : null,
    model: option?.label ?? m.model?.name ?? null,
    groups,
    onDemand: entries.reduce((n, e) => n + (e.onDemand ? (e.tokens ?? 0) : 0), 0),
    unmeasured: entries.filter((e) => e.tokens === null).length,
  };
}
