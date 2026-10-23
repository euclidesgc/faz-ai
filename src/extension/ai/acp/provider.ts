// O contrato do conector ACP: um transporte só (`acp/run.ts`) para todo agente que fala o Agent Client
// Protocol, e um registro de DADOS por agente (`acp/agents.ts`) com o que é específico dele: comando,
// como entrar, modo para "sem restrições", como reconhecer a ferramenta MCP e o que ele mede. É o par
// do `AiProvider` das CLIs one-shot (`../provider.ts`), com duas diferenças que mudam o desenho:
//
// - não há leitor por agente: o formato da saída é o do protocolo (`acp/reader.ts`);
// - os servidores MCP vão no `session/new`, e não num arquivo do projeto — exceto no agente que,
//   pela documentação, ainda só lê o arquivo dele (`projectMcpFile`).
import type { AiRunTokens } from '../../../shared/log';
import type { FailureClass, ToolFailure } from '../../../shared/usageLimit';
import type { Json } from '../../aiOutput/json';
import type { OutputStream } from '../../aiOutput/reader';
import type { RunningProcess } from '../../runner';
import type { AiMeasure, HeadlessInput } from '../provider';

/** A versão do protocolo que o board fala; o `initialize` confere a do agente. */
export const ACP_PROTOCOL_VERSION = 1;

