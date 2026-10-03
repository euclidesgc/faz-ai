import type { BoardState } from './model';

/** Uma skill que o board pode indicar a um card ou a um agente. */
export interface CatalogSkill {
  name: string;
  description: string;
  /** de onde vem: do projeto, da pasta do usuário ou de um plugin */
  scope: 'project' | 'user' | 'plugin';
  plugin?: string;
}

const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de do da dos das em no na nos nas por para com sem e ou que se ao aos como mais ' +
    'the an and or of to in on for with is are be this that it as by from use when user'
  ).split(' '),
);

/** Palavras do texto, em minúsculas e sem acento, sem as vazias (artigos, preposições) nem as de 1 ou 2 letras. */
export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Duas palavras "casam" se uma começa com a outra (ou com os 5 primeiros caracteres, para pegar plural e conjugação). */
const same = (a: string, b: string): boolean => {
  const n = Math.min(5, a.length, b.length);
  return a === b || (n >= 4 && a.slice(0, n) === b.slice(0, n));
};

/**
 * Skills mais ligadas à intenção descrita (o que o agente ou o card faz), da mais para a menos
 * provável. É uma busca por palavras no nome (peso 3) e na descrição (peso 1), sem chamar IA: serve
 * para sugerir, e a pessoa confirma. As do projeto desempatam a favor.
 */
export function suggestSkills(intent: string, skills: CatalogSkill[], limit = 8): CatalogSkill[] {
  const wanted = [...new Set(words(intent))];
  if (!wanted.length) return [];
  return skills
    .map((s) => {
      const inName = words(s.name);
      const inText = new Set(words(s.description));
      const score = wanted.reduce(
        (sum, w) => sum + (inName.some((n) => same(n, w)) ? 3 : 0) + ([...inText].some((t) => same(t, w)) ? 1 : 0),
        0,
      );
      return { s, score: score > 0 && s.scope === 'project' ? score + 0.5 : score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}

/**
 * Todas as skills que a ferramenta do projeto enxerga: as do projeto (ligadas ou não) e as da pasta
 * do usuário e dos plugins, sem repetir nome (a do projeto vale). Ordem: projeto, global, plugins.
 */
export function skillCatalog(s: BoardState): CatalogSkill[] {
  const items = (s.harness.inventory.find((t) => t.tool === s.board.aiTool)?.items ?? []).filter((i) => i.kind === 'skill');
  const byName = new Map<string, CatalogSkill>();
  for (const k of s.harness.skills) byName.set(k.name, { name: k.name, description: k.description, scope: 'project' });
  for (const i of items) {
    const current = byName.get(i.name);
    const scope = i.scope;
    // a cópia do projeto vale sobre a global; entre global e plugin, a global
    if (current && (current.scope === 'project' || scope === 'plugin')) continue;
    byName.set(i.name, { name: i.name, description: i.description, scope, plugin: i.plugin });
  }
  const order = { project: 0, user: 1, plugin: 2 };
  return [...byName.values()].sort((a, b) => order[a.scope] - order[b.scope] || a.name.localeCompare(b.name));
}
