import { baseValue } from './harness';
import type { AiBase } from './aiProfiles';
import type { AiTool, HarnessKind } from './harness';

/**
 * Os grupos do catálogo do Harness (agrupados em assuntos por `harnessTopics.ts`), na ordem em que aparecem. Cada fonte do catálogo
 * cai num deles; os itens de plugin vão todos para `plugin`.
 */
export type HarnessGroup =
  'main' | 'topic' | 'memory' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp' | 'settings' | 'style' | 'plugin' | 'managed';

export const HARNESS_GROUPS: { id: HarnessGroup; label: string; hint: string }[] = [
  { id: 'main', label: 'Regras principais', hint: 'Entram no começo de toda conversa: é o que a IA sempre sabe sobre você e o projeto.' },
  { id: 'topic', label: 'Regras por assunto', hint: 'Regras separadas por tema; algumas só entram quando a IA mexe em certos arquivos.' },
  { id: 'memory', label: 'Memória', hint: 'Anotações que a própria IA escreve para lembrar entre uma conversa e outra.' },
  { id: 'skill', label: 'Skills', hint: 'Pacotes de instruções e arquivos de apoio que a IA carrega quando a tarefa pede.' },
  { id: 'agent', label: 'Subagentes', hint: 'Ajudantes com instruções próprias, para os quais a IA delega partes do trabalho.' },
  { id: 'command', label: 'Comandos', hint: 'Prompts prontos, chamados com /nome na conversa.' },
  { id: 'hook', label: 'Hooks', hint: 'Comandos que a ferramenta roda sozinha em certos eventos.' },
  { id: 'mcp', label: 'Servidores MCP', hint: 'Servidores que dão ferramentas extras à IA.' },
  {
    id: 'settings',
    label: 'Configurações e permissões',
    hint: 'Como a ferramenta se comporta e o que a IA pode fazer sem perguntar.',
  },
  { id: 'style', label: 'Estilos de saída', hint: 'Mudam o jeito de a IA responder.' },
  {
    id: 'plugin',
    label: 'Plugins',
    hint: 'Pacotes instalados que trazem skills, agentes, comandos, hooks e servidores; mudam pela própria ferramenta.',
  },
  { id: 'managed', label: 'Organização', hint: 'Definido pela sua empresa para todas as pessoas; aqui é só leitura.' },
];

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

/**
 * O que a ferramenta carrega sem um arquivo que o board possa mostrar: fica nas configurações dela ou
 * num painel da web. Aparece no grupo como aviso, sem caminho.
 */
export const HARNESS_NOTES: Record<AiBase, { group: HarnessGroup; scope: Scope; name: string; hint: string }[]> = {
  claude: [],
  kimi: [],
  cursor: [
    {
      group: 'main',
      scope: 'user',
      name: 'User Rules',
      hint: 'Suas regras pessoais do Cursor, lidas em toda conversa, ficam nas configurações dele (Customize → Rules), não num arquivo.',
    },
    {
      group: 'managed',
      scope: 'user',
      name: 'Team Rules',
      hint: 'Regras do time, definidas no painel do Cursor nos planos Team e Enterprise; valem acima das do projeto.',
    },
    {
      group: 'settings',
      scope: 'user',
      name: 'Ignorados de todos os projetos',
      hint: 'A lista global de arquivos que a IA não lê fica nas configurações do Cursor (Indexing → Ignore Files).',
    },
  ],
};

/**
 * Pasta da política gerenciada do Claude Code em cada sistema, onde a equipe de TI instala o
 * `CLAUDE.md` e o `managed-settings.json` da organização.
 */
export function managedDir(platform: string): string {
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode';
  if (platform === 'win32') return 'C:\\Program Files\\ClaudeCode';
  return '/etc/claude-code';
}

/**
 * Os arquivos de instruções do projeto que decidem se o Claude Code lê o AGENTS.md: os `claude-md` e os
 * `agents-md`, na ordem do catálogo (o `CLAUDE.md` da raiz, onde um `@AGENTS.md` costuma ir, vem primeiro).
 */
export function instructionRoles<T extends { source?: number }>(tool: AiTool, items: T[]): { claudeMd: T[]; agentsMd: T[] } {
  const role = (i: T) => (i.source === undefined ? undefined : (baseValue(HARNESS_CATALOG, tool) ?? [])[i.source]?.role);
  const sorted = [...items].sort((x, y) => (x.source ?? 0) - (y.source ?? 0));
  return { claudeMd: sorted.filter((i) => role(i) === 'claude-md'), agentsMd: sorted.filter((i) => role(i) === 'agents-md') };
}

