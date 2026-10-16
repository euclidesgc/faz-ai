import { useSyncExternalStore } from 'react';
import type { Locale } from '../../shared/language';
import { BOARD_NOTICES_EN, DEFAULT_NAMES_EN, EN } from './en';

// Internacionalização. O texto em português é a chave: `t('Novo card')`. Em português, a chave volta como está;
// em inglês, vem de ./en. O que falta no dicionário aparece em português (e o teste de i18n barra a omissão).
// Parâmetros usam `{nome}`; texto com negrito ou código usa `rich` (./rich.tsx).

let current: Locale = 'pt-BR';
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  listeners.forEach((fn) => fn());
}

/** Idioma que vale agora; muda quando a pessoa troca o idioma. Quem usa a chave `key` abaixo remonta a tela inteira ao trocar. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLocale,
    getLocale,
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Dictionary = Record<string, string>;
type Pattern = { re: RegExp; names: string[]; value: string; weight: number };

/** Entradas de um dicionário com `{parâmetro}`, como expressões: casam textos que já chegaram preenchidos (mensagens do host). */
const patternCache = new Map<Dictionary, { signature: string; patterns: Pattern[] }>();
function matchPatterns(dict: Dictionary, text: string): string | undefined {
  // recalcula só se as chaves do dicionário mudaram (nos testes ele recebe entradas)
  const signature = Object.keys(dict).join('\u0000');
  let cached = patternCache.get(dict);
  if (cached?.signature !== signature) {
    cached = { signature, patterns: buildPatterns(dict) };
    patternCache.set(dict, cached);
  }
  for (const p of cached.patterns) {
    const m = p.re.exec(text);
    if (m) return fill(p.value, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]!])));
  }
  return undefined;
}

function buildPatterns(dict: Dictionary): Pattern[] {
  return Object.entries(dict)
    .filter(([k]) => /\{\w+\}/.test(k))
    .map(([k, value]) => {
      const names: string[] = [];
      const src = escapeRe(k).replace(/\\\{(\w+)\\\}/g, (_m, n: string) => {
        names.push(n);
        return '(.+?)';
      });
      return { re: new RegExp(`^${src}$`, 's'), names, value, weight: k.replace(/\{\w+\}/g, '').length };
    })
    .sort((a, b) => b.weight - a.weight);
}

export type Params = Record<string, string | number>;

export function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, n: string) => (n in params ? String(params[n]) : m)) : text;
}

/** O dicionário em inglês para um texto em português; undefined se não houver. */
export function translation(key: string): string | undefined {
  return current === 'en' ? (EN[key] ?? matchPatterns(EN, key)) : undefined;
}

/** Traduz um texto da interface. O texto em português é a chave; `{nome}` é preenchido por `params`. */
export function t(key: string, params?: Params): string {
  return fill(translation(key) ?? key, params);
}

/**
 * Um comentário que o board escreveu na conversa, no idioma da interface. Só os avisos do gitflow e os do limite de uso
 * são traduzidos: o board os grava em português e o idioma só se resolve na tela. O resto (autopiloto, merge) fica como
 * foi escrito, e por isso o casamento é só contra as chaves desses avisos: os moldes curtos do dicionário inteiro, como
 * '{a} e {b}', casariam com qualquer frase que tenha " e ".
 */
export function translateBoardNotice(body: string): string {
  if (current !== 'en') return body;
  return BOARD_NOTICES_EN[body] ?? matchPatterns(BOARD_NOTICES_EN, body) ?? body;
}

/**
 * Nome de um item que o board cria sozinho (coluna, tipo, campo, opção, agente padrão) no idioma da interface. O nome
 * guardado continua em português, que é o que o resto do sistema reconhece; o que a pessoa criou ou renomeou fica como está.
 */
export function dt(name: string): string {
  return current === 'en' ? (DEFAULT_NAMES_EN[name] ?? name) : name;
}

/** Singular ou plural conforme `n`; os dois textos são chaves e recebem `{n}`. */
export function tn(n: number, one: string, many: string, params?: Params): string {
  return t(n === 1 ? one : many, { n, ...params });
}

/** Hora no idioma da interface, com a data curta na frente quando não é o mesmo dia de `now` (a pausa por limite pode ir até a semana seguinte). */
export function formatClock(ms: number, now: number): string {
  const locale = current === 'en' ? 'en-US' : 'pt-BR';
  const d = new Date(ms);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date(now).toDateString()
    ? time
    : `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${time}`;
}

/** Data e hora no idioma da interface. */
export const formatDateTime = (ms: number): string => new Date(ms).toLocaleString(current === 'en' ? 'en-US' : 'pt-BR');
