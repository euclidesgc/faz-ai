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

/** Ferramentas de IA que o board sabe configurar. */
export type AiTool = 'claude' | 'codex' | 'cursor' | 'kimi';

/** O que cada ferramenta lê no projeto (conforme a documentação de cada uma). */
export const AI_TOOLS: { id: AiTool; label: string; rules: string; skills: string; mcp: string }[] = [
  { id: 'claude', label: 'Claude Code', rules: 'CLAUDE.md', skills: '.claude/skills', mcp: '.mcp.json (projeto)' },
  { id: 'codex', label: 'Codex', rules: 'AGENTS.md', skills: '.agents/skills', mcp: '.codex/config.toml (projeto confiável)' },
  { id: 'cursor', label: 'Cursor', rules: 'AGENTS.md', skills: '.agents/skills, .cursor/skills, .claude/skills', mcp: '.cursor/mcp.json (projeto)' },
  { id: 'kimi', label: 'Kimi Code', rules: 'AGENTS.md', skills: '.kimi/skills, .claude/skills, .agents/skills', mcp: '~/.kimi-code/mcp.json ou ~/.kimi/mcp.json (global)' },
];

export const ALL_AI_TOOLS: AiTool[] = AI_TOOLS.map((t) => t.id);

export function parseAiTools(json: string | null | undefined): AiTool[] {
  try {
    const v: unknown = JSON.parse(json ?? '');
    if (Array.isArray(v)) return ALL_AI_TOOLS.filter((t) => v.includes(t));
  } catch {
    /* inválido: usa todas */
  }
  return ALL_AI_TOOLS;
}

/**
 * Onde as skills do projeto ficam, dadas as ferramentas em uso. O Claude Code só lê `.claude/skills`
 * e o Codex só lê `.agents/skills`; Cursor e Kimi leem as duas. Com Claude e Codex juntos, a pasta
 * principal é `.claude/skills` e cada skill ganha um atalho em `.agents/skills`.
 */
export function skillDirs(tools: AiTool[]): { primary: string; mirror: string | null } {
  const claude = tools.includes('claude');
  if (claude) return { primary: '.claude/skills', mirror: tools.includes('codex') ? '.agents/skills' : null };
  return { primary: '.agents/skills', mirror: null };
}

export const EMPTY_HARNESS: Harness = { rules: [], skills: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Codex, Kimi Code, Cursor e outros' },
  { name: 'GEMINI.md', readBy: 'Gemini CLI' },
];

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
