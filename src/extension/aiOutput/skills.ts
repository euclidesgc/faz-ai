// A skill que uma chamada de ferramenta leu, para o inventário (`kind: 'skill'`). A IA lê uma skill de três
// jeitos: pela ferramenta `Skill` da CLI (o leitor de cada CLI já a conta), pelo `get_skill` do servidor do
// board (o `requiredSkills` do `get_card` manda ler assim as skills sem `path`) e pela leitura do arquivo
// `SKILL.md` em `path`. Sem contar os dois últimos, `get_metrics group_by skill` mostrava um uso por mês com
// centenas de `get_skill` na semana.
import type { InventoryKind } from '../../shared/log';
import { asText, type Json } from './json';

/** O nome da pasta do `SKILL.md`: é o nome da skill, na biblioteca do board e nas pastas das ferramentas. */
const SKILL_FILE = /(?:^|[\\/])([^\\/]+)[\\/]SKILL\.md$/i;

/** Os campos em que cada CLI manda o caminho do arquivo lido (`file_path` no Claude Code, `path` no Cursor, `absolute_path` no Gemini). */
const PATH_FIELDS = ['file_path', 'path', 'absolute_path'];

/** Uma skill pelo nome da pasta do `SKILL.md` lido; `null` quando o caminho não é de um SKILL.md. */
export function skillOfPath(path: string | null): string | null {
  const m = path ? SKILL_FILE.exec(path) : null;
  return m ? m[1]! : null;
}

/**
 * A skill lida por uma chamada já classificada no inventário (`kind`/`name` como o leitor os conta), ou `null`
 * quando a chamada não lê skill: `get_skill` de qualquer servidor (o nome da skill vem em `skill`) e a leitura
 * de um `SKILL.md` por uma ferramenta de arquivo. A chamada continua contando como ferramenta: a skill é um
 * item a mais, não troca o outro.
 */
export function skillReadBy(kind: InventoryKind, name: string, input: Json | null): string | null {
  if (kind === 'mcp_tool' && /(^|\/)get_skill$/.test(name)) return asText(input?.skill);
  if (kind !== 'tool') return null;
  for (const field of PATH_FIELDS) {
    const skill = skillOfPath(asText(input?.[field]));
    if (skill) return skill;
  }
  return null;
}
