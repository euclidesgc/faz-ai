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

export interface Harness {
  rules: RuleFile[];
  skills: Skill[];
  agents: Agent[];
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
  { id: 'kimi', label: 'Kimi Code', rules: 'AGENTS.md', skills: '.kimi/skills', mcp: '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json (global)', agents: { dir: '.kimi-code/agents', ext: '.md', format: 'markdown', modelField: null } },
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

export const EMPTY_HARNESS: Harness = { rules: [], skills: [], agents: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Codex, Cursor, Kimi Code, GitHub Copilot e outros' },
];

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
