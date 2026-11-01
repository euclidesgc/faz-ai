// O log do protocolo da tela de Conectar agentes. Fica entre o SDK e o processo do agente e registra cada mensagem JSON-RPC nos dois
// sentidos, casando a resposta com o pedido (pelo sentido e pelo `id`) para medir o tempo de cada chamada.
// O SDK não expõe isso: sem o log, um `initialize` que demora (o npx baixando o pacote) e um agente travado
// parecem a mesma coisa na tela.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as acp from '@agentclientprotocol/sdk';
import type { ProtocolLogEntry } from '../../shared/agentConnect';

/** Quanto de uma mensagem vai para o log: um `session/update` com um arquivo inteiro não precisa ir todo. */
export const MAX_LOG_JSON = 20_000;

type Wire = Record<string, unknown>;

/**
 * Campos que nunca vão para o log: a chave do `authenticate` (`_meta["api-key"]`), tokens de acesso e senhas. Os
 * contadores de consumo (`inputTokens`, `totalTokens`, `token_count`) não são segredo e ficam: o "token" só esconde
 * quando é o nome inteiro ou vem de acesso, atualização, sessão ou autenticação.
 */
const SECRET_KEY =
  /(api.?key|secret|password|passwd|senha|authorization|credential|cookie|bearer|(^|[^a-z])token$|(access|refresh|id|session|auth).?token)/i;

