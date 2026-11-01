import { baseValue } from './harness';
import type { AiBase } from './aiProfiles';
import type { AiTool, HarnessKind } from './harness';

/**
 * Os grupos do catálogo do Harness (agrupados em assuntos por `harnessTopics.ts`), na ordem em que aparecem. Cada fonte do catálogo
 * cai num deles; os itens de plugin vão todos para `plugin`.
 */
export type HarnessGroup =
  'main' | 'topic' | 'memory' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp' | 'settings' | 'style' | 'plugin' | 'managed';

/** O que a fonte diz para a pessoa: o grupo, uma frase simples e quando a ferramenta a carrega. */
interface SourceMeta {
  group?: HarnessGroup;
  /** o que é, numa frase simples */
  hint?: string;
  /** `always`: entra no começo de toda conversa; `on-demand`: só quando a tarefa pede ou a pessoa chama */
  loads?: 'always' | 'on-demand';
  /** `managed`: pasta da política da organização, que depende do sistema (ver `managedDir`) */
  base?: 'managed';
  /**
   * o board não oferece criar o arquivo: a ferramenta ou a organização é que o mantém, ou é só um lugar
   * alternativo de outro arquivo (o `.claude/CLAUDE.md` faz o papel do `CLAUDE.md`)
   */
  noCreate?: boolean;
  /**
   * Papel do arquivo na regra do Claude Code para o AGENTS.md: por padrão (Project instructions =
   * claude-md-or-agents-md), ele só lê o `agents-md` do projeto quando não há nenhum `claude-md`.
   */
  role?: 'claude-md' | 'agents-md';
}

/**
 * Onde cada ferramenta guarda o que carrega, no projeto e na pasta do usuário, conforme a
 * documentação de cada uma lida em 2026-10-12:
 * - Claude Code: code.claude.com/docs (memory, skills, sub-agents, hooks-guide, mcp, settings, plugins)
 * - Cursor: cursor.com/docs (rules, ignore-files, skills, subagents, hooks, mcp, plugins, cli/reference/configuration)
 * - Kimi Code: CLI 2.1.1 sondada em 2026-10-13 (AGENTS.md, skills, agents, mcp.json, config.toml;
 *   a pasta de dados é ~/.kimi-code, ou $KIMI_CODE_HOME quando a variável existe — a varredura usa a home padrão)
 *
 * A varredura e a tela são genéricas sobre esta tabela: mudar um caminho é mudar um dado aqui. Os
 * índices são usados nas mensagens da tela (`source`): fonte nova entra no fim da lista da ferramenta.
 * `{project}` no caminho é a pasta do projeto no formato do Claude Code (ver `claudeProjectKey`).
 */
export type HarnessSource = {
  kind: HarnessKind;
  scope: 'project' | 'user';
  path: string;
  /** rótulo de origem para itens que vêm com a ferramenta */ builtin?: string;
} & SourceMeta &
  (
    | { layout: 'file' }
    /** todos os arquivos da pasta (e subpastas) com a extensão */
    | { layout: 'files'; ext: string }
    /** pastas `<nome>/SKILL.md` */
    | { layout: 'skills' }
    /** um item por chave do objeto `key` de um arquivo JSON */
    | { layout: 'json-keys'; key: string }
    /** servidores MCP no ~/.claude.json: os globais e os gravados para esta pasta de projeto */
    | { layout: 'claude-json' }
    /** regras de permissão: as listas (`allow`, `deny`…) do objeto `permissions` de um arquivo JSON */
    | { layout: 'json-permissions'; lists: string[] }
    /** arquivos com um destes nomes nas subpastas do projeto (a raiz já tem as fontes próprias) */
    | { layout: 'nested'; names: string[] }
    /** blocos `[[hooks]]` de um arquivo TOML (Kimi Code) */
    | { layout: 'toml-hooks' }
  );

type Src = HarnessSource;
type Scope = 'project' | 'user';
const skills = (scope: Scope, paths: string[], meta: SourceMeta): Src[] =>
  paths.map((path): Src => ({ kind: 'skill', scope, layout: 'skills', path, ...meta }));
