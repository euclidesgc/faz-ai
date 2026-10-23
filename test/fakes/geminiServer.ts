// Um servidor HTTP falso da API do Gemini (`generateContent`), no próprio computador (127.0.0.1, porta
// livre): o driver do modo API fala com ele por `fetch` de verdade, sem nenhuma chamada de rede para fora.
// Compartilhado pelo teste do driver (geminiApi), pelo do gateway (aiGatewayApi) e pelo cenário do card.
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface GeminiRequest {
  method: string;
  /** o caminho com a consulta, como chegou (para conferir que a chave nunca vai nela) */
  url: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/** A resposta de um turno: um status com JSON, ou `hang` (segura o pedido até o cliente desistir). */
export type GeminiTurn = { status?: number; json: unknown } | 'hang';

export interface FakeGemini {
  /** a raiz que o driver usa no lugar de `https://generativelanguage.googleapis.com/v1beta` */
  endpoint: string;
  requests: GeminiRequest[];
  /** quantos pedidos o cliente abandonou antes da resposta (Parar, tempo limite) */
  aborted: number;
  /** espera o pedido de número `n` (1, 2, …) chegar */
  waitRequest(n: number): Promise<void>;
  close(): Promise<void>;
}

/** Os turnos são consumidos em ordem; depois do último, o servidor responde 500. */
export async function fakeGemini(turns: GeminiTurn[] | ((body: any, n: number, url: string) => GeminiTurn)): Promise<FakeGemini> {
  const requests: GeminiRequest[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  const state = { aborted: 0 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      for (const w of waiters.filter((x) => requests.length >= x.n)) w.resolve();
      const n = requests.length;
      const turn =
        typeof turns === 'function'
          ? turns(body, n, req.url ?? '')
          : (turns[n - 1] ?? { status: 500, json: { error: { message: 'sem turno' } } });
      if (turn === 'hang') {
        res.on('close', () => {
          if (!res.writableEnded) state.aborted++;
        });
        return;
      }
      res.writeHead(turn.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(turn.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}/v1beta`,
    requests,
    get aborted() {
      return state.aborted;
    },
    waitRequest: (n) => (requests.length >= n ? Promise.resolve() : new Promise<void>((resolve) => waiters.push({ n, resolve }))),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A lista de modelos da conta (`GET /models`), como a API devolve: a conferência da chave no Conectar. */
export const modelsList = (...names: string[]) => ({
  json: { models: names.map((name) => ({ name: `models/${name}`, displayName: name, supportedGenerationMethods: ['generateContent'] })) },
});

/** Uma resposta do modelo com as partes dadas e o consumo, como o `generateContent` devolve. */
export const modelTurn = (
  parts: unknown[],
  usage: Record<string, number> = { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
  finishReason = 'STOP',
) => ({ json: { candidates: [{ content: { role: 'model', parts }, finishReason, index: 0 }], usageMetadata: usage } });
