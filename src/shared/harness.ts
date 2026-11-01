import type { AiBase } from './aiProfiles';
import type { BoardArtifact } from './artifacts';
/** Harness do projeto: arquivos de regras e skills, gerenciados pelo board. */

/** Como a ferramenta invoca a skill: sozinha (`auto`) ou só quando um card a indica ou ela é chamada pelo nome (`manual`). */
export type SkillMode = 'auto' | 'manual';

export interface RuleFile {
  /** nome do arquivo na raiz do projeto, ex.: CLAUDE.md */
  name: string;
  exists: boolean;
  content: string;
}

export interface Skill {
  /** nome da pasta da skill */
  name: string;
  description: string;
  /** desligada = movida para fora da pasta que as ferramentas de IA leem */
  enabled: boolean;
  /** se a ferramenta pode invocar a skill sozinha, ou só quando ela é indicada (no card ou pelo nome) */
  mode: SkillMode;
  /** caminho do SKILL.md, relativo à raiz do projeto */
  path: string;
  /** conteúdo completo do SKILL.md (com o frontmatter) */
  content: string;
}

/**
 * Agente: um arquivo de agente da ferramenta em uso (no projeto ou na pasta do usuário) com instruções
 * próprias. Para o board, agente e perfil de execução são a mesma coisa: o frontmatter diz o que a sessão
 * recebe (modelo, ferramentas, skills, servidores MCP) e o corpo é o papel dela. Lido do disco a cada varredura.
 */
export interface Agent {
  /** nome do arquivo, sem a extensão */
  name: string;
  description: string;
  /** modelo fixado no frontmatter, no nome que a ferramenta aceita, se houver */
  model: string;
  /** valor do campo Modelo do board (`<id>@<esforço>`), guardado pelo board no arquivo; vazio quando só há `model` */
  modelValue: string;
  /** de onde o arquivo veio */
  scope: 'project' | 'user';
  /** caminho absoluto do arquivo */
  path: string;
  /** caminho para mostrar: relativo ao projeto, ou a partir de `~` (identidade do agente na marcação) */
  location: string;
  /** conteúdo completo do arquivo (com o frontmatter) */
  content: string;
  /** as instruções (o conteúdo sem o frontmatter) */
  body: string;
  /** ferramentas embutidas liberadas; vazio = as da permissão */
  tools: string[];
  deniedTools: string[];
  /** skills que toda execução com o agente lê */
  skills: string[];
  /** servidores MCP liberados além do do board */
  mcp: string[];
  /** criado pelo board como agente padrão de fábrica */
  seed: boolean;
  /** só no Cursor (`readonly: true` no frontmatter): o agente não edita arquivos nem roda comandos que mudem estado */
  readonly: boolean;
  /** só no Cursor (`is_background: true`): o agente roda em segundo plano */
  background: boolean;
}

/** Tipos de componente do harness de uma ferramenta, na ordem em que a tela os mostra. */
export type HarnessKind = 'instructions' | 'memory' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp' | 'plugin' | 'settings';

/**
 * De onde o item vem: da pasta do projeto, da pasta do usuário (vale para todos os projetos), de um
 * plugin, ou de uma pasta importada (que a ferramenta não carrega sozinha: só o board a conhece).
 */
export type HarnessScope = 'project' | 'user' | 'plugin' | 'imported';

/** Onde o board instala o servidor MCP e a skill do fluxo: global (`user`, o padrão) ou só neste projeto. */
export type InstallScope = 'project' | 'user';

export const HARNESS_KINDS: { id: HarnessKind; label: string; hint: string }[] = [
  {
    id: 'instructions',
    label: 'Instruções e regras',
    hint: 'Texto carregado em toda sessão, ou quando a IA mexe em arquivos de um caminho.',
  },
  { id: 'memory', label: 'Memória', hint: 'Anotações que a própria IA escreve para lembrar entre uma conversa e outra.' },
  { id: 'skill', label: 'Skills', hint: 'Instruções que a IA carrega quando precisa, ou quando o card indica.' },
  { id: 'agent', label: 'Subagentes', hint: 'Ajudantes com instruções próprias, para os quais a ferramenta delega trabalho.' },
  { id: 'command', label: 'Comandos e prompts', hint: 'Prompts prontos, chamados pelo nome.' },
  { id: 'hook', label: 'Hooks', hint: 'Comandos que a ferramenta roda sozinha em certos eventos.' },
  { id: 'mcp', label: 'Servidores MCP', hint: 'Servidores que dão ferramentas extras à IA.' },
  { id: 'plugin', label: 'Plugins', hint: 'Pacotes instalados, que trazem skills, agentes, comandos, hooks e servidores MCP.' },
  { id: 'settings', label: 'Configurações e permissões', hint: 'Arquivos de configuração da ferramenta.' },
];

