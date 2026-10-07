// Tabela de preços embutida: os preços oficiais dos modelos da lista embutida (`BUILTIN` em
// src/extension/models.ts), lidos das páginas oficiais na data de conferência. É um módulo
// compartilhado (sem `fs`, sem importar nada de src/extension) porque o webview também usa.
//
// Regra de conferência: a cada versão publicada os números são conferidos nas páginas abaixo e
// `checkedAt` passa a ser a data da conferência (ver "Preços dos modelos" no README).

import type { AiTool } from './harness';
import type { ModelPrice } from './models';

/** Preço embutido de um modelo: os quatro números, quando foram conferidos e de onde saíram. */
export interface BuiltinPrice extends ModelPrice {
  /** AAAA-MM-DD em que os números foram conferidos na página oficial */
  checkedAt: string;
  /** página oficial de preços de onde saíram os números */
  url: string;
}

/** Página oficial de preços de cada ferramenta (no Copilot, a explicação dos pedidos premium). */
export const PRICE_URLS: Record<AiTool, string> = {
  claude: 'https://platform.claude.com/docs/en/about-claude/pricing',
  codex: 'https://developers.openai.com/api/docs/pricing',
  cursor: 'https://cursor.com/docs/models-and-pricing',
  kimi: 'https://platform.kimi.ai/docs/pricing/chat',
  copilot: 'https://docs.github.com/copilot/concepts/billing/copilot-requests',
};

const CHECKED = '2026-10-07';
const price = (tool: AiTool, input: number, output: number, cacheRead: number, cacheWrite: number): BuiltinPrice => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  checkedAt: CHECKED,
  url: PRICE_URLS[tool],
});

/**
 * US$ por milhão de tokens (entrada, saída, leitura de cache, criação de cache), tarifa base: sem a
 * Cursor Token Rate (regra do board) e sem o contexto longo do Codex (a CLI não separa os tokens).
 * Fora da tabela: `cursor:auto` e todo o Copilot (preço variável) e `kimi-code/kimi-for-coding`
 * (plano de assinatura, sem preço por token na página oficial).
 */
export const BUILTIN_PRICES: Record<string, BuiltinPrice> = {
  // Anthropic: "5m cache writes" é a criação de cache; "cache hits and refreshes" é a leitura
  'claude:fable': price('claude', 10, 50, 0.25, 12.5),
  'claude:opus': price('claude', 4, 20, 0.2, 5),
  // a tabela da página diz $0.20 na leitura de cache; o texto sobre cache diz $0.10 (0,05x): fica a tabela
  'claude:sonnet': price('claude', 2, 10, 0.2, 2.5),
  'claude:haiku': price('claude', 1, 5, 0.1, 1.25),
  // OpenAI, contexto curto (até 272k tokens de entrada): input, output, cached input, cache writes
  'codex:gpt-6.1-sol': price('codex', 2, 10, 0.1, 2.5),
  'codex:gpt-6-astra': price('codex', 10, 50, 1, 12.5),
  'codex:gpt-6-luna': price('codex', 0.1, 0.5, 0.01, 0.125),
  // Cursor: a coluna "Cache write" do Composer 2.5 vem com "-" (sem tarifa própria): a criação de
  // cache é cobrada como entrada comum
  'cursor:composer-2.5': price('cursor', 0.5, 2.5, 0.2, 0.5),
  // Moonshot: preço da API do kimi-k3 (o K3 do Kimi Code é o mesmo modelo); criação = cache write de 5 min
  'kimi:kimi-code/k3': price('kimi', 3, 15, 0.3, 3),
};

/** Dias desde a conferência a partir dos quais a aba Modelos avisa que o preço pode estar velho. */
export const PRICE_STALE_DAYS = 60;

/** O preço embutido de um id do catálogo, ou `null` se o modelo não tem tabela. */
export const builtinPrice = (id: string): BuiltinPrice | null => BUILTIN_PRICES[id] ?? null;

const utcDay = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / 86_400_000;

/**
 * Se a conferência tem mais de `PRICE_STALE_DAYS` dias, contando dias inteiros em UTC: exatamente
 * 60 dias não é velho, 61 é. Data inválida ou ausente conta como velha (melhor avisar que esconder).
 */
export function priceIsStale(checkedAt: string, today: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkedAt ?? '');
  if (!m) return true;
  const checked = utcDay(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!Number.isFinite(checked)) return true;
  const now = utcDay(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  return now - checked > PRICE_STALE_DAYS;
}
