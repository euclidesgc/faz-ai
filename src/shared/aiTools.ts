// O catálogo das ferramentas de IA que a extensão traz, por modo de conexão (épica "ferramenta por
// modo", história 5). É a lista fixa que a tela do Conectar vai mostrar (história 7): cada entrada diz
// os modos que a extensão oferece para a ferramenta (só os que têm driver em
// `src/extension/ai/drivers/`), os planejados, o recomendado com o motivo e a ficha de cada modo, que é o
// que a tela compara lado a lado. A ficha é dado do código, escrito por quem desenvolve a extensão.
//
// O que o board impõe em cada modo (`enforcement`) mora aqui, e não no driver, porque a webview também o
// lê (`enforcementOf`) e o código de `src/shared` não importa a extensão; o driver repete o valor daqui.
import type { AiProfile, AiProfileConfig } from './aiProfiles';
import type { ExecAspect, Enforcement } from './execution';

/** Como o board fala com a ferramenta: CLI de uma passada, Agent Client Protocol ou a API do modelo. */
export type ToolMode = 'cli' | 'acp' | 'api';
export const TOOL_MODES: readonly ToolMode[] = ['cli', 'acp', 'api'];

/** As oito linhas da ficha de um modo, na ordem em que a tela as mostra. */
export const MODE_SHEET_LINES = ['controls', 'regime', 'precision', 'consumption', 'brings', 'signIn', 'billing', 'whenToChoose'] as const;
export type ModeSheetLine = (typeof MODE_SHEET_LINES)[number];
/**
 * A ficha de um modo: o que o board controla (contexto, ferramentas, MCP, permissões), o regime de
 * admissão esperado, a precisão do que foi usado, o consumo, o que a ferramenta traz por conta própria,
 * como se entra na conta, a cobrança e quando escolher o modo.
 */
export type ModeSheet = Record<ModeSheetLine, string>;

/** O que a execução pelo board impõe por parâmetro ou protocolo (`enforced`) e o que só segue como orientação. */
export type ModeEnforcement = Record<Exclude<ExecAspect, 'context'>, Enforcement>;

export interface ToolModeEntry {
  mode: ToolMode;
  sheet: ModeSheet;
  enforcement: ModeEnforcement;
  /**
   * Na CLI que entra por um comando de login no terminal (Claude Code, Cursor, Kimi Code): o comando que a
   * instalação deixa no PATH e o do login (conferidos nas CLIs em 2026-10-13). Moram aqui, e não numa tabela
   * por `AiBase`, pelo mesmo motivo do `enforcement`: o driver os usa e a webview (o Diagnóstico) também os lê.
   * O Gemini não tem: o comando dele é o do agente do catálogo ACP, e o login é a chave de API.
   */
  cli?: { command: string; login: string };
}

/** Um modo que a épica prevê e que ainda não tem driver: a tela não mostra cartão para ele. */
export interface PlannedMode {
  mode: ToolMode;
  /** a história da épica que entrega o driver */
  story: number;
}

export interface AiToolEntry {
  /** o id da ferramenta: o do perfil do catálogo (`claude`, `cursor`, `kimi`) ou o do agente ACP (`gemini`, …) */
  id: string;
  name: string;
  /** a página oficial da ferramenta */
  docs: string;
  /** a nota de cobrança, em uma frase */
  billing: string;
  /** os modos oferecidos: só os que têm driver (o teste vigia) */
  modes: readonly ToolModeEntry[];
  /** os modos previstos e ainda sem driver; quando ganham driver, passam para `modes` */
  planned: readonly PlannedMode[];
  /**
   * O modo recomendado e o motivo, em uma frase. A regra é a mesma para toda ferramenta: o modo em que o
   * board controla mais do que o agente acessa e mede o que ele gasta; empate se desfaz pelo que a
   * ferramenta carrega por conta própria (menos é melhor). Pode ser um modo ainda planejado: o selo só
   * aparece quando ele é oferecido (`recommendedOffered`).
   */
  recommended: { mode: ToolMode; reason: string };
}