export const HARNESS_SCOPES: { id: HarnessScope; label: string; hint: string; summary: string }[] = [
  {
    id: 'project',
    label: 'Projeto',
    hint: 'Arquivos desta pasta; valem só aqui.',
    summary: 'Fazem parte deste projeto e vão no repositório.',
  },
  {
    id: 'user',
    label: 'Global',
    hint: 'Arquivos da sua pasta de usuário; valem em todos os projetos.',
    summary: 'Da sua máquina: valem em todos os seus projetos, mas não vão no repositório.',
  },
  {
    id: 'plugin',
    label: 'Plugins',
    hint: 'Vêm de plugins instalados ou da própria ferramenta; não são editáveis.',
    summary: 'Vêm de plugins e não podem ser alterados, só copiados.',
  },
  {
    id: 'imported',
    label: 'Importados',
    hint: 'Encontrados nas pastas que você importou; a ferramenta não os carrega sozinha.',
    summary: 'De pastas importadas: só entram nas execuções quando enviados ao board.',
  },
];

/** Um item que a ferramenta carrega. Não leva o conteúdo: o arquivo é aberto no editor. */
export interface HarnessItem {
  /** Identidade da cópia na biblioteca do board. */
  boardArtifactId?: string;
  kind: HarnessKind;
  scope: HarnessScope;
  name: string;
  /** descrição do frontmatter, comando do hook ou do servidor MCP */
  description: string;
  /** caminho absoluto do arquivo que define o item */
  path: string;
  /** caminho para mostrar: relativo ao projeto, ou a partir de `~` */
  location: string;
  /** plugin de onde o item vem, quando `scope` é `plugin` */
  plugin?: string;
  /** como o item está no disco: um arquivo fixo, um arquivo de uma pasta, uma pasta de skill, ou uma entrada dentro de um arquivo de configuração */
  layout: 'file' | 'files' | 'skills' | 'entry';
  /** resumo do conteúdo do arquivo, para saber se uma cópia divergiu do original */
  digest?: string;
  /** tamanho do arquivo em bytes, para estimar quanto ele ocupa no contexto quando a sessão o lê; ausente numa entrada de arquivo de configuração */
  size?: number;
  /** só nas skills: invocação automática ou só quando indicada */
  mode?: SkillMode;
  /** só nas skills: arquivos de apoio da pasta (referências, modelos, scripts), relativos a ela */
  files?: string[];
  /**
   * só nas instruções do Claude Code: os arquivos que ele importa com `@caminho` e que existem, na
   * ordem em que aparecem, com os importados por eles (até quatro níveis, como o Claude Code)
   */
  imports?: { path: string; location: string; depth: number }[];
  /** índice da fonte em `HARNESS_CATALOG[tool]` de onde o item veio (os de plugin não têm) */
  source?: number;
  /** valor inteiro da entrada, quando `description` o resume: o comando de um hook, ou a lista (allow, deny, ask) de uma regra de permissão */
  detail?: string;
}

/** Uma skill encontrada numa pasta ou num repositório, antes de ser instalada. */
export interface InstallableSkill {
  /** pasta da skill, relativa à origem */
  rel: string;
  name: string;
  description: string;
  /** quantos arquivos de apoio a pasta tem, além do SKILL.md */
  files: number;
  /** o nome da pasta serve como nome de skill */
  valid: boolean;
}

export interface ToolInventory {
  tool: AiTool;
  /** há sinal da ferramenta nesta máquina (pasta de configuração na home) */
  installed: boolean;
  items: HarnessItem[];
}

