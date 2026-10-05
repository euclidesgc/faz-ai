import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChatSession } from '../src/extension/chat';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, getPanelMetrics, NO_CARD_LABEL } from '../src/extension/log/metrics';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { monthOf } from '../src/shared/log';
import type { Database } from 'sql.js';

/**
 * O uso do chat nas métricas, de ponta a ponta: a saída real do Claude Code (o fixture do probe da #70)
 * passa pelo chat, vai para `ai_runs`/`ai_run_usage` e aparece no painel e no `get_metrics` do MCP.
 */

/** a saída real do Claude Code no modo estruturado: 54 + 1.221 + 106.009 + 28.908 tokens, 5 turnos, Read×2, Bash, Explore */
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');
const TOKENS = 54 + 1221 + 106009 + 28908;

let dir: string;
let db: Database;
let router: MessageRouter;
let runs: AiRunRepo;
/** um processo falso por mensagem: `write` escreve no `stdout`, `exit` termina */
let procs: { write: (text: string) => void; exit: (code: number | null) => void }[];

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-chat-metrics-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'board' } } });
  runs = new AiRunRepo(db);
  procs = [];
  new ChatSession(router, {
    cwd: dir,
    log: () => {},
    runLog: createRunLog(db),
    file: path.join(dir, 'chat.json'),
    spawn: (_command, _cwd, out) => {
      const entry = { write: (text: string) => out(text, 'stdout'), exit: (_c: number | null) => {} };
      procs.push(entry);
      return {
        kill: () => entry.exit(143),
        onExit: (fn) => {
          entry.exit = (code) => fn(code);
        },
      };
    },
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const ask = (text: string, model: string | null = null) => router.chatCommand({ type: 'chat.send', text, model });
const rows = () => runs.byMonth(monthOf(Date.now()));

describe('o uso do chat nas métricas', () => {
  it('uma pergunta no chat chega ao banco e aparece nos totais, na série, nos cortes, no ranking e no get_metrics', () => {
    ask('liste os arquivos');
    procs[0]!.write(FIXTURE);
    procs[0]!.exit(0);

    // o banco: origem, desfecho, duração, consumo, custo e inventário
    expect(rows()).toHaveLength(1);
    const run = rows()[0]!;
    expect(run).toMatchObject({ origin: 'chat', outcome: 'done', measure: 'full', cardNumber: null, tool: 'claude', turns: 5 });
    expect(run.durationMs).not.toBeNull();
    expect(run.costUsd).toBeCloseTo(0.06478465, 8);
    expect(runs.usage(run.id)).toEqual([
      { kind: 'agent', name: 'Explore', calls: 1 },
      { kind: 'tool', name: 'Bash', calls: 1 },
      { kind: 'tool', name: 'Read', calls: 2 },
    ]);

    // o painel: os totais e o mês da série contam a execução do chat
    const panel = getPanelMetrics(db, router.boardId, {});
    expect(panel.totals).toMatchObject({ runs: 1, measuredRuns: 1, costedRuns: 1, tokens: { total: TOKENS } });
    expect(panel.totals.costUsd).toBeCloseTo(0.06478465, 8);
    expect(panel.months.find((m) => m.month === monthOf(Date.now()))).toMatchObject({ present: true, runs: 1 });
    // os cortes: na ferramenta pelo id dela; sem modelo escolhido, o modelo fica "não definido" (como no card)
    const cut = (dim: string) => panel.sections.breakdowns.find((b) => b.dim === dim)!.cells;
    expect(cut('tool')).toEqual([expect.objectContaining({ value: 'claude', runs: 1, tokens: TOKENS })]);
    expect(cut('model')).toEqual([expect.objectContaining({ value: '', runs: 1, tokens: TOKENS })]);
    // o ranking por card: a linha "Execuções sem card", que o painel recebe como ''
    expect(panel.sections.cards.cells).toEqual([expect.objectContaining({ value: '', runs: 1, tokens: TOKENS })]);
    // o inventário
    expect(panel.sections.inventory.tools.map((t) => [t.name, t.calls])).toEqual([
      ['Read', 2],
      ['Bash', 1],
    ]);
    expect(panel.sections.inventory.agents.map((t) => [t.name, t.calls])).toEqual([['Explore', 1]]);

    // o get_metrics do MCP: sem agrupar e agrupado
    expect(getMetrics(db, router.boardId, {}).rows).toEqual([expect.objectContaining({ label: 'total', runs: 1, tokens: TOKENS })]);
    expect(getMetrics(db, router.boardId, { groupBy: 'card' }).rows).toEqual([
      expect.objectContaining({ label: NO_CARD_LABEL, runs: 1, tokens: TOKENS }),
    ]);
    expect(getMetrics(db, router.boardId, { groupBy: 'tool' }).rows).toEqual([
      expect.objectContaining({ label: 'claude', runs: 1, tokens: TOKENS }),
    ]);
    expect(getMetrics(db, router.boardId, { groupBy: 'used_tool' }).rows.map((r) => [r.label, r.calls])).toEqual([
      ['Read', 2],
      ['Bash', 1],
    ]);
  });

  it('o modelo escolhido no chat entra no corte por modelo com o mesmo valor que a execução de card grava', () => {
    const o = router.snapshot().board.modelCatalog.find((m) => m.tool === 'claude')!;
    ask('oi', o.id);
    procs[0]!.write(FIXTURE);
    procs[0]!.exit(0);

    // o executor de cards também grava `manifest.model.name`, que é o `model` da opção do catálogo
    expect(rows()[0]!.model).toBe(o.model);
    const cells = getPanelMetrics(db, router.boardId, {}).sections.breakdowns.find((b) => b.dim === 'model')!.cells;
    expect(cells).toEqual([expect.objectContaining({ value: o.model, runs: 1 })]);
    expect(getMetrics(db, router.boardId, { groupBy: 'model', model: o.model }).rows).toEqual([
      expect.objectContaining({ label: o.model, runs: 1, tokens: TOKENS }),
    ]);
  });

  it('erro, interrupção e resposta sem consumo também contam: o desfecho e a medição ficam gravados', () => {
    ask('a');
    procs[0]!.write(FIXTURE);
    procs[0]!.exit(1);
    ask('b');
    router.chatCommand({ type: 'chat.stop' });

    expect(rows().map((r) => [r.outcome, r.measure])).toEqual([
      ['failed', 'full'],
      ['stopped', 'none'],
    ]);
    const panel = getPanelMetrics(db, router.boardId, {});
    // as duas contam como execução; só a medida entra nos tokens, e a outra deixa o total marcado como parcial
    expect(panel.totals).toMatchObject({ runs: 2, runsOpen: 0, measuredRuns: 1, tokens: { total: TOKENS } });
    expect(getMetrics(db, router.boardId, {})).toMatchObject({ tokensPartial: true });
  });

  it('o chat não é de workflow nenhum: some quando o painel filtra um workflow e não vira opção de filtro', () => {
    ask('a');
    procs[0]!.write(FIXTURE);
    procs[0]!.exit(0);
    const panel = getPanelMetrics(db, router.boardId, {});
    expect(panel.workflows).not.toContain('');
    const workflow = router.snapshot().workflows[0]!.name;
    expect(getPanelMetrics(db, router.boardId, { workflow }).totals.runs).toBe(0);
  });
});
