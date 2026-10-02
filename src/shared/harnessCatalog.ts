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
export type HarnessSource = { kind: HarnessKind; scope: 'project' | 'user'; path: string; /** rótulo de origem para itens que vêm com a ferramenta */ builtin?: string } & (
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
    files('agent', 'project', '.github/agents', '.md'),
    files('agent', 'user', '.copilot/agents', '.md'),
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
