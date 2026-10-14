/**
 * O que o host sabe do projeto sem chamar IA: linguagens, comandos, ferramentas de qualidade, pastas e o título
 * do README. Os assistentes de regras e de skills o usam para sugerir itens que a pessoa marca.
 */
export interface ProjectProfile {
  languages: string[];
  /** os scripts do package.json (nome → comando) */
  scripts: Record<string, string>;
  /** eslint, prettier, vitest, jest, pytest, ruff… achados por arquivos de configuração ou dependências */
  tools: string[];
  /** pastas de primeiro nível, sem as ocultas nem node_modules, dist e build */
  folders: string[];
  /** o primeiro título do README, ou vazio */
  readme: string;
}

export const EMPTY_PROFILE: ProjectProfile = { languages: [], scripts: {}, tools: [], folders: [], readme: '' };