// Conforme a documentação de cada CLI lida em 2026-10-02 e o Claude Code 2.1.278 testado em 2026-10-07:
// as skills e as rules vão sempre pelo caminho do arquivo. `context` (contexto vazio) não está aqui:
// depende das capacidades verificadas de cada perfil, ver `enforcementOf`.
const CLAUDE_CLI: ModeEnforcement = { agent: 'enforced', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced' };
// Cursor CLI 2026.10.01 (spike #966): o hook global do board (`preToolUse`, `beforeMCPExecution`, `subagentStart`)
// nega na hora do uso o que não está no manifesto do card (MCP, ferramentas e subagentes). O texto do agente
// do card segue no pedido (a CLI não tem `--agents`), por isso `agent` continua orientação. Garantido só com o hook instalado e atual; sem
// ele o gateway não grava o manifesto e a execução registra o motivo (garantia parcial). As skills ficam
// como orientação: `beforeReadFile` não cobre toda leitura. O teste real é o #970.
const CURSOR_CLI: ModeEnforcement = { agent: 'advised', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced' };
// Kimi Code 2.1.1: o servidor do board entra pelo `.kimi-code/mcp.json` do projeto, materializado antes
// da execução (não há `--mcp-config`); em `-p` a permissão é sempre "auto", sem flags para estreitá-la;
// não há `--agents` inline: o agente e os subagentes seguem como orientação no prompt
const KIMI_CLI: ModeEnforcement = { agent: 'advised', skills: 'advised', mcp: 'advised', tools: 'advised', model: 'enforced' };
// Gemini CLI 0.65.0 (`gemini -p`, história 8; geminicli.com/docs/reference/configuration e o pacote instalado):
// a home isolada (`GEMINI_CLI_HOME`) leva só o `settings.json` do board, com os servidores MCP do card (cada um com
// as operações admitidas em `includeTools`) e as ferramentas da execução em `tools.core` e `tools.allowed`; o que
// fica fora não é registrado (o modelo nem o recebe). O modelo vai por `-m`. A CLI não recebe agente inline (os
// subagentes dela vêm de pastas, e o board desliga a delegação): o agente do card e as skills seguem pelo pedido
const GEMINI_CLI: ModeEnforcement = { agent: 'advised', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced' };
/**
 * Todo agente ACP: os servidores do card vão no `session/new` (garantido); o agente e as ferramentas seguem
 * como orientação no prompt (o board responde cada pedido de permissão, mas a lista não vai por parâmetro).
 */
export const ACP_ENFORCEMENT: ModeEnforcement = {
  agent: 'advised',
  skills: 'advised',
  mcp: 'enforced',
  tools: 'advised',
  model: 'advised',
};

/**
 * O modo API (épica "ferramenta por modo", história 10): o board faz o laço de chamadas de função e só
 * declara ao modelo as ferramentas que a decisão do card admite, então MCP e modelo são garantidos por
 * construção. O agente do card e as skills seguem pelo pedido (`systemInstruction`): não há descoberta
 * nativa de agente nem de skill num modelo puro.
 *
 * As ferramentas locais (história 11) seguem a regra do ACP: o board impõe o nível e as negadas do card
 * (nunca declara nem executa o que elas tiram), e a lista de ferramentas do card vai pelo pedido e pela
 * conferência, que acusa o que saiu dela. Por isso `tools` é orientação: dizer "imposto" faria o plano tirar
 * a lista do pedido e o resumo prometer uma fronteira que a decisão não traça.
 */
export const API_ENFORCEMENT: ModeEnforcement = {
  agent: 'advised',
  skills: 'advised',
  mcp: 'enforced',
  tools: 'advised',
  model: 'enforced',
};

/** A ficha de um agente pelo ACP: o protocolo é o mesmo, mudam o consumo, a entrada e a cobrança. */
function acpSheet(o: { name: string; consumption: string; signIn: string; billing: string; whenToChoose?: string }): ModeSheet {
  return {
    controls: 'MCP e permissões, pedido a pedido; o contexto o agente carrega por conta própria',
    regime: `compatível: o ${o.name} lê os próprios arquivos de instruções e a própria configuração`,
    precision: 'boa: o agente anuncia cada ferramenta e MCP que usa',
    consumption: o.consumption,
    brings: `o agente completo do ${o.name} (ferramentas, planejamento, modos)`,
    signIn: o.signIn,
    billing: o.billing,
    whenToChoose: o.whenToChoose ?? `quando se quer o agente do ${o.name} decidindo como trabalhar, com o board respondendo cada pedido`,
  };
}
const ACP_ONLY = 'É o único modo que a extensão oferece para esta ferramenta.';
const NO_USAGE = 'não medido: o agente não informa os tokens pelo ACP';
const TERMINAL_LOGIN = (command: string) => `login da própria ferramenta, no terminal (\`${command}\`)`;
// o comando e o login das CLIs prontas (eram `CLI_COMMAND` e `LOGIN_COMMAND`, por `AiBase`, até a história 13)
const CLAUDE_COMMANDS = { command: 'claude', login: 'claude auth login' };
const CURSOR_COMMANDS = { command: 'cursor-agent', login: 'cursor-agent login' };
const KIMI_COMMANDS = { command: 'kimi', login: 'kimi login' };

/**
 * As ferramentas, na ordem da tela: o Gemini primeiro (a épica começa por ele), as CLIs prontas e os
 * agentes ACP do catálogo (`ACP_READY_AGENTS`). O Cursor e o Kimi Code também têm entrada ACP em
 * `ACP_AGENTS`, mas os perfis deles são as CLIs prontas: o modo ACP deles fica fora até o teste real.
 */
export const TOOLS: readonly AiToolEntry[] = [
  {
    id: 'gemini',
    name: 'Gemini CLI',
    docs: 'https://geminicli.com/docs/',
    // desde 18/06/2026 a conta individual Google entra pelo Antigravity; o Gemini CLI segue com chave de API
    billing: 'Usa uma chave de API do Gemini: cobrança por consumo, por projeto (há um nível gratuito).',
    modes: [
      {
        mode: 'acp',
        sheet: acpSheet({
          name: 'Gemini CLI',
          consumption: 'tokens do turno (`usage`); o contexto próprio do agente também conta',
          signIn: 'chave de API do Gemini',
          billing: 'por token',
          whenToChoose: 'quando se quer o agente do próprio Gemini CLI decidindo como trabalhar',
        }),
        enforcement: ACP_ENFORCEMENT,
      },
      {
        // desde a história 11 o laço tem as ferramentas locais do board por nível: leitura em `board`, arquivos
        // em `edits`, comandos em `full`; o modo serve a toda permissão
        mode: 'api',
        sheet: {
          controls: 'tudo: contexto, ferramentas, MCP e permissões, chamada a chamada',
          regime: 'exclusivo, por construção: o board monta cada pedido e executa cada chamada',
          precision: 'exata: o inventário é a lista de chamadas que o board executou',
          consumption: 'tokens por chamada (`usageMetadata`); nada gasto com contexto que o board não pediu',
          brings:
            'só o modelo: ler, editar arquivos e rodar comandos são ferramentas do board, liberadas pela permissão do card e confinadas às pastas dele, mais as dos MCPs do card',
          signIn: 'chave de API do Gemini, guardada no cofre local',
          billing: 'por token',
          whenToChoose:
            'para a finalidade do board: prever o acesso e gastar só o pedido, em Refinar, Resumir e Trabalhar na fase, com qualquer permissão',
        },
        enforcement: API_ENFORCEMENT,
      },
      {
        mode: 'cli',
        sheet: {
          controls: 'MCP e ferramentas pelo settings da home isolada; a aprovação por nível; o contexto do projeto o Gemini carrega',
          regime: 'exclusivo se as sondas passarem; senão compatível (a 0.65.0 lê o GEMINI.md do projeto)',
          precision: 'boa: `tool_use` e `tool_result` no `stream-json`',
          consumption: 'tokens por modelo (`result.stats`); o contexto próprio do projeto conta',
          brings: 'o agente completo do Gemini CLI, numa passada',
          signIn: 'chave de API do Gemini (cofre, no ambiente da execução)',
          billing: 'por token',
          whenToChoose: 'quando se quer o Gemini CLI numa passada, com o board fixando as ferramentas e os servidores MCP',
        },
        enforcement: GEMINI_CLI,
      },
    ],
    planned: [],
    recommended: {
      mode: 'api',
      reason: 'É o único modo em que o board sabe de antemão tudo o que o agente pode acessar e paga só pelo que pediu.',
    },
  },
  {
    id: 'claude',
    name: 'Claude Code',
    docs: 'https://code.claude.com/docs/en/setup',
    billing: 'Usa a sua assinatura do Claude (Pro ou Max). Com uma chave de API da Anthropic, o uso é cobrado à parte, por consumo.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'agente, ferramentas e MCP por parâmetros da linha de comando, no modo estrito',
          regime: 'exclusivo quando as sondas do verificador provam o isolamento; senão compatível',
          precision: 'boa: cada ferramenta e MCP no `stream-json` da CLI',
          consumption: 'custo e tokens por execução, informados pela CLI',
          brings: 'o agente completo do Claude Code, numa passada',
          signIn: TERMINAL_LOGIN(CLAUDE_COMMANDS.login),
          billing: 'assinatura do Claude',
          whenToChoose: 'é o único modo do Claude Code: o ACP dele exige cobrança por API, fora da assinatura',
        },
        enforcement: CLAUDE_CLI,
        cli: CLAUDE_COMMANDS,
      },
    ],
    planned: [],
    recommended: { mode: 'cli', reason: 'É o único modo que usa a assinatura: o ACP do Claude exige cobrança por API.' },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    docs: 'https://cursor.com/docs/cli/installation',
    billing: 'Usa o plano da sua conta do Cursor.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'MCP, ferramentas e subagentes pelo hook do board, na hora do uso; o agente do card segue pelo pedido',
          regime: 'compatível: a CLI do Cursor ainda não tem sonda de capacidades',
          precision: 'boa: ferramentas e MCP no `stream-json` da CLI',
          consumption: 'tokens por execução, informados pela CLI',
          brings: 'o agente completo do Cursor, numa passada',
          signIn: TERMINAL_LOGIN(CURSOR_COMMANDS.login),
          billing: 'plano do Cursor',
          whenToChoose: 'é o modo pronto do Cursor; o ACP dele fica para depois do teste real',
        },
        enforcement: CURSOR_CLI,
        cli: CURSOR_COMMANDS,
      },
    ],
    planned: [],
    recommended: { mode: 'cli', reason: 'É o modo que a extensão traz pronto para o Cursor, com o hook que nega o que o card não libera.' },
  },
  {
    id: 'kimi',
    name: 'Kimi Code',
    docs: 'https://www.kimi.com/code/docs/en/',
    billing: 'Usa a sua conta do Kimi Code.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'o modelo; agente, ferramentas e MCP seguem como orientação no pedido',
          regime: 'compatível: a CLI do Kimi Code ainda não tem sonda de capacidades',
          precision: 'boa: ferramentas e MCP na saída `stream-json` da CLI',
          consumption: 'tokens por execução, informados pela CLI',
          brings: 'o agente completo do Kimi Code, numa passada, com a permissão sempre automática',
          signIn: TERMINAL_LOGIN(KIMI_COMMANDS.login),
          billing: 'conta do Kimi Code',
          whenToChoose: 'é o modo pronto do Kimi Code; o ACP dele fica para depois do teste real',
        },
        enforcement: KIMI_CLI,
        cli: KIMI_COMMANDS,
      },
    ],
    planned: [],
    recommended: { mode: 'cli', reason: 'É o modo que a extensão traz pronto para o Kimi Code e que mede os tokens.' },
  },
  ...(
    [
      {
        id: 'codex-acp',
        name: 'Codex',
        docs: 'https://github.com/agentclientprotocol/codex-acp',
        consumption: 'tokens do último pedido do turno',
      },
      { id: 'opencode', name: 'OpenCode', docs: 'https://opencode.ai/v2/docs/cli/acp/', consumption: 'tokens e custo do turno' },
      {
        id: 'github-copilot-cli',
        name: 'GitHub Copilot CLI',
        docs: 'https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/',
        consumption: NO_USAGE,
      },
      { id: 'qwen-code', name: 'Qwen Code', docs: 'https://qwenlm.github.io/qwen-code-docs/', consumption: NO_USAGE },
      { id: 'goose', name: 'goose', docs: 'https://block.github.io/goose/docs/guides/acp-clients', consumption: NO_USAGE },
      { id: 'antigravity-acp', name: 'Google Antigravity', docs: 'https://antigravity.google/docs/ide/extensions', consumption: NO_USAGE },
    ] as const
  ).map((a): AiToolEntry => ({
    id: a.id,
    name: a.name,
    docs: a.docs,
    billing: 'Usa a conta da própria ferramenta; a cobrança está na página oficial dela.',
    modes: [
      {
        mode: 'acp',
        sheet: acpSheet({
          name: a.name,
          consumption: a.consumption,
          signIn: 'login da própria ferramenta, pelo protocolo ou no terminal',
          billing: 'da conta da ferramenta',
        }),
        enforcement: ACP_ENFORCEMENT,
      },
    ],
    planned: [],
    recommended: { mode: 'acp', reason: ACP_ONLY },
  })),
];

