// O transporte da execução medida: monta o comando no modo estruturado, inicia o processo, passa
// cada pedaço de `stdout` pelo partidor de linhas e pelo leitor, e devolve o mesmo
// `RunningProcess` de sempre mais um `report()` lido no fim.
//
// Duas coisas que valem dinheiro e por isso são regra, não gosto:
//
// 1. **A volta para texto acontece uma vez, e só com a recusa comprovada do formato.** Morrer sem
//    um único evento reconhecido NÃO prova que nada aconteceu: a CLI pode ter alterado arquivos ou
//    chamado o board e caído (rede, cota, queda) antes de o leitor entender um evento, e repetir
//    duplicaria o efeito e o consumo. Só repete quando a tentativa estruturada saiu sozinha com
//    erro, sem escrever nada no `stdout`, e o `stderr` recusou um dos argumentos que só o modo
//    estruturado acrescenta (a CLI recusa o argumento antes de começar). Qualquer outra falha sem
//    evento termina ali, com o motivo `MeasureEndedError` e o consumo desconhecido. Se morreu DEPOIS
//    de eventos, o trabalho aconteceu: também não repete. E se saiu com código 0 sem evento nenhum,
//    a CLI respondeu em texto: não repete, e as linhas viram a resposta, sem medição. A segunda
//    tentativa é o mesmo comando sem os argumentos do formato: as restrições (permissão, ferramentas,
//    servidores) vão iguais.
// 2. **O `onExit` de quem chamou dispara uma vez só**, no fim da última tentativa. É isso que
//    mantém o executor de cards e o chat sem máquina de estado nova.
//
// O `stderr` vai direto para o `log` de quem chamou, com o seu próprio partidor de linhas, sem passar
// pelo leitor: é texto de gente, e dentro do interpretador de JSONL viraria "saída quebrada".
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { aiToolInfo, type AiTool } from '../../shared/harness';
import type { RunReport } from '../../shared/log';
import { ensureProjectServer } from '../mcp/clientConfig';
import { headlessCommand, tmpArg, type HeadlessCommand, type HeadlessInput } from '../headless';
import type { RunningProcess } from '../runner';
import { MeasureBrokenError, MeasureEndedError, MeasureIgnoredError, MeasureRefusedError, type MeasureError } from './errors';
import { cut } from './json';
import { lineSplitter } from './lines';
import type { OutputReader, OutputStream } from './reader';
import { providerFor } from '../ai/providers';
import { textReader } from './text';

/** Como o board inicia um processo da CLI. O `out` recebe de qual canal cada pedaço veio. */
export type SpawnFn = (command: HeadlessCommand, cwd: string, out: (text: string, stream: OutputStream) => void) => RunningProcess;

export interface MeasuredDeps {
  spawn: SpawnFn;
  /**
   * Cada linha legível que a ferramenta produziu, mais os recados do board sobre a execução (a
   * chamada, a volta para texto). Quem chama decide para onde vão: o executor de cards manda para o
   * canal do editor e para o `tail` da falha; o chat guarda para a resposta e para o `tail` do erro.
   */
  log: (line: string) => void;
  /** o id da execução em `ai_runs`, para o canal identificar a chamada; ausente ou '' quando o log não gravou */
  runId?: string;
}

export interface Measured {
  /** O mesmo contrato de sempre: `onExit` dispara uma vez, `kill` encerra a tentativa em curso. */
  proc: RunningProcess;
  /** O acumulado da execução, para ler no `onExit`. */
  report: () => RunReport;
  /** por que a medição não aconteceu (a classe diz o caso); null quando foi medida */
  failure: () => MeasureError | null;
}

/** Tamanho de cada argumento na linha que mostra a chamada, como o executor já cortava. */
const ARG_MAX = 80;

/** Tamanho da linha de evento pela metade no canal, o mesmo corte que os leitores dão à linha ruim. */
const REST_MAX = 300;

/**
 * O que as CLIs escrevem no `stderr` quando recusam um argumento (commander, clap, yargs, argparse e
 * companhia). Só com um destes a volta para texto culpa a versão instalada; sem eles, a falha antes
 * do primeiro evento pode ser rede, autenticação ou cota, e o motivo é genérico.
 */
const REFUSAL =
  /unknown (option|argument|flag|command)|unrecognized (option|argument|arguments)|unexpected argument|invalid (option|argument)|no such (option|flag)|requires --verbose|not a valid (option|argument)/i;

/**
 * Os argumentos que só o modo estruturado acrescenta ao comando da ferramenta, sem os traços e em
 * minúsculas (no Claude Code: `output-format`, `stream-json`, `verbose`). Sai da diferença entre os
 * dois comandos que o provider monta, então uma ferramenta nova não precisa de lista própria.
 */
