// O transporte da execução medida, com um `spawn` falso: o que importa aqui é o que o board MANDA
// para a CLI e quantas vezes ele a chama — porque chamar duas vezes cobra duas vezes.
//
// A borda externa (o processo) é simulada, mas a saída que ela devolve é a saída REAL do probe do
// Claude Code (`test/fixtures/claude-stream-json.jsonl`): o caminho inteiro, do byte ao relatório,
// roda contra o que a ferramenta de verdade escreveu.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { spawnMeasured } from '../src/extension/aiOutput/measured';
import type { OutputStream } from '../src/extension/aiOutput/reader';
import { headlessCommand, type HeadlessCommand, type HeadlessInput } from '../src/extension/headless';
import type { RunningProcess } from '../src/extension/runner';
import type { ModelOption } from '../src/shared/models';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');

const INPUT: HeadlessInput = { prompt: 'faça o trabalho', permission: 'full' };

interface Fake {
  command: HeadlessCommand;
  /** entrega um pedaço de saída ao leitor, como o processo faria */
  emit: (text: string, stream?: OutputStream) => void;
  exit: (code: number | null, error?: Error) => void;
  killed: boolean;
}

let started: Fake[];
let lines: string[];

/** O `spawn` falso: guarda cada chamada e deixa o teste decidir o que o processo escreve e como sai. */
const spawn = (command: HeadlessCommand, _cwd: string, out: (text: string, stream: OutputStream) => void): RunningProcess => {
  let listener: (code: number | null, error?: Error) => void = () => {};
  const fake: Fake = {
    command,
    emit: (text, stream = 'stdout') => out(text, stream),
    exit: (code, error) => listener(code, error),
    killed: false,
  };
  started.push(fake);
  return {
    onExit: (fn) => (listener = fn),
    kill: () => {
      fake.killed = true;
      fake.exit(143);
    },
  };
};

