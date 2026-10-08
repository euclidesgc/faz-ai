import type { Agent, AiTool } from './harness';
import type { HarnessSelection } from './harnessSelection';
import type { BoardState, Card } from './model';
import { parseModelValue, type ModelOption } from './models';
import { columnOf, valueOf } from './selectors';

/**
 * Agente do board: o que uma sessão de IA recebe para trabalhar num card, definido antes, em vez de
 * descoberto pela ferramenta. É o arquivo de agente da ferramenta (`~/.claude/agents/<nome>.md`,
 * `~/.cursor/agents/<nome>.md`), lido do disco e marcado como disponível em Configurações → Harness.
 * Toda execução pelo board roda através de um agente: o do card, o da fase ou o padrão do board.
 * Sem nenhum arquivo marcado, vale o agente embutido (`defaultAgent`), sem instruções.
 */
export interface ExecProfile {
  /** nome do arquivo do agente (sem extensão); `padrao` no embutido */
  id: string;
  name: string;
  /** o que o agente faz, em uma frase: é a `description` do arquivo, base para o Refinar escolher o agente */
  purpose: string;
  /** instruções do agente (o corpo do arquivo), que a sessão recebe como papel */
  instructions: string;
  /** skills que toda execução com este agente deve ler, além das indicadas no card */
  skills: string[];
  /** servidores MCP liberados além do servidor do board; vazio = só o do board */
  mcpServers: string[];
  /** ferramentas embutidas disponíveis; vazio = as que o nível de permissão da execução libera */
  tools: string[];
  /** ferramentas retiradas da sessão */
  deniedTools: string[];
  /** modelo e esforço (valor do campo Modelo); o modelo indicado no card tem preferência */
  model: string;
  /** agente usado quando nem o card nem a coluna indicam um */
  isDefault: boolean;
  /** de onde o arquivo veio; `builtin` é o agente embutido, sem arquivo */
  scope: 'project' | 'user' | 'builtin';
  /** caminho absoluto do arquivo; vazio no embutido */
  path: string;
}

/**
 * As ferramentas do servidor MCP do board, no nome que o Claude Code dá a elas (`mcp__<servidor>__*`),
 * para a lista `tools` de um agente. Essa lista é fechada: o agente (a sessão, quando ele é o da
 * execução; o subagente, quando é lançado) fica só com o que está nela, e os servidores MCP carregados
 * ficam de fora — a ponte conecta, as instruções do servidor entram no contexto, mas nenhuma
 * ferramenta dele existe (verificado na CLI 2.1.278). Por isso toda lista de ferramentas de um agente
 * do board leva este nome junto, no arquivo e na linha de comando, e a interface nunca o mostra.
 */
export const BOARD_TOOLS = 'mcp__faz-ai__*';

/** A lista de ferramentas de um agente, sempre com as do servidor do board; vazia continua vazia (todas). */
export const withBoardTools = (tools: string[]): string[] => (tools.length ? [...new Set([...tools, BOARD_TOOLS])] : []);

/** O agente de fábrica que conduz os cards pelo fluxo: é o padrão do board quando o escolhido não existe. */
export const CONDUCTOR_AGENT = 'condutor-do-board';

/** O agente que existe quando o board não tem nenhum marcado: sem instruções nem restrições, só o contexto vazio do board. */
export const defaultAgent = (): ExecProfile => ({
  id: 'padrao',
  name: 'Agente padrão',
  purpose: '',
  instructions: '',
  skills: [],
  mcpServers: [],
  tools: [],
  deniedTools: [],
  model: '',
  isDefault: true,
  scope: 'builtin',
  path: '',
});

/** O agente lido de um arquivo, no formato do board. */
export const profileOfAgent = (a: Agent, isDefault: boolean): ExecProfile => ({
  id: a.name,
  name: a.name,
  purpose: a.description,
  instructions: a.body,
  skills: a.skills,
  mcpServers: a.mcp,
  tools: a.tools,
  deniedTools: a.deniedTools,
  model: a.modelValue,
  isDefault,
  scope: a.scope,
  path: a.path,
});

/**
 * Os agentes do board: os arquivos de agente da ferramenta em uso marcados como disponíveis, com o padrão
 * (`defaultName`, de Configurações) à frente; se ele não existe (apagado, desmarcado, nome de outra
 * versão), vale o condutor, e só sem o condutor o primeiro da lista. Sem nenhum, o embutido. Um projeto e
 * um global de mesmo nome são o mesmo agente para o card: vale o do projeto.
 */
