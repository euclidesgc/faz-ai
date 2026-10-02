import type { AiTool, HarnessKind } from './harness';

/**
 * Onde cada ferramenta guarda o que carrega, no projeto e na pasta do usuário, conforme a
 * documentação de cada uma lida em 2026-10-02:
 * - Claude Code: code.claude.com/docs (memory, skills, sub-agents, hooks-guide, mcp, settings, plugins)
 * - Codex: learn.chatgpt.com/docs (build-skills, agent-configuration, hooks, extend/mcp, plugins, config-file)
 * - Cursor: cursor.com/docs (rules, skills, subagents, hooks, mcp, plugins, cli/reference/configuration)
 * - Kimi Code: kimi.com/code/docs/en/kimi-code-cli (customization/*, configuration/*)
 * - GitHub Copilot: docs.github.com/copilot e code.visualstudio.com/docs/copilot/customization
 *
 * A varredura e a tela são genéricas sobre esta tabela: mudar um caminho é mudar um dado aqui.
 */
export type HarnessSource = { kind: HarnessKind; scope: 'project' | 'user'; path: string; /** rótulo de origem para itens que vêm com a ferramenta */ builtin?: string; /** extensão dos arquivos novos, quando difere da que é listada */ createExt?: string } & (
  | { layout: 'file' }
  /** todos os arquivos da pasta (e subpastas) com a extensão */
  | { layout: 'files'; ext: string }
  /** pastas `<nome>/SKILL.md` */
  | { layout: 'skills' }
  /** um item por chave do objeto `key` de um arquivo JSON */
  | { layout: 'json-keys'; key: string }
  /** servidores MCP no ~/.claude.json: os globais e os gravados para esta pasta de projeto */
  | { layout: 'claude-json' }
  /** tabelas `[<table>.<nome>]` de um arquivo TOML */
  | { layout: 'toml-tables'; table: string }
  /** entradas `[[<table>]]` de um arquivo TOML */
  | { layout: 'toml-array'; table: string }
  /** pasta de arquivos JSON, cada um com um objeto `hooks` */
  | { layout: 'hook-files' }
  /** regras de permissão: as listas (`allow`, `deny`…) do objeto `permissions` de um arquivo JSON */
  | { layout: 'json-permissions'; lists: string[] }
);

type Src = HarnessSource;
const both = (kind: HarnessKind, layout: 'skills', paths: [project: string[], user: string[]]): Src[] => [
  ...paths[0].map((path): Src => ({ kind, scope: 'project', layout, path })),
  ...paths[1].map((path): Src => ({ kind, scope: 'user', layout, path })),
];
const files = (kind: HarnessKind, scope: 'project' | 'user', path: string, ext: string): Src => ({ kind, scope, layout: 'files', path, ext });
const file = (kind: HarnessKind, scope: 'project' | 'user', path: string): Src => ({ kind, scope, layout: 'file', path });

