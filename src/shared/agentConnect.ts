// Conectar agentes: os tipos que a tela e o host trocam sobre os agentes de IA (Claude Code, Codex, Gemini…),
// a conta de cada um e a sessão de teste pelo SDK oficial do ACP (`@agentclientprotocol/sdk`). Ficam aqui, sem
// o SDK, porque a webview não importa nada do host; o host converte o que o agente manda (`session/update`,
// `session/request_permission`) para estas formas simples.
import type { AiProfile } from './aiProfiles';

/** Como o registro oficial do ACP distribui o agente. */
export type RegistryDistribution = 'npx' | 'binary' | 'uvx';

/** Uma entrada do registro oficial do ACP, já resolvida para esta máquina. */
export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  /** endereço do ícone SVG do registro, quando houver */
  icon: string | null;
  /** página do agente (site ou repositório) */
  url: string | null;
  distribution: RegistryDistribution;
  /** o executável que o board roda (`npx`, o binário achado no PATH ou o comando do registro) */
  command: string;
  args: string[];
  /** variáveis que o registro pede para o processo (desligar a autoatualização, por exemplo) */
  env: Record<string, string>;
  /** o board consegue iniciar o agente nesta máquina (npx/uvx achado, ou o binário no PATH) */
  available: boolean;
  /** por que não está disponível, ou o que a pessoa precisa saber para iniciar */
  note: string | null;
}

/** O registro como o host o tem: a lista, quando foi baixada e o erro da última tentativa (a lista pode ser a anterior). */
export interface RegistryListing {
  agents: RegistryAgent[];
  /** quando a lista foi baixada (epoch ms); null quando nunca deu */
  fetchedAt: number | null;
  /** a última tentativa falhou: a lista mostrada é a guardada antes, se houver */
  error: string | null;
}

