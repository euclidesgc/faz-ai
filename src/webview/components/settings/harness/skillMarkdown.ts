/** O SKILL.md em campos de formulário: nome, descrição, corpo e o resto do frontmatter, que não se perde ao salvar. */
export interface SkillParts {
  name: string;
  description: string;
  body: string;
  /** linhas do frontmatter que o editor não conhece (`allowed-tools`, ...), na ordem original */
  extra: string[];
}

const unquote = (v: string): string => {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s.startsWith("'") && s.endsWith("'") && s.length >= 2 ? s.slice(1, -1) : s;
};

export function parseSkill(src: string): SkillParts {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { name: '', description: '', body: src, extra: [] };
  const parts: SkillParts = { name: '', description: '', body: src.slice(m[0].length).replace(/^\r?\n/, ''), extra: [] };
  let current: 'name' | 'description' | null = null;
  for (const line of m[1]!.split(/\r?\n/)) {
    const key = /^(name|description):\s*(.*)$/.exec(line);
    if (key) {
      current = key[1] as 'name' | 'description';
      const value = /^[>|][+-]?$/.test(key[2]!.trim()) ? '' : unquote(key[2]!);
      parts[current] = value;
    } else if (current && /^\s+\S/.test(line)) {
      parts[current] = `${parts[current]} ${line.trim()}`.trim();
    } else {
      current = null;
      parts.extra.push(line);
    }
  }
  return parts;
}

export function composeSkill(p: SkillParts): string {
  const front = ['---', `name: ${p.name}`, `description: ${JSON.stringify(p.description.replace(/\s+/g, ' ').trim())}`, ...p.extra, '---'];
  return `${front.join('\n')}\n\n${p.body.replace(/^\s*\n/, '').replace(/\s+$/, '')}\n`;
}