const haiku: ModelOption = {
  id: 'claude:haiku',
  tool: 'claude',
  model: 'haiku',
  label: 'Haiku 4.5',
  efforts: [],
  defaultEffort: null,
  price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const run = (tool: Parameters<typeof spawnMeasured>[0] = 'claude', input: HeadlessInput = INPUT, catalog: ModelOption[] = []) =>
  spawnMeasured(tool, input, '/projeto', { spawn, log: (l) => lines.push(l), catalog });

beforeEach(() => {
  started = [];
  lines = [];
});

describe('o comando do modo estruturado, por ferramenta', () => {
  it('o Claude Code vai com `--output-format stream-json` E `--verbose`, que é obrigatório junto', () => {
    run();
    const args = started[0]!.command.args;
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    // sem `--verbose` a CLI recusa: "When using --print, --output-format=stream-json requires --verbose"
    expect(args).toContain('--verbose');
    expect(started[0]!.command.format).toBe('claude-stream-json');
  });

  it('o Codex vai com `exec --json`', () => {
    run('codex');
    expect(started[0]!.command.args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(started[0]!.command.format).toBe('codex-json');
  });

  it('o Cursor e o Kimi vão com `--output-format stream-json`', () => {
    run('cursor');
    run('kimi');
    expect(started[0]!.command.args).toContain('stream-json');
    expect(started[1]!.command.args).toContain('stream-json');
    expect(started[0]!.command.format).toBe('stream-json');
    expect(started[1]!.command.format).toBe('stream-json');
  });

  it('sem `structured`, nada muda: os mesmos argumentos de antes e `format: text`', () => {
    for (const tool of ['claude', 'codex', 'copilot', 'cursor', 'kimi'] as const) {
      const plain = headlessCommand(tool, INPUT) as HeadlessCommand;
      expect(plain.format).toBe('text');
      expect(plain.args).not.toContain('--output-format');
      expect(plain.args).not.toContain('--json');
      expect(plain.args).not.toContain('--verbose');
      expect(headlessCommand(tool, { ...INPUT, structured: false })).toEqual(plain);
    }
  });

  it('o Copilot roda sempre em texto: o modo `-p` dele não tem saída estruturada', () => {
    const { report } = run('copilot');
    expect(started).toHaveLength(1);
    expect(started[0]!.command.format).toBe('text');
    // nenhum argumento novo: o comando é o mesmo de quem não pediu saída estruturada
    expect(started[0]!.command.args).toEqual((headlessCommand('copilot', INPUT) as HeadlessCommand).args);
    started[0]!.exit(0);
    const r = report();
    expect(r.measure).toBe('none');
    expect(r.reason).toContain('não produz saída estruturada');
    // nenhuma retentativa: não há para onde cair
    expect(started).toHaveLength(1);
  });

  it('o motivo do Copilot não afirma que o trabalho deu certo: ele aparece também quando a execução falha', () => {
    const { proc, report } = run('copilot');
    proc.onExit(() => {});
    started[0]!.exit(1);
    expect(report().reason).not.toContain('normalmente');
  });

  it('a chamada aparece no canal com os argumentos, que é onde se confere o modo estruturado', () => {
    run();
    expect(lines[0]).toContain('Chamando Claude Code: claude');
    expect(lines[0]).toContain('--output-format stream-json --verbose');
  });
});

describe('a volta para texto, que custa dinheiro se errar', () => {
  it('falha sem nenhum evento: repete UMA vez, em texto, e a execução acontece', () => {
    const { proc, report } = run();
    const exits: (number | null)[] = [];
    proc.onExit((code) => exits.push(code));

    // a recusa de argumento: sai na hora, código 1, nada no stdout, zero token gasto
    started[0]!.emit('error: unknown option --output-format\n', 'stderr');
    started[0]!.exit(1);

    expect(started).toHaveLength(2);
    expect(started[1]!.command.format).toBe('text');
    expect(started[1]!.command.args).not.toContain('--output-format');
    // o `onExit` de quem chamou ainda não disparou: a segunda tentativa é que termina a execução
    expect(exits).toEqual([]);

    started[1]!.emit('trabalho feito\n');
    started[1]!.exit(0);
    expect(exits).toEqual([0]);

    const r = report();
    expect(r.measure).toBe('none');
    expect(r.reason).toContain('não aceita a saída estruturada');
    expect(lines.join('\n')).toContain('O trabalho rodou em modo texto.');
    expect(lines.join('\n')).toContain('trabalho feito');
  });

  it('falha sem nenhum evento e sem recusa de argumento no `stderr`: repete em texto, mas não culpa a versão instalada', () => {
    const { proc, report } = run();
    proc.onExit(() => {});

    // uma falha qualquer antes do primeiro evento (rede, autenticação): nada indica argumento recusado
    started[0]!.emit('erro: sem conexão com o servidor\n', 'stderr');
    started[0]!.exit(1);
    expect(started).toHaveLength(2);
    started[1]!.exit(1);

    const r = report();
    expect(r.measure).toBe('none');
    expect(r.reason).not.toContain('não aceita a saída estruturada');
    expect(r.reason).toContain('a execução terminou antes de informar o consumo');
    expect(lines.join('\n')).not.toContain('não aceita a saída estruturada');
  });

  it('a CLI ignora a saída estruturada e responde em texto, com código 0: a resposta não se perde', () => {
    const { proc, report } = run('codex');
    const exits: (number | null)[] = [];
    proc.onExit((code) => exits.push(code));

    started[0]!.emit('Resposta em texto puro.\n\nSegundo parágrafo, bem mais longo que o corte de linha do canal.\n');
    started[0]!.exit(0);

    // o trabalho aconteceu: nenhuma segunda chamada
    expect(started).toHaveLength(1);
    expect(exits).toEqual([0]);
    const r = report();
    expect(r.answer).toBe('Resposta em texto puro.\n\nSegundo parágrafo, bem mais longo que o corte de linha do canal.');
    expect(r.measure).toBe('none');
    expect(r.reason).toContain('A medição não foi possível');
  });

  it('falha DEPOIS de eventos: NÃO repete, porque o trabalho aconteceu e repetir cobraria duas vezes', () => {
    const { proc, report } = run();
    const exits: (number | null)[] = [];
    proc.onExit((code) => exits.push(code));

    started[0]!.emit(FIXTURE);
    started[0]!.exit(1);

    expect(started).toHaveLength(1);
    expect(exits).toEqual([1]);
    // o que foi lido vale: os tokens do probe estão lá mesmo com a execução falhando
    expect(report().consumption!.outputTokens).toBe(1221);
  });

  it('interrompida pela pessoa não repete: o `kill` encerra a execução, não a tentativa', () => {
    const { proc } = run();
    const exits: (number | null)[] = [];
    proc.onExit((code) => exits.push(code));

    proc.kill();

    expect(started[0]!.killed).toBe(true);
    expect(started).toHaveLength(1);
    expect(exits).toEqual([143]);
  });

  it('comando que não existe não repete: ele não passa a existir na segunda vez', () => {
    const { proc } = run();
    const errors: (Error | undefined)[] = [];
    proc.onExit((_code, error) => errors.push(error));

    started[0]!.exit(null, new Error('claude: comando não encontrado'));

    expect(started).toHaveLength(1);
    expect(errors[0]?.message).toContain('comando não encontrado');
  });

  it('o `onExit` de quem chamou dispara UMA vez só, mesmo com as duas tentativas', () => {
    const { proc } = run();
    let vezes = 0;
    proc.onExit(() => vezes++);

    started[0]!.exit(1);
    started[1]!.exit(0);
    // o processo da segunda tentativa não dispara duas vezes nem revive a primeira
    started[1]!.exit(0);

    expect(vezes).toBe(1);
  });

  it('a primeira tentativa avisando a saída duas vezes não abre uma terceira chamada', () => {
    const { proc } = run();
    proc.onExit(() => {});

    started[0]!.exit(1);
    started[0]!.exit(1);

    expect(started).toHaveLength(2);
  });
});

describe('a leitura do fluxo, do byte ao relatório', () => {
  it('a saída real do probe, entregue em pedaços, produz o consumo medido e o inventário', () => {
    const { proc, report } = run('claude', INPUT, [haiku]);
    proc.onExit(() => {});

    // em pedaços de 1 KB, cortando linhas no meio como um pipe de verdade faz
    for (let i = 0; i < FIXTURE.length; i += 1024) started[0]!.emit(FIXTURE.slice(i, i + 1024));
    started[0]!.exit(0);

    const r = report();
    expect(r.measure).toBe('full');
    expect(r.consumption).toMatchObject({
      inputTokens: 54,
      outputTokens: 1221,
      cacheReadTokens: 106009,
      cacheWriteTokens: 28908,
      turns: 5,
    });
    expect(r.consumption!.costUsd).toBeCloseTo(0.06478465, 8);
    expect(r.inventory).toContainEqual({ kind: 'agent', name: 'Explore', calls: 1 });
    expect(r.answer).toContain('Aqui estão os três resultados');
  });

  it('nenhuma linha mostrada à pessoa é JSON, nem no caminho de erro', () => {
    const { proc } = run();
    proc.onExit(() => {});
    started[0]!.emit(FIXTURE);
    started[0]!.exit(1);

    for (const line of lines) expect(line).not.toContain('{"type"');
  });

  it('o `stderr` não passa pelo interpretador, mas aparece no canal', () => {
    const { proc, report } = run('claude', INPUT, [haiku]);
    proc.onExit(() => {});

    started[0]!.emit(FIXTURE);
    // um aviso de gente no meio do fluxo estruturado: se entrasse no interpretador, inventaria
    // "saída quebrada" em toda execução que escreve um aviso
    started[0]!.emit('aviso: nova versão disponível\n', 'stderr');
    started[0]!.exit(0);

    expect(lines).toContain('aviso: nova versão disponível');
    expect(report().measure).toBe('full');
    expect(report().consumption!.outputTokens).toBe(1221);
  });

  it('o `stderr` chegando no meio de uma linha de evento partida não emenda nos dois', () => {
    const { proc, report } = run('claude', INPUT, [haiku]);
    proc.onExit(() => {});

    // corta o fluxo no meio da última linha (o `result`) e põe um aviso entre as duas metades
    const cutAt = FIXTURE.lastIndexOf('"total_cost_usd"');
    started[0]!.emit(FIXTURE.slice(0, cutAt));
    started[0]!.emit('aviso: nova versão disponível\n', 'stderr');
    started[0]!.emit(FIXTURE.slice(cutAt));
    started[0]!.exit(0);

    expect(lines).toContain('aviso: nova versão disponível');
    expect(report().measure).toBe('full');
    expect(report().consumption!.outputTokens).toBe(1221);
    for (const line of lines) expect(line).not.toContain('{"');
  });

  it('o resto sem quebra de linha no fim vira texto no canal e não é interpretado', () => {
    const { proc, report } = run();
    proc.onExit(() => {});

    // o processo morreu no meio de uma linha de evento
    started[0]!.emit(FIXTURE.slice(0, FIXTURE.length - 2500));
    started[0]!.exit(1);

    expect(report().measure).toBe('partial');
    // a linha pela metade aparece como texto, cortada, para o canal não virar despejo de saída
    const rest = lines.find((l) => l.startsWith('{'));
    expect(rest).toBeDefined();
    expect(rest!.length).toBeLessThanOrEqual(301);
  });

  it('a última linha de evento sem quebra de linha no fim é interpretada, não descartada', () => {
    const { proc, report } = run('claude', INPUT, [haiku]);
    proc.onExit(() => {});

    // o processo saiu bem, só não escreveu o `\n` depois do `result`
    started[0]!.emit(FIXTURE.trimEnd());
    started[0]!.exit(0);

    const r = report();
    expect(r.measure).toBe('full');
    expect(r.consumption!.outputTokens).toBe(1221);
    expect(r.consumption!.costUsd).toBeCloseTo(0.06478465, 8);
    for (const line of lines) expect(line).not.toContain('{"');
  });

  it('no modo texto, o resto sem quebra de linha é o fim da resposta', () => {
    const { proc, report } = run('copilot');
    proc.onExit(() => {});

    started[0]!.emit('primeira linha\núltima linha sem quebra');
    started[0]!.exit(0);

    expect(report().answer).toBe('primeira linha\núltima linha sem quebra');
    expect(lines).toContain('última linha sem quebra');
  });

  it('o custo é estimado pelo preço do catálogo da ferramenta em uso, e não de outra', () => {
    const outraFerramenta: ModelOption = { ...haiku, id: 'codex:haiku', tool: 'codex' };
    const semCusto = FIXTURE.replace(/"total_cost_usd":[^,]+,/g, '');
    const { proc, report } = run('claude', INPUT, [outraFerramenta]);
    proc.onExit(() => {});
    started[0]!.emit(semCusto);
    started[0]!.exit(0);

    // o preço existe no catálogo, mas é de outra ferramenta: não serve, e não há custo
    expect(report().consumption!.costUsd).toBeNull();
    expect(report().consumption!.outputTokens).toBe(1221);
  });
});