export function agentProfiles(agents: readonly Agent[], selection: readonly HarnessSelection[], defaultName: string): ExecProfile[] {
  const byName = new Map<string, Agent>();
  for (const a of agents) {
    if (!selection.some((x) => x.kind === 'agent' && x.location === a.location)) continue;
    const current = byName.get(a.name);
    if (!current || (current.scope === 'user' && a.scope === 'project')) byName.set(a.name, a);
  }
  const list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return [defaultAgent()];
  const has = (name: string) => list.some((a) => a.name === name);
  const chosen = has(defaultName) ? defaultName : has(CONDUCTOR_AGENT) ? CONDUCTOR_AGENT : list[0]!.name;
  return list.map((a) => profileOfAgent(a, a.name === chosen));
}

/** Conjuntos de ferramentas prontos, nos nomes do Claude Code; nas demais ferramentas valem como orientação. */
export const TOOL_PRESETS: { id: string; label: string; hint: string; tools: string[] }[] = [
  { id: 'read', label: 'Só leitura', hint: 'Lê e busca arquivos; não edita nem roda comandos.', tools: ['Read', 'Grep', 'Glob'] },
  {
    id: 'code',
    label: 'Editar código',
    hint: 'Lê, edita arquivos e roda comandos no terminal.',
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
  },
];

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))] : [];

/** Agente como as versões anteriores o guardavam no banco (`boards.exec_profiles_json`); só serve à migração para arquivos. */
export interface LegacyExecProfile {
  id: string;
  name: string;
  purpose: string;
  agent: string;
  skills: string[];
  mcpServers: string[] | null;
  tools: string[];
  deniedTools: string[];
  model: string;
  isDefault: boolean;
}

/** Os agentes guardados no banco pelas versões anteriores, descartando o inválido; vazio quando não há nenhum. */
export function parseProfiles(json: string | null | undefined): LegacyExecProfile[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? '');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LegacyExecProfile[] = [];
  for (const v of raw as Record<string, unknown>[]) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({
      id: v.id,
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : 'Agente',
      purpose: typeof v.purpose === 'string' ? v.purpose.trim() : '',
      agent: typeof v.agent === 'string' ? v.agent.trim() : '',
      skills: strings(v.skills),
      mcpServers: Array.isArray(v.mcpServers) ? strings(v.mcpServers) : null,
      tools: strings(v.tools),
      deniedTools: strings(v.deniedTools),
      model: typeof v.model === 'string' ? v.model : '',
      // só um agente é o padrão
      isDefault: v.isDefault === true && !out.some((p) => p.isDefault),
    });
  }
  return out;
}

/** O agente que vale para o card: o do card, o da coluna dele, o da coluna da história (numa sub-tarefa) ou o padrão do board. */
export function profileOf(s: BoardState, c: Card): ExecProfile | undefined {
  const byId = (id: string | null | undefined) => (id ? s.board.execProfiles.find((p) => p.id === id) : undefined);
  const column = (card: Card) => columnOf(s, card)?.execProfile;
  const story = c.parentId ? s.cards.find((p) => p.id === c.parentId) : undefined;
  return (
    byId(c.execProfile) ??
    byId(column(c)) ??
    (story ? (byId(story.execProfile) ?? byId(column(story))) : undefined) ??
    s.board.execProfiles.find((p) => p.isDefault)
  );
}

/** O que a execução de um card deve usar, já resolvido entre o card e o agente. */
export interface ExecManifest {
  /** nome do agente do board */
  profile: string | null;
  /** nome do arquivo de agente que a ferramenta recebe por parâmetro (`--agent`); vazio no agente embutido */
  agent: string;
  /** o que o agente faz e as instruções dele, para a ferramenta que não o recebe por parâmetro */
  purpose: string;
  instructions: string;
  /** nomes das skills: as do agente e as indicadas no campo Skills do card */
  skills: string[];
  /** rules indicadas no campo Rules do card (locations do inventário) */
  rules: string[];
  /** servidores MCP além do do board */
  mcpServers: string[];
  tools: string[];
  deniedTools: string[];
  /** modelo (nome que a ferramenta entende) e esforço, quando são da ferramenta do projeto */
  model: { name: string; effort: string | null } | null;
  /**
   * Os outros agentes disponíveis no board, para a sessão da história delegar as sub-tarefas a eles
   * como subagentes (é a sessão da história que executa as sub-tarefas; nenhuma roda sozinha). Vazio
   * numa sub-tarefa: ela já roda com o agente dela.
   */
  delegates: ExecDelegate[];
}

