// Estreitamento do que vem de `JSON.parse` da saída de uma CLI de terceiro. O formato muda de
// versão para versão, então aqui nada é assumido: campo ausente é ausente, e campo com o tipo
// errado também. Nenhuma destas funções inventa zero nem string vazia para o que falta — é a regra
// da skill `error-handling` aplicada a dinheiro: um `0` soma e parece certo.

export type Json = Record<string, unknown>;

export const asObject = (v: unknown): Json | null => (!!v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

/** A string, ou `null` quando o campo falta, não é string ou está vazia. */
export const asText = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** O número, ou `null`. `NaN` e `Infinity` contam como ausentes: não são medida de nada. */
export const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Corta o texto no tamanho dado, com reticências, para o canal de log não virar despejo de saída. */
export const cut = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);
