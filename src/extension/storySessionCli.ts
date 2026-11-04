// A sessão da História numa CLI que define subagentes por parâmetro (Claude Code): a principal é o agente da
// sessão (`--agent`), a filha é um subagente definido pelo board a partir do manifesto da sub-tarefa, e só a
// principal pode lançá-la. O que o ACP resolve por sessões nativas, aqui se resolve pela definição dos agentes.
import { BOARD_SERVER, agentAdvice, type AgentDefinition, type ExecPlan } from './execution';
import type { AiProvider, StoryChildDefinition } from './ai/provider';
import type { StorySessionTransport } from './storySessionController';
import { isAcpProfile, type AiProfile } from '../shared/aiProfiles';
import { NO_DELEGATION } from '../shared/executionAdmission';
import { providerFor } from './ai/providers';

/** As ferramentas da principal sintetizada: lê o projeto e fala com o board; quem muda arquivos é a filha. */
export const STORY_PRINCIPAL_TOOLS = ['Read', 'Glob', 'Grep', `mcp__${BOARD_SERVER}__*`];
export const STORY_PRINCIPAL_NAME = 'condutor-da-historia';

/** Nome do servidor como o Claude Code o escreve nos nomes de ferramenta (`mcp__<servidor>__*`). */
export const mcpToolGlob = (server: string): string => `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__*`;

/**
 * Por qual transporte o perfil sustenta a sessão da História: o ACP carrega a sessão nativa (`session/load`);
 * a CLI que declara `storySessions` retoma por id e define a filha por parâmetro. null = só o modo tradicional.
 */
export function storySessionTransport(cli: AiProfile): StorySessionTransport | null {
  if (isAcpProfile(cli) || cli.mode === 'acp') return 'acp';
  if (cli.mode !== 'cli') return null;
  try {
    return providerFor(cli).storySessions?.transport ?? null;
  } catch {
    return null;
  }
}

/** O que a CLI declara sobre a sessão da História (modelo da filha, evidência MCP); null fora da CLI que a sustenta. */
export function storySessionSpec(cli: AiProfile): NonNullable<AiProvider['storySessions']> | null {
  if (cli.mode !== 'cli') return null;
  try {
    return providerFor(cli).storySessions ?? null;
  } catch {
    return null;
  }
}

/** O nome da filha de uma sub-tarefa: único na sessão e sem caracteres que a CLI recuse. */
export const storyChildName = (cardNumber: number | string): string => `filha-${String(cardNumber).replace(/[^A-Za-z0-9_-]/g, '-')}`;

/**
 * A principal da sessão: o agente inline do card da História quando houver, senão uma coordenadora sintetizada.
 * Com uma filha autorizada, a ferramenta `Agent` da principal fica restrita a ela (`Agent(<filha>)`); sem filha,
 * `Agent` solto fica como estava (o provider nega a delegação na linha de comando).
 */
export function storyPrincipalDefinition(parent: ExecPlan, childName: string | null, coordinationPrompt: string): AgentDefinition {
  const own = parent.input.agentDefinition;
  const base: AgentDefinition = own
    ? { ...own }
    : {
        name: STORY_PRINCIPAL_NAME,
        description: 'Coordena a História no board Faz AI e delega o trabalho especializado às filhas.',
        prompt: coordinationPrompt,
        tools: [...STORY_PRINCIPAL_TOOLS],
      };
  if (!childName) return base;
  const tools = base.tools ? base.tools.filter((tool) => !/^(Agent|Task)(\(|$)/.test(tool)) : [...STORY_PRINCIPAL_TOOLS];
  return { ...base, tools: [...tools, `Agent(${childName})`] };
}

export interface StoryChildInput {
  /** o plano da sub-tarefa, já resolvido com o alvo e o manifesto do card dela */
  plan: ExecPlan;
  /** o modelo que o card da sub-tarefa pede; null = o da sessão */
  model: { name: string; effort: string | null } | null;
  /** as instruções da unidade (o pedido do orquestrador para a sub-tarefa) */
  unitAdvice: readonly string[];
}

/**
 * A filha a partir do manifesto da sub-tarefa: as instruções do agente e as orientações do plano viram o prompt
 * dela; as ferramentas e os servidores MCP do card viram `tools` e `mcpServers`; o modelo e o esforço do card vão
 * por parâmetro. Nenhuma filha delega (a profundidade é uma) nem pergunta à pessoa (a CLI já tira
 * `AskUserQuestion` de todo subagente): perguntas sobem pela principal.
 */
export function storyChildDefinition(input: StoryChildInput): StoryChildDefinition {
  const { plan } = input;
  const manifest = plan.manifest;
  const servers = [...new Set([BOARD_SERVER, ...manifest.mcpServers])];
  const prompt = [
    ...(plan.input.agentDefinition ? [plan.input.agentDefinition.prompt] : agentAdvice(manifest)),
    ...input.unitAdvice,
    ...plan.advice,
  ]
    .filter((line) => line.trim())
    .join('\n\n');
  const tools = manifest.tools.length
    ? [...new Set([...manifest.tools.filter((tool) => !NO_DELEGATION.includes(tool)), ...servers.map(mcpToolGlob)])]
    : undefined;
  const definition: StoryChildDefinition = {
    description: manifest.purpose || `Executa a sub-tarefa delegada pela principal da História.`,
    prompt,
    disallowedTools: [...new Set([...manifest.deniedTools, ...NO_DELEGATION])],
    mcpServers: servers,
  };
  if (tools) definition.tools = tools;
  if (input.model) {
    definition.model = input.model.name;
    if (input.model.effort) definition.effort = input.model.effort;
  }
  return definition;
}

/**
 * O modelo efetivo da filha bate com o pedido? A CLI do Claude devolve o id completo (`claude-opus-5-5` ou
 * `claude-haiku-4-5-20251001`) para um pedido que pode ser o apelido (`opus`) ou o id sem a data; o ACP devolve o
 * mesmo nome que recebeu. Nunca aceita um modelo diferente: só as grafias do mesmo.
 */
export function effectiveModelMatches(expected: string, effective: string | null): boolean {
  if (!effective) return false;
  const want = expected.trim().toLowerCase();
  const got = effective.trim().toLowerCase();
  if (!want || !got) return false;
  if (want === got) return true;
  // id sem a data (`claude-haiku-4-5` → `claude-haiku-4-5-20251001`)
  if (got.startsWith(`${want}-`) && /^\d{8}$/.test(got.slice(want.length + 1))) return true;
  // apelido da família (`opus` → `claude-opus-5-5`, `haiku` → `claude-haiku-4-5-20251001`)
  if (/^[a-z]+$/.test(want) && new RegExp(`^claude-${want}-\\d`).test(got)) return true;
  return false;
}