export const HARNESS_CATALOG: Record<AiTool, HarnessSource[]> = {
  claude: [
    file('instructions', 'project', 'CLAUDE.md'),
    file('instructions', 'project', '.claude/CLAUDE.md'),
    file('instructions', 'project', 'CLAUDE.local.md'),
    files('instructions', 'project', '.claude/rules', '.md'),
    file('instructions', 'user', '.claude/CLAUDE.md'),
    files('instructions', 'user', '.claude/rules', '.md'),
    ...both('skill', 'skills', [['.claude/skills'], ['.claude/skills']]),
    files('agent', 'project', '.claude/agents', '.md'),
    files('agent', 'user', '.claude/agents', '.md'),
    files('command', 'project', '.claude/commands', '.md'),
    files('command', 'user', '.claude/commands', '.md'),
    { kind: 'hook', scope: 'project', layout: 'json-keys', path: '.claude/settings.json', key: 'hooks' },
    { kind: 'hook', scope: 'project', layout: 'json-keys', path: '.claude/settings.local.json', key: 'hooks' },
    { kind: 'hook', scope: 'user', layout: 'json-keys', path: '.claude/settings.json', key: 'hooks' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.mcp.json', key: 'mcpServers' },
    { kind: 'mcp', scope: 'user', layout: 'claude-json', path: '.claude.json' },
    file('settings', 'project', '.claude/settings.json'),
    file('settings', 'project', '.claude/settings.local.json'),
    { kind: 'settings', scope: 'project', layout: 'json-permissions', path: '.claude/settings.json', lists: ['allow', 'ask', 'deny'] },
    { kind: 'settings', scope: 'project', layout: 'json-permissions', path: '.claude/settings.local.json', lists: ['allow', 'ask', 'deny'] },
    { kind: 'settings', scope: 'user', layout: 'json-permissions', path: '.claude/settings.json', lists: ['allow', 'ask', 'deny'] },
    files('settings', 'project', '.claude/output-styles', '.md'),
    file('settings', 'user', '.claude/settings.json'),
    files('settings', 'user', '.claude/output-styles', '.md'),
  ],
  codex: [
    file('instructions', 'project', 'AGENTS.md'),
    file('instructions', 'project', 'AGENTS.override.md'),
    file('instructions', 'user', '.codex/AGENTS.md'),
    file('instructions', 'user', '.codex/AGENTS.override.md'),
    ...both('skill', 'skills', [['.agents/skills'], ['.agents/skills', '.codex/skills']]),
    { kind: 'skill', scope: 'user', layout: 'skills', path: '.codex/skills/.system', builtin: 'Codex (embutidas)' },
    files('agent', 'project', '.codex/agents', '.toml'),
    files('agent', 'user', '.codex/agents', '.toml'),
    files('command', 'user', '.codex/prompts', '.md'),
    { kind: 'hook', scope: 'project', layout: 'json-keys', path: '.codex/hooks.json', key: 'hooks' },
    { kind: 'hook', scope: 'user', layout: 'json-keys', path: '.codex/hooks.json', key: 'hooks' },
    { kind: 'mcp', scope: 'project', layout: 'toml-tables', path: '.codex/config.toml', table: 'mcp_servers' },
    { kind: 'mcp', scope: 'user', layout: 'toml-tables', path: '.codex/config.toml', table: 'mcp_servers' },
    file('settings', 'project', '.codex/config.toml'),
    files('settings', 'project', '.codex/rules', '.rules'),
    file('settings', 'user', '.codex/config.toml'),
    files('settings', 'user', '.codex/rules', '.rules'),
  ],
  cursor: [
    file('instructions', 'project', 'AGENTS.md'),
    files('instructions', 'project', '.cursor/rules', '.mdc'),
    ...both('skill', 'skills', [['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'], ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills']]),
    files('agent', 'project', '.cursor/agents', '.md'),
    files('agent', 'project', '.claude/agents', '.md'),
    files('agent', 'user', '.cursor/agents', '.md'),
    files('agent', 'user', '.claude/agents', '.md'),
    files('command', 'project', '.cursor/commands', '.md'),
    { kind: 'hook', scope: 'project', layout: 'json-keys', path: '.cursor/hooks.json', key: 'hooks' },
    { kind: 'hook', scope: 'user', layout: 'json-keys', path: '.cursor/hooks.json', key: 'hooks' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.cursor/mcp.json', key: 'mcpServers' },
    { kind: 'mcp', scope: 'user', layout: 'json-keys', path: '.cursor/mcp.json', key: 'mcpServers' },
    file('settings', 'project', '.cursor/cli.json'),
    file('settings', 'user', '.cursor/cli-config.json'),
    { kind: 'settings', scope: 'project', layout: 'json-permissions', path: '.cursor/cli.json', lists: ['allow', 'deny'] },
    { kind: 'settings', scope: 'user', layout: 'json-permissions', path: '.cursor/cli-config.json', lists: ['allow', 'deny'] },
  ],
  kimi: [
    file('instructions', 'project', 'AGENTS.md'),
    file('instructions', 'project', '.kimi-code/AGENTS.md'),
    file('instructions', 'user', '.kimi-code/AGENTS.md'),
    file('instructions', 'user', '.agents/AGENTS.md'),
    file('instructions', 'user', '.kimi-code/SYSTEM.md'),
    // .kimi/skills é a pasta da Kimi CLI antiga; o Kimi Code atual lê .kimi-code/skills e .agents/skills
    ...both('skill', 'skills', [['.kimi-code/skills', '.agents/skills', '.kimi/skills'], ['.kimi-code/skills', '.agents/skills']]),
    files('agent', 'project', '.kimi-code/agents', '.md'),
    files('agent', 'project', '.agents/agents', '.md'),
    files('agent', 'user', '.kimi-code/agents', '.md'),
    files('agent', 'user', '.agents/agents', '.md'),
    { kind: 'hook', scope: 'user', layout: 'toml-array', path: '.kimi-code/config.toml', table: 'hooks' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.kimi-code/mcp.json', key: 'mcpServers' },
    { kind: 'mcp', scope: 'user', layout: 'json-keys', path: '.kimi-code/mcp.json', key: 'mcpServers' },
    file('settings', 'project', '.kimi-code/local.toml'),
    file('settings', 'user', '.kimi-code/config.toml'),
  ],
  copilot: [
    file('instructions', 'project', 'AGENTS.md'),
    file('instructions', 'project', '.github/copilot-instructions.md'),
    files('instructions', 'project', '.github/instructions', '.instructions.md'),
    file('instructions', 'user', '.copilot/copilot-instructions.md'),
    files('instructions', 'user', '.copilot/instructions', '.instructions.md'),
    ...both('skill', 'skills', [['.github/skills', '.claude/skills', '.agents/skills'], ['.copilot/skills', '.agents/skills']]),
    { ...files('agent', 'project', '.github/agents', '.md'), createExt: '.agent.md' },
    { ...files('agent', 'user', '.copilot/agents', '.md'), createExt: '.agent.md' },
    files('command', 'project', '.github/prompts', '.prompt.md'),
    { kind: 'hook', scope: 'project', layout: 'hook-files', path: '.github/hooks' },
    { kind: 'hook', scope: 'user', layout: 'hook-files', path: '.copilot/hooks' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.vscode/mcp.json', key: 'servers' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.mcp.json', key: 'mcpServers' },
    { kind: 'mcp', scope: 'project', layout: 'json-keys', path: '.github/mcp.json', key: 'mcpServers' },
    { kind: 'mcp', scope: 'user', layout: 'json-keys', path: '.copilot/mcp-config.json', key: 'mcpServers' },
    file('settings', 'project', '.github/copilot/settings.json'),
    file('settings', 'user', '.copilot/settings.json'),
  ],
};

/**
 * Onde ficam os plugins instalados de cada ferramenta (a partir da home) e os arquivos que marcam
 * a raiz de um plugin. O Cursor só documenta a pasta dos plugins locais.
 */
export const PLUGIN_ROOTS: Record<AiTool, { path: string; manifests: string[] }[]> = {
  claude: [{ path: '.claude/plugins', manifests: ['.claude-plugin/plugin.json'] }],
  codex: [{ path: '.codex/plugins/cache', manifests: ['plugin.json', '.codex-plugin/plugin.json'] }],
  cursor: [{ path: '.cursor/plugins/local', manifests: ['.cursor-plugin/plugin.json', 'plugin.json'] }],
  kimi: [{ path: '.kimi-code/plugins/managed', manifests: ['kimi.plugin.json', '.kimi-plugin/plugin.json'] }],
  copilot: [{ path: '.copilot/installed-plugins', manifests: ['plugin.json', '.plugin/plugin.json', '.claude-plugin/plugin.json', '.github/plugin/plugin.json'] }],
};

/** Um lugar onde o board pode criar um item novo: arquivo fixo que ainda não existe, arquivo de uma pasta ou pasta de skill. */
export interface CreateTarget {
  /** índice da fonte em `HARNESS_CATALOG[tool]` */
  source: number;
  kind: HarnessKind;
  scope: 'project' | 'user';
  layout: 'file' | 'files' | 'skills';
  /** caminho do arquivo que será criado, com `<nome>` onde entra o nome */
  label: string;
}

export function createTargets(tool: AiTool): CreateTarget[] {
  return HARNESS_CATALOG[tool].flatMap((src, source): CreateTarget[] => {
    if (src.builtin || (src.layout !== 'file' && src.layout !== 'files' && src.layout !== 'skills')) return [];
    const base = `${src.scope === 'user' ? '~/' : ''}${src.path}`;
    const label = src.layout === 'file' ? base : src.layout === 'skills' ? `${base}/<nome>/SKILL.md` : `${base}/<nome>${src.createExt ?? src.ext}`;
    return [{ source, kind: src.kind, scope: src.scope, layout: src.layout, label }];
  });
}

/** Pasta para onde vai a cópia de um item: a primeira pasta do catálogo para o tipo e o escopo de destino. */
export function copyTarget(tool: AiTool, kind: HarnessKind, layout: 'files' | 'skills', scope: 'project' | 'user'): HarnessSource | undefined {
  return HARNESS_CATALOG[tool].find((s) => !s.builtin && s.kind === kind && s.scope === scope && s.layout === layout);
}

/** Um arquivo de configuração em que o board pode acrescentar e remover servidores MCP. */
export interface McpTarget {
  /** índice da fonte em `HARNESS_CATALOG[tool]` */
  source: number;
  scope: 'project' | 'user';
  /** caminho do arquivo, a partir do projeto ou de `~` */
  label: string;
}

/**
 * Arquivos de servidores MCP que o board edita. O ~/.claude.json fica de fora: o Claude Code o regrava
 * o tempo todo com outros dados, e o caminho documentado para ele é `claude mcp add --scope user`.
 */
export function mcpTargets(tool: AiTool): McpTarget[] {
  return HARNESS_CATALOG[tool].flatMap((src, source): McpTarget[] =>
    src.kind === 'mcp' && (src.layout === 'json-keys' || src.layout === 'toml-tables') ? [{ source, scope: src.scope, label: `${src.scope === 'user' ? '~/' : ''}${src.path}` }] : [],
  );
}

/** Servidor MCP informado na tela: um comando local ou um endereço. */
export interface McpServerInput {
  name: string;
  transport: 'stdio' | 'http';
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

export const MCP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/**
 * Formato dos hooks em cada arquivo (páginas de hooks de cada ferramenta, lidas em 2026-10-02):
 * - `nested` (Claude Code e Codex): evento → grupos `{ matcher, hooks: [{ type: "command", command, timeout }] }`
 * - `flat` (Cursor): `{ version: 1, hooks: { evento: [{ command, matcher, timeout }] } }`
 * - `copilot` (Copilot CLI): `{ version: 1, hooks: { evento: [{ type: "command", bash, timeoutSec }] } }`, um arquivo por pasta de hooks
 */
export type HookFormat = 'nested' | 'flat' | 'copilot';

const HOOK_FORMAT: Record<AiTool, HookFormat | null> = { claude: 'nested', codex: 'nested', cursor: 'flat', copilot: 'copilot', kimi: null };

/** Arquivo que o board grava dentro de uma pasta de hooks (Copilot). */
export const HOOK_FILE = 'faz-ai.json';

export interface HookTarget {
  source: number;
  scope: 'project' | 'user';
  label: string;
  format: HookFormat;
}

/** Arquivos de hooks que o board edita. Os hooks do Kimi ficam no config.toml e são só listados. */
export function hookTargets(tool: AiTool): HookTarget[] {
  const format = HOOK_FORMAT[tool];
  if (!format) return [];
  return HARNESS_CATALOG[tool].flatMap((src, source): HookTarget[] => {
    if (src.kind !== 'hook' || (src.layout !== 'json-keys' && src.layout !== 'hook-files')) return [];
    const base = `${src.scope === 'user' ? '~/' : ''}${src.path}`;
    return [{ source, scope: src.scope, label: src.layout === 'hook-files' ? `${base}/${HOOK_FILE}` : base, format }];
  });
}

/** Eventos de hook de cada ferramenta, conforme as páginas de hooks delas. */
export const HOOK_EVENTS: Record<AiTool, string[]> = {
  claude: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'PermissionRequest', 'Notification', 'SessionStart', 'SessionEnd', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact', 'InstructionsLoaded', 'ConfigChange', 'FileChanged'],
  codex: ['PreToolUse', 'PostToolUse', 'PermissionRequest', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'Stop', 'Interrupt', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact'],
  cursor: ['preToolUse', 'postToolUse', 'postToolUseFailure', 'beforeShellExecution', 'afterShellExecution', 'beforeMCPExecution', 'afterMCPExecution', 'beforeReadFile', 'afterFileEdit', 'beforeSubmitPrompt', 'sessionStart', 'sessionEnd', 'subagentStart', 'subagentStop', 'preCompact', 'stop', 'afterAgentResponse'],
  copilot: ['preToolUse', 'postToolUse', 'postToolUseFailure', 'userPromptSubmitted', 'sessionStart', 'agentStop', 'subagentStart', 'errorOccurred'],
  kimi: [],
};

export interface HookInput {
  event: string;
  /** filtro do evento (ex.: o nome da ferramenta); vazio = sempre */
  matcher: string;
  command: string;
  /** tempo limite em segundos; 0 = o padrão da ferramenta */
  timeout: number;
}

export interface PermissionTarget {
  source: number;
  scope: 'project' | 'user';
  label: string;
  lists: string[];
}

export function permissionTargets(tool: AiTool): PermissionTarget[] {
  return HARNESS_CATALOG[tool].flatMap((src, source): PermissionTarget[] => (src.layout === 'json-permissions' ? [{ source, scope: src.scope, label: `${src.scope === 'user' ? '~/' : ''}${src.path}`, lists: src.lists }] : []));
}

export const PERMISSION_LIST_LABEL: Record<string, string> = { allow: 'permitir', ask: 'perguntar', deny: 'negar' };
