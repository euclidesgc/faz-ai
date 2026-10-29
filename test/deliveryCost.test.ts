import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { deliveryOf, panelDelivery, type DeliveryAdjustRow, type DeliveryRunRow, type DeliveryStory } from '../src/extension/log/delivery';
import { EMPTY_DELIVERY } from '../src/shared/metrics';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const story = (id: string, type: string, effort: string): DeliveryStory => ({ id, number: Number(id.replace(/\D/g, '')), type, effort });
const run = (storyId: string, model: string, agent: string, tokens: number, measured = true): DeliveryRunRow => ({
  storyId,
  model,
  agent,
  measured,
  tokens,
});

describe('deliveryOf', () => {
  it('RF1–RF3: total, grupos e média/mediana sobre as histórias medidas', () => {
    const d = deliveryOf(
      [story('s1', 'História', 'Médio'), story('s2', 'História', 'Médio'), story('s3', 'História', ''), story('s4', 'História', 'Médio')],
      [run('s1', 'opus', 'a', 1000), run('s1', 'opus', 'a', 500), run('s2', 'opus', 'a', 300), run('s4', 'opus', 'a', 9, false)],
      [],
    );
    expect(d.stories).toBe(4);
    expect(d.measured).toBe(2);
    expect(d.tokens).toBe(1800);
    const medio = d.groups.find((g) => g.effort === 'Médio')!;
    expect(medio).toMatchObject({ stories: 3, measured: 2, tokens: 1800, meanTokens: 900, medianTokens: 900 });
    // sem execução: conta a história, tokens null e fica por último
    expect(d.groups.at(-1)).toMatchObject({ effort: '', stories: 1, measured: 0, tokens: null, meanTokens: null, medianTokens: null });
  });

  it('RF3: média e mediana de 2.000', () => {
    const d = deliveryOf(
      [story('s1', 'História', 'Alto'), story('s2', 'História', 'Alto')],
      [run('s1', 'm', 'a', 1000), run('s2', 'm', 'a', 3000)],
      [],
    );
    expect(d.groups[0]).toMatchObject({ tokens: 4000, meanTokens: 2000, medianTokens: 2000 });
  });

  it('RF4: nada medido é null, nunca 0', () => {
    const d = deliveryOf([story('s1', 'História', 'Baixo')], [run('s1', 'm', 'a', 50, false)], []);
    expect(d.tokens).toBeNull();
    expect(d.measured).toBe(0);
    expect(d.byModel[0]).toMatchObject({ stories: 1, measured: 0, tokens: null, tokensPerStory: null });
  });

  it('RF9/RF10: visão cruzada tipo × modelo e tipo × agente, com ajustes', () => {
    const stories = [story('s1', 'Bug', 'Baixo'), story('s2', 'Bug', 'Baixo')];
    const runs = [run('s1', 'A', 'x', 800), run('s2', 'B', 'y', 200)];
    const adj: DeliveryAdjustRow[] = [{ storyId: 's1', model: 'A', agent: 'x' }];
    const d = deliveryOf(stories, runs, adj);
    expect(d.byModel).toEqual([
      { type: 'Bug', value: 'A', stories: 1, measured: 1, tokens: 800, tokensPerStory: 800, adjusted: 1 },
      { type: 'Bug', value: 'B', stories: 1, measured: 1, tokens: 200, tokensPerStory: 200, adjusted: 0 },
    ]);
    expect(d.byAgent.map((r) => [r.value, r.tokens, r.adjusted])).toEqual([
      ['x', 800, 1],
      ['y', 200, 0],
    ]);
  });

  it('o teto corta cada lista e conta o resto em omitted', () => {
    const stories = [story('s1', 'A', ''), story('s2', 'B', ''), story('s3', 'C', '')];
    const runs = stories.map((s, i) => run(s.id, `m${i}`, `g${i}`, 100 * (i + 1)));
    const d = deliveryOf(stories, runs, [], 2);
    expect(d.groups).toHaveLength(2);
    expect(d.omitted).toEqual({ groups: 1, byModel: 1, byAgent: 1 });
    expect(d.groups[0]!.type).toBe('C');
  });

  it('sem história devolve o vazio', () => {
    expect(deliveryOf([], [], [])).toEqual(EMPTY_DELIVERY);
  });
});

describe('panelDelivery com banco', () => {
  it('filtra por período e workflow, ignora sub-tarefa concluída e lê o esforço pelo nome', async () => {
    const db = await openInMemory(WASM_DIR);
    db.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    db.run("INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent')");
    db.run("INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', 'x', 'w')");
    db.run("INSERT INTO columns (id, workflow_id, name, position) VALUES ('col', 'w', 'Concluído', 0)");
    db.run(
      "INSERT INTO field_defs (id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES ('f', 'b', 'Esforço da atividade', 'select', '[]', NULL, 'badge', 0)",
    );
    const card = (id: string, number: number, parent: string | null) =>
      db.run(
        'INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, number, title, position, parent_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [id, 'b', 'w', 'col', 't', number, `Card ${number}`, 0, parent, 100, 100],
      );
    card('s1', 1, null);
    card('sub', 2, 's1');
    card('s2', 3, null); // concluída fora do período
    card('s3', 4, null); // concluída em outro workflow
    db.run("INSERT INTO field_values (card_id, field_id, value_json) VALUES ('s1', 'f', '\"Médio\"'), ('s3', 'f', '42')");
    const done = (id: string, cardId: string, number: number, at: number, workflow: string) =>
      db.run(
        "INSERT INTO card_events (id, board_id, at, month, kind, card_id, card_number, card_title, card_type, workflow, author, source) VALUES (?,?,?,?,'done',?,?,'x','História',?,'a','human')",
        [id, 'b', at, '2026-10', cardId, number, workflow],
      );
    done('e1', 's1', 1, 1500, 'Histórias');
    done('e2', 'sub', 2, 1500, 'Sub-tarefas');
    done('e3', 's2', 3, 9000, 'Histórias');
    done('e4', 's3', 4, 1500, 'Outro');
    const ai = (id: string, cardId: string, tokens: number, measure: string, startedAt: number) =>
      db.run(
        'INSERT INTO ai_runs (id, board_id, started_at, month, origin, tool, permission, card_id, model, agent, input_tokens, output_tokens, measure, workflow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, 'b', startedAt, '2026-09', 'manual', 'claude', 'x', cardId, 'opus', 'dev', tokens, 0, measure, 'Sub-tarefas'],
      );
    ai('r1', 's1', 1000, 'exact', 10); // antes do período: conta mesmo assim
    ai('r2', 'sub', 500, 'exact', 1400);
    ai('r3', 'sub', 77, 'none', 1400);
    ai('r4', 's3', 5, 'exact', 1400);

    const d = panelDelivery(db, 'b', { start: 1000, end: 2000 }, 'Histórias');
    expect(d.stories).toBe(1);
    expect(d.tokens).toBe(1500);
    expect(d.groups).toEqual([
      { type: 'História', effort: 'Médio', stories: 1, measured: 1, tokens: 1500, meanTokens: 1500, medianTokens: 1500 },
    ]);
    // sem filtro de workflow, s3 entra, com esforço inesperado virando ''
    const all = panelDelivery(db, 'b', { start: 1000, end: 2000 }, '');
    expect(all.stories).toBe(2);
    expect(all.groups.map((g) => g.effort).sort()).toEqual(['', 'Médio']);
    // período vazio
    expect(panelDelivery(db, 'b', { start: 5000, end: 6000 }, '')).toEqual(EMPTY_DELIVERY);
  });
});
