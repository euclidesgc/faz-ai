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

/**
 * O resultado de "Indicar artefatos": os artefatos de um assunto que a IA achou mais úteis para o
 * projeto, pré-selecionados na tela para a pessoa confirmar. Nada entra no board sem ela.
 */
export interface HarnessSuggestions {
  tool: AiTool;
  kind: 'instructions' | 'skill' | 'agent' | 'mcp';
  /** `location` é a identidade do item na marcação (`selectionKey`) */
  items: { location: string; reason: string }[];
  /** a IA não respondeu no formato esperado, ou a execução falhou */
  error?: string;
}

/** Uma pasta importada: o board a varre atrás de artefatos no formato da ferramenta e os oferece ao board. */
export interface HarnessImport {
  tool: AiTool;
  /** caminho absoluto da pasta */
  dir: string;
}

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
  /** só no item do próprio plugin (`kind: 'plugin'`): como ele está instalado, quando a ferramenta diz */
  install?: PluginInstall;
}

/**
 * Um plugin instalado, como a ferramenta o informa. No Claude Code vem de `claude plugin list --json`:
 * o id é `nome@marketplace` (ou `@synced`, `@skills-dir`) e o escopo é onde ele foi instalado. No
 * Cursor é uma pasta de `~/.cursor/plugins/local`, e o id é o nome dela.
 */
export interface PluginInstall {
  id: string;
  /** escopos em que está instalado: `user`, `project`, `local`, `managed`, `synced`… */
  scopes: string[];
  enabled: boolean;
  /** pasta de onde a ferramenta carrega o plugin */
  dir: string;
}

/** O que o board faz com um plugin instalado, pela própria ferramenta. */
export type PluginAction = 'uninstall' | 'disable' | 'enable';

/** Escopos de onde o Claude Code desinstala um plugin; os sincronizados do claude.ai e os da organização só são desativados. */
const UNINSTALL_SCOPES = ['user', 'project', 'local'];

/** As ações que valem para o plugin, conforme a ferramenta e como ele está instalado. */
export function pluginActions(tool: AiTool, install: PluginInstall | undefined): PluginAction[] {
  if (!install) return [];
  // o Cursor não tem comando para desativar: um plugin local sai tirando a pasta
  if (tool === 'cursor') return ['uninstall'];
  const out: PluginAction[] = [install.enabled ? 'disable' : 'enable'];
  if (/@(inline|synced|skills-dir)$/.test(install.id)) return out;
  if (install.scopes.some((s) => UNINSTALL_SCOPES.includes(s))) out.push('uninstall');
  return out;
}

/** Os escopos de que o Claude Code desinstala o plugin, um comando por escopo. */
export const uninstallScopes = (install: PluginInstall): string[] => install.scopes.filter((s) => UNINSTALL_SCOPES.includes(s));

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
export type AiTool = 'claude' | 'cursor' | 'kimi';

/** Onde e como uma ferramenta guarda os agentes do projeto (conforme a documentação de cada uma em 2026-10-02). */
export interface AgentSpec {
  dir: string;
  ext: string;
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

/** Skill sugerida para guardar modelos de classe e exemplos de código do projeto. */
export const REFERENCE_SKILL = {
  name: 'modelos-do-projeto',
  description: 'Modelos de classe e exemplos de código deste projeto. Use como referência ao criar código novo do mesmo tipo.',
  body: 'Os arquivos em `references/` são exemplos reais ou modelos de como o código deste projeto deve ser escrito.\n\nAo criar algo novo, procure aqui o modelo do mesmo tipo e siga a estrutura, os nomes e o estilo dele.\n\n## Modelos\n\nListe aqui cada arquivo de `references/` com uma linha dizendo quando usar.',
};