export interface Harness {
  /** Cópias do board, disponíveis em todas as ferramentas. Ausente em estados antigos. */
  library?: {
    preview?: import('./artifacts').LibraryImportPreview;
    importResult?: import('./artifacts').LibraryImportResult;
    directory: string;
    artifacts: BoardArtifact[];
    warnings?: { path: string; reason: 'duplicate' | 'invalid' | 'unreadable' }[];
    /** as skills do fluxo, que vêm com a extensão: a lista as mostra só para leitura, estejam ou não na biblioteca */
    flowSkills?: { name: string; description: string }[];
    /** as pastas de skill (as vazias e as que alguma skill usa), com os níveis de cima */
    skillFolders?: string[];
  };
  rules: RuleFile[];
  skills: Skill[];
  agents: Agent[];
  /** tudo que cada ferramenta carrega nesta máquina e neste projeto */
  inventory: ToolInventory[];
}

/** Ferramentas de IA que o board sabe configurar. O projeto trabalha com uma por vez. */
export type AiTool = string;

/** Onde e como uma ferramenta guarda os agentes do projeto (conforme a documentação de cada uma em 2026-10-02). */
export interface AgentSpec {
  dir: string;
  ext: string;
}

/** O que cada ferramenta lê no projeto (conforme a documentação de cada uma). */
export const AI_BASES: {
  id: AiBase;
  label: string;
  rules: string;
  skills: string;
  /** onde "Instalar neste projeto" registra o servidor do board */
  mcp: string;
  /** onde a instalação padrão (global) registra o servidor do board */
  mcpUser: string;
  /** pasta e extensão dos agentes do projeto */ agents: AgentSpec;
}[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    rules: 'CLAUDE.md',
    skills: '.claude/skills',
    mcp: '.mcp.json (projeto)',
    mcpUser: '~/.claude.json (claude mcp add --scope user)',
    agents: { dir: '.claude/agents', ext: '.md' },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    rules: 'AGENTS.md',
    skills: '.cursor/skills',
    mcp: '.cursor/mcp.json (projeto)',
    mcpUser: '.cursor/mcp.json (projeto; o global não funciona no Cursor)',
    agents: { dir: '.cursor/agents', ext: '.md' },
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    rules: 'AGENTS.md',
    skills: '.kimi-code/skills',
    mcp: '.kimi-code/mcp.json (projeto)',
    mcpUser: '~/.kimi-code/mcp.json',
    agents: { dir: '.kimi-code/agents', ext: '.md' },
  },
];

export const ALL_AI_BASES: AiBase[] = AI_BASES.map((t) => t.id);
/** Dados nativos desconhecidos ficam neutros, sem pastas ou permissões presumidas. */
export const isAiBase = (value: unknown): value is AiBase => value === 'claude' || value === 'cursor' || value === 'kimi';
export const baseValue = <T>(table: Partial<Record<AiBase, T>>, id: string | null): T | undefined => (isAiBase(id) ? table[id] : undefined);
export const baseInfo = (tool: string) =>
  AI_BASES.find((t) => t.id === tool) ?? {
    id: tool,
    label: tool,
    rules: '',
    skills: '',
    mcp: '',
    mcpUser: '',
    agents: { dir: '', ext: '.md' },
  };

/** Lê a ferramenta salva. Versões antigas guardavam uma lista; vale a primeira. */
export function parseAiTool(json: string | null | undefined, ids: readonly string[] = ALL_AI_BASES): AiTool {
  try {
    const v: unknown = JSON.parse(json ?? '');
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === 'string' && ids.includes(first)) return first;
  } catch {
    /* inválido: usa o padrão */
  }
  return 'claude';
}

export const EMPTY_HARNESS: Harness = { rules: [], skills: [], agents: [], inventory: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Cursor e outras ferramentas' },
];

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Pastas de apoio de uma skill, como as ferramentas as descrevem: documentação lida sob demanda,
 * modelos e outros arquivos estáticos, e scripts que a IA pode rodar.
 */
export const SKILL_FOLDERS: { id: string; label: string; hint: string }[] = [
  { id: 'references', label: 'references', hint: 'Documentação e exemplos de código, lidos só quando a skill aponta para eles.' },
  { id: 'assets', label: 'assets', hint: 'Modelos de arquivo e outros recursos estáticos.' },
  { id: 'scripts', label: 'scripts', hint: 'Scripts que a IA pode executar.' },
];

/** Caminho de um arquivo de apoio dentro da pasta da skill: `pasta/arquivo.ext`, sem subir de pasta. */
export const SKILL_FILE_PATTERN = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/){0,3}[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