/** A mensagem sem os valores secretos, trocados por `[oculto]`. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) && (typeof v === 'string' || typeof v === 'number') ? '[oculto]' : redact(v),
      ]),
    );
  }
  return value;
}

/** Corta cada texto do objeto em `max` caracteres, mantendo a estrutura (e o JSON válido). */
function shrink(value: unknown, max: number): unknown {
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…(+${value.length - max} caracteres)` : value;
  if (Array.isArray(value)) return value.map((v) => shrink(v, max));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shrink(v, max)]));
  return value;
}

/**
 * A mensagem em JSON, no máximo `MAX_LOG_JSON` caracteres, sempre parseável: corta os textos internos (a saída
 * de um comando, um arquivo lido), cada vez mais, em vez de cortar o JSON no meio. Cortar no meio deixava a linha
 * ilegível, e com ela o status que vinha junto (uma ferramenta parecia não terminar).
 */
export function compactJson(msg: unknown): string {
  const full = JSON.stringify(msg);
  if (full.length <= MAX_LOG_JSON) return full;
  for (const max of [4000, 1000, 200, 40]) {
    const text = JSON.stringify(shrink(msg, max));
    if (text.length <= MAX_LOG_JSON) return text;
  }
  // sobrou estrutura demais (milhares de itens): fica o aviso, ainda em JSON
  return JSON.stringify({ cortado: true, caracteres: full.length, inicio: full.slice(0, 2000) });
}

/** O resumo de uma mensagem: o tipo do aviso, o motivo do fim do turno, o erro. */
function summaryOf(msg: Wire, method: string | null): string {
  const params = (msg.params ?? {}) as Wire;
  const result = (msg.result ?? {}) as Wire;
  const error = msg.error as Wire | undefined;
  if (error) return `${String(error.code)} ${String(error.message ?? '')}`.trim();
  if (method === 'session/update') return String(((params.update ?? {}) as Wire).sessionUpdate ?? '');
  if (method === 'session/prompt' && 'stopReason' in result) return String(result.stopReason);
  if (method === 'session/request_permission' && 'outcome' in result) {
    const outcome = result.outcome as Wire;
    return String(outcome.optionId ?? outcome.outcome ?? '');
  }
  if (method === 'session/request_permission' && params.toolCall) return String((params.toolCall as Wire).title ?? '');
  return '';
}

export class ProtocolLog {
  private seq = 0;
  /** pedidos sem resposta, por sentido e `id`: o método e quando saiu */
  private pending = new Map<string, { method: string; at: number }>();

  constructor(
    private emit: (entry: ProtocolLogEntry) => void,
    private now: () => number = Date.now,
  ) {}

  /** Um fato do processo do agente (iniciou, saiu), na mesma linha do tempo das mensagens. */
  process(summary: string): void {
    this.push({ dir: 'process', kind: 'process', method: null, id: null, ms: null, summary, json: '' });
  }

  /** Uma linha que o agente escreveu no `stderr`: fora do protocolo, mas é onde fica o motivo de um travamento. */
  stderr(line: string): void {
    this.push({ dir: 'process', kind: 'stderr', method: null, id: null, ms: null, summary: line, json: '' });
  }

  /** Registra uma mensagem que passou pelo canal. */
  record(dir: 'out' | 'in', msg: acp.AnyMessage): void {
    const wire = msg as unknown as Wire;
    const id = (wire.id ?? null) as string | number | null;
    const at = this.now();
    let kind: ProtocolLogEntry['kind'];
    let method = typeof wire.method === 'string' ? wire.method : null;
    let ms: number | null = null;
    if (method && id !== null) {
      kind = 'request';
      this.pending.set(`${dir}:${id}`, { method, at });
    } else if (method) {
      kind = 'notification';
    } else {
      // a resposta vai no sentido contrário do pedido
      const key = `${dir === 'out' ? 'in' : 'out'}:${id}`;
      const asked = this.pending.get(key);
      this.pending.delete(key);
      method = asked?.method ?? null;
      ms = asked ? at - asked.at : null;
      kind = wire.error ? 'error' : 'response';
    }
    this.push({ dir, kind, method, id, ms, summary: summaryOf(wire, method), json: compactJson(redact(msg)) }, at);
  }

  /** Põe o log no meio do canal do SDK: cada mensagem é registrada e segue adiante sem mudança. */
  tap(stream: acp.Stream): acp.Stream {
    const outgoing = new TransformStream<acp.AnyMessage, acp.AnyMessage>({
      transform: (msg, ctl) => {
        this.record('out', msg);
        ctl.enqueue(msg);
      },
    });
    const incoming = new TransformStream<acp.AnyMessage, acp.AnyMessage>({
      transform: (msg, ctl) => {
        this.record('in', msg);
        ctl.enqueue(msg);
      },
    });
    // o fim ou o erro de um lado chega ao outro: o SDK percebe a conexão fechada como antes
    void outgoing.readable.pipeTo(stream.writable).catch(() => {});
    void stream.readable.pipeTo(incoming.writable).catch(() => {});
    return { writable: outgoing.writable, readable: incoming.readable };
  }

  private push(entry: Omit<ProtocolLogEntry, 'seq' | 'at'>, at = this.now()): void {
    this.emit({ seq: ++this.seq, at, ...entry });
  }
}

/** 'AAAA-MM-DD' no fuso da máquina, como os arquivos do rastreio. */
function day(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * O arquivo do log, um JSONL por dia ao lado do rastreio do board (`acp-poc-AAAA-MM-DD.jsonl`). Grava o JSON
 * inteiro de cada mensagem, inclusive o texto dos prompts e das respostas: é o que o rastreio omite de propósito,
 * e o que um diagnóstico da conexão precisa. Fica na máquina, na pasta de dados do board.
 */
export class ProtocolLogFile {
  private chain: Promise<void> = Promise.resolve();

  constructor(private dir: string) {}

  /** O arquivo de hoje (ou do dia de `at`). */
  file(at: number = Date.now()): string {
    return path.join(this.dir, `acp-${day(at)}.jsonl`);
  }

  /** Acrescenta a linha na ordem em que chegou; uma falha de disco não derruba a conexão. */
  append(entry: ProtocolLogEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    this.chain = this.chain
      .then(async () => {
        await fs.mkdir(this.dir, { recursive: true });
        await fs.appendFile(this.file(entry.at), line, 'utf8');
      })
      .catch(() => {});
  }

  /** Espera as gravações pendentes (os testes leem o arquivo logo depois). */
  flush(): Promise<void> {
    return this.chain;
  }
}