/** Caminho para importar `to` com `@` de dentro de `from`, os dois relativos à raiz do projeto. */
export function importPath(from: string, to: string): string {
  const dir = from.slice(0, from.lastIndexOf('/') + 1);
  return to.startsWith(dir) ? to.slice(dir.length) : '../'.repeat(dir.split('/').length - 1) + to;
}

/** Nome da pasta de um projeto em `~/.claude/projects`: o caminho com tudo que não é letra ou número trocado por hífen. */
export const claudeProjectKey = (projectDir: string): string => projectDir.replace(/[^a-zA-Z0-9]/g, '-');

/** Grupo de um item no catálogo do Harness: o da fonte de onde ele veio; os de plugin ficam em Plugins. */
export function groupOf(tool: AiTool, item: { scope: string; kind: HarnessKind; source?: number }): HarnessGroup {
  if (item.scope === 'plugin') return 'plugin';
  const src = item.source === undefined ? undefined : (baseValue(HARNESS_CATALOG, tool) ?? [])[item.source];
  return src?.group ?? (item.kind === 'instructions' ? 'main' : (item.kind as HarnessGroup));
}

/**
 * Onde ficam os plugins instalados de cada ferramenta (a partir da home) e os arquivos que marcam
 * a raiz de um plugin. O Cursor só documenta a pasta dos plugins locais.
 */
export const PLUGIN_ROOTS: Record<AiBase, { path: string; manifests: string[] }[]> = {
  claude: [{ path: '.claude/plugins', manifests: ['.claude-plugin/plugin.json'] }],
  cursor: [{ path: '.cursor/plugins/local', manifests: ['.cursor-plugin/plugin.json', 'plugin.json'] }],
  // o Kimi Code copia os plugins instalados para a pasta gerenciada (documentação da CLI 2.1.1)
  kimi: [{ path: '.kimi-code/plugins/managed', manifests: ['kimi.plugin.json', '.kimi-plugin/plugin.json'] }],
};

/** Um lugar onde o board pode criar um item novo: arquivo fixo que ainda não existe, arquivo de uma pasta ou pasta de skill. */
export interface CreateTarget {
  /** índice da fonte em `(baseValue(HARNESS_CATALOG, tool) ?? [])` */
  source: number;
  kind: HarnessKind;
  scope: 'project' | 'user';
  layout: 'file' | 'files' | 'skills';
  /** caminho do arquivo que será criado, com `<nome>` onde entra o nome */
  label: string;
}

export function createTargets(tool: AiTool): CreateTarget[] {
  return (baseValue(HARNESS_CATALOG, tool) ?? []).flatMap((src, source): CreateTarget[] => {
    if (src.builtin || src.noCreate || (src.layout !== 'file' && src.layout !== 'files' && src.layout !== 'skills')) return [];
    const base = `${src.scope === 'user' ? '~/' : ''}${src.path}`;
    const label = src.layout === 'file' ? base : src.layout === 'skills' ? `${base}/<nome>/SKILL.md` : `${base}/<nome>${src.ext}`;
    return [{ source, kind: src.kind, scope: src.scope, layout: src.layout, label }];
  });
}

/** Pasta para onde vai a cópia de um item: a primeira pasta do catálogo para o tipo e o escopo de destino. */
export function copyTarget(
  tool: AiTool,
  kind: HarnessKind,
  layout: 'files' | 'skills',
  scope: 'project' | 'user',
): HarnessSource | undefined {
  return (baseValue(HARNESS_CATALOG, tool) ?? []).find(
    (s) => !s.builtin && !s.noCreate && s.kind === kind && s.scope === scope && s.layout === layout,
  );
}