const files = (kind: HarnessKind, scope: Scope, path: string, ext: string, meta: SourceMeta): Src => ({
  kind,
  scope,
  layout: 'files',
  path,
  ext,
  ...meta,
});
const file = (kind: HarnessKind, scope: Scope, path: string, meta: SourceMeta): Src => ({ kind, scope, layout: 'file', path, ...meta });
const hooks = (scope: Scope, path: string, hint: string): Src => ({
  kind: 'hook',
  scope,
  layout: 'json-keys',
  path,
  key: 'hooks',
  group: 'hook',
  hint,
});
const mcp = (scope: Scope, path: string, hint: string): Src => ({
  kind: 'mcp',
  scope,
  layout: 'json-keys',
  path,
  key: 'mcpServers',
  group: 'mcp',
  hint,
});
const permissions = (scope: Scope, path: string, lists: string[], hint: string): Src => ({
  kind: 'settings',
  scope,
  layout: 'json-permissions',
  path,
  lists,
  group: 'settings',
  hint,
});

const CLAUDE_SKILL = 'Instruções e arquivos de apoio que o Claude Code carrega quando a tarefa pede; só a descrição fica sempre à vista.';
const CLAUDE_AGENT = 'Ajudante com instruções próprias, para o qual o Claude Code delega partes do trabalho.';
const CLAUDE_COMMAND = 'Prompt pronto, chamado digitando /nome na conversa.';
const CLAUDE_PERMISSIONS = 'O que a IA pode fazer sem perguntar (allow), deve perguntar antes (ask) ou nunca pode fazer (deny).';
const CLAUDE_STYLE = 'Muda o jeito de o Claude Code responder (tom, formato); escolhido com /output-style.';
const AGENTS_MD =
  'Instruções no padrão aberto AGENTS.md, lidas também pelo Cursor; o Claude Code só as lê quando o projeto não tem CLAUDE.md.';
const CURSOR_SKILL = 'Instruções e arquivos de apoio que o Cursor carrega quando a tarefa pede; só a descrição fica sempre à vista.';
const CURSOR_AGENT = 'Ajudante com instruções próprias, para o qual o Cursor delega partes do trabalho.';
const KIMI_SKILL = 'Instruções e arquivos de apoio que o Kimi Code carrega quando a tarefa pede; só a descrição fica sempre à vista.';
const KIMI_AGENT = 'Ajudante com instruções próprias, para o qual o Kimi Code delega partes do trabalho.';