/** Um agente do board como subagente de outra sessão: o que ele sabe, pode usar e com que modelo. */
export interface ExecDelegate {
  name: string;
  purpose: string;
  instructions: string;
  tools: string[];
  deniedTools: string[];
  /** nome do modelo que a ferramenta entende; null = o da sessão */
  model: string | null;
}

/** O modelo do catálogo da ferramenta em uso para um valor do campo Modelo (`<id>@<esforço>`). */
const catalogModel = (s: BoardState, value: string | null | undefined): { option: ModelOption; effort: string | null } | undefined => {
  const chosen = parseModelValue(value);
  const option = chosen ? s.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === s.board.aiTool) : undefined;
  return option ? { option, effort: chosen!.effort } : undefined;
};

/** Os agentes do board que a sessão de uma história recebe como subagentes: todos os de arquivo, menos o dela. */
export const delegatesOf = (s: BoardState, c: Card, own: ExecProfile | undefined): ExecDelegate[] =>
  c.parentId
    ? []
    : s.board.execProfiles
        .filter((p) => p.scope !== 'builtin' && p.id !== own?.id)
        .map((p) => ({
          name: p.id,
          purpose: p.purpose,
          instructions: p.instructions,
          tools: p.tools,
          deniedTools: p.deniedTools,
          model: catalogModel(s, p.model)?.option.model ?? null,
        }));

const listField = (s: BoardState, c: Card, name: string): string[] => {
  const field = s.fieldDefs.find((f) => f.kind === 'multiselect' && f.name.toLowerCase() === name);
  const v = field ? valueOf(s, c.id, field.id) : undefined;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

export function manifestOf(s: BoardState, c: Card): ExecManifest {
  const profile = profileOf(s, c);
  const modelField = s.fieldDefs.find((f) => f.kind === 'model');
  const chosen = parseModelValue(modelField ? valueOf(s, c.id, modelField.id) : undefined) ?? parseModelValue(profile?.model || null);
  const option = chosen ? s.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === s.board.aiTool) : undefined;
  return {
    delegates: delegatesOf(s, c, profile),
    profile: profile?.name ?? null,
    agent: profile && profile.scope !== 'builtin' ? profile.id : '',
    purpose: profile?.purpose ?? '',
    instructions: profile?.instructions ?? '',
    skills: [...new Set([...(profile?.skills ?? []), ...listField(s, c, 'skills')])],
    rules: listField(s, c, 'rules'),
    mcpServers: profile?.mcpServers ?? [],
    tools: profile?.tools ?? [],
    deniedTools: profile?.deniedTools ?? [],
    model: option
      ? {
          name: option.model,
          effort: effortToRun(option, chosen!.effort),
        }
      : null,
  };
}

/**
 * O nível de esforço que vai para a ferramenta: o escolhido, se o modelo o tem. No Cursor o nível é
 * parte do id, e um modelo sem variante "pura" precisa do nível padrão dele.
 */
export function effortToRun(option: ModelOption, effort: string | null): string | null {
  if (effort && option.efforts.includes(effort)) return effort;
  return option.tool === 'cursor' ? option.defaultEffort : null;
}

export type ExecAspect = 'agent' | 'skills' | 'mcp' | 'tools' | 'model' | 'context';

export const EXEC_ASPECTS: { id: ExecAspect; label: string }[] = [
  { id: 'agent', label: 'Agente' },
  { id: 'skills', label: 'Skills e rules' },
  { id: 'mcp', label: 'Servidores MCP' },
  { id: 'tools', label: 'Ferramentas' },
  { id: 'model', label: 'Modelo e esforço' },
  { id: 'context', label: 'Contexto vazio' },
];

/**
 * O que a execução pelo board consegue impor em cada ferramenta por parâmetro da linha de comando
 * (`enforced`) e o que só segue como orientação no prompt e no get_card (`advised`). Conforme a
 * documentação de cada CLI lida em 2026-10-02 e o Claude Code 2.1.278 testado em 2026-10-07: as skills e
 * as rules vão sempre pelo caminho do arquivo; `context` é o contexto vazio (nada do usuário nem do
 * projeto carregado por conta própria).
 */
export const EXEC_ENFORCEMENT: Record<AiTool, Record<ExecAspect, 'enforced' | 'advised'>> = {
  claude: { agent: 'enforced', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced', context: 'enforced' },
  cursor: { agent: 'advised', skills: 'advised', mcp: 'advised', tools: 'advised', model: 'enforced', context: 'advised' },
};