export function formatArgs(tool: AiTool, input: HeadlessInput): string[] {
  const plain = new Set(headlessCommand(tool, { ...input, structured: false }).args);
  return headlessCommand(tool, { ...input, structured: true })
    .args.filter((a) => !plain.has(a))
    .map((a) => a.replace(/^-+/, '').toLowerCase())
    .filter(Boolean);
}

/**
 * Se a linha do `stderr` recusa um argumento E cita um dos argumentos do formato. Recusar outro
 * argumento (ex.: `--permission-mode`) não é motivo para voltar para texto: a segunda tentativa
 * levaria o mesmo argumento e cairia igual, ou rodaria sem a restrição.
 */
export function refusesFormat(line: string, args: readonly string[]): boolean {
  if (!REFUSAL.test(line)) return false;
  const lower = line.toLowerCase();
  return args.some((a) => lower.includes(a));
}

const isJson = (line: string): boolean => {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
};

/**
 * Grava os arquivos temporários do comando numa pasta só do usuário e troca os `{tmp:nome}` dos
 * argumentos pelos caminhos. Mora aqui porque é o transporte que monta o comando — antes desta
 * entrega o executor de cards e o chat tinham cada um a sua cópia desta função.
 */
/**
 * Apaga as pastas temporárias de execuções antigas (`fazai-run-*`, `fazai-prompt-*`) que ficaram para
 * trás quando o editor fechou ou caiu no meio da execução: podem guardar segredos dos servidores MCP.
 * Só as de mais de um dia, para não tirar o arquivo de uma execução de outra janela.
 */
export function cleanStaleTemp(now = Date.now(), dir = os.tmpdir()): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!/^fazai-(run|prompt)-/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      if (now - fs.statSync(full).mtimeMs > 24 * 3600_000) fs.rmSync(full, { recursive: true, force: true });
    } catch {
      /* outra janela apagou antes, ou sem permissão: fica */
    }
  }
}

