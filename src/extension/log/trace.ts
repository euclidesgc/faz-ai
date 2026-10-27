import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatTrace, summarize, type TraceEntry } from '../../shared/trace';
import type { RunLog } from './runLog';

/** Quantos dias de rastreio ficam guardados; os arquivos mais velhos são apagados ao abrir o board. */
export const TRACE_KEEP_DAYS = 7;

/** Grava o rastreio do board: uma linha JSON por evento, num arquivo por dia. */
export interface Trace {
  write(entry: Omit<TraceEntry, 'at'> & { at?: number }): void;
  /** o arquivo do dia, onde a pessoa abre o rastreio */
  file(): string;
}

/** O rastreio que não grava nada: o padrão dos testes e de quem não passa um. */
export const NO_TRACE: Trace = { write: () => {}, file: () => '' };

/** 'AAAA-MM-DD' no fuso da máquina. */
function day(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Apaga os arquivos com mais de `TRACE_KEEP_DAYS` dias: o rastreio e o log do protocolo ACP (`acp-*`, e o
 * `acp-poc-*` das versões antigas), que ficam na mesma pasta e, sem isso, só cresciam.
 */
export function pruneTrace(dir: string, now = Date.now()): void {
  const oldest = day(now - TRACE_KEEP_DAYS * 86_400_000);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const m = /^(?:trace|acp|acp-poc)-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
    if (m && m[1]! < oldest) fs.rmSync(path.join(dir, name), { force: true });
  }
}

/**
 * Abre o rastreio na pasta `dir`. A gravação é em fila e em lote (um `appendFile` por vez), para não segurar
 * o host a cada clique. Falha de disco não derruba nada: vai uma vez para `log` e o rastreio para.
 * `mirror` repete cada linha em `log`, legível (a variável `FAZAI_TRACE=1`).
 */
export function createTrace(dir: string, log: (line: string) => void, mirror = false): Trace {
  let buffer: string[] = [];
  let writing = false;
  let broken = false;
  // a janela do editor fica aberta por dias: a limpeza roda ao abrir e de novo a cada dia novo
  let prunedDay = day(Date.now());
  try {
    fs.mkdirSync(dir, { recursive: true });
    pruneTrace(dir);
  } catch (e) {
    broken = true;
    log(`Rastreio do board desligado: ${e instanceof Error ? e.message : String(e)}`);
  }
  const fileOf = (at: number) => path.join(dir, `trace-${day(at)}.jsonl`);
  const drain = () => {
    if (writing || !buffer.length || broken) return;
    writing = true;
    const lines = buffer;
    buffer = [];
    const today = day(Date.now());
    if (today !== prunedDay) {
      prunedDay = today;
      try {
        pruneTrace(dir);
      } catch {
        // um arquivo que não sai fica para a próxima: o rastreio continua
      }
    }
    // o arquivo é o do dia em que o lote é gravado: as linhas da virada da meia-noite caem no dia novo
    fs.appendFile(fileOf(Date.now()), lines.join(''), (err) => {
      writing = false;
      if (err) {
        broken = true;
        log(`Rastreio do board desligado: ${err.message}`);
        return;
      }
      drain();
    });
  };
  return {
    write(entry) {
      if (broken) return;
      const full: TraceEntry = { at: Date.now(), ...entry } as TraceEntry;
      if (mirror) log(formatTrace(full));
      try {
        buffer.push(`${JSON.stringify(full)}\n`);
      } catch {
        // um valor que não vira JSON (ciclo) não pode derrubar a ação que estava sendo rastreada
        buffer.push(`${JSON.stringify({ ...full, data: '[não serializável]' })}\n`);
      }
      drain();
    },
    file: () => fileOf(Date.now()),
  };
}

/** O `RunLog` que, além de gravar, rastreia o começo e o fim de cada execução de IA. */
export function tracedRunLog(inner: RunLog, trace: Trace): RunLog {
  const started = new Map<string, number>();
  return {
    ...inner,
    start(meta) {
      const id = inner.start(meta);
      started.set(id, Date.now());
      trace.write({
        src: 'run',
        ev: 'run.start',
        type: meta.tool,
        rid: id,
        data: { card: meta.cardNumber, origin: meta.origin, phase: meta.phase },
      });
      return id;
    },
    describe(id, config) {
      inner.describe(id, config);
      trace.write({ src: 'run', ev: 'run.describe', rid: id, data: summarize(config) });
    },
    finish(id, outcome, exitCode) {
      inner.finish(id, outcome, exitCode);
      const at = started.get(id);
      started.delete(id);
      trace.write({
        src: 'run',
        ev: 'run.finish',
        rid: id,
        ms: at === undefined ? undefined : Date.now() - at,
        ok: outcome === 'done',
        data: { outcome, exitCode },
      });
    },
  };
}