export const HARNESS_CATALOG: Record<AiBase, HarnessSource[]> = {
  claude: [
    file('instructions', 'project', 'CLAUDE.md', {
      group: 'main',
      loads: 'always',
      role: 'claude-md',
      hint: 'Regras do projeto que o Claude Code lê no começo de toda conversa; vão no repositório.',
    }),
    file('instructions', 'project', '.claude/CLAUDE.md', {
      group: 'main',
      loads: 'always',
      role: 'claude-md',
      noCreate: true,
      hint: 'O mesmo que o CLAUDE.md da raiz, guardado na pasta .claude; também entra em toda conversa.',
    }),
    file('instructions', 'project', 'CLAUDE.local.md', {
      group: 'main',
      loads: 'always',
      role: 'claude-md',
      hint: 'Suas regras pessoais para este projeto, lidas em toda conversa; ficam fora do repositório.',
    }),
    files('instructions', 'project', '.claude/rules', '.md', {
      group: 'topic',
      hint: 'Regra de um assunto; com paths no topo, só entra quando a IA mexe nesses arquivos.',
    }),
    file('instructions', 'user', '.claude/CLAUDE.md', {
      group: 'main',
      loads: 'always',
      hint: 'Suas regras pessoais, lidas em toda conversa de qualquer projeto.',
    }),
    files('instructions', 'user', '.claude/rules', '.md', {
      group: 'topic',
      hint: 'Sua regra de um assunto, que vale em todos os projetos.',
    }),
    ...skills('project', ['.claude/skills'], { group: 'skill', loads: 'on-demand', hint: CLAUDE_SKILL }),
    ...skills('user', ['.claude/skills'], { group: 'skill', loads: 'on-demand', hint: CLAUDE_SKILL }),
    files('agent', 'project', '.claude/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CLAUDE_AGENT }),
    files('agent', 'user', '.claude/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CLAUDE_AGENT }),
    files('command', 'project', '.claude/commands', '.md', { group: 'command', loads: 'on-demand', hint: CLAUDE_COMMAND }),
    files('command', 'user', '.claude/commands', '.md', { group: 'command', loads: 'on-demand', hint: CLAUDE_COMMAND }),
    hooks(
      'project',
      '.claude/settings.json',
      'Comando que o Claude Code roda sozinho num evento (antes de editar, ao terminar…); vai no repositório.',
    ),
    hooks('project', '.claude/settings.local.json', 'Comando que o Claude Code roda sozinho num evento, só na sua máquina.'),
    hooks('user', '.claude/settings.json', 'Comando que o Claude Code roda sozinho num evento, em todos os projetos.'),
    mcp('project', '.mcp.json', 'Servidor que dá ferramentas extras à IA, compartilhado no repositório.'),
    {
      kind: 'mcp',
      scope: 'user',
      layout: 'claude-json',
      path: '.claude.json',
      group: 'mcp',
      noCreate: true,
      hint: 'Servidor adicionado pelo Claude Code (claude mcp add); o arquivo é mantido por ele.',
    },
    file('settings', 'project', '.claude/settings.json', {
      group: 'settings',
      hint: 'Configurações do projeto (permissões, hooks, variáveis, modelo); vão no repositório.',
    }),
    file('settings', 'project', '.claude/settings.local.json', {
      group: 'settings',
      hint: 'Configurações só suas neste projeto; ficam fora do repositório.',
    }),
    permissions('project', '.claude/settings.json', ['allow', 'ask', 'deny'], CLAUDE_PERMISSIONS),
    permissions('project', '.claude/settings.local.json', ['allow', 'ask', 'deny'], CLAUDE_PERMISSIONS),
    permissions('user', '.claude/settings.json', ['allow', 'ask', 'deny'], CLAUDE_PERMISSIONS),
    files('settings', 'project', '.claude/output-styles', '.md', { group: 'style', hint: CLAUDE_STYLE }),
    file('settings', 'user', '.claude/settings.json', {
      group: 'settings',
      hint: 'Suas configurações do Claude Code, em todos os projetos.',
    }),
    files('settings', 'user', '.claude/output-styles', '.md', { group: 'style', hint: CLAUDE_STYLE }),
    file('instructions', 'project', 'AGENTS.md', { group: 'main', loads: 'always', role: 'agents-md', hint: AGENTS_MD }),
    file('instructions', 'project', '.claude/AGENTS.md', {
      group: 'main',
      loads: 'always',
      role: 'agents-md',
      noCreate: true,
      hint: AGENTS_MD,
    }),
    files('memory', 'user', '.claude/projects/{project}/memory', '.md', {
      group: 'memory',
      noCreate: true,
      hint: 'Anotação que o Claude Code guarda sozinho sobre este projeto; o índice MEMORY.md entra em toda conversa.',
    }),
    file('instructions', 'user', 'CLAUDE.md', {
      group: 'managed',
      base: 'managed',
      loads: 'always',
      noCreate: true,
      hint: 'Regras da sua organização, instaladas pela equipe de TI; valem para todas as pessoas.',
    }),
    file('settings', 'user', 'managed-settings.json', {
      group: 'managed',
      base: 'managed',
      noCreate: true,
      hint: 'Configurações impostas pela organização; valem acima das suas.',
    }),
    {
      kind: 'instructions',
      scope: 'project',
      layout: 'nested',
      path: '',
      names: ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'],
      group: 'main',
      loads: 'on-demand',
      hint: 'Regras de uma subpasta: o Claude Code as lê quando mexe em arquivos dela.',
    },
  ],
  cursor: [
    file('instructions', 'project', 'AGENTS.md', {
      group: 'main',
      loads: 'always',
      hint: 'Instruções do projeto no padrão aberto AGENTS.md, lidas pelo Cursor em toda conversa.',
    }),
    files('instructions', 'project', '.cursor/rules', '.mdc', {
      group: 'topic',
      hint: 'Regra de um assunto; o topo diz se entra sempre, por caminho de arquivo ou quando a IA julgar útil.',
    }),
    ...skills('project', ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'], {
      group: 'skill',
      loads: 'on-demand',
      hint: CURSOR_SKILL,
    }),
    ...skills('user', ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'], {
      group: 'skill',
      loads: 'on-demand',
      hint: CURSOR_SKILL,
    }),
    files('agent', 'project', '.cursor/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CURSOR_AGENT }),
    files('agent', 'project', '.claude/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CURSOR_AGENT }),
    files('agent', 'project', '.grok/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CURSOR_AGENT }),
    files('agent', 'user', '.cursor/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CURSOR_AGENT }),
    files('agent', 'user', '.claude/agents', '.md', { group: 'agent', loads: 'on-demand', hint: CURSOR_AGENT }),
    files('command', 'project', '.cursor/commands', '.md', {
      group: 'command',
      loads: 'on-demand',
      hint: 'Prompt pronto, chamado digitando /nome no chat.',
    }),
    hooks('project', '.cursor/hooks.json', 'Comando que o Cursor roda sozinho num evento do agente, neste projeto.'),
    hooks('user', '.cursor/hooks.json', 'Comando que o Cursor roda sozinho num evento do agente, em todos os projetos.'),
    mcp('project', '.cursor/mcp.json', 'Servidor que dá ferramentas extras à IA neste projeto.'),
    mcp('user', '.cursor/mcp.json', 'Servidor que dá ferramentas extras à IA em todos os projetos.'),
    file('settings', 'project', '.cursor/cli.json', {
      group: 'settings',
      hint: 'Configuração da linha de comando do Cursor (cursor-agent) neste projeto.',
    }),
    file('settings', 'user', '.cursor/cli-config.json', {
      group: 'settings',
      hint: 'Configuração da linha de comando do Cursor (cursor-agent), em todos os projetos.',
    }),
    permissions(
      'project',
      '.cursor/cli.json',
      ['allow', 'deny'],
      'O que o cursor-agent pode fazer sem perguntar (allow) ou nunca pode fazer (deny).',
    ),
    permissions(
      'user',
      '.cursor/cli-config.json',
      ['allow', 'deny'],
      'O que o cursor-agent pode fazer sem perguntar (allow) ou nunca pode fazer (deny).',
    ),
    files('command', 'user', '.cursor/commands', '.md', {
      group: 'command',
      loads: 'on-demand',
      hint: 'Seu prompt pronto, chamado com /nome em qualquer projeto.',
    }),
    file('settings', 'project', '.cursorignore', {
      group: 'settings',
      hint: 'Arquivos que a IA do Cursor não pode ler nem citar, no formato do .gitignore.',
    }),
    {
      kind: 'instructions',
      scope: 'project',
      layout: 'nested',
      path: '',
      names: ['AGENTS.md'],
      group: 'main',
      loads: 'on-demand',
      hint: 'Instruções de uma subpasta: valem quando o Cursor trabalha nela, acima das da raiz.',
    },
  ],
  kimi: [
    file('instructions', 'project', 'AGENTS.md', {
      group: 'main',
      loads: 'always',
      hint: 'Instruções do projeto no padrão aberto AGENTS.md, lidas pelo Kimi Code em toda sessão.',
    }),
    file('instructions', 'project', '.kimi-code/AGENTS.md', {
      group: 'main',
      loads: 'always',
      hint: 'Instruções do projeto na pasta do Kimi Code, lidas em toda sessão.',
    }),
    file('instructions', 'user', '.kimi-code/AGENTS.md', {
      group: 'main',
      loads: 'always',
      hint: 'Suas instruções no padrão AGENTS.md, lidas pelo Kimi Code em qualquer projeto.',
    }),
    ...skills('project', ['.kimi-code/skills'], { group: 'skill', loads: 'on-demand', hint: KIMI_SKILL }),
    ...skills('user', ['.kimi-code/skills'], { group: 'skill', loads: 'on-demand', hint: KIMI_SKILL }),
    files('agent', 'project', '.kimi-code/agents', '.md', { group: 'agent', loads: 'on-demand', hint: KIMI_AGENT }),
    files('agent', 'user', '.kimi-code/agents', '.md', { group: 'agent', loads: 'on-demand', hint: KIMI_AGENT }),
    mcp('project', '.kimi-code/mcp.json', 'Servidor que dá ferramentas extras à IA neste projeto.'),
    mcp('user', '.kimi-code/mcp.json', 'Servidor que dá ferramentas extras à IA em todos os projetos.'),
    file('settings', 'user', '.kimi-code/config.toml', {
      group: 'settings',
      hint: 'Suas configurações do Kimi Code (modelo, provedores e as regras permanentes de permissão), em todos os projetos.',
    }),
    {
      kind: 'hook',
      scope: 'user',
      layout: 'toml-hooks',
      path: '.kimi-code/config.toml',
      group: 'hook',
      hint: 'Comando que roda num momento da sessão do Kimi Code. Falha em aberto (erro ou tempo esgotado deixam passar): não é controle de segurança.',
    },
  ],
};

/** Grupo de um item no catálogo do Harness: o da fonte de onde ele veio; os de plugin ficam em Plugins. */
export function groupOf(tool: AiTool, item: { scope: string; kind: HarnessKind; source?: number }): HarnessGroup {
  if (item.scope === 'plugin') return 'plugin';
  const src = item.source === undefined ? undefined : (baseValue(HARNESS_CATALOG, tool) ?? [])[item.source];
  return src?.group ?? (item.kind === 'instructions' ? 'main' : (item.kind as HarnessGroup));
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