/** Um servidor MCP stdio como o ACP o recebe em `session/new` (o `env` é lista, não mapa). */
export interface AcpMcpServer {
  name: string;
  /** caminho absoluto: o protocolo exige */
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

/** O processo de um agente ACP: o `stdin` fica aberto a sessão inteira, ao contrário do `-p`. */
export interface AcpProcess extends RunningProcess {
  /** escreve no `stdin` do agente */
  write(text: string): void;
  /** fecha o `stdin`: o agente que segue o protocolo sai sozinho no fim da entrada */
  end(): void;
}

export type AcpSpawnFn = (
  command: { command: string; args: string[]; env?: Record<string, string> },
  cwd: string,
  out: (text: string, stream: OutputStream) => void,
) => AcpProcess;

/** A chamada de ferramenta como o agente a descreve no `session/update` e no pedido de permissão. */
export interface AcpToolCall {
  toolCallId: string;
  title: string | null;
  /** `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, `other` */
  kind: string | null;
  /**
   * O nome interno da ferramenta, quando o agente o deixa reconhecível (`AcpAgent.nativeToolOf`). O protocolo
   * não tem campo para isso; ausente, o board decide pelo `kind`.
   */
  native?: string | null;
}

/**
 * O que o agente informa de consumo pelo ACP, segundo a documentação e os relatos conferidos (ver o
 * registro de decisão). Não muda o que o leitor faz — ele lê o que vier —, mas decide quem entra
 * primeiro e o que o painel promete.
 * - `turn`: tokens do turno no `usage` da resposta do prompt;
 * - `last_request`: o `usage` vem, mas só com o último pedido ao modelo (conta a menos);
 * - `none`: nada; `unknown`: relatos conflitantes, a conferir com a CLI.
 */
export interface AcpUsage {
  tokens: 'turn' | 'last_request' | 'none' | 'unknown';
  /** manda `usage_update.cost` */
  cost: boolean;
}

export interface AcpAgent {
  /** o id do registro do ACP; vira `AiTool` quando o agente sair do protótipo */
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  /** o que a pessoa roda no terminal para entrar: o board não abre o login sozinho */
  readonly login: string;
  /** a página oficial do modo ACP do agente */
  readonly docs: string;
  readonly usage: AcpUsage;
  /** argumentos do modelo na linha de comando, quando o agente aceita */
  modelArgs?(model: { name: string; effort: string | null }): string[];
  /**
   * O modo da sessão (`session/set_mode`) para "sem restrições", quando o agente tem um que dispense
   * as perguntas que o board responderia sim de qualquer jeito. Só é usado se o agente o anunciar
   * em `session/new`; nos outros níveis o board responde a cada pedido.
   */
  readonly fullMode?: string;
  /**
   * Como o agente escreve uma ferramenta MCP no título da chamada (grupos `server` e `tool`). O ACP não
   * tem campo estruturado para isso; sem padrão, vale o nome do servidor aparecer no título.
   */
  readonly mcpTitle?: RegExp;
  /**
   * O nome interno da ferramenta a partir do `toolCallId` do pedido de permissão, no vocabulário do agente (o
   * Gemini CLI: `run_shell_command`, `read_file`), só quando ele está na tabela de equivalentes do agente; null
   * = não dá para saber, e o board decide pelo `kind`. Ausente nos agentes cujo id não carrega o nome.
   */
  nativeToolOf?(toolCallId: string): string | null;
  /** o agente ignora o `mcpServers` do `session/new` e só lê este arquivo do projeto */
  readonly projectMcpFile?: string;
  /** o `inputTokens` do `usage` já inclui o cache lido (o rascunho do protocolo não define) */
  readonly inputIncludesCache?: boolean;
  /** tokens num formato próprio da resposta do prompt, para versões que não mandam o `usage` do protocolo */
  quota?(result: Json): AiRunTokens | null;
  /**
   * O login por chave de API pelo próprio protocolo: o método do `authenticate` que recebe a chave em
   * `_meta["api-key"]`. Com ele, a pessoa entra pela tela do Conectar (a chave fica no cofre do board) em vez
   * do terminal. Ausente: o login é o da própria ferramenta (`login`).
   */
  readonly apiKeyAuth?: { methodId: string };
  /**
   * Se o erro do `session/prompt` é o limite de uso do agente, e até quando (história 12). O protocolo não tem
   * campo para isso: cada agente escreve o seu erro, e só o que o agente declara é lido. Ausente: o erro é
   * uma falha comum, sem pausa por limite (o board não adivinha pelo texto de um agente que não conhece).
   */
  classifyFailure?(failure: ToolFailure): FailureClass;
}

/**
 * A chave de API que o board entrega ao agente pelo `authenticate`, logo depois do `initialize`. Só existe
 * em memória, entre o cofre e o `stdin` do agente: nunca vai para o log, a tela, a exportação nem o vínculo.
 */
export interface AcpAuth {
  methodId: string;
  apiKey: string;
}

/** O que dizer quando o agente recusa a sessão sem login: a tela do Conectar no agente com chave, o terminal nos demais. */
export function acpLoginHint(agent: AcpAgent): string {
  return agent.apiKeyAuth
    ? `${agent.label} pede login. Conecte em Configurações › Ferramentas de IA › Conectar ferramenta, com a chave de API.`
    : `${agent.label} pede login. Rode \`${agent.login}\` no terminal uma vez e entre com a sua conta.`;
}

/** O que o gateway promete medir do agente: o custo, se ele manda; senão, "tokens", a menor promessa. */
export const acpMeasure = (agent: AcpAgent): AiMeasure => (agent.usage.cost ? 'cost' : 'tokens');

/**
 * O modo de sessão que o board pede ao agente; undefined = o modo padrão, em que o agente pergunta e o
 * board responde cada pedido pelo card. O `fullMode` (`yolo` no Gemini) faz o agente parar de perguntar,
 * e aí as negações do card (delegação, ferramentas negadas, servidores fora do card) deixam de valer:
 * por isso ele só vale para uma execução sem restrição declarada. Toda execução admitida traz o conjunto
 * explícito e ao menos a delegação negada, então roda no modo padrão nos três níveis, e a prova feita no
 * modo padrão (`board`) é a do que roda. O modo entra no vínculo de isolamento (`admission.ts`).
 */
export function acpSessionMode(agent: AcpAgent, input: Pick<HeadlessInput, 'permission' | 'exec'>): string | undefined {
  if (input.permission !== 'full' || !agent.fullMode) return undefined;
  const restricted = input.exec?.toolSet === 'explicit' || !!input.exec?.deniedTools?.length;
  return restricted ? undefined : agent.fullMode;
}

/** Como iniciar o agente em modo ACP. */
export function acpCommand(agent: AcpAgent, input: HeadlessInput): { command: string; args: string[] } {
  const model = input.exec?.model && agent.modelArgs ? agent.modelArgs(input.exec.model) : [];
  return { command: agent.command, args: [...agent.args, ...model] };
}

/** `servidor/ferramenta` de uma chamada MCP entre os servidores que o board passou; null = não é MCP (ou não deu para saber). */
export function acpMcpToolOf(agent: AcpAgent, call: AcpToolCall, servers: string[]): { server: string; tool: string } | null {
  if (!call.title) return null;
  const m = agent.mcpTitle?.exec(call.title);
  if (m?.groups?.server && m.groups.tool) return { server: m.groups.server, tool: m.groups.tool };
  // sem padrão conhecido: o nome do servidor no título (o Zed e boa parte dos agentes mostram
  // `servidor: ferramenta` ou `ferramenta (servidor)`); o resto do título fica como nome da ferramenta
  const server = servers.find((s) => new RegExp(`(^|[^\\w-])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(call.title!));
  if (!server) return null;
  const tool = call.title
    .replace(server, '')
    .replace(/^[\s:/()\-_]+|[\s:/()\-_]+$/g, '')
    .replace(/\s*\(\s*\)\s*/g, '');
  return { server, tool: tool || call.title };
}
