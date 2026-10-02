/** Harness de IA do projeto: arquivos de regras e skills, gerenciados pelo board. */

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

export const HARNESS_KINDS: { id: HarnessKind; label: string; hint: string }[] = [
  { id: 'instructions', label: 'Instruções e regras', hint: 'Texto carregado em toda sessão, ou quando a IA mexe em arquivos de um caminho.' },
  { id: 'skill', label: 'Skills', hint: 'Instruções que a IA carrega quando precisa, ou quando o card indica.' },
  { id: 'agent', label: 'Agentes', hint: 'Ajudantes com instruções próprias, para os quais a ferramenta delega trabalho.' },
  { id: 'command', label: 'Comandos e prompts', hint: 'Prompts prontos, chamados pelo nome.' },
  { id: 'hook', label: 'Hooks', hint: 'Comandos que a ferramenta roda sozinha em certos eventos.' },
  { id: 'mcp', label: 'Servidores MCP', hint: 'Servidores que dão ferramentas extras à IA.' },
  { id: 'plugin', label: 'Plugins', hint: 'Pacotes instalados, que trazem skills, agentes, comandos, hooks e servidores MCP.' },
  { id: 'settings', label: 'Configurações e permissões', hint: 'Arquivos de configuração da ferramenta.' },
];

export const HARNESS_SCOPES: { id: HarnessScope; label: string; hint: string }[] = [
  { id: 'project', label: 'Projeto', hint: 'Arquivos desta pasta; valem só aqui.' },
  { id: 'user', label: 'Global', hint: 'Arquivos da sua pasta de usuário; valem em todos os projetos.' },
  { id: 'plugin', label: 'Plugins', hint: 'Vêm de plugins instalados ou da própria ferramenta; não são editáveis.' },
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
export const AI_TOOLS: { id: AiTool; label: string; rules: string; skills: string; mcp: string; /** pasta e extensão dos agentes do projeto; null se a ferramenta não os define em arquivos */ agents: AgentSpec | null }[] = [
  { id: 'claude', label: 'Claude Code', rules: 'CLAUDE.md', skills: '.claude/skills', mcp: '.mcp.json (projeto)', agents: { dir: '.claude/agents', ext: '.md', format: 'markdown', modelField: 'model' } },
  { id: 'codex', label: 'Codex', rules: 'AGENTS.md', skills: '.agents/skills', mcp: '.codex/config.toml (projeto confiável)', agents: { dir: '.codex/agents', ext: '.toml', format: 'toml', modelField: 'model' } },
  { id: 'cursor', label: 'Cursor', rules: 'AGENTS.md', skills: '.cursor/skills', mcp: '.cursor/mcp.json (projeto)', agents: { dir: '.cursor/agents', ext: '.md', format: 'markdown', modelField: 'model' } },
  { id: 'kimi', label: 'Kimi Code', rules: 'AGENTS.md', skills: '.kimi-code/skills', mcp: '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json (global)', agents: { dir: '.kimi-code/agents', ext: '.md', format: 'markdown', modelField: null } },
  { id: 'copilot', label: 'GitHub Copilot', rules: 'AGENTS.md', skills: '.github/skills', mcp: '.vscode/mcp.json e .mcp.json (projeto)', agents: { dir: '.github/agents', ext: '.agent.md', format: 'markdown', modelField: 'model' } },
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