/** Como o board inicia um agente pelo ACP: o executável, os argumentos e o ambiente. */
export interface AgentLaunch {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentAuthMethod {
  id: string;
  name: string;
  description: string | null;
  /** `terminal`: o login roda num terminal; `agent`: o próprio agente faz o login (abre o navegador, por exemplo) */
  type: 'agent' | 'terminal';
  /** no `terminal`, a linha de comando que abre o login (do `_meta.terminal-auth` ou o agente com os `args`) */
  terminalCommand: string | null;
  /** o método recebe uma chave de API (`_meta.api-key`), mandada no `authenticate` */
  apiKey: boolean;
}

/**
 * Uma opção da sessão que o agente declara (`configOptions`): modelo, esforço, raciocínio, velocidade, modo…
 * Cada agente tem as suas; a sessão de teste mostra todas, pela categoria e pelo tipo.
 */
export interface AgentConfigOption {
  id: string;
  name: string;
  description: string | null;
  /** `mode`, `model`, `model_config`, `thought_level` ou outra que o agente invente */
  category: string | null;
  type: 'select' | 'boolean';
  current: string | boolean;
  /** só no `select`; `group` é o nome do grupo quando o agente agrupa as opções */
  options: { value: string; name: string; description: string | null; group: string | null }[];
}

/**
 * A conta que o agente diz estar usando. Vem do `_auth/status_update`, uma extensão do adaptador do Claude
 * (fora do protocolo padrão), ou do status da CLI (`claude auth status`, `cursor-agent status`).
 */
export interface AgentAccountInfo {
  /** `account`, `api_key`, `gateway`, `external` ou `none` (sem login) */
  kind: string;
  /** o tipo, pronto para a tela: "Claude Max", "Anthropic API key", "Not logged in" */
  label: string;
  /** a segunda linha: o e-mail da conta, a origem da chave ou o endereço do gateway */
  detail: string | null;
}

/** A situação da conta de um agente na tela de Conectar agentes. */
export type AccountStatus = 'checking' | 'signed-in' | 'signed-out' | 'unknown' | 'error';

/**
 * O que o board sabe da conta de um agente: se há login, qual conta, como entrar e se dá para sair. Vem de uma
 * verificação curta (a sonda da CLI, ou `initialize` e `session/new` pelo ACP, sem pedido), não de um processo
 * que fica aberto.
 */
export interface AgentAccount {
  status: AccountStatus;
  /** a conta, como a ferramenta informa ("Claude Max · pessoa@exemplo.com"); null quando ela não diz */
  label: string | null;
  /** como entrar: os métodos que o agente anuncia, ou o comando de login da CLI */
  methods: AgentAuthMethod[];
  /** dá para sair da conta por aqui: o agente anuncia `auth.logout`, ou a CLI tem o comando */
  canLogout: boolean;
  /** a versão que a ferramenta informou na verificação */
  version: string | null;
  /** o login em curso (o id do método): no terminal, até ele fechar; no agente, até o `authenticate` voltar */
  loggingIn: string | null;
  /** o motivo, em português, quando a verificação ou o login falhou */
  error: string | null;
  /** quando a verificação terminou (epoch ms) */
  checkedAt: number | null;
}

export const ACCOUNT_UNCHECKED: AgentAccount = {
  status: 'unknown',
  label: null,
  methods: [],
  canLogout: false,
  version: null,
  loggingIn: null,
  error: null,
  checkedAt: null,
};

/** Na tela, o agente vem de um perfil do board ou só do registro: a chave estável de cada um. */
export const registryKey = (id: string): string => `registry:${id}`;

/** O id no registro oficial do ACP dos perfis cujo id difere: o Claude Code é o "Claude Agent" (`claude-acp`). */
const REGISTRY_ALIASES: Readonly<Record<string, string>> = { claude: 'claude-acp' };

/**
 * O agente do registro oficial que corresponde a um perfil do board, para a tela mostrar o ícone, a descrição
 * e a versão publicada: o agente ACP do perfil, ou a ferramenta do catálogo (a cópia é da ferramenta de origem).
 * O personalizado não tem.
 */
export function registryIdOf(profile: Pick<AiProfile, 'kind' | 'tool' | 'config'>): string | null {
  if (typeof profile.config.acpAgent === 'string') return profile.config.acpAgent;
  if (profile.kind === 'custom') return null;
  return REGISTRY_ALIASES[profile.tool] ?? profile.tool;
}

/** Um agente na lista da tela: o perfil do board (o que executa os cards) e a entrada do registro, quando há. */
export interface AgentListItem {
  /** o id do perfil, ou `registry:<id>` no agente que só existe no registro */
  key: string;
  /** null no agente do registro que o board ainda não executa: dá para testar, não para usar nos cards */
  profile: AiProfile | null;
  registry: RegistryAgent | null;
  name: string;
  icon: string | null;
  /** é o agente que o board usa quando o card não escolhe outro (`board.aiTool`) */
  inUse: boolean;
}

/**
 * A lista da tela: os agentes do board primeiro (o em uso, depois os ligados, depois os desligados, cada grupo
 * na ordem dos perfis) e, à parte, os agentes do registro que nenhum perfil cobre, por nome.
 */
export function agentList(
  profiles: readonly AiProfile[],
  registry: readonly RegistryAgent[] | null,
  inUse: string,
): { board: AgentListItem[]; others: AgentListItem[] } {
  const byId = new Map((registry ?? []).map((a) => [a.id, a]));
  const covered = new Set<string>();
  const rank = (p: AiProfile) => (p.id === inUse ? 0 : p.enabled ? 1 : 2);
  const board = [...profiles]
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position)
    .map((profile): AgentListItem => {
      const id = registryIdOf(profile);
      const entry = id ? (byId.get(id) ?? null) : null;
      if (entry) covered.add(entry.id);
      return { key: profile.id, profile, registry: entry, name: profile.name, icon: entry?.icon ?? null, inUse: profile.id === inUse };
    });
  const others = (registry ?? [])
    .filter((a) => !covered.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a): AgentListItem => ({ key: registryKey(a.id), profile: null, registry: a, name: a.name, icon: a.icon, inUse: false }));
  return { board, others };
}

/** O resultado do `initialize` e do `session/new` da sessão de teste, para a tela mostrar o que o agente declarou. */
export interface TestConnection {
  /** o agente na tela (`AgentListItem.key`) */
  key: string;
  agent: AgentLaunch;
  cwd: string;
  protocolVersion: number;
  /** nome e versão que o próprio agente informou (`agentInfo`), quando informou */
  agentInfo: { name: string; version: string } | null;
  /** as capacidades declaradas, em rótulos curtos (`loadSession`, `imagens`, `MCP http`…) */
  capabilities: string[];
  authMethods: AgentAuthMethod[];
  /** o agente aceita `logout` (`agentCapabilities.auth.logout`) */
  canLogout: boolean;
  /** null quando o agente recusou a sessão por falta de login (`auth_required`) */
  sessionId: string | null;
  modes: { id: string; name: string }[];
  currentModeId: string | null;
  configOptions: AgentConfigOption[];
  /** null enquanto o agente não informou a conta (ou quando não informa) */
  account: AgentAccountInfo | null;
}

export type TestPhase = 'idle' | 'connecting' | 'connected' | 'needs-auth' | 'prompting' | 'error';

export interface TestState {
  phase: TestPhase;
  connection: TestConnection | null;
  error: string | null;
}

export const TEST_IDLE: TestState = { phase: 'idle', connection: null, error: null };