export function materialize(command: HeadlessCommand): { command: HeadlessCommand; cleanup: () => void } {
  const files = Object.entries(command.tempFiles ?? {});
  if (!files.length) return { command, cleanup: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-run-'));
  let args = command.args;
  for (const [name, content] of files) {
    const file = path.join(dir, name);
    // pode ter segredos (variáveis dos servidores MCP): só o dono lê
    fs.writeFileSync(file, content, { mode: 0o600 });
    args = args.map((a) => a.split(tmpArg(name)).join(file));
  }
  return { command: { ...command, args }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function spawnMeasured(tool: AiTool, input: HeadlessInput, cwd: string, deps: MeasuredDeps): Measured {
  const label = aiToolInfo(tool).label;
  const provider = providerFor(tool);
  const model = input.exec?.model?.name ?? null;
  const fmtArgs = formatArgs(tool, input);
  /** quantas tentativas já começaram, para a linha da chamada no canal */
  let tries = 0;

  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  let current: RunningProcess | null = null;
  let killed = false;
  let done = false;
  /** o leitor da tentativa em curso; o `report()` é sempre o da última */
  let reader: OutputReader = textReader();
  /** por que a medição não aconteceu, quando não aconteceu */
  let failure: MeasureError | null = null;

  const finish = (code: number | null, error?: Error): void => {
    if (done) return;
    done = true;
    for (const fn of listeners) fn(code, error);
  };

  const attempt = (structured: boolean): void => {
    const built = headlessCommand(tool, { ...input, structured });
    // sem o servidor do board no arquivo que a ferramenta lê, a execução rodaria sem mover nem comentar nada
    if (built.projectMcp) {
      const { file } = built.projectMcp;
      const result = ensureProjectServer(cwd, file, built.projectMcp.entry, undefined, { stdioType: built.projectMcp.stdioType });
      if (result === 'added') deps.log(`Servidor do board registrado em ${file}, que o ${label} lê em segundo plano.`);
      if (result === 'repaired')
        deps.log(`O registro do servidor do board em ${file} apontava para outra pasta ou outro caminho; foi refeito para este projeto.`);
      if (result === 'invalid')
        deps.log(
          `${file} não é um JSON válido e o board não conseguiu registrar o servidor dele: o ${label} pode rodar sem acesso ao board. Corrija o arquivo.`,
        );
    }
    const { command, cleanup } = materialize(built);
    const format = command.format;
    // o leitor desta tentativa, preso nela: um pedaço atrasado da tentativa anterior não suja o seguinte
    const read = provider.reader(format, { model });
    reader = read;

    // um partidor por canal: os dois chegam entremeados, e um aviso no `stderr` no meio de uma linha
    // de evento partida emendaria texto de gente no JSON e quebraria os dois
    const stdout = lineSplitter();
    const stderr = lineSplitter();
    /** as linhas cruas do `stdout` desta tentativa, para virar resposta se a CLI ignorar o formato */
    const raw: string[] = [];
    /** se o `stdout` desta tentativa recebeu algum byte: com saída, a CLI já começou a trabalhar */
    let wrote = false;
    /** se o `stderr` desta tentativa recusou um dos argumentos do formato */
    let refusedFormat = false;
    const toLog = (line: string): void => {
      if (line) deps.log(line);
    };
    const feed = (text: string, stream: OutputStream): void => {
      if (stream === 'stderr') {
        for (const line of stderr.push(text)) {
          if (refusesFormat(line, fmtArgs)) refusedFormat = true;
          toLog(line);
        }
        return;
      }
      if (text) wrote = true;
      for (const line of stdout.push(text)) {
        if (format !== 'text') raw.push(line);
        for (const out of read.push(line, 'stdout')) deps.log(out);
      }
    };
    // esta linha é onde se confere que a chamada foi com os argumentos do modo estruturado; o sufixo
    // diz de que execução e de que tentativa ela é, para a pessoa ver se houve repetição
    tries++;
    const which = deps.runId ? `tentativa ${tries} da execução ${deps.runId}` : `tentativa ${tries}`;
    deps.log(
      `Chamando ${label}: ${command.command} ${command.args.map((a) => (a.length > ARG_MAX ? `${a.slice(0, ARG_MAX)}…` : a)).join(' ')} (${which})`,
    );

    let proc: RunningProcess;
    try {
      proc = deps.spawn(command, cwd, feed);
    } catch (e) {
      cleanup();
      throw e;
    }
    current = proc;

    let exited = false;
    proc.onExit((code, error) => {
      // cada tentativa termina uma vez: um segundo aviso de saída não repete nem revive nada
      if (exited) return;
      exited = true;
      // o resto que ficou sem quebra de linha: no modo texto é o fim da resposta e segue pelo leitor
      // de texto. No estruturado, se for JSON completo é a última linha de evento sem o `\n` final e
      // é interpretada (descartá-la perderia justamente o `result` com o consumo); se não for, é uma
      // linha de evento pela metade, vai como texto cortado no canal e o que já foi lido vale.
      for (const rest of stdout.flush()) {
        if (format === 'text') read.push(rest, 'stdout').forEach(toLog);
        else {
          raw.push(rest);
          if (isJson(rest)) read.push(rest, 'stdout').forEach(toLog);
          else toLog(cut(rest, REST_MAX));
        }
      }
      for (const line of stderr.flush()) {
        if (refusesFormat(line, fmtArgs)) refusedFormat = true;
        toLog(line);
      }
      cleanup();
      const silent = structured && format !== 'text' && !killed && !error && !read.sawEvent;
      // saiu bem sem um único evento válido: a CLI aceitou o argumento mas respondeu em texto. O
      // trabalho aconteceu (repetir cobraria duas vezes) e a resposta está nas linhas cruas: elas viram
      // a resposta pelo leitor de texto, sem medição. Já foram para o canal, não vão de novo.
      if (silent && code === 0) {
        const text = textReader();
        for (const line of raw) text.push(line, 'stdout');
        reader = text;
        failure = new MeasureIgnoredError(label);
        deps.log(failure.message);
        finish(code, error);
        return;
      }
      // a CLI recusou o argumento do formato antes de começar (nada no `stdout`): a versão instalada
      // não aceita a saída estruturada, e a mesma chamada em texto é a única repetição permitida. Com
      // `error` não se chega aqui: comando que não existe não passa a existir na segunda vez.
      if (silent && !wrote && refusedFormat) {
        failure = new MeasureRefusedError(label);
        deps.log(failure.message);
        // a parada pode chegar enquanto a decisão é registrada: a segunda tentativa não começa, e o
        // relatório não afirma uma repetição que não aconteceu
        if (killed) {
          failure = new MeasureEndedError();
          finish(code, error);
          return;
        }
        try {
          attempt(false);
        } catch (e) {
          finish(null, e instanceof Error ? e : new Error(String(e)));
        }
        return;
      }
      // caiu antes do primeiro evento sem recusa comprovada do formato: pode ter trabalhado (arquivos,
      // board) antes de cair, então não repete, e o consumo fica desconhecido
      if (silent) {
        failure = new MeasureEndedError();
        deps.log(failure.message);
      }
      finish(code, error);
    });
  };

  attempt(true);

  return {
    proc: {
      onExit: (fn) => listeners.push(fn),
      kill: () => {
        killed = true;
        current?.kill();
      },
    },
    report: () => {
      const report = reader.report();
      // o motivo é do transporte, não do leitor: é aqui que se sabe o rótulo da ferramenta e o que
      // aconteceu com o processo. Sem nada medido e sem motivo conhecido, o formato veio e não
      // trouxe consumo.
      if (report.measure !== 'none') return report;
      return { ...report, reason: (failure ?? new MeasureBrokenError(label)).message };
    },
    failure: () => (reader.report().measure !== 'none' ? null : (failure ?? new MeasureBrokenError(label))),
  };
}
