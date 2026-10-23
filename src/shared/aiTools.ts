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
    billing: 'Chave de API do Gemini: cobrança por token, por projeto (há um nível gratuito).',
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
    ],
    planned: [
      { mode: 'cli', story: 8 },
      { mode: 'api', story: 10 },
    ],
    recommended: {
      mode: 'api',
      reason: 'É o único modo em que o board sabe de antemão tudo o que o agente pode acessar e paga só pelo que pediu.',
    },
  },
  {
    id: 'claude',
    name: 'Claude Code',
    docs: 'https://code.claude.com/docs/en/setup',
    billing: 'Assinatura do Claude pela CLI; uma chave de API da Anthropic é cobrança por token, fora da assinatura.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'agente, ferramentas e MCP por parâmetros da linha de comando, no modo estrito',
          regime: 'exclusivo quando as sondas do verificador provam o isolamento; senão compatível',
          precision: 'boa: cada ferramenta e MCP no `stream-json` da CLI',
          consumption: 'custo e tokens por execução, informados pela CLI',
          brings: 'o agente completo do Claude Code, numa passada',
          signIn: TERMINAL_LOGIN('claude auth login'),
          billing: 'assinatura do Claude',
          whenToChoose: 'é o único modo do Claude Code: o ACP dele exige cobrança por API, fora da assinatura',
        },
        enforcement: CLAUDE_CLI,
      },
    ],
    planned: [],
    recommended: { mode: 'cli', reason: 'É o único modo que usa a assinatura: o ACP do Claude exige cobrança por API.' },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    docs: 'https://cursor.com/docs/cli/installation',
    billing: 'Plano da conta do Cursor.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'MCP, ferramentas e subagentes pelo hook do board, na hora do uso; o agente do card segue pelo pedido',
          regime: 'compatível: a CLI do Cursor ainda não tem sonda de capacidades',
          precision: 'boa: ferramentas e MCP no `stream-json` da CLI',
          consumption: 'tokens por execução, informados pela CLI',
          brings: 'o agente completo do Cursor, numa passada',
          signIn: TERMINAL_LOGIN('cursor-agent login'),
          billing: 'plano do Cursor',
          whenToChoose: 'é o modo pronto do Cursor; o ACP dele fica para depois do teste real',
        },
        enforcement: CURSOR_CLI,
      },
    ],
    planned: [],
    recommended: { mode: 'cli', reason: 'É o modo que a extensão traz pronto para o Cursor, com o hook que nega o que o card não libera.' },
  },
  {
    id: 'kimi',
    name: 'Kimi Code',
    docs: 'https://www.kimi.com/code/docs/en/',
    billing: 'Conta do Kimi Code.',
    modes: [
      {
        mode: 'cli',
        sheet: {
          controls: 'o modelo; agente, ferramentas e MCP seguem como orientação no pedido',
          regime: 'compatível: a CLI do Kimi Code ainda não tem sonda de capacidades',
          precision: 'boa: ferramentas e MCP na saída `stream-json` da CLI',
          consumption: 'tokens por execução, informados pela CLI',
          brings: 'o agente completo do Kimi Code, numa passada, com a permissão sempre automática',
          signIn: TERMINAL_LOGIN('kimi login'),
          billing: 'conta do Kimi Code',
          whenToChoose: 'é o modo pronto do Kimi Code; o ACP dele fica para depois do teste real',
        },
        enforcement: KIMI_CLI,
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
    billing: 'A da conta da própria ferramenta; confira na página oficial.',
    modes: [
      {
        mode: 'acp',
        sheet: acpSheet({
          name: a.name,
          consumption: a.consumption,
          signIn: 'login da própria ferramenta, pelo protocolo ou no terminal',
          billing: 'a da conta da ferramenta',
        }),
        enforcement: ACP_ENFORCEMENT,
      },
    ],
    planned: [],
    recommended: { mode: 'acp', reason: ACP_ONLY },
  })),
];

export const toolEntry = (id: string): AiToolEntry | undefined => TOOLS.find((t) => t.id === id);
/** O modo oferecido de uma ferramenta; undefined quando ela não o oferece (planejado, ou sem entrada). */
export const toolModeEntry = (tool: string, mode: ToolMode): ToolModeEntry | undefined =>
  toolEntry(tool)?.modes.find((m) => m.mode === mode);
/** O modo recomendado, só quando ele é oferecido: é a regra do selo da tela. */
export function recommendedOffered(entry: AiToolEntry): ToolMode | null {
  return entry.modes.some((m) => m.mode === entry.recommended.mode) ? entry.recommended.mode : null;
}

/**
 * ADAPTADOR TEMPORÁRIO: a ferramenta e o modo de um perfil, derivados dos campos de hoje (`base`,
 * `config.acpAgent`). A história 4 da épica dá ao perfil os campos `tool` e `mode`; quando ela entrar,
 * esta função passa a devolvê-los e os chamadores não mudam.
 *
 * - agente ACP (o pronto e o personalizado com `acpAgent`): `(acpAgent, 'acp')`; o personalizado usa o
 *   agente do catálogo como ferramenta (o driver é o dele), não o id do perfil;
 * - CLI pronta e cópia dela: `(base, 'cli')`, a ferramenta do catálogo de modelos (`catalogTool`);
 * - CLI personalizada: null, sem driver (é o caminho avançado, que segue pelo provider genérico).
 */
export function toolModeOf(profile: Pick<AiProfile, 'kind' | 'base'> & { config?: AiProfileConfig }): {
  tool: string;
  mode: ToolMode;
} | null {
  // a mesma regra de `isAcpProfile`, que decide o transporte no gateway: perfil genérico com `acpAgent`
  // (o pronto do tipo `acp` traz o dele em `config`, também na leitura pública)
  const agent = profile.config?.acpAgent;
  if (profile.base === 'generic') return typeof agent === 'string' ? { tool: agent, mode: 'acp' } : null;
  return { tool: profile.base, mode: 'cli' };
}