/** Um evento da sessão de teste, na ordem em que o agente mandou. */
export type TestEvent =
  | { kind: 'prompt'; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'thought'; text: string }
  | { kind: 'tool'; toolCallId: string; title: string; status: string; toolKind: string | null }
  | { kind: 'plan'; entries: { content: string; status: string }[] }
  | { kind: 'permission'; permissionId: string; title: string; options: { optionId: string; name: string; kind: string }[] }
  | { kind: 'permission-answer'; permissionId: string; choice: string }
  | { kind: 'mode'; modeId: string }
  | { kind: 'usage'; used: number; size: number }
  | { kind: 'update'; name: string }
  | { kind: 'stderr'; text: string }
  | { kind: 'end'; stopReason: string }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number | null }
  | { kind: 'closed'; reason: string };

/** Um item da sessão de teste, já juntado: os pedaços de texto seguidos viram um só, e cada ferramenta, uma linha. */
export type TestItem =
  | { kind: 'prompt'; text: string }
  | { kind: 'message'; text: string }
  | { kind: 'thought'; text: string }
  | { kind: 'tool'; toolCallId: string; title: string; status: string; toolKind: string | null }
  | { kind: 'plan'; entries: { content: string; status: string }[] }
  | {
      kind: 'permission';
      permissionId: string;
      title: string;
      options: { optionId: string; name: string; kind: string }[];
      answer: string | null;
    }
  /** `translate`: o texto é do board (o fechamento da sessão), e a tela o traduz; o resto vem do agente, como veio */
  | { kind: 'note'; text: string; tone: 'muted' | 'error'; translate?: true }
  | { kind: 'end'; stopReason: string };

/** Junta um evento à conversa. Não muda a lista recebida: devolve uma nova. */
export function appendTestEvent(items: TestItem[], ev: TestEvent): TestItem[] {
  const last = items[items.length - 1];
  switch (ev.kind) {
    case 'message':
    case 'thought':
      if (last?.kind === ev.kind) return [...items.slice(0, -1), { kind: ev.kind, text: last.text + ev.text }];
      return [...items, { kind: ev.kind, text: ev.text }];
    case 'tool': {
      const at = items.findIndex((i) => i.kind === 'tool' && i.toolCallId === ev.toolCallId);
      if (at < 0) return [...items, { ...ev }];
      const prev = items[at] as Extract<TestItem, { kind: 'tool' }>;
      // a atualização só traz o que mudou: título e tipo vazios mantêm os de antes
      const next = { ...prev, status: ev.status || prev.status, title: ev.title || prev.title, toolKind: ev.toolKind ?? prev.toolKind };
      return items.map((i, n) => (n === at ? next : i));
    }
    case 'plan': {
      // o plano chega inteiro a cada mudança: substitui o anterior no lugar
      const at = items.findIndex((i) => i.kind === 'plan');
      return at < 0
        ? [...items, { kind: 'plan', entries: ev.entries }]
        : items.map((i, n) => (n === at ? { kind: 'plan', entries: ev.entries } : i));
    }
    case 'permission':
      return [...items, { kind: 'permission', permissionId: ev.permissionId, title: ev.title, options: ev.options, answer: null }];
    case 'permission-answer':
      return items.map((i) => (i.kind === 'permission' && i.permissionId === ev.permissionId ? { ...i, answer: ev.choice } : i));
    case 'prompt':
      return [...items, { kind: 'prompt', text: ev.text }];
    case 'end':
      return [...items, { kind: 'end', stopReason: ev.stopReason }];
    case 'mode':
      return [...items, { kind: 'note', text: `modo: ${ev.modeId}`, tone: 'muted' }];
    case 'update':
      return [...items, { kind: 'note', text: ev.name, tone: 'muted' }];
    case 'stderr':
      return [...items, { kind: 'note', text: ev.text, tone: 'muted' }];
    case 'error':
      return [...items, { kind: 'note', text: ev.message, tone: 'error' }];
    case 'exit':
      return [...items, { kind: 'note', text: `processo encerrado (código ${ev.code ?? '?'})`, tone: 'muted' }];
    case 'closed':
      return [...items, { kind: 'note', text: ev.reason, tone: 'muted', translate: true }];
    case 'usage':
      return items;
  }
}

/**
 * Uma linha do log do protocolo: uma mensagem JSON-RPC trocada com o agente (`out` = do board para o agente,
 * `in` = do agente para o board) ou um fato do processo (início, saída). A resposta traz o método e o tempo
 * do pedido que ela responde.
 */
export interface ProtocolLogEntry {
  seq: number;
  /** horário, em ms desde a época */
  at: number;
  dir: 'out' | 'in' | 'process';
  /** `stderr`: uma linha que o agente escreveu fora do protocolo (avisos, tentativas, erros do provedor) */
  kind: 'request' | 'response' | 'error' | 'notification' | 'process' | 'stderr';
  method: string | null;
  id: string | number | null;
  /** tempo entre o pedido e a resposta, só nas respostas */
  ms: number | null;
  /** o que a linha diz em poucas palavras (o tipo do `session/update`, o `stopReason`, o código do erro) */
  summary: string;
  /** a mensagem inteira em JSON, cortada se for enorme */
  json: string;
}
