// O casador de glob das ferramentas locais do modo API (épica "ferramenta por modo", história 11). O padrão
// vem do modelo, então ele não pode virar uma expressão regular com retrocesso: `**/` repetido vinte vezes
// virava `(?:.*/)?` vinte vezes, e um caminho que não casa levava tempo exponencial na thread do editor.
// Aqui o casamento é em tempo polinomial e sem expressão regular sobre o caminho:
// - o caminho e o padrão são separados por `/`; `**` seguidos viram um só, e o casamento entre os trechos é
//   uma tabela (trecho do padrão × trecho do caminho), sem recursão;
// - dentro de um trecho, `*`, `?` e `[...]` casam pelo algoritmo de dois ponteiros (volta só à última
//   estrela), também polinomial; `*` seguidos viram um só;
// - `{a,b}` é expandido antes, com limite de alternativas e de tamanho.

/** Limites do padrão: acima deles a ferramenta recusa, em vez de gastar tempo. */
export const GLOB_LIMITS = { chars: 1000, alternatives: 64, segments: 64 };

/** O padrão não cabe nos limites ou está malformado: a mensagem volta ao modelo. */
export class GlobError extends Error {}

type Token = { t: 'char'; c: string } | { t: 'any' } | { t: 'star' } | { t: 'class'; neg: boolean; ranges: [string, string][] };

/** Expande `{a,b}` (inclusive aninhado) nas alternativas, com limite. Sem chave fechada, a chave é literal. */
function expandBraces(pattern: string): string[] {
  let open = -1;
  let depth = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        const body = pattern.slice(open + 1, i);
        const parts: string[] = [];
        let level = 0;
        let start = 0;
        for (let j = 0; j < body.length; j++) {
          if (body[j] === '{') level++;
          else if (body[j] === '}') level--;
          else if (body[j] === ',' && level === 0) {
            parts.push(body.slice(start, j));
            start = j + 1;
          }
        }
        parts.push(body.slice(start));
        const head = pattern.slice(0, open);
        const tail = pattern.slice(i + 1);
        const out: string[] = [];
        for (const part of parts)
          for (const expanded of expandBraces(head + part + tail)) {
            out.push(expanded);
            if (out.length > GLOB_LIMITS.alternatives)
              throw new GlobError(`O padrão tem alternativas demais (o limite é ${GLOB_LIMITS.alternatives}).`);
          }
        return out;
      }
    }
  }
  return [pattern];
}

/** Um trecho do padrão (sem `/`) em fichas; `*` seguidos viram um só. */
function tokens(segment: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i]!;
    if (c === '*') {
      if (out.at(-1)?.t !== 'star') out.push({ t: 'star' });
    } else if (c === '?') out.push({ t: 'any' });
    else if (c === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end < 0) {
        out.push({ t: 'char', c });
        continue;
      }
      let body = segment.slice(i + 1, end);
      const neg = body.startsWith('!') || body.startsWith('^');
      if (neg) body = body.slice(1);
      const ranges: [string, string][] = [];
      for (let j = 0; j < body.length; j++) {
        if (body[j + 1] === '-' && j + 2 < body.length) {
          ranges.push([body[j]!, body[j + 2]!]);
          j += 2;
        } else ranges.push([body[j]!, body[j]!]);
      }
      out.push({ t: 'class', neg, ranges });
      i = end;
    } else if (c === '\\' && i + 1 < segment.length) out.push({ t: 'char', c: segment[++i]! });
    else out.push({ t: 'char', c });
  }
  return out;
}

const fits = (token: Token, c: string): boolean => {
  if (token.t === 'any') return true;
  if (token.t === 'char') return token.c === c;
  if (token.t === 'class') return token.ranges.some(([a, b]) => c >= a && c <= b) !== token.neg;
  return false;
};

/** Casa um trecho pelo algoritmo de dois ponteiros: volta só à última estrela, então é O(n·m) no pior caso. */
function matchSegment(pattern: Token[], text: string): boolean {
  let p = 0;
  let i = 0;
  let star = -1;
  let mark = 0;
  while (i < text.length) {
    const token = pattern[p];
    if (token && token.t !== 'star' && fits(token, text[i]!)) {
      p++;
      i++;
    } else if (token?.t === 'star') {
      star = p++;
      mark = i;
    } else if (star >= 0) {
      p = star + 1;
      i = ++mark;
    } else return false;
  }
  while (pattern[p]?.t === 'star') p++;
  return p === pattern.length;
}

/** Um trecho do padrão: `**` (qualquer número de pastas) ou as fichas de um nome. */
type Segment = 'globstar' | Token[];

function compile(pattern: string, fold: boolean): Segment[] {
  const segments: Segment[] = [];
  for (const raw of (fold ? pattern.toLowerCase() : pattern).split('/')) {
    if (raw === '' || raw === '.') continue;
    if (raw === '**') {
      if (segments.at(-1) !== 'globstar') segments.push('globstar');
    } else segments.push(tokens(raw));
  }
  if (segments.length > GLOB_LIMITS.segments) throw new GlobError(`O padrão tem trechos demais (o limite é ${GLOB_LIMITS.segments}).`);
  return segments;
}

/** Os trechos do padrão contra os do caminho, por tabela: `done[i][j]` = o padrão a partir de i casa o caminho a partir de j. */
function matchPath(pattern: Segment[], parts: string[]): boolean {
  const P = pattern.length;
  const S = parts.length;
  let next = new Array<boolean>(S + 1).fill(false);
  next[S] = true;
  for (let i = P - 1; i >= 0; i--) {
    const row = new Array<boolean>(S + 1).fill(false);
    const segment = pattern[i]!;
    for (let j = S; j >= 0; j--) {
      if (segment === 'globstar') row[j] = next[j]! || (j < S && row[j + 1]!);
      else row[j] = j < S && next[j + 1]! && matchSegment(segment, parts[j]!);
    }
    next = row;
  }
  return next[0]!;
}

/**
 * O casador de um padrão de glob sobre um caminho relativo com `/`: `**`, `*`, `?`, `[abc]`, `[!a-z]` e
 * `{a,b}`. `fold` compara sem diferenciar maiúsculas (o sistema de arquivos do Windows e do macOS). Lança
 * `GlobError` quando o padrão passa dos limites.
 */
export function globMatcher(pattern: string, fold = false): (path: string) => boolean {
  if (pattern.length > GLOB_LIMITS.chars) throw new GlobError(`O padrão é longo demais (o limite é ${GLOB_LIMITS.chars} caracteres).`);
  const compiled = expandBraces(pattern).map((alternative) => compile(alternative, fold));
  return (path) => {
    const parts = (fold ? path.toLowerCase() : path).split('/').filter((p) => p !== '' && p !== '.');
    return compiled.some((segments) => matchPath(segments, parts));
  };
}
