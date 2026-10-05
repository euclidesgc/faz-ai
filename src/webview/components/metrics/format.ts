import type { MetricsPanelResult } from '../../../shared/metrics';
import { getLocale, t } from '../../i18n';

// Formatação do painel de métricas no idioma da interface. Tudo que um bloco escreve como número passa
// por aqui, para "não medido" nunca virar "US$ 0,00" (RF-18) e o mesmo valor sair igual em todo lugar.

// Unidades de duração e o "a" entre as datas saem do locale, como os números do `Intl`, e não do
// dicionário: uma chave só de parâmetros ("{h}h{m}min", "{from} a {to}") viraria um padrão que casa
// com qualquer mensagem do host terminada em "min" ou com " a " no meio (ver `matchPatterns` em i18n).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const isEn = (): boolean => getLocale() === 'en';

/** O locale do `Intl` para o idioma da interface. */
export const intlLocale = (): string => (isEn() ? 'en-US' : 'pt-BR');

/** Inteiro com separador de milhar: "12.345" / "12,345". */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(n);
}

/** Número curto para caber num total ou num rótulo de eixo: "1,2 mi" / "1.2M". O valor exato vai na tabela. */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * Dólares: "US$ 1,23" / "$1.23". Custo de uma execução costuma ficar abaixo de um centavo; ali vão
 * quatro casas, para não aparecer "US$ 0,00" onde houve gasto.
 */
export function formatMoney(usd: number): string {
  const tiny = usd !== 0 && Math.abs(usd) < 0.01;
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: tiny ? 4 : 2,
  }).format(usd);
}

/** Texto de um valor que não foi medido (`null` no contrato). Nunca "0". */
export const unmeasured = (): string => t('não medido');

/** Custo, ou "não medido" quando o contrato traz `null`. */
export const formatCost = (usd: number | null): string => (usd === null ? unmeasured() : formatMoney(usd));

/** Tokens, ou "não medido" quando o contrato traz `null`. `compact` encurta para o total. */
export const formatTokens = (n: number | null, compact = false): string =>
  n === null ? unmeasured() : compact ? formatCompact(n) : formatNumber(n);

/**
 * Duração somada: "3h12min", "45min", "30s" (em inglês "3h 12m", "45m", "30s"). Sem dias de
 * propósito: o tempo de IA é soma de execuções e pode passar de 24h sem ser "1 dia" de relógio.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  if (total < MINUTE) return `${Math.round(total / 1000)}s`;
  const h = Math.floor(total / HOUR);
  const m = Math.floor((total % HOUR) / MINUTE);
  const min = isEn() ? 'm' : 'min';
  if (h === 0) return `${m}${min}`;
  return `${formatNumber(h)}h${isEn() ? ' ' : ''}${String(m).padStart(2, '0')}${min}`;
}

/**
 * Permanência e lead time, em dias e horas: "3d 4h", "2d", "5h", "45min" (em inglês "45m"). `null` é
 * "desconhecido" (RF-16), nunca "0". Abaixo de uma hora vai em minutos; abaixo de um minuto, "menos de 1min".
 * Não há segundos nem semanas: é tempo de relógio que um card passou numa fase, não duração de execução.
 */
export function formatSpan(ms: number | null): string {
  if (ms === null) return t('desconhecido');
  const total = Math.max(0, Math.round(ms));
  const min = isEn() ? 'm' : 'min';
  if (total < MINUTE) return t('menos de 1min');
  if (total < HOUR) return `${Math.floor(total / MINUTE)}${min}`;
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  if (days === 0) return `${hours}h`;
  return hours === 0 ? `${formatNumber(days)}d` : `${formatNumber(days)}d ${hours}h`;
}

/** 'AAAA-MM-DD' como data local (o log grava o dia no fuso da máquina). */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** 'AAAA-MM' como o dia 1 daquele mês, local. */
function parseMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, 1);
}

/** Dia: `long` "4 de outubro de 2026" / "October 4, 2026"; `short` "04/10/2026" / "10/4/2026". '' fica ''. */
export function formatDay(day: string, style: 'long' | 'short' = 'long'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const opts: Intl.DateTimeFormatOptions = style === 'long' ? { dateStyle: 'long' } : { day: 'numeric', month: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(intlLocale(), opts).format(parseDay(day));
}

/**
 * Mês: `short` "out" / "Oct" (rótulo de eixo), `medium` "out/2026" / "Oct 2026" (tabela),
 * `long` "outubro de 2026" / "October 2026" (texto corrido e aria-label).
 */
export function formatMonth(month: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const date = parseMonth(month);
  if (style === 'long') return new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(date);
  // o pt-BR abrevia com ponto ("out."): no eixo e na tabela ele só ocupa lugar
  const name = new Intl.DateTimeFormat(intlLocale(), { month: 'short' }).format(date).replace(/\.$/, '');
  if (style === 'short') return name;
  return isEn() ? `${name} ${date.getFullYear()}` : `${name}/${date.getFullYear()}`;
}

/**
 * O recorte consultado, com as datas das bordas (RF-03): "4 de outubro de 2026 a 4 de outubro de 2026".
 * Lado vazio (board sem log) vira "desde …" / "até …"; os dois vazios, ''.
 */
export function formatRange(range: MetricsPanelResult['range']): string {
  const from = formatDay(range.startDate);
  const to = formatDay(range.endDate);
  if (from && to) return isEn() ? `${from} to ${to}` : `${from} a ${to}`;
  if (from) return isEn() ? `since ${from}` : `desde ${from}`;
  if (to) return isEn() ? `until ${to}` : `até ${to}`;
  return '';
}

/** Período sem dado nenhum: todo mês da espinha é lacuna. A tela não escreve "0" em total nenhum (RF-07). */
export const isEmptyResult = (result: MetricsPanelResult): boolean => result.months.every((m) => !m.present);
