/**
 * Hooks do Kimi Code: blocos `[[hooks]]` do `~/.kimi-code/config.toml` (documentação da CLI 2.1.1).
 * Funções puras sobre o texto, por linhas, sem dependência de TOML: o conjunto de campos é fechado em
 * quatro (`event`, `matcher`, `command`, `timeout`) e um campo a mais derruba o config inteiro da CLI.
 * O que não for reconhecido é preservado byte a byte e nunca é removido por heurística.
 */
export interface KimiHook {
  event: string;
  matcher: string;
  command: string;
  /** segundos; 0 = padrão da CLI (o campo é omitido) */
  timeout: number;
}

export const KIMI_HOOK_TIMEOUT = { min: 1, max: 600 } as const;

const FIELDS = new Set(['event', 'matcher', 'command', 'timeout']);

interface Block {
  /** primeira e última linha do bloco (a última não é vazia) */
  start: number;
  end: number;
  hook: KimiHook | null;
}

function parseValue(raw: string): string | number | null {
  const v = raw.trim();
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"') && !v.startsWith('"""')) {
    try {
      const s: unknown = JSON.parse(v);
      return typeof s === 'string' ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseBlock(lines: string[]): KimiHook | null {
  const found: Partial<Record<string, string | number>> = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.includes('"""') || t.includes("'''")) return null;
    const m = /^([A-Za-z_]+)\s*=\s*(.*)$/.exec(t);
    if (!m || !FIELDS.has(m[1]!)) return null;
    const value = parseValue(m[2]!);
    if (value === null || m[1]! in found) return null;
    found[m[1]!] = value;
  }
  const { event, matcher, command, timeout } = found;
  if (typeof event !== 'string' || typeof command !== 'string') return null;
  if (matcher !== undefined && typeof matcher !== 'string') return null;
  if (timeout !== undefined && typeof timeout !== 'number') return null;
  return { event, matcher: matcher ?? '', command, timeout: timeout ?? 0 };
}

function blocks(toml: string): Block[] {
  const lines = toml.split('\n');
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== '[[hooks]]') continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]!.trim().startsWith('[')) j++;
    let end = j - 1;
    while (end > i && !lines[end]!.trim()) end--;
    out.push({ start: i, end, hook: parseBlock(lines.slice(i + 1, end + 1)) });
    i = j - 1;
  }
  return out;
}

/** Lê os blocos `[[hooks]]` reconhecidos; `unknownBlocks` conta os que o board não sabe editar. */
export function parseKimiHooks(toml: string): { hooks: KimiHook[]; unknownBlocks: number } {
  const all = blocks(toml);
  return {
    hooks: all.flatMap((b) => (b.hook ? [b.hook] : [])),
    unknownBlocks: all.filter((b) => !b.hook).length,
  };
}

/** Valida evento (um dos `events`), comando e timeout (1–600, ou 0 para o padrão); devolve a mensagem de erro ou null. */
export function validateKimiHook(h: KimiHook, events: string[]): string | null {
  if (!events.includes(h.event)) return `Evento desconhecido: ${h.event || '(vazio)'}.`;
  if (!h.command.trim()) return 'Informe o comando do hook.';
  if (/[\r\n]|"""|'''/.test(h.command) || /[\r\n]/.test(h.matcher))
    return 'O comando e o filtro não podem ter quebra de linha nem aspas triplas.';
  if (h.timeout !== 0 && (!Number.isInteger(h.timeout) || h.timeout < KIMI_HOOK_TIMEOUT.min || h.timeout > KIMI_HOOK_TIMEOUT.max))
    return `O timeout vai de ${KIMI_HOOK_TIMEOUT.min} a ${KIMI_HOOK_TIMEOUT.max} segundos.`;
  return null;
}

/** Acrescenta o bloco ao final, preservando o texto anterior byte a byte. */
export function appendKimiHook(toml: string, h: KimiHook): string {
  const body = [
    '[[hooks]]',
    `event = ${JSON.stringify(h.event)}`,
    ...(h.matcher ? [`matcher = ${JSON.stringify(h.matcher)}`] : []),
    `command = ${JSON.stringify(h.command)}`,
    ...(h.timeout ? [`timeout = ${h.timeout}`] : []),
  ].join('\n');
  if (!toml) return `${body}\n`;
  return `${toml}${toml.endsWith('\n') ? '' : '\n'}\n${body}\n`;
}

/** Remove o primeiro bloco com este evento e comando; recusa se o que sobra de candidatos não é reconhecido. */
export function removeKimiHook(toml: string, event: string, command: string): string {
  const all = blocks(toml);
  const hit = all.find((b) => b.hook && b.hook.event === event && b.hook.command === command);
  if (!hit) {
    if (all.some((b) => !b.hook))
      throw new Error('Há blocos [[hooks]] que o board não reconhece neste arquivo. Abra o config.toml e edite-o à mão.');
    throw new Error('Hook não encontrado no arquivo. Atualize a lista e tente de novo.');
  }
  const lines = toml.split('\n');
  const from = hit.start > 0 && !lines[hit.start - 1]!.trim() ? hit.start - 1 : hit.start;
  lines.splice(from, hit.end - from + 1);
  return lines.join('\n');
}