/**
 * As ferramentas do catálogo que entram por uma chave de API guardada no cofre do board: o Conectar confere e guarda a
 * chave, e cada execução a entrega à ferramenta. Hoje só o Gemini, nos três modos (o teste confere com os drivers).
 */
export const VAULT_KEY_TOOLS: readonly string[] = ['gemini'];

export const toolEntry = (id: string): AiToolEntry | undefined => TOOLS.find((t) => t.id === id);
/** O modo oferecido de uma ferramenta; undefined quando ela não o oferece (planejado, ou sem entrada). */
export const toolModeEntry = (tool: string, mode: ToolMode): ToolModeEntry | undefined =>
  toolEntry(tool)?.modes.find((m) => m.mode === mode);
/** O modo recomendado, só quando ele é oferecido: é a regra do selo da tela. */
export function recommendedOffered(entry: AiToolEntry): ToolMode | null {
  return entry.modes.some((m) => m.mode === entry.recommended.mode) ? entry.recommended.mode : null;
}

/**
 * A ferramenta e o modo do driver de um perfil, lidos dos campos `tool` e `mode` (história 4). O resultado é
 * o mesmo do adaptador que a história 5 derivava de `base` e `config.acpAgent`:
 *
 * - perfil do catálogo (CLI pronta, cópia dela, agente ACP pronto): `(tool, mode)`; na cópia, `tool` já é a
 *   base, a ferramenta do catálogo de modelos (`catalogTool`);
 * - personalizado ACP: `(acpAgent, 'acp')`. O `tool` dele é o id do perfil (a chave do catálogo de modelos,
 *   que não muda), mas o driver é o do agente do catálogo ACP que ele roda;
 * - CLI personalizada: null, sem driver (é o caminho avançado, que segue pelo provider genérico).
 */
export function toolModeOf(profile: Pick<AiProfile, 'kind' | 'tool' | 'mode'> & { config?: AiProfileConfig }): {
  tool: string;
  mode: ToolMode;
} | null {
  if (profile.kind === 'catalog') return profile.tool ? { tool: profile.tool, mode: profile.mode } : null;
  const agent = profile.config?.acpAgent;
  return profile.mode === 'acp' && typeof agent === 'string' ? { tool: agent, mode: 'acp' } : null;
}
