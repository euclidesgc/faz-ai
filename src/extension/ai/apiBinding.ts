// O vínculo do modo API (épica "ferramenta por modo", história 9): a parte pura, sem rede. O driver de
// uma ferramenta pela API (história 10) chama `apiBinding` no `bindingContext` com a chave lida do cofre;
// a admissão canoniza e faz o hash. A chave entra só pelo digest, e nem o digest sai daqui em claro: o
// vínculo é gravado apenas como hash (no nome do arquivo de evidência e no recibo).
import { createHmac } from 'node:crypto';
import type { ApiBinding } from './drivers/types';

/**
 * Rótulo fixo do digest da chave. Um HMAC com rótulo, e não o SHA-256 puro, para o digest não servir de
 * consulta a uma tabela de hashes de chaves vazadas; e com versão, para trocar a regra sem confundir.
 */
const KEY_DIGEST_LABEL = 'faz-ai/api-key/v1';

/**
 * O digest da chave no vínculo. Diferente das variáveis de credencial do ambiente (que entram só pela
 * presença, para o token que gira não derrubar a prova), aqui a chave identifica a conta e o projeto com
 * que o board fala: outra chave é outro vínculo. A prova do modo API é refeita pelo host sem sonda, então
 * trocar a chave não custa uma verificação.
 */
export function apiKeyDigest(apiKey: string): string {
  // a mensagem nunca repete a chave: ela pode acabar num log ou na tela
  if (
    typeof apiKey !== 'string' ||
    !apiKey ||
    apiKey.length > 4096 ||
    /\s/.test(apiKey) ||
    [...apiKey].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  )
    throw new Error('Chave de API ausente ou inválida.');
  return createHmac('sha256', KEY_DIGEST_LABEL).update(apiKey).digest('hex');
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * O endpoint como entra no vínculo: a origem e o caminho, sem barra final. Recusa o que não é HTTPS (o
 * HTTP só no próprio computador, para o servidor falso dos testes), credencial na URL e parâmetros: a
 * API do Gemini aceita a chave em `?key=`, e ela nunca pode entrar no vínculo por esse caminho. A
 * mensagem não repete o endereço, pelo mesmo motivo.
 */
export function apiEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Endpoint da API inválido.');
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash) throw new Error('Endpoint da API inválido.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * A parte da ferramenta no vínculo do modo API, para o `bindingContext` do driver: endpoint, modelo,
 * versão da extensão e o digest da chave, sem executável. O modelo é obrigatório: a prova vale para um
 * modelo, e outro modelo é outro vínculo.
 */
export function apiBinding(o: {
  endpoint: string;
  model: string | null | undefined;
  extensionVersion: string;
  apiKey: string;
}): ApiBinding {
  if (typeof o.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(o.model))
    throw new Error('O modo API precisa de um modelo explícito.');
  if (typeof o.extensionVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(o.extensionVersion))
    throw new Error('Versão da extensão inválida para o vínculo do modo API.');
  return {
    api: {
      transport: 'api',
      endpoint: apiEndpoint(o.endpoint),
      model: o.model,
      extensionVersion: o.extensionVersion,
      keyDigest: apiKeyDigest(o.apiKey),
    },
  };
}
