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

export const EMPTY_HARNESS: Harness = { rules: [], skills: [] };

/** Arquivos de regras reconhecidos, com a ferramenta que os lê. */
export const RULE_FILES: { name: string; readBy: string }[] = [
  { name: 'CLAUDE.md', readBy: 'Claude Code' },
  { name: 'AGENTS.md', readBy: 'Codex, Kimi Code, Cursor e outros' },
  { name: 'GEMINI.md', readBy: 'Gemini CLI' },
];

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
