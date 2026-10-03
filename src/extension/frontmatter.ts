/**
 * Valor de uma chave do frontmatter YAML (`fm` é o conteúdo entre os `---`). Entende o valor em
 * uma linha e os blocos `|` e `>` (com ou sem `-`/`+`), que viram uma linha só, de espaços simples.
 */
export function frontmatterValue(fm: string, key: string): string | undefined {
  const lines = fm.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (at < 0) return undefined;
  const value = lines[at]!.slice(key.length + 1).trim();
  if (/^[|>][+-]?$/.test(value)) {
    const block: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (l.trim() !== '' && !/^\s/.test(l)) break;
      block.push(l.trim());
    }
    return block.filter(Boolean).join(' ');
  }
  return value.replace(/^["']|["']$/g, '');
}

/** O frontmatter de um markdown (entre os `---` do começo), ou vazio. */
export const frontmatterOf = (content: string): string => /^---\r?\n([\s\S]*?)(\r?\n---|$)/.exec(content)?.[1] ?? '';
