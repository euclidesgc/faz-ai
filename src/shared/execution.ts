import type { AiTool } from './harness';
import type { BoardState, Card } from './model';
import { parseModelValue, type ModelOption } from './models';
import { columnOf, valueOf } from './selectors';

/**
 * Agente do board (guardado como "perfil de execução" no banco e nas mensagens): o que uma sessão de
 * IA recebe para trabalhar num card, definido antes, em vez de descoberto pela ferramenta. Toda
 * execução pelo board roda através de um agente: o do card, o da fase ou o padrão. Não confundir com
 * `agent`, abaixo, que é o arquivo de subagente da própria ferramenta (ex.: `.claude/agents/x.md`).
 */
export interface ExecProfile {
  id: string;
  name: string;
  /** o que o agente faz, em uma frase: base para sugerir skills e servidores MCP */
  purpose: string;
  /** subagente da ferramenta que conduz a sessão; vazio = o agente padrão dela */
  agent: string;
  /** skills que toda execução com este agente deve ler, além das indicadas no card */
  skills: string[];
  /** servidores MCP liberados além do servidor do board; null = todos os configurados */
  mcpServers: string[] | null;
  /** ferramentas embutidas disponíveis; vazio = as que o nível de permissão da execução libera */
  tools: string[];
  /** ferramentas retiradas da sessão */
  deniedTools: string[];
  /** modelo e esforço (valor do campo Modelo); o modelo indicado no card tem preferência */
  model: string;
  /** sessão limpa: sem as personalizações da pasta do usuário e sem invocação automática de skills */
  clean: boolean;
  /** agente usado quando nem o card nem a coluna indicam um */
  isDefault: boolean;
}

/** O agente que existe quando o board ainda não tem nenhum: sem restrições, a sessão usa o que a ferramenta carregar. */
export const defaultAgent = (): ExecProfile => ({
  id: 'padrao',
  name: 'Agente padrão',
  purpose: '',
  agent: '',
  skills: [],
  mcpServers: null,
  tools: [],
  deniedTools: [],
  model: '',
  clean: false,
  isDefault: true,
});

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

/** Os agentes salvos, descartando o inválido. Nunca devolve vazio: sem nenhum, vale o agente padrão. */
export function parseProfiles(json: string | null | undefined): ExecProfile[] {
  const list = readProfiles(json);
  if (!list.length) return [defaultAgent()];
  // sempre há um padrão: na falta, o primeiro
  return list.some((p) => p.isDefault) ? list : list.map((p, i) => ({ ...p, isDefault: i === 0 }));
}

function readProfiles(json: string | null | undefined): ExecProfile[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? '');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExecProfile[] = [];
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
      clean: v.clean === true,
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
  profile: string | null;
  agent: string;
  /** nomes das skills: as do agente e as indicadas no campo Skills do card */
  skills: string[];
  mcpServers: string[] | null;
  tools: string[];
  deniedTools: string[];
  /** modelo (nome que a ferramenta entende) e esforço, quando são da ferramenta do projeto */
  model: { name: string; effort: string | null } | null;
  clean: boolean;
}

export function manifestOf(s: BoardState, c: Card): ExecManifest {
  const profile = profileOf(s, c);
  const fieldValue = (match: (f: BoardState['fieldDefs'][number]) => boolean) => {
    const field = s.fieldDefs.find(match);
    return field ? valueOf(s, c.id, field.id) : undefined;
  };
  const cardSkills = fieldValue((f) => f.kind === 'multiselect' && f.name.toLowerCase() === 'skills');
  const chosen = parseModelValue(fieldValue((f) => f.kind === 'model') ?? null) ?? parseModelValue(profile?.model || null);
  const option = chosen ? s.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === s.board.aiTool) : undefined;
  return {
    profile: profile?.name ?? null,
    agent: profile?.agent ?? '',
    skills: [...new Set([...(profile?.skills ?? []), ...(Array.isArray(cardSkills) ? cardSkills : [])])],
    mcpServers: profile?.mcpServers ?? null,
    tools: profile?.tools ?? [],
    deniedTools: profile?.deniedTools ?? [],
    model: option
      ? {
          name: option.model,
          effort: effortToRun(option, chosen!.effort),
        }
      : null,
    clean: profile?.clean ?? false,
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

export type ExecAspect = 'agent' | 'skills' | 'mcp' | 'tools' | 'model' | 'clean';

export const EXEC_ASPECTS: { id: ExecAspect; label: string }[] = [
  { id: 'agent', label: 'Agente' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'Servidores MCP' },
  { id: 'tools', label: 'Ferramentas' },
  { id: 'model', label: 'Modelo e esforço' },
  { id: 'clean', label: 'Sessão limpa' },
];

/**
 * O que a execução pelo board consegue impor em cada ferramenta por parâmetro da linha de comando
 * (`enforced`) e o que só segue como orientação no prompt e no get_card (`advised`). Conforme a
 * documentação de cada CLI lida em 2026-10-02; as skills vão sempre pelo caminho do arquivo.
 */
export const EXEC_ENFORCEMENT: Record<AiTool, Record<ExecAspect, 'enforced' | 'advised'>> = {
  claude: { agent: 'enforced', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced', clean: 'enforced' },
  copilot: { agent: 'enforced', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced', clean: 'advised' },
  kimi: { agent: 'enforced', skills: 'advised', mcp: 'advised', tools: 'advised', model: 'enforced', clean: 'advised' },
  codex: { agent: 'advised', skills: 'advised', mcp: 'enforced', tools: 'advised', model: 'enforced', clean: 'advised' },
  cursor: { agent: 'advised', skills: 'advised', mcp: 'advised', tools: 'advised', model: 'enforced', clean: 'advised' },
};