/** Um arquivo de configuração em que o board pode acrescentar e remover servidores MCP. */
export interface McpTarget {
  /** índice da fonte em `(baseValue(HARNESS_CATALOG, tool) ?? [])` */
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
  return (baseValue(HARNESS_CATALOG, tool) ?? []).flatMap((src, source): McpTarget[] =>
    src.kind === 'mcp' && src.layout === 'json-keys'
      ? [{ source, scope: src.scope, label: `${src.scope === 'user' ? '~/' : ''}${src.path}` }]
      : [],
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
 * - `nested` (Claude Code): evento → grupos `{ matcher, hooks: [{ type: "command", command, timeout }] }`
 * - `flat` (Cursor): `{ version: 1, hooks: { evento: [{ command, matcher, timeout }] } }`
 * Sem entrada aqui, a ferramenta não tem alvos de hook. Os hooks do Kimi Code são `[[hooks]]` em TOML
 * no `~/.kimi-code/config.toml` (documentação da CLI 2.1.1), lidos e gravados por `shared/kimiHooks.ts`.
 */
export type HookFormat = 'nested' | 'flat' | 'toml';

const HOOK_FORMAT: Partial<Record<AiBase, HookFormat>> = {
  claude: 'nested',
  cursor: 'flat',
  kimi: 'toml',
};

export interface HookTarget {
  source: number;
  scope: 'project' | 'user';
  label: string;
  format: HookFormat;
}

/** Arquivos de hooks que o board edita. */
export function hookTargets(tool: AiTool): HookTarget[] {
  const format = baseValue(HOOK_FORMAT, tool) ?? undefined;
  if (!format) return [];
  return (baseValue(HARNESS_CATALOG, tool) ?? []).flatMap((src, source): HookTarget[] => {
    if (src.kind !== 'hook' || (format === 'toml' ? src.layout !== 'toml-hooks' : src.layout !== 'json-keys')) return [];
    return [{ source, scope: src.scope, label: `${src.scope === 'user' ? '~/' : ''}${src.path}`, format }];
  });
}

/** Eventos de hook de cada ferramenta, conforme as páginas de hooks delas. */
export const HOOK_EVENTS: Record<AiBase, string[]> = {
  claude: [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'UserPromptSubmit',
    'PermissionRequest',
    'Notification',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'PostCompact',
    'InstructionsLoaded',
    'ConfigChange',
    'FileChanged',
  ],
  cursor: [
    'preToolUse',
    'postToolUse',
    'postToolUseFailure',
    'beforeShellExecution',
    'afterShellExecution',
    'beforeMCPExecution',
    'afterMCPExecution',
    'beforeReadFile',
    'afterFileEdit',
    'beforeSubmitPrompt',
    'sessionStart',
    'sessionEnd',
    'subagentStart',
    'subagentStop',
    'preCompact',
    'stop',
    'afterAgentResponse',
    'afterAgentThought',
    'workspaceOpen',
    // só no editor: o preenchimento automático (Tab)
    'beforeTabFileRead',
    'afterTabFileEdit',
  ],
  // documentação da CLI 2.1.1: bloqueiam (saída 2) UserPromptSubmit, PreToolUse e Stop
  kimi: [
    'UserPromptSubmit',
    'UserPromptQueued',
    'PreToolUse',
    'Stop',
    'TurnStarted',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'PermissionResult',
    'SessionStart',
    'SessionEnd',
    'SessionHeartbeat',
    'SubagentStart',
    'SubagentStop',
    'TaskStarted',
    'StopFailure',
    'Interrupt',
    'PreCompact',
    'PostCompact',
    'Notification',
  ],
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
  return (baseValue(HARNESS_CATALOG, tool) ?? []).flatMap((src, source): PermissionTarget[] =>
    src.layout === 'json-permissions'
      ? [{ source, scope: src.scope, label: `${src.scope === 'user' ? '~/' : ''}${src.path}`, lists: src.lists }]
      : [],
  );
}

export const PERMISSION_LIST_LABEL: Record<string, string> = { allow: 'permitir', ask: 'perguntar', deny: 'negar' };

/**
 * Como instalar plugins em cada ferramenta, pelos comandos que a documentação delas descreve.
 * O board mostra os comandos; quem os roda é a pessoa, no terminal ou na sessão da ferramenta.
 * Ferramenta sem plugins documentados (o Kimi Code) fica de fora: o grupo de plugins não mostra o bloco.
 */
export const PLUGIN_COMMANDS: Partial<Record<AiBase, { where: string; commands: string[] }>> = {
  claude: {
    where: 'no terminal',
    commands: [
      'claude plugin marketplace add <dono/repositorio>',
      'claude plugin install <plugin>@<marketplace>',
      'claude plugin list',
      'claude plugin uninstall <plugin>@<marketplace>',
    ],
  },
  cursor: {
    where: 'no Cursor (Customize → Plugins) ou numa sessão do agente',
    commands: ['/plugin', 'agent plugin marketplace add <endereço git>'],
  },
};
