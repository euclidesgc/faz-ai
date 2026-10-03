import { useSyncExternalStore } from 'react';
import type { Locale } from '../../shared/language';
import { DEFAULT_NAMES_EN, EN } from './en';

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

/** Entradas do dicionário com `{parâmetro}`, como expressões: casam textos que já chegaram preenchidos (mensagens do host). */
let patterns: { re: RegExp; names: string[]; value: string; weight: number }[] = [];
let patternsFor = '';
function matchPatterns(text: string): string | undefined {
  // recalcula só se as chaves do dicionário mudaram (nos testes ele recebe entradas)
  const signature = Object.keys(EN).join('\u0000');
  if (signature !== patternsFor) {
    patternsFor = signature;
    patterns = buildPatterns();
  }
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) return fill(p.value, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]!])));
  }
  return undefined;
}

function buildPatterns(): typeof patterns {
  return Object.entries(EN)
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
  return current === 'en' ? (EN[key] ?? matchPatterns(key)) : undefined;
}

/** Traduz um texto da interface. O texto em português é a chave; `{nome}` é preenchido por `params`. */
export function t(key: string, params?: Params): string {
  return fill(translation(key) ?? key, params);
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

/** Data e hora no idioma da interface. */
export const formatDateTime = (ms: number): string => new Date(ms).toLocaleString(current === 'en' ? 'en-US' : 'pt-BR');
