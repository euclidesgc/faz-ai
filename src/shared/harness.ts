/** Harness de IA do projeto: arquivos de regras e skills, gerenciados pelo board. */

/**
 * Como a ferramenta chega a uma skill: `auto` deixa a descrição à vista da IA, que decide quando usar;
 * `manual` tira a skill da invocação automática, e ela só é usada quando indicada no card ou chamada pelo nome.
 */
export type SkillMode = 'auto' | 'manual';

export const SKILL_MODES: { id: SkillMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automática', hint: 'A IA vê a descrição em toda sessão e decide quando usar a skill.' },
  {
    id: 'manual',
    label: 'Só quando indicada',
    hint: 'A IA não invoca a skill sozinha: ela só é usada quando um card a indica ou quando é chamada pelo nome.',
  },
];

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

/** Agente (subagente) do projeto: um arquivo com instruções próprias, para o qual a ferramenta delega trabalho. */
export interface Agent {
  /** nome do arquivo, sem a extensão */
  name: string;
  description: string;
  /** modelo fixado no frontmatter, se houver */
  model: string;
  /** caminho do arquivo, relativo à raiz do projeto */
  path: string;
  /** conteúdo completo do arquivo (com o frontmatter) */
  content: string;
}

/** Tipos de componente do harness de uma ferramenta, na ordem em que a tela os mostra. */
export type HarnessKind = 'instructions' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp' | 'plugin' | 'settings';

/** De onde a ferramenta carrega o item: da pasta do projeto, da pasta do usuário (vale para todos os projetos) ou de um plugin. */
export type HarnessScope = 'project' | 'user' | 'plugin';

/** Onde o board instala o servidor MCP e a skill do fluxo: global (`user`, o padrão) ou só neste projeto. */
export type InstallScope = Exclude<HarnessScope, 'plugin'>;

export const HARNESS_KINDS: { id: HarnessKind; label: string; hint: string }[] = [
  {
    id: 'instructions',
    label: 'Instruções e regras',
    hint: 'Texto carregado em toda sessão, ou quando a IA mexe em arquivos de um caminho.',
  },
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
];

/** Um item que a ferramenta carrega. Não leva o conteúdo: o arquivo é aberto no editor. */
export interface HarnessItem {
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
  /** só nas skills: invocação automática ou só quando indicada */
  mode?: SkillMode;
  /** só nas skills: arquivos de apoio da pasta (referências, modelos, scripts), relativos a ela */
  files?: string[];
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

/** Skills encontradas na origem informada, à espera da escolha do que instalar. */
export interface InstallPreview {
  source: string;
  skills: InstallableSkill[];
}

export interface ToolInventory {
  tool: AiTool;
  /** há sinal da ferramenta nesta máquina (pasta de configuração na home) */
  installed: boolean;
  items: HarnessItem[];
}

export interface Harness {
  rules: RuleFile[];
  skills: Skill[];
  agents: Agent[];
  /** tudo que cada ferramenta carrega nesta máquina e neste projeto */
  inventory: ToolInventory[];
}

/** Ferramentas de IA que o board sabe configurar. O projeto trabalha com uma por vez. */
export type AiTool = 'claude' | 'codex' | 'cursor' | 'kimi' | 'copilot';

/** Onde e como uma ferramenta guarda os agentes do projeto (conforme a documentação de cada uma em 2026-10-02). */
export interface AgentSpec {
  dir: string;
  ext: string;
  /** markdown com frontmatter YAML, ou TOML (Codex) */
  format: 'markdown' | 'toml';
  /** nome do campo que fixa o modelo do agente; null se a ferramenta não tem */
  modelField: string | null;
}

/** O que cada ferramenta lê no projeto (conforme a documentação de cada uma). */
export const AI_TOOLS: {
  id: AiTool;
  label: string;
  rules: string;
  skills: string;
  /** onde "Instalar neste projeto" registra o servidor do board */
  mcp: string;
  /** onde a instalação padrão (global) registra o servidor do board */
  mcpUser: string;
  /** pasta e extensão dos agentes do projeto; null se a ferramenta não os define em arquivos */ agents: AgentSpec | null;
}[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    rules: 'CLAUDE.md',
    skills: '.claude/skills',
    mcp: '.mcp.json (projeto)',
    mcpUser: '~/.claude.json (claude mcp add --scope user)',
    agents: { dir: '.claude/agents', ext: '.md', format: 'markdown', modelField: 'model' },
  },
  {
    id: 'codex',
    label: 'Codex',
    rules: 'AGENTS.md',
    skills: '.agents/skills',
    mcp: '.codex/config.toml (projeto confiável)',
    mcpUser: '~/.codex/config.toml',
    agents: { dir: '.codex/agents', ext: '.toml', format: 'toml', modelField: 'model' },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    rules: 'AGENTS.md',
    skills: '.cursor/skills',
    mcp: '.cursor/mcp.json (projeto)',
    mcpUser: '~/.cursor/mcp.json',
    agents: { dir: '.cursor/agents', ext: '.md', format: 'markdown', modelField: 'model' },
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    rules: 'AGENTS.md',
    skills: '.kimi-code/skills',
    mcp: '.kimi-code/mcp.json (projeto)',
    mcpUser: '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json',
    agents: { dir: '.kimi-code/agents', ext: '.md', format: 'markdown', modelField: null },
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    rules: 'AGENTS.md',
    skills: '.github/skills',
    mcp: '.vscode/mcp.json e .mcp.json (projeto)',
    mcpUser: '~/.copilot/mcp-config.json (Copilot CLI)',
    agents: { dir: '.github/agents', ext: '.agent.md', format: 'markdown', modelField: 'model' },
  },
];

export const ALL_AI_TOOLS: AiTool[] = AI_TOOLS.map((t) => t.id);
export const aiToolInfo = (tool: AiTool) => AI_TOOLS.find((t) => t.id === tool)!;

/** Lê a ferramenta salva. Versões antigas guardavam uma lista; vale a primeira. */
export function parseAiTool(json: string | null | undefined): AiTool {
  try {
    const v: unknown = JSON.parse(json ?? '');
    const first = Array.isArray(v) ? v[0] : v;
    if (ALL_AI_TOOLS.includes(first as AiTool)) return first as AiTool;
  } catch {
    /* inválido: usa o padrão */
  }
  return 'claude';
}

export const EMPTY_HARNESS: Harness = { rules: [], skills: [], agents: [], inventory: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Codex, Cursor, Kimi Code, GitHub Copilot e outros' },
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

/** Skill sugerida para guardar modelos de classe e exemplos de código do projeto. */
export const REFERENCE_SKILL = {
  name: 'modelos-do-projeto',
  description: 'Modelos de classe e exemplos de código deste projeto. Use como referência ao criar código novo do mesmo tipo.',
  body: 'Os arquivos em `references/` são exemplos reais ou modelos de como o código deste projeto deve ser escrito.\n\nAo criar algo novo, procure aqui o modelo do mesmo tipo e siga a estrutura, os nomes e o estilo dele.\n\n## Modelos\n\nListe aqui cada arquivo de `references/` com uma linha dizendo quando usar.',
};
