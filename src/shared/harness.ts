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

export interface Harness {
  rules: RuleFile[];
  skills: Skill[];
}

/** Ferramentas de IA que o board sabe configurar. O projeto trabalha com uma por vez. */
export type AiTool = 'claude' | 'codex' | 'cursor' | 'kimi' | 'copilot';

/** O que cada ferramenta lê no projeto (conforme a documentação de cada uma). */
export const AI_TOOLS: { id: AiTool; label: string; rules: string; skills: string; mcp: string }[] = [
  { id: 'claude', label: 'Claude Code', rules: 'CLAUDE.md', skills: '.claude/skills', mcp: '.mcp.json (projeto)' },
  { id: 'codex', label: 'Codex', rules: 'AGENTS.md', skills: '.agents/skills', mcp: '.codex/config.toml (projeto confiável)' },
  { id: 'cursor', label: 'Cursor', rules: 'AGENTS.md', skills: '.cursor/skills', mcp: '.cursor/mcp.json (projeto)' },
  { id: 'kimi', label: 'Kimi Code', rules: 'AGENTS.md', skills: '.kimi/skills', mcp: '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json (global)' },
  { id: 'copilot', label: 'GitHub Copilot', rules: 'AGENTS.md', skills: '.github/skills', mcp: '.vscode/mcp.json e .mcp.json (projeto)' },
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

export const EMPTY_HARNESS: Harness = { rules: [], skills: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Codex, Cursor, Kimi Code, GitHub Copilot e outros' },
];

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
